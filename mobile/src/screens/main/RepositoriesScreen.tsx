import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, FlatList, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Search, GitFork, SlidersHorizontal, Layers, CheckCircle } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { theme } from '../../theme/theme';
import { useApp } from '../../context/AppContext';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { RepoCard } from '../../components/repo/RepoCard';
import { RepositoriesStackParamList } from '../../navigation/AppNavigator';
import { mockFetchRepositories, Repository, RepoFilters } from '../../services/repo';

type NavigationProp = NativeStackNavigationProp<RepositoriesStackParamList, 'RepoList'>;

export const RepositoriesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { githubConnected, repositories, analyzeRepository } = useApp();

  const [filteredRepos, setFilteredRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters State
  const [search, setSearch] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'analyzed' | 'not_analyzed'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'updated'>('updated');
  
  // Track individual repo analyzing states
  const [analyzingRepoIds, setAnalyzingRepoIds] = useState<{ [id: string]: boolean }>({});

  const languages = ['All', 'TypeScript', 'Python', 'Rust', 'JavaScript', 'Go'];

  const applyFilters = async (showMainLoader = false) => {
    if (!githubConnected) return;
    if (showMainLoader) setLoading(true);

    try {
      const activeFilters: RepoFilters = {
        search,
        language: selectedLanguage,
        status: selectedStatus,
        sortBy,
      };
      const result = await mockFetchRepositories(repositories, activeFilters);
      setFilteredRepos(result);
    } catch (err) {
      console.error('Error fetching filtered repos:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Re-run filter fetch when filter configs or global repos modify
  useEffect(() => {
    applyFilters(filteredRepos.length === 0);
  }, [search, selectedLanguage, selectedStatus, sortBy, repositories, githubConnected]);

  const handleRefresh = () => {
    setRefreshing(true);
    applyFilters();
  };

  const handleAnalyze = async (repoId: string) => {
    // 1. Mark this specific repo as analyzing
    setAnalyzingRepoIds((prev) => ({ ...prev, [repoId]: true }));
    try {
      await analyzeRepository(repoId);
    } catch (err) {
      alert('Analysis failed. Please check network and try again.');
    } finally {
      // 2. Unmark analyzing state
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
          title="GitHub Integration Required"
          description="In order to audit and review repository metrics, you need to connect your GitHub account using a Personal Access Token."
          icon={GitFork}
          actionText="Integrate GitHub Account"
          onAction={() => navigation.navigate('ConnectGitHub')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 1. Header Filter Section */}
      <View style={styles.filterSection}>
        <Input
          placeholder="Search repositories by name..."
          value={search}
          onChangeText={setSearch}
          isSearch
          style={styles.searchInput}
        />

        {/* Language Filter Row */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterRowContent}
        >
          {languages.map((lang) => {
            const isSelected = selectedLanguage === lang;
            return (
              <TouchableOpacity
                key={lang}
                style={[styles.pillBtn, isSelected && styles.pillBtnActive]}
                onPress={() => setSelectedLanguage(lang)}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>
                  {lang}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Status / Sort Row */}
        <View style={styles.subFilterRow}>
          {/* Status Segment */}
          <View style={styles.segmentGroup}>
            <TouchableOpacity
              style={[styles.segmentBtn, selectedStatus === 'all' && styles.segmentBtnActive]}
              onPress={() => setSelectedStatus('all')}
            >
              <Text style={[styles.segmentText, selectedStatus === 'all' && styles.segmentTextActive]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, selectedStatus === 'analyzed' && styles.segmentBtnActive]}
              onPress={() => setSelectedStatus('analyzed')}
            >
              <Text style={[styles.segmentText, selectedStatus === 'analyzed' && styles.segmentTextActive]}>Audited</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, selectedStatus === 'not_analyzed' && styles.segmentBtnActive]}
              onPress={() => setSelectedStatus('not_analyzed')}
            >
              <Text style={[styles.segmentText, selectedStatus === 'not_analyzed' && styles.segmentTextActive]}>New</Text>
            </TouchableOpacity>
          </View>

          {/* Sort Switch */}
          <TouchableOpacity
            style={styles.sortToggle}
            onPress={() => setSortBy(sortBy === 'name' ? 'updated' : 'name')}
            activeOpacity={0.8}
          >
            <SlidersHorizontal size={14} color={theme.colors.secondaryLight} style={{ marginRight: 6 }} />
            <Text style={styles.sortToggleText}>
              Sort: {sortBy === 'name' ? 'A-Z' : 'Recent'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Repositories Grid Feed */}
      {loading ? (
        <LoadingSpinner visible message="Fetching repository listing..." />
      ) : (
        <FlatList
          data={filteredRepos}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RepoCard
              repo={item}
              onAnalyze={handleAnalyze}
              onViewAnalysis={handleViewAnalysis}
              isAnalyzing={!!analyzingRepoIds[item.id]}
            />
          )}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.secondary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No Repositories Found"
              description="No repositories match your active search terms or filtering configs. Adjust filters and try again."
            />
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
  },
  filterSection: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  searchInput: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  filterRow: {
    maxHeight: 36,
    marginBottom: theme.spacing.sm,
  },
  filterRowContent: {
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
  },
  pillBtn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.roundness.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#0B0C10',
    marginRight: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillBtnActive: {
    borderColor: theme.colors.secondary,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
  },
  pillText: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.medium,
  },
  pillTextActive: {
    color: theme.colors.secondaryLight,
    fontWeight: theme.typography.weights.bold,
  },
  subFilterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  segmentGroup: {
    flexDirection: 'row',
    backgroundColor: '#0F1117',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm - 2,
    padding: 2,
  },
  segmentBtn: {
    paddingHorizontal: theme.spacing.md - 2,
    paddingVertical: 4,
    borderRadius: theme.roundness.sm - 4,
  },
  segmentBtnActive: {
    backgroundColor: theme.colors.surfaceLight,
  },
  segmentText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: theme.typography.weights.medium,
  },
  segmentTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.bold,
  },
  sortToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  sortToggleText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.medium,
  },
  listContainer: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
});
