const isTimingEnabled = () => (
  process.env.DEV2VEC_TIMING_DEBUG === 'true'
  || process.env.DEV2VEC_TIMING_DEBUG === '1'
);

const nowMs = () => Number(process.hrtime.bigint() / 1000000n);

const createDev2VecTimer = ({ repoId, analysisId, requestId } = {}) => {
  const start = nowMs();
  const phases = {};

  const measure = async (name, fn) => {
    const phaseStart = nowMs();
    try {
      return await fn();
    } finally {
      phases[name] = (phases[name] || 0) + nowMs() - phaseStart;
    }
  };

  const mark = (name, durationMs) => {
    phases[name] = (phases[name] || 0) + Number(durationMs || 0);
  };

  const log = (extra = {}) => {
    if (!isTimingEnabled()) return;
    console.log('[Dev2VecTiming]', {
      repoId: repoId ? String(repoId) : undefined,
      analysisId: analysisId ? String(analysisId) : undefined,
      requestId: requestId ? String(requestId).slice(0, 120) : undefined,
      ...phases,
      ...extra,
      totalMs: nowMs() - start,
    });
  };

  return { measure, mark, log, phases };
};

module.exports = {
  createDev2VecTimer,
  isTimingEnabled,
  nowMs,
};
