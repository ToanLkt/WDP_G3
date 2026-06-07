import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { ArrowRight, Clock, GitBranch, ListChecks } from 'lucide-react-native';

import { theme } from '../../theme';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import type { Roadmap } from '../../features/roadmaps/types';
import { countRoadmapNodes, formatDifficulty } from '../../features/roadmaps/filterUtils';

interface RoadmapCardProps {
  roadmap: Roadmap;
  onPress: () => void;
}

export const RoadmapCard: React.FC<RoadmapCardProps> = ({ roadmap, onPress }) => {
  const totalNodes = countRoadmapNodes(roadmap);
  const isArchived = roadmap.status === 'archived';

  return (
    <Card style={styles.card}>
      <View style={[styles.gradientBar, isArchived && styles.gradientBarArchived]} />

      <View style={styles.badgesRow}>
        <Badge label={roadmap.category} variant="secondary" />
        <Badge label={formatDifficulty(roadmap.difficulty)} variant="warning" />
        <Badge
          label={isArchived ? 'Đã lưu trữ' : 'Đang học'}
          variant={isArchived ? 'muted' : 'success'}
        />
      </View>

      <Text style={styles.title} numberOfLines={2}>{roadmap.title}</Text>
      <Text style={styles.subtitle} numberOfLines={2}>{roadmap.subtitle}</Text>

      <View style={styles.tagsRow}>
        {roadmap.tags.slice(0, 4).map((tag) => (
          <View key={tag} style={styles.tagChip}>
            <Text style={styles.tagText} numberOfLines={1}>{tag}</Text>
          </View>
        ))}
      </View>

      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${roadmap.progress}%` }, isArchived && styles.progressArchived]} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Clock size={14} color={theme.colors.textMuted} />
          <Text style={styles.statText}>{roadmap.estimatedWeeks} tuần</Text>
        </View>
        <View style={styles.statItem}>
          <ListChecks size={14} color={theme.colors.textMuted} />
          <Text style={styles.statText}>{totalNodes} nhiệm vụ</Text>
        </View>
        <View style={styles.statItem}>
          <GitBranch size={14} color={theme.colors.textMuted} />
          <Text style={styles.statText}>{roadmap.sourceRepositoriesCount ?? 0} repo</Text>
        </View>
      </View>

      <View style={styles.footerRow}>
        <View>
          <Text style={styles.footerLabel}>{isArchived ? 'Tiến độ đã lưu' : 'Hoàn thành'}</Text>
          <Text style={styles.footerValue}>{roadmap.progress}%</Text>
        </View>
        <TouchableOpacity style={styles.continueBtn} onPress={onPress} activeOpacity={0.8}>
          <Text style={styles.continueText}>{isArchived ? 'Xem lại' : 'Tiếp tục'}</Text>
          <ArrowRight size={14} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  gradientBar: {
    height: 4,
    backgroundColor: theme.colors.secondary,
  },
  gradientBarArchived: {
    backgroundColor: theme.colors.textMuted,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    paddingHorizontal: theme.spacing.md,
    marginTop: 4,
    lineHeight: theme.typography.lineHeights.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  tagChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm - 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '48%',
  },
  tagText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textSecondary,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.secondary,
    borderRadius: 3,
  },
  progressArchived: {
    backgroundColor: theme.colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  footerLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
  },
  footerValue: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceLight,
  },
  continueText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
});
