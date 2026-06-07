export const asRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
};

export const extractObject = (value: unknown, keys: string[]) => {
  const record = asRecord(value);

  for (const key of keys) {
    if (record[key] && typeof record[key] === 'object') {
      return record[key];
    }
  }

  return value;
};

export const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;

  const record = asRecord(value);
  const candidates = [
    record.items,
    record.repositories,
    record.analyses,
    record.results,
    record.sessions,
    record.chatSessions,
    record.messages,
    record.packages,
    record.files,
    record.notifications,
    record.feedbacks,
    record.roadmaps,
    record.data,
  ];
  const found = candidates.find(Array.isArray);

  return Array.isArray(found) ? found : [];
};

export const asString = (value: unknown, fallback = '') => {
  return typeof value === 'string' ? value : fallback;
};

export const asNumber = (value: unknown, fallback = 0) => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

export const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return asString(values.find((value) => typeof value === 'string'), '');
};
