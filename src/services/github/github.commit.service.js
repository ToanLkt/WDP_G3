const axios = require('axios');

const GithubAccount = require('../../models/GithubAccount');
const Repository = require('../../models/Repository');
const RepositoryCommit = require('../../models/RepositoryCommit');
const RepositoryCommitCodeEvidence = require('../../models/RepositoryCommitCodeEvidence');

const { getGithubHeaders, handleGithubApiError } = require('./github.api.service');
const { findRepositoryForUser } = require('./github.repository.service');
const { createStatusError, parseBooleanQuery } = require('./github.utils');
const { getCommitUserMatchInfo } = require('../analysis/analysis.engine');
const {
  EVIDENCE_VERSION,
  FILE_SELECTION_VERSION,
  addedPatchText,
  parseContributionCodeEvidence,
  selectContributionCodeEvidenceFiles,
} = require('../analysis/contributionCodeEvidence.service');

const DEFAULT_COMMIT_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_COMMIT_DETAIL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_COMMIT_DETAIL_MAX_COMMITS = 30;
const DEFAULT_COMMIT_DETAIL_MAX_FILES = 0;
const DEFAULT_COMMIT_PATCH_MAX_CHARS = 0;
const DEFAULT_COMMIT_DETAIL_CONCURRENCY = 4;
const DEFAULT_COMMIT_CODE_MAX_FILES = 0;
const DEFAULT_COMMIT_FILE_MAX_BYTES = 100000;
const DEFAULT_COMMIT_TOTAL_PATCH_MAX_CHARS = 500000;
const DEFAULT_COMMIT_TOTAL_CONTENT_MAX_BYTES = 2000000;
const DEFAULT_COMMIT_CONTENT_CONCURRENCY = 4;
const DEFAULT_COMMIT_NORMALIZED_EMBED_MAX_BYTES = 12000000;

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNonNegativeInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getCommitCacheTtlMs = () => parsePositiveInteger(
  process.env.GITHUB_COMMIT_CACHE_TTL_MS,
  DEFAULT_COMMIT_CACHE_TTL_MS
);

const getCommitApiUrl = (owner, repo) => `https://api.github.com/repos/${owner}/${repo}/commits`;
const getCommitDetailCacheTtlMs = () => parsePositiveInteger(
  process.env.GITHUB_COMMIT_DETAIL_CACHE_TTL_MS,
  DEFAULT_COMMIT_DETAIL_CACHE_TTL_MS
);
const getCommitDetailMaxCommits = () => parsePositiveInteger(
  process.env.GITHUB_COMMIT_DETAIL_MAX_COMMITS,
  DEFAULT_COMMIT_DETAIL_MAX_COMMITS
);
const getCommitDetailMaxFiles = () => parsePositiveInteger(
  process.env.GITHUB_COMMIT_DETAIL_MAX_FILES,
  DEFAULT_COMMIT_DETAIL_MAX_FILES
);
const getCommitPatchMaxChars = () => Math.max(0, Number(process.env.GITHUB_COMMIT_PATCH_MAX_CHARS || DEFAULT_COMMIT_PATCH_MAX_CHARS) || 0);
const getCommitDetailConcurrency = () => Math.min(
  parsePositiveInteger(process.env.GITHUB_COMMIT_DETAIL_CONCURRENCY, DEFAULT_COMMIT_DETAIL_CONCURRENCY),
  8
);
const getCommitCodeMaxFiles = () => parseNonNegativeInteger(process.env.GITHUB_COMMIT_CODE_MAX_FILES_PER_COMMIT, DEFAULT_COMMIT_CODE_MAX_FILES);
const getCommitFileMaxBytes = () => parsePositiveInteger(process.env.GITHUB_COMMIT_FILE_MAX_BYTES, DEFAULT_COMMIT_FILE_MAX_BYTES);
const getCommitCodePatchMaxChars = () => parsePositiveInteger(
  process.env.GITHUB_COMMIT_PATCH_MAX_CHARS_PER_FILE || process.env.GITHUB_COMMIT_PATCH_MAX_CHARS,
  12000
);
const getCommitTotalPatchMaxChars = () => parsePositiveInteger(process.env.GITHUB_COMMIT_TOTAL_PATCH_MAX_CHARS, DEFAULT_COMMIT_TOTAL_PATCH_MAX_CHARS);
const getCommitTotalContentMaxBytes = () => parsePositiveInteger(process.env.GITHUB_COMMIT_TOTAL_CONTENT_MAX_BYTES, DEFAULT_COMMIT_TOTAL_CONTENT_MAX_BYTES);
const getCommitContentConcurrency = () => Math.min(
  parsePositiveInteger(process.env.GITHUB_COMMIT_CONTENT_CONCURRENCY, DEFAULT_COMMIT_CONTENT_CONCURRENCY),
  8
);
const getCommitNormalizedEmbedMaxBytes = () => parsePositiveInteger(
  process.env.GITHUB_COMMIT_NORMALIZED_EMBED_MAX_BYTES,
  DEFAULT_COMMIT_NORMALIZED_EMBED_MAX_BYTES
);

const getBranchForCommitFetch = (repository = {}, query = {}) => (
  String(query.sha || query.branch || repository.defaultBranch || repository.rawData?.default_branch || 'main').trim()
);

const isCommitCacheFresh = (commits = [], branch) => (
  Array.isArray(commits)
  && commits.length > 0
  && commits.some((commit) => (
    String(commit.branch || '') === String(branch || '')
    && commit.lastFetchedAt
    && Date.now() - new Date(commit.lastFetchedAt).getTime() < getCommitCacheTtlMs()
  ))
);

const mapCommitResponse = (commit) => ({
  _id: commit._id,
  sha: commit.sha,
  message: commit.message,
  authorName: commit.authorName,
  authorDate: commit.authorDate,
  htmlUrl: commit.htmlUrl,
  additions: commit.additions,
  deletions: commit.deletions,
  changedFiles: commit.changedFiles,
});

const normalizeCommitFile = (file = {}, options = {}) => {
  const patchMaxChars = Number(options.patchMaxChars ?? getCommitPatchMaxChars());
  const normalized = {
    filename: file.filename || file.path || file.fileName || '',
    status: file.status || '',
    additions: Number(file.additions || 0),
    deletions: Number(file.deletions || 0),
    changes: Number(file.changes || 0),
  };
  if (patchMaxChars > 0 && file.patch) {
    normalized.patch = String(file.patch).slice(0, patchMaxChars);
  }
  return normalized;
};

const normalizeCommitDetail = ({ detail, maxFiles = getCommitDetailMaxFiles(), patchMaxChars = getCommitPatchMaxChars() }) => {
  const detailFiles = Array.isArray(detail?.files) ? detail.files : [];
  const selectedFiles = Number(maxFiles || 0) > 0 ? detailFiles.slice(0, maxFiles) : detailFiles;
  const files = selectedFiles.length
    ? selectedFiles.map((file) => normalizeCommitFile(file, { patchMaxChars })).filter((file) => file.filename)
    : [];
  const stats = detail?.stats || {};
  return {
    additions: Number(stats.additions || files.reduce((sum, file) => sum + Number(file.additions || 0), 0)),
    deletions: Number(stats.deletions || files.reduce((sum, file) => sum + Number(file.deletions || 0), 0)),
    changedFiles: Number(detail?.files?.length || files.length),
    files,
    detailStatus: 'available',
    detailErrorCode: null,
    detailFetchedAt: new Date(),
  };
};

const normalizeCommit = ({ commit, authUser, repository, branch, githubAccount }) => {
  const base = {
    userId: authUser.userId,
    repositoryId: repository._id,
    githubRepoId: repository.githubRepoId,
    fullName: repository.fullName,
    sha: commit.sha,
    message: commit.commit?.message || '',
    authorName: commit.commit?.author?.name || '',
    authorEmail: commit.commit?.author?.email || '',
    authorDate: commit.commit?.author?.date ? new Date(commit.commit.author.date) : null,
    committerName: commit.commit?.committer?.name || '',
    committerEmail: commit.commit?.committer?.email || '',
    committerDate: commit.commit?.committer?.date ? new Date(commit.commit.committer.date) : null,
    htmlUrl: commit.html_url || '',
    branch,
    fetchStatus: 'success',
    rawData: commit,
    lastFetchedAt: new Date(),
  };
  base.matchedBy = getCommitUserMatchInfo(base, githubAccount).matchedBy;
  return base;
};

const fetchGithubCommits = async ({ owner, repo, accessToken, branch, perPage, maxPages }) => {
  const commitsUrl = getCommitApiUrl(owner, repo);
  const commits = [];
  let githubStatus = null;

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await axios.get(commitsUrl, {
      params: { per_page: perPage, page, sha: branch },
      headers: getGithubHeaders(accessToken),
    });
    githubStatus = response.status;
    const pageItems = Array.isArray(response.data) ? response.data : [];
    commits.push(...pageItems);
    if (pageItems.length < perPage) break;
  }

  return { commits, githubStatus, commitApiUrlWithoutToken: `${commitsUrl}?sha=${encodeURIComponent(branch)}` };
};

const fetchGithubCommitDetail = async ({ owner, repo, accessToken, sha }) => {
  const detailUrl = `${getCommitApiUrl(owner, repo)}/${encodeURIComponent(sha)}`;
  const response = await axios.get(detailUrl, {
    headers: getGithubHeaders(accessToken),
  });
  return {
    detail: response.data,
    githubStatus: response.status,
    commitDetailApiUrlWithoutToken: detailUrl,
  };
};

const fetchFileAtCommit = async ({ owner, repo, accessToken, sha, filename }) => {
  const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/${filename.split('/').map(encodeURIComponent).join('/')}`, {
    params: { ref: sha },
    headers: getGithubHeaders(accessToken),
    timeout: parsePositiveInteger(process.env.GITHUB_COMMIT_CONTENT_TIMEOUT_MS, 10000),
  });
  if (response.data?.encoding !== 'base64' || !response.data?.content) return '';
  const buffer = Buffer.from(String(response.data.content).replace(/\s/g, ''), 'base64');
  if (buffer.length > getCommitFileMaxBytes()) {
    const error = new Error('GITHUB_COMMIT_FILE_TOO_LARGE');
    error.code = 'GITHUB_COMMIT_FILE_TOO_LARGE';
    throw error;
  }
  return buffer.toString('utf8');
};

const byteLength = (value = '') => Buffer.byteLength(String(value || ''), 'utf8');

const runWithConcurrency = async (items, concurrency, handler) => {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: 'fulfilled', value: await handler(items[index], index) };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker()));
  return results;
};

const findCachedCodeEvidence = async ({ repositoryId, sha, files }) => {
  if (!repositoryId || !sha || !files.length) return new Map();
  const filenames = files.map((file) => file.filename).filter(Boolean);
  const cached = await RepositoryCommitCodeEvidence.find({
    repositoryId,
    sha,
    evidenceVersion: EVIDENCE_VERSION,
    fileSelectionVersion: FILE_SELECTION_VERSION,
    filename: { $in: filenames },
  }).lean();
  return new Map(cached.map((item) => [String(item.filename || '').toLowerCase(), item]));
};

const persistCodeEvidenceFiles = async ({ repositoryId, sha, normalizedFiles }) => {
  if (!repositoryId || !sha || !Array.isArray(normalizedFiles) || !normalizedFiles.length) return;
  await RepositoryCommitCodeEvidence.bulkWrite(normalizedFiles.map((file) => ({
    updateOne: {
      filter: {
        repositoryId,
        sha,
        filename: file.filename,
        evidenceVersion: file.evidenceVersion,
      },
      update: {
        $set: {
          repositoryId,
          sha,
          ...file,
        },
      },
      upsert: true,
    },
  })), { ordered: false });
};

const hydrateCommitsWithCachedCodeEvidence = async ({ repositoryId, commits }) => {
  if (!repositoryId || !Array.isArray(commits) || !commits.length) return commits;
  const shas = [...new Set(commits.map((commit) => String(commit?.sha || '').trim()).filter(Boolean))];
  if (!shas.length) return commits;
  const cached = await RepositoryCommitCodeEvidence.find({
    repositoryId,
    sha: { $in: shas },
    evidenceVersion: EVIDENCE_VERSION,
    fileSelectionVersion: FILE_SELECTION_VERSION,
  }).sort({ filename: 1 }).lean();
  if (!cached.length) return commits;
  const bySha = cached.reduce((groups, item) => {
    const key = String(item.sha || '');
    groups[key] = groups[key] || [];
    const clean = { ...item };
    delete clean._id;
    delete clean.__v;
    delete clean.createdAt;
    delete clean.updatedAt;
    groups[key].push(clean);
    return groups;
  }, {});
  return commits.map((commit) => {
    const evidence = bySha[String(commit?.sha || '')];
    return evidence?.length ? { ...commit, normalizedFiles: evidence, codeEvidenceStatus: 'available' } : commit;
  });
};

const shouldEmbedNormalizedFiles = (normalizedFiles = []) => (
  byteLength(JSON.stringify(normalizedFiles || [])) <= getCommitNormalizedEmbedMaxBytes()
);

const buildNormalizedCommitCodeEvidence = async ({ detail, owner, repo, accessToken, sha, repositoryId }) => {
  const selection = selectContributionCodeEvidenceFiles(
    Array.isArray(detail?.files) ? detail.files : [],
    getCommitCodeMaxFiles()
  );
  const candidates = selection.selected;
  const cachedByPath = await findCachedCodeEvidence({ repositoryId, sha, files: candidates });
  const normalizedFiles = new Array(candidates.length);
  const metadata = {
    ...selection.metadata,
    filesConsidered: candidates.length,
    patchFilesParsed: 0,
    patchFilesUsed: 0,
    fullFilesFetched: 0,
    pathOnlyFiles: 0,
    skippedLargeFiles: 0,
    timedOutFiles: 0,
    normalizedFilesSaved: 0,
    totalPatchChars: 0,
    totalContentBytes: 0,
    cacheHits: 0,
  };
  const fullFetchJobs = [];
  const patchMaxCharsPerFile = getCommitCodePatchMaxChars();
  const totalPatchMaxChars = getCommitTotalPatchMaxChars();
  const totalContentMaxBytes = getCommitTotalContentMaxBytes();
  let remainingContentBytes = totalContentMaxBytes;

  candidates.forEach((file, index) => {
    const cacheKey = String(file.filename || '').toLowerCase();
    const cached = cachedByPath.get(cacheKey);
    if (cached) {
      normalizedFiles[index] = cached;
      metadata.cacheHits += 1;
      return;
    }

    const remainingPatchChars = Math.max(0, totalPatchMaxChars - metadata.totalPatchChars);
    const perFilePatchLimit = Math.min(patchMaxCharsPerFile, remainingPatchChars);
    const content = perFilePatchLimit > 0 ? addedPatchText(file.patch, perFilePatchLimit) : '';
    if (content) {
      metadata.patchFilesParsed += 1;
      metadata.patchFilesUsed += 1;
      metadata.totalPatchChars += content.length;
      normalizedFiles[index] = parseContributionCodeEvidence({ filename: file.filename, content, evidenceSource: 'commit_patch', file });
      return;
    }

    if (file.patch && remainingPatchChars <= 0) {
      normalizedFiles[index] = parseContributionCodeEvidence({ filename: file.filename, content: '', evidenceSource: 'path_only', file });
      metadata.pathOnlyFiles += 1;
      return;
    }

    fullFetchJobs.push({ file, index });
  });

  await runWithConcurrency(fullFetchJobs, getCommitContentConcurrency(), async ({ file, index }) => {
    if (remainingContentBytes <= 0) {
      normalizedFiles[index] = parseContributionCodeEvidence({ filename: file.filename, content: '', evidenceSource: 'path_only', file });
      metadata.pathOnlyFiles += 1;
      metadata.skippedLargeFiles += 1;
      return;
    }

    try {
      const content = await fetchFileAtCommit({ owner, repo, accessToken, sha, filename: file.filename });
      const contentBytes = byteLength(content);
      if (!content || contentBytes > getCommitFileMaxBytes() || contentBytes > remainingContentBytes) {
        normalizedFiles[index] = parseContributionCodeEvidence({ filename: file.filename, content: '', evidenceSource: 'path_only', file });
        metadata.pathOnlyFiles += 1;
        if (contentBytes > getCommitFileMaxBytes() || contentBytes > remainingContentBytes) metadata.skippedLargeFiles += 1;
        return;
      }
      remainingContentBytes -= contentBytes;
      metadata.totalContentBytes += contentBytes;
      metadata.fullFilesFetched += 1;
      normalizedFiles[index] = parseContributionCodeEvidence({ filename: file.filename, content, evidenceSource: 'file_at_commit', file });
    } catch (error) {
      normalizedFiles[index] = parseContributionCodeEvidence({ filename: file.filename, content: '', evidenceSource: 'path_only', file });
      metadata.pathOnlyFiles += 1;
      if (error?.code === 'GITHUB_COMMIT_FILE_TOO_LARGE') metadata.skippedLargeFiles += 1;
      if (error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''))) metadata.timedOutFiles += 1;
    }
  });

  for (let index = 0; index < normalizedFiles.length; index += 1) {
    if (!normalizedFiles[index]) {
      const file = candidates[index];
      normalizedFiles[index] = parseContributionCodeEvidence({ filename: file.filename, content: '', evidenceSource: 'path_only', file });
      metadata.pathOnlyFiles += 1;
    } else {
      delete normalizedFiles[index]._id;
      delete normalizedFiles[index].__v;
      delete normalizedFiles[index].createdAt;
      delete normalizedFiles[index].updatedAt;
    }
  }
  await persistCodeEvidenceFiles({ repositoryId, sha, normalizedFiles });
  metadata.normalizedFilesSaved = normalizedFiles.length;
  return { normalizedFiles, metadata };
};

const isCommitDetailCacheFresh = (commit = {}) => (
  (commit.detailStatus === 'available' || commit.detailStatus === 'success')
  && (commit.detailStatus === 'available' || !commit.detailFetchedAt
    || Date.now() - new Date(commit.detailFetchedAt).getTime() < getCommitDetailCacheTtlMs())
);

const fetchAndCacheCommitDetailsForUserCommits = async ({
  authUser,
  repository,
  githubAccount,
  commits = [],
  forceRefresh = false,
  includeCodeEvidence = false,
}) => {
  const account = githubAccount?.accessToken
    ? githubAccount
    : await GithubAccount.findOne({ userId: authUser.userId }).select('+accessToken').lean();
  const [owner, repo] = String(repository.fullName || '').split('/');
  const metadata = {
    source: 'cache',
    owner,
    repo,
    requestedCount: Array.isArray(commits) ? commits.length : 0,
    fetchedDetailCount: 0,
    reusedDetailCount: 0,
    failedDetailCount: 0,
    skippedDetailCount: 0,
  };

  if (!account?.accessToken || !owner || !repo) {
    metadata.errorCode = !account?.accessToken ? 'GITHUB_ACCOUNT_MISSING' : 'INVALID_REPOSITORY_FULL_NAME';
    return { commits, metadata };
  }

  const maxCommits = getCommitDetailMaxCommits();
  const evidenceHydratedCommits = includeCodeEvidence
    ? await hydrateCommitsWithCachedCodeEvidence({ repositoryId: repository._id, commits })
    : commits;
  const selected = [];
  const selectedShas = new Set();
  for (const commit of Array.isArray(evidenceHydratedCommits) ? evidenceHydratedCommits : []) {
    const sha = String(commit?.sha || '').trim();
    if (!sha || selectedShas.has(sha)) continue;
    const codeEvidenceAvailable = commit.codeEvidenceStatus === 'available'
      && commit.normalizedFiles?.length
      && commit.normalizedFiles.every((file) => (
        file.evidenceVersion === EVIDENCE_VERSION
        && file.fileSelectionVersion === FILE_SELECTION_VERSION
      ));
    if (!forceRefresh && isCommitDetailCacheFresh(commit) && (!includeCodeEvidence || codeEvidenceAvailable)) {
      metadata.reusedDetailCount += 1;
      continue;
    }
    selectedShas.add(sha);
    selected.push(commit);
    if (selected.length >= maxCommits) break;
  }
  metadata.skippedDetailCount = Math.max(0, metadata.requestedCount - selected.length - metadata.reusedDetailCount);

  if (!selected.length) {
    return { commits, metadata };
  }

  const updates = new Map();
  let cursor = 0;
  const worker = async () => {
    while (cursor < selected.length) {
      const commit = selected[cursor];
      cursor += 1;
      try {
        const result = await fetchGithubCommitDetail({
          owner,
          repo,
          accessToken: account.accessToken,
          sha: commit.sha,
        });
        const normalized = normalizeCommitDetail({ detail: result.detail });
        if (includeCodeEvidence) {
          const codeEvidence = await buildNormalizedCommitCodeEvidence({
            detail: result.detail,
            owner,
            repo,
            accessToken: account.accessToken,
            sha: commit.sha,
            repositoryId: repository._id,
          });
          normalized.normalizedFiles = codeEvidence.normalizedFiles;
          normalized.codeEvidenceStatus = 'available';
          normalized.codeEvidenceAnalyzedAt = new Date();
          metadata.codeEvidence = metadata.codeEvidence || {
            filesConsidered: 0,
            patchFilesParsed: 0,
            patchFilesUsed: 0,
            fullFilesFetched: 0,
            pathOnlyFiles: 0,
            ignoredFiles: 0,
            eligibleFiles: 0,
            selectedFiles: 0,
            skippedLargeFiles: 0,
            timedOutFiles: 0,
            normalizedFilesSaved: 0,
            totalPatchChars: 0,
            totalContentBytes: 0,
            cacheHits: 0,
            groupCounts: { source: 0, test: 0, style: 0, config: 0 },
            countLimitApplied: false,
            fileSelectionVersion: codeEvidence.metadata.fileSelectionVersion,
          };
          [
            'filesConsidered',
            'patchFilesParsed',
            'patchFilesUsed',
            'fullFilesFetched',
            'pathOnlyFiles',
            'ignoredFiles',
            'eligibleFiles',
            'selectedFiles',
            'skippedLargeFiles',
            'timedOutFiles',
            'normalizedFilesSaved',
            'totalPatchChars',
            'totalContentBytes',
            'cacheHits',
          ]
            .forEach((key) => { metadata.codeEvidence[key] += Number(codeEvidence.metadata[key] || 0); });
          for (const [group, count] of Object.entries(codeEvidence.metadata.groupCounts || {})) {
            metadata.codeEvidence.groupCounts[group] = Number(metadata.codeEvidence.groupCounts[group] || 0) + Number(count || 0);
          }
          metadata.codeEvidence.countLimitApplied = Boolean(metadata.codeEvidence.countLimitApplied || codeEvidence.metadata.countLimitApplied);
          metadata.codeEvidence.fileSelectionVersion = codeEvidence.metadata.fileSelectionVersion || metadata.codeEvidence.fileSelectionVersion;
        }
        metadata.githubStatus = result.githubStatus;
        metadata.commitDetailApiUrlWithoutToken = result.commitDetailApiUrlWithoutToken;
        metadata.fetchedDetailCount += 1;
        updates.set(commit.sha, normalized);
        const embedNormalizedFiles = !includeCodeEvidence || shouldEmbedNormalizedFiles(normalized.normalizedFiles);
        const persistedNormalized = embedNormalizedFiles
          ? normalized
          : Object.fromEntries(Object.entries(normalized).filter(([key]) => key !== 'normalizedFiles'));
        await RepositoryCommit.updateOne(
          { repositoryId: repository._id, sha: commit.sha },
          {
            $set: { ...persistedNormalized, branch: commit.branch || getBranchForCommitFetch(repository) },
            ...(embedNormalizedFiles ? {} : { $unset: { normalizedFiles: '' } }),
          },
        );
      } catch (error) {
        metadata.failedDetailCount += 1;
        const errorCode = error?.response?.data?.message || error?.code || 'GITHUB_COMMIT_DETAIL_FETCH_FAILED';
        updates.set(commit.sha, {
          detailStatus: 'fetch_failed',
          detailErrorCode: errorCode,
          detailFetchedAt: new Date(),
        });
        await RepositoryCommit.updateOne(
          { repositoryId: repository._id, sha: commit.sha },
          { $set: updates.get(commit.sha) },
        );
        console.warn('[github-commits] detail fetch unavailable:', {
          status: error?.response?.status || error?.code || 'unknown',
          message: errorCode,
          repositoryId: String(repository._id || ''),
          fullName: repository.fullName,
          sha: String(commit.sha || '').slice(0, 12),
        });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(getCommitDetailConcurrency(), selected.length) }, () => worker()));
  metadata.source = metadata.fetchedDetailCount > 0 ? 'github' : 'cache';

  const merged = commits.map((commit) => (
    updates.has(commit.sha)
      ? { ...commit, ...updates.get(commit.sha) }
      : (evidenceHydratedCommits.find((item) => item.sha === commit.sha) || commit)
  ));
  return { commits: merged, metadata };
};

const fetchAndCacheRepositoryCommits = async ({
  authUser,
  repository,
  githubAccount,
  query = {},
  forceRefresh = false,
}) => {
  const perPage = Math.min(Number(query.perPage) || 100, 100);
  const maxPages = Math.min(parsePositiveInteger(query.maxPages || process.env.GITHUB_COMMIT_MAX_PAGES, 3), 10);
  const branch = getBranchForCommitFetch(repository, query);
  const cached = await RepositoryCommit.find({ userId: authUser.userId, repositoryId: repository._id, branch })
    .sort({ authorDate: -1 })
    .limit(perPage)
    .lean();

  if (!forceRefresh && isCommitCacheFresh(cached, branch)) {
    return { commits: cached, metadata: { source: 'cache', branch, fetchedCount: cached.length } };
  }

  const account = githubAccount?.accessToken
    ? githubAccount
    : await GithubAccount.findOne({ userId: authUser.userId }).select('+accessToken').lean();
  if (!account?.accessToken) {
    return { commits: cached, metadata: { source: 'cache', branch, errorCode: 'GITHUB_ACCOUNT_MISSING', fetchedCount: cached.length } };
  }

  const [owner, repo] = String(repository.fullName || '').split('/');
  if (!owner || !repo) {
    return { commits: cached, metadata: { source: 'cache', branch, errorCode: 'INVALID_REPOSITORY_FULL_NAME', fetchedCount: cached.length } };
  }

  let fetched = [];
  let githubStatus = null;
  let commitApiUrlWithoutToken = getCommitApiUrl(owner, repo);
  try {
    const result = await fetchGithubCommits({
      owner,
      repo,
      accessToken: account.accessToken,
      branch,
      perPage,
      maxPages,
    });
    fetched = result.commits;
    githubStatus = result.githubStatus;
    commitApiUrlWithoutToken = result.commitApiUrlWithoutToken;
  } catch (error) {
    console.warn('[github-commits] fetch unavailable:', {
      status: error?.response?.status || error?.code || 'unknown',
      message: error?.response?.data?.message || error?.message || 'unknown error',
      repositoryId: String(repository._id || ''),
      fullName: repository.fullName,
      branch,
    });
    return {
      commits: cached,
      metadata: {
        source: 'cache',
        branch,
        commitApiUrlWithoutToken: `${commitApiUrlWithoutToken}?sha=${encodeURIComponent(branch)}`,
        githubStatus: error?.response?.status || null,
        errorCode: error?.code || error?.response?.data?.message || 'GITHUB_COMMIT_FETCH_FAILED',
        fetchedCount: cached.length,
        fetchFailed: true,
      },
    };
  }

  const normalized = fetched
    .filter((commit) => commit && commit.sha)
    .map((commit) => normalizeCommit({ commit, authUser, repository, branch, githubAccount: account }));

  if (normalized.length > 0) {
    await RepositoryCommit.bulkWrite(normalized.map((base) => ({
      updateOne: {
        filter: { userId: authUser.userId, repositoryId: repository._id, sha: base.sha },
        update: { $set: base },
        upsert: true,
      },
    })), { ordered: false });
  }

  if (branch && repository.defaultBranch !== branch) {
    await Repository.updateOne({ _id: repository._id }, { $set: { defaultBranch: branch } });
  }

  const saved = await RepositoryCommit.find({ userId: authUser.userId, repositoryId: repository._id, branch })
    .sort({ authorDate: -1 })
    .limit(perPage)
    .lean();

  return {
    commits: saved,
    metadata: {
      source: 'github',
      branch,
      commitApiUrlWithoutToken,
      githubStatus,
      fetchedCommitCount: fetched.length,
      normalizedCommitCount: normalized.length,
    },
  };
};

const getRepositoryCommits = async (authUser, repoId, query = {}) => {
  const includeStats = parseBooleanQuery(query.includeStats, false);
  const repository = await findRepositoryForUser(authUser, repoId);
  const githubAccount = await GithubAccount.findOne({ userId: authUser.userId }).select('+accessToken').lean();
  if (!githubAccount) {
    throw createStatusError('GitHub account is not connected', 400);
  }

  const result = await fetchAndCacheRepositoryCommits({
    authUser,
    repository,
    githubAccount,
    query,
    forceRefresh: true,
  });

  if (result.metadata.fetchFailed) {
    handleGithubApiError({ response: { status: result.metadata.githubStatus, data: { message: result.metadata.errorCode } } }, 'Failed to fetch repository commits');
  }

  // Existing clients already receive the stats fields. Hydrate missing legacy
  // details best-effort, then reload so the response never uses stale summaries.
  const detailResult = await fetchAndCacheCommitDetailsForUserCommits({
    authUser,
    repository,
    githubAccount,
    commits: result.commits,
    forceRefresh: false,
  });
  const hydrated = await RepositoryCommit.find({
    userId: authUser.userId,
    repositoryId: repository._id,
    sha: { $in: (detailResult.commits || result.commits).map((commit) => commit.sha) },
  }).sort({ authorDate: -1 }).lean();
  const mapped = hydrated.map(mapCommitResponse);
  return {
    repository: { _id: repository._id, name: repository.name, fullName: repository.fullName },
    total: mapped.length,
    commits: mapped,
  };
};

const getRepositoryCommitsCached = async (authUser, repoId, query = {}) => {
  const limit = Math.min(Number(query.limit) || 100, 100);
  const repository = await findRepositoryForUser(authUser, repoId);
  const branch = getBranchForCommitFetch(repository, query);
  const saved = await RepositoryCommit.find({ userId: authUser.userId, repositoryId: repository._id, branch })
    .sort({ authorDate: -1 })
    .limit(limit)
    .lean();

  const mapped = saved.map(mapCommitResponse);

  return {
    repository: { _id: repository._id, name: repository.name, fullName: repository.fullName },
    total: mapped.length,
    commits: mapped,
  };
};

module.exports = {
  fetchAndCacheRepositoryCommits,
  fetchAndCacheCommitDetailsForUserCommits,
  getBranchForCommitFetch,
  getRepositoryCommits,
  getRepositoryCommitsCached,
  isCommitDetailCacheFresh,
  normalizeCommitDetail,
  normalizeCommitFile,
  normalizeCommit,
  buildNormalizedCommitCodeEvidence,
};
