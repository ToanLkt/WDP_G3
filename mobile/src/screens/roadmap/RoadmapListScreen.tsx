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
  Bell,
  CheckCircle2,
} from 'lucide-react-native';

import { theme } from '../../theme';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CustomAlert } from '../../components/ui/CustomAlert';
import { EmptyState } from '../../components/ui/EmptyState';
import { RoadmapCard } from '../../components/roadmap/RoadmapCard';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import { fetchMyAnalyses, fetchRoleMatches } from '../../services/analysis';
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
import type { AnalysisResult, RoleMatch } from '../../types';
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
  
  // Customization States for Source Selection
  const [sourceMode, setSourceMode] = useState<'single_repo' | 'selected_repos' | 'all_analyzed_repos'>('single_repo');
  const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>([]);
  const [showCreateSection, setShowCreateSection] = useState(true);
  const [isMatchingRoles, setIsMatchingRoles] = useState(false);
  const [repoPickerVisible, setRepoPickerVisible] = useState(false);
  const [repoPickerMulti, setRepoPickerMulti] = useState(false);
  // Server-based role recommendations (primary). Falls back to local logic if unavailable.
  const [serverRecommendedRole, setServerRecommendedRole] = useState<RoadmapRoleRecommendation | null>(null);
  const [serverJobRoadmaps, setServerJobRoadmaps] = useState<RoadmapRoleRecommendation[]>([]);
  // Full role matches from server (for rich role cards)
  const [serverRoleMatches, setServerRoleMatches] = useState<RoleMatch[]>([]);
  // Error alert state
  const [errorAlert, setErrorAlert] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const [deleteDialog, setDeleteDialog] = useState<{ visible: boolean; roadmap: Roadmap | null }>({ visible: false, roadmap: null });

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => (navigation as any).navigate('NotificationsTab')}
          style={{ padding: 8, marginRight: -8 }}
        >
          <Bell size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // Merge server recommendations with local fallback
  const recommendedRoadmap = serverRecommendedRole ?? recommendRoadmapRole(analyses);
  const jobReadinessRoadmaps = serverJobRoadmaps.length > 0 ? serverJobRoadmaps : recommendJobReadinessRoadmaps(analyses);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [roadmapList, analysisList] = await Promise.all([
        roadmapService.getRoadmaps({ status: statusFilter }),
        fetchMyAnalyses().catch(() => [] as AnalysisResult[]),
      ]);

      // Fetch progress for each roadmap in parallel (best-effort) to show correct % in card
      const withProgress = await Promise.all(
        roadmapList.map(async (roadmap) => {
          try {
            const prog = await roadmapService.getRoadmapProgress(roadmap.id);
            if (prog?.progressSummary) {
              return {
                ...roadmap,
                progress: prog.progressSummary.overallProgress ?? roadmap.progress,
                progressSummary: {
                  totalItems: prog.progressSummary.totalItems,
                  completedItems: prog.progressSummary.completedItems,
                  inProgressItems: prog.progressSummary.inProgressItems,
                },
              };
            }
          } catch { /* ignore */ }
          return roadmap;
        })
      );

      setRoadmaps(withProgress);
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

  const filteredRoadmaps = useMemo(() => {
    const filtered = filterRoadmaps(roadmaps, filters);
    // Deduplicate by id – API may return duplicates
    const seen = new Set<string>();
    return filtered.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }, [roadmaps, filters]);

  const analyzedRepos = useMemo(() => {
    const repos = new Map<string, { id: string; name: string }>();
    analyses.forEach((a) => {
      if (a.repositoryId) {
        repos.set(a.repositoryId, { id: a.repositoryId, name: a.repositoryName || a.repositoryId });
      }
    });
    return Array.from(repos.values());
  }, [analyses]);

  const handleConfirmSource = async () => {
    setIsMatchingRoles(true);
    setError(null);
    try {
      const result = await fetchRoleMatches({
        sourceMode,
        repoId: sourceMode === 'single_repo' ? selectedRepoIds[0] : undefined,
        repoIds: sourceMode === 'selected_repos' ? selectedRepoIds : undefined,
        limit: 5,
      });
      if (result?.matches?.length > 0) {
        // Only keep the highest compatible role (rank-1)
        setServerRoleMatches(result.matches.slice(0, 1));
        const top = result.matches[0];
        setServerRecommendedRole({
          role: top.roleName as any,
          title: 'Đề xuất chính theo phân tích',
          reason: `Điểm phù hợp: ${top.matchScore}% – ${top.matchLevelLabel}`,
          focus: top.recommendedNextSkills?.join(', ') || 'Tập trung theo các kỹ năng chính đã phát hiện.',
        });
        setServerJobRoadmaps([]);
      } else {
        setServerRoleMatches([]);
        setServerRecommendedRole(null);
        setServerJobRoadmaps([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tính vai trò phù hợp.');
      setServerRoleMatches([]);
    } finally {
      setIsMatchingRoles(false);
    }
  };


  const inProgressCount = roadmaps.filter((r) => r.progress > 0 && r.progress < 100).length;
  const archivedCount = roadmaps.filter((r) => r.status === 'archived').length;
  const completedNodes = roadmaps.reduce((sum, r) => sum + countCompletedNodes(r), 0);
  const totalNodes = roadmaps.reduce((sum, r) => sum + countRoadmapNodes(r), 0);

  const openRoadmap = (roadmap: Roadmap) => {
    navigation.navigate('RoadmapDetail', { roadmapId: roadmap.id, title: roadmap.title });
  };

  const handleDeleteRoadmap = (roadmap: Roadmap) => {
    setDeleteDialog({ visible: true, roadmap });
  };

  const confirmDeleteRoadmap = async () => {
    const r = deleteDialog.roadmap;
    if (!r) return;
    setDeleteDialog({ visible: false, roadmap: null });
    try {
      await roadmapService.deleteRoadmap(r.id);
      await loadData();
    } catch (err: any) {
      setErrorAlert({ visible: true, message: err?.message || 'Không thể xóa roadmap.' });
    }
  };

  const handleGenerate = async (role: string, actionKey = role) => {
    setIsGenerating(true);
    setGeneratingKey(actionKey);
    setError(null);
    try {
      const selectedRepoId = selectedRepoIds[0];
      const targetAnalysis = analyses.find((a) => a.repositoryId === selectedRepoId);
      
      const roleIds: Record<string, string> = {
        'Backend Developer': 'backend',
        'Frontend Developer': 'frontend',
        'Mobile Developer': 'mobile',
        'DevOps Engineer': 'devops',
        'Data Scientist': 'data_scientist',
      };

      const matchedRole = serverRoleMatches.find((m) => m.roleName === role);
      const targetRoleId = matchedRole?.roleId ?? roleIds[role] ?? 'backend';

      const options: any = {
        sourceMode: 'single_repo',
        repoId: selectedRepoId,
        currentRepositoryId: selectedRepoId,
        roleId: targetRoleId,
        selectedRoleId: targetRoleId,
        selectedRole: {
          roleId: targetRoleId,
          roleName: role,
        },
        forceRegenerate: false,
      };

      if (targetAnalysis) {
        options.sourceRepositoryId = targetAnalysis.repositoryId;
        options.sourceAnalysisId = targetAnalysis.id;
        options.sourceSnapshotId = targetAnalysis.snapshotId;
      }

      const recommendation = await roadmapService.generateAIRoadmap(role, options);
      await loadData();
      openRoadmap(recommendation.roadmap);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể tạo roadmap.';
      setError(message);
      setErrorAlert({ visible: true, message });
    } finally {
      setIsGenerating(false);
      setGeneratingKey(null);
    }
  };

  const handleGenerateSuggestion = (suggestion: RoadmapRoleRecommendation) => {
    handleGenerate(suggestion.role, `suggestion-${suggestion.role}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
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

      {showCreateSection && (
        <Card style={styles.createCard} padded={false}>
          <Text style={styles.sectionTitle}>Tạo lộ trình học theo vai trò mục tiêu</Text>
          <Text style={[styles.sectionDesc, { marginBottom: theme.spacing.md }]}>
            Chọn dữ liệu học tập đã phân tích, hệ thống sẽ đề xuất các hướng nghề nghiệp phù hợp để bạn tạo lộ trình học.
          </Text>

          <View style={styles.repoPickerContainer}>
            <TouchableOpacity
              style={styles.rolePicker}
              onPress={() => {
                setRepoPickerMulti(false);
                setRepoPickerVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.rolePickerLabel}>Nguồn dữ liệu (Chọn 1 repository)</Text>
              <View style={styles.rolePickerValueRow}>
                <Text style={styles.rolePickerText} numberOfLines={2}>
                  {selectedRepoIds.length > 0 
                    ? (analyzedRepos.find(r => r.id === selectedRepoIds[0])?.name || selectedRepoIds[0])
                    : 'Chọn dự án để phân tích'}
                </Text>
                <ChevronDown size={18} color={theme.colors.secondaryLight} />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.confirmSourceBtnContainer}>
            <Button
              title={isMatchingRoles ? "Đang xử lý..." : "Xác nhận nguồn tạo lộ trình"}
              onPress={handleConfirmSource}
              disabled={isMatchingRoles || (sourceMode !== 'all_analyzed_repos' && selectedRepoIds.length === 0)}
            />
          </View>
          
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </Card>
      )}

      <Card style={styles.aiCard} padded={false}>
        <View style={styles.toggleRow}>
          <Text style={styles.sectionTitle}>Tạo lộ trình mới</Text>
          <TouchableOpacity onPress={() => setShowCreateSection(!showCreateSection)}>
             <View style={[styles.toggleSwitch, showCreateSection && styles.toggleSwitchActive]}>
               <View style={[styles.toggleThumb, showCreateSection && styles.toggleThumbActive]} />
             </View>
          </TouchableOpacity>
        </View>
        <Text style={[styles.sectionDesc, { marginBottom: theme.spacing.md }]}>
          Bật khi bạn muốn tạo lại từ đầu. Tắt để ưu tiên dùng lộ trình đã có và phản hồi nhanh hơn.
        </Text>

        <Text style={styles.sectionTitle}>Vai trò từ kết quả phân tích repository</Text>
        <Text style={[styles.sectionDesc, { marginBottom: theme.spacing.sm }]}>
          Chọn nguồn dữ liệu và bấm Xác nhận và tiếp tục để xem gợi ý.
        </Text>

        {serverRoleMatches.length === 0 && !recommendedRoadmap && (
          <View style={styles.noMatchBox}>
            <Text style={styles.noMatchText}>
              Chưa có đủ dữ liệu phân tích repository. Hãy phân tích ít nhất một repository để AI gợi ý vai trò phù hợp.
            </Text>
          </View>
        )}

        {serverRoleMatches.length > 0 && (
          <>
            {/* Vai trò chính */}
            <View style={styles.roleMatchCardFeatured}>
              <View style={styles.roleMatchHeader}>
                <View style={styles.scoreCircle}>
                  <Text style={styles.scoreValue}>{Math.round(serverRoleMatches[0].matchScore)}%</Text>
                  <Text style={styles.scoreLabel}>Phù hợp</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Badge label="Vai trò chính từ phân tích" variant="primary" />
                  <Text style={styles.roleMatchName}>{serverRoleMatches[0].roleName}</Text>
                  <Text style={styles.roleMatchLevel}>{serverRoleMatches[0].matchLevelLabel}</Text>
                </View>
              </View>

              <View style={styles.skillSection}>
                <Text style={styles.skillSectionLabel}>NĂNG LỰC HIỆN CÓ</Text>
                <View style={styles.skillChips}>
                  {serverRoleMatches[0].topMatchedSkills?.slice(0, 5).map((s: string) => (
                    <View key={s} style={styles.skillChipGreen}><Text style={styles.skillChipTextGreen}>{s}</Text></View>
                  ))}
                  {(!serverRoleMatches[0].topMatchedSkills || serverRoleMatches[0].topMatchedSkills.length === 0) && (
                    <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>Chưa có tín hiệu nổi bật.</Text>
                  )}
                </View>
              </View>

              <View style={styles.skillSection}>
                <Text style={styles.skillSectionLabel}>CẦN CỦNG CỐ</Text>
                <View style={styles.skillChips}>
                  {serverRoleMatches[0].topMissingSkills?.slice(0, 5).map((s: string) => (
                    <View key={s} style={styles.skillChipOrange}><Text style={styles.skillChipTextOrange}>{s}</Text></View>
                  ))}
                </View>
              </View>

              <View style={styles.skillSection}>
                <Text style={styles.skillSectionLabel}>NÊN HỌC TIẾP</Text>
                <View style={styles.skillChips}>
                  {serverRoleMatches[0].recommendedNextSkills?.slice(0, 5).map((s: string) => (
                    <View key={s} style={styles.skillChipBlue}><Text style={styles.skillChipTextBlue}>{s}</Text></View>
                  ))}
                </View>
              </View>

              <Button
                title="Tạo lộ trình học"
                onPress={() => handleGenerate(serverRoleMatches[0].roleName, 'ai')}
                loading={generatingKey === 'ai'}
                disabled={isGenerating}
                icon={<Sparkles size={16} color={theme.colors.surface} />}
                style={{ marginTop: theme.spacing.sm }}
              />
            </View>

            {/* Vai trò phụ ẩn đi theo yêu cầu của người dùng */}
          </>
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
          <RoadmapCard
            key={roadmap.id}
            roadmap={roadmap}
            onPress={() => openRoadmap(roadmap)}
            onDelete={() => handleDeleteRoadmap(roadmap)}
          />
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

      {/* Repo Picker Modal */}
      <Modal visible={repoPickerVisible} transparent animationType="slide" onRequestClose={() => setRepoPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setRepoPickerVisible(false)} />
          <View style={[styles.modalSheet, { maxHeight: '70%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
              <Text style={styles.modalTitle}>
                {repoPickerMulti ? 'Chọn các repository' : 'Chọn 1 repository'}
              </Text>
              {repoPickerMulti && (
                <TouchableOpacity onPress={() => setRepoPickerVisible(false)}>
                  <Text style={{ color: theme.colors.primary, fontWeight: 'bold' }}>Xong</Text>
                </TouchableOpacity>
              )}
            </View>

            {analyzedRepos.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: theme.colors.textMuted }}>Bạn chưa phân tích repository nào.</Text>
              </View>
            ) : (
              <FlatList
                data={analyzedRepos}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isSelected = selectedRepoIds.includes(item.id);
                  return (
                    <TouchableOpacity
                      style={[styles.roleOption, isSelected && styles.roleOptionActive]}
                      onPress={() => {
                        if (repoPickerMulti) {
                          setSelectedRepoIds(prev => 
                            prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                          );
                        } else {
                          setSelectedRepoIds([item.id]);
                          setRepoPickerVisible(false);
                        }
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.roleOptionText, isSelected && styles.roleOptionTextActive]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {isSelected && <CheckCircle2 size={18} color={theme.colors.secondaryLight} />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>

    <CustomAlert
      visible={errorAlert.visible}
      title="Tạo roadmap thất bại"
      message={errorAlert.message}
      type="error"
      confirmText="Đóng"
      onConfirm={() => setErrorAlert({ visible: false, message: '' })}
    />

    <CustomAlert
      visible={deleteDialog.visible}
      title="Xóa Lộ Trình?"
      message={`Bạn có chắc chắn muốn xóa lộ trình "${deleteDialog.roadmap?.title}" không? Hành động này không thể hoàn tác.`}
      type="warning"
      showCancel
      cancelText="Hủy"
      confirmText="Xóa"
      onCancel={() => setDeleteDialog({ visible: false, roadmap: null })}
      onConfirm={confirmDeleteRoadmap}
    />
    </View>
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
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },
  sourceModeTabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.roundness.sm,
    padding: 4,
    marginBottom: theme.spacing.md,
  },
  sourceModeTab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: 4,
    borderRadius: theme.roundness.sm - 2,
    alignItems: 'center',
  },
  sourceModeTabActive: {
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sourceModeTabText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
    fontWeight: theme.typography.weights.medium,
  },
  sourceModeTabTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.bold,
  },
  sourceModeTabDesc: {
    fontSize: 9,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  repoPickerContainer: {
    marginBottom: theme.spacing.md,
  },
  confirmSourceBtnContainer: {
    marginTop: theme.spacing.sm,
  },
  createColumn: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.md,
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
  // Role match cards (Web parity)
  noMatchBox: {
    padding: theme.spacing.md,
    borderRadius: theme.roundness.sm,
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  noMatchText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
    lineHeight: theme.typography.lineHeights.sm,
  },
  roleMatchCardFeatured: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: theme.spacing.sm,
  },
  roleMatchHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  roleMatchName: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginTop: 6,
  },
  roleMatchLevel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  scoreCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
    padding: 8,
    borderRadius: theme.roundness.sm,
    backgroundColor: '#6366f115',
  },
  scoreValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.secondary,
  },
  scoreLabel: {
    fontSize: 9,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: theme.colors.secondary,
  },
  progressBarFillSec: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: theme.colors.textMuted,
  },
  skillSection: {
    marginBottom: theme.spacing.sm,
  },
  skillSectionLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  skillChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  skillChipGreen: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#22c55e15',
    borderWidth: 1,
    borderColor: '#22c55e50',
  },
  skillChipTextGreen: {
    fontSize: 11,
    color: '#16a34a',
    fontWeight: '600',
  },
  skillChipOrange: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#f9731615',
    borderWidth: 1,
    borderColor: '#f9731650',
  },
  skillChipTextOrange: {
    fontSize: 11,
    color: '#ea580c',
    fontWeight: '600',
  },
  skillChipBlue: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#6366f115',
    borderWidth: 1,
    borderColor: '#6366f150',
  },
  skillChipTextBlue: {
    fontSize: 11,
    color: theme.colors.secondary,
    fontWeight: '600',
  },
  roleMatchGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  roleMatchCardSmall: {
    flex: 1,
    padding: theme.spacing.sm + 2,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceLight,
  },
  roleMatchSmallHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  roleMatchNameSmall: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  scoreSmall: {
    fontSize: theme.typography.sizes.md,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
  },
  createSmallBtn: {
    marginTop: theme.spacing.sm,
    paddingVertical: 8,
    borderRadius: 7,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
  },
  createSmallBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: theme.colors.primary,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    alignSelf: 'flex-start',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
});
