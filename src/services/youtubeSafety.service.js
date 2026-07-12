const decodeHtmlEntities = (value = '') => String(value || '')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'");

const normalizeText = (value = '') => decodeHtmlEntities(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^\w\s+.-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const BLOCKED_PHRASES = {
  sexual: [
    'porn',
    'pornography',
    'xxx',
    'nude',
    'nudity',
    'sex video',
    'hentai',
    '18+',
    'adult content',
  ],
  violence_danger: [
    'gore',
    'graphic violence',
    'kill yourself',
    'suicide method',
    'self harm method',
    'bomb tutorial',
    'weapon tutorial',
  ],
  scam_phishing: [
    'free money',
    'guaranteed income',
    'crypto giveaway',
    'send bitcoin',
    'phishing',
    'steal password',
    'steal token',
    'account hack',
    'bypass payment',
    'crack account',
  ],
  malware: [
    'malware download',
    'ransomware',
    'credential stealer',
    'token grabber',
    'keylogger',
    'virus download',
    'remote access trojan',
  ],
  extremism_hate: [
    'extremist propaganda',
    'terrorist recruitment',
    'racial supremacy',
    'hate propaganda',
  ],
};

const parseCsvEnv = (value = '') => String(value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const hasBlockedPhrase = (text, phrase) => {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i').test(text);
};

const checkYouTubeSafety = ({ title = '', description = '', channelTitle = '', channelId = '' } = {}) => {
  const blockedChannelIds = new Set(parseCsvEnv(process.env.YOUTUBE_BLOCKED_CHANNEL_IDS));
  const trustedChannelIds = new Set(parseCsvEnv(process.env.YOUTUBE_TRUSTED_CHANNEL_IDS));
  const reasons = [];

  if (channelId && blockedChannelIds.has(channelId)) {
    reasons.push('blocked_channel_id');
  }

  const text = normalizeText([title, description, channelTitle].filter(Boolean).join(' '));
  for (const [category, phrases] of Object.entries(BLOCKED_PHRASES)) {
    for (const phrase of phrases) {
      if (hasBlockedPhrase(text, phrase)) {
        reasons.push(`${category}:${phrase}`);
      }
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    trustedChannel: Boolean(channelId && trustedChannelIds.has(channelId)),
  };
};

module.exports = {
  BLOCKED_PHRASES,
  checkYouTubeSafety,
  normalizeText,
};
