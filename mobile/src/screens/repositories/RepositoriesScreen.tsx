import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Search, GitFork, RefreshCw } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../../theme';
import { useApp } from '../../contexts/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { RepoCard } from '../../components/repo/RepoCard';
import { RepositoriesStackParamList } from '../../navigation/AppNavigator';
import { Repository } from '../../services/repo';
import { getApiErrorMessage } from '../../api/client';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';

type NavigationProp = NativeStackNavigationProp<RepositoriesStackParamList, 'RepoList'>;

export const RepositoriesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { tabBarPaddingBottom } = useTabBarAwareScroll();
  const { githubConnected, repositories, analyzeRepository, refreshGitHubStatus, isLoading } = useApp();

  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [analyzingRepoIds, setAnalyzingRepoIds] = useState<Record<string, boolean>>({});

  const filteredRepos = useMemo(() => {
    const keyword = search.toLowerCase().trim();
    if (!keyword) return repositories;

    return repositories.filter((repo) =>
      [repo.name, repo.fullName, repo.description, repo.language].some((value) =>
        value?.toLowerCase().includes(keyword)
      )
    );
  }, [repositories, search]);

  const handleSync = async () => {
    setRefreshing(true);
    try {
      await refreshGitHubStatus();
    } finally {
      setRefreshing(false);
    }
  };

  const handleAnalyze = async (repoId: string, repoName: string) => {
    setAnalyzingRepoIds((prev) => ({ ...prev, [repoId]: true }));
    try {
      await analyzeRepository(repoId);
      navigation.navigate('RepoAnalysis', { repoId, repoName });
    } catch (err) {
      alert(getApiErrorMessage(err) || 'Analysis failed. Please try again.');
    } finally {
      setAnalyzingRepoIds((prev) => ({ ...prev, [repoId]: false }));
    }
  };

  const handleViewAnalysis = (repoId: string, repoName: string) => {
    navigation.navigate('RepoAnalysis', { repoId, repoName });
  };

  if (!githubConnected) {
    return (
      <View style={styles.disconnectedContainer}>
        <EmptyState
          title="GitHub Connection Required"
          description="Sync repositories from GitHub, view cached data, and run analysis for each repo."
          icon={GitFork}
          actionText="Connect GitHub"
          onAction={() => navigation.navigate('ConnectGitHub')}
        />
      </View>
    );
  }

  const listHeader = (
    <View style={styles.pageContent}>
      <View style={styles.headerText}>
        <Text style={styles.pageTitle}>Repositories</Text>
        <Text style={styles.pageSubtitle}>
          Sync repositories from GitHub, view cached data, and run analysis for each repo.
        </Text>
      </View>

      <Card style={styles.listCard} padded={false}>
        <View style={styles.toolbarRow}>
          <View style={styles.searchBox}>
            <Search size={16} color={theme.colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search repositories..."
              placeholderTextColor={theme.colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <Button
            title="Sync"
            onPress={handleSync}
            loading={refreshing || isLoading}
            fullWidth={false}
            style={styles.syncBtn}
            icon={<RefreshCw size={14} color={theme.colors.textPrimary} />}
          />
        </View>
        <Text style={styles.countText}>{filteredRepos.length} repositories</Text>
      </Card>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {isLoading && repositories.length === 0 ? (
        <LoadingSpinner visible message="Loading repositories..." />
      ) : (
        <FlatList
          data={filteredRepos}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          renderItem={({ item }: { item: Repository }) => (
            <View style={styles.cardWrap}>
              <RepoCard
                repo={item}
                onAnalyze={(repoId) => handleAnalyze(repoId, item.name)}
                onViewAnalysis={handleViewAnalysis}
                isAnalyzing={!!analyzingRepoIds[item.id]}
              />
            </View>
          )}
          contentContainerStyle={[styles.listContainer, { paddingBottom: tabBarPaddingBottom }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleSync}
              tintColor={theme.colors.secondary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState
                title="No repositories"
                description="Connect GitHub and tap Sync to load your repositories."
              />
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  disconnectedContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  pageContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  headerText: {
    gap: 4,
    marginBottom: theme.spacing.xs,
  },
  pageTitle: {
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  pageSubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },
  syncBtn: {
    minWidth: 88,
    height: 44,
  },
  listCard: {
    marginBottom: theme.spacing.sm,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: theme.spacing.sm,
    minHeight: 44,
  },
  searchIcon: {
    marginRight: theme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.spacing.sm + 2,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textPrimary,
  },
  countText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
    textAlign: 'right',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  listContainer: {
    paddingBottom: theme.spacing.xxl,
  },
  cardWrap: {
    paddingHorizontal: theme.spacing.lg,
  },
  emptyWrap: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
});
