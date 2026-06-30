import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Circle,
  Code2,
  FileText,
  Lightbulb,
  MessageSquareCode,
  Play,
  Sparkles,
  Target,
  Wand2,
  AlertTriangle
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { roadmapService } from '../../features/roadmaps/api';
import type { LearningContent, LearningNode, Roadmap } from '../../features/roadmaps/types';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import type { RoadmapStackParamList } from '../../navigation/types';
import { theme } from '../../theme';

type DetailRoute = RouteProp<RoadmapStackParamList, 'SkillLearningDetail'>;
type TabKey = 'theory' | 'practice' | 'video';

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
  const [activeTab, setActiveTab] = useState<TabKey>('theory');
  const [aiResources, setAiResources] = useState<import('../../features/roadmaps/types').AILearningResource[]>([]);
  const [isSearchingVideos, setIsSearchingVideos] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await roadmapService.getRoadmapById(roadmapId);
      if (data) {
        setRoadmap(data);
        if (nodeId) {
          for (const module of data.modules) {
            const found = module.nodes.find(n => n.id === nodeId);
            if (found) {
              setNode(found);
              break;
            }
          }
        } else {
          for (const module of data.modules) {
            const found = module.nodes.find(n => n.skillName === skillName || n.canonicalSkillName === skillName);
            if (found) {
              setNode(found);
              break;
            }
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [roadmapId, nodeId, skillName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const roleName = roadmap?.roleMatch?.roleName || roadmap?.title || 'vai trò này';
  const difficulty = node?.difficulty || roadmap?.difficulty || 'Beginner';

  const handleCompileWithAI = async () => {
    setIsGenerating(true);
    try {
      const content = await roadmapService.generateLearningContent({
        skillName,
        targetRole: roleName,
        level: difficulty,
        language: 'vi',
      });
      setLearningContent(content);
      setActiveTab('theory');
    } catch (error) {
      console.error('Error generating learning content:', error);
      // fallback to chat
      navigation.navigate('ChatTab', {
        repoId: undefined,
        repoName: undefined,
        initialMessage: `Hãy biên soạn cho tôi một bài học chi tiết về kỹ năng: "${skillName}" trong bối cảnh học ${roleName}. Cung cấp khái niệm, ví dụ code, và hướng dẫn thực hành.`
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSearchVideos = async () => {
    setIsSearchingVideos(true);
    try {
      const safeRole = (roleName && roleName !== 'vai trò này') ? roleName : 'Backend Developer';
      console.log('[Video Search] skillName:', skillName, '| role:', safeRole, '| level:', difficulty);
      const results = await roadmapService.searchLearningResources(skillName, {
        targetRole: safeRole,
        level: difficulty,
        language: 'vi',
      });
      console.log('[Video Search] results count:', results?.length, results);
      setAiResources(Array.isArray(results) ? results : []);
      setActiveTab('video');
    } catch (error: any) {
      console.error('Error searching learning resources:', error);
      const msg = error?.message || 'Không thể tìm kiếm video. Vui lòng thử lại.';
      Alert.alert('Tìm kiếm thất bại', msg);
    } finally {
      setIsSearchingVideos(false);
    }
  };

  const openUrl = (url?: string) => {
    if (url && url !== '#') {
      Linking.openURL(url).catch(() => console.error('Lỗi khi mở link:', url));
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Đang tải thông tin kỹ năng...</Text>
      </View>
    );
  }

  if (isGenerating) {
    return (
      <View style={styles.loadingContainer}>
        <Wand2 size={40} color={theme.colors.primary} style={{ marginBottom: 16 }} />
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.colors.textPrimary, marginBottom: 8 }}>
          AI Mentor đang biên soạn...
        </Text>
        <Text style={{ color: theme.colors.textSecondary, textAlign: 'center', paddingHorizontal: 32 }}>
          Quá trình này có thể mất vài chục giây để thu thập kiến thức tốt nhất cho {skillName}.
        </Text>
      </View>
    );
  }

  // --- RENDERING TABS ---

  const renderTabs = () => {
    return (
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'theory' && styles.tabButtonActive]}
          onPress={() => setActiveTab('theory')}
        >
          <BookOpen size={16} color={activeTab === 'theory' ? theme.colors.primary : theme.colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'theory' && styles.tabTextActive]}>Lý thuyết</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'practice' && styles.tabButtonActive]}
          onPress={() => setActiveTab('practice')}
        >
          <CheckCircle2 size={16} color={activeTab === 'practice' ? theme.colors.primary : theme.colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'practice' && styles.tabTextActive]}>Thực hành</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'video' && styles.tabButtonActive]}
          onPress={() => setActiveTab('video')}
        >
          <Play size={16} color={activeTab === 'video' ? theme.colors.primary : theme.colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'video' && styles.tabTextActive]}>Video</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTheoryTab = () => {
    if (!learningContent) return null;
    return (
      <View style={styles.tabContent}>
        <Card style={styles.contentCard}>
          <View style={styles.cardHeader}>
            <BookOpen size={20} color={theme.colors.secondary} />
            <Text style={styles.cardTitle}>Tổng Quan Kỹ Năng</Text>
          </View>
          <Text style={styles.contentText}>{learningContent.overview}</Text>
        </Card>

        <Card style={styles.contentCard}>
          <View style={styles.cardHeader}>
            <Lightbulb size={20} color={theme.colors.warning} />
            <Text style={styles.cardTitle}>Tại sao cần học kỹ năng này?</Text>
          </View>
          <Text style={styles.contentText}>{learningContent.whyLearn}</Text>
        </Card>

        <Card style={styles.contentCard}>
          <View style={styles.cardHeader}>
            <Target size={20} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Trường Hợp Áp Dụng</Text>
          </View>
          {learningContent.useCases?.map((useCase, idx) => (
            <View key={idx} style={styles.listItem}>
              <CheckCircle2 size={16} color={theme.colors.primary} style={{ marginRight: 8, marginTop: 2 }} />
              <Text style={styles.listText}>{useCase}</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.contentCard}>
          <View style={styles.cardHeader}>
            <Wand2 size={20} color={theme.colors.secondaryLight} />
            <Text style={styles.cardTitle}>Cách Thức Áp Dụng</Text>
          </View>
          <Text style={styles.contentText}>{learningContent.howToApply}</Text>
        </Card>

        {learningContent.examples && learningContent.examples.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Ví dụ thực hành minh họa" icon={<Code2 size={20} color={theme.colors.primary} />} />
            {learningContent.examples.map((example, idx) => (
              <Card key={idx} style={styles.exampleCard}>
                <Text style={styles.exampleTitle}>{example.title}</Text>
                {example.code && (
                  <View style={styles.codeBlock}>
                    <Text style={styles.codeText}>{example.code}</Text>
                  </View>
                )}
                <Text style={styles.exampleExplanation}>{example.explanation}</Text>
              </Card>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderPracticeTab = () => {
    if (!learningContent) return null;
    return (
      <View style={styles.tabContent}>
        {learningContent.exercises && learningContent.exercises.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Bài Tập Thực Hành" icon={<Code2 size={20} color={theme.colors.primary} />} />
            {learningContent.exercises.map((exercise, idx) => (
              <Card key={idx} style={styles.exerciseCard}>
                <Text style={styles.exerciseTitle}>{exercise.title}</Text>
                <Text style={styles.contentText}>{exercise.description}</Text>
              </Card>
            ))}
          </View>
        )}

        {learningContent.commonMistakes && learningContent.commonMistakes.length > 0 && (
          <Card style={[styles.contentCard, { borderColor: theme.colors.error, borderWidth: 1 }]}>
            <View style={styles.cardHeader}>
              <AlertTriangle size={20} color={theme.colors.error} />
              <Text style={[styles.cardTitle, { color: theme.colors.error }]}>Lỗi Phổ Biến Cần Tránh</Text>
            </View>
            {learningContent.commonMistakes.map((mistake, idx) => (
              <View key={idx} style={styles.listItem}>
                <View style={styles.dotError} />
                <Text style={styles.listText}>{mistake}</Text>
              </View>
            ))}
          </Card>
        )}

        {learningContent.checklist && learningContent.checklist.length > 0 && (
          <Card style={styles.contentCard}>
            <View style={styles.cardHeader}>
              <CheckCircle2 size={20} color={theme.colors.success} />
              <Text style={styles.cardTitle}>Checklist Tự Đánh Giá</Text>
            </View>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 }}>
              Hãy đánh dấu các mục dưới đây sau khi bạn đã tự tin nắm vững.
            </Text>
            {learningContent.checklist.map((item, idx) => (
              <TouchableOpacity key={idx} style={styles.checklistItem}>
                <Circle size={20} color={theme.colors.border} style={{ marginRight: 12 }} />
                <Text style={styles.checklistText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </Card>
        )}
      </View>
    );
  };

  const renderVideoTab = () => {
    const nodeResources = node?.resources || [];
    const allResources = aiResources.length > 0 ? aiResources : [];

    if (allResources.length === 0 && nodeResources.length === 0) {
      return (
        <View style={styles.tabContent}>
          <Card style={styles.emptyStateCard}>
            <Play size={40} color={theme.colors.error} style={{ marginBottom: 16 }} />
            <Text style={styles.title}>Chưa Có Video Gợi Ý</Text>
            <Text style={styles.description}>
              Bạn có muốn hệ thống tự động tìm kiếm các video bài học phù hợp nhất từ YouTube cho kỹ năng này không?
            </Text>
            <Button
              title={isSearchingVideos ? 'Đang tìm kiếm...' : 'Tìm kiếm video bài học từ YouTube'}
              icon={<Play size={16} color="#FFF" />}
              onPress={handleSearchVideos}
              variant="primary"
              disabled={isSearchingVideos}
            />
          </Card>
        </View>
      );
    }

    const displayResources = allResources.length > 0 ? allResources : nodeResources;

    return (
      <View style={styles.tabContent}>
        <View style={styles.videoSectionHeader}>
          <Text style={styles.videoSectionTitle}>
            {allResources.length > 0 ? `${allResources.length} video từ YouTube` : `${nodeResources.length} tài nguyên`}
          </Text>
          <TouchableOpacity onPress={handleSearchVideos} disabled={isSearchingVideos} style={styles.refreshBtn}>
            {isSearchingVideos ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text style={styles.refreshBtnText}>Tải lại</Text>
            )}
          </TouchableOpacity>
        </View>

        {displayResources.map((res, idx) => {
          const thumbnailUrl = (res as any).thumbnailUrl;
          const channelTitle = (res as any).channelTitle;
          const isYouTube = res.provider === 'YouTube' || res.url?.includes('youtube.com');
          return (
            <TouchableOpacity
              key={(res as any)._id || (res as any).id || idx}
              style={styles.videoCard}
              activeOpacity={0.75}
              onPress={() => openUrl(res.url)}
            >
              {thumbnailUrl ? (
                <Image source={{ uri: thumbnailUrl }} style={styles.videoThumbnail} resizeMode="cover" />
              ) : (
                <View style={styles.videoThumbnailPlaceholder}>
                  <Play size={28} color={theme.colors.error} />
                </View>
              )}
              <View style={styles.videoInfo}>
                <Text style={styles.videoTitle} numberOfLines={2}>{res.title}</Text>
                <View style={styles.videoMeta}>
                  {isYouTube && (
                    <View style={styles.youtubeTag}>
                      <Play size={10} color="#FF0000" />
                      <Text style={styles.youtubeTagText}>YouTube</Text>
                    </View>
                  )}
                  {channelTitle && (
                    <Text style={styles.channelTitle} numberOfLines={1}>{channelTitle}</Text>
                  )}
                </View>
              </View>
              <ChevronRight size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingBottom: tabBarPaddingBottom, flexGrow: 1, justifyContent: !learningContent ? 'center' : 'flex-start' }
      ]}
    >
      {learningContent ? (
        <>
          <View style={styles.header}>
            <View style={styles.badgesRow}>
              <Badge label={difficulty} variant={difficulty === 'Advanced' ? 'error' : difficulty === 'Intermediate' ? 'warning' : 'success'} />
              <Badge label={roleName} variant="primary" />
            </View>
            <Text style={styles.title}>{learningContent.title || skillName}</Text>
          </View>
          
          {renderTabs()}
          
          {activeTab === 'theory' && renderTheoryTab()}
          {activeTab === 'practice' && renderPracticeTab()}
          {activeTab === 'video' && renderVideoTab()}
        </>
      ) : (
        <Card style={styles.emptyStateCard} glow="violet">
          <View style={styles.iconContainer}>
            <BookOpen size={48} color={theme.colors.primaryLight} strokeWidth={1.5} />
          </View>
          
          <Text style={styles.title}>Chưa Có Bài Học Cho Kỹ Năng Này</Text>
          
          <Text style={styles.description}>
            Hệ thống chưa tìm thấy giáo trình biên soạn sẵn cho kỹ năng "{skillName}" với vai trò {roleName} ở trình độ {difficulty}.
          </Text>
          
          <Button
            title="Biên soạn bài học bằng AI"
            icon={<Wand2 size={18} color="#FFF" />}
            onPress={handleCompileWithAI}
            variant="primary"
            style={styles.compileBtn}
          />
        </Card>
      )}
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
  loadingText: {
    marginTop: theme.spacing.sm,
    color: theme.colors.textMuted,
    fontSize: theme.typography.sizes.sm,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.heavy,
    color: theme.colors.textPrimary,
  },
  emptyStateCard: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.2)', // primary with opacity
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  description: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.md,
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
  compileBtn: {
    width: '100%',
    height: 48,
  },
  // Tabs styles
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.roundness.md,
    padding: 4,
    marginBottom: theme.spacing.lg,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: theme.roundness.sm,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.textMuted,
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  tabContent: {
    flex: 1,
  },
  contentCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    gap: 8,
  },
  cardTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  contentText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.md,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  listText: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm + 2,
  },
  dotError: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.error,
    marginTop: 8,
    marginRight: 10,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  exampleCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  exampleTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  codeBlock: {
    backgroundColor: '#1E1E1E',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  codeText: {
    fontFamily: 'monospace',
    color: '#D4D4D4',
    fontSize: 12,
    lineHeight: 18,
  },
  exampleExplanation: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  exerciseCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  exerciseTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 6,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  checklistText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  resourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    padding: theme.spacing.md,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  resourceIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  resourceContent: {
    flex: 1,
  },
  resourceTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  resourceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resourceProvider: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.secondaryLight,
    fontWeight: theme.typography.weights.medium,
  },
  resourceDuration: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
  },
  // Video tab styles
  videoSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  videoSectionTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textSecondary,
  },
  refreshBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    minWidth: 60,
    alignItems: 'center',
  },
  refreshBtnText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.medium,
  },
  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.roundness.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  videoThumbnail: {
    width: 110,
    height: 72,
    backgroundColor: theme.colors.surface,
  },
  videoThumbnailPlaceholder: {
    width: 110,
    height: 72,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoInfo: {
    flex: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  videoTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: 6,
    lineHeight: 18,
  },
  videoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  youtubeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,0,0,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  youtubeTagText: {
    fontSize: 10,
    color: '#FF0000',
    fontWeight: 'bold',
  },
  channelTitle: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    flex: 1,
  },
});

