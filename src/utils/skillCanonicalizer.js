const { CANONICAL_SKILLS } = require('../constants/canonicalSkills');

const normalizeSkillText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015-]+/g, ' ')
    .replace(/\s+/g, ' ');

const skillLookup = new Map();

CANONICAL_SKILLS.forEach((skill) => {
  [skill.name, ...skill.aliases].forEach((value) => {
    const normalizedValue = normalizeSkillText(value);
    if (normalizedValue && !skillLookup.has(normalizedValue)) {
      skillLookup.set(normalizedValue, skill);
    }
  });
});

const getCanonicalSkill = (skillName) => {
  const normalizedName = normalizeSkillText(skillName);
  return normalizedName ? skillLookup.get(normalizedName) || null : null;
};

const canonicalizeSkillName = (skillName) => {
  const trimmedName = String(skillName ?? '').trim();
  if (!trimmedName) return '';

  const skill = getCanonicalSkill(trimmedName);
  return skill ? skill.name : trimmedName;
};

const getCanonicalSkillCategory = (skillName) =>
  getCanonicalSkill(skillName)?.category || 'General';

const isKnownSkill = (skillName) => getCanonicalSkill(skillName) !== null;

const listCanonicalSkills = () => CANONICAL_SKILLS;

module.exports = {
  normalizeSkillText,
  canonicalizeSkillName,
  getCanonicalSkill,
  getCanonicalSkillCategory,
  isKnownSkill,
  listCanonicalSkills,
};
