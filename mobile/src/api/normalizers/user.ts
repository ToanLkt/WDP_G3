import type { User } from '../../types';
import { asRecord, extractObject, firstString } from './helpers';

export const normalizeUser = (payload: unknown): User => {
  const root = asRecord(extractObject(payload, ['user', 'account', 'profile']));
  const user = asRecord(root.user ?? root.profile ?? root);
  const github = asRecord(user.github ?? user.githubAccount);
  const githubUsername = firstString(user.githubUsername, github.username, github.login);

  return {
    id: firstString(user.id, user._id),
    email: firstString(user.email),
    name: firstString(user.name, user.fullName, user.username, user.email),
    avatar: firstString(user.avatar, user.avatarUrl, github.avatarUrl) || undefined,
    githubConnected: Boolean(user.githubConnected ?? user.isGithubConnected ?? githubUsername),
    githubUsername: githubUsername || undefined,
    createdAt: firstString(user.createdAt, new Date().toISOString()),
  };
};
