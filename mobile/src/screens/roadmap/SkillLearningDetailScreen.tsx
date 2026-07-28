import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Code2,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Play,
  Sparkles,
  Star,
  Target,
  Wand2,
  AlertTriangle,
  Lightbulb,
  ExternalLink,
  ChevronRight,
} from 'lucide-react-native';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CustomAlert } from '../../components/ui/CustomAlert';
import { roadmapService } from '../../features/roadmaps/api';
import type { LearningContent, LearningNode, Roadmap, IntegratedLearningListItem } from '../../features/roadmaps/types';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import type { RoadmapStackParamList } from '../../navigation/types';
import { theme } from '../../theme';

type DetailRoute = RouteProp<RoadmapStackParamList, 'SkillLearningDetail'>;

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  isOpenInitial?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, count, isOpenInitial = false, children }) => {
  const [isOpen, setIsOpen] = useState(isOpenInitial);
  return (
    <Card style={styles.accordionCard} padded={false}>
      <TouchableOpacity style={styles.accordionHeader} onPress={() => setIsOpen(!isOpen)} activeOpacity={0.7}>
        <View style={styles.accordionHeaderLeft}>
          <Text style={styles.accordionTitle}>{title}</Text>
          {typeof count === 'number' && count > 0 && (
            <View style={styles.accordionCountBadge}>
              <Text style={styles.accordionCountText}>{count}</Text>
            </View>
          )}
        </View>
        {isOpen ? <ChevronUp size={16} color={theme.colors.textMuted} /> : <ChevronDown size={16} color={theme.colors.textMuted} />}
      </TouchableOpacity>
      {isOpen && (
        <View style={styles.accordionContent}>
          {children}
        </View>
      )}
    </Card>
  );
};

export const SkillLearningDetailScreen: React.FC = () => {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<any>();
  const { tabBarPaddingBottom } = useTabBarAwareScroll();
  const { roadmapId, skillName, nodeId } = route.params;

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [node, setNode] = useState<LearningNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [learningContent, setLearningContent] = useState<LearningContent | null>(null);
  const [aiResources, setAiResources] = useState<any[]>([]);
  const [isSearchingVideos, setIsSearchingVideos] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [learningListItem, setLearningListItem] = useState<IntegratedLearningListItem | null>(null);
  const [status, setStatus] = useState<string>('unlocked');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [courseRecommendations, setCourseRecommendations] = useState<any[]>([]);

  // ── Compile content logic ──────────────────────────────────────────
  const handleCompileWithAI = async () => {
    setIsGenerating(true);
    try {
      let content: LearningContent | null = null;
      const itemId = learningListItem?.itemId || nodeId;
      if (itemId && roadmapId) {
        try {
          const resp = await roadmapService.generateRoadmapLearningItem(roadmapId, itemId, {
            forceRegenerate: false,
            includeResources: true,
          });
          if (resp?.learning) {
            content = resp.learning;
            if (resp.itemId) {
              setLearningListItem((prev) => prev ? { ...prev, learningStatus: 'available' } : prev);
            }
          }
        } catch {
          // fallback
        }
      }

      if (!content) {
        const roleName = roadmap?.roleMatch?.roleName || roadmap?.title || 'vai trò này';
        const difficulty = node?.difficulty || roadmap?.difficulty || 'Beginner';
        content = await roadmapService.generateLearningContent({
          skillName,
          targetRole: roleName,
          level: difficulty,
          language: 'vi',
        });
      }

      if (content) {
        setLearningContent(content);
      }
    } catch (error) {
      console.error('Error generating learning content:', error);
      const roleName = roadmap?.roleMatch?.roleName || roadmap?.title || 'vai trò này';
      navigation.navigate('ChatTab', {
        repoId: undefined,
        repoName: undefined,
        initialMessage: `Hãy biên soạn cho tôi một bài học chi tiết về kỹ năng: "${skillName}" trong bối cảnh học ${roleName}. Cung cấp khái niệm, ví dụ code, và hướng dẫn thực hành.`
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await roadmapService.getRoadmapById(roadmapId);
      if (data) {
        setRoadmap(data);
        let foundNode: LearningNode | null = null;
        if (nodeId) {
          for (const module of data.modules) {
            const found = module.nodes.find(n => n.id === nodeId);
            if (found) { foundNode = found; break; }
          }
        } else {
          for (const module of data.modules) {
            const found = module.nodes.find(n => n.skillName === skillName || n.canonicalSkillName === skillName);
            if (found) { foundNode = found; break; }
          }
        }
        setNode(foundNode);

        // Fetch node progress status
        roadmapService.getRoadmapProgress(roadmapId)
          .then((progress) => {
            const matchItem = progress.items.find(item => item.itemId === (nodeId || foundNode?.id));
            if (matchItem) {
              setStatus(matchItem.status);
            }
          })
          .catch(() => {});

        // Fetch Coursera recommendations
        roadmapService.getCourseRecommendations(roadmapId, 8)
          .then((courses) => {
            if (courses?.length) {
              const skillLower = skillName.toLowerCase();
              const matched = courses.filter((c: any) =>
                c.title?.toLowerCase().includes(skillLower) ||
                c.description?.toLowerCase().includes(skillLower)
              );
              if (matched.length > 0) {
                setCourseRecommendations(matched);
              } else {
                setCourseRecommendations(courses.slice(0, 3));
              }
            }
          })
          .catch(() => {});

        // Try fetching integrated learning list to check availability
        const resp = await roadmapService.getRoadmapLearningList(roadmapId);
        if (resp?.items) {
          const match = resp.items.find((item) =>
            item.itemId === nodeId ||
            item.skillName === skillName ||
            item.canonicalSkillName === skillName
          );
          if (match) {
            setLearningListItem(match);
            if (match.learningStatus === 'available') {
              const item = await roadmapService.getRoadmapLearningItem(roadmapId, match.itemId);
              if (item?.learning) {
                setLearningContent(item.learning);
              }
            } else {
              // Automatically compile if not available
              setIsLoading(false);
              handleCompileWithAI();
              return;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SkillLearningDetail] Load failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [roadmapId, nodeId, skillName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleCompleted = async () => {
    if (!roadmapId || !nodeId || isUpdatingStatus) return;
    const newStatus = status === 'completed' ? 'in_progress' : 'completed';
    setIsUpdatingStatus(true);
    try {
      await roadmapService.updateRoadmapProgressItem(roadmapId, {
        itemId: nodeId,
        status: newStatus,
      });
      setStatus(newStatus);
    } catch (err) {
      console.warn('Failed to update status:', err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSearchVideos = async () => {
    setIsSearchingVideos(true);
    try {
      const safeRole = roadmap?.roleMatch?.roleName || 'Developer';
      const difficulty = node?.difficulty || 'Beginner';
      const results = await roadmapService.searchLearningResources(skillName, {
        targetRole: safeRole,
        level: difficulty,
        language: 'vi',
      });
      setAiResources(Array.isArray(results) ? results : []);
    } catch (error: any) {
      console.error('Error searching learning resources:', error);
    } finally {
      setIsSearchingVideos(false);
    }
  };

  useEffect(() => {
    if (learningContent && aiResources.length === 0) {
      handleSearchVideos();
    }
  }, [learningContent]);

  const openUrl = (url?: string) => {
    if (url && url !== '#') {
      Linking.openURL(url).catch(() => console.error('Lỗi khi mở link:', url));
    }
  };

  if (isLoading || isGenerating) {
    return (
      <View style={styles.loadingContainer}>
        <Sparkles size={48} color={theme.colors.primary} style={{ marginBottom: 20 }} />
        <Text style={styles.generatingTitle}>
          Đang tạo nội dung học cho kỹ năng này...
        </Text>
        <Text style={styles.generatingSub}>
          Vui lòng đợi trong giây lát.
        </Text>
        <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 24 }} />
      </View>
    );
  }

  const roleName = roadmap?.roleMatch?.roleName || roadmap?.title || 'vai trò này';
  const difficulty = node?.difficulty || roadmap?.difficulty || 'Beginner';
  const statusLabel = status === 'completed' ? 'Đã hoàn thành' : status === 'in_progress' ? 'Đang học' : 'Chưa học';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarPaddingBottom }]}
      >
        {learningContent ? (
          <>
            {/* ─── Header Section ─────────────────────────────────────── */}
            <View style={styles.header}>
              <View style={styles.headerTopRow}>
                <View style={styles.badgesRow}>
                  <Badge label={difficulty.toLowerCase()} variant="secondary" />
                  <Badge label={roleName} variant="primary" />
                  <Badge label={statusLabel} variant={status === 'completed' ? 'success' : status === 'in_progress' ? 'warning' : 'muted'} />
                </View>

                {/* Mark as completed button */}
                <TouchableOpacity
                  style={[styles.completeBtn, status === 'completed' && styles.completeBtnActive]}
                  onPress={handleToggleCompleted}
                  disabled={isUpdatingStatus}
                >
                  <CheckCircle2 size={16} color={status === 'completed' ? '#fff' : theme.colors.primary} />
                  <Text style={[styles.completeBtnText, status === 'completed' && styles.completeBtnTextActive]}>
                    {status === 'completed' ? 'Hoàn thành' : 'Đánh dấu hoàn thành'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.title}>{learningContent.title || skillName}</Text>
              <Text style={styles.subtitle}>{node?.description || 'Giáo trình tự động tổng hợp từ AI Mentor'}</Text>
            </View>

            {/* ─── Collapsible Accordion ──────────────────────────────── */}

            {/* 1. Video/tài nguyên */}
            <CollapsibleSection title="Video/tài nguyên" count={node?.resources?.length || aiResources.length} isOpenInitial={false}>
              {node?.resources && node.resources.length > 0 ? (
                node.resources.map((res, idx) => (
                  <TouchableOpacity key={idx} style={styles.resourceItem} onPress={() => openUrl(res.url)}>
                    <Play size={16} color={theme.colors.primary} />
                    <Text style={styles.resourceTitle} numberOfLines={1}>{res.title}</Text>
                    <ExternalLink size={12} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                ))
              ) : aiResources && aiResources.length > 0 ? (
                aiResources.map((res, idx) => (
                  <TouchableOpacity key={idx} style={styles.resourceItem} onPress={() => openUrl(res.url)}>
                    <Play size={16} color={theme.colors.primary} />
                    <Text style={styles.resourceTitle} numberOfLines={1}>{res.title}</Text>
                    <ExternalLink size={12} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.emptyText}>Chưa tìm thấy video hỗ trợ.</Text>
              )}
            </CollapsibleSection>

            {/* 2. Tổng quan */}
            <CollapsibleSection title="Tổng quan" isOpenInitial={true}>
              <Text style={styles.contentText}>{learningContent.overview}</Text>
            </CollapsibleSection>

            {/* 3. Vì sao cần học? */}
            <CollapsibleSection title="Vì sao cần học?">
              <Text style={styles.contentText}>{learningContent.whyLearn}</Text>
            </CollapsibleSection>

            {/* 4. Use cases */}
            <CollapsibleSection title="Use cases" count={learningContent.useCases?.length || 0}>
              {learningContent.useCases && learningContent.useCases.length > 0 ? (
                learningContent.useCases.map((useCase, idx) => (
                  <View key={idx} style={styles.listItem}>
                    <CheckCircle2 size={15} color={theme.colors.primary} style={{ marginRight: 8, marginTop: 2 }} />
                    <Text style={styles.listText}>{useCase}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>Không có thông tin.</Text>
              )}
            </CollapsibleSection>

            {/* 5. Cách áp dụng */}
            <CollapsibleSection title="Cách áp dụng">
              <Text style={styles.contentText}>{learningContent.howToApply}</Text>
            </CollapsibleSection>

            {/* 6. Ví dụ */}
            <CollapsibleSection title="Ví dụ" count={learningContent.examples?.length || 0}>
              {learningContent.examples && learningContent.examples.length > 0 ? (
                learningContent.examples.map((example, idx) => (
                  <View key={idx} style={styles.exampleBlock}>
                    <Text style={styles.exampleTitle}>{example.title}</Text>
                    {example.code && (
                      <View style={styles.codeBlock}>
                        <Text style={styles.codeText}>{example.code}</Text>
                      </View>
                    )}
                    <Text style={styles.exampleExplanation}>{example.explanation}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>Chưa có ví dụ.</Text>
              )}
            </CollapsibleSection>

            {/* 7. Bài tập */}
            <CollapsibleSection title="Bài tập" count={learningContent.exercises?.length || 0}>
              {learningContent.exercises && learningContent.exercises.length > 0 ? (
                learningContent.exercises.map((ex, idx) => (
                  <View key={idx} style={styles.exampleBlock}>
                    <Text style={styles.exampleTitle}>{ex.title}</Text>
                    <Text style={styles.contentText}>{ex.description}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>Chưa có bài tập.</Text>
              )}
            </CollapsibleSection>

            {/* 8. Checklist */}
            <CollapsibleSection title="Checklist" count={learningContent.checklist?.length || 0}>
              {learningContent.checklist && learningContent.checklist.length > 0 ? (
                learningContent.checklist.map((chk, idx) => (
                  <View key={idx} style={styles.checklistItem}>
                    <Circle size={16} color={theme.colors.border} style={{ marginRight: 8 }} />
                    <Text style={styles.checklistText}>{chk}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>Không có checklist.</Text>
              )}
            </CollapsibleSection>

            {/* 9. Lỗi thường gặp */}
            <CollapsibleSection title="Lỗi thường gặp" count={learningContent.commonMistakes?.length || 0}>
              {learningContent.commonMistakes && learningContent.commonMistakes.length > 0 ? (
                learningContent.commonMistakes.map((mistake, idx) => (
                  <View key={idx} style={styles.listItem}>
                    <AlertTriangle size={15} color={theme.colors.error} style={{ marginRight: 8, marginTop: 2 }} />
                    <Text style={styles.listText}>{mistake}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>Không có dữ liệu.</Text>
              )}
            </CollapsibleSection>

            {/* 10. Kỹ năng tiếp theo */}
            <CollapsibleSection title="Kỹ năng tiếp theo" count={learningContent.nextSkills?.length || 0}>
              <View style={styles.chipRow}>
                {learningContent.nextSkills && learningContent.nextSkills.length > 0 ? (
                  learningContent.nextSkills.map((sk) => (
                    <View key={sk} style={styles.chipDefault}>
                      <Text style={styles.chipText}>{sk}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>Chưa có đề xuất.</Text>
                )}
              </View>
            </CollapsibleSection>

            {/* 11. Coursera Recommendations */}
            {courseRecommendations.length > 0 && (
              <CollapsibleSection title="Khóa học Coursera đề xuất" count={courseRecommendations.length}>
                {courseRecommendations.map((course: any, idx: number) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.courseCard}
                    onPress={() => course.url && Linking.openURL(course.url)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.courseCardHeader}>
                      <GraduationCap size={18} color={theme.colors.primary} />
                      <Text style={styles.courseTitle} numberOfLines={2}>
                        {course.title}
                      </Text>
                    </View>
                    {course.partner && (
                      <Text style={styles.coursePartner}>{course.partner}</Text>
                    )}
                    {course.description && (
                      <Text style={styles.courseDescription} numberOfLines={2}>
                        {course.description}
                      </Text>
                    )}
                    <View style={styles.courseMeta}>
                      {course.rating && (
                        <View style={styles.courseMetaItem}>
                          <Star size={12} color="#f59e0b" />
                          <Text style={styles.courseMetaText}>{course.rating}</Text>
                        </View>
                      )}
                      {course.duration && (
                        <Text style={styles.courseMetaText}>{course.duration}</Text>
                      )}
                      {course.level && (
                        <View style={[styles.courseLevel]}>
                          <Text style={styles.courseLevelText}>{course.level}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.courseViewRow}>
                      <ExternalLink size={13} color={theme.colors.primary} />
                      <Text style={styles.courseViewText}>Xem trên Coursera</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </CollapsibleSection>
            )}
          </>
        ) : (
          <Card style={styles.emptyStateCard}>
            <BookOpen size={48} color={theme.colors.primaryLight} style={{ marginBottom: 16 }} />
            <Text style={styles.title}>Chưa có giáo trình</Text>
            <Text style={styles.description}>
              Hệ thống chưa biên soạn bài học cho kỹ năng này.
            </Text>
            <Button
              title="Biên soạn bằng AI"
              icon={<Wand2 size={18} color="#fff" />}
              onPress={handleCompileWithAI}
              variant="primary"
            />
          </Card>
        )}
      </ScrollView>

      <CustomAlert
        visible={!!error}
        title={error?.title || ''}
        message={error?.message || ''}
        type="error"
        confirmText="Đóng"
        onConfirm={() => setError(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  contentContainer: { padding: theme.spacing.md, gap: 10 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background, paddingHorizontal: 32 },
  generatingTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  generatingSub: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },

  header: { marginBottom: theme.spacing.md },
  headerTopRow: { flexDirection: 'column', gap: 8, marginBottom: 8 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: theme.typography.sizes.lg + 2, fontWeight: 'bold', color: theme.colors.textPrimary, marginTop: 4 },
  subtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },

  completeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: theme.colors.primary,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start',
  },
  completeBtnActive: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  completeBtnText: { fontSize: 12, fontWeight: '600', color: theme.colors.primary },
  completeBtnTextActive: { color: '#fff' },

  // Accordion Card styles
  accordionCard: { padding: 0, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border },
  accordionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, backgroundColor: theme.colors.surface,
  },
  accordionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accordionTitle: { fontSize: 14, fontWeight: 'bold', color: theme.colors.textPrimary },
  accordionCountBadge: { backgroundColor: theme.colors.surfaceLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  accordionCountText: { fontSize: 10, color: theme.colors.textSecondary },
  accordionContent: { padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surfaceLight },

  contentText: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 22 },
  emptyText: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic' },

  resourceItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  resourceTitle: { flex: 1, fontSize: 13, color: theme.colors.textSecondary },

  listItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  listText: { flex: 1, fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20 },

  exampleBlock: { marginBottom: 16 },
  exampleTitle: { fontSize: 13, fontWeight: 'bold', color: theme.colors.textPrimary, marginBottom: 6 },
  codeBlock: { backgroundColor: '#1e1e1e', padding: 12, borderRadius: 6, marginBottom: 8 },
  codeText: { fontFamily: 'monospace', fontSize: 11, color: '#9cdcfe' },
  exampleExplanation: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },

  checklistItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  checklistText: { fontSize: 13, color: theme.colors.textSecondary },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipDefault: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  chipText: { fontSize: 11, color: theme.colors.textSecondary },

  emptyStateCard: { padding: 24, alignItems: 'center' },
  description: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 16 },

  // Coursera course card styles
  courseCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: 12,
    marginBottom: 10,
    gap: 6,
  },
  courseCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  courseTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    lineHeight: 19,
  },
  coursePartner: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: '600',
    marginLeft: 28,
  },
  courseDescription: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 17,
    marginLeft: 28,
  },
  courseMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginLeft: 28,
    alignItems: 'center',
  },
  courseMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  courseMetaText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  courseLevel: {
    backgroundColor: '#6366f110',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  courseLevelText: {
    fontSize: 10,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  courseViewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 28,
    marginTop: 2,
  },
  courseViewText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
  },
});
