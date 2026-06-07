import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ScrollView, RefreshControl, Image } from 'react-native';
import { Terminal, GitFork, FolderCode, Award, ArrowRight, Activity, Cpu } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { theme } from '../../theme';
import { useApp } from '../../contexts/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorDisplay } from '../../components/ui/ErrorDisplay';
import { fetchDashboardDataWithFallback, DashboardData } from '../../services/dashboard';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, githubConnected, githubUser, repositories } = useApp();
  const { tabBarPaddingBottom } = useTabBarAwareScroll();
  
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    setError('');
    try {
      const stats = await fetchDashboardDataWithFallback(githubConnected, repositories);
      setData(stats);
    } catch (err: any) {
      setError(err.message || 'Could not load dashboard statistics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [githubConnected, repositories]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  if (loading) {
    return <LoadingSpinner visible message="Analyzing dashboard..." />;
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={fetchStats} />;
  }

  // Calculate percentage of analyzed repos
  const percentAnalyzed = data && data.total_repos > 0 
    ? Math.round((data.analyzed_repos / data.total_repos) * 100)
    : 0;

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarPaddingBottom }]}
      refreshControl={
        <RefreshControl 
          refreshing={refreshing} 
          onRefresh={onRefresh} 
          tintColor={theme.colors.secondary} 
        />
      }
    >
      {/* 1. Header Greeting */}
      <View style={styles.welcomeSection}>
        <View>
          <Text style={styles.greetText}>WELCOME BACK,</Text>
          <Text style={styles.nameText}>{user?.name || 'Developer'}</Text>
        </View>
        <View style={styles.iconBorder}>
          <Cpu size={22} color={theme.colors.secondary} />
        </View>
      </View>

      {/* 2. GitHub Connection Control */}
      {!githubConnected ? (
        <Card style={styles.connectCard} glow="violet">
          <View style={styles.connectLeft}>
            <View style={styles.githubAlertCircle}>
              <GitFork size={24} color={theme.colors.textPrimary} />
            </View>
            <View style={styles.connectTextCol}>
              <Text style={styles.connectTitle}>Integrate GitHub</Text>
              <Text style={styles.connectDesc}>Connect public repositories to unlock AI Code Audit analysis.</Text>
            </View>
          </View>
          <Button
            title="Link Account"
            onPress={() => navigation.navigate('RepositoriesTab', { screen: 'ConnectGitHub' })}
            variant="primary"
            style={styles.connectBtn}
            icon={<ArrowRight size={14} color="#FFF" style={{ marginLeft: 6 }} />}
          />
        </Card>
      ) : (
        <Card style={styles.githubActiveCard} glow="cyan">
          <View style={styles.activeProfileRow}>
            {githubUser && (
              <Image source={{ uri: githubUser.avatarUrl }} style={styles.activeAvatar} />
            )}
            <View style={styles.activeInfoCol}>
              <View style={styles.activeTagRow}>
                <Text style={styles.activeName}>@{githubUser?.username || 'octocat'}</Text>
                <Badge label="Connected" variant="success" style={styles.activeBadge} />
              </View>
              <Text style={styles.activeDesc}>Git analytics pipelines synced successfully.</Text>
            </View>
          </View>
        </Card>
      )}

      {/* 3. Core Technical Focus */}
      {githubConnected && data && (
        <Card style={styles.focusCard} glow="none">
          <View style={styles.focusHeader}>
            <Award size={20} color={theme.colors.warning} />
            <Text style={styles.focusLabel}>RECOMMENDED CAREER PATHWAY</Text>
          </View>
          <Text style={styles.focusValue}>{data.current_skill_direction}</Text>
          <Text style={styles.focusSubtext}>
            Aggregated based on your primary programming language profiles. Connect more repos to refine your profile.
          </Text>
        </Card>
      )}

      {/* 4. Repository Codebase Analytics */}
      <SectionHeader title="System Analytics Overview" accentColor={theme.colors.primary} />
      
      {!githubConnected ? (
        <Card style={styles.emptyOverviewCard}>
          <Text style={styles.emptyOverviewText}>
            No code analyses available. Connect your GitHub account to start tracking repository quality and code health.
          </Text>
        </Card>
      ) : (
        <View style={styles.statsGrid}>
          <View style={styles.gridColLeft}>
            <Card style={styles.statMiniCard}>
              <FolderCode size={20} color={theme.colors.secondary} style={styles.miniIcon} />
              <Text style={styles.miniLabel}>Total Codebases</Text>
              <Text style={styles.miniValue}>{data?.total_repos}</Text>
            </Card>
          </View>
          <View style={styles.gridColRight}>
            <Card style={styles.statMiniCard}>
              <Activity size={20} color={theme.colors.success} style={styles.miniIcon} />
              <Text style={styles.miniLabel}>Audited Items</Text>
              <Text style={styles.miniValue}>{data?.analyzed_repos}</Text>
            </Card>
          </View>
        </View>
      )}

      {githubConnected && data && data.total_repos > 0 && (
        <Card style={styles.progressCard}>
          <View style={styles.progressHeaderRow}>
            <Text style={styles.progressLabel}>Audit Coverage</Text>
            <Text style={styles.progressPercent}>{percentAnalyzed}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${percentAnalyzed}%` }]} />
          </View>
          <Text style={styles.progressSub}>
            {data.analyzed_repos} of {data.total_repos} repositories analyzed. Let's analyze the remaining ones!
          </Text>
        </Card>
      )}

      {/* 5. Shortcuts Button Row */}
      <View style={styles.shortcutsContainer}>
        <Button
          title="Browse Repositories"
          onPress={() => navigation.navigate('RepositoriesTab', { screen: 'RepoList' })}
          variant="secondary"
          style={styles.shortcutBtn}
        />
        <Button
          title="Consult AI Mentor"
          onPress={() => navigation.navigate('ChatTab')}
          variant="outline"
          style={styles.shortcutBtn}
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
  welcomeSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  greetText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 1.5,
  },
  nameText: {
    fontSize: theme.typography.sizes.xxl - 2,
    fontWeight: theme.typography.weights.heavy,
    color: theme.colors.textPrimary,
    marginTop: 2,
  },
  iconBorder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  connectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  githubAlertCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  connectTextCol: {
    flex: 1,
  },
  connectTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  connectDesc: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: theme.typography.lineHeights.xs + 2,
  },
  connectBtn: {
    height: 40,
  },
  githubActiveCard: {
    padding: theme.spacing.md + 2,
    marginBottom: theme.spacing.xl,
  },
  activeProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: theme.colors.secondary,
    marginRight: theme.spacing.md,
  },
  activeInfoCol: {
    flex: 1,
  },
  activeTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeName: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginRight: theme.spacing.sm,
  },
  activeBadge: {
    paddingVertical: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  activeDesc: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  focusCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    backgroundColor: '#0F1117',
  },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  focusLabel: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    marginLeft: theme.spacing.sm,
    letterSpacing: 1,
  },
  focusValue: {
    fontSize: theme.typography.sizes.lg - 1,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.warning,
    marginBottom: theme.spacing.xs,
  },
  focusSubtext: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.xs + 2,
  },
  emptyOverviewCard: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    backgroundColor: '#0F1117',
  },
  emptyOverviewText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    marginHorizontal: -theme.spacing.sm,
  },
  gridColLeft: {
    flex: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  gridColRight: {
    flex: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  statMiniCard: {
    padding: theme.spacing.md + 2,
    alignItems: 'center',
  },
  miniIcon: {
    marginBottom: theme.spacing.sm,
  },
  miniLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  miniValue: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.heavy,
    color: theme.colors.textPrimary,
  },
  progressCard: {
    padding: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  progressLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  progressPercent: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.secondaryLight,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.secondary,
    borderRadius: 4,
  },
  progressSub: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
  },
  shortcutsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  shortcutBtn: {
    width: '48%',
    height: 42,
  },
});
