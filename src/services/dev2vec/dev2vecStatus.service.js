const fs = require('fs/promises');
const path = require('path');

const REQUIRED_ARTIFACTS = {
  doc2vecRepo: 'doc2vec_repo.model',
  doc2vecIssue: 'doc2vec_issue.model',
  doc2vecApi: 'doc2vec_api.model',
  classifier: 'role_classifier.joblib',
  labelEncoder: 'label_encoder.joblib',
  skillVectors: 'skill_vectors.json',
  metadata: 'model_metadata.json',
};

const DEFAULT_VECTOR_DIMS = {
  repo: 230,
  issue: 150,
  api: 200,
  combined: 580,
};

const DEFAULT_ARTIFACTS_DIR = 'ml_service/artifacts';

const resolveFromRoot = (value) => {
  const configuredPath = value || DEFAULT_ARTIFACTS_DIR;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
};

const readMetadata = async (metadataPath) => {
  try {
    const raw = await fs.readFile(metadataPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const buildArtifactStatus = async (artifactsDir) => {
  const entries = await Promise.all(
    Object.entries(REQUIRED_ARTIFACTS).map(async ([key, filename]) => [
      key,
      await fileExists(path.join(artifactsDir, filename)),
    ]),
  );

  return Object.fromEntries(entries);
};

const determineStatus = ({ enabled, metadata, artifacts }) => {
  if (!enabled || !metadata || !artifacts.metadata) {
    return 'unavailable';
  }

  const allArtifactsReady = Object.values(artifacts).every(Boolean);
  if (metadata.status === 'ready' && allArtifactsReady) {
    return 'ready';
  }

  return 'partial';
};

const getDev2VecStatus = async () => {
  const enabled = String(process.env.DEV2VEC_ENABLED || 'true').toLowerCase() !== 'false';
  const artifactsDir = resolveFromRoot(process.env.DEV2VEC_ARTIFACTS_DIR);
  const artifacts = await buildArtifactStatus(artifactsDir);
  const metadata = artifacts.metadata
    ? await readMetadata(path.join(artifactsDir, REQUIRED_ARTIFACTS.metadata))
    : null;

  const data = {
    status: determineStatus({ enabled, metadata, artifacts }),
    modelVersion: metadata?.modelVersion || null,
    trainedAt: metadata?.trainedAt || null,
    roles: Array.isArray(metadata?.roles) ? metadata.roles : [],
    roleIds: Array.isArray(metadata?.roleIds) ? metadata.roleIds : [],
    vectorDims: metadata?.vectorDims || DEFAULT_VECTOR_DIMS,
    dataset: metadata?.dataset || {
      sampleCount: 0,
      samplesPerRole: {},
    },
    artifacts,
  };

  return {
    statusCode: 200,
    message: 'Dev2Vec model status fetched successfully',
    data,
  };
};

module.exports = {
  getDev2VecStatus,
};
