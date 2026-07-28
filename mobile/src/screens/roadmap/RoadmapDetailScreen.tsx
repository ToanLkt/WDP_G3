import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import {
  Milestone,
  CheckCircle2,
  Circle,
  Lock,
  RotateCcw,
  Archive,
  Clock,
  GitBranch,
  Sparkles,
  Target,
  BookOpen,
  ExternalLink,
  Trash2,
} from 'lucide-react-native';

import { theme } from '../../theme';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CustomAlert } from '../../components/ui/CustomAlert';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import { roadmapService } from '../../features/roadmaps/api';
import type { LearningNode, LearningNodeStatus, Roadmap, RoadmapProgressRecord } from '../../features/roadmaps/types';
import type { RoadmapStackParamList } from '../../navigation/types';

type DetailRoute = RouteProp<RoadmapStackParamList, 'RoadmapDetail'>;
type ActiveTab = 'roadmap' | 'objectives' | 'support';

interface CourseRecommendation {
  id?: string;
  title: string;
  provider?: string;
  platform?: string;
  partnerName?: string;
  url?: string;
  thumbnailUrl?: string;
  duration?: string;
  language?: string;
  type?: string;
  level?: string;
  description?: string;
}

const getStepStatusIcon = (status: LearningNodeStatus) => {
  if (status === 'completed') return <CheckCircle2 size={24} color={theme.colors.success} />;
  if (status === 'in-progress' || status === 'unlocked') {
    return <Circle size={24} color={theme.colors.secondaryLight} />;
  }
  return <Lock size={20} color={theme.colors.textMuted} />;
};

const formatLevel = (level?: string) => {
  if (!level) return null;
  const normalized = level.trim().toLowerCase().replace(/[_-]+/g, ' ');
  switch (normalized) {
    case 'novice':
    case 'newbie':
    case 'starter':
    case 'beginner':
    case 'basic':
    case 'foundation':
      return 'Mới bắt đầu';
    case 'elementary':
    case 'junior':
    case 'pre intermediate':
      return 'Sơ cấp';
    case 'intermediate':
    case 'middle':
    case 'mid':
      return 'Trung cấp';
    case 'upper intermediate':
    case 'advanced':
    case 'senior':
      return 'Nâng cao';
    case 'expert':
    case 'master':
      return 'Chuyên sâu';
    default:
      return level.trim() || null;
  }
};

const formatDifficulty = (d?: string) => {
  if (!d) return null;
  const map: Record<string, string> = {
    Beginner: 'Cơ bản',
    Intermediate: 'Trung cấp',
    Advanced: 'Nâng cao',
  };
  return map[d] ?? d;
};

export const RoadmapDetailScreen: React.FC = () => {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<any>();
  const { tabBarPaddingBottom } = useTabBarAwareScroll();
  const { roadmapId } = route.params;

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, LearningNodeStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [serverProgress, setServerProgress] = useState<RoadmapProgressRecord | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('roadmap');
  const [courseRecommendations, setCourseRecommendations] = useState<CourseRecommendation[]>([]);

  const [alertDialog, setAlertDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    showCancel?: boolean;
    confirmText?: string;
    onConfirm: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {},
  });

  const showAlert = (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', onConfirm?: () => void) => {
    setAlertDialog({ visible: true, title, message, type, showCancel: false, onConfirm: onConfirm ?? (() => setAlertDialog(prev => ({ ...prev, visible: false }))) });
  };

  const showConfirm = (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error', confirmText: string, onConfirm: () => void) => {
    setAlertDialog({ visible: true, title, message, type, showCancel: true, confirmText, onConfirm });
  };

  const applyServerProgress = (data: Roadmap, progress: RoadmapProgressRecord) => {
    const statusByItemId: Record<string, string> = {};
    progress.items.forEach((item) => {
      if (item.itemId) statusByItemId[item.itemId] = item.status;
      if (item.skillName) statusByItemId[item.skillName.toLowerCase()] = item.status;
      if (item.canonicalSkillName) statusByItemId[item.canonicalSkillName.toLowerCase()] = item.status;
    });

    const merged: Record<string, LearningNodeStatus> = {};
    data.modules.forEach((module) => {
      module.nodes.forEach((node) => {
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
        const initial: Record<string, LearningNodeStatus> = {};
        data.modules.forEach((module) => {
          module.nodes.forEach((node) => { initial[node.id] = node.status; });
        });
        setNodeStatuses(initial);

        roadmapService.getRoadmapProgress(roadmapId)
          .then((progress) => {
            setServerProgress(progress);
            setNodeStatuses(applyServerProgress(data, progress));
          })
          .catch(() => {});

        // Load course recommendations (best-effort)
        roadmapService.getCourseRecommendations(roadmapId, 4)
          .then((courses) => {
            console.log('[RoadmapDetail] Coursera courses response:', JSON.stringify(courses)?.slice(0, 300));
            if (courses?.length) setCourseRecommendations(courses);
          })
          .catch((err) => { console.warn('[RoadmapDetail] Coursera fetch failed:', err?.message || err); });
      }
    } catch (err) {
      console.warn('[RoadmapDetail] Load failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [roadmapId]);

  useEffect(() => { loadRoadmap(); }, [loadRoadmap]);

  const nodes = useMemo(() => {
    if (!roadmap) return [] as Array<LearningNode & { moduleTitle: string; moduleDesc: string }>;
    return roadmap.modules.flatMap((module) =>
      module.nodes.map((node) => ({ ...node, moduleTitle: module.title, moduleDesc: module.description }))
    );
  }, [roadmap]);

  const progressPercent = useMemo(() => {
    if (serverProgress) {
      // API: { data: { progressSummary: { overallProgress: 4 } } }
      // overallProgress inside progressSummary is already 0-100 percent
      const fromSummary = serverProgress.progressSummary?.overallProgress
        ?? serverProgress.progressSummary?.overallProgressPercent;
      if (typeof fromSummary === 'number' && Number.isFinite(fromSummary)) {
        return Math.round(fromSummary);
      }
      // Fallback: root-level overallProgress (may be 0-1 float or 0-100)
      const raw = serverProgress.overallProgress;
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return Math.round(raw > 1 ? raw : raw * 100);
      }
    }
    if (!nodes.length) return 0;
    const completed = nodes.filter((node) => nodeStatuses[node.id] === 'completed').length;
    return Math.round((completed / nodes.length) * 100);
  }, [nodes, nodeStatuses, serverProgress]);

  const updateNodeStatus = async (nodeId: string, newStatus: LearningNodeStatus) => {
    if (isSyncing) return;
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

    setIsSyncing(true);
    let apiStatus = 'not_started';
    if (newStatus === 'in-progress') apiStatus = 'in_progress';
    if (newStatus === 'completed') apiStatus = 'completed';

    roadmapService.updateRoadmapProgressItem(roadmapId, { itemId: nodeId, status: apiStatus })
      .then((progress) => {
        setServerProgress(progress);
        if (roadmap) setNodeStatuses(applyServerProgress(roadmap, progress));
      })
      .catch(() => {})
      .finally(() => setIsSyncing(false));
  };

  const handleArchive = async () => {
    if (!roadmap) return;
    showConfirm('Lưu trữ Roadmap', 'Bạn có chắc muốn lưu trữ lộ trình này không?', 'warning', 'Lưu trữ', async () => {
      setAlertDialog(prev => ({ ...prev, visible: false }));
      setIsArchiving(true);
      try {
        await roadmapService.archiveRoadmap(roadmap.id);
        showAlert('Thành công', 'Đã lưu trữ roadmap.', 'success', () => {
          setAlertDialog(prev => ({ ...prev, visible: false }));
          navigation.goBack();
        });
      } catch (err: any) {
        showAlert('Lỗi', err?.message || 'Không thể lưu trữ roadmap.', 'error');
      } finally {
        setIsArchiving(false);
      }
    });
  };

  const handleResetProgress = async () => {
    if (!roadmap) return;
    showConfirm('Đặt lại tiến độ', 'Xóa toàn bộ tiến độ? Hành động này không thể hoàn tác.', 'warning', 'Đặt lại', async () => {
      setAlertDialog(prev => ({ ...prev, visible: false }));
      setIsResetting(true);
      try {
        const updatedProgress = await roadmapService.resetRoadmapProgress(roadmap.id);
        setServerProgress(updatedProgress);
        setNodeStatuses(applyServerProgress(roadmap, updatedProgress));
        showAlert('Thành công', 'Đã đặt lại tiến độ học tập.', 'success');
      } catch (err: any) {
        showAlert('Lỗi', err?.message || 'Không thể đặt lại tiến độ.', 'error');
      } finally {
        setIsResetting(false);
      }
    });
  };

  const handleDelete = async () => {
    if (!roadmap) return;
    showConfirm('Xóa Lộ Trình', 'Bạn có chắc chắn muốn xóa lộ trình học này không? Hành động này sẽ ẩn lộ trình khỏi danh sách của bạn.', 'error', 'Xóa lộ trình', async () => {
      setAlertDialog(prev => ({ ...prev, visible: false }));
      setIsDeleting(true);
      try {
        await roadmapService.deleteRoadmap(roadmap.id);
        showAlert('Thành công', 'Đã xóa roadmap thành công.', 'success', () => {
          setAlertDialog(prev => ({ ...prev, visible: false }));
          navigation.goBack();
        });
      } catch (err: any) {
        showAlert('Lỗi', err?.message || 'Không thể xóa roadmap.', 'error');
      } finally {
        setIsDeleting(false);
      }
    });
  };

  const handleStartLearningNode = (nodeId: string, skillName: string) => {
    if (!roadmap) return;
    updateNodeStatus(nodeId, 'in-progress');
    navigation.navigate('SkillLearningDetail', {
      roadmapId: roadmap.id,
      skillName,
      nodeId,
    });
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

  const isArchived = roadmap.status === 'archived';
  const phaseCount = roadmap.modules.length;
  const roleMatch = roadmap.roleMatch;
  const skillGapSummary = roadmap.skillGapSummary;
  const prioritySkills = [
    ...(skillGapSummary?.prioritySkills ?? []),
    ...(skillGapSummary?.recommendedNextSkills ?? []),
  ].filter((s, i, list) => s && list.indexOf(s) === i).slice(0, 8);
  const completedCount = serverProgress?.progressSummary?.completedItems
    ?? nodes.filter(n => nodeStatuses[n.id] === 'completed').length;
  const inProgressCount = serverProgress?.progressSummary?.inProgressItems
    ?? nodes.filter(n => nodeStatuses[n.id] === 'in-progress').length;
  // Total items: prefer server's totalItems (includes all tasks), fallback to local node count
  const totalItemCount = serverProgress?.progressSummary?.totalItems ?? nodes.length;

  // Derive roadmapSource object
  const roadmapSourceObj = typeof roadmap.roadmapSource === 'object' ? roadmap.roadmapSource : undefined;
  const hasProvenance = Boolean(roadmapSourceObj?.selectedRoleId || roadmapSourceObj?.sourceRepositoryName || roadmapSourceObj?.pipelineVersion);
  const selectedRoleLabel = roleMatch?.roleName || roadmapSourceObj?.selectedRoleName || roadmapSourceObj?.selectedRoleId || roadmap.careerOutcome;
  const sourceRepositoryLabel = roadmapSourceObj?.sourceRepositoryName || roadmapSourceObj?.fullName || roadmapSourceObj?.repoName;
  const selectionTypeLabel = roadmapSourceObj?.roleSelectionType === 'current_repository_primary'
    ? 'Vai trò chính'
    : roadmapSourceObj?.roleSelectionType?.includes('portfolio') ? 'Vai trò từ portfolio' : roadmapSourceObj?.roleSelectionType;
  const pipelineLabel = roadmapSourceObj?.pipelineVersion;
  // Level: now mapped directly by normalizer from backend
  const requestedLevelText = formatLevel(roadmap.requestedLevel);
  const effectiveLevelText = formatLevel(roadmap.effectiveLevel);

  // ── Tab: Lộ trình ──────────────────────────────────────────────────
  const renderRoadmapTab = () => (
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
            <Text style={styles.moduleProgressBadge}>
              {module.nodes.filter(n => (nodeStatuses[n.id] ?? n.status) === 'completed').length}/{module.nodes.length} bài học
            </Text>
          </View>

          {/* Module progress bar */}
          {(() => {
            const mc = module.nodes.filter(n => (nodeStatuses[n.id] ?? n.status) === 'completed').length;
            const mt = module.nodes.length;
            const pct = mt ? Math.round((mc / mt) * 100) : 0;
            return (
              <View style={styles.moduleProgressRow}>
                <View style={styles.moduleProgressBg}>
                  <View style={[styles.moduleProgressFill, { width: `${pct}%` as any }]} />
                </View>
              </View>
            );
          })()}

          <View style={styles.moduleNodesContainer}>
            {module.nodes.map((node, nIndex) => {
              const status = nodeStatuses[node.id] ?? node.status;
              const isCompleted = status === 'completed';
              const isInProgress = status === 'in-progress';
              const isLastNodeInModule = nIndex === module.nodes.length - 1;
              const isLastNodeOverall = nodes[nodes.length - 1]?.id === node.id;

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
                    <View style={styles.iconWrapper}>{getStepStatusIcon(status)}</View>
                    {(!isLastNodeInModule || !isLastNodeOverall) && (
                      <View style={[styles.connectorLine, isCompleted && styles.completedLine, isInProgress && styles.inProgressLine]} />
                    )}
                  </View>

                  <View style={styles.rightCol}>
                    <Card style={StyleSheet.flatten([styles.stepCard, isInProgress && styles.inProgressCard, isCompleted && styles.completedCard])}>
                      {isCompleted && <View style={styles.taskTopBar} />}

                      <View style={styles.taskTitleRow}>
                        <Text style={[styles.stepTitleText, isCompleted && styles.completedText]} numberOfLines={3}>
                          {node.title}
                        </Text>
                        <View style={[styles.statusBadge, statusBadgeStyle]}>
                          <Text style={[styles.statusBadgeText, statusBadgeTextStyle]}>{statusBadgeText}</Text>
                        </View>
                      </View>

                      <Text style={styles.stepDescText} numberOfLines={2}>{node.description}</Text>

                      <View style={styles.taskChipsRow}>
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

                      <View style={styles.taskProgressBar}>
                        <View style={[
                          styles.taskProgressFill,
                          { width: isCompleted ? '100%' : isInProgress ? '50%' : '0%' } as any,
                          isCompleted && styles.taskProgressCompleted,
                          isInProgress && styles.taskProgressInProgress,
                        ]} />
                      </View>

                      <View style={styles.actionButtonsRow}>
                        <TouchableOpacity
                          style={[styles.progressActionBtn, (status === 'unlocked' || status === 'locked') && styles.progressActionBtnActive]}
                          onPress={() => handleStartLearningNode(node.id, node.skillName || node.canonicalSkillName || '')}
                        >
                          <Text style={[styles.progressActionText, (status === 'unlocked' || status === 'locked') && styles.progressActionTextActive]}>Học</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.progressActionBtn, isInProgress && styles.progressActionBtnActive]}
                          onPress={() => updateNodeStatus(node.id, 'in-progress')}
                        >
                          <Text style={[styles.progressActionText, isInProgress && styles.progressActionTextActive]}>Đang học</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.progressActionBtn, isCompleted && styles.progressActionBtnActiveCompleted]}
                          onPress={() => updateNodeStatus(node.id, 'completed')}
                        >
                          <Text style={[styles.progressActionText, isCompleted && styles.progressActionTextActiveCompleted]}>Xong</Text>
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
  );

  // ── Tab: Mục tiêu ──────────────────────────────────────────────────
  const renderObjectivesTab = () => (
    <View>
      <Text style={styles.tabSectionTitle}>Mục tiêu và kỹ năng</Text>
      <Text style={styles.tabSectionDesc}>Các mục tiêu chính cho hướng {roadmap.careerOutcome}</Text>

      {roadmap.objectives.length > 0 ? roadmap.objectives.map((obj, i) => (
        <View key={i} style={styles.objectiveItem}>
          <Target size={18} color={theme.colors.primary} style={{ marginTop: 2 }} />
          <Text style={styles.objectiveText}>{obj}</Text>
        </View>
      )) : (
        <Text style={styles.emptyTabText}>Roadmap này chưa có mục tiêu chi tiết.</Text>
      )}

      {roadmap.requiredSkills.length > 0 && (
        <View style={{ marginTop: theme.spacing.lg }}>
          <Text style={styles.tabSubTitle}>Kỹ năng cần tập trung</Text>
          <View style={styles.chipRow}>
            {roadmap.requiredSkills.map(skill => (
              <View key={skill} style={styles.chipDefault}>
                <Text style={styles.chipDefaultText}>{skill}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {roadmap.missingSkills && roadmap.missingSkills.length > 0 && (
        <View style={{ marginTop: theme.spacing.md }}>
          <Text style={styles.tabSubTitle}>Kỹ năng nên bổ sung</Text>
          <View style={styles.chipRow}>
            {roadmap.missingSkills.map(skill => (
              <View key={skill} style={styles.chipWarning}>
                <Text style={styles.chipWarningText}>{skill}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  // ── Tab: Hướng bổ trợ ──────────────────────────────────────────────
  const renderSupportTab = () => (
    <View>
      <Text style={styles.tabSectionDesc}>
        Các gợi ý thêm để portfolio và hồ sơ ứng tuyển rõ tín hiệu hơn.
      </Text>
      {roadmap.supportingPaths && roadmap.supportingPaths.length > 0 ? roadmap.supportingPaths.map(path => (
        <Card key={path.id} style={styles.supportCard}>
          <Text style={styles.supportTitle}>{path.title}</Text>
          <Text style={styles.supportReason}>{path.reason}</Text>
          {path.suggestedTasks.length > 0 && (
            <View style={{ marginTop: theme.spacing.sm }}>
              {path.suggestedTasks.map(task => (
                <Text key={task} style={styles.supportTask}>• {task}</Text>
              ))}
            </View>
          )}
        </Card>
      )) : (
        <Text style={styles.emptyTabText}>Chưa có hướng bổ trợ cho roadmap này.</Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarPaddingBottom }]}
      >
        {/* ─── 1. Header Card ─────────────────────────────────────────── */}
        <Card style={styles.headerCard} glow="cyan">
          {/* Gradient top bar */}
          <View style={[styles.topBar, isArchived && styles.topBarArchived]} />

          {/* Status badges */}
          <View style={styles.badgesRow}>
            <Badge label={roadmap.category} variant="secondary" />
            {formatDifficulty(roadmap.difficulty) && (
              <Badge label={formatDifficulty(roadmap.difficulty)!} variant="warning" />
            )}
            <Badge label={isArchived ? 'Đã lưu trữ' : 'Đang học'} variant={isArchived ? 'muted' : 'success'} />
            {isSyncing && <Badge label="Đang lưu..." variant="muted" />}
          </View>

          <View style={styles.headerTop}>
            <Milestone size={22} color={theme.colors.secondary} style={{ marginRight: theme.spacing.sm }} />
            <Text style={styles.headerTitle} numberOfLines={3}>{roadmap.title}</Text>
          </View>
          <Text style={styles.headerSub} numberOfLines={4}>{roadmap.subtitle || roadmap.description}</Text>

          {/* Tags */}
          {roadmap.tags.length > 0 && (
            <View style={styles.chipRow}>
              {roadmap.tags.slice(0, 6).map(tag => (
                <View key={tag} style={styles.chipDefault}>
                  <Text style={styles.chipDefaultText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Stats box */}
          <View style={styles.statsBox}>
            <View style={styles.statsBoxItem}>
              <Clock size={16} color={theme.colors.primary} />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.statsBoxValue}>{roadmap.estimatedWeeks} tuần dự kiến</Text>
                <Text style={styles.statsBoxSub}>{roadmap.estimatedHours} giờ dự kiến</Text>
              </View>
            </View>
            <View style={styles.statsBoxDivider} />
            <View style={styles.statsBoxItem}>
              <GitBranch size={16} color={theme.colors.secondaryLight} />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.statsBoxValue}>{phaseCount} giai đoạn</Text>
                <Text style={styles.statsBoxSub}>{nodes.length} nhiệm vụ</Text>
              </View>
            </View>
          </View>

          {/* Progress */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabels}>
              <Text style={styles.progressText}>{isArchived ? 'Tiến độ đã lưu' : 'Hoàn thành'}</Text>
              <Text style={styles.progressPercent}>{progressPercent}%</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` as any }, isArchived && styles.progressBarFillArchived]} />
            </View>
            <Text style={styles.progressSubText}>
              {completedCount}/{totalItemCount} bài học hoàn thành · {inProgressCount} đang học
            </Text>
          </View>

          {/* Control buttons */}
          <View style={styles.controlButtonsRow}>
            <Button title="Reset" variant="outline" onPress={handleResetProgress} loading={isResetting}
              icon={<RotateCcw size={15} color={theme.colors.textSecondary} />} style={styles.controlBtn} fullWidth={false} />
            {!isArchived && (
              <Button title="Lưu trữ" variant="outline" onPress={handleArchive} loading={isArchiving}
                icon={<Archive size={15} color={theme.colors.textSecondary} />} style={styles.controlBtn} fullWidth={false} />
            )}
            <Button title="Xóa" variant="outline" onPress={handleDelete} loading={isDeleting}
              icon={<Trash2 size={15} color={theme.colors.error} />} style={[styles.controlBtn, { borderColor: theme.colors.error }]} fullWidth={false} />
          </View>
        </Card>

        {/* ─── 2. Cơ sở cá nhân hóa ──────────────────────────────────── */}
        {(hasProvenance || roadmap.requestedLevel || roadmap.effectiveLevel) && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionCardTitle}>Cơ sở cá nhân hóa roadmap</Text>
            <Text style={styles.sectionCardDesc}>
              {hasProvenance ? 'Thông tin nguồn do backend trả về khi tạo roadmap.' : 'Roadmap cũ không có thông tin nguồn chi tiết.'}
            </Text>
            <View style={styles.provenanceGrid}>
              <View style={styles.provenanceItem}>
                <Text style={styles.provenanceLabel}>Roadmap theo vai trò</Text>
                <Text style={styles.provenanceValue}>{selectedRoleLabel || '—'}</Text>
              </View>
              <View style={styles.provenanceItem}>
                <Text style={styles.provenanceLabel}>Nguồn vai trò</Text>
                <Text style={styles.provenanceValue} numberOfLines={2}>{sourceRepositoryLabel || 'Không có thông tin nguồn chi tiết'}</Text>
              </View>
              <View style={styles.provenanceItem}>
                <Text style={styles.provenanceLabel}>Loại lựa chọn</Text>
                <Text style={styles.provenanceValue}>{selectionTypeLabel || 'Không có thông tin'}</Text>
              </View>
              <View style={styles.provenanceItem}>
                <Text style={styles.provenanceLabel}>Trình độ yêu cầu / thực tế</Text>
                <Text style={[styles.provenanceValue, { color: theme.colors.primary }]}>
                  {requestedLevelText || '—'} / {effectiveLevelText || '—'}
                </Text>
              </View>
              <View style={[styles.provenanceItem, { borderBottomWidth: 0 }]}>
                <Text style={styles.provenanceLabel}>Pipeline</Text>
                <Text style={styles.provenanceValue} numberOfLines={2}>{pipelineLabel || 'Không có thông tin'}</Text>
              </View>
            </View>
          </Card>
        )}

        {/* ─── 3. Cá nhân hóa theo role match ────────────────────────── */}
        {(roleMatch || skillGapSummary || prioritySkills.length > 0) && (
          <Card style={styles.sectionCard}>
            <View style={styles.sectionCardTitleRow}>
              <Sparkles size={18} color={theme.colors.primary} />
              <Text style={[styles.sectionCardTitle, { marginLeft: 8, marginBottom: 0 }]}>Cá nhân hóa theo role match</Text>
            </View>
            <Text style={styles.sectionCardDesc}>
              Roadmap này được ưu tiên theo mức phù hợp của repository và các khoảng trống kỹ năng quan trọng nhất.
            </Text>

            <View style={styles.roleMatchBody}>
              {/* Left: role + match score */}
              <View style={styles.roleMatchLeft}>
                <Text style={styles.roleMatchRoleLabel}>Vai trò mục tiêu</Text>
                <Text style={styles.roleMatchRoleName}>{roleMatch?.roleName || roadmap.careerOutcome}</Text>
                {typeof roleMatch?.matchScore === 'number' && (
                  <>
                    <View style={styles.matchScoreRow}>
                      <Text style={styles.matchScoreLabel}>Mức phù hợp</Text>
                      <Text style={styles.matchScoreValue}>{Math.round(roleMatch.matchScore)}%</Text>
                    </View>
                    <View style={styles.matchBarBg}>
                      <View style={[styles.matchBarFill, { width: `${Math.min(100, roleMatch.matchScore)}%` as any }]} />
                    </View>
                    {roleMatch.matchLevelLabel && (
                      <View style={styles.matchLevelBadge}>
                        <Text style={styles.matchLevelText}>{roleMatch.matchLevelLabel}</Text>
                      </View>
                    )}
                  </>
                )}
              </View>

              {/* Right: gap stats */}
              <View style={styles.roleMatchRight}>
                <View style={styles.gapStatRow}>
                  <View style={styles.gapStatItem}>
                    <Text style={styles.gapStatValue}>{skillGapSummary?.totalGaps ?? roadmap.missingSkills?.length ?? 0}</Text>
                    <Text style={styles.gapStatLabel}>khoảng trống</Text>
                  </View>
                  <View style={styles.gapStatItem}>
                    <Text style={styles.gapStatValue}>{skillGapSummary?.missingRequiredCount ?? 0}</Text>
                    <Text style={styles.gapStatLabel}>thiếu cốt lõi</Text>
                  </View>
                  <View style={styles.gapStatItem}>
                    <Text style={styles.gapStatValue}>{skillGapSummary?.weakSkillCount ?? 0}</Text>
                    <Text style={styles.gapStatLabel}>cần củng cố</Text>
                  </View>
                </View>

                {prioritySkills.length > 0 && (
                  <View style={{ marginTop: theme.spacing.sm }}>
                    <Text style={styles.prioritySkillsLabel}>Kỹ năng ưu tiên</Text>
                    <View style={styles.chipRow}>
                      {prioritySkills.map(skill => (
                        <View key={skill} style={styles.chipWarning}>
                          <Text style={styles.chipWarningText}>{skill}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </View>
          </Card>
        )}

        {/* ─── 4. Khóa học tham khảo từ Coursera ────────────────────────── */}
        {courseRecommendations.length > 0 && (
          <Card style={styles.sectionCard}>
            <View style={styles.sectionCardTitleRow}>
              <BookOpen size={18} color={theme.colors.secondaryLight} />
              <Text style={[styles.sectionCardTitle, { marginLeft: 8, marginBottom: 0 }]}>Khóa học tham khảo trên Coursera</Text>
            </View>
            <Text style={styles.sectionCardDesc}>Các khóa học bên ngoài được đề xuất theo toàn bộ lộ trình của bạn.</Text>

            {courseRecommendations.map((course, idx) => (
              <TouchableOpacity
                key={course.id ?? idx}
                style={styles.courseListItem}
                onPress={() => course.url && Linking.openURL(course.url)}
                activeOpacity={0.8}
              >
                <View style={styles.courseListLeft}>
                  <View style={styles.courseLogo}>
                    <Text style={styles.courseLogoChar}>
                      {(course.partnerName ?? course.provider ?? 'C')[0].toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.courseListRight}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                    {course.type && (
                      <View style={styles.courseTypeBadge}>
                        <Text style={styles.courseTypeBadgeText}>
                          {course.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </Text>
                      </View>
                    )}
                    {course.level && (
                      <View style={[styles.courseTypeBadge, { backgroundColor: '#1e3a5f' }]}>
                        <Text style={[styles.courseTypeBadgeText, { color: '#60a5fa' }]}>
                          {course.level.charAt(0).toUpperCase() + course.level.slice(1)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.courseListTitle} numberOfLines={2}>{course.title}</Text>
                  {(course.partnerName || course.provider) && (
                    <Text style={styles.courseProvider}>
                      {course.partnerName ? `${course.partnerName} · Coursera` : course.provider}
                    </Text>
                  )}
                  {course.description && <Text style={styles.courseDesc} numberOfLines={2}>{course.description}</Text>}
                  <View style={styles.courseMeta}>
                    {course.duration && <Text style={styles.courseMetaText}>⏱ {course.duration}</Text>}
                    {course.language && <Text style={styles.courseMetaText}>🌐 {course.language.toUpperCase()}</Text>}
                  </View>
                  <View style={styles.courseViewRow}>
                    <ExternalLink size={12} color={theme.colors.primary} />
                    <Text style={styles.courseViewText}>Xem khóa học trên Coursera</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.courseDisclaimer}>
              Đây là tài nguyên học bổ sung. Tiến độ trên Coursera không được đồng bộ với tiến độ trong ứng dụng.
            </Text>
          </Card>
        )}

        {/* ─── 5. Tabs ────────────────────────────────────────────────── */}
        <View style={styles.tabBar}>
          {(['roadmap', 'objectives', 'support'] as ActiveTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>
                {tab === 'roadmap' ? 'Lộ trình' : tab === 'objectives' ? 'Mục tiêu' : 'Hướng bổ trợ'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Card style={styles.tabContent}>
          <Text style={styles.tabContentTitle}>
            {activeTab === 'roadmap'
              ? (isArchived ? 'Nội dung roadmap đã lưu' : 'Lộ trình học')
              : activeTab === 'objectives' ? 'Mục tiêu và kỹ năng'
              : 'Hướng bổ trợ'}
          </Text>
          {activeTab !== 'support' && (
            <Text style={styles.tabContentDesc}>
              {activeTab === 'roadmap'
                ? (isArchived ? 'Roadmap lưu trữ để xem lại nội dung.' : 'Mở từng nhiệm vụ để xem kỹ năng, thời lượng và đánh dấu tiến độ.')
                : `Các mục tiêu chính cho hướng ${roadmap.careerOutcome}`}
            </Text>
          )}

          {activeTab === 'roadmap' && renderRoadmapTab()}
          {activeTab === 'objectives' && renderObjectivesTab()}
          {activeTab === 'support' && renderSupportTab()}
        </Card>
      </ScrollView>

      <CustomAlert
        visible={alertDialog.visible}
        title={alertDialog.title}
        message={alertDialog.message}
        type={alertDialog.type}
        showCancel={alertDialog.showCancel}
        confirmText={alertDialog.confirmText}
        cancelText="Hủy"
        onCancel={() => setAlertDialog(prev => ({ ...prev, visible: false }))}
        onConfirm={alertDialog.onConfirm}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  errorText: { color: theme.colors.textMuted, fontSize: 16 },
  container: { flex: 1, backgroundColor: theme.colors.background },
  contentContainer: { padding: theme.spacing.lg, gap: theme.spacing.md },

  // ── Header card ──────────────────────────────────────────────────────
  headerCard: { padding: 0, overflow: 'hidden' },
  topBar: {
    height: 4,
    backgroundColor: theme.colors.secondary,
    borderTopLeftRadius: theme.roundness.md,
    borderTopRightRadius: theme.roundness.md,
  },
  topBarArchived: { backgroundColor: theme.colors.textMuted },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm },
  headerTitle: { flex: 1, fontSize: theme.typography.sizes.lg + 2, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary, lineHeight: 26 },
  headerSub: { fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary, marginTop: 6, paddingHorizontal: theme.spacing.md, lineHeight: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: theme.spacing.md, marginTop: theme.spacing.sm },
  chipDefault: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: theme.colors.surfaceLight, borderWidth: 1, borderColor: theme.colors.border },
  chipDefaultText: { fontSize: 11, color: theme.colors.textSecondary },
  chipWarning: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#fef3c715', borderWidth: 1, borderColor: '#fbbf2450' },
  chipWarningText: { fontSize: 11, color: '#d97706', fontWeight: '600' },
  statsBox: {
    flexDirection: 'row', margin: theme.spacing.md, borderRadius: theme.roundness.sm,
    backgroundColor: theme.colors.surfaceLight, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md, gap: theme.spacing.md,
  },
  statsBoxItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  statsBoxDivider: { width: 1, backgroundColor: theme.colors.border },
  statsBoxValue: { fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary },
  statsBoxSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  progressSection: { paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.sm },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressText: { fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary },
  progressPercent: { fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary },
  progressBarBg: { height: 8, borderRadius: 4, backgroundColor: theme.colors.border, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4, backgroundColor: theme.colors.secondary },
  progressBarFillArchived: { backgroundColor: theme.colors.textMuted },
  progressSubText: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  controlButtonsRow: { flexDirection: 'row', gap: theme.spacing.sm, padding: theme.spacing.md, paddingTop: 0 },
  controlBtn: { flex: 1 },

  // ── Section cards ─────────────────────────────────────────────────────
  sectionCard: { padding: theme.spacing.md },
  sectionCardTitle: { fontSize: theme.typography.sizes.md, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary, marginBottom: 4 },
  sectionCardTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sectionCardDesc: { fontSize: theme.typography.sizes.sm, color: theme.colors.textMuted, marginBottom: theme.spacing.md, lineHeight: 18 },

  // ── Provenance grid ───────────────────────────────────────────────────
  provenanceGrid: { gap: 0 },
  provenanceItem: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  provenanceLabel: { fontSize: 11, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  provenanceValue: { fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary, marginTop: 2 },

  // ── Role match ────────────────────────────────────────────────────────
  roleMatchBody: { flexDirection: 'column', gap: theme.spacing.md },
  roleMatchLeft: {
    padding: theme.spacing.md, borderRadius: theme.roundness.sm,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceLight,
  },
  roleMatchRoleLabel: { fontSize: 11, color: theme.colors.textMuted },
  roleMatchRoleName: { fontSize: theme.typography.sizes.md, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary, marginTop: 2 },
  matchScoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, marginBottom: 4 },
  matchScoreLabel: { fontSize: 11, color: theme.colors.textMuted },
  matchScoreValue: { fontSize: 11, fontWeight: 'bold', color: theme.colors.textPrimary },
  matchBarBg: { height: 8, borderRadius: 4, backgroundColor: theme.colors.border, overflow: 'hidden' },
  matchBarFill: { height: '100%', borderRadius: 4, backgroundColor: theme.colors.primary },
  matchLevelBadge: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#dbeafe' },
  matchLevelText: { fontSize: 11, color: '#1d4ed8', fontWeight: '600' },
  roleMatchRight: {},
  gapStatRow: { flexDirection: 'row', gap: theme.spacing.sm },
  gapStatItem: {
    flex: 1, padding: theme.spacing.sm, borderRadius: theme.roundness.sm,
    backgroundColor: theme.colors.surfaceLight, alignItems: 'center',
  },
  gapStatValue: { fontSize: theme.typography.sizes.lg, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary },
  gapStatLabel: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2, textAlign: 'center' },
  prioritySkillsLabel: { fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary, marginBottom: 6 },

  // ── Coursera cards ────────────────────────────────────────────────────
  courseCard: {
    width: 220, borderRadius: theme.roundness.md, borderWidth: 1,
    borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden',
  },
  courseLogoBox: { height: 100, backgroundColor: '#1a1f6e', justifyContent: 'center', alignItems: 'center' },
  courseLogoText: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  courseLogoLabel: { fontSize: 13, color: '#fff', marginTop: 2 },
  courseLogoSub: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  courseTypeBadge: {
    marginTop: theme.spacing.sm, marginHorizontal: theme.spacing.sm,
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, backgroundColor: '#dbeafe',
  },
  courseTypeBadgeText: { fontSize: 10, color: '#1d4ed8', fontWeight: '600' },
  courseTitle: { fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary, marginHorizontal: theme.spacing.sm, marginTop: 6 },
  courseProvider: { fontSize: 11, color: theme.colors.primary, marginHorizontal: theme.spacing.sm, marginTop: 2 },
  courseDesc: { fontSize: 11, color: theme.colors.textMuted, marginHorizontal: theme.spacing.sm, marginTop: 4, lineHeight: 16 },
  courseMeta: { flexDirection: 'row', gap: 8, marginHorizontal: theme.spacing.sm, marginTop: 6 },
  courseMetaText: { fontSize: 11, color: theme.colors.textMuted },
  courseBtn: {
    margin: theme.spacing.sm, marginTop: theme.spacing.sm,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4,
    paddingVertical: 10, borderRadius: theme.roundness.sm,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  courseBtnText: { fontSize: 12, fontWeight: '600', color: theme.colors.textPrimary },
  courseDisclaimer: { fontSize: 11, color: theme.colors.textMuted, marginTop: theme.spacing.sm, lineHeight: 16 },

  // ── Tab bar ───────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row', backgroundColor: theme.colors.surface,
    borderRadius: theme.roundness.sm, padding: 4,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: theme.roundness.sm - 2, alignItems: 'center' },
  tabBtnActive: { backgroundColor: theme.colors.primary },
  tabBtnText: { fontSize: theme.typography.sizes.sm, color: theme.colors.textMuted, fontWeight: '500' },
  tabBtnTextActive: { color: '#fff', fontWeight: theme.typography.weights.bold },
  tabContent: { padding: theme.spacing.md },
  tabContentTitle: { fontSize: theme.typography.sizes.md, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary, marginBottom: 4 },
  tabContentDesc: { fontSize: theme.typography.sizes.sm, color: theme.colors.textMuted, marginBottom: theme.spacing.md, lineHeight: 18 },

  // ── Timeline ───────────────────────────────────────────────────────────
  timelineContainer: { gap: 0 },
  moduleContainer: { marginBottom: theme.spacing.lg },
  moduleHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  moduleNumberBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  moduleNumberText: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  moduleTitleCol: { flex: 1 },
  moduleTitleText: { fontSize: theme.typography.sizes.md, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary },
  moduleDescText: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  moduleProgressBadge: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  moduleProgressRow: { marginBottom: theme.spacing.sm },
  moduleProgressBg: { height: 4, borderRadius: 2, backgroundColor: theme.colors.border, overflow: 'hidden' },
  moduleProgressFill: { height: '100%', borderRadius: 2, backgroundColor: theme.colors.secondary },
  moduleNodesContainer: { gap: 0 },
  stepContainer: { flexDirection: 'row', marginBottom: 4 },
  leftCol: { alignItems: 'center', width: 40 },
  iconWrapper: { marginTop: 16 },
  connectorLine: { flex: 1, width: 2, backgroundColor: theme.colors.border, marginTop: 4, marginBottom: 0, minHeight: 20 },
  completedLine: { backgroundColor: theme.colors.success },
  inProgressLine: { backgroundColor: theme.colors.secondaryLight },
  rightCol: { flex: 1, paddingBottom: theme.spacing.sm },
  stepCard: { padding: theme.spacing.md, borderRadius: theme.roundness.md, marginBottom: 8, overflow: 'hidden' },
  inProgressCard: { borderColor: theme.colors.secondaryLight, borderWidth: 1 },
  completedCard: { opacity: 0.85 },
  taskTopBar: { height: 3, backgroundColor: theme.colors.success, marginHorizontal: -theme.spacing.md, marginTop: -theme.spacing.md, marginBottom: theme.spacing.sm },
  taskTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  stepTitleText: { flex: 1, fontSize: theme.typography.sizes.sm + 1, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary, lineHeight: 20 },
  completedText: { color: theme.colors.textMuted, textDecorationLine: 'line-through' },
  stepDescText: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
  taskChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  chipSkill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: theme.colors.surfaceLight, borderWidth: 1, borderColor: theme.colors.border },
  chipSkillText: { fontSize: 11, color: theme.colors.textSecondary },
  chipCategory: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#dbeafe20', borderWidth: 1, borderColor: '#3b82f630' },
  chipCategoryText: { fontSize: 11, color: '#60a5fa' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: '600' },
  badgeCanLearn: { backgroundColor: '#dbeafe20', borderWidth: 1, borderColor: '#3b82f630' },
  badgeCanLearnText: { color: '#60a5fa' },
  badgeCompleted: { backgroundColor: '#d1fae520', borderWidth: 1, borderColor: '#34d39930' },
  badgeCompletedText: { color: '#10b981' },
  badgeInProgress: { backgroundColor: '#fef3c720', borderWidth: 1, borderColor: '#fbbf2430' },
  badgeInProgressText: { color: '#f59e0b' },
  badgeLocked: { backgroundColor: theme.colors.surfaceLight, borderWidth: 1, borderColor: theme.colors.border },
  badgeLockedText: { color: theme.colors.textMuted },
  taskProgressBar: { height: 3, borderRadius: 2, backgroundColor: theme.colors.border, overflow: 'hidden', marginTop: theme.spacing.sm },
  taskProgressFill: { height: '100%', borderRadius: 2, backgroundColor: theme.colors.border },
  taskProgressCompleted: { backgroundColor: theme.colors.success },
  taskProgressInProgress: { backgroundColor: theme.colors.secondaryLight },
  actionButtonsRow: { flexDirection: 'row', gap: 6, marginTop: theme.spacing.sm },
  progressActionBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.colors.surfaceLight, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' },
  progressActionBtnActive: { backgroundColor: theme.colors.secondary + '25', borderColor: theme.colors.secondary },
  progressActionBtnActiveCompleted: { backgroundColor: theme.colors.success + '25', borderColor: theme.colors.success },
  progressActionText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '500' },
  progressActionTextActive: { color: theme.colors.secondaryLight, fontWeight: 'bold' },
  progressActionTextActiveCompleted: { color: theme.colors.success, fontWeight: 'bold' },

  // ── Objectives tab ─────────────────────────────────────────────────────
  tabSectionTitle: { fontSize: theme.typography.sizes.md, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary, marginBottom: 4 },
  tabSectionDesc: { fontSize: theme.typography.sizes.sm, color: theme.colors.textMuted, marginBottom: theme.spacing.md },
  objectiveItem: { flexDirection: 'row', gap: 10, padding: theme.spacing.md, borderRadius: theme.roundness.sm, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 8 },
  objectiveText: { flex: 1, fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary, lineHeight: 20 },
  tabSubTitle: { fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary, marginBottom: 6 },
  emptyTabText: { fontSize: theme.typography.sizes.sm, color: theme.colors.textMuted, fontStyle: 'italic' },

  // ── Supporting paths tab ───────────────────────────────────────────────
  supportCard: { marginBottom: theme.spacing.sm, padding: theme.spacing.md },
  supportTitle: { fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary },
  supportReason: { fontSize: theme.typography.sizes.sm, color: theme.colors.textMuted, marginTop: 4, lineHeight: 18 },
  supportTask: { fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary, marginTop: 4, lineHeight: 20 },

  // ── Course list items (in support tab) ─────────────────────────────────
  courseListItem: {
    flexDirection: 'row',
    gap: 12,
    padding: theme.spacing.md,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: theme.spacing.sm,
  },
  courseListLeft: { justifyContent: 'flex-start', paddingTop: 2 },
  courseLogo: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1a1f6e', justifyContent: 'center', alignItems: 'center',
  },
  courseLogoChar: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  courseListRight: { flex: 1, gap: 3 },
  courseListTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.textPrimary, lineHeight: 18 },
  courseViewRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  courseViewText: { fontSize: 12, color: theme.colors.primary, fontWeight: '600' },
  loadingCourseRow: { paddingVertical: theme.spacing.md, alignItems: 'center' },
});
