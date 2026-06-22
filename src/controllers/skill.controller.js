const { listCanonicalSkills } = require('../utils/skillCanonicalizer');
const { successResponse } = require('../utils/response');

const getCatalog = (req, res) => {
  const skills = listCanonicalSkills();

  return successResponse(
    res,
    'Canonical skill catalog fetched successfully',
    {
      total: skills.length,
      skills,
    },
  );
};

module.exports = {
  getCatalog,
};
