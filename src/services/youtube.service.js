const axios = require('axios');

const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

const isLikelyShort = (title = '', url = '') => {
  const normalizedTitle = String(title).toLowerCase();
  const normalizedUrl = String(url).toLowerCase();
  return normalizedTitle.includes('#shorts') || normalizedTitle.includes(' shorts') || normalizedUrl.includes('/shorts/');
};

const calculateYouTubeVideoScore = ({ title, channelTitle, skillName, level }) => {
  const normalizedTitle = String(title || '').toLowerCase();
  const normalizedChannel = String(channelTitle || '').toLowerCase();
  const normalizedSkill = String(skillName || '').toLowerCase();
  const normalizedLevel = String(level || '').toLowerCase();
  let score = 0;
  const hasSkill = normalizedSkill && normalizedTitle.includes(normalizedSkill);

  if (hasSkill) {
    score += 40;
  } else {
    score -= 30;
  }

  const strongLearningKeywords = ['tutorial', 'course', 'crash course', 'full course', 'learn'];
  if (strongLearningKeywords.some((keyword) => normalizedTitle.includes(keyword))) {
    score += 20;
  }

  const beginnerKeywords = ['beginner', 'beginners', 'basic', 'basics', 'introduction', 'intro'];
  if (normalizedLevel === 'beginner' && beginnerKeywords.some((keyword) => normalizedTitle.includes(keyword))) {
    score += 15;
  }

  const usefulKeywords = ['explained', 'guide', 'project', 'practical', 'hands-on'];
  if (usefulKeywords.some((keyword) => normalizedTitle.includes(keyword))) {
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
  if (!hasSkill && genericBadKeywords.some((keyword) => normalizedTitle.includes(keyword))) {
    score -= 20;
  }

  return score;
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

  return (response.data?.items || [])
    .map((item) => {
      const videoId = item.id?.videoId;
      const title = item.snippet?.title || '';
      const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';

      return {
        videoId,
        title,
        url,
        provider: 'YouTube',
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          item.snippet?.thumbnails?.high?.url ||
          '',
        channelTitle: item.snippet?.channelTitle || '',
        publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : undefined,
      };
    })
    .filter((video) => video.videoId && video.title && video.url && !isLikelyShort(video.title, video.url))
    .map((video) => ({
      ...video,
      score: calculateYouTubeVideoScore({
        title: video.title,
        channelTitle: video.channelTitle,
        skillName,
        level,
      }),
    }))
    .filter((video) => video.score >= 40)
    .sort((a, b) => b.score - a.score);
};

module.exports = {
  calculateYouTubeVideoScore,
  searchYoutubeVideos,
};
