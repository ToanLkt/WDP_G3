import { theme } from '../theme';

export const getScoreColor = (score: number): string => {
  if (score >= 80) return theme.colors.success;
  if (score >= 60) return theme.colors.secondaryLight;
  if (score >= 40) return theme.colors.warning;
  return theme.colors.error;
};
