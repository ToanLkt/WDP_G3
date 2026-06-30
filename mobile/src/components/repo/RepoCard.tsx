import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import {
  Star,
  GitFork,
  CheckCircle2,
  XCircle,
  Play,
  RefreshCw,
  ExternalLink,
} from 'lucide-react-native';

import { theme } from '../../theme';
import { Repository } from '../../services/repo';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { formatRelativeTimeEn } from '../../utils/formatRelativeTime';

interface RepoCardProps {
  repo: Repository;
  onAnalyze: (repoId: string) => void;
  onViewAnalysis: (repoId: string, repoName: string) => void;
  isAnalyzing: boolean;
}

export const RepoCard: React.FC<RepoCardProps> = ({
  repo,
  onAnalyze,
  onViewAnalysis,
  isAnalyzing,
}) => {
  const openGithub = () => {
    if (repo.url && repo.url !== '#') {
      Linking.openURL(repo.url).catch(() => undefined);
    }
  };

  return (
    <Card style={styles.container} padded={false}>
      <View style={styles.topSection}>
        <View style={styles.nameBlock}>
          <Text style={styles.nameText} numberOfLines={1}>{repo.name}</Text>
          {repo.description ? (
            <Text style={styles.descText} numberOfLines={2}>{repo.description}</Text>
          ) : null}
        </View>
        <TouchableOpacity style={styles.linkBtn} onPress={openGithub} activeOpacity={0.8}>
          <ExternalLink size={16} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.metaGrid}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Ngôn ngữ</Text>
          <Badge label={repo.language} variant="muted" />
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Thống kê</Text>
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Star size={12} color={theme.colors.textMuted} />
              <Text style={styles.statText}>{repo.stars}</Text>
            </View>
            <View style={styles.statChip}>
              <GitFork size={12} color={theme.colors.textMuted} />
              <Text style={styles.statText}>{repo.forks}</Text>
            </View>
          </View>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Tài liệu</Text>
          {repo.has_readme ? (
            <CheckCircle2 size={18} color={theme.colors.success} />
          ) : (
            <XCircle size={18} color={theme.colors.textMuted} />
          )}
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Phân tích</Text>
          <Badge
            label={repo.is_analyzed ? 'Đã phân tích' : 'Chưa phân tích'}
            variant={repo.is_analyzed ? 'success' : 'muted'}
          />
        </View>
        <View style={styles.metaItemWide}>
          <Text style={styles.metaLabel}>Cập nhật</Text>
          <Text style={styles.updatedText}>{formatRelativeTimeEn(repo.updated_at)}</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        {isAnalyzing ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={theme.colors.primaryLight} />
            <Text style={styles.loadingText}>Đang phân tích...</Text>
          </View>
        ) : repo.is_analyzed ? (
          <View style={styles.dualActionRow}>
            <View style={styles.actionBtnSlot}>
              <Button
                title="Xem phân tích"
                variant="outline"
                onPress={() => onViewAnalysis(repo.id, repo.name)}
                style={styles.actionBtnFill}
              />
            </View>
            <View style={styles.actionBtnSlot}>
              <Button
                title="Phân tích lại"
                onPress={() => onAnalyze(repo.id)}
                style={styles.actionBtnFill}
                icon={<RefreshCw size={14} color={theme.colors.textPrimary} />}
              />
            </View>
          </View>
        ) : (
          <Button
            title="Phân tích"
            onPress={() => onAnalyze(repo.id)}
            style={styles.actionBtnFill}
            icon={<Play size={14} color={theme.colors.textPrimary} />}
          />
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
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
  linkBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing.md,
  },
  metaItem: {
    width: '46%',
    gap: 4,
  },
  metaItemWide: {
    width: '100%',
    gap: 4,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
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
  updatedText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
  },
  actionRow: {
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing.sm,
  },
  dualActionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    width: '100%',
  },
  actionBtnSlot: {
    flex: 1,
  },
  actionBtnFill: {
    width: '100%',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  loadingText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
  },
});
