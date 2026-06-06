const axios = require('axios');

const { createStatusError } = require('../github/github.utils');

const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

const buildGeminiUrl = ({ baseUrl, model }) => `${baseUrl}/models/${model}:generateContent`;

const buildRequestBody = (prompt, includeResponseMimeType = true) => {
  const generationConfig = {
    temperature: 0.3,
  };

  if (includeResponseMimeType) {
    generationConfig.responseMimeType = 'application/json';
  }

  return {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig,
  };
};

const extractGeminiText = (responseData) => {
  const candidate = responseData?.candidates?.[0];

  return (candidate?.content?.parts || [])
    .map((part) => part?.text || '')
    .join('')
    .trim();
};

const getGeminiErrorMessage = (error) => {
  const responseData = error?.response?.data;

  if (typeof responseData === 'string' && responseData.trim()) {
    return responseData.trim();
  }

  if (responseData?.error?.message) {
    return String(responseData.error.message).trim();
  }

  if (responseData?.message) {
    return String(responseData.message).trim();
  }

  return String(error?.message || '').trim();
};

const shouldRetryWithoutResponseMimeType = (error) => {
  const status = error?.response?.status;
  const message = getGeminiErrorMessage(error).toLowerCase();

  if (status !== 400) {
    return false;
  }

  return message.includes('responsemimetype') || message.includes('response mime type');
};

const shouldTryNextModel = (error) => {
  const status = error?.response?.status;
  const message = getGeminiErrorMessage(error).toLowerCase();

  if (status === 404) {
    return true;
  }

  if (status !== 400) {
    return false;
  }

  return (
    message.includes('not found') ||
    message.includes('not supported') ||
    message.includes('unsupported') ||
    message.includes('deprecated') ||
    message.includes('unknown model') ||
    message.includes('unexpected model')
  );
};

const buildModelCandidates = (primaryModel) => {
  const models = [primaryModel, ...FALLBACK_MODELS].filter(Boolean);
  return [...new Set(models)];
};

const buildGeminiRequestConfig = (apiKey) => ({
  headers: {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  },
});

const callGemini = async (prompt) => {
  const provider = process.env.LLM_PROVIDER || 'gemini';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gemini-1.5-flash';
  const baseUrl = process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

  if (!apiKey) {
    throw createStatusError('LLM_API_KEY is not configured', 500);
  }

  if (provider !== 'gemini') {
    throw createStatusError('Unsupported LLM provider', 500);
  }

  const modelsToTry = buildModelCandidates(model);
  const attemptedModels = [];
  let lastError = null;

  for (const currentModel of modelsToTry) {
    const url = buildGeminiUrl({ baseUrl, model: currentModel });
    attemptedModels.push(currentModel);

    try {
      let response;

      try {
        response = await axios.post(url, buildRequestBody(prompt, true), buildGeminiRequestConfig(apiKey));
      } catch (error) {
        if (!shouldRetryWithoutResponseMimeType(error)) {
          throw error;
        }

        response = await axios.post(url, buildRequestBody(prompt, false), buildGeminiRequestConfig(apiKey));
      }

      const text = extractGeminiText(response?.data);

      if (!text) {
        throw createStatusError('Empty response from Gemini', 500);
      }

      return {
        content: text,
        model: currentModel,
        attemptedModels,
      };
    } catch (error) {
      lastError = error;

      if (shouldTryNextModel(error) && currentModel !== modelsToTry[modelsToTry.length - 1]) {
        continue;
      }

      break;
    }
  }

  if (lastError?.statusCode && !lastError?.response) {
    throw lastError;
  }

  const error = createStatusError('Failed to generate AI feedback from Gemini', 500);
  error.llmError = {
    status: lastError?.response?.status || lastError?.statusCode || 500,
    upstreamMessage: getGeminiErrorMessage(lastError),
    attemptedModels,
  };
  throw error;
};

module.exports = {
  callGemini,
};
