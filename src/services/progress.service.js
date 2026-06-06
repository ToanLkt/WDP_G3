const { apiMessages } = require('../utils/constants');

const buildReadyPayload = () => ({
  message: apiMessages.ready,
  data: null,
});

const getMyProgress = async () => buildReadyPayload();

module.exports = {
  getMyProgress,
};
