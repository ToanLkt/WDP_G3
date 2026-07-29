const successResponse = (res, message = 'Request successful', data = null, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    errorCode: null,
  });
};

const errorResponse = (res, message = 'Request failed', statusCode = 500, errors = [], errorCode = null, metadata = {}) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    errorCode,
    ...(metadata.retryable !== undefined ? { retryable: metadata.retryable } : {}),
    ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
    ...(metadata.upstreamMessage ? { upstreamMessage: metadata.upstreamMessage } : {}),
    errors,
  });
};

module.exports = {
  successResponse,
  errorResponse,
};
