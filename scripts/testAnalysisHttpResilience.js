const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const errorMiddleware = require('../src/middlewares/error.middleware');
const { runDev2VecInference } = require('../src/services/dev2vec/dev2vec.service');

const fixture = (name) => path.resolve(__dirname, `../test/fixtures/dev2vec-process/${name}.js`);
const input = { requestId: 'resilience-test', repoDocument: 'backend api', issueDocument: '', apiTokens: ['express'], topN: 1 };
const expectInferenceError = async (options, code, status) => assert.rejects(
  () => runDev2VecInference(input, options),
  (error) => error.errorCode === code && error.statusCode === status,
);
let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${passed}: ${name}`); };

const request = (server, route, method = 'GET', body) => new Promise((resolve, reject) => {
  const address = server.address();
  const req = http.request({ hostname: '127.0.0.1', port: address.port, path: route, method, headers: body === undefined ? {} : { 'content-type': 'application/json' } }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
  });
  req.on('error', reject);
  if (body !== undefined) req.write(body);
  req.end();
});

(async () => {
  const previousServiceUrl = process.env.DEV2VEC_SERVICE_URL;
  delete process.env.DEV2VEC_SERVICE_URL;
  await test('Missing Python executable becomes JSON-compatible 503 error', () => expectInferenceError({ pythonBin: 'definitely-missing-python-wdp', timeoutMs: 1000 }, 'DEV2VEC_PROCESS_UNAVAILABLE', 503));
  await test('Non-zero child exit becomes 502 process failure', () => expectInferenceError({ pythonBin: process.execPath, inferPath: fixture('exit-nonzero'), timeoutMs: 2000 }, 'DEV2VEC_PROCESS_FAILED', 502));
  await test('Child timeout is bounded and becomes 504', () => expectInferenceError({ pythonBin: process.execPath, inferPath: fixture('hang'), timeoutMs: 100 }, 'DEV2VEC_PROCESS_TIMEOUT', 504));
  await test('Malformed stdout becomes 502 JSON output error', () => expectInferenceError({ pythonBin: process.execPath, inferPath: fixture('invalid-json'), timeoutMs: 2000 }, 'DEV2VEC_INVALID_OUTPUT', 502));

  const app = express();
  app.use(express.json());
  app.post('/empty-safe', (req, res) => res.json({ success: true, view: req.query.view || 'summary', body: req.body || {} }));
  app.get('/controller-error', async (req, res, next) => { try { throw Object.assign(new Error('controlled'), { statusCode: 500, errorCode: 'CONTROLLED_TEST' }); } catch (error) { next(error); } });
  app.use(errorMiddleware);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  await test('Swagger-style empty POST body does not crash JSON parsing', async () => {
    const result = await request(server, '/empty-safe?view=summary', 'POST');
    assert.strictEqual(result.status, 200); assert.strictEqual(result.body.view, 'summary');
  });
  await test('Controller exception reaches error middleware as JSON', async () => {
    const result = await request(server, '/controller-error');
    assert.strictEqual(result.status, 500); assert.strictEqual(result.body.errorCode, 'CONTROLLED_TEST');
  });
  await new Promise((resolve) => server.close(resolve));
  await test('Nodemon ignores Dev2Vec tmp JSON files', () => {
    const config = require('../nodemon.json');
    assert(config.ignore.includes('tmp/**'));
  });
  if (previousServiceUrl) process.env.DEV2VEC_SERVICE_URL = previousServiceUrl;
  console.log(`PASS: analysis HTTP/process resilience (${passed} checks)`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
