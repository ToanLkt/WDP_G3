const repositoryService = require('../services/repository.service');
const { successResponse } = require('../utils/response');

const getRepositoryById = async (req, res, next) => {
  try {
    const result = await repositoryService.getRepositoryById({ user: req.user, params: req.params });
    return successResponse(res, result.message, result.data);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getRepositoryById,
};
