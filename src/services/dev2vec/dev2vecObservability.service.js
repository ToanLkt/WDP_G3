const counters = new Map();
const SAFE_FIELDS = [
  'requestId', 'userId', 'repositoryId', 'modelVersion', 'pipelineVersion', 'evidenceBuilderVersion',
  'mappingVersion', 'cachePolicyVersion', 'transportMode', 'cacheStatus', 'inferenceStatus', 'durationMs',
  'repoAvailable', 'issueAvailable', 'apiAvailable', 'repoTextLength', 'issueTextLength', 'apiTokenCount',
  'verifiedChangedLines', 'userCommitCount', 'userPullRequestCount', 'relevantIssueCount', 'userCommentCount',
  'topRoleId', 'topRoleProbability', 'predictionCount', 'fingerprintPrefix', 'errorCode',
];
const buildInferenceEvent = (details = {}) => SAFE_FIELDS.reduce((event, field) => {
  if (details[field] !== undefined) event[field] = details[field];
  return event;
}, { event: 'dev2vec_inference' });
const incrementMetric = (name, labels = {}) => {
  const key = `${name}:${JSON.stringify(labels)}`;
  counters.set(key, (counters.get(key) || 0) + 1);
};
const recordInferenceEvent = (details = {}, { emit = true } = {}) => {
  const event = buildInferenceEvent(details);
  incrementMetric(details.inferenceStatus === 'failed' ? 'dev2vec_inference_failed_total' : 'dev2vec_inference_total');
  if (details.cacheStatus === 'exact_hit') incrementMetric('dev2vec_cache_hit_total');
  else incrementMetric('dev2vec_cache_miss_total', { status: details.cacheStatus || 'unknown' });
  ['repo', 'issue', 'api'].forEach((channel) => incrementMetric(
    details[`${channel}Available`] ? 'dev2vec_channel_available_total' : 'dev2vec_channel_missing_total', { channel },
  ));
  if (emit && ['true', '1'].includes(String(process.env.DEV2VEC_OBSERVABILITY_LOG || '').toLowerCase())) {
    console.log('[Dev2VecInference]', JSON.stringify(event));
  }
  return event;
};
const getMetricSnapshot = () => Object.fromEntries(counters);
const resetMetrics = () => counters.clear();

module.exports = { buildInferenceEvent, recordInferenceEvent, getMetricSnapshot, resetMetrics };
