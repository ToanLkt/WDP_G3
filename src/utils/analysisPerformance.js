const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const storage = new AsyncLocalStorage();
const enabled = () => ['true', '1'].includes(String(process.env.ANALYSIS_TIMING_DEBUG || process.env.DEV2VEC_TIMING_DEBUG));

const createState = (requestId) => ({
  requestId: String(requestId || crypto.randomUUID()).slice(0, 120),
  githubCalls: {},
  githubDurationMs: {},
  cache: { hits: 0, misses: 0 },
});

const runWithAnalysisPerformance = (requestId, fn) => storage.run(createState(requestId), fn);

const recordGithubCall = (type, durationMs = 0) => {
  const state = storage.getStore();
  if (!state) return;
  const key = String(type || 'unknown').slice(0, 60);
  state.githubCalls[key] = (state.githubCalls[key] || 0) + 1;
  state.githubDurationMs[key] = (state.githubDurationMs[key] || 0) + Number(durationMs || 0);
};

const recordCache = (hit) => {
  const state = storage.getStore();
  if (!state) return;
  state.cache[hit ? 'hits' : 'misses'] += 1;
};

const getAnalysisPerformance = () => storage.getStore() || createState('unscoped');

const logAnalysisPerformance = (payload = {}) => {
  if (!enabled()) return;
  const state = getAnalysisPerformance();
  console.log('[AnalysisPerformance]', JSON.stringify({
    event: 'repository_analysis_completed',
    requestId: state.requestId,
    githubCalls: state.githubCalls,
    githubDurationMs: state.githubDurationMs,
    cache: state.cache,
    ...payload,
  }));
};

module.exports = {
  enabled,
  getAnalysisPerformance,
  logAnalysisPerformance,
  recordCache,
  recordGithubCall,
  runWithAnalysisPerformance,
};
