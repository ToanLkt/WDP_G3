const { errorResponse } = require('../utils/response');

const errorMiddleware = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';
  const errors = Array.isArray(err.errors) ? err.errors : [];
  const errorCode = err.errorCode || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');
  const requestId = req.requestId || req.analysisRequestId || String(req.headers['x-request-id'] || '');
  const retryable = err.retryable !== undefined ? err.retryable : [408, 429, 502, 503, 504].includes(statusCode);
  const upstreamMessage = err.llmError?.upstreamMessage;
  console.error('[request_failed]', JSON.stringify({ requestId: requestId || undefined, method: req.method, path: req.originalUrl || req.path, status: statusCode, errorCode, message, upstreamStatus: err.llmError?.status, upstreamMessage, attemptedModels: err.llmError?.attemptedModels, stack: process.env.NODE_ENV === 'production' ? undefined : err.stack }));

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
  const exposeUpstream = process.env.NODE_ENV !== 'production' || process.env.DEBUG_ERRORS === 'true';
  return errorResponse(res, message, statusCode, errors, errorCode, { requestId, retryable, upstreamMessage: exposeUpstream ? upstreamMessage : undefined });
};

module.exports = errorMiddleware;
