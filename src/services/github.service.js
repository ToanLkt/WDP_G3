const oauthService = require('./github/github.oauth.service');
const accountService = require('./github/github.account.service');
const repositoryService = require('./github/github.repository.service');
const packageService = require('./github/github.package.service');
const commitService = require('./github/github.commit.service');

module.exports = {
  ...oauthService,
  ...accountService,
  ...repositoryService,
  ...packageService,
  ...commitService,
};
