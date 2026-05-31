import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { GitPullRequest, Eye, FileText, CheckCircle2, AlertCircle, Play } from 'lucide-react-native';

import { theme } from '../../theme/theme';
import { Repository } from '../../services/repo';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';

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
  const formattedDate = new Date(repo.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Card style={styles.container} glow={repo.is_analyzed ? 'none' : 'none'}>
      {/* 1. Header Details */}
      <View style={styles.headerRow}>
        <View style={styles.titleWrapper}>
          <GitPullRequest size={18} color={theme.colors.secondaryLight} style={styles.gitIcon} />
          <Text style={styles.nameText} numberOfLines={1}>
            {repo.name}
          </Text>
        </View>
        <Badge
          label={repo.language}
          variant="secondary"
          style={styles.langBadge}
        />
      </View>

      {/* 2. Body Description */}
      <Text style={styles.descText} numberOfLines={2}>
        {repo.description || 'No description provided.'}
      </Text>

      {/* 3. Badges Row */}
      <View style={styles.badgesRow}>
        <View style={styles.metaCol}>
          <Text style={styles.updatedText}>Updated {formattedDate}</Text>
        </View>
        <View style={styles.tagsCol}>
          <View style={styles.tagWrap}>
            <FileText size={12} color={repo.has_readme ? theme.colors.success : theme.colors.textMuted} />
            <Text style={[styles.tagText, { color: repo.has_readme ? theme.colors.success : theme.colors.textMuted }]}>
              README
            </Text>
          </View>
        </View>
      </View>

      {/* 4. Action Row */}
      <View style={styles.actionRow}>
        {/* Status indicator */}
        <View style={styles.statusIndicator}>
          {repo.is_analyzed ? (
            <View style={styles.statusMsgRow}>
              <CheckCircle2 size={14} color={theme.colors.success} style={styles.statusIcon} />
              <Text style={[styles.statusLabelText, { color: theme.colors.success }]}>Audited</Text>
            </View>
          ) : (
            <View style={styles.statusMsgRow}>
              <AlertCircle size={14} color={theme.colors.textMuted} style={styles.statusIcon} />
              <Text style={styles.statusLabelText}>Not Audited</Text>
            </View>
          )}
        </View>

        {/* Buttons */}
        <View style={styles.buttonsWrapper}>
          {isAnalyzing ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="small" color={theme.colors.secondary} />
              <Text style={styles.analyzingText}>Auditing...</Text>
            </View>
          ) : repo.is_analyzed ? (
            <TouchableOpacity
              style={styles.viewBtn}
              onPress={() => onViewAnalysis(repo.id, repo.name)}
              activeOpacity={0.7}
            >
              <Eye size={14} color={theme.colors.textPrimary} style={styles.btnIcon} />
              <Text style={styles.viewBtnText}>View Results</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.analyzeBtn}
              onPress={() => onAnalyze(repo.id)}
              activeOpacity={0.7}
            >
              <Play size={12} color={theme.colors.textPrimary} style={styles.btnIcon} />
              <Text style={styles.analyzeBtnText}>Audit Code</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md + 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  gitIcon: {
    marginRight: theme.spacing.sm - 2,
  },
  nameText: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  langBadge: {
    paddingVertical: 2,
  },
  descText: {
    fontSize: theme.typography.sizes.sm - 1,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.xs + 3,
    marginBottom: theme.spacing.md,
  },
  badgesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    paddingBottom: theme.spacing.sm + 2,
    marginBottom: theme.spacing.sm + 2,
  },
  metaCol: {
    flex: 1,
  },
  updatedText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
  },
  tagsCol: {
    flexDirection: 'row',
  },
  tagWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: theme.roundness.sm - 2,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusIndicator: {
    flex: 1,
  },
  statusMsgRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    marginRight: 4,
  },
  statusLabelText: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textMuted,
    fontWeight: theme.typography.weights.medium,
  },
  buttonsWrapper: {
    justifyContent: 'flex-end',
  },
  loaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
    borderRadius: theme.roundness.sm - 2,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
  },
  analyzingText: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.secondaryLight,
    fontWeight: theme.typography.weights.bold,
    marginLeft: theme.spacing.sm - 2,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm - 2,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
  },
  viewBtnText: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.bold,
  },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.roundness.sm - 2,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
  },
  analyzeBtnText: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.bold,
  },
  btnIcon: {
    marginRight: 4,
  },
});
