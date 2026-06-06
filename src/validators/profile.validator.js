const validateProfileBody = (req) => {
  const errors = [];
  const body = req.body || {};
  const allowedFields = [
    'fullName',
    'university',
    'major',
    'year',
    'targetCareer',
    'currentSkills',
    'githubUsername',
  ];
  const unknownFields = Object.keys(body).filter((key) => !allowedFields.includes(key));

  if (!Object.keys(body).length) {
    errors.push('Request body must contain at least one profile field');
  }

  if (unknownFields.length) {
    errors.push(`Unknown fields are not allowed: ${unknownFields.join(', ')}`);
  }

  if (body.fullName !== undefined) {
    if (typeof body.fullName !== 'string' || !body.fullName.trim()) {
      errors.push('fullName must be a non-empty string');
    } else if (body.fullName.trim().length > 100) {
      errors.push('fullName must be at most 100 characters');
    }
  }

  if (body.university !== undefined && body.university !== null && body.university !== '') {
    if (typeof body.university !== 'string') {
      errors.push('university must be a string');
    }
  }

  if (body.major !== undefined && body.major !== null && body.major !== '') {
    if (typeof body.major !== 'string') {
      errors.push('major must be a string');
    }
  }

  if (body.year !== undefined && body.year !== null && body.year !== '') {
    if (typeof body.year !== 'number' || Number.isNaN(body.year)) {
      errors.push('year must be a number');
    } else if (body.year < 1 || body.year > 6) {
      errors.push('year must be between 1 and 6');
    }
  }

  if (body.currentSkills !== undefined) {
    if (!Array.isArray(body.currentSkills)) {
      errors.push('currentSkills must be an array of strings');
    } else {
      const invalid = body.currentSkills.find((s) => typeof s !== 'string');
      if (invalid !== undefined) {
        errors.push('currentSkills must be an array of strings');
      }
    }
  }

  if (body.targetCareer !== undefined && body.targetCareer !== null && body.targetCareer !== '') {
    if (typeof body.targetCareer !== 'string') {
      errors.push('targetCareer must be a string');
    }
  }

  if (body.githubUsername !== undefined && body.githubUsername !== null && body.githubUsername !== '') {
    if (typeof body.githubUsername !== 'string') {
      errors.push('githubUsername must be a string');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const validateCreateProfileBody = (req) => {
  const result = validateProfileBody(req);
  const body = req.body || {};

  if (!body.university && !body.major && !body.year && !body.targetCareer && !body.githubUsername) {
    result.errors.push('At least one profile field is required');
  }

  result.isValid = result.errors.length === 0;
  return result;
};

module.exports = {
  validateCreateProfileBody,
  validateProfileBody,
};
