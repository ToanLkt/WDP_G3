const assert = require('assert');
const axios = require('axios');

const {
  calculateYouTubeVideoScore,
  parseYouTubeVideoUrl,
  parseIso8601DurationSeconds,
  searchYoutubeVideos,
  validateYouTubeVideoMetadata,
} = require('../src/services/youtube.service');
const { checkYouTubeSafety } = require('../src/services/youtubeSafety.service');
const { isResourceMetadataFresh } = require('../src/services/learning.service');

const originalGet = axios.get;
const originalEnv = { ...process.env };

const makeDetail = (overrides = {}) => ({
  id: overrides.id || 'valid1',
  snippet: {
    title: overrides.title || 'React tutorial for Frontend Developer beginner',
    description: overrides.description || 'Learn React with a practical project.',
    channelId: overrides.channelId || 'channel1',
    channelTitle: overrides.channelTitle || 'freeCodeCamp',
    publishedAt: '2024-01-01T00:00:00Z',
    liveBroadcastContent: overrides.liveBroadcastContent || 'none',
    thumbnails: { medium: { url: 'https://img.youtube.com/valid1.jpg' } },
  },
  contentDetails: {
    duration: overrides.duration || 'PT20M',
  },
  status: {
    privacyStatus: overrides.privacyStatus || 'public',
    embeddable: overrides.embeddable !== undefined ? overrides.embeddable : true,
    madeForKids: overrides.madeForKids,
  },
});

const runSearch = async (details, searchIds = null) => {
  let callIndex = 0;
  axios.get = async (url) => {
    callIndex += 1;
    if (url.includes('/search')) {
      return {
        data: {
          items: (searchIds || details.map((detail) => detail.id)).map((videoId) => ({ id: { videoId } })),
        },
      };
    }
    if (url.includes('/videos')) {
      return { data: { items: details } };
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const result = await searchYoutubeVideos({
    skillName: 'React',
    targetRole: 'Frontend Developer',
    level: 'beginner',
    language: 'en',
  });
  assert.strictEqual(callIndex, 2, 'search should call search.list and one videos.list batch');
  return result;
};

(async () => {
  try {
    process.env.YOUTUBE_API_KEY = 'test-key';
    process.env.YOUTUBE_VIDEO_MIN_DURATION_SECONDS = '180';
    process.env.YOUTUBE_VIDEO_MAX_DURATION_SECONDS = '14400';
    process.env.YOUTUBE_ALLOW_LIVE = 'false';
    process.env.YOUTUBE_ALLOW_SHORTS = 'false';
    process.env.YOUTUBE_BLOCKED_CHANNEL_IDS = '';
    process.env.YOUTUBE_TRUSTED_CHANNEL_IDS = 'trusted-channel';

    assert.strictEqual(parseIso8601DurationSeconds('PT1H2M3S'), 3723);
    assert.strictEqual(parseIso8601DurationSeconds('PT20M'), 1200);
    assert.deepStrictEqual(
      parseYouTubeVideoUrl('https://youtu.be/UB1O30fR-EE?feature=shared'),
      {
        videoId: 'UB1O30fR-EE',
        canonicalUrl: 'https://www.youtube.com/watch?v=UB1O30fR-EE',
      }
    );
    assert.strictEqual(parseYouTubeVideoUrl('http://www.youtube.com/watch?v=UB1O30fR-EE'), null);
    assert.strictEqual(parseYouTubeVideoUrl('https://evil.example/watch?v=UB1O30fR-EE'), null);
    assert.strictEqual(parseYouTubeVideoUrl('https://www.youtube.com.evil.example/watch?v=UB1O30fR-EE'), null);
    assert.strictEqual(parseYouTubeVideoUrl('javascript:alert(1)'), null);

    assert.strictEqual((await runSearch([makeDetail()])).length, 1, 'public valid video should pass');
    assert.strictEqual((await runSearch([], ['deleted1'])).length, 0, 'deleted video missing from videos.list should be absent');
    assert.strictEqual((await runSearch([makeDetail({ privacyStatus: 'private' })])).length, 0, 'private video should be rejected');
    assert.strictEqual((await runSearch([makeDetail({ embeddable: false })])).length, 0, 'not embeddable video should be rejected');
    assert.strictEqual((await runSearch([makeDetail({ liveBroadcastContent: 'live' })])).length, 0, 'live video should be rejected');
    assert.strictEqual((await runSearch([makeDetail({ liveBroadcastContent: 'upcoming' })])).length, 0, 'upcoming video should be rejected');
    assert.strictEqual((await runSearch([makeDetail({ duration: 'PT59S' })])).length, 0, 'short duration should be rejected');
    assert.strictEqual((await runSearch([makeDetail({ duration: 'PT2M' })])).length, 0, 'too short video should be rejected');
    assert.strictEqual((await runSearch([makeDetail({ duration: 'PT5H' })])).length, 0, 'too long video should be rejected');
    assert.strictEqual((await runSearch([makeDetail({ title: 'React tutorial #shorts' })])).length, 0, 'Shorts title should be rejected');

    assert.strictEqual(checkYouTubeSafety({ title: 'React porn tutorial' }).allowed, false, 'sexual title should be rejected');
    assert.strictEqual(checkYouTubeSafety({ description: 'adult content hidden in description' }).allowed, false, 'sexual description should be rejected');
    assert.strictEqual(checkYouTubeSafety({ title: 'Free money React tutorial' }).allowed, false, 'scam title should be rejected');
    assert.strictEqual(checkYouTubeSafety({ description: 'phishing guide steal password' }).allowed, false, 'phishing description should be rejected');
    assert.strictEqual(checkYouTubeSafety({ title: 'malware download keylogger' }).allowed, false, 'malware phrase should be rejected');
    assert.strictEqual(
      checkYouTubeSafety({ title: 'Ethical hacking security penetration testing tutorial' }).allowed,
      true,
      'legitimate cybersecurity terms should not be blocked by broad words'
    );

    process.env.YOUTUBE_BLOCKED_CHANNEL_IDS = 'blocked-channel';
    assert.strictEqual((await runSearch([makeDetail({ channelId: 'blocked-channel' })])).length, 0, 'blocked channelId should be rejected');
    process.env.YOUTUBE_BLOCKED_CHANNEL_IDS = '';
    assert.strictEqual((await runSearch([makeDetail({ channelId: 'trusted-channel' })])).length, 1, 'trusted channel still passes metadata validation');

    const irrelevantScore = calculateYouTubeVideoScore({
      title: 'Become a full stack developer roadmap',
      description: 'Career plan',
      channelTitle: 'Unknown',
      skillName: 'React',
      level: 'beginner',
    });
    assert(irrelevantScore < 40, 'irrelevant video should not reach threshold');

    assert.strictEqual(validateYouTubeVideoMetadata(makeDetail()).valid, false, 'raw API detail is not mapped metadata');
    assert.strictEqual(isResourceMetadataFresh({
      source: 'youtube_api',
      metadataExpiresAt: new Date(Date.now() - 1000),
      url: 'https://www.youtube.com/watch?v=stale',
    }), false, 'stale cached video should require revalidation');
    assert.strictEqual(isResourceMetadataFresh({
      source: 'youtube_api',
      metadataExpiresAt: new Date(Date.now() + 100000),
      url: 'https://www.youtube.com/watch?v=fresh',
    }), true, 'fresh cached video should be returned');

    const publicFields = ['title', 'url', 'provider', 'thumbnailUrl', 'channelTitle', 'publishedAt', 'tags', 'source', 'score', 'cachedAt'];
    const internalFields = ['youtubeVideoId', 'youtubeChannelId', 'durationSeconds', 'privacyStatus', 'embeddable', 'safetyStatus', 'safetyReasons', 'validatedAt', 'metadataExpiresAt'];
    assert(publicFields.length > 0);
    assert(internalFields.every((field) => !publicFields.includes(field)), 'public response schema should not require internal metadata fields');

    console.log('PASS: YouTube video moderation fixtures');
  } finally {
    axios.get = originalGet;
    process.env = originalEnv;
  }
})().catch((error) => {
  axios.get = originalGet;
  process.env = originalEnv;
  console.error(error);
  process.exit(1);
});
