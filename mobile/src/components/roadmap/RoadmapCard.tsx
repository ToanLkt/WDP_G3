import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { ArrowRight, Clock, GitBranch, GitCommit, ListChecks, Sparkles, Trash2, User } from 'lucide-react-native';

import { theme } from '../../theme';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import type { Roadmap } from '../../features/roadmaps/types';
import { countRoadmapNodes, formatDifficulty } from '../../features/roadmaps/filterUtils';

interface RoadmapCardProps {
  roadmap: Roadmap;
  onPress: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

const formatLevel = (level?: string) => {
  if (!level) return null;
  const map: Record<string, string> = {
    beginner: 'Mới bắt đầu',
    intermediate: 'Trung cấp',
    advanced: 'Nâng cao',
    junior: 'Junior',
    mid: 'Mid-level',
    senior: 'Senior',
  };
  return map[level.toLowerCase()] ?? level;
};

export const RoadmapCard: React.FC<RoadmapCardProps> = ({
  roadmap,
  onPress,
  onDelete,
  isDeleting = false,
}) => {
  const nodes = roadmap.modules.flatMap((module) => module.nodes);
  const totalNodes = roadmap.progressSummary?.totalItems ?? nodes.length;
  const completedNodes = roadmap.progressSummary?.completedItems ?? nodes.filter((node) => node.status === 'completed').length;
  const isArchived = roadmap.status === 'archived';
  // Use server progress if available, otherwise fall back to local computation
  const progressPct = roadmap.progress ?? 0;

  // Derive source info
  const source = typeof roadmap.roadmapSource === 'object' ? roadmap.roadmapSource : undefined;
  const sourceRepositories = (source as any)?.repositories ?? [];
  const sourceRepositoryCount = roadmap.sourceRepositoriesCount ?? sourceRepositories.length ?? 0;
  const userCommits = (source as any)?.totalUserCommits ?? (source as any)?.userCommits ?? 0;
  const activeDays = (source as any)?.activeDays ?? 0;
  const effectiveLevel = formatLevel(roadmap.effectiveLevel);

  const sourceLabel = sourceRepositoryCount > 1
    ? `${sourceRepositoryCount} dự án`
    : (source as any)?.fullName ?? (source as any)?.repoName ?? 'Dự án';

  const prioritySkills = [
    ...(roadmap.skillGapSummary?.prioritySkills ?? []),
    ...(roadmap.skillGapSummary?.recommendedNextSkills ?? []),
  ].filter((skill, index, list) => skill && list.indexOf(skill) === index);

  return (
    <Card style={styles.card}>
      <View style={[styles.gradientBar, isArchived && styles.gradientBarArchived]} />

      <View style={styles.content}>
        {/* Badges Row */}
        <View style={styles.badgesRow}>
          <Badge label={roadmap.category} variant="secondary" />
          {effectiveLevel
            ? <Badge label={effectiveLevel} variant="warning" />
            : <Badge label={formatDifficulty(roadmap.difficulty)} variant="warning" />
          }
          <Badge
            label={isArchived ? 'Đã lưu trữ' : 'Đang học'}
            variant={isArchived ? 'muted' : 'success'}
          />
        </View>

        {/* Title & Description */}
        <Text style={styles.title} numberOfLines={2}>{roadmap.title}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>{roadmap.subtitle || roadmap.description}</Text>

        {/* Tags */}
        {roadmap.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {roadmap.tags.slice(0, 4).map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText} numberOfLines={1}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Progress Bar */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPct}%` }, isArchived && styles.progressArchived]} />
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Clock size={13} color={theme.colors.textMuted} />
            <Text style={styles.statText} numberOfLines={1}>{roadmap.estimatedWeeks} tuần</Text>
          </View>
          <View style={styles.statItem}>
            <ListChecks size={13} color={theme.colors.textMuted} />
            <Text style={styles.statText} numberOfLines={1}>{completedNodes}/{totalNodes} nhiệm vụ</Text>
          </View>
          <View style={styles.statItem}>
            <GitBranch size={13} color={theme.colors.textMuted} />
            <Text style={styles.statText} numberOfLines={1}>{sourceLabel}</Text>
          </View>
          <View style={styles.statItem}>
            <GitCommit size={13} color={theme.colors.textMuted} />
            <Text style={styles.statText} numberOfLines={1}>{userCommits} đóng góp</Text>
          </View>
        </View>

        {/* Level block */}
        {effectiveLevel && (
          <View style={styles.levelBlock}>
            <Text style={styles.levelLabel}>Trình độ: <Text style={styles.levelValue}>{effectiveLevel}</Text></Text>
          </View>
        )}

        {/* Personalization Info Card */}
        {(roadmap.roleMatch || activeDays > 0 || prioritySkills.length > 0) && (
          <View style={styles.personalizationBlock}>
            <View style={styles.personalMetaRow}>
              {roadmap.roleMatch && (
                <View style={styles.personalMetaItem}>
                  <Sparkles size={12} color={theme.colors.primary} />
                  <Text style={styles.personalMetaText}>
                    {Math.round(roadmap.roleMatch.matchScore)}% phù hợp · {roadmap.roleMatch.matchLevelLabel}
                  </Text>
                </View>
              )}
              {activeDays > 0 && (
                <View style={styles.personalMetaItem}>
                  <User size={12} color={theme.colors.secondary} />
                  <Text style={styles.personalMetaText}>{activeDays} ngày hoạt động</Text>
                </View>
              )}
            </View>

            {prioritySkills.length > 0 && (
              <View style={styles.prioritySkillsContainer}>
                {prioritySkills.slice(0, 4).map((skill) => (
                  <View key={skill} style={styles.skillBadge}>
                    <Text style={styles.skillBadgeText}>{skill}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Footer Actions */}
        <View style={styles.footerRow}>
          <View>
            <Text style={styles.footerLabel}>{isArchived ? 'Tiến độ đã lưu' : 'Hoàn thành'}</Text>
            <Text style={styles.footerValue}>{progressPct}%</Text>
          </View>
          <View style={styles.footerBtns}>
            <TouchableOpacity style={styles.continueBtn} onPress={onPress} activeOpacity={0.8}>
              <Text style={styles.continueText}>{isArchived ? 'Xem lại' : 'Tiếp tục'}</Text>
              <ArrowRight size={14} color={theme.colors.primaryLight} />
            </TouchableOpacity>

            {onDelete && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={onDelete}
                disabled={isDeleting}
                activeOpacity={0.7}
              >
                <Trash2 size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
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
  content: {
    padding: theme.spacing.md,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    lineHeight: 22,
  },
  subtitle: {
    fontSize: theme.typography.sizes.sm - 1,
    color: theme.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: theme.spacing.sm,
  },
  tagChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: theme.spacing.md,
  },
  statItem: {
    width: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  levelBlock: {
    marginTop: theme.spacing.sm,
    backgroundColor: '#6366f110',
    borderWidth: 1,
    borderColor: '#6366f130',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.roundness.sm,
  },
  levelLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  levelValue: {
    fontWeight: 'bold',
    color: '#6366f1',
  },
  personalizationBlock: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm + 2,
    borderRadius: theme.roundness.sm,
    gap: 8,
  },
  personalMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 16,
    rowGap: 4,
  },
  personalMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  personalMetaText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  prioritySkillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  skillBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  skillBadgeText: {
    fontSize: 10,
    color: '#d97706',
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  footerValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginTop: 2,
  },
  footerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.roundness.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  continueText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.primaryLight,
  },
  deleteBtn: {
    backgroundColor: '#ef4444',
    borderRadius: theme.roundness.sm,
    padding: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
