const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');

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
  return Math.max(1, Math.min(parsed, 3));
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

const normalizeDev2VecInput = (input = {}) => {
  const requestId = normalizeRequestId(input.requestId);

  return {
    requestId,
    repoDocument: normalizeString(input.repoDocument),
    issueDocument: normalizeString(input.issueDocument),
    apiTokens: normalizeApiTokens(input.apiTokens),
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

  let tmpFile;
  try {
    tmpFile = await writeTempInput(payload);
    const result = await runPythonInference({
      pythonBin,
      inferPath,
      tmpFile,
      timeoutMs,
      maxBuffer,
    });

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

    return validateDev2VecOutput(parseStdoutJson(result.stdout));
  } finally {
    await removeTempInput(tmpFile);
  }
};

module.exports = {
  isDev2VecEnabled,
  normalizeDev2VecInput,
  validateDev2VecOutput,
  runDev2VecInference,
};
