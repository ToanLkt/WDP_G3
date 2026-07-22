const { execFile } = require('child_process');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { createDev2VecTimer } = require('../../utils/dev2vecTiming');

const DEFAULT_INFER_PATH = 'ml_service/infer.py';
const DEFAULT_PYTHON_BIN = 'python';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_BUFFER_BYTES = 10485760;
const TMP_DIR = 'tmp';
const EXPECTED_VECTOR_DIMS = Object.freeze({ repo: 230, issue: 150, api: 200, combined: 580 });
const VALID_ROLE_IDS = new Set(['backend', 'frontend', 'mobile', 'devops', 'data_scientist']);
const VALID_SKILL_STATUSES = new Set(['matched', 'weak', 'missing']);
const FLOAT_TOLERANCE = 1e-12;

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

const isPlainObject = (value) => Boolean(
  value && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const contractError = (field, message) => createDev2VecError(
  `Invalid Dev2Vec output: ${field}${message ? ` ${message}` : ''}`,
  'DEV2VEC_OUTPUT_CONTRACT_INVALID',
  502,
);

const requirePlainObject = (value, field) => {
  if (!isPlainObject(value)) throw contractError(field, 'must be an object');
};

const requireNonEmptyString = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) throw contractError(field, 'must be a non-empty string');
};

const requireStringArray = (value, field) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw contractError(field, 'must be an array of strings');
  }
};

const validateVector = (value, field, expectedLength) => {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw contractError(field, `must contain ${expectedLength} numbers`);
  }
  if (value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw contractError(field, 'must contain only finite numbers');
  }
};

const numbersEqual = (left, right) => Math.abs(left - right) <= FLOAT_TOLERANCE;

const validateVectorContract = ({ vectorDims, vectors, vectorSources }) => {
  for (const [source, expected] of Object.entries(EXPECTED_VECTOR_DIMS)) {
    if (vectorDims[source] !== expected) throw contractError(`vectorDims.${source}`, `must equal ${expected}`);
  }

  const vectorSpecs = [
    ['repoVector', EXPECTED_VECTOR_DIMS.repo],
    ['issueVector', EXPECTED_VECTOR_DIMS.issue],
    ['apiVector', EXPECTED_VECTOR_DIMS.api],
    ['combinedVector', EXPECTED_VECTOR_DIMS.combined],
  ];
  vectorSpecs.forEach(([field, length]) => validateVector(vectors[field], `vectors.${field}`, length));

  const expectedCombined = [...vectors.repoVector, ...vectors.issueVector, ...vectors.apiVector];
  if (expectedCombined.some((value, index) => !numbersEqual(value, vectors.combinedVector[index]))) {
    throw contractError('vectors.combinedVector', 'must concatenate repoVector, issueVector, and apiVector');
  }

  const sourceVectors = { repos: vectors.repoVector, issues: vectors.issueVector, apis: vectors.apiVector };
  for (const [source, vector] of Object.entries(sourceVectors)) {
    if (typeof vectorSources[source] !== 'boolean') throw contractError(`vectorSources.${source}`, 'must be boolean');
    if (!vectorSources[source] && vector.some((value) => value !== 0)) {
      throw contractError(`vectors.${source}`, 'must be zero when its source is unavailable');
    }
  }
};

const validateSkillGap = (skillGap, roleId) => {
  requirePlainObject(skillGap, `skillGaps.${roleId}`);
  ['matchedSkillNames', 'weakSkillNames', 'missingSkillNames', 'recommendedNextSkills']
    .forEach((field) => requireStringArray(skillGap[field], `skillGaps.${roleId}.${field}`));
  if (!Array.isArray(skillGap.details)) throw contractError(`skillGaps.${roleId}.details`, 'must be an array');
  skillGap.details.forEach((detail, index) => {
    const field = `skillGaps.${roleId}.details[${index}]`;
    requirePlainObject(detail, field);
    requireNonEmptyString(detail.skillName, `${field}.skillName`);
    requireNonEmptyString(detail.canonicalSkillName, `${field}.canonicalSkillName`);
    if (typeof detail.similarity !== 'number' || !Number.isFinite(detail.similarity)
      || detail.similarity < 0 || detail.similarity > 1) {
      throw contractError(`${field}.similarity`, 'must be a finite number from 0 to 1');
    }
    if (!VALID_SKILL_STATUSES.has(detail.status)) throw contractError(`${field}.status`, 'is invalid');
  });
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
  requirePlainObject(output, 'output');

  if (output.success === false) {
    throw createDev2VecError(
      output.message || 'Dev2Vec inference failed',
      output.errorCode || 'DEV2VEC_INFERENCE_FAILED',
      502,
    );
  }

  if (output.success !== true) throw contractError('success', 'must equal true');
  requireNonEmptyString(output.modelVersion, 'modelVersion');
  requirePlainObject(output.vectorDims, 'vectorDims');
  requirePlainObject(output.vectors, 'vectors');
  if (!Array.isArray(output.rolePredictions)) throw contractError('rolePredictions', 'must be an array');
  requirePlainObject(output.skillGaps, 'skillGaps');
  requirePlainObject(output.vectorSources, 'vectorSources');
  requirePlainObject(output.sourceStats, 'sourceStats');

  if (output.rolePredictions.length < 1 || output.rolePredictions.length > 3) {
    throw contractError('rolePredictions', 'must contain 1 to 3 items');
  }
  const roleIds = new Set();
  let previousProbability = Infinity;
  output.rolePredictions.forEach((prediction, index) => {
    const field = `rolePredictions[${index}]`;
    requirePlainObject(prediction, field);
    if (!VALID_ROLE_IDS.has(prediction.roleId)) throw contractError(`${field}.roleId`, 'is invalid');
    if (roleIds.has(prediction.roleId)) throw contractError(`${field}.roleId`, 'must be unique');
    roleIds.add(prediction.roleId);
    requireNonEmptyString(prediction.roleName, `${field}.roleName`);
    requireNonEmptyString(prediction.modelLabel, `${field}.modelLabel`);
    if (typeof prediction.probability !== 'number' || !Number.isFinite(prediction.probability)
      || prediction.probability < 0 || prediction.probability > 1) {
      throw contractError(`${field}.probability`, 'must be a finite number from 0 to 1');
    }
    if (prediction.probability > previousProbability + FLOAT_TOLERANCE) {
      throw contractError(`${field}.probability`, 'must be in non-increasing order');
    }
    previousProbability = prediction.probability;
    if (!Number.isInteger(prediction.rank) || prediction.rank !== index + 1) {
      throw contractError(`${field}.rank`, `must equal ${index + 1}`);
    }
    validateSkillGap(output.skillGaps[prediction.roleId], prediction.roleId);
  });

  validateVectorContract(output);
  ['repoTextLength', 'issueTextLength', 'apiTokenCount'].forEach((field) => {
    const value = output.sourceStats[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw contractError(`sourceStats.${field}`, 'must be a non-negative integer');
    }
  });

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
      { parseError: error.message, stdoutBytes: Buffer.byteLength(String(stdout || ''), 'utf8') },
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
  await fs.writeFile(tmpFile, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
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

const runPythonInference = ({ pythonBin, inferPath, tmpFile, timeoutMs, maxBuffer }) => new Promise((resolve) => {
  let settled = false;
  let timedOut = false;
  let observedExitCode = null;
  let observedSignal = null;
  const finish = (result) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutHandle);
    resolve({ ...result, timedOut, exitCode: result.exitCode ?? observedExitCode, signal: result.signal ?? observedSignal });
  };
  let child;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    if (child && !child.killed) child.kill('SIGTERM');
  }, timeoutMs);
  try {
    child = execFile(
      pythonBin,
      [inferPath, '--input', tmpFile],
      {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONHASHSEED: process.env.PYTHONHASHSEED || '0' },
        maxBuffer,
        windowsHide: true,
      },
      (error, stdout, stderr) => finish({
        stdout: stdout || error?.stdout || '',
        stderr: stderr || error?.stderr || '',
        exitCode: error?.code,
        signal: error?.signal,
        processError: error || null,
      }),
    );
    child.once('error', (error) => finish({ stdout: '', stderr: '', exitCode: error.code, signal: error.signal, processError: error }));
    child.once('exit', (code, signal) => { observedExitCode = code; observedSignal = signal; });
    child.once('close', (code, signal) => { observedExitCode = code; observedSignal = signal; });
  } catch (error) {
    finish({ stdout: '', stderr: '', exitCode: error.code, signal: error.signal, processError: error });
  }
});

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
    options.timeoutMs || process.env.DEV2VEC_PROCESS_TIMEOUT_MS || process.env.DEV2VEC_TIMEOUT_MS,
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
      if (error?.errorCode === 'DEV2VEC_OUTPUT_CONTRACT_INVALID') throw error;
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
      console.warn('[dev2vec] infer.py stderr:', JSON.stringify({ stderrBytes: Buffer.byteLength(String(result.stderr), 'utf8') }));
    }

    if (result.timedOut) {
      throw createDev2VecError(
        'Dev2Vec local process timed out',
        'DEV2VEC_PROCESS_TIMEOUT',
        504,
        { timeoutMs, signal: result.signal },
      );
    }

    if (!result.stdout) {
      const error = result.processError;
      const executableMissing = ['ENOENT', 'EACCES', 'EPERM'].includes(error?.code);
      const processFailed = error && !executableMissing;
      throw createDev2VecError(
        executableMissing
          ? 'Dev2Vec Python executable is unavailable'
          : processFailed
            ? 'Dev2Vec local process failed'
            : 'Dev2Vec inference produced empty stdout',
        executableMissing
          ? 'DEV2VEC_PROCESS_UNAVAILABLE'
          : processFailed
            ? 'DEV2VEC_PROCESS_FAILED'
            : 'DEV2VEC_INVALID_OUTPUT',
        executableMissing ? 503 : 502,
        {
          exitCode: result.exitCode,
          signal: result.signal,
          stderrBytes: Buffer.byteLength(String(result.stderr || ''), 'utf8'),
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
  runPythonInference,
};
