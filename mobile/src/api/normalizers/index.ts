import { asArray } from './helpers';

export * from './analysis';
export * from './chat';
export * from './helpers';
export * from './repository';
export * from './user';

export const normalizeFiles = (payload: unknown) => asArray(payload);
export const normalizeCommits = (payload: unknown) => asArray(payload);
