const learningResourcesSeed = require('../seeds/learningResources.seed');
const normalizeText = require('../utils/normalizeText');
const { canonicalizeSkillName } = require('../utils/skillCanonicalizer');

const DEFAULT_TARGET_ROLE = 'Software Developer';
const DEFAULT_LEVEL = 'beginner';
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_TYPE = 'video';

function isValidResourceUrl(url) {
  const value = String(url || '').trim();

  if (!value) {
    return false;
  }

  const upperValue = value.toUpperCase();

  if (upperValue.startsWith('TODO')) {
    return false;
  }

  if (upperValue.includes('TODO_')) {
    return false;
  }

  if (upperValue.includes('_VIDEO_URL')) {
    return false;
  }

  return /^https?:\/\//i.test(value);
}

const findCatalogResources = ({ skillName, targetRole, level, language, type }) => {
  const normalizedSkillName = normalizeText(canonicalizeSkillName(skillName));
  const normalizedTargetRole = normalizeText(targetRole || DEFAULT_TARGET_ROLE);
  const normalizedLevel = normalizeText(level || DEFAULT_LEVEL);
  const normalizedLanguage = normalizeText(language || DEFAULT_LANGUAGE);
  const normalizedType = normalizeText(type || DEFAULT_TYPE);

  return learningResourcesSeed.filter((resource) => {
    const catalogSkillName = normalizeText(canonicalizeSkillName(resource.skillName));
    const catalogTargetRole = normalizeText(resource.targetRole);
    const catalogLevel = normalizeText(resource.level || DEFAULT_LEVEL);
    const catalogLanguage = normalizeText(resource.language || DEFAULT_LANGUAGE);
    const catalogType = normalizeText(resource.type || DEFAULT_TYPE);
    const matchesTargetRole =
      !catalogTargetRole ||
      catalogTargetRole === normalizeText(DEFAULT_TARGET_ROLE) ||
      catalogTargetRole === normalizedTargetRole;

    return (
      catalogSkillName === normalizedSkillName &&
      matchesTargetRole &&
      catalogLevel === normalizedLevel &&
      catalogLanguage === normalizedLanguage &&
      catalogType === normalizedType &&
      isValidResourceUrl(resource.url)
    );
  });
};

module.exports = {
  findCatalogResources,
  isValidResourceUrl,
};
