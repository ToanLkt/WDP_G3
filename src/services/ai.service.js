const axios = require('axios');

const { apiMessages } = require('../utils/constants');
const { createStatusError } = require('./github/github.utils');

const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

const getFallbackChatResponse = () =>
  'Dua tren GitHub context hien co, minh co the ho tro ban phan tich dinh huong nghe nghiep, ky nang manh/yeu va lo trinh hoc tiep theo. Tuy nhien hien tai he thong chua goi duoc LLM hoac thieu API key, nen day la phan hoi demo. Hay kiem tra LLM_API_KEY va cau hinh Gemini trong .env.';

const buildReadyPayload = () => ({
  message: apiMessages.ready,
  data: null,
});

const analyzeWithAi = async () => buildReadyPayload();

const normalizeGeminiModel = (model) => String(model || '').trim().replace(/^models\//, '');

const getGeminiConfig = () => ({
  provider: process.env.LLM_PROVIDER || 'gemini',
  apiKey: process.env.LLM_API_KEY,
  model: normalizeGeminiModel(process.env.LLM_MODEL || 'gemini-2.0-flash'),
  baseUrl: process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
});

const buildGeminiEndpoint = ({ baseUrl, model, apiKey }) =>
  `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

const buildGeminiBody = (prompt, options = {}) => {
  const generationConfig = {
    temperature: options.temperature ?? 0.4,
  };

  if (options.responseMimeType) {
    generationConfig.responseMimeType = options.responseMimeType;
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
  const text =
    responseData?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text)
      ?.filter(Boolean)
      ?.join('\n') || '';

  return text.trim();
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

const logGeminiFailure = (error, { model, provider }) => {
  console.error('Gemini API failed:', {
    status: error.response?.status,
    message: error.message,
    data: error.response?.data,
    model,
    provider,
  });
};

const shouldRetryWithoutResponseMimeType = (error) => {
  const status = error?.response?.status;
  const message = getGeminiErrorMessage(error).toLowerCase();

  return status === 400 && (message.includes('responsemimetype') || message.includes('response mime type'));
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
  const models = [normalizeGeminiModel(primaryModel), ...FALLBACK_MODELS].filter(Boolean);
  return [...new Set(models)];
};

const buildGeminiError = ({ lastError, attemptedModels }) => {
  const error = createStatusError('Failed to generate content from Gemini', 500);
  error.llmError = {
    status: lastError?.response?.status || lastError?.statusCode || 500,
    upstreamMessage: getGeminiErrorMessage(lastError),
    attemptedModels,
  };
  return error;
};

const callGemini = async (prompt, options = {}) => {
  const config = getGeminiConfig();

  if (config.provider !== 'gemini') {
    console.error('Unsupported LLM_PROVIDER:', config.provider);
    throw createStatusError('Unsupported LLM provider', 500);
  }

  if (!config.apiKey) {
    console.error('Missing LLM_API_KEY');
    throw createStatusError('LLM_API_KEY is not configured', 500);
  }

  if (!config.baseUrl || !config.model) {
    console.error('Missing Gemini environment variables');
    throw createStatusError('Gemini environment variables are not configured', 500);
  }

  const modelsToTry = options.tryFallbackModels === false ? [config.model] : buildModelCandidates(config.model);
  const attemptedModels = [];
  let lastError = null;

  for (const currentModel of modelsToTry) {
    attemptedModels.push(currentModel);
    const endpoint = buildGeminiEndpoint({
      baseUrl: config.baseUrl,
      model: currentModel,
      apiKey: config.apiKey,
    });

    try {
      let response;

      try {
        response = await axios.post(endpoint, buildGeminiBody(prompt, options), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        if (!options.responseMimeType || !shouldRetryWithoutResponseMimeType(error)) {
          throw error;
        }

        response = await axios.post(
          endpoint,
          buildGeminiBody(prompt, { ...options, responseMimeType: undefined }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      const text = extractGeminiText(response.data);

      if (!text) {
        throw createStatusError('Gemini returned empty response', 500);
      }

      return {
        content: text,
        text,
        provider: config.provider,
        model: currentModel,
        attemptedModels,
        usedFallback: false,
      };
    } catch (error) {
      lastError = error;
      logGeminiFailure(error, { model: currentModel, provider: config.provider });

      if (shouldTryNextModel(error) && currentModel !== modelsToTry[modelsToTry.length - 1]) {
        continue;
      }

      break;
    }
  }

  if (lastError?.statusCode && !lastError?.response) {
    throw lastError;
  }

  throw buildGeminiError({ lastError, attemptedModels });
};

const generateGeminiContent = async (prompt, options = {}) => {
  try {
    const result = await callGemini(prompt, options);
    return result.text;
  } catch (error) {
    return null;
  }
};

const generateTextWithGemini = (prompt, options = {}) => callGemini(prompt, options);

const generateJsonWithGemini = (prompt, options = {}) =>
  callGemini(prompt, {
    ...options,
    temperature: options.temperature ?? 0.4,
    responseMimeType: options.responseMimeType || 'application/json',
  });

const generateChatResponse = async (prompt) => {
  const result = await generateChatResult(prompt);
  return result.text;
};

const generateChatResult = async (prompt) => {
  try {
    const result = await generateTextWithGemini(prompt);
    return {
      text: result.text,
      provider: result.provider,
      model: result.model,
      usedFallback: false,
    };
  } catch (error) {
    const config = getGeminiConfig();
    return {
      text: getFallbackChatResponse(),
      provider: config.provider,
      model: config.model,
      usedFallback: true,
      error: error.llmError || null,
    };
  }
};

const generateRoadmapResponse = async (prompt) => {
  const result = await generateGeminiContent(prompt, {
    temperature: 0.4,
    responseMimeType: 'application/json',
  });

  return result;
};

const getAiConfigHealth = () => {
  const config = getGeminiConfig();

  return {
    message: 'AI config checked successfully',
    data: {
      provider: config.provider,
      model: config.model,
      baseUrlConfigured: Boolean(config.baseUrl),
      apiKeyConfigured: Boolean(config.apiKey),
    },
    statusCode: 200,
  };
};

module.exports = {
  analyzeWithAi,
  callGemini,
  generateGeminiContent,
  generateJsonWithGemini,
  generateTextWithGemini,
  generateChatResponse,
  generateChatResult,
  generateRoadmapResponse,
  getAiConfigHealth,
  getFallbackChatResponse,
};
