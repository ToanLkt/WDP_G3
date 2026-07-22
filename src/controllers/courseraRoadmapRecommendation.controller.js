const { getRoadmapCourseRecommendations } = require('../services/courseraRoadmapRecommendation.service');

const getRecommendations = async (req, res, next) => {
  try {
    const data = await getRoadmapCourseRecommendations(req.user, req.params.roadmapId, { limit: req.query.limit });
    return res.status(200).json({ success: true, message: 'Roadmap course recommendations fetched successfully', data });
  } catch (error) { return next(error); }
};

module.exports = { getRecommendations };
