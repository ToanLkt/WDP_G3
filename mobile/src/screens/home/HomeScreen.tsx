import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  FolderGit2,
  CircleCheck,
  GitFork,
  TrendingUp,
  MessageSquare,
  ArrowRight,
  Bell,
  Code,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../../theme';
import { useApp } from '../../contexts/AppContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorDisplay } from '../../components/ui/ErrorDisplay';
import { fetchDashboardOverview, DashboardOverview } from '../../services/dashboard';
import { fetchMyAnalyses } from '../../services/analysis';
import { buildRepositoryAnalysisOverview } from '../../features/dashboard/analysisOverview';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { getScoreColor } from '../../utils/getScoreColor';
import type { AnalysisResult } from '../../types';

type StatCardProps = {
  label: string;
  value?: string | number;
  icon: React.ReactNode;
  iconBg: string;
  valueColor?: string;
  footer?: React.ReactNode;
};

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, iconBg, valueColor, footer }) => (
  <Card style={styles.statCard}>
    <View style={styles.statCardRow}>
      <View style={styles.statCardText}>
        <Text style={styles.statLabel}>{label}</Text>
        {footer ?? (
          <Text style={[styles.statValue, valueColor ? { color: valueColor } : undefined]}>
            {value ?? '-'}
          </Text>
        )}
      </View>
      <View style={[styles.statIconWrap, { backgroundColor: iconBg }]}>
        {icon}
      </View>
    </View>
  </Card>
);

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const { tabBarPaddingBottom } = useTabBarAwareScroll();

  const [dashboard, setDashboard] = useState<DashboardOverview | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    setError('');
    try {
      const [overview, myAnalyses] = await Promise.all([
        fetchDashboardOverview(),
        fetchMyAnalyses().catch(() => [] as AnalysisResult[]),
      ]);
      setDashboard(overview);
      setAnalyses(myAnalyses);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể tải dashboard.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const analysisOverview = useMemo(() => buildRepositoryAnalysisOverview(analyses), [analyses]);

  const overallScore = analysisOverview?.averageOverallScore ?? 0;
  const displayName = dashboard?.user.name || user?.name || 'bạn';

  const fallbackSummary = useMemo(() => {
    if (analysisOverview?.summary) return analysisOverview.summary;
    if (!dashboard) return '';

    const career = dashboard.suggestedCareerPath || 'Software Engineer';
    const strength = dashboard.skills.strong[0] || 'nền tảng dự án GitHub';
    const gap = dashboard.skills.missing[0];

    if (gap) {
      return `Tổng quan ${dashboard.repositories.analyzed} repo cho thấy hướng nổi bật là ${career}, điểm mạnh hiện tại là ${strength}, và kỹ năng nên ưu tiên bổ sung là ${gap}.`;
    }

    return dashboard.suggestedCareerPath || 'Chưa có phân tích nào. Hãy đồng bộ repository và chạy phân tích để xem nhận xét tổng quan.';
  }, [analysisOverview, dashboard]);

  const missingSkillTags = useMemo(() => {
    if (analysisOverview?.missingSkills.length) {
      return analysisOverview.missingSkills.map((item) => item.label);
    }
    return dashboard?.skills.missing.slice(0, 8) ?? [];
  }, [analysisOverview, dashboard]);

  const careerTags = useMemo(() => {
    if (analysisOverview?.topCareerDirections.length) {
      return analysisOverview.topCareerDirections;
    }
    if (dashboard?.suggestedCareerPath) {
      const match = dashboard.suggestedCareerPath.match(/Generalist Software Engineer|Frontend Developer|Backend Developer|Fullstack Developer|Mobile Developer|Software Engineer/i);
      return [{ label: match?.[0] ?? 'Software Engineer', count: dashboard.repositories.analyzed }];
    }
    return [];
  }, [analysisOverview, dashboard]);

  const techTags = useMemo(() => {
    if (analysisOverview) {
      return [...analysisOverview.topLanguages, ...analysisOverview.topFrameworks].slice(0, 6);
    }
    return [];
  }, [analysisOverview]);

  if (loading) {
    return <LoadingSpinner visible message="Đang tải dashboard..." />;
  }

  if (error && !dashboard) {
    return <ErrorDisplay message={error} onRetry={loadDashboard} />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingTop: insets.top + theme.spacing.md, paddingBottom: tabBarPaddingBottom },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.secondary} />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.title}>Chào mừng, {displayName}!</Text>
          <TouchableOpacity onPress={() => navigation.navigate('NotificationsTab')} style={styles.notificationBtn}>
            <Bell size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>
          Tổng quan GitHub, kết quả phân tích và các bước tiếp theo cho lộ trình phát triển của bạn.
        </Text>
      </View>

      {error ? (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>Chưa tải đủ dữ liệu: {error}</Text>
        </View>
      ) : null}

      <View style={styles.statsGrid}>
        <View style={styles.statsCol}>
          <StatCard
            label="Repository"
            value={dashboard?.repositories.total ?? 0}
            icon={<FolderGit2 size={22} color={theme.colors.primaryLight} />}
            iconBg="rgba(124, 58, 237, 0.15)"
          />
        </View>
        <View style={styles.statsCol}>
          <StatCard
            label="Đã phân tích"
            value={dashboard?.repositories.analyzed ?? 0}
            icon={<CircleCheck size={22} color={theme.colors.success} />}
            iconBg="rgba(16, 185, 129, 0.15)"
          />
        </View>
        <View style={styles.statsCol}>
          <StatCard
            label="GitHub"
            icon={<GitFork size={22} color={theme.colors.secondaryLight} />}
            iconBg="rgba(6, 182, 212, 0.15)"
            footer={
              <Badge
                label={dashboard?.github.connected ? 'Đã kết nối' : 'Chưa kết nối'}
                variant={dashboard?.github.connected ? 'success' : 'muted'}
                style={styles.githubBadge}
              />
            }
          />
        </View>
        <View style={styles.statsCol}>
          <StatCard
            label="Điểm tổng quan"
            value={overallScore > 0 ? overallScore : '-'}
            valueColor={overallScore > 0 ? getScoreColor(overallScore) : theme.colors.textPrimary}
            icon={<TrendingUp size={22} color={theme.colors.primaryLight} />}
            iconBg="rgba(124, 58, 237, 0.15)"
          />
        </View>
      </View>



      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Phân tích gần đây</Text>
            <Text style={styles.sectionDesc}>Kết quả mới nhất của tài khoản hiện tại.</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('RepositoriesTab', { screen: 'RepoList' })}
            style={styles.linkBtn}
          >
            <Text style={styles.linkBtnText}>Repository</Text>
            <ArrowRight size={14} color={theme.colors.secondaryLight} />
          </TouchableOpacity>
        </View>

        {analyses.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyBoxText}>Chưa có phân tích. Hãy đồng bộ repository và chạy phân tích.</Text>
          </View>
        ) : (
          <View style={styles.analysisList}>
            {analyses.slice(0, 4).map((analysis, idx) => {
              const score = analysis.scores.overallScore ?? analysis.scores.overall;
              return (
                <TouchableOpacity
                  key={analysis.id || analysis.repositoryId || idx}
                  style={styles.analysisItem}
                  activeOpacity={0.85}
                  onPress={() =>
                    navigation.navigate('RepositoriesTab', {
                      screen: 'RepoAnalysis',
                      params: {
                        repoId: analysis.repositoryId,
                        repoName: analysis.repositoryName || analysis.repoName || 'Repository',
                      },
                    })
                  }
                >
                  <View style={styles.analysisItemText}>
                    <Text style={styles.analysisName}>{analysis.repositoryName || analysis.repoName}</Text>
                    <Text style={styles.analysisTime}>{formatRelativeTime(analysis.createdAt)}</Text>
                  </View>
                  <Text style={[styles.analysisScore, { color: getScoreColor(score) }]}>
                    {typeof score === 'number' ? Number(score).toFixed(2).replace(/\.00$/, '') : score}%
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
        <Text style={styles.sectionDesc}>Những bước chính để cập nhật dữ liệu và nhận tư vấn từ AI.</Text>

        <View style={styles.quickActions}>
          <Button
            title="Kết nối GitHub"
            variant="outline"
            onPress={() => navigation.navigate('SettingsTab', { screen: 'ConnectGitHub' })}
            icon={<GitFork size={16} color={theme.colors.textPrimary} />}
            style={styles.quickActionBtn}
          />
          <Button
            title="Đồng bộ / phân tích repository"
            variant="outline"
            onPress={() => navigation.navigate('RepositoriesTab', { screen: 'RepoList' })}
            icon={<Code size={16} color={theme.colors.textPrimary} />}
            style={styles.quickActionBtn}
          />
          <Button
            title="Xem roadmap đề xuất"
            variant="outline"
            onPress={() => navigation.navigate('RoadmapTab')}
            icon={<TrendingUp size={16} color={theme.colors.textPrimary} />}
            style={styles.quickActionBtn}
          />
          <Button
            title="Hỏi AI Mentor"
            variant="outline"
            onPress={() => navigation.navigate('ChatTab')}
            icon={<MessageSquare size={16} color={theme.colors.textPrimary} />}
            style={styles.quickActionBtn}
          />
        </View>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    paddingHorizontal: theme.spacing.lg,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing.md,
  },
  notificationBtn: {
    padding: 8,
    marginRight: -8,
  },
  subtitle: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },
  warningBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  warningText: {
    color: theme.colors.warning,
    fontSize: theme.typography.sizes.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  statsCol: {
    width: '50%',
    paddingHorizontal: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  statCard: {
    padding: theme.spacing.md,
    minHeight: 96,
  },
  statCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statCardText: {
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  statLabel: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
  },
  statValue: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.roundness.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  githubBadge: {
    marginTop: theme.spacing.xs,
    alignSelf: 'flex-start',
  },
  sectionCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  sectionDesc: {
    marginTop: 4,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  sectionHeaderText: {
    flex: 1,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
  },
  linkBtnText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.secondaryLight,
    fontWeight: theme.typography.weights.medium,
  },
  overviewBody: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.md,
  },
  summaryBox: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
  },
  summaryText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },
  miniStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  miniStatItem: {
    width: '48%',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
  },
  miniStatValue: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  miniStatLabel: {
    marginTop: 2,
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
  },
  tagSection: {
    gap: theme.spacing.sm,
  },
  tagSectionTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  tag: {
    marginBottom: 0,
  },
  emptyTagText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
  },
  emptyBox: {
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.lg,
  },
  emptyBoxText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.sm,
  },
  analysisList: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  analysisItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceLight,
  },
  analysisItemText: {
    flex: 1,
    paddingRight: theme.spacing.md,
  },
  analysisName: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  analysisTime: {
    marginTop: 2,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
  },
  analysisScore: {
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
  },
  quickActions: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  quickActionBtn: {
    height: 50,
  },
});
