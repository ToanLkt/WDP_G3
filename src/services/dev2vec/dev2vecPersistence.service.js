const shouldPersistVectors = (env = process.env) => String(env.DEV2VEC_PERSIST_VECTORS || 'true').toLowerCase() !== 'false';
const assertPersistableAnalysis = (analysis = {}) => {
  const dev2vec = analysis.dev2vec || {};
  if (!dev2vec.modelVersion || !Array.isArray(dev2vec.rolePredictions) || !dev2vec.rolePredictions.length
    || !dev2vec.skillGaps || typeof dev2vec.skillGaps !== 'object' || !dev2vec.cacheMetadata?.evidenceFingerprint
    || !dev2vec.cacheMetadata?.mappingVersion || !dev2vec.cacheMetadata?.cachePolicyVersion) {
    const error = new Error('Dev2Vec analysis is not valid for persistence');
    error.errorCode = 'DEV2VEC_PERSISTENCE_INVALID';
    throw error;
  }
  return analysis;
};
const estimateDocumentBytes = (value) => Buffer.byteLength(JSON.stringify(value || {}), 'utf8');

module.exports = { shouldPersistVectors, assertPersistableAnalysis, estimateDocumentBytes };
