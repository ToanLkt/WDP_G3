const { execFile } = require('child_process');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');
const { createDev2VecTimer } = require('../../utils/dev2vecTiming');

const execFileAsync = promisify(execFile);

const DEFAULT_INFER_PATH = 'ml_service/infer.py';
const DEFAULT_PYTHON_BIN = 'python';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_BUFFER_BYTES = 10485760;
const TMP_DIR = 'tmp';

const createDev2VecError = (message, errorCode, statusCode = 503, details = {}) => {
  const error = new Error(message);
  error.errorCode = errorCode;
  error.statusCode = statusCode;
  Object.assign(error, details);
  return error;
};

const isDev2VecEnabled = () => (
  String(process.env.DEV2VEC_ENABLED || 'true').trim().toLowerCase() !== 'false'
);

const clampTopN = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 3;
  }
  return Math.max(1, Math.min(parsed, 5));
};

const normalizeRequestId = (requestId) => {
  const normalized = requestId === undefined || requestId === null
    ? ''
    : String(requestId).trim();
  return normalized || crypto.randomUUID();
};

const sanitizeRequestIdForFilename = (requestId) => (
  String(requestId)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 120) || crypto.randomUUID()
);

const normalizeString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return typeof value === 'string' ? value : String(value);
};

const normalizeApiTokens = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item !== undefined && item !== null)
    .map((item) => (typeof item === 'string' ? item : String(item)));
};

const normalizeEvidenceChannels = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const available = value.availableChannels && typeof value.availableChannels === 'object'
    ? value.availableChannels
    : {};
  const status = value.channelStatus && typeof value.channelStatus === 'object'
    ? value.channelStatus
    : {};

  return {
    availableChannels: {
      repo: available.repo === true,
      issue: available.issue === true,
      api: available.api === true,
    },
    channelStatus: {
      repo: normalizeString(status.repo),
      issue: normalizeString(status.issue),
      api: normalizeString(status.api),
    },
  };
};

const normalizeDev2VecInput = (input = {}) => {
  const requestId = normalizeRequestId(input.requestId);

  return {
    requestId,
    repoDocument: normalizeString(input.repoDocument),
    issueDocument: normalizeString(input.issueDocument),
    apiTokens: normalizeApiTokens(input.apiTokens),
    evidenceChannels: normalizeEvidenceChannels(input.evidenceChannels),
    topN: clampTopN(input.topN),
  };
};

const resolveProjectPath = (value, fallback) => {
  const configuredPath = value || fallback;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
};

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isTrue = (value, fallback = false) => value === undefined
  ? fallback
  : ['true', '1'].includes(String(value).toLowerCase());

const getServiceUrl = () => String(process.env.DEV2VEC_SERVICE_URL || '').replace(/\/$/, '');

const getDev2VecServiceHealth = async () => {
  const serviceUrl = getServiceUrl();
  if (!serviceUrl) return { configured: false, healthy: false, status: 'not_configured' };
  try {
    const response = await axios.get(`${serviceUrl}/health`, {
      timeout: parsePositiveInteger(process.env.DEV2VEC_SERVICE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    });
    return { configured: true, healthy: response.data?.status === 'ok', ...response.data };
  } catch (error) {
    return { configured: true, healthy: false, status: 'unavailable', reason: error.code || error.message };
  }
};

const runServiceInference = async (payload, timeoutMs) => {
  const started = Date.now();
  const response = await axios.post(`${getServiceUrl()}/infer`, payload, {
    timeout: timeoutMs,
    maxContentLength: parsePositiveInteger(process.env.DEV2VEC_MAX_BUFFER_BYTES, DEFAULT_MAX_BUFFER_BYTES),
  });
  return { output: validateDev2VecOutput(response.data), latencyMs: Date.now() - started };
};

const validateDev2VecOutput = (output) => {
  if (!output || typeof output !== 'object') {
    throw createDev2VecError(
      'Dev2Vec output must be a JSON object',
      'DEV2VEC_INVALID_OUTPUT',
      502,
    );
  }

  if (output.success === false) {
    throw createDev2VecError(
      output.message || 'Dev2Vec inference failed',
      output.errorCode || 'DEV2VEC_INFERENCE_FAILED',
      502,
      { dev2vecOutput: output },
    );
  }

  if (
    output.success !== true
    || !Array.isArray(output.rolePredictions)
    || !output.skillGaps
    || typeof output.skillGaps !== 'object'
    || Array.isArray(output.skillGaps)
    || !output.vectorDims
    || typeof output.vectorDims !== 'object'
  ) {
    throw createDev2VecError(
      'Dev2Vec output is missing required fields',
      'DEV2VEC_INVALID_OUTPUT',
      502,
      { dev2vecOutput: output },
    );
  }

  return output;
};

const parseStdoutJson = (stdout) => {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw createDev2VecError(
      'Dev2Vec stdout is not valid JSON',
      'DEV2VEC_INVALID_OUTPUT',
      502,
      { parseError: error.message, stdoutPreview: String(stdout || '').slice(0, 500) },
    );
  }
};

const writeTempInput = async (payload) => {
  const tmpDir = path.resolve(process.cwd(), TMP_DIR);
  await fs.mkdir(tmpDir, { recursive: true });

  const tmpFile = path.join(
    tmpDir,
    `dev2vec-input-${sanitizeRequestIdForFilename(payload.requestId)}.json`,
  );
  await fs.writeFile(tmpFile, JSON.stringify(payload), 'utf8');
  return tmpFile;
};

const removeTempInput = async (tmpFile) => {
  if (!tmpFile) {
    return;
  }

  try {
    await fs.unlink(tmpFile);
  } catch (error) {
    // Best-effort cleanup. Inference result should not fail because temp cleanup failed.
  }
};

const runPythonInference = async ({ pythonBin, inferPath, tmpFile, timeoutMs, maxBuffer }) => {
  try {
    return await execFileAsync(
      pythonBin,
      [inferPath, '--input', tmpFile],
      {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONHASHSEED: process.env.PYTHONHASHSEED || '0' },
        timeout: timeoutMs,
        maxBuffer,
        windowsHide: true,
      },
    );
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code,
      signal: error.signal,
      processError: error,
    };
  }
};

const runDev2VecInference = async (input = {}, options = {}) => {
  if (!isDev2VecEnabled()) {
    throw createDev2VecError(
      'Dev2Vec model is disabled',
      'DEV2VEC_MODEL_UNAVAILABLE',
      503,
    );
  }

  const payload = normalizeDev2VecInput(input);
  const pythonBin = options.pythonBin || process.env.DEV2VEC_PYTHON_BIN || DEFAULT_PYTHON_BIN;
  const inferPath = resolveProjectPath(
    options.inferPath || process.env.DEV2VEC_INFER_PATH,
    DEFAULT_INFER_PATH,
  );
  const timeoutMs = parsePositiveInteger(
    options.timeoutMs || process.env.DEV2VEC_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const maxBuffer = parsePositiveInteger(
    options.maxBuffer || process.env.DEV2VEC_MAX_BUFFER_BYTES,
    DEFAULT_MAX_BUFFER_BYTES,
  );

  const serviceUrl = getServiceUrl();
  let fallbackReason = null;
  if (serviceUrl) {
    try {
      const service = await runServiceInference(
        payload,
        parsePositiveInteger(process.env.DEV2VEC_SERVICE_TIMEOUT_MS, timeoutMs),
      );
      if (process.env.ANALYSIS_TIMING_DEBUG === 'true' || process.env.DEV2VEC_TIMING_DEBUG === 'true') {
        console.log('[Dev2VecClient]', JSON.stringify({
          requestId: payload.requestId,
          mode: 'service',
          serviceLatencyMs: service.latencyMs,
          artifactVersion: service.output.modelVersion || null,
          retryCount: 0,
          workerState: 'warm',
        }));
      }
      return service.output;
    } catch (error) {
      if (!isTrue(process.env.DEV2VEC_SERVICE_FALLBACK_ENABLED, true)) throw error;
      fallbackReason = error.code || error.message;
      console.warn('[Dev2VecClient]', JSON.stringify({
        requestId: payload.requestId,
        mode: 'process_fallback',
        fallbackReason,
        retryCount: 0,
      }));
    }
  }

  let tmpFile;
  const timer = createDev2VecTimer({ requestId: payload.requestId });
  try {
    tmpFile = await timer.measure('writeTempInputMs', () => writeTempInput(payload));
    const result = await timer.measure('pythonProcessMs', () => runPythonInference({
      pythonBin,
      inferPath,
      tmpFile,
      timeoutMs,
      maxBuffer,
    }));

    if (result.stderr) {
      console.warn('[dev2vec] infer.py stderr:', result.stderr.trim());
    }

    if (!result.stdout) {
      const error = result.processError;
      throw createDev2VecError(
        error?.killed || result.signal
          ? 'Dev2Vec inference timed out or was terminated'
          : 'Dev2Vec inference produced empty stdout',
        'DEV2VEC_INVALID_OUTPUT',
        502,
        {
          exitCode: result.exitCode,
          signal: result.signal,
          stderr: result.stderr,
        },
      );
    }

    const output = validateDev2VecOutput(parseStdoutJson(result.stdout));
    if (process.env.ANALYSIS_TIMING_DEBUG === 'true' || process.env.DEV2VEC_TIMING_DEBUG === 'true') {
      console.log('[Dev2VecClient]', JSON.stringify({
        requestId: payload.requestId,
        mode: fallbackReason ? 'process_fallback' : 'process',
        fallbackReason,
        artifactVersion: output.modelVersion || null,
        retryCount: 0,
        workerState: 'cold',
      }));
    }
    timer.log({
      apiTokenCount: payload.apiTokens.length,
      repoTextLength: payload.repoDocument.length,
      issueTextLength: payload.issueDocument.length,
    });
    return output;
  } finally {
    await timer.measure('removeTempInputMs', () => removeTempInput(tmpFile));
  }
};

module.exports = {
  getDev2VecServiceHealth,
  isDev2VecEnabled,
  normalizeDev2VecInput,
  validateDev2VecOutput,
  runDev2VecInference,
};
