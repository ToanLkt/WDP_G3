const DEFAULT_FRONTEND_ORIGINS = [
  'https://web-project-seven-rust.vercel.app',
  'http://localhost:5173',
];

const parseHttpUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch (error) {
    return null;
  }
};

const normalizeUrl = (value) => {
  try {
    return new URL(String(value || '').trim()).toString();
  } catch (error) {
    return null;
  }
};

const getMobileRedirectUrl = () =>
  normalizeUrl(process.env.MOBILE_REDIRECT_URL);

const getMobileAuthRedirectUrl = () =>
  normalizeUrl(process.env.MOBILE_AUTH_REDIRECT_URL);

const getGithubAuthRedirectUrlConfig = () =>
  normalizeUrl(process.env.GITHUB_AUTH_REDIRECT_URL);

const isValidMobileRedirect = (candidateUrl) => {
  try {
    const url = new URL(candidateUrl);
    if (['http:', 'https:'].includes(url.protocol)) {
      return false;
    }
    
    if (url.protocol === 'exp:') {
      return true;
    }

    const authUrl = getMobileAuthRedirectUrl();
    if (authUrl && url.protocol === new URL(authUrl).protocol) {
      return true;
    }
    
    const connectUrl = getMobileRedirectUrl();
    if (connectUrl && url.protocol === new URL(connectUrl).protocol) {
      return true;
    }

    return false;
  } catch (err) {
    return false;
  }
};

const getAllowedFrontendOrigins = () => {
  const configuredUrls = [
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    ...(process.env.FRONTEND_URLS || '').split(','),
  ];

  return [
    ...new Set(
      [...configuredUrls, ...DEFAULT_FRONTEND_ORIGINS]
        .map(parseHttpUrl)
        .filter(Boolean)
        .map((url) => url.origin)
    ),
  ];
};

const getFrontendPathUrl = (path, exactRedirectUrl, ...candidates) => {
  const allowedOrigins = getAllowedFrontendOrigins();

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeUrl(candidate);
    if (!normalizedCandidate) continue;

    if (exactRedirectUrl && normalizedCandidate === exactRedirectUrl) {
      return exactRedirectUrl;
    }

    if (isValidMobileRedirect(normalizedCandidate)) {
      return normalizedCandidate;
    }

    const url = parseHttpUrl(candidate);
    if (!url || !allowedOrigins.includes(url.origin)) continue;

    return `${url.origin}${path}`;
  }

  return allowedOrigins[0]
    ? `${allowedOrigins[0]}${path}`
    : null;
};

const getGithubConnectUrl = (...candidates) => {
  return getFrontendPathUrl('/github/connect', getMobileRedirectUrl(), ...candidates);
};

const getGithubAuthRedirectUrl = (...candidates) => {
  const mobileAuthRedirectUrl = getMobileAuthRedirectUrl();
  const webAuthRedirectUrl = getGithubAuthRedirectUrlConfig();
  const allowedOrigins = getAllowedFrontendOrigins();

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeUrl(candidate);
    if (!normalizedCandidate) continue;

    if (mobileAuthRedirectUrl && normalizedCandidate === mobileAuthRedirectUrl) {
      return mobileAuthRedirectUrl;
    }

    if (webAuthRedirectUrl && normalizedCandidate === webAuthRedirectUrl) {
      return webAuthRedirectUrl;
    }

    if (isValidMobileRedirect(normalizedCandidate)) {
      return normalizedCandidate;
    }

    const url = parseHttpUrl(candidate);
    if (url && allowedOrigins.includes(url.origin)) {
      return `${url.origin}/auth/github/callback`;
    }
  }

  return webAuthRedirectUrl || getFrontendPathUrl('/auth/github/callback', null);
};

module.exports = {
  DEFAULT_FRONTEND_ORIGINS,
  getAllowedFrontendOrigins,
  getGithubAuthRedirectUrl,
  getGithubConnectUrl,
  getMobileAuthRedirectUrl,
  getMobileRedirectUrl,
};
