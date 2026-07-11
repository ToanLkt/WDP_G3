import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import {
  Milestone,
  CheckCircle2,
  Circle,
  Lock,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Archive,
  RotateCcw,
} from 'lucide-react-native';

import { theme } from '../../theme';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import { roadmapService } from '../../features/roadmaps/api';
import type { LearningNode, LearningNodeStatus, Roadmap, RoadmapProgressRecord } from '../../features/roadmaps/types';
import type { RoadmapStackParamList } from '../../navigation/types';

type DetailRoute = RouteProp<RoadmapStackParamList, 'RoadmapDetail'>;

const getStepStatusIcon = (status: LearningNodeStatus) => {
  if (status === 'completed') return <CheckCircle2 size={24} color={theme.colors.success} />;
  if (status === 'in-progress' || status === 'unlocked') {
    return <Circle size={24} color={theme.colors.secondaryLight} />;
  }
  return <Lock size={20} color={theme.colors.textMuted} />;
};

export const RoadmapDetailScreen: React.FC = () => {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<any>();
  const { tabBarPaddingBottom } = useTabBarAwareScroll();
  const { roadmapId } = route.params;

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, LearningNodeStatus>>({});
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  // Map from nodeId -> itemId (for progress tracking)
  const [nodeItemIdMap, setNodeItemIdMap] = useState<Record<string, string>>({});
  // Authoritative server progress
  const [serverProgress, setServerProgress] = useState<RoadmapProgressRecord | null>(null);

  /** Merge server progress items into local node status map.
   * node.id now equals the backend itemId (e.g., "main-1-1-rest-api") so
   * we can look up progress directly by node.id.
   */
  const applyServerProgress = (
    data: Roadmap,
    progress: RoadmapProgressRecord
  ) => {
    // Build a lookup: itemId -> status
    const statusByItemId: Record<string, string> = {};
    progress.items.forEach((item) => {
      if (item.itemId) statusByItemId[item.itemId] = item.status;
      if (item.skillName) statusByItemId[item.skillName.toLowerCase()] = item.status;
      if (item.canonicalSkillName) statusByItemId[item.canonicalSkillName.toLowerCase()] = item.status;
    });

    const merged: Record<string, LearningNodeStatus> = {};
    data.modules.forEach((module) => {
      module.nodes.forEach((node) => {
        // node.id IS the itemId from the backend
        const remoteStatus = statusByItemId[node.id]
          ?? statusByItemId[node.canonicalSkillName?.toLowerCase() ?? '']
          ?? statusByItemId[node.skillName?.toLowerCase() ?? ''];
        if (remoteStatus === 'completed') merged[node.id] = 'completed';
        else if (remoteStatus === 'in_progress' || remoteStatus === 'in-progress') merged[node.id] = 'in-progress';
        else if (remoteStatus === 'not_started') merged[node.id] = node.status === 'locked' ? 'locked' : 'unlocked';
        else merged[node.id] = node.status;
      });
    });
    return merged;
  };

  const loadRoadmap = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await roadmapService.getRoadmapById(roadmapId);
      if (data) {
        setRoadmap(data);
        // node.id IS the backend itemId — map is identity
        const idMap: Record<string, string> = {};
        data.modules.forEach((module) => {
          module.nodes.forEach((node) => {
            idMap[node.id] = node.id;
          });
        });
        setNodeItemIdMap(idMap);

        // Seed local statuses from roadmap data
        const initial: Record<string, LearningNodeStatus> = {};
        data.modules.forEach((module) => {
          module.nodes.forEach((node) => {
            initial[node.id] = node.status;
          });
        });
        setNodeStatuses(initial);

        // Overlay remote progress (best-effort)
        roadmapService.getRoadmapProgress(roadmapId)
          .then((progress) => {
            setServerProgress(progress);
            setNodeStatuses(applyServerProgress(data, progress));
          })
          .catch(() => { /* Keep local statuses on error */ });
      }
    } catch (err) {
      console.warn('[RoadmapDetail] Load failed:', err);
      // Roadmap may have been deleted or is inaccessible — leave state empty
    } finally {
      setIsLoading(false);
    }
  }, [roadmapId]);

  useEffect(() => {
    loadRoadmap();
  }, [loadRoadmap]);

  const nodes = useMemo(() => {
    if (!roadmap) return [] as Array<LearningNode & { moduleTitle: string; moduleDesc: string }>;
    return roadmap.modules.flatMap((module) =>
      module.nodes.map((node) => ({
        ...node,
        moduleTitle: module.title,
        moduleDesc: module.description,
      }))
    );
  }, [roadmap]);

  const progressPercent = useMemo(() => {
    // Prefer server overallProgress when available
    if (serverProgress) return serverProgress.overallProgress;
    if (!nodes.length) return 0;
    const completed = nodes.filter((node) => nodeStatuses[node.id] === 'completed').length;
    return Math.round((completed / nodes.length) * 100);
  }, [nodes, nodeStatuses, serverProgress]);

  const updateNodeStatus = async (nodeId: string, newStatus: LearningNodeStatus) => {
    if (isSyncing) return;
    
    // Optimistic local update
    setNodeStatuses((prev) => {
      const newStatuses = { ...prev, [nodeId]: newStatus };
      if (newStatus === 'completed') {
        const nodeIndex = nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex !== -1 && nodeIndex < nodes.length - 1) {
          const nextNodeId = nodes[nodeIndex + 1].id;
          if (newStatuses[nextNodeId] === 'locked' || !newStatuses[nextNodeId]) {
            newStatuses[nextNodeId] = 'unlocked';
          }
        }
      }
      return newStatuses;
    });

    // Sync to backend in background
    setIsSyncing(true);
    // nodeId IS the backend itemId
    const itemId = nodeId;
    
    let apiStatus = 'not_started';
    if (newStatus === 'unlocked') apiStatus = 'not_started';
    if (newStatus === 'in-progress') apiStatus = 'in_progress';
    if (newStatus === 'completed') apiStatus = 'completed';

    roadmapService.updateRoadmapProgressItem(roadmapId, { itemId, status: apiStatus })
      .then((progress) => {
        setServerProgress(progress);
        if (roadmap) setNodeStatuses(applyServerProgress(roadmap, progress));
      })
      .catch(() => { /* Keep optimistic update on error */ })
      .finally(() => setIsSyncing(false));
  };

  const handleArchive = async () => {
    if (!roadmap) return;
    Alert.alert(
      'Lưu trữ Roadmap',
      'Bạn có chắc chắn muốn lưu trữ lộ trình học này không? Bạn có thể tìm lại trong tab Lưu trữ.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Lưu trữ',
          style: 'destructive',
          onPress: async () => {
            setIsArchiving(true);
            try {
              await roadmapService.archiveRoadmap(roadmap.id);
              Alert.alert('Thành công', 'Đã lưu trữ roadmap.');
              navigation.goBack();
            } catch (err: any) {
              Alert.alert('Lỗi', err?.message || 'Không thể lưu trữ roadmap.');
            } finally {
              setIsArchiving(false);
            }
          }
        }
      ]
    );
  };

  const handleResetProgress = async () => {
    if (!roadmap) return;
    Alert.alert(
      'Đặt lại tiến độ',
      'Bạn có chắc chắn muốn xóa toàn bộ tiến độ của lộ trình này không? Hành động này không thể hoàn tác.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đặt lại',
          style: 'destructive',
          onPress: async () => {
            setIsResetting(true);
            try {
              const updatedProgress = await roadmapService.resetRoadmapProgress(roadmap.id);
              setServerProgress(updatedProgress);
              setNodeStatuses(applyServerProgress(roadmap, updatedProgress));
              Alert.alert('Thành công', 'Đã đặt lại tiến độ học tập.');
            } catch (err: any) {
              Alert.alert('Lỗi', err?.message || 'Không thể đặt lại tiến độ.');
            } finally {
              setIsResetting(false);
            }
          }
        }
      ]
    );
  };

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.secondary} />
      </View>
    );
  }

  if (!roadmap) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Không tìm thấy roadmap.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarPaddingBottom }]}
    >
      <Card style={styles.headerCard} glow="cyan">
        <View style={styles.headerTop}>
          <Milestone size={24} color={theme.colors.secondary} style={{ marginRight: theme.spacing.sm }} />
          <Text style={styles.headerTitle} numberOfLines={2}>{roadmap.title}</Text>
        </View>
        <Text style={styles.headerSub}>{roadmap.subtitle || roadmap.description}</Text>
        <View style={styles.badgesRow}>
          <Badge label={roadmap.category} variant="secondary" />
          <Badge label={roadmap.careerOutcome} variant="primary" />
          {isSyncing && <Badge label="Đang lưu..." variant="muted" />}
        </View>

        {/* Stats row: completed tasks */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {serverProgress?.progressSummary?.completedItems ?? nodes.filter(n => nodeStatuses[n.id] === 'completed').length}
            </Text>
            <Text style={styles.statLabel}>Hoàn thành</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {serverProgress?.progressSummary?.inProgressItems ?? nodes.filter(n => nodeStatuses[n.id] === 'in-progress').length}
            </Text>
            <Text style={styles.statLabel}>Đang học</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{nodes.length}</Text>
            <Text style={styles.statLabel}>Tổng nhiệm vụ</Text>
          </View>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressLabels}>
            <Text style={styles.progressText}>Tiến độ lộ trình</Text>
            <Text style={styles.progressPercent}>{progressPercent}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>

        <View style={styles.controlButtonsRow}>
          <Button
            title="Reset tiến độ"
            variant="outline"
            onPress={handleResetProgress}
            loading={isResetting}
            icon={<RotateCcw size={16} color={theme.colors.textSecondary} />}
            style={styles.controlBtn}
            fullWidth={false}
          />
          {roadmap.status !== 'archived' && (
            <Button
              title="Lưu trữ"
              variant="outline"
              onPress={handleArchive}
              loading={isArchiving}
              icon={<Archive size={16} color={theme.colors.textSecondary} />}
              style={styles.controlBtn}
              fullWidth={false}
            />
          )}
        </View>
      </Card>

      {roadmap.roleMatch && (
        <View style={styles.matchSection}>
          <SectionHeader title="Mức độ phù hợp vai trò" accentColor={theme.colors.secondary} />
          <Card style={styles.matchCard}>
            <Text style={styles.matchTitle}>Vai trò: {roadmap.roleMatch.roleName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Badge label={`${roadmap.roleMatch.matchScore}%`} variant="success" />
              <Text style={{ marginLeft: 8, color: theme.colors.textSecondary, fontSize: 13 }}>
                Đánh giá: {roadmap.roleMatch.matchLevelLabel}
              </Text>
            </View>
          </Card>
        </View>
      )}

      <SectionHeader title="Lộ trình học tập" accentColor={theme.colors.primary} />

      <View style={styles.timelineContainer}>
        {roadmap.modules.map((module, mIndex) => (
          <View key={module.id} style={styles.moduleContainer}>
            <View style={styles.moduleHeaderRow}>
              <View style={styles.moduleNumberBadge}>
                <Text style={styles.moduleNumberText}>{mIndex + 1}</Text>
              </View>
              <View style={styles.moduleTitleCol}>
                <Text style={styles.moduleTitleText}>{module.title}</Text>
                <Text style={styles.moduleDescText}>{module.description}</Text>
              </View>
            </View>

            {/* Module progress bar */}
            {(() => {
              const moduleCompleted = module.nodes.filter(n => (nodeStatuses[n.id] ?? n.status) === 'completed').length;
              const moduleTotal = module.nodes.length;
              const modulePct = moduleTotal ? Math.round((moduleCompleted / moduleTotal) * 100) : 0;
              return (
                <View style={styles.moduleProgressRow}>
                  <View style={styles.moduleProgressBg}>
                    <View style={[styles.moduleProgressFill, { width: `${modulePct}%` }]} />
                  </View>
                  <Text style={styles.moduleProgressLabel}>{moduleCompleted}/{moduleTotal} bài học</Text>
                </View>
              );
            })()}

            <View style={styles.moduleNodesContainer}>
              {module.nodes.map((node, nIndex) => {
                const status = nodeStatuses[node.id] ?? node.status;
                const isCompleted = status === 'completed';
                const isInProgress = status === 'in-progress';
                const isLastNodeInModule = nIndex === module.nodes.length - 1;
                const isLastNodeOverall = nodes[nodes.length - 1].id === node.id;

                // Status badge text + color
                let statusBadgeText = 'Có thể học';
                let statusBadgeStyle = styles.badgeCanLearn;
                let statusBadgeTextStyle = styles.badgeCanLearnText;
                if (isCompleted) {
                  statusBadgeText = 'Đã hoàn thành';
                  statusBadgeStyle = styles.badgeCompleted;
                  statusBadgeTextStyle = styles.badgeCompletedText;
                } else if (isInProgress) {
                  statusBadgeText = 'Đang học';
                  statusBadgeStyle = styles.badgeInProgress;
                  statusBadgeTextStyle = styles.badgeInProgressText;
                } else if (status === 'locked') {
                  statusBadgeText = 'Chưa mở khóa';
                  statusBadgeStyle = styles.badgeLocked;
                  statusBadgeTextStyle = styles.badgeLockedText;
                }

                return (
                  <View key={node.id} style={styles.stepContainer}>
                    <View style={styles.leftCol}>
                      <View style={styles.iconWrapper}>
                        {getStepStatusIcon(status)}
                      </View>
                      {(!isLastNodeInModule || !isLastNodeOverall) && (
                        <View
                          style={[
                            styles.connectorLine,
                            isCompleted && styles.completedLine,
                            isInProgress && styles.inProgressLine,
                          ]}
                        />
                      )}
                    </View>

                    <View style={styles.rightCol}>
                      <Card
                        style={StyleSheet.flatten([
                          styles.stepCard,
                          isInProgress && styles.inProgressCard,
                          isCompleted && styles.completedCard,
                        ])}
                      >
                        {/* Thin top progress bar for completed tasks */}
                        {isCompleted && <View style={styles.taskTopBar} />}

                        {/* Title row + status badge */}
                        <View style={styles.taskTitleRow}>
                          <Text style={[styles.stepTitleText, isCompleted && styles.completedText]} numberOfLines={3}>
                            {node.title}
                          </Text>
                          <View style={[styles.statusBadge, statusBadgeStyle]}>
                            <Text style={[styles.statusBadgeText, statusBadgeTextStyle]}>{statusBadgeText}</Text>
                          </View>
                        </View>

                        {/* Description */}
                        <Text style={styles.stepDescText} numberOfLines={2}>{node.description}</Text>

                        {/* Skill + category chips */}
                        <View style={styles.taskChipsRow}>
                          {isCompleted && (
                            <View style={styles.chipCompleted}>
                              <Text style={styles.chipCompletedText}>Hoàn thành</Text>
                            </View>
                          )}
                          {node.skillName ? (
                            <TouchableOpacity
                              style={styles.chipSkill}
                              onPress={() => navigation.navigate('SkillLearningDetail', { roadmapId, skillName: node.skillName!, nodeId: node.id })}
                            >
                              <Text style={styles.chipSkillText}>{node.skillName}</Text>
                            </TouchableOpacity>
                          ) : null}
                          {node.category ? (
                            <View style={styles.chipCategory}>
                              <Text style={styles.chipCategoryText}>{node.category}</Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Per-task thin progress bar (full if completed, half if in-progress) */}
                        <View style={styles.taskProgressBar}>
                          <View style={[
                            styles.taskProgressFill,
                            { width: isCompleted ? '100%' : isInProgress ? '50%' : '0%' },
                            isCompleted && styles.taskProgressCompleted,
                            isInProgress && styles.taskProgressInProgress,
                          ]} />
                        </View>

                        {/* 3-state buttons: Học | Đang học | Xong */}
                        <View style={styles.actionButtonsRow}>
                          <TouchableOpacity
                            style={[
                              styles.progressActionBtn,
                              (status === 'unlocked' || status === 'locked') && styles.progressActionBtnActive
                            ]}
                            onPress={() => updateNodeStatus(node.id, 'unlocked')}
                          >
                            <Text style={[
                              styles.progressActionText,
                              (status === 'unlocked' || status === 'locked') && styles.progressActionTextActive
                            ]}>Học</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.progressActionBtn,
                              isInProgress && styles.progressActionBtnActive
                            ]}
                            onPress={() => updateNodeStatus(node.id, 'in-progress')}
                          >
                            <Text style={[
                              styles.progressActionText,
                              isInProgress && styles.progressActionTextActive
                            ]}>Đang học</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.progressActionBtn,
                              isCompleted && styles.progressActionBtnActiveCompleted
                            ]}
                            onPress={() => updateNodeStatus(node.id, 'completed')}
                          >
                            <Text style={[
                              styles.progressActionText,
                              isCompleted && styles.progressActionTextActiveCompleted
                            ]}>Xong</Text>
                          </TouchableOpacity>
                        </View>
                      </Card>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

        ))}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  errorText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
  headerCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  headerTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  headerSub: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    lineHeight: theme.typography.lineHeights.sm,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.roundness.sm,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
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
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: theme.colors.border,
  },
  moduleProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.sm,
    paddingLeft: 18,
  },
  moduleProgressBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  moduleProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: theme.colors.secondary,
  },
  moduleProgressLabel: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontWeight: '600',
    minWidth: 60,
    textAlign: 'right',
  },
  skillNameChip: {
    backgroundColor: '#6366f118',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#6366f130',
  },
  skillNameChipText: {
    fontSize: 10,
    color: theme.colors.secondary,
    fontWeight: '600',
  },
  matchSection: {
    marginBottom: theme.spacing.lg,
  },
  matchCard: {
    padding: theme.spacing.md,
  },
  matchTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  progressSection: {
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.md,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  progressText: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.medium,
  },
  progressPercent: {
    fontSize: theme.typography.sizes.xs + 1,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.secondaryLight,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.secondary,
    borderRadius: 3,
  },
  timelineContainer: {
    paddingLeft: 0,
  },
  moduleContainer: {
    marginBottom: theme.spacing.xl,
  },
  moduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  moduleNumberBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: theme.colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  moduleNumberText: {
    color: '#000',
    fontSize: theme.typography.sizes.md,
    fontWeight: 'bold',
  },
  moduleTitleCol: {
    flex: 1,
  },
  moduleTitleText: {
    fontSize: theme.typography.sizes.md,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  moduleDescText: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
  },
  moduleNodesContainer: {
    paddingLeft: 18, 
  },
  stepContainer: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  leftCol: {
    width: 32,
    alignItems: 'center',
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    marginTop: 4,
  },
  connectorLine: {
    width: 1,
    flex: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
  completedLine: {
    backgroundColor: theme.colors.success,
  },
  inProgressLine: {
    backgroundColor: theme.colors.secondaryLight,
  },
  rightCol: {
    flex: 1,
    paddingLeft: theme.spacing.md,
  },
  stepCard: {
    padding: theme.spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  inProgressCard: {
    borderColor: theme.colors.secondaryLight,
    borderWidth: 1,
  },
  completedCard: {
    opacity: 0.9,
    backgroundColor: '#1e293b50',
  },
  taskTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: theme.colors.success,
  },
  taskTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  badgeCanLearn: {
    backgroundColor: '#06b6d415',
    borderColor: '#06b6d440',
  },
  badgeCanLearnText: {
    color: '#06b6d4',
  },
  badgeCompleted: {
    backgroundColor: '#22c55e15',
    borderColor: '#22c55e40',
  },
  badgeCompletedText: {
    color: '#22c55e',
  },
  badgeInProgress: {
    backgroundColor: '#6366f115',
    borderColor: '#6366f140',
  },
  badgeInProgressText: {
    color: '#6366f1',
  },
  badgeLocked: {
    backgroundColor: '#64748b15',
    borderColor: '#64748b40',
  },
  badgeLockedText: {
    color: '#64748b',
  },
  taskChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: theme.spacing.sm,
  },
  chipCompleted: {
    backgroundColor: '#22c55e10',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#22c55e30',
  },
  chipCompletedText: {
    fontSize: 10,
    color: '#22c55e',
    fontWeight: '600',
  },
  chipSkill: {
    backgroundColor: '#6366f110',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#6366f130',
  },
  chipSkillText: {
    fontSize: 10,
    color: theme.colors.secondary,
    fontWeight: '600',
  },
  chipCategory: {
    backgroundColor: '#47556920',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chipCategoryText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  taskProgressBar: {
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: theme.spacing.sm,
  },
  taskProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  taskProgressCompleted: {
    backgroundColor: theme.colors.success,
  },
  taskProgressInProgress: {
    backgroundColor: theme.colors.secondaryLight,
  },

  stepHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  stepTitleText: {
    flex: 1,
    fontSize: theme.typography.sizes.md - 1,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    lineHeight: theme.typography.lineHeights.sm,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: theme.colors.textMuted,
  },
  stepDescText: {
    fontSize: theme.typography.sizes.sm - 1,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.xs + 2,
    marginBottom: theme.spacing.sm,
  },
  nodeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  durationText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    fontWeight: 'bold',
  },
  expandedContent: {
    marginTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
  },
  skillsLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: theme.colors.textMuted,
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  skillsList: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.roundness.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  skillItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  skillItemText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
  emptySkillsText: {
    padding: theme.spacing.sm,
    color: theme.colors.textMuted,
    fontSize: theme.typography.sizes.xs,
    fontStyle: 'italic',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
  },
  progressActionBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  progressActionBtnActive: {
    backgroundColor: '#6366f120',
    borderColor: theme.colors.secondary,
  },
  progressActionBtnActiveCompleted: {
    backgroundColor: '#22c55e20',
    borderColor: theme.colors.success,
  },
  progressActionText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  progressActionTextActive: {
    color: theme.colors.secondary,
  },
  progressActionTextActiveCompleted: {
    color: theme.colors.success,
  },
  completeBtn: {
    flex: 1,
  },
  controlButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  controlBtn: {
    minWidth: 120,
  },
});
