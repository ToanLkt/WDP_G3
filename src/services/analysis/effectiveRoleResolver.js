const ROLE_DEFINITIONS = {
  frontend: { id: 'frontend', name: 'Frontend Developer', projectType: 'Frontend' },
  backend: { id: 'backend', name: 'Backend Developer', projectType: 'Backend' },
  mobile: { id: 'mobile', name: 'Mobile Developer', projectType: 'Mobile' },
  devops: { id: 'devops', name: 'DevOps Engineer', projectType: 'DevOps' },
  data: { id: 'data_scientist', name: 'Data Scientist', projectType: 'Data Science' },
};

const normalizeRoleId = (value) => {
  const text = String(value || '').toLowerCase();
  return Object.keys(ROLE_DEFINITIONS).find((key) => text.includes(key)) || '';
};

const resolveEffectiveRole = ({
  repositoryRole,
  userContributionRole,
  classifierRole,
  classifierConfidence = 0,
  userContributionEvidence = {},
}) => {
  const repositoryKey = normalizeRoleId(repositoryRole);
  const contributionKey = normalizeRoleId(userContributionRole);
  const classifierKey = normalizeRoleId(classifierRole);
  const confidence = Number(classifierConfidence || 0);
  const topFileCount = Number(userContributionEvidence.topFileCount || 0);
  const competingFileCount = Number(userContributionEvidence.competingFileCount || 0);
  const strongContribution = topFileCount >= 2
    && topFileCount >= competingFileCount + 2;
  let selectedKey = classifierKey;
  let reason = 'classifier_default';
  let confidenceSource = 'classifier';

  if (repositoryKey && repositoryKey === contributionKey && strongContribution) {
    selectedKey = repositoryKey;
    reason = 'repository_contribution_agreement';
    confidenceSource = 'repository_and_changed_files';
  } else if (
    contributionKey
    && strongContribution
    && contributionKey !== classifierKey
    && (
      confidence < 0.75
      || !repositoryKey
      || repositoryKey !== classifierKey
      || competingFileCount === 0
    )
  ) {
    selectedKey = contributionKey;
    reason = 'strong_changed_file_evidence_overrides_low_confidence_classifier';
    confidenceSource = 'changed_files';
  } else if (contributionKey && strongContribution && !repositoryKey) {
    selectedKey = contributionKey;
    reason = 'strong_changed_file_evidence';
    confidenceSource = 'changed_files';
  }

  const definition = ROLE_DEFINITIONS[selectedKey] || null;
  return {
    effectiveRoleId: definition?.id || '',
    effectiveRoleName: definition?.name || classifierRole || '',
    reason,
    source: confidenceSource,
    confidenceSource,
  };
};

module.exports = { resolveEffectiveRole, normalizeRoleId, roleKey: normalizeRoleId };
