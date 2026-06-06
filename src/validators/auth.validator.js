const validateRegisterBody = (req) => {
  const errors = [];
  const body = req.body || {};
  const email = String(body.email || '').trim();
  const password = String(body.password || '');

  if (!body.fullName || !String(body.fullName).trim()) {
    errors.push('fullName is required');
  }

  if (!email) {
    errors.push('email is required');
  } else if (!/^\S+@\S+\.\S+$/.test(email)) {
    errors.push('email is invalid');
  }

  if (!password.trim()) {
    errors.push('password is required');
  } else if (password.length < 6) {
    errors.push('password must be at least 6 characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const validateLoginBody = (req) => {
  const errors = [];
  const body = req.body || {};
  const email = String(body.email || '').trim();
  const password = String(body.password || '');

  if (!email) {
    errors.push('email is required');
  } else if (!/^\S+@\S+\.\S+$/.test(email)) {
    errors.push('email is invalid');
  }

  if (!password.trim()) {
    errors.push('password is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const validateChangePasswordBody = (req) => {
  const errors = [];
  const body = req.body || {};
  const allowedFields = ['currentPassword', 'newPassword', 'confirmPassword'];
  const unknownFields = Object.keys(body).filter((key) => !allowedFields.includes(key));
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  const confirmPassword = String(body.confirmPassword || '');

  if (unknownFields.length) {
    errors.push(`Unknown fields are not allowed: ${unknownFields.join(', ')}`);
  }

  if (!currentPassword.trim()) {
    errors.push('currentPassword is required');
  }

  if (!newPassword.trim()) {
    errors.push('newPassword is required');
  } else if (newPassword.length < 6) {
    errors.push('newPassword must be at least 6 characters');
  }

  if (!confirmPassword.trim()) {
    errors.push('confirmPassword is required');
  } else if (newPassword && confirmPassword !== newPassword) {
    errors.push('confirmPassword must match newPassword');
  }

  if (currentPassword && newPassword && currentPassword === newPassword) {
    errors.push('newPassword must be different from currentPassword');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateChangePasswordBody,
  validateRegisterBody,
  validateLoginBody,
};
