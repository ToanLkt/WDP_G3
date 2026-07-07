const { DEV2VEC_SKILLS } = require('../constants/dev2vecCatalog');
const { successResponse } = require('../utils/response');

const getCatalog = (req, res) => {
  const skills = DEV2VEC_SKILLS;

  return successResponse(
    res,
    'Dev2Vec skill catalog fetched successfully',
    {
      total: skills.length,
      skills,
    },
  );
};

module.exports = {
  getCatalog,
};
