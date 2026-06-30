import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity } from 'react-native';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  MessageSquare,
  Package,
  Play,
  TrendingUp,
  Wrench,
  Bot
} from 'lucide-react-native';
import { useRoute, useNavigation } from '@react-navigation/native';

import { theme } from '../../theme';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorDisplay } from '../../components/ui/ErrorDisplay';
import { fetchAnalysisResult } from '../../services/analysis';
import type { AnalysisResult } from '../../types';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';

const BADGE_LIMIT = 10;
const TEXT_LIST_LIMIT = 6;
const RECOMMENDATION_LIMIT = 5;

const clampScore = (value: number | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
};

const getScoreTone = (score: number) => {
  if (score >= 75) return { color: theme.colors.success, bg: 'rgba(16, 185, 129, 0.1)', label: 'Tốt' };
  if (score >= 45) return { color: theme.colors.warning, bg: 'rgba(245, 158, 11, 0.1)', label: 'Cần cải thiện' };
  return { color: theme.colors.error, bg: 'rgba(239, 68, 68, 0.1)', label: 'Ưu tiên cải thiện' };
};

const formatRatio = (value: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0%';
  return `${Math.round(value <= 1 ? value * 100 : value)}%`;
};

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN');
  } catch (e) {
    return dateStr;
  }
};

export const AnalysisResultScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { repoId, repoName } = route.params || { repoId: 'repo_1', repoName: 'Project' };
  const { tabBarPaddingBottom } = useTabBarAwareScroll();

  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalysis = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAnalysisResult(repoId);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Could not fetch codebase diagnostics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, [repoId]);

  if (loading) {
    return <LoadingSpinner visible message={`Đang phân tích ${repoName}...`} />;
  }

  if (error || !data) {
    return <ErrorDisplay message={error || 'Không tìm thấy dữ liệu phân tích.'} onRetry={fetchAnalysis} />;
  }

  const handleConsultAI = () => {
    navigation.navigate('ChatTab', { repoId: data.repositoryId, repoName: repoName });
  };

  const languages = data.languages?.length ? data.languages : (data.techStack || []);
  const frameworks = data.frameworks?.length ? data.frameworks : (data.techStack || []);
  const packages = data.packages || [];
  const skillSignals = data.skillSignals || [];
  const careerSignals = data.careerSignals || [];
  const commitSummary = data.commitSummary || {
    totalCommits: 0,
    activeDays: 0,
    vagueCommitRatio: 0,
    conventionalCommitRatio: 0
  };
  const checklist = data.checklist || {
    hasReadme: false,
    hasEnvExample: false,
    hasDocker: false,
    hasDockerCompose: false,
    hasCICD: false,
    hasTesting: false,
    hasLinting: false,
    hasFormatter: false,
    hasPackageFile: false
  };

  const checklistItems = [
    { label: 'README', completed: checklist.hasReadme },
    { label: '.env.example', completed: checklist.hasEnvExample },
    { label: 'Docker', completed: checklist.hasDocker },
    { label: 'Docker Compose', completed: checklist.hasDockerCompose },
    { label: 'CI/CD', completed: checklist.hasCICD },
    { label: 'Testing', completed: checklist.hasTesting },
    { label: 'Linting', completed: checklist.hasLinting },
    { label: 'Formatter', completed: checklist.hasFormatter },
    { label: 'Package file', completed: checklist.hasPackageFile }
  ];

  const overallScore = clampScore(data.scores?.overallScore ?? data.scores?.overall);
  const overallTone = getScoreTone(overallScore);

  const scoreItems = [
    { label: 'Tech stack', score: clampScore(data.scores?.techStackScore) },
    { label: 'Tài liệu', score: clampScore(data.scores?.documentationScore ?? data.scores?.documentation) },
    { label: 'Chất lượng commit', score: clampScore(data.scores?.commitQualityScore ?? data.scores?.commitQuality) },
    { label: 'Triển khai', score: clampScore(data.scores?.deploymentScore) },
    { label: 'Testing', score: clampScore(data.scores?.testingScore) },
    { label: 'Độ sẵn sàng portfolio', score: clampScore(data.scores?.portfolioReadinessScore) }
  ];

  const renderTextList = (items: string[], emptyText: string) => {
    if (!items || items.length === 0) return <Text style={styles.emptyText}>{emptyText}</Text>;
    return (
      <View style={styles.textList}>
        {items.slice(0, TEXT_LIST_LIMIT).map((item, idx) => (
          <View key={idx} style={styles.textListItem}>
            <Text style={styles.textListBullet}>-</Text>
            <Text style={styles.textListText}>{item}</Text>
          </View>
        ))}
        {items.length > TEXT_LIST_LIMIT && (
          <Text style={styles.moreText}>+{items.length - TEXT_LIST_LIMIT} mục khác</Text>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarPaddingBottom }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{data.repoName || data.repositoryName}</Text>
        <Text style={styles.subtitle}>{data.fullName || 'Repository Analysis'} - {formatDate(data.createdAt)}</Text>
        <View style={styles.badgesRow}>
          <Badge label={data.projectType || 'Unknown'} variant="info" />
          {languages.slice(0, 3).map((lang) => (
            <Badge key={lang} label={lang} variant="primary" style={{ marginLeft: 6 }} />
          ))}
        </View>
      </View>

      {/* Điểm phân tích */}
      <SectionHeader title="Điểm phân tích" icon={<Activity size={20} color={theme.colors.secondaryLight} />} />
      <Card style={styles.scoresCard}>
        <View style={[styles.overallScoreBox, { backgroundColor: overallTone.bg, borderColor: overallTone.color }]}>
          <Text style={styles.overallScoreLabel}>Điểm tổng quan</Text>
          <Text style={[styles.overallScoreValue, { color: overallTone.color }]}>{overallScore}</Text>
          <Text style={[styles.overallScoreDesc, { color: overallTone.color }]}>{overallTone.label}</Text>
        </View>

        <View style={styles.subScoresContainer}>
          {scoreItems.map((item) => {
            const tone = getScoreTone(item.score);
            return (
              <View key={item.label} style={styles.subScoreRow}>
                <View style={styles.subScoreHeader}>
                  <Text style={styles.subScoreLabel}>{item.label}</Text>
                  <Text style={[styles.subScoreValue, { color: tone.color }]}>{item.score}</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${item.score}%`, backgroundColor: tone.color }]} />
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Tổng quan */}
      <SectionHeader title="Tổng quan" icon={<TrendingUp size={20} color={theme.colors.secondaryLight} />} />
      <Card style={styles.overviewCard}>
        <View style={styles.overviewRow}>
          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>LOẠI DỰ ÁN</Text>
            <Text style={styles.overviewValue}>{data.projectType}</Text>
          </View>
          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>ĐỊNH HƯỚNG NGHỀ NGHIỆP</Text>
            <Text style={[styles.overviewValue, { color: theme.colors.secondaryLight }]}>{data.careerDirection?.primary || 'N/A'}</Text>
          </View>
        </View>

        <View style={styles.overviewSection}>
          <Text style={styles.overviewLabel}>NGÔN NGỮ</Text>
          <View style={styles.chipRow}>
            {languages.length ? languages.slice(0, BADGE_LIMIT).map((item) => <Badge key={item} label={item} variant="primary" style={styles.chip} />) : <Text style={styles.emptyText}>Chưa có dữ liệu.</Text>}
            {languages.length > BADGE_LIMIT && <Badge label={`+${languages.length - BADGE_LIMIT}`} variant="primary" style={styles.chip} />}
          </View>
        </View>

        <View style={styles.overviewSection}>
          <Text style={styles.overviewLabel}>FRAMEWORKS</Text>
          <View style={styles.chipRow}>
            {frameworks.length ? frameworks.slice(0, BADGE_LIMIT).map((item) => <Badge key={item} label={item} variant="info" style={styles.chip} />) : <Text style={styles.emptyText}>Chưa có dữ liệu.</Text>}
            {frameworks.length > BADGE_LIMIT && <Badge label={`+${frameworks.length - BADGE_LIMIT}`} variant="info" style={styles.chip} />}
          </View>
        </View>
      </Card>

      {/* Kỹ năng */}
      <SectionHeader title="Kỹ năng & Tín hiệu" icon={<Code2 size={20} color={theme.colors.secondaryLight} />} />
      <Card style={styles.skillsCard}>
        <View style={styles.skillBox}>
          <Text style={styles.skillBoxTitle}>Tín hiệu kỹ năng</Text>
          {renderTextList(skillSignals, 'Chưa có tín hiệu kỹ năng.')}
        </View>
        <View style={styles.divider} />
        <View style={styles.skillBox}>
          <Text style={styles.skillBoxTitle}>Tín hiệu nghề nghiệp</Text>
          {renderTextList(careerSignals, 'Chưa có tín hiệu nghề nghiệp.')}
        </View>
      </Card>

      {/* Điểm mạnh & Điểm yếu */}
      <View style={styles.rowCards}>
        <Card style={[styles.halfCard, { borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
          <View style={styles.halfCardHeader}>
            <CheckCircle2 size={18} color={theme.colors.success} />
            <Text style={styles.halfCardTitle}>Điểm mạnh</Text>
          </View>
          {renderTextList(data.strengths || [], 'Chưa có dữ liệu.')}
        </Card>
        <Card style={[styles.halfCard, { borderColor: 'rgba(245, 158, 11, 0.3)' }]}>
          <View style={styles.halfCardHeader}>
            <AlertCircle size={18} color={theme.colors.warning} />
            <Text style={styles.halfCardTitle}>Cần cải thiện</Text>
          </View>
          {renderTextList(data.weaknesses || [], 'Chưa có dữ liệu.')}
        </Card>
      </View>

      {/* Missing Skills */}
      {data.missingSkills && data.missingSkills.length > 0 && (
        <Card style={styles.missingCard}>
          <Text style={styles.missingTitle}>Kỹ năng còn thiếu</Text>
          <View style={styles.textList}>
            {data.missingSkills.slice(0, TEXT_LIST_LIMIT).map((item) => (
              <View key={item.id} style={styles.textListItem}>
                <Text style={[styles.textListBullet, { color: theme.colors.error }]}>-</Text>
                <Text style={styles.textListText}>{item.name}</Text>
              </View>
            ))}
            {data.missingSkills.length > TEXT_LIST_LIMIT && (
              <Text style={styles.moreText}>+{data.missingSkills.length - TEXT_LIST_LIMIT} kỹ năng khác</Text>
            )}
          </View>
        </Card>
      )}

      {/* Hoạt động Commit */}
      <SectionHeader title="Hoạt động commit" icon={<Activity size={20} color={theme.colors.secondaryLight} />} />
      <Card style={styles.statsCard}>
        <View style={styles.statGrid}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Tổng số</Text>
            <Text style={styles.statValue}>{commitSummary.totalCommits}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Ngày HĐ</Text>
            <Text style={styles.statValue}>{commitSummary.activeDays}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Mơ hồ</Text>
            <Text style={styles.statValue}>{formatRatio(commitSummary.vagueCommitRatio)}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Chuẩn</Text>
            <Text style={styles.statValue}>{formatRatio(commitSummary.conventionalCommitRatio)}</Text>
          </View>
        </View>
        <View style={styles.statDates}>
          <Text style={styles.statDateText}>Đầu: {formatDate(commitSummary.firstCommitDate)}</Text>
          <Text style={styles.statDateText}>Cuối: {formatDate(commitSummary.lastCommitDate)}</Text>
        </View>
      </Card>

      {/* Checklist */}
      <SectionHeader title="Checklist dự án" icon={<ClipboardCheck size={20} color={theme.colors.secondaryLight} />} />
      <Card style={styles.checklistCard}>
        {checklistItems.map((item, index) => (
          <View key={item.label} style={[styles.checklistItem, index === checklistItems.length - 1 && styles.noBorderBottom]}>
            <Text style={styles.checklistLabel}>{item.label}</Text>
            <Badge label={item.completed ? 'Có' : 'Chưa'} variant={item.completed ? 'success' : 'muted'} />
          </View>
        ))}
      </Card>

      {/* Gợi ý cải thiện */}
      <SectionHeader title="Gợi ý cải thiện" icon={<Wrench size={20} color={theme.colors.secondaryLight} />} />
      <Card style={styles.recsCard}>
        {!data.recommendations || data.recommendations.length === 0 ? (
          <Text style={styles.emptyText}>Chưa có suggestions.</Text>
        ) : (
          <View>
            {data.recommendations.slice(0, RECOMMENDATION_LIMIT).map((rec) => (
              <View key={rec.id} style={styles.recItem}>
                <Text style={styles.recTitle}>{rec.title}</Text>
                <Text style={styles.recDesc}>{rec.description}</Text>
              </View>
            ))}
            {data.recommendations.length > RECOMMENDATION_LIMIT && (
              <Text style={styles.moreText}>Còn {data.recommendations.length - RECOMMENDATION_LIMIT} gợi ý khác.</Text>
            )}
          </View>
        )}
      </Card>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <Button
          title="Hỏi AI Mentor"
          onPress={handleConsultAI}
          icon={<MessageSquare size={18} color={theme.colors.textPrimary} />}
          style={{ flex: 1 }}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    padding: theme.spacing.lg,
  },
  header: {
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.sizes.xxl - 4,
    fontWeight: theme.typography.weights.heavy,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  scoresCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  overallScoreBox: {
    padding: theme.spacing.lg,
    borderRadius: theme.roundness.md,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: theme.spacing.lg,
  },
  overallScoreLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  overallScoreValue: {
    fontSize: 48,
    fontWeight: theme.typography.weights.heavy,
  },
  overallScoreDesc: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    marginTop: 4,
  },
  subScoresContainer: {
    gap: theme.spacing.md,
  },
  subScoreRow: {
    marginBottom: 4,
  },
  subScoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  subScoreLabel: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.medium,
  },
  subScoreValue: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  overviewCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  overviewRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  overviewItem: {
    flex: 1,
  },
  overviewLabel: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  overviewValue: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.bold,
  },
  overviewSection: {
    marginBottom: theme.spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    marginRight: 6,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
  },
  skillsCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  skillBox: {
    paddingVertical: theme.spacing.sm,
  },
  skillBoxTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
  textList: {
    gap: 6,
  },
  textListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  textListBullet: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
    marginRight: 6,
  },
  textListText: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },
  moreText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  rowCards: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  halfCard: {
    flex: 1,
    padding: theme.spacing.md,
    borderWidth: 1,
  },
  halfCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: 6,
  },
  halfCardTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  missingCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
  },
  missingTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  statsCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  statCell: {
    width: '45%',
    backgroundColor: theme.colors.surfaceLight,
    padding: theme.spacing.sm,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  statDates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  statDateText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  checklistCard: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  checklistItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  noBorderBottom: {
    borderBottomWidth: 0,
  },
  checklistLabel: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textPrimary,
  },
  recsCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  recItem: {
    backgroundColor: theme.colors.surfaceLight,
    padding: theme.spacing.md,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  recTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  recDesc: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
});
