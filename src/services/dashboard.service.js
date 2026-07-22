const AiFeedback = require('../models/AiFeedback');
const GithubAccount = require('../models/GithubAccount');
const Repository = require('../models/Repository');
const Roadmap = require('../models/Roadmap');
const RoadmapProgress = require('../models/RoadmapProgress');
const User = require('../models/User');
const {
  findLatestCompatibleAnalysis,
  findLatestCompatibleSnapshot,
  getCurrentDev2VecVersions,
} = require('./dev2vec/dev2vecCompatibility.service');

const ensureAuthUser = (authUser) => {
  if (!authUser || !authUser.userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }
};

const names = (values = []) => [...new Set(values.map((item) => String(item?.skillName || item?.canonicalSkillName || item || '').trim()).filter(Boolean))];

const getDashboardOverview = async (authUser) => {
  ensureAuthUser(authUser);
  const userId = authUser.userId;
  const versions = getCurrentDev2VecVersions();
  const [user, githubAccount, totalRepositories, repositoryIds, latestAnalysis, roadmap] = await Promise.all([
    User.findById(userId).lean(),
    GithubAccount.findOne({ userId }).lean(),
    Repository.countDocuments({ userId }),
    Repository.distinct('_id', { userId }),
    findLatestCompatibleAnalysis({ userId }),
    Roadmap.findOne({ userId, status: 'active', isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
  ]);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const analyzedRepositoryIds = await Promise.all(repositoryIds.map(async (repositoryId) => (
    (await findLatestCompatibleAnalysis({ userId, repositoryId })) ? String(repositoryId) : null
  )));
  const [latestSnapshot, progress, latestFeedback] = await Promise.all([
    latestAnalysis ? findLatestCompatibleSnapshot({ userId, repositoryId: latestAnalysis.repositoryId }) : null,
    roadmap ? RoadmapProgress.findOne({ userId, roadmapId: roadmap._id }).lean() : null,
    latestAnalysis ? AiFeedback.findOne({ userId, analysisId: latestAnalysis._id }).sort({ generatedAt: -1, createdAt: -1 }).lean() : null,
  ]);

  const predictions = Array.isArray(latestAnalysis?.dev2vec?.rolePredictions) ? latestAnalysis.dev2vec.rolePredictions.slice(0, 3) : [];
  const gapByRole = latestAnalysis?.dev2vec?.skillGaps || {};
  const gap = gapByRole[predictions[0]?.roleId] || gapByRole;
  const strongSkills = names([...(gap.matchedSkillNames || []), ...(gap.matchedSkills || [])]).slice(0, 10);
  const missingSkills = names([...(gap.weakSkillNames || []), ...(gap.missingSkillNames || []), ...(gap.recommendedNextSkills || [])]).slice(0, 10);
  const analyzed = analyzedRepositoryIds.filter(Boolean).length;
  const hasCurrent = Boolean(latestAnalysis);

  return {
    message: 'Get dashboard overview successfully',
    data: {
      user: { _id: user._id, name: user.fullName, email: user.email },
      github: { connected: Boolean(githubAccount), username: githubAccount ? githubAccount.username : null },
      repositories: { total: totalRepositories, analyzed, unanalyzed: Math.max(totalRepositories - analyzed, 0) },
      skills: { strong: strongSkills, missing: missingSkills },
      suggestedCareerPath: predictions[0]?.roleName || null,
      roadmapProgress: Number(progress?.overallProgress ?? progress?.progressSummary?.overallProgress ?? roadmap?.progressSummary?.overallProgress ?? 0),
      latestAnalysisAt: latestAnalysis ? latestAnalysis.analyzedAt || latestAnalysis.createdAt : null,
      dev2vecStatus: hasCurrent ? 'current' : 'analysis_required',
      modelVersion: versions.modelVersion,
      pipelineVersion: versions.pipelineVersion,
      topRoles: predictions,
      latestSnapshotId: latestSnapshot?._id || null,
      aiFeedbackCurrent: Boolean(latestFeedback),
    },
    statusCode: 200,
  };
};

module.exports = { getDashboardOverview };
