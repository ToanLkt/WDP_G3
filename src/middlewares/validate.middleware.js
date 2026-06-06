const { errorResponse } = require('../utils/response');

const validate = (validatorFn) => (req, res, next) => {
  if (typeof validatorFn !== 'function') {
    return next();
  }

  const validationResult = validatorFn(req);

  if (!validationResult || validationResult.isValid) {
    return next();
  }

  return errorResponse(
    res,
    validationResult.message || 'Validation failed',
    validationResult.statusCode || 400,
    validationResult.errors || [],
    validationResult.errorCode || 'VALIDATION_ERROR'
  );
};

module.exports = validate;
