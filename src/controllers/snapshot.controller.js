const snapshotService = require('../services/snapshot.service');
const { successResponse } = require('../utils/response');

const getRepositorySnapshots = async (req, res, next) => {
  try {
    const result = await snapshotService.getRepositorySnapshots(req.user, req.params.repoId);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getSnapshotById = async (req, res, next) => {
  try {
    const result = await snapshotService.getSnapshotById(req.user, req.params.snapshotId);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const compareSnapshots = async (req, res, next) => {
  try {
    const result = await snapshotService.compareSnapshots(req.user, req.body);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const compareRepositoryProgress = async (req, res, next) => {
  try {
    const result = await snapshotService.compareRepositoryProgress(req.user, req.params.repoId);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getRepositorySnapshots,
  getSnapshotById,
  compareSnapshots,
  compareRepositoryProgress,
};
