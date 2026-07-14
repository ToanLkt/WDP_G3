const decideIncrementalAnalysis = ({
  enabled = true,
  forceRegenerate = false,
  latestAnalysis = null,
  currentHeadSha = '',
  previousFingerprint = {},
  currentBranch = '',
  metadataCompatible = false,
  commits = [],
} = {}) => {
  const previousHeadSha = previousFingerprint.latestCommitSha || '';
  const knownHeadIndex = commits.findIndex((commit) => commit.sha === previousHeadSha);
  const incremental = Boolean(
    enabled && !forceRegenerate && latestAnalysis && currentHeadSha && previousHeadSha
    && currentHeadSha !== previousHeadSha && currentBranch === previousFingerprint.defaultBranch
    && metadataCompatible && knownHeadIndex >= 0
  );
  const reason = incremental ? 'new_commits_since_known_head' : (
    forceRegenerate ? 'forced_full_analysis'
      : !enabled ? 'feature_disabled'
        : !latestAnalysis ? 'first_analysis'
          : !currentHeadSha || !previousHeadSha ? 'head_sha_unavailable'
            : currentBranch !== previousFingerprint.defaultBranch ? 'branch_changed'
              : !metadataCompatible ? 'version_changed'
                : knownHeadIndex < 0 ? 'history_rewrite_or_known_head_unreachable'
                  : currentHeadSha === previousHeadSha ? 'repository_unchanged'
                    : 'full_analysis_required'
  );
  return {
    incremental,
    reason,
    previousHeadSha,
    knownHeadIndex,
    newCommitShas: incremental
      ? commits.slice(0, knownHeadIndex).map((commit) => commit.sha).filter(Boolean)
      : [],
  };
};

module.exports = { decideIncrementalAnalysis };
