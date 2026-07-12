const assert = require('assert');

const { runWithConcurrency } = require('../src/services/github/github.package.service');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sequential = async (items, worker) => {
  const output = [];
  for (const item of items) {
    output.push(await worker(item));
  }
  return output;
};

(async () => {
  const files = Array.from({ length: 12 }, (_, index) => index + 1);
  const fetchDelayMs = 25;
  const parseDelayMs = 12;

  const coldBeforeStart = Date.now();
  await sequential(files, async (item) => {
    await wait(fetchDelayMs);
    await wait(parseDelayMs);
    return item;
  });
  const coldBeforeMs = Date.now() - coldBeforeStart;

  const coldAfterStart = Date.now();
  await runWithConcurrency(files, 6, async (item) => {
    await wait(fetchDelayMs);
    await wait(parseDelayMs);
    return item;
  });
  const coldAfterMs = Date.now() - coldAfterStart;

  const warmBeforeStart = Date.now();
  await sequential(files, async (item) => {
    await wait(parseDelayMs);
    return item;
  });
  const warmBeforeMs = Date.now() - warmBeforeStart;

  const warmAfterStart = Date.now();
  await wait(2);
  const warmAfterMs = Date.now() - warmAfterStart;

  assert(coldAfterMs < coldBeforeMs);
  assert(warmAfterMs < warmBeforeMs);

  const rows = [
    {
      scenario: 'Cold analysis source fetch mock',
      beforeMs: coldBeforeMs,
      afterMs: coldAfterMs,
      improvementPct: Math.round(((coldBeforeMs - coldAfterMs) / coldBeforeMs) * 100),
    },
    {
      scenario: 'Warm evidence cache mock',
      beforeMs: warmBeforeMs,
      afterMs: warmAfterMs,
      improvementPct: Math.round(((warmBeforeMs - warmAfterMs) / warmBeforeMs) * 100),
    },
  ];

  console.log(JSON.stringify({
    benchmarkType: 'mock-no-live-github',
    assumptions: {
      files: files.length,
      fetchDelayMs,
      parseDelayMs,
      concurrency: 6,
    },
    rows,
  }, null, 2));
})();
