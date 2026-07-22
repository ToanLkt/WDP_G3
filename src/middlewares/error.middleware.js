const { errorResponse } = require('../utils/response');

const errorMiddleware = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';
  const errors = Array.isArray(err.errors) ? err.errors : [];
  const errorCode = err.errorCode || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');

  if (req.analysisRequestId) {
    console.error('[analysis-request]', JSON.stringify({
      requestId: req.analysisRequestId,
      userId: req.user?.userId || req.user?.id || null,
      repoId: req.params?.repoId || null,
      stage: 'request_failed',
      durationMs: Date.now() - (req.analysisRequestStartedAt || Date.now()),
      errorCode,
    }));
  }
  if (res.headersSent) return next(err);
  return errorResponse(res, message, statusCode, errors, errorCode);
};

module.exports = errorMiddleware;
