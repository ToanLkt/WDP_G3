const axios = require('axios');

const { apiMessages } = require('../utils/constants');

const getFallbackChatResponse = () =>
  'Dua tren GitHub context hien co, minh co the ho tro ban phan tich dinh huong nghe nghiep, ky nang manh/yeu va lo trinh hoc tiep theo. Tuy nhien hien tai he thong chua goi duoc LLM hoac thieu API key, nen day la phan hoi demo. Hay kiem tra LLM_API_KEY va cau hinh Gemini trong .env.';

const buildReadyPayload = () => ({
  message: apiMessages.ready,
  data: null,
});

const analyzeWithAi = async () => buildReadyPayload();

const generateGeminiContent = async (prompt, options = {}) => {
  const provider = process.env.LLM_PROVIDER || 'gemini';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gemini-2.0-flash';
  const baseUrl = process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

  if (!apiKey || provider !== 'gemini') {
    return null;
  }

  try {
    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    };

    if (options.responseMimeType) {
      body.generationConfig = {
        temperature: options.temperature ?? 0.4,
        responseMimeType: options.responseMimeType,
      };
    } else if (options.temperature !== undefined) {
      body.generationConfig = {
        temperature: options.temperature,
      };
    }

    const response = await axios.post(url, body);
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || null;
  } catch (error) {
    console.error('Gemini generate content error:', error.response?.data || error.message);
    return null;
  }
};

const generateChatResponse = async (prompt) => {
  const text = await generateGeminiContent(prompt);
  return text || getFallbackChatResponse();
};

const generateRoadmapResponse = async (prompt) => {
  return generateGeminiContent(prompt, {
    temperature: 0.4,
    responseMimeType: 'application/json',
  });
};

module.exports = {
  analyzeWithAi,
  generateGeminiContent,
  generateChatResponse,
  generateRoadmapResponse,
  getFallbackChatResponse,
};
