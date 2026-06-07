import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import {
  Milestone,
  CheckCircle2,
  Circle,
  Lock,
  Award,
  ChevronRight,
} from 'lucide-react-native';

import { theme } from '../../theme';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import { roadmapService } from '../../features/roadmaps/api';
import type { LearningNode, LearningNodeStatus, Roadmap } from '../../features/roadmaps/types';
import type { RoadmapStackParamList } from '../../navigation/types';

type DetailRoute = RouteProp<RoadmapStackParamList, 'RoadmapDetail'>;

const nextStatus = (status: LearningNodeStatus): LearningNodeStatus => {
  if (status === 'locked') return 'in-progress';
  if (status === 'in-progress') return 'completed';
  if (status === 'unlocked') return 'in-progress';
  return 'locked';
};

const getStepStatusIcon = (status: LearningNodeStatus) => {
  if (status === 'completed') return <CheckCircle2 size={24} color={theme.colors.success} />;
  if (status === 'in-progress' || status === 'unlocked') {
    return <Circle size={24} color={theme.colors.secondaryLight} />;
  }
  return <Lock size={20} color={theme.colors.textMuted} />;
};

const getStepStatusBadge = (status: LearningNodeStatus) => {
  if (status === 'completed') return <Badge label="Đã Xong" variant="success" />;
  if (status === 'in-progress' || status === 'unlocked') return <Badge label="Đang Học" variant="secondary" />;
  return <Badge label="Chưa Mở" variant="muted" />;
};

export const RoadmapDetailScreen: React.FC = () => {
  const route = useRoute<DetailRoute>();
  const { tabBarPaddingBottom } = useTabBarAwareScroll();
  const { roadmapId } = route.params;

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, LearningNodeStatus>>({});
  const [isLoading, setIsLoading] = useState(true);

  const loadRoadmap = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await roadmapService.getRoadmapById(roadmapId);
      if (data) {
        setRoadmap(data);
        const initial: Record<string, LearningNodeStatus> = {};
        data.modules.forEach((module) => {
          module.nodes.forEach((node) => {
            initial[node.id] = node.status;
          });
        });
        setNodeStatuses(initial);
      }
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
    if (!nodes.length) return 0;
    const completed = nodes.filter((node) => nodeStatuses[node.id] === 'completed').length;
    return Math.round((completed / nodes.length) * 100);
  }, [nodes, nodeStatuses]);

  const toggleNode = (nodeId: string) => {
    setNodeStatuses((prev) => ({
      ...prev,
      [nodeId]: nextStatus(prev[nodeId] ?? 'locked'),
    }));
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
      </Card>

      <SectionHeader title="Các nhiệm vụ học tập" accentColor={theme.colors.primary} />

      <View style={styles.timelineContainer}>
        {nodes.map((node, index) => {
          const status = nodeStatuses[node.id] ?? node.status;
          const isLast = index === nodes.length - 1;
          const isCompleted = status === 'completed';
          const isInProgress = status === 'in-progress' || status === 'unlocked';

          return (
            <View key={node.id} style={styles.stepContainer}>
              <View style={styles.leftCol}>
                <TouchableOpacity
                  onPress={() => toggleNode(node.id)}
                  activeOpacity={0.8}
                  style={styles.iconWrapper}
                >
                  {getStepStatusIcon(status)}
                </TouchableOpacity>
                {!isLast && (
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
                  <View style={styles.stepHeaderRow}>
                    <Text style={styles.durationText}>{node.estimatedHours}h</Text>
                    {getStepStatusBadge(status)}
                  </View>

                  <Text style={[styles.stepTitleText, isCompleted && styles.completedText]}>
                    {node.title}
                  </Text>
                  <Text style={styles.stepDescText}>{node.description}</Text>

                  <View style={styles.focusBox}>
                    <Award size={14} color={theme.colors.warning} style={styles.focusIcon} />
                    <Text style={styles.focusText}>
                      <Text style={{ fontWeight: 'bold', color: theme.colors.warning }}>Giai đoạn: </Text>
                      {node.moduleTitle}
                    </Text>
                  </View>

                  {node.resources.length > 0 && (
                    <>
                      <Text style={styles.resLabel}>TÀI LIỆU HỌC TẬP:</Text>
                      {node.resources.map((res) => (
                        <View key={res.id} style={styles.resRow}>
                          <ChevronRight size={12} color={theme.colors.secondary} style={{ marginRight: 4 }} />
                          <Text style={styles.resText}>{res.title}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  <TouchableOpacity style={styles.toggleStatusBtn} onPress={() => toggleNode(node.id)}>
                    <Text style={styles.toggleStatusText}>
                      {status === 'completed'
                        ? 'Đặt lại: Đang học'
                        : status === 'in-progress' || status === 'unlocked'
                          ? 'Đánh dấu: Hoàn thành'
                          : 'Mở khóa nhiệm vụ này'}
                    </Text>
                  </TouchableOpacity>
                </Card>
              </View>
            </View>
          );
        })}
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
    marginBottom: theme.spacing.md,
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
    paddingLeft: theme.spacing.xs,
  },
  stepContainer: {
    flexDirection: 'row',
    marginBottom: theme.spacing.lg,
  },
  leftCol: {
    width: 32,
    alignItems: 'center',
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  connectorLine: {
    width: 2,
    flex: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
  rightCol: {
    flex: 1,
    paddingLeft: theme.spacing.md,
  },
  stepCard: {
    padding: theme.spacing.md + 2,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  durationText: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.secondaryLight,
    letterSpacing: 0.5,
  },
  stepTitleText: {
    fontSize: theme.typography.sizes.md - 1,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
    lineHeight: theme.typography.lineHeights.sm,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: theme.colors.textSecondary,
  },
  stepDescText: {
    fontSize: theme.typography.sizes.sm - 1,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.xs + 3,
    marginBottom: theme.spacing.md,
  },
  focusBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: theme.roundness.sm - 2,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  focusIcon: {
    marginRight: 6,
    marginTop: 2,
  },
  focusText: {
    flex: 1,
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.xs + 3,
  },
  resLabel: {
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  resRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  resText: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.secondaryLight,
    lineHeight: theme.typography.lineHeights.xs + 2,
    flex: 1,
  },
  toggleStatusBtn: {
    marginTop: theme.spacing.md,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.md,
    alignItems: 'center',
  },
  toggleStatusText: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.secondary,
    fontWeight: theme.typography.weights.bold,
  },
  inProgressCard: {
    borderColor: theme.colors.secondary,
  },
  completedCard: {
    opacity: 0.85,
  },
  completedLine: {
    backgroundColor: theme.colors.success,
  },
  inProgressLine: {
    backgroundColor: theme.colors.secondaryLight,
  },
});
