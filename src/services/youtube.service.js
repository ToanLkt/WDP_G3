const axios = require('axios');
const { checkYouTubeSafety, normalizeText } = require('./youtubeSafety.service');

const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getMinDurationSeconds = () => parsePositiveInteger(process.env.YOUTUBE_VIDEO_MIN_DURATION_SECONDS, 180);
const getMaxDurationSeconds = () => parsePositiveInteger(process.env.YOUTUBE_VIDEO_MAX_DURATION_SECONDS, 14400);
const allowLive = () => process.env.YOUTUBE_ALLOW_LIVE === 'true' || process.env.YOUTUBE_ALLOW_LIVE === '1';
const allowShorts = () => process.env.YOUTUBE_ALLOW_SHORTS === 'true' || process.env.YOUTUBE_ALLOW_SHORTS === '1';

const isLikelyShort = (title = '', url = '') => {
  const normalizedTitle = String(title).toLowerCase();
  const normalizedUrl = String(url).toLowerCase();
  return normalizedTitle.includes('#shorts') || normalizedTitle.includes(' shorts') || normalizedUrl.includes('/shorts/');
};

const parseIso8601DurationSeconds = (duration = '') => {
  const match = String(duration || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  return (Number(days || 0) * 86400)
    + (Number(hours || 0) * 3600)
    + (Number(minutes || 0) * 60)
    + Number(seconds || 0);
};

const calculateYouTubeVideoScore = ({ title, description = '', channelTitle, skillName, level }) => {
  const normalizedTitle = String(title || '').toLowerCase();
  const normalizedDescription = String(description || '').toLowerCase();
  const normalizedChannel = String(channelTitle || '').toLowerCase();
  const normalizedSkill = normalizeText(skillName || '');
  const normalizedLevel = String(level || '').toLowerCase();
  let score = 0;
  const normalizedContent = normalizeText(`${normalizedTitle} ${normalizedDescription}`);
  const hasSkill = normalizedSkill && normalizedContent.includes(normalizedSkill);

  if (hasSkill) {
    score += 40;
  } else {
    score -= 30;
  }

  const strongLearningKeywords = ['tutorial', 'course', 'crash course', 'full course', 'learn'];
  if (strongLearningKeywords.some((keyword) => normalizedTitle.includes(keyword) || normalizedDescription.includes(keyword))) {
    score += 20;
  }

  const beginnerKeywords = ['beginner', 'beginners', 'basic', 'basics', 'introduction', 'intro'];
  if (normalizedLevel === 'beginner' && beginnerKeywords.some((keyword) => normalizedTitle.includes(keyword) || normalizedDescription.includes(keyword))) {
    score += 15;
  }

  const usefulKeywords = ['explained', 'guide', 'project', 'practical', 'hands-on'];
  if (usefulKeywords.some((keyword) => normalizedTitle.includes(keyword) || normalizedDescription.includes(keyword))) {
    score += 10;
  }

  const trustedLearningChannels = [
    'freecodecamp',
    'programming with mosh',
    'traversy media',
    'the net ninja',
    'fireship',
    'bytebytego',
    'bro code',
    'web dev simplified',
  ];
  if (trustedLearningChannels.some((channel) => normalizedChannel.includes(channel))) {
    score += 10;
  }

  const genericBadKeywords = ['roadmap', 'plan', 'become a developer', 'career', 'full stack developer'];
  if (!hasSkill && genericBadKeywords.some((keyword) => normalizedTitle.includes(keyword) || normalizedDescription.includes(keyword))) {
    score -= 20;
  }

  return score;
};

const fetchYouTubeVideoDetails = async (videoIds = []) => {
  const ids = [...new Set(videoIds.filter(Boolean))];
  if (!ids.length) return [];
  const response = await axios.get(YOUTUBE_VIDEOS_URL, {
    params: {
      part: 'snippet,contentDetails,status',
      id: ids.join(','),
      key: process.env.YOUTUBE_API_KEY,
    },
  });
  return response.data?.items || [];
};

const mapVideoDetail = (item = {}) => {
  const snippet = item.snippet || {};
  const status = item.status || {};
  const durationSeconds = parseIso8601DurationSeconds(item.contentDetails?.duration);
  return {
    videoId: item.id || '',
    title: snippet.title || '',
    description: snippet.description || '',
    url: item.id ? `https://www.youtube.com/watch?v=${item.id}` : '',
    provider: 'YouTube',
    thumbnailUrl:
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url ||
      snippet.thumbnails?.high?.url ||
      '',
    channelId: snippet.channelId || '',
    channelTitle: snippet.channelTitle || '',
    publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : undefined,
    liveBroadcastContent: snippet.liveBroadcastContent || '',
    durationSeconds,
    privacyStatus: status.privacyStatus || '',
    embeddable: status.embeddable !== false,
    madeForKids: status.madeForKids,
  };
};

const validateYouTubeVideoMetadata = (video = {}) => {
  const reasons = [];
  if (!video.videoId) reasons.push('missing_video_id');
  if (!video.title) reasons.push('missing_title');
  if (video.privacyStatus !== 'public') reasons.push('not_public');
  if (video.embeddable === false) reasons.push('not_embeddable');
  if (!allowLive() && ['live', 'upcoming'].includes(String(video.liveBroadcastContent || '').toLowerCase())) {
    reasons.push(`live_${video.liveBroadcastContent}`);
  }
  if (!Number.isFinite(Number(video.durationSeconds)) || Number(video.durationSeconds) <= 0) {
    reasons.push('invalid_duration');
  } else {
    const duration = Number(video.durationSeconds);
    if (!allowShorts() && duration < getMinDurationSeconds()) reasons.push('duration_too_short');
    if (duration > getMaxDurationSeconds()) reasons.push('duration_too_long');
  }
  if (!allowShorts() && isLikelyShort(video.title, video.url)) reasons.push('likely_shorts');
  return {
    valid: reasons.length === 0,
    reasons,
  };
};

const searchYoutubeVideos = async ({ skillName, targetRole, level, language = 'en' }) => {
  if (!process.env.YOUTUBE_API_KEY) {
    const error = new Error('YOUTUBE_API_KEY is not configured');
    error.statusCode = 500;
    throw error;
  }

  const query = `${skillName} tutorial for ${targetRole} ${level}`;
  const response = await axios.get(YOUTUBE_SEARCH_URL, {
    params: {
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: 4,
      key: process.env.YOUTUBE_API_KEY,
      relevanceLanguage: language,
    },
  });

  const videoIds = (response.data?.items || [])
    .map((item) => item.id?.videoId)
    .filter(Boolean);
  const details = await fetchYouTubeVideoDetails(videoIds);
  return details
    .map(mapVideoDetail)
    .filter((video) => validateYouTubeVideoMetadata(video).valid)
    .filter((video) => checkYouTubeSafety(video).allowed)
    .map((video) => ({
      ...video,
      score: calculateYouTubeVideoScore({
        title: video.title,
        description: video.description,
        channelTitle: video.channelTitle,
        skillName,
        level,
      }),
      safetyStatus: 'allowed',
      safetyReasons: [],
      validatedAt: new Date(),
    }))
    .filter((video) => video.score >= 40)
    .sort((a, b) => b.score - a.score);
};

module.exports = {
  calculateYouTubeVideoScore,
  fetchYouTubeVideoDetails,
  isLikelyShort,
  mapVideoDetail,
  parseIso8601DurationSeconds,
  searchYoutubeVideos,
  validateYouTubeVideoMetadata,
};
