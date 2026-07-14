const assert = require('assert');

const GithubAccount = require('../src/models/GithubAccount');
const StudentProfile = require('../src/models/StudentProfile');
const githubAccountService = require('../src/services/github/github.account.service');

const originalFindOne = GithubAccount.findOne;
const originalDeleteOne = GithubAccount.deleteOne;
const originalProfileFindOneAndUpdate = StudentProfile.findOneAndUpdate;
const originalClientId = process.env.GITHUB_CLIENT_ID;
const originalClientSecret = process.env.GITHUB_CLIENT_SECRET;

const userId = '665f1f000000000000000001';
let storedAccount = null;
let deleteCalls = [];
let profileUpdates = [];

const accountFixture = {
  _id: 'github-account-1',
  userId,
  githubId: 123456,
  username: 'octocat',
  displayName: 'The Octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/123456?v=4',
  email: 'octocat@example.com',
  profileUrl: 'https://github.com/octocat',
  accessToken: 'secret-token',
  connectedAt: new Date('2026-07-14T00:00:00.000Z'),
  updatedAt: new Date('2026-07-14T01:00:00.000Z'),
};

GithubAccount.findOne = (query) => ({
  select: () => {
    if (String(query.userId) !== userId || !storedAccount) return Promise.resolve(null);
    return Promise.resolve({ ...storedAccount });
  },
});

GithubAccount.deleteOne = (query) => {
  deleteCalls.push(query);
  if (storedAccount && String(query.userId) === userId && String(query._id) === String(storedAccount._id)) {
    storedAccount = null;
    return Promise.resolve({ deletedCount: 1 });
  }
  return Promise.resolve({ deletedCount: 0 });
};

StudentProfile.findOneAndUpdate = (query, update) => {
  profileUpdates.push({ query, update });
  return Promise.resolve({});
};

const reset = (account) => {
  storedAccount = account ? { ...account } : null;
  deleteCalls = [];
  profileUpdates = [];
};

const assertNoToken = (value) => {
  assert(!JSON.stringify(value).includes('secret-token'), 'response must not contain access token');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(value.data.account || {}, 'accessToken'), false);
};

const main = async () => {
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;

  reset(null);
  const empty = await githubAccountService.getGithubAccount({ userId });
  assert.strictEqual(empty.data.connected, false);
  assert.strictEqual(empty.data.account, null);

  const emptyDisconnect = await githubAccountService.disconnectGithubAccount({ userId });
  assert.strictEqual(emptyDisconnect.data.connected, false);
  assert.strictEqual(emptyDisconnect.data.githubLogoutUrl, 'https://github.com/logout');
  assert.strictEqual(deleteCalls.length, 0);
  assert.strictEqual(profileUpdates.length, 1);

  reset(accountFixture);
  const connected = await githubAccountService.getGithubAccount({ userId });
  assert.strictEqual(connected.data.connected, true);
  assert.strictEqual(connected.data.account.githubUserId, '123456');
  assert.strictEqual(connected.data.account.username, 'octocat');
  assert.strictEqual(connected.data.account.email, 'octocat@example.com');
  assertNoToken(connected);

  const disconnected = await githubAccountService.disconnectGithubAccount({ userId });
  assert.strictEqual(disconnected.data.connected, false);
  assert.strictEqual(disconnected.data.githubLogoutUrl, 'https://github.com/logout');
  assert.strictEqual(storedAccount, null);
  assert.strictEqual(deleteCalls.length, 1);
  assert.deepStrictEqual(Object.keys(deleteCalls[0]).sort(), ['_id', 'userId']);
  assert.strictEqual(profileUpdates.length, 1);
  assert.strictEqual(profileUpdates[0].update.$set.githubConnected, false);
  assertNoToken(disconnected);

  console.log('PASS: GitHub account connect status and disconnect flow');
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    GithubAccount.findOne = originalFindOne;
    GithubAccount.deleteOne = originalDeleteOne;
    StudentProfile.findOneAndUpdate = originalProfileFindOneAndUpdate;
    if (originalClientId === undefined) delete process.env.GITHUB_CLIENT_ID;
    else process.env.GITHUB_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET;
    else process.env.GITHUB_CLIENT_SECRET = originalClientSecret;
  });
