const DEFAULT_FRONTEND_URLS = [
  'https://web-project-seven-rust.vercel.app',
  'http://localhost:5173',
];

const normalizeFrontendUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.origin;
  } catch (error) {
    return null;
  }
};

const getAllowedFrontendUrls = () => {
  const configuredUrls = [
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    ...(process.env.FRONTEND_URLS || '').split(','),
  ];

  return [
    ...new Set(
      [...configuredUrls, ...DEFAULT_FRONTEND_URLS]
        .map(normalizeFrontendUrl)
        .filter(Boolean)
    ),
  ];
};

const getFrontendRedirectUrl = (...candidates) => {
  const allowedUrls = getAllowedFrontendUrls();

  for (const candidate of candidates) {
    const normalizedUrl = normalizeFrontendUrl(candidate);
    if (normalizedUrl && allowedUrls.includes(normalizedUrl)) {
      return normalizedUrl;
    }
  }

  return normalizeFrontendUrl(process.env.FRONTEND_URL) || allowedUrls[0];
};

module.exports = {
  getAllowedFrontendUrls,
  getFrontendRedirectUrl,
};
