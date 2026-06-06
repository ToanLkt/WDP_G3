const AiFeedback = require('../models/AiFeedback');
const AnalysisSnapshot = require('../models/AnalysisSnapshot');
const GithubAccount = require('../models/GithubAccount');
const Repository = require('../models/Repository');
const Roadmap = require('../models/Roadmap');
const User = require('../models/User');

const ensureAuthUser = (authUser) => {
  if (!authUser || !authUser.userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }
};

const getDashboardOverview = async (authUser) => {
  ensureAuthUser(authUser);

  const userId = authUser.userId;
  const [
    user,
    githubAccount,
    totalRepositories,
    analyzedRepositoryIds,
    latestAnalysis,
    latestFeedback,
    roadmap,
  ] = await Promise.all([
    User.findById(userId).lean(),
    GithubAccount.findOne({ userId }).lean(),
    Repository.countDocuments({ userId }),
    AnalysisSnapshot.distinct('repositoryId', { userId }),
    AnalysisSnapshot.findOne({ userId }).sort({ analyzedAt: -1, createdAt: -1 }).lean(),
    AiFeedback.findOne({ userId }).sort({ generatedAt: -1, createdAt: -1 }).lean(),
    Roadmap.findOne({ userId }).sort({ updatedAt: -1 }).lean(),
  ]);

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const analyzed = analyzedRepositoryIds.length;
  const strongSkills = latestAnalysis
    ? [...new Set([...(latestAnalysis.strengths || []), ...(latestAnalysis.skillSignals || [])])].slice(0, 10)
    : [];
  const missingSkills = latestAnalysis
    ? [...new Set([...(latestAnalysis.missingSkills || []), ...(latestAnalysis.weaknesses || [])])].slice(0, 10)
    : [];

  return {
    message: 'Get dashboard overview successfully',
    data: {
      user: {
        _id: user._id,
        name: user.fullName,
        email: user.email,
      },
      github: {
        connected: Boolean(githubAccount),
        username: githubAccount ? githubAccount.username : null,
      },
      repositories: {
        total: totalRepositories,
        analyzed,
        unanalyzed: Math.max(totalRepositories - analyzed, 0),
      },
      skills: {
        strong: strongSkills,
        missing: missingSkills,
      },
      suggestedCareerPath:
        (latestFeedback && (latestFeedback.careerSuggestion || latestFeedback.careerDirection)) ||
        (latestAnalysis && latestAnalysis.careerDirection) ||
        null,
      roadmapProgress: roadmap ? roadmap.progress || 0 : 0,
      latestAnalysisAt: latestAnalysis ? latestAnalysis.analyzedAt || latestAnalysis.createdAt : null,
    },
    statusCode: 200,
  };
};

module.exports = {
  getDashboardOverview,
};
