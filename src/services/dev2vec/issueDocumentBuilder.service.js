const { cleanTrainingText } = require('./trainingTextCleaner');
const ISSUE_DOCUMENT_VERSION = 'dev2vec-issue-document-v3-python-cleaner-parity';
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const safeSlice = (value, max) => Array.from(String(value || '')).slice(0, max).join('').trim();

const buildAttributedIssueDocument = (issues = []) => {
  const seen = new Set();
  const selected = [...issues]
    .filter((issue) => Array.isArray(issue?.relations) && issue.relations.length)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
      || Number(a.number || 0) - Number(b.number || 0))
    .filter((issue) => {
      const key = `${issue.repositoryFullName || ''}#${issue.number}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);
  const parts = [];
  selected.forEach((issue) => {
    parts.push(
      `user issue ${issue.relations.join(' ')} ${clean(issue.title)}`,
      clean(issue.body),
      `labels ${(issue.labels || []).map((label) => clean(typeof label === 'string' ? label : label?.name)).filter(Boolean).sort().join(' ')}`,
    );
    (issue.userComments || []).slice(0, 3).forEach((comment) => parts.push(`user comment ${clean(comment?.body || comment)}`));
  });
  return {
    issueDocument: cleanTrainingText(parts.filter((part) => part && !/\s$/.test(part)).join(' '), 30000),
    selectedIssues: selected,
    diagnostics: { issueDocumentVersion: ISSUE_DOCUMENT_VERSION, selectedIssueCount: selected.length },
  };
};

module.exports = { ISSUE_DOCUMENT_VERSION, buildAttributedIssueDocument };
