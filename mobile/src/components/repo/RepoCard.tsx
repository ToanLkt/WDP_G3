import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Linking } from 'react-native';
import {
  Star,
  GitFork,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronRight,
  Clock,
} from 'lucide-react-native';

import { theme } from '../../theme';
import { Repository } from '../../services/repo';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatRelativeTimeEn } from '../../utils/formatRelativeTime';

interface RepoCardProps {
  repo: Repository;
  onPress: (repo: Repository) => void;
  onAnalyze?: (repoId: string) => void;
  onViewAnalysis?: (repoId: string, repoName: string) => void;
  onViewProgress?: (repoId: string, repoName: string) => void;
  isAnalyzing?: boolean;
}

export const RepoCard: React.FC<RepoCardProps> = ({
  repo,
  onPress,
  onAnalyze,
  onViewAnalysis,
  onViewProgress,
  isAnalyzing,
}) => {
  const openGithub = (e: any) => {
    e?.stopPropagation?.();
    if (repo.url && repo.url !== '#') {
      Linking.openURL(repo.url).catch(() => undefined);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(repo)}
      style={styles.touchable}
    >
      <Card style={styles.container} padded={false}>
        {/* Top: Name + GitHub link + chevron */}
        <View style={styles.topSection}>
          <View style={styles.nameBlock}>
            <Text style={styles.nameText} numberOfLines={1}>
              {repo.name}
            </Text>
            {repo.description ? (
              <Text style={styles.descText} numberOfLines={2}>
                {repo.description}
              </Text>
            ) : null}
          </View>
          <View style={styles.topRight}>
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={openGithub}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ExternalLink size={14} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <ChevronRight size={18} color={theme.colors.textMuted} />
          </View>
        </View>

        {/* Meta badges row */}
        <View style={styles.metaRow}>
          {/* Language */}
          {repo.language ? (
            <Badge label={repo.language} variant="muted" />
          ) : (
            <Badge label="Unknown" variant="muted" />
          )}

          {/* Stars */}
          <View style={styles.statChip}>
            <Star size={12} color={theme.colors.textMuted} />
            <Text style={styles.statText}>{repo.stars ?? 0}</Text>
          </View>

          {/* Forks */}
          <View style={styles.statChip}>
            <GitFork size={12} color={theme.colors.textMuted} />
            <Text style={styles.statText}>{repo.forks ?? 0}</Text>
          </View>

          {/* Readme indicator */}
          {repo.has_readme ? (
            <CheckCircle2 size={14} color={theme.colors.success} />
          ) : (
            <XCircle size={14} color={theme.colors.textMuted} />
          )}
        </View>

        {/* Bottom: analysis status + updated */}
        <View style={styles.bottomRow}>
          <Badge
            label={repo.is_analyzed ? 'Đã phân tích' : 'Chưa phân tích'}
            variant={repo.is_analyzed ? 'success' : 'muted'}
          />
          <View style={styles.updatedRow}>
            <Clock size={11} color={theme.colors.textMuted} />
            <Text style={styles.updatedText}>
              {formatRelativeTimeEn(repo.updated_at)}
            </Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    marginBottom: theme.spacing.md,
  },
  container: {
    overflow: 'hidden',
    marginBottom: 0,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  nameBlock: {
    flex: 1,
  },
  nameText: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primaryLight,
  },
  descText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
    lineHeight: theme.typography.lineHeights.sm,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  linkBtn: {
    width: 30,
    height: 30,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing.sm,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  updatedText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
});
