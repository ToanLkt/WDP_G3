import React from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Milestone, CheckCircle2, Circle, Lock, BookOpen, Compass, Award, ExternalLink, ChevronRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { theme } from '../../theme/theme';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { SectionHeader } from '../../components/common/SectionHeader';

export const RoadmapScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { roadmaps, activeRoadmapId, selectActiveRoadmap, toggleRoadmapStepStatus } = useApp();

  const selectedRoadmap = activeRoadmapId ? roadmaps[activeRoadmapId] : null;
  const roadmapList = Object.values(roadmaps);

  if (!selectedRoadmap) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState
          title="Chưa Có Lộ Trình Học Tập"
          description="Lộ trình học tập cá nhân hóa cho sinh viên sẽ được tạo tự động dựa trên kết quả phân tích mã nguồn của bạn. Hãy chọn một repository để bắt đầu!"
          icon={Compass}
          actionText="Xem Danh Sách Repositories"
          onAction={() => navigation.navigate('RepositoriesTab')}
        />
      </View>
    );
  }

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={24} color={theme.colors.success} />;
      case 'in_progress':
        return <Circle size={24} color={theme.colors.secondaryLight} style={styles.pulseStyle} />;
      case 'locked':
      default:
        return <Lock size={20} color={theme.colors.textMuted} />;
    }
  };

  const getStepStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge label="Đã Xong" variant="success" />;
      case 'in_progress':
        return <Badge label="Đang Học" variant="secondary" />;
      case 'locked':
      default:
        return <Badge label="Chưa Mở" variant="muted" />;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      
      {/* Horizontal selector for multiple roadmaps */}
      {roadmapList.length >= 1 && (
        <View style={styles.historySelectorContainer}>
          <Text style={styles.historyTitle}>BẢN ĐỒ HỌC TẬP ĐÃ TẠO ({roadmapList.length})</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.historySelector}
            contentContainerStyle={styles.historySelectorContent}
          >
            {roadmapList.map((rm) => {
              const isSelected = rm.repoId === activeRoadmapId;
              return (
                <TouchableOpacity
                  key={rm.repoId}
                  style={[styles.historyCard, isSelected && styles.historyCardActive]}
                  onPress={() => selectActiveRoadmap(rm.repoId)}
                  activeOpacity={0.85}
                >
                  <View style={styles.cardHeaderRow}>
                    <Text 
                      style={[styles.cardTitleText, isSelected && styles.cardTitleTextActive]} 
                      numberOfLines={1}
                    >
                      {rm.repoName}
                    </Text>
                    <Text style={[styles.cardPercentText, isSelected && styles.cardPercentTextActive]}>
                      {rm.progressPercent}%
                    </Text>
                  </View>
                  <View style={styles.miniProgressBarBg}>
                    <View style={[
                      styles.miniProgressBarFill, 
                      { width: `${rm.progressPercent}%` },
                      isSelected && styles.miniProgressBarFillActive
                    ]} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 1. Header Info Card */}
      <Card style={styles.headerCard} glow="cyan">
        <View style={styles.headerTop}>
          <Milestone size={24} color={theme.colors.secondary} style={{ marginRight: theme.spacing.sm }} />
          <Text style={styles.headerTitle} numberOfLines={1}>{selectedRoadmap.repoName}</Text>
        </View>
        
        <Text style={styles.headerSub}>Lộ trình học tập & tối ưu hóa mã nguồn dành cho Sinh Viên</Text>
        
        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressLabels}>
            <Text style={styles.progressText}>Tiến độ lộ trình</Text>
            <Text style={styles.progressPercent}>{selectedRoadmap.progressPercent}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${selectedRoadmap.progressPercent}%` }]} />
          </View>
        </View>
      </Card>

      <SectionHeader title="Các Bước Phát Triển" accentColor={theme.colors.primary} />

      {/* 2. Timeline Steps */}
      <View style={styles.timelineContainer}>
        {selectedRoadmap.steps.map((step, index) => {
          const isLast = index === selectedRoadmap.steps.length - 1;
          const isCompleted = step.status === 'completed';
          const isInProgress = step.status === 'in_progress';

          return (
            <View key={step.id} style={styles.stepContainer}>
              {/* Left Column: Icon and Timeline connector */}
              <View style={styles.leftCol}>
                <TouchableOpacity 
                  onPress={() => toggleRoadmapStepStatus(selectedRoadmap.repoId, step.id)}
                  activeOpacity={0.8}
                  style={styles.iconWrapper}
                >
                  {getStepStatusIcon(step.status)}
                </TouchableOpacity>
                {!isLast && (
                  <View style={[
                    styles.connectorLine, 
                    isCompleted ? styles.completedLine : null,
                    isInProgress ? styles.inProgressLine : null
                  ]} />
                )}
              </View>

              {/* Right Column: Step Card */}
              <View style={styles.rightCol}>
                <Card style={StyleSheet.flatten([
                  styles.stepCard,
                  isInProgress ? styles.inProgressCard : null,
                  isCompleted ? styles.completedCard : null
                ])}>
                  {/* Step Header */}
                  <View style={styles.stepHeaderRow}>
                    <Text style={styles.durationText}>{step.duration}</Text>
                    {getStepStatusBadge(step.status)}
                  </View>

                  <Text style={[styles.stepTitleText, isCompleted && styles.completedText]}>
                    {step.title}
                  </Text>
                  
                  <Text style={styles.stepDescText}>{step.description}</Text>

                  {/* Student Focus tips */}
                  <View style={styles.focusBox}>
                    <Award size={14} color={theme.colors.warning} style={styles.focusIcon} />
                    <Text style={styles.focusText}>
                      <Text style={{ fontWeight: 'bold', color: theme.colors.warning }}>Góc Sinh Viên: </Text>
                      {step.studentFocus}
                    </Text>
                  </View>

                  {/* Learning Resources */}
                  <Text style={styles.resLabel}>TÀI LIỆU HỌC TẬP:</Text>
                  {step.resources.map((res, i) => (
                    <View key={i} style={styles.resRow}>
                      <ChevronRight size={12} color={theme.colors.secondary} style={{ marginRight: 4 }} />
                      <Text style={styles.resText}>{res}</Text>
                    </View>
                  ))}
                  
                  {/* Toggle Button */}
                  <TouchableOpacity 
                    style={styles.toggleStatusBtn}
                    onPress={() => toggleRoadmapStepStatus(selectedRoadmap.repoId, step.id)}
                  >
                    <Text style={styles.toggleStatusText}>
                      {step.status === 'completed' ? 'Đặt lại: Đang học' : step.status === 'in_progress' ? 'Đánh dấu: Hoàn thành' : 'Mở khóa bước này'}
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
    paddingBottom: 110, // Expanded padding cushion for the floating bottom tab bar
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: theme.spacing.md,
    lineHeight: theme.typography.lineHeights.xs + 2,
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
  pulseStyle: {
    // Styling placeholders for animations
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
  historySelectorContainer: {
    marginBottom: theme.spacing.lg,
  },
  historyTitle: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: theme.spacing.xs + 2,
    paddingLeft: theme.spacing.xs,
  },
  historySelector: {
    maxHeight: 70,
  },
  historySelectorContent: {
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  historyCard: {
    width: 170,
    height: 56,
    padding: theme.spacing.sm,
    borderRadius: theme.roundness.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  historyCardActive: {
    borderColor: theme.colors.secondary,
    backgroundColor: theme.colors.surfaceLight,
    shadowColor: theme.colors.secondary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitleText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.bold,
    flex: 1,
    marginRight: 6,
  },
  cardTitleTextActive: {
    color: theme.colors.textPrimary,
  },
  cardPercentText: {
    fontSize: theme.typography.sizes.xs - 1,
    color: theme.colors.textMuted,
    fontWeight: theme.typography.weights.bold,
  },
  cardPercentTextActive: {
    color: theme.colors.secondaryLight,
  },
  miniProgressBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  miniProgressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.textMuted,
    borderRadius: 2,
  },
  miniProgressBarFillActive: {
    backgroundColor: theme.colors.secondary,
  },
});
