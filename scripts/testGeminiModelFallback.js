const assert = require('assert');
const axios = require('axios');
const { callGemini } = require('../src/services/ai.service');

const originalPost = axios.post;
const originalEnv = {
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_MODEL: process.env.LLM_MODEL,
  LLM_FALLBACK_MODELS: process.env.LLM_FALLBACK_MODELS,
};

(async () => {
  process.env.LLM_PROVIDER = 'gemini';
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_MODEL = 'gemini-2.5-flash';
  process.env.LLM_FALLBACK_MODELS = 'gemini-3.6-flash';
  const attempted = [];
  axios.post = async (url) => {
    attempted.push(url);
    if (url.includes('gemini-2.5-flash')) {
      const error = new Error('Request failed with status code 404');
      error.response = { status: 404, data: { error: { message: 'model is no longer available' } } };
      throw error;
    }
    return { data: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } };
  };
  const result = await callGemini('test');
  assert.deepStrictEqual(result.attemptedModels, ['gemini-2.5-flash', 'gemini-3.6-flash']);
  assert.strictEqual(result.model, 'gemini-3.6-flash');
  assert.strictEqual(result.usedFallback, true);
  assert.strictEqual(result.text, 'ok');
  console.log('PASS: Gemini 404 switches to configured fallback model');
})().finally(() => {
  axios.post = originalPost;
  Object.entries(originalEnv).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
