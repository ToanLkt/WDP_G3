const { apiMessages } = require('../utils/constants');

const buildReadyPayload = () => ({
  message: apiMessages.ready,
  data: null,
});

const getRepositoryById = async () => buildReadyPayload();

module.exports = {
  getRepositoryById,
};
