import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import {
  Milestone,
  CheckCircle2,
  Circle,
  Lock,
  ChevronRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react-native';

import { theme } from '../../theme';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import { roadmapService } from '../../features/roadmaps/api';
import type { LearningNode, LearningNodeStatus, Roadmap } from '../../features/roadmaps/types';
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

  const markNodeCompleted = (nodeId: string) => {
    setNodeStatuses((prev) => {
      const newStatuses = { ...prev, [nodeId]: 'completed' as LearningNodeStatus };
      const nodeIndex = nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex !== -1 && nodeIndex < nodes.length - 1) {
        const nextNodeId = nodes[nodeIndex + 1].id;
        if (newStatuses[nextNodeId] === 'locked' || !newStatuses[nextNodeId]) {
          newStatuses[nextNodeId] = 'unlocked';
        }
      }
      return newStatuses;
    });
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

            <View style={styles.moduleNodesContainer}>
              {module.nodes.map((node, nIndex) => {
                const status = nodeStatuses[node.id] ?? node.status;
                const isCompleted = status === 'completed';
                const isInProgress = status === 'in-progress' || status === 'unlocked';
                const isExpanded = expandedNodes[node.id] || false;
                const isLastNodeInModule = nIndex === module.nodes.length - 1;
                const isLastNodeOverall = nodes[nodes.length - 1].id === node.id;

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
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => toggleExpand(node.id)}
                        >
                          <View style={styles.stepHeaderRow}>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                              <Text style={[styles.stepTitleText, isCompleted && styles.completedText]}>
                                {node.title}
                              </Text>
                            </View>
                            {isExpanded ? <ChevronUp size={20} color={theme.colors.textMuted} /> : <ChevronDown size={20} color={theme.colors.textMuted} />}
                          </View>

                          <Text style={styles.stepDescText}>{node.description}</Text>

                          <View style={styles.nodeMetaRow}>
                            <Badge label={node.difficulty === 'Advanced' ? 'Nâng cao' : node.difficulty} variant="warning" />
                            <Text style={styles.durationText}>{node.estimatedHours}h</Text>
                          </View>
                        </TouchableOpacity>

                        {isExpanded && (
                          <View style={styles.expandedContent}>
                            <Text style={styles.skillsLabel}>KỸ NĂNG CẦN HỌC</Text>
                            <View style={styles.skillsList}>
                              {node.skills && node.skills.length > 0 ? (
                                node.skills.map((skill, sIndex) => (
                                  <TouchableOpacity
                                    key={sIndex}
                                    style={[styles.skillItemRow, sIndex === node.skills.length - 1 && { borderBottomWidth: 0 }]}
                                    onPress={() => navigation.navigate('SkillLearningDetail', { roadmapId, skillName: skill, nodeId: node.id })}
                                  >
                                    <Text style={styles.skillItemText}>{skill}</Text>
                                    <ChevronRight size={16} color={theme.colors.textMuted} />
                                  </TouchableOpacity>
                                ))
                              ) : (
                                <Text style={styles.emptySkillsText}>Không có kỹ năng cụ thể</Text>
                              )}
                            </View>

                            <View style={styles.actionButtonsRow}>
                              <Button
                                title={isCompleted ? "Đã hoàn thành" : "Đánh dấu hoàn thành"}
                                variant={isCompleted ? "secondary" : "primary"}
                                onPress={() => markNodeCompleted(node.id)}
                                disabled={isCompleted}
                                style={styles.completeBtn}
                              />
                              {isCompleted && (
                                <Button
                                  title="Tiếp tục"
                                  variant="outline"
                                  onPress={() => toggleExpand(node.id)}
                                />
                              )}
                            </View>
                          </View>
                        )}
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
    marginBottom: theme.spacing.md,
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
  },
  inProgressCard: {
    borderColor: theme.colors.secondaryLight,
    borderWidth: 1,
  },
  completedCard: {
    opacity: 0.9,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  stepTitleText: {
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
    gap: theme.spacing.sm,
  },
  completeBtn: {
    flex: 1,
  },
});
