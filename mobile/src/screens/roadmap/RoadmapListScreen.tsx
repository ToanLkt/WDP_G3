import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Sparkles,
  FolderOpen,
  BookmarkCheck,
  Archive,
  Search,
  ChevronDown,
} from 'lucide-react-native';

import { theme } from '../../theme';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { RoadmapCard } from '../../components/roadmap/RoadmapCard';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import { fetchMyAnalyses } from '../../services/analysis';
import { roadmapService, roadmapTargetRoles } from '../../features/roadmaps/api';
import {
  defaultRoadmapFilters,
  filterRoadmaps,
  countCompletedNodes,
  countRoadmapNodes,
} from '../../features/roadmaps/filterUtils';
import {
  recommendJobReadinessRoadmaps,
  recommendRoadmapRole,
  type RoadmapRoleRecommendation,
} from '../../features/roadmaps/recommendation';
import type { Roadmap } from '../../features/roadmaps/types';
import type { AnalysisResult } from '../../types';
import type { RoadmapStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RoadmapStackParamList, 'RoadmapList'>;

export const RoadmapListScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { tabBarPaddingBottom } = useTabBarAwareScroll();

  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState<string>('Backend Developer');
  const [rolePickerVisible, setRolePickerVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const [filters, setFilters] = useState(defaultRoadmapFilters);

  const recommendedRoadmap = useMemo(() => recommendRoadmapRole(analyses), [analyses]);
  const jobReadinessRoadmaps = useMemo(() => recommendJobReadinessRoadmaps(analyses), [analyses]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [roadmapList, analysisList] = await Promise.all([
        roadmapService.getRoadmaps({ status: statusFilter }),
        fetchMyAnalyses().catch(() => [] as AnalysisResult[]),
      ]);
      setRoadmaps(roadmapList);
      setAnalyses(analysisList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách roadmap.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const filteredRoadmaps = useMemo(() => filterRoadmaps(roadmaps, filters), [roadmaps, filters]);

  const inProgressCount = roadmaps.filter((r) => r.progress > 0 && r.progress < 100).length;
  const archivedCount = roadmaps.filter((r) => r.status === 'archived').length;
  const completedNodes = roadmaps.reduce((sum, r) => sum + countCompletedNodes(r), 0);
  const totalNodes = roadmaps.reduce((sum, r) => sum + countRoadmapNodes(r), 0);

  const openRoadmap = (roadmap: Roadmap) => {
    navigation.navigate('RoadmapDetail', { roadmapId: roadmap.id, title: roadmap.title });
  };

  const handleGenerate = async (role: string, actionKey = role) => {
    setIsGenerating(true);
    setGeneratingKey(actionKey);
    setError(null);
    try {
      const recommendation = await roadmapService.generateAIRoadmap(role, false);
      await loadData();
      openRoadmap(recommendation.roadmap);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể tạo roadmap.';
      setError(message);
      Alert.alert('Tạo roadmap thất bại', message);
    } finally {
      setIsGenerating(false);
      setGeneratingKey(null);
    }
  };

  const handleGenerateSuggestion = (suggestion: RoadmapRoleRecommendation) => {
    handleGenerate(suggestion.role, `suggestion-${suggestion.role}`);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarPaddingBottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Badge label="Roadmap cá nhân hóa" variant="secondary" />
        <Text style={styles.pageTitle}>Roadmap của tôi</Text>
        <Text style={styles.pageSubtitle}>
          Quản lý các lộ trình học được tạo từ hồ sơ GitHub và mục tiêu nghề nghiệp của bạn.
        </Text>
      </View>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: 'rgba(124, 58, 237, 0.12)' }]}>
            <FolderOpen size={18} color={theme.colors.primaryLight} />
          </View>
          <Text style={styles.statValue}>{roadmaps.length}</Text>
          <Text style={styles.statLabel}>
            {statusFilter === 'active' ? 'Roadmap đang học' : 'Roadmap lưu trữ'}
          </Text>
        </Card>
        <Card style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
            {statusFilter === 'active' ? (
              <BookmarkCheck size={18} color={theme.colors.secondaryLight} />
            ) : (
              <Archive size={18} color={theme.colors.secondaryLight} />
            )}
          </View>
          <Text style={styles.statValue}>{statusFilter === 'active' ? inProgressCount : archivedCount}</Text>
          <Text style={styles.statLabel}>{statusFilter === 'active' ? 'Có tiến độ học' : 'Đã cất đi'}</Text>
        </Card>
        <Card style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
            <Sparkles size={18} color={theme.colors.success} />
          </View>
          <Text style={styles.statValue}>{completedNodes}/{totalNodes || 0}</Text>
          <Text style={styles.statLabel}>Nhiệm vụ đã hoàn thành</Text>
        </Card>
      </View>

      <Card style={styles.createCard} padded={false}>
        <View style={styles.createGradient} />
        <Text style={styles.sectionTitle}>Bạn muốn đi theo hướng nào tiếp theo?</Text>
        <Text style={styles.sectionDesc}>
          Chọn vai trò mục tiêu, hệ thống sẽ tạo hoặc mở lại roadmap phù hợp với tài khoản của bạn.
        </Text>
        <View style={styles.createColumn}>
          <TouchableOpacity
            style={styles.rolePicker}
            onPress={() => setRolePickerVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.rolePickerLabel}>Vai trò mục tiêu</Text>
            <View style={styles.rolePickerValueRow}>
              <Text style={styles.rolePickerText} numberOfLines={2}>{targetRole}</Text>
              <ChevronDown size={18} color={theme.colors.secondaryLight} />
            </View>
          </TouchableOpacity>
          <View style={styles.buttonBlock}>
            <Button
              title="Tạo lộ trình"
              onPress={() => handleGenerate(targetRole, 'manual')}
              loading={generatingKey === 'manual'}
              disabled={isGenerating}
              icon={<Sparkles size={16} color={theme.colors.textPrimary} />}
            />
          </View>
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </Card>

      <Card style={styles.aiCard} padded={false}>
        <Text style={styles.sectionTitle}>AI đề xuất roadmap phù hợp</Text>
        {recommendedRoadmap ? (
          <Text style={[styles.sectionDesc, styles.sectionDescLast]}>
            Đề xuất chính:{' '}
            <Text style={styles.highlight}>{recommendedRoadmap.role}</Text>. {recommendedRoadmap.reason}
          </Text>
        ) : (
          <Text style={[styles.sectionDesc, styles.sectionDescLast]}>
            Chưa có đủ dữ liệu phân tích repository. Hãy phân tích ít nhất một repository để AI đề xuất hướng đi phù hợp hơn.
          </Text>
        )}
        <View style={styles.buttonBlock}>
          <Button
            title="Tạo theo đề xuất chính"
            onPress={() => recommendedRoadmap && handleGenerate(recommendedRoadmap.role, 'primary-recommendation')}
            loading={generatingKey === 'primary-recommendation'}
            disabled={!recommendedRoadmap || isGenerating}
            icon={<Sparkles size={16} color={theme.colors.textPrimary} />}
          />
        </View>

        {jobReadinessRoadmaps.length > 0 && (
          <View style={styles.suggestionsBlock}>
            <Text style={styles.suggestionHeading}>2 đề xuất phụ để tăng khả năng xin việc</Text>
            <Text style={styles.sectionDesc}>
              Các lộ trình phụ tập trung vào những tín hiệu nhà tuyển dụng thường kiểm tra: kiểm thử, triển khai, CI/CD, tài liệu và chất lượng code.
            </Text>
            {jobReadinessRoadmaps.map((suggestion) => (
              <View key={suggestion.role + suggestion.title} style={styles.suggestionCard}>
                <Badge label="Phụ trợ xin việc" variant="warning" />
                <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                <Text style={styles.suggestionRole}>{suggestion.role}</Text>
                <Text style={styles.suggestionReason}>{suggestion.reason}</Text>
                <Text style={styles.suggestionFocus}>Trọng tâm: {suggestion.focus}</Text>
                <View style={styles.buttonBlock}>
                  <Button
                    title="Tạo lộ trình"
                    onPress={() => handleGenerateSuggestion(suggestion)}
                    loading={generatingKey === `suggestion-${suggestion.role}`}
                    disabled={isGenerating}
                    icon={<Sparkles size={16} color={theme.colors.textPrimary} />}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card style={styles.filterCard}>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, statusFilter === 'active' && styles.tabBtnActive]}
            onPress={() => setStatusFilter('active')}
          >
            <Text style={[styles.tabText, statusFilter === 'active' && styles.tabTextActive]}>Đang học</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, statusFilter === 'archived' && styles.tabBtnActive]}
            onPress={() => setStatusFilter('archived')}
          >
            <Text style={[styles.tabText, statusFilter === 'archived' && styles.tabTextActive]}>Lưu trữ</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchRow}>
          <Search size={16} color={theme.colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo tên roadmap, kỹ năng hoặc vai trò"
            placeholderTextColor={theme.colors.textMuted}
            value={filters.search}
            onChangeText={(search) => setFilters((prev) => ({ ...prev, search }))}
          />
        </View>
      </Card>

      <View style={styles.listHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.listTitle}>
            {statusFilter === 'active' ? 'Roadmap đang học' : 'Roadmap lưu trữ'}
          </Text>
          <Text style={styles.listSubtitle}>
            {statusFilter === 'active'
              ? 'Các roadmap active, đang nằm trong lộ trình học chính và có thể tiếp tục đánh dấu tiến độ.'
              : 'Các roadmap archived, đã được cất khỏi lộ trình học chính để bạn xem lại khi cần.'}
          </Text>
        </View>
        <Badge label={`${filteredRoadmaps.length} lộ trình`} variant="muted" />
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Đang tải roadmap...</Text>
        </View>
      ) : filteredRoadmaps.length > 0 ? (
        filteredRoadmaps.map((roadmap) => (
          <RoadmapCard key={roadmap.id} roadmap={roadmap} onPress={() => openRoadmap(roadmap)} />
        ))
      ) : roadmaps.length > 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Không có roadmap phù hợp bộ lọc</Text>
          <Text style={styles.emptyDesc}>Hãy thử từ khóa khác hoặc đặt lại bộ lọc.</Text>
        </Card>
      ) : (
        <EmptyState
          title={statusFilter === 'active' ? 'Chưa có roadmap đang học' : 'Chưa có roadmap lưu trữ'}
          description={
            statusFilter === 'active'
              ? 'Tạo roadmap đầu tiên để bắt đầu một lộ trình học theo mục tiêu nghề nghiệp của bạn.'
              : 'Khi bạn lưu trữ roadmap, chúng sẽ xuất hiện ở đây để xem lại sau.'
          }
          icon={Sparkles}
          actionText={statusFilter === 'active' ? 'Tạo roadmap đầu tiên' : undefined}
          onAction={statusFilter === 'active' ? () => handleGenerate(targetRole) : undefined}
        />
      )}

      <Modal visible={rolePickerVisible} transparent animationType="slide" onRequestClose={() => setRolePickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setRolePickerVisible(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Chọn vai trò mục tiêu</Text>
            <FlatList
              data={[...roadmapTargetRoles]}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.roleOption, item === targetRole && styles.roleOptionActive]}
                  onPress={() => {
                    setTargetRole(item);
                    setRolePickerVisible(false);
                  }}
                >
                  <Text style={[styles.roleOptionText, item === targetRole && styles.roleOptionTextActive]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  pageTitle: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.sm,
  },
  pageSubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
    lineHeight: theme.typography.lineHeights.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  statCard: {
    flex: 1,
    padding: theme.spacing.sm + 2,
    alignItems: 'flex-start',
  },
  statIcon: {
    padding: 8,
    borderRadius: theme.roundness.sm,
    marginBottom: theme.spacing.xs,
  },
  statValue: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  statLabel: {
    fontSize: 10,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  createCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  createGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: theme.colors.secondary,
  },
  aiCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
    marginBottom: theme.spacing.md,
  },
  sectionDescLast: {
    marginBottom: theme.spacing.sm,
  },
  buttonBlock: {
    width: '100%',
    marginTop: theme.spacing.sm,
  },
  highlight: {
    color: theme.colors.secondaryLight,
    fontWeight: theme.typography.weights.bold,
  },
  createColumn: {
    gap: theme.spacing.md,
  },
  rolePicker: {
    width: '100%',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surfaceLight,
    minHeight: 56,
  },
  rolePickerLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    fontWeight: theme.typography.weights.medium,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rolePickerValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  rolePickerText: {
    flex: 1,
    fontSize: theme.typography.sizes.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.bold,
  },
  errorText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.warning,
  },
  suggestionsBlock: {
    marginTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
  },
  suggestionHeading: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  suggestionCard: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceLight,
  },
  suggestionTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.sm,
  },
  suggestionRole: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.secondaryLight,
    fontWeight: theme.typography.weights.bold,
    marginTop: 2,
  },
  suggestionReason: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    lineHeight: theme.typography.lineHeights.sm,
  },
  suggestionFocus: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
  filterCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.roundness.sm,
    padding: 4,
    marginBottom: theme.spacing.md,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.roundness.sm - 2,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: theme.colors.surface,
  },
  tabText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
    fontWeight: theme.typography.weights.medium,
  },
  tabTextActive: {
    color: theme.colors.secondaryLight,
    fontWeight: theme.typography.weights.bold,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceLight,
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
  listHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  listTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  listSubtitle: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textMuted,
    marginTop: 4,
    lineHeight: theme.typography.lineHeights.xs + 4,
  },
  loadingBox: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.sm,
    color: theme.colors.textMuted,
    fontSize: theme.typography.sizes.sm,
  },
  emptyCard: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  emptyDesc: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.roundness.lg,
    borderTopRightRadius: theme.roundness.lg,
    maxHeight: '60%',
    padding: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  roleOption: {
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  roleOptionActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
  },
  roleOptionText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textPrimary,
  },
  roleOptionTextActive: {
    color: theme.colors.secondaryLight,
    fontWeight: theme.typography.weights.bold,
  },
});
