import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  GitCompareArrows,
  ArrowUpRight,
  ArrowDownRight,
  MinusCircle,
  RefreshCw,
  History,
  CalendarDays,
  Target,
  BarChart3,
  UserRound,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react-native';

import { theme } from '../../theme';
import type { RepositoriesStackParamList } from '../../navigation/types';
import type {
  AnalysisSnapshot,
  SkillComparisonItem,
  SnapshotComparison,
  SnapshotScoreChange,
} from '../../types';
import {
  fetchCompareSnapshots,
  fetchProgressComparison,
  fetchSnapshots,
} from '../../services/snapshot';
import { snapshotApi } from '../../api/snapshot';

// ─── Types ───────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RepositoriesStackParamList, 'RepoProgress'>;

// ─── Helper Functions ─────────────────────────────────────────────────────────

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatScore(score?: number | null): string {
  if (score === undefined || score === null || isNaN(score)) return '—';
  return `${Math.round(score)}`;
}

function changeColor(change?: number | null): string {
  if (change === undefined || change === null) return theme.colors.textMuted;
  if (change > 0) return '#10B981'; // green
  if (change < 0) return '#EF4444'; // red
  return theme.colors.textMuted;
}

function changeIcon(change?: number | null): string {
  if (change === undefined || change === null) return '–';
  if (change > 0) return '▲';
  if (change < 0) return '▼';
  return '–';
}

function levelLabel(level?: string): string {
  switch (level?.toLowerCase()) {
    case 'beginner': return 'Cơ bản';
    case 'intermediate': return 'Trung cấp';
    case 'advanced': return 'Nâng cao';
    default: return level || 'Chưa xác định';
  }
}

const toScore = (value?: number) => Math.max(0, Math.min(100, Math.round(value ?? 0)));

const toPercent = (value?: number) => {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)));
};

const confidenceLabel = (confidence?: string | number) => {
  if (typeof confidence === 'number') return `${Math.round(confidence * 100)}%`;
  if (confidence === 'high') return 'Cao';
  if (confidence === 'medium') return 'Trung bình';
  if (confidence === 'low') return 'Thấp';
  return confidence || 'Chưa có';
};

const scopeLabel = (type?: string) => {
  if (type === 'user_contribution') return 'Đóng góp cá nhân';
  return 'Toàn bộ dự án';
};

const currentAssessment = (snapshot?: AnalysisSnapshot | null) => {
  const score = toScore(snapshot?.overallScore);
  if (score >= 80) return 'Hồ sơ năng lực đang mạnh, có thể dùng làm minh chứng học tập hoặc ứng tuyển.';
  if (score >= 65) return 'Nền tảng đang tốt. Nên bổ sung thêm kiểm thử, tài liệu hoặc triển khai để tăng độ thuyết phục.';
  if (score >= 45) return 'Dự án đã có tín hiệu kỹ năng, nhưng vẫn cần hoàn thiện các phần còn thiếu để thể hiện rõ năng lực.';
  return 'Cần thêm dữ liệu phân tích và cải thiện dự án trước khi dùng làm căn cứ đánh giá năng lực.';
};

const changeAssessment = (change: number) => {
  if (change > 0) return 'Điểm sẵn sàng đã tăng so với mốc trước.';
  if (change < 0) return 'Điểm sẵn sàng đã giảm so với mốc trước.';
  return 'Điểm sẵn sàng chưa có thay đổi đáng kể.';
};

const formatReadinessScore = (value: number | null | undefined): string => {
  if (value === undefined || value === null || isNaN(value)) return '—';
  return value.toFixed(1);
};

const formatReadinessDelta = (value: number | null | undefined): string => {
  if (value === undefined || value === null || isNaN(value)) return '—';
  const val = Math.abs(value);
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${val.toFixed(1)}`;
};

const formatActivityDelta = (value: number | null | undefined): string => {
  if (value === undefined || value === null) return '—';
  return `${value > 0 ? '+' : ''}${value}`;
};

const normalizeSnapshotPair = (left?: AnalysisSnapshot, right?: AnalysisSnapshot) => {
  if (!left || !right || left.id === right.id) return null;
  const leftTime = new Date(left.analyzedAt || left.createdAt).getTime();
  const rightTime = new Date(right.analyzedAt || right.createdAt).getTime();
  return leftTime <= rightTime
    ? { fromSnapshotId: left.id, toSnapshotId: right.id }
    : { fromSnapshotId: right.id, toSnapshotId: left.id };
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionTitle: React.FC<{ text: string; icon?: React.ReactNode }> = ({ text, icon }) => (
  <View style={styles.sectionHeader}>
    {icon ? <View style={{ marginRight: 8 }}>{icon}</View> : null}
    <Text style={styles.sectionTitle}>{text}</Text>
  </View>
);

const SkillList: React.FC<{ items: any[] }> = ({ items }) => {
  if (!items.length) return <Text style={{ color: theme.colors.textMuted, fontSize: 12, paddingVertical: 8 }}>Chưa có kỹ năng nổi bật trong mốc phân tích này.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {items.slice(0, 6).map((skill, index) => {
        const name = skill.canonicalSkillName || skill.skillName || skill.skill || 'Kỹ năng';
        const score = skill.score !== undefined ? skill.score : 0;
        const scorePercent = toPercent(score);
        return (
          <View key={name + index} style={styles.skillRowListItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.skillRowListItemTitle} numberOfLines={1}>{name}</Text>
              <Text style={styles.skillRowListItemSub} numberOfLines={1}>{skill.category || 'Kỹ năng'}</Text>
            </View>
            <View style={[styles.skillBadge, { backgroundColor: scorePercent >= 70 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(99, 102, 241, 0.12)' }]}>
              <Text style={[styles.skillBadgeText, { color: scorePercent >= 70 ? '#10B981' : '#818CF8' }]}>{scorePercent}%</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const MissingSkillList: React.FC<{ items: string[] }> = ({ items }) => {
  if (!items.length) return <Text style={{ color: theme.colors.textMuted, fontSize: 12, paddingVertical: 8 }}>Chưa phát hiện kỹ năng thiếu nổi bật.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {items.slice(0, 6).map((skill, index) => (
        <View key={skill + index} style={styles.missingSkillListItem}>
          <Text style={styles.missingSkillListItemText}>{skill}</Text>
        </View>
      ))}
    </View>
  );
};

// ─── Progress Timeline Bar chart ──────────────────────────────────────────────

const TimelineChart: React.FC<{ snapshots: AnalysisSnapshot[] }> = ({ snapshots }) => {
  if (snapshots.length === 0) return null;
  // Draw oldest first for chronological order
  const chronological = [...snapshots].reverse();
  const maxScore = Math.max(...chronological.map((s) => s.overallScore ?? 0), 1);

  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartYLabel}>Điểm sẵn sàng qua các mốc</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartInner}>
          {chronological.map((snap, idx) => {
            const pct = ((snap.overallScore ?? 0) / maxScore) * 100;
            const barColor = pct >= 70 ? '#10B981' : pct >= 45 ? '#F59E0B' : '#EF4444';
            return (
              <View key={snap.id || idx} style={styles.chartBar}>
                <Text style={styles.chartScore}>{formatScore(snap.overallScore)}</Text>
                <View style={styles.chartBarTrack}>
                  <BarColumn pct={pct} color={barColor} />
                </View>
                <Text style={styles.chartDate} numberOfLines={2}>
                  {formatDate(snap.createdAt)}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const BarColumn: React.FC<{ pct: number; color: string }> = ({ pct, color }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct / 100,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Animated.View
        style={{
          width: 28,
          borderRadius: 6,
          backgroundColor: color,
          height: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────

export const RepoProgressScreen: React.FC<Props> = ({ route }) => {
  const { repoId, repoName } = route.params;

  const [snapshots, setSnapshots] = useState<AnalysisSnapshot[]>([]);
  const [baselineComparison, setBaselineComparison] = useState<SnapshotComparison | null>(null);
  const [manualComparison, setManualComparison] = useState<SnapshotComparison | null>(null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSnapshotDetail, setSelectedSnapshotDetail] = useState<AnalysisSnapshot | null>(null);
  const [pickerType, setPickerType] = useState<'from' | 'to' | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setManualComparison(null);
    setSelectedSnapshotDetail(null);
    try {
      const [list, autoComp] = await Promise.all([
        fetchSnapshots(repoId),
        fetchProgressComparison(repoId),
      ]);

      // Sort newest snapshot first (index 0 is newest)
      const sorted = [...list].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setSnapshots(sorted);
      setBaselineComparison(autoComp);

      if (sorted.length >= 2) {
        setFromId(sorted[1].id); // baseline (older)
        setToId(sorted[0].id);   // newest (latest)
      } else if (sorted.length === 1) {
        setFromId('');
        setToId(sorted[0].id);
      }
    } catch (e) {
      setError((e as Error).message ?? 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Clean manual comparison on picker change
  useEffect(() => {
    setManualComparison(null);
    setError(null);
  }, [fromId, toId]);

  const runCustomComparison = useCallback(async () => {
    if (!fromId || !toId || fromId === toId) return;
    const first = snapshots.find((s) => s.id === fromId);
    const second = snapshots.find((s) => s.id === toId);
    if (!first || !second) return;
    const pair = normalizeSnapshotPair(first, second);
    if (!pair) return;

    setComparing(true);
    setError(null);
    try {
      const result = await fetchCompareSnapshots(pair.fromSnapshotId, pair.toSnapshotId);
      setManualComparison(result);
      if (result.comparisonStatus === 'incompatible_snapshot_versions') {
        setError('Hai mốc sử dụng phiên bản phân tích khác nhau nên không thể so sánh kỹ năng trực tiếp.');
      }
    } catch (e) {
      setError((e as Error).message ?? 'Lỗi so sánh');
    } finally {
      setComparing(false);
    }
  }, [fromId, toId, snapshots]);

  const openSnapshot = async (snapshotId: string) => {
    try {
      const detail = await snapshotApi.getSnapshot(snapshotId);
      setSnapshots((current) => current.map((snapshot) => snapshot.id === snapshotId ? detail : snapshot));
      setSelectedSnapshotDetail(detail);
    } catch (requestError) {
      setError((requestError as Error).message ?? 'Không thể tải chi tiết mốc');
    }
  };

  // ── Render calculations ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Đang tải tiến trình…</Text>
      </View>
    );
  }

  const activeComparison = manualComparison
    ? (manualComparison.comparisonStatus === 'comparable' ? manualComparison : null)
    : (baselineComparison?.comparisonStatus === 'comparable' ? baselineComparison : null);

  const firstSnapshot = activeComparison?.firstSnapshot ?? null;
  const latestSnapshot = activeComparison?.latestSnapshot ?? snapshots[0] ?? null;
  const contributionScope = latestSnapshot?.analysisScope;
  const overallChange = activeComparison?.overallChange ?? 0;
  const readinessDelta = activeComparison?.delta?.userReadinessScore ?? activeComparison?.overallChange;

  const currentLevel = latestSnapshot?.userLevel;
  const previousLevel = activeComparison?.delta?.fromLevel || firstSnapshot?.userLevel;
  const currentScore = latestSnapshot?.overallScore ?? 0;
  const currentCommits = contributionScope?.userCommits ?? 0;
  const currentActiveDays = contributionScope?.activeDays ?? 0;

  const commitDelta = activeComparison?.delta?.userCommitsDelta ?? null;
  const activeDaysDelta = activeComparison?.delta?.activeDaysDelta ?? null;

  const pairIsComparable = Boolean(fromId && toId && fromId !== toId);
  const pairHint = !fromId || !toId
    ? (snapshots.length > 1 && toId
      ? 'Snapshot mới đã được ghi nhận. Các snapshot trước đó khác phiên bản pipeline nên chưa thể dùng làm mốc gốc.'
      : 'Chọn đủ mốc gốc và mốc mới để bắt đầu.')
    : fromId === toId
      ? 'Hai mốc phải khác nhau.'
    : 'Cặp mốc hợp lệ. Bấm “So sánh thay đổi” để xem kết quả.';

  const getSnapshotPickerLabel = (id: string | null) => {
    if (!id) return 'Chọn mốc';
    const idx = snapshots.findIndex((s) => s.id === id);
    if (idx === -1) return 'Chọn mốc';
    const s = snapshots[idx];
    const displayIdx = snapshots.length - idx;
    const dateStr = s.analyzedAt || s.createdAt ? formatDate(s.analyzedAt || s.createdAt) : s.id;
    const pipelinePart = s.pipelineVersion ? ` · Pipeline ${s.pipelineVersion}` : '';
    const versionPart = idx === 0 ? ' · Phiên bản hiện tại' : ' · Phiên bản cũ';
    return `Mốc ${displayIdx} - ${dateStr}${pipelinePart}${versionPart}`;
  };

  const isOptionDisabled = (id: string) => {
    return false; // Enable all options so users can swap them easily
  };

  const topSkills = latestSnapshot?.topSkills?.length ? latestSnapshot.topSkills : latestSnapshot?.skillVector ?? [];

  return (
    <View style={styles.root}>
      {/* Header gradient */}
      <LinearGradient
        colors={['#1E1B4B', '#0F172A']}
        style={styles.headerGradient}
      >
        <Text style={styles.headerTitle}>{repoName}</Text>
        <Text style={styles.headerSubtitle}>Theo dõi tiến trình phát triển</Text>

        {activeComparison && (
          <View style={[styles.overallBadge, { borderColor: changeColor(readinessDelta) }]}>
            <Text style={[styles.overallChange, { color: changeColor(readinessDelta) }]}>
              {changeIcon(readinessDelta)} {formatReadinessDelta(readinessDelta)} điểm tổng thể
            </Text>
          </View>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <View style={[styles.card, { borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {snapshots.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>Dự án này chưa có mốc phân tích. Hãy phân tích dự án để bắt đầu theo dõi tiến độ.</Text>
          </View>
        ) : (
          <>
            {/* ── Overview Card ────────────────────────────────────────────── */}
            <View style={styles.overviewCard}>
              <View style={styles.overviewHeader}>
                <View style={styles.overviewTitleBlock}>
                  <Text style={styles.overviewTitle}>{repoName}</Text>
                  <Text style={styles.overviewSubtitle}>{currentAssessment(latestSnapshot)}</Text>
                </View>
                <View style={{ flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                  <Text style={styles.scopeBadge}>{scopeLabel(activeComparison?.analysisScopeType || contributionScope?.type)}</Text>
                  {latestSnapshot?.projectType ? <Text style={styles.badgeSmall}>{latestSnapshot.projectType}</Text> : null}
                  {latestSnapshot?.careerDirection ? <Text style={[styles.badgeSmall, { backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }]}>{latestSnapshot.careerDirection}</Text> : null}
                </View>
              </View>

              <View style={styles.overviewGrid}>
                <View style={styles.currentScoreCard}>
                  <Text style={styles.metricLabel}>ĐIỂM SẴN SÀNG HIỆN TẠI</Text>
                  <View style={styles.scoreLine}>
                    <Text style={styles.currentScore}>{formatScore(currentScore)}</Text>
                    <Text style={styles.scoreUnit}>/ 100</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    <Text style={styles.levelText}>Trình độ: {levelLabel(currentLevel)}</Text>
                    <Text style={styles.levelText}>·</Text>
                    <Text style={styles.levelText}>Tin cậy: {confidenceLabel(latestSnapshot?.confidence)}</Text>
                  </View>
                </View>

                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>THAY ĐỔI ĐIỂM</Text>
                  <Text style={[styles.metricValue, { color: changeColor(readinessDelta) }]}>
                    {formatReadinessDelta(readinessDelta)} điểm
                  </Text>
                  <Text style={styles.metricHint}>{changeAssessment(overallChange)}</Text>
                </View>

                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>TRÌNH ĐỘ</Text>
                  <Text style={styles.metricValue}>
                    {levelLabel(previousLevel)} → {levelLabel(currentLevel)}
                  </Text>
                  <Text style={styles.metricHint}>
                    {activeComparison?.delta?.levelChanged ? 'Đã có thay đổi cấp độ.' : 'Cấp độ chưa thay đổi.'}
                  </Text>
                </View>

                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>COMMIT ĐƯỢC GHI NHẬN</Text>
                  <Text style={styles.metricValue}>
                    {contributionScope?.userCommits ?? 0}/{contributionScope?.totalRepoCommits ?? 0}
                  </Text>
                  <Text style={styles.metricHint}>Thay đổi: {formatActivityDelta(commitDelta)}</Text>
                </View>

                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>NGÀY HOẠT ĐỘNG</Text>
                  <Text style={styles.metricValue}>{currentActiveDays}</Text>
                  <Text style={styles.metricHint}>Thay đổi: {formatActivityDelta(activeDaysDelta)}</Text>
                </View>
              </View>
            </View>

            {/* ── Timeline Chart ───────────────────────────────────────────── */}
            <View style={styles.card}>
              <SectionTitle text="Lịch sử điểm số" icon={<BarChart3 size={18} color={theme.colors.primaryLight} />} />
              <TimelineChart snapshots={snapshots} />
            </View>

            {/* ── Snapshot detail (if open) ─────────────────────────────── */}
            {selectedSnapshotDetail && (
              <View style={styles.snapshotDetailCard}>
                <View style={styles.snapshotDetailHeader}>
                  <View>
                    <Text style={styles.snapshotDetailTitle}>Chi tiết snapshot</Text>
                    <Text style={styles.snapshotDetailSubtitle}>{formatDate(selectedSnapshotDetail.createdAt)}</Text>
                  </View>
                  <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedSnapshotDetail(null)}>
                    <X size={18} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.snapshotDetailGrid}>
                  <View style={styles.snapshotDetailGridCard}>
                    <Text style={styles.snapshotDetailGridLabel}>Điểm sẵn sàng</Text>
                    <Text style={styles.snapshotDetailGridValue}>{toScore(selectedSnapshotDetail.overallScore)}</Text>
                  </View>
                  <View style={styles.snapshotDetailGridCard}>
                    <Text style={styles.snapshotDetailGridLabel}>Trình độ</Text>
                    <Text style={styles.snapshotDetailGridValue}>{levelLabel(selectedSnapshotDetail.userLevel)}</Text>
                  </View>
                  <View style={styles.snapshotDetailGridCard}>
                    <Text style={styles.snapshotDetailGridLabel}>Commit</Text>
                    <Text style={styles.snapshotDetailGridValue}>{selectedSnapshotDetail.analysisScope?.userCommits ?? '—'}</Text>
                  </View>
                  <View style={styles.snapshotDetailGridCard}>
                    <Text style={styles.snapshotDetailGridLabel}>Ngày hoạt động</Text>
                    <Text style={styles.snapshotDetailGridValue}>{selectedSnapshotDetail.analysisScope?.activeDays ?? '—'}</Text>
                  </View>
                  <View style={styles.snapshotDetailGridCard}>
                    <Text style={styles.snapshotDetailGridLabel}>Pipeline Version</Text>
                    <Text style={styles.snapshotDetailGridValue}>{selectedSnapshotDetail.pipelineVersion ?? '—'}</Text>
                  </View>
                  <View style={styles.snapshotDetailGridCard}>
                    <Text style={styles.snapshotDetailGridLabel}>Model Version</Text>
                    <Text style={styles.snapshotDetailGridValue}>{selectedSnapshotDetail.modelVersion ?? '—'}</Text>
                  </View>
                  <View style={styles.snapshotDetailGridCard}>
                    <Text style={styles.snapshotDetailGridLabel}>Cách tính điểm</Text>
                    <Text style={styles.snapshotDetailGridValue}>{selectedSnapshotDetail.scoringMethod ?? '—'}</Text>
                  </View>
                  <View style={styles.snapshotDetailGridCard}>
                    <Text style={styles.snapshotDetailGridLabel}>Hướng nghề nghiệp</Text>
                    <Text style={styles.snapshotDetailGridValue}>{selectedSnapshotDetail.careerDirection ?? '—'}</Text>
                  </View>
                </View>

                <View style={{ gap: 12 }}>
                  <View style={styles.snapshotDetailSkillsBlock}>
                    <Text style={styles.snapshotDetailSkillsLabel}>Kỹ năng đã khớp</Text>
                    <View style={styles.chipRow}>
                      {(selectedSnapshotDetail.matchedSkillNames ?? []).length > 0 ? (
                        (selectedSnapshotDetail.matchedSkillNames ?? []).map((name: string) => (
                          <View key={name} style={[styles.skillChip, { backgroundColor: '#1E293B' }]}>
                            <Text style={[styles.skillChipText, { color: theme.colors.textSecondary }]}>{name}</Text>
                          </View>
                        ))
                      ) : <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>Chưa có dữ liệu.</Text>}
                    </View>
                  </View>

                  <View style={styles.snapshotDetailSkillsBlock}>
                    <Text style={styles.snapshotDetailSkillsLabel}>Kỹ năng yếu</Text>
                    <View style={styles.chipRow}>
                      {(selectedSnapshotDetail.weakSkillNames ?? []).length > 0 ? (
                        (selectedSnapshotDetail.weakSkillNames ?? []).map((name: string) => (
                          <View key={name} style={[styles.skillChip, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                            <Text style={[styles.skillChipText, { color: '#EF4444' }]}>{name}</Text>
                          </View>
                        ))
                      ) : <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>Chưa có dữ liệu.</Text>}
                    </View>
                  </View>

                  <View style={styles.snapshotDetailSkillsBlock}>
                    <Text style={styles.snapshotDetailSkillsLabel}>Kỹ năng còn thiếu</Text>
                    <View style={styles.chipRow}>
                      {((selectedSnapshotDetail.missingSkillNames?.length ? selectedSnapshotDetail.missingSkillNames : selectedSnapshotDetail.missingSkills) ?? []).length > 0 ? (
                        ((selectedSnapshotDetail.missingSkillNames?.length ? selectedSnapshotDetail.missingSkillNames : selectedSnapshotDetail.missingSkills) ?? []).map((name: string) => (
                          <View key={name} style={[styles.skillChip, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                            <Text style={[styles.skillChipText, { color: '#F59E0B' }]}>{name}</Text>
                          </View>
                        ))
                      ) : <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>Chưa có dữ liệu.</Text>}
                    </View>
                  </View>

                  <View style={styles.snapshotDetailSkillsBlock}>
                    <Text style={styles.snapshotDetailSkillsLabel}>Kỹ năng nên học tiếp</Text>
                    <View style={styles.chipRow}>
                      {(selectedSnapshotDetail.recommendedNextSkills ?? []).length > 0 ? (
                        (selectedSnapshotDetail.recommendedNextSkills ?? []).map((name: string) => (
                          <View key={name} style={[styles.skillChip, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
                            <Text style={[styles.skillChipText, { color: '#818CF8' }]}>{name}</Text>
                          </View>
                        ))
                      ) : <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>Chưa có dữ liệu.</Text>}
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ── Snapshot Comparison Box ──────────────────────────────────── */}
            {snapshots.length >= 2 && (
              <View style={styles.card}>
                <SectionTitle text="So sánh hai mốc phân tích" icon={<GitCompareArrows size={18} color={theme.colors.primaryLight} />} />
                <Text style={styles.overviewSubtitle}>Chọn mốc gốc, chọn mốc mới, rồi bấm so sánh. Kết quả sẽ xuất hiện ngay bên dưới.</Text>

                <View style={styles.selectorRow}>
                  <View style={styles.selectorCol}>
                    <Text style={styles.metricLabel}>MỐC GỐC</Text>
                    <TouchableOpacity style={styles.selectorBox} onPress={() => setPickerType('from')}>
                      <Text style={styles.selectorBoxText} numberOfLines={1}>
                        {fromId ? getSnapshotPickerLabel(fromId) : 'Chọn mốc gốc'}
                      </Text>
                      <ChevronDown size={14} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.selectorRow}>
                  <View style={styles.selectorCol}>
                    <Text style={styles.metricLabel}>MỐC MỚI</Text>
                    <TouchableOpacity style={styles.selectorBox} onPress={() => setPickerType('to')}>
                      <Text style={styles.selectorBoxText} numberOfLines={1}>
                        {toId ? getSnapshotPickerLabel(toId) : 'Chọn mốc mới'}
                      </Text>
                      <ChevronDown size={14} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[styles.pairHintText, { color: pairIsComparable ? '#10B981' : '#F59E0B' }]}>
                  {pairHint}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.compareBtn,
                    (!pairIsComparable || comparing) && { opacity: 0.5, backgroundColor: theme.colors.border },
                  ]}
                  onPress={runCustomComparison}
                  disabled={!pairIsComparable || comparing}
                  activeOpacity={0.8}
                >
                  {comparing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <GitCompareArrows size={16} color="#fff" />
                      <Text style={styles.compareBtnText}>So sánh thay đổi</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* ── Comparison Results ───────────────────────────────────── */}
                {activeComparison ? (
                  <View style={styles.compareResultContainer}>
                    <View style={styles.compareResultHeader}>
                      <View>
                        <Text style={styles.compareResultTitle}>Kết quả so sánh</Text>
                        <Text style={styles.compareResultSubtitle}>Thay đổi được tính từ mốc gốc đến mốc mới.</Text>
                      </View>
                      <View style={styles.updateBadge}>
                        <Text style={styles.updateBadgeText}>
                          {manualComparison ? 'Vừa cập nhật' : 'So sánh gần nhất'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.comparisonGrid}>
                      <View style={styles.comparisonGridCard}>
                        <Text style={styles.comparisonGridLabel}>Điểm từ mốc gốc → mốc mới</Text>
                        <Text style={styles.comparisonGridValue}>
                          {formatReadinessScore(activeComparison.firstSnapshot?.overallScore)} → {formatReadinessScore(activeComparison.latestSnapshot?.overallScore)}
                        </Text>
                      </View>

                      <View style={styles.comparisonGridCard}>
                        <Text style={styles.comparisonGridLabel}>Điểm thay đổi</Text>
                        <Text style={[styles.comparisonGridValue, { color: changeColor(readinessDelta) }]}>
                          {formatReadinessDelta(readinessDelta)} điểm
                        </Text>
                      </View>

                      <View style={styles.comparisonGridCard}>
                        <Text style={styles.comparisonGridLabel}>Trình độ</Text>
                        <Text style={styles.comparisonGridValue}>
                          {levelLabel(activeComparison.delta?.fromLevel || activeComparison.firstSnapshot?.userLevel)} → {levelLabel(activeComparison.delta?.toLevel || activeComparison.latestSnapshot?.userLevel)}
                        </Text>
                      </View>

                      <View style={styles.comparisonGridCard}>
                        <Text style={styles.comparisonGridLabel}>Commit thay đổi</Text>
                        <Text style={styles.comparisonGridValue}>
                          {formatActivityDelta(activeComparison.delta?.userCommitsDelta ?? null)}
                        </Text>
                        <Text style={styles.comparisonGridDesc}>Chênh lệch giữa mốc mới và mốc gốc.</Text>
                      </View>

                      <View style={styles.comparisonGridCard}>
                        <Text style={styles.comparisonGridLabel}>Ngày hoạt động thay đổi</Text>
                        <Text style={styles.comparisonGridValue}>
                          {formatActivityDelta(activeComparison.delta?.activeDaysDelta ?? null)}
                        </Text>
                        <Text style={styles.comparisonGridDesc}>Chênh lệch giữa mốc mới và mốc gốc.</Text>
                      </View>
                    </View>

                    {/* Warning if score_only or warnings exist */}
                    {activeComparison.raw && ((activeComparison.raw as any).comparisonMode === 'score_only' || (activeComparison.raw as any).warnings?.length > 0) ? (
                      <View style={styles.warningBox}>
                        <Text style={styles.warningTitle}>Dữ liệu so sánh có giới hạn</Text>
                        <Text style={styles.warningText}>
                          {(activeComparison.raw as any).warnings?.[0] || 'Hai mốc sử dụng cách tính điểm khác nhau. Hãy đối chiếu thêm dữ liệu phân tích của từng mốc.'}
                        </Text>
                      </View>
                    ) : null}

                    {/* Assessment box */}
                    <View style={styles.assessmentBox}>
                      <Text style={styles.assessmentTitle}>{changeAssessment(overallChange)}</Text>
                      <Text style={styles.assessmentDesc}>Hãy xem thêm số commit, ngày hoạt động và dữ liệu phân tích của từng mốc để hiểu nguyên nhân.</Text>
                    </View>

                    {/* AI Summary Feedback box */}
                    {activeComparison.summary ? (
                      <View style={styles.aiSummaryBox}>
                        <Text style={styles.aiSummaryTitle}>🤖 Nhận xét từ AI</Text>
                        <Text style={styles.aiSummaryText}>{activeComparison.summary}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.incompatibleBox}>
                    <Text style={styles.incompatibleText}>
                      {manualComparison?.comparisonStatus === 'incompatible_snapshot_versions'
                        ? 'Hai mốc sử dụng phiên bản phân tích khác nhau nên chưa thể đối chiếu trực tiếp.'
                        : (baselineComparison?.comparisonStatus === 'insufficient_compatible_snapshots'
                          ? (snapshots.length >= 2
                            ? 'Có nhiều mốc phân tích nhưng chưa có đủ hai mốc tương thích để so sánh tự động. Bạn vẫn có thể xem chi tiết từng mốc hoặc thử so sánh thủ công.'
                            : snapshots.length === 1
                            ? 'Snapshot mới đã được ghi nhận ở ô “Mốc mới”. Hiện chỉ có 1 snapshot cùng phiên bản pipeline; cần phân tích lại thêm một lần sau khi repository có thay đổi để tạo mốc gốc tương thích.'
                            : baselineComparison.message || 'Cần ít nhất hai snapshot tương thích để so sánh tiến độ.')
                          : 'Chọn hai snapshot tương thích để so sánh.')}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ── Lịch sử mốc ─────────────────────────────────────────────── */}
            <View style={styles.card}>
              <SectionTitle text="Lịch sử mốc" icon={<History size={18} color={theme.colors.primaryLight} />} />
              <View style={{ gap: 12, marginTop: 4 }}>
                {snapshots.map((snapshot, index) => (
                  <View key={snapshot.id || index} style={styles.historyItemCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={styles.historyItemTitle}>Mốc {snapshots.length - index}</Text>
                        <Text style={styles.historyItemDate}>{formatDate(snapshot.createdAt)}</Text>
                      </View>
                      <View style={[styles.skillBadge, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                        <Text style={[styles.skillBadgeText, { color: '#818CF8' }]}>{formatScore(snapshot.overallScore)}đ</Text>
                      </View>
                    </View>

                    <Text style={styles.historyItemDetailText}>Trình độ: {levelLabel(snapshot.userLevel)}</Text>
                    <Text style={styles.historyItemDetailText}>
                      {snapshot.analysisScope?.userCommits ?? 0} commit · {snapshot.analysisScope?.activeDays ?? 0} ngày hoạt động
                    </Text>

                    <View style={styles.historyItemTags}>
                      {snapshot.pipelineVersion ? <Text style={styles.badgeSmall}>Pipeline {snapshot.pipelineVersion}</Text> : null}
                      {snapshot.modelVersion ? <Text style={styles.badgeSmall}>Model {snapshot.modelVersion}</Text> : null}
                      {snapshot.scoringMethod ? <Text style={styles.badgeSmall}>{snapshot.scoringMethod}</Text> : null}
                      {index === 0 ? (
                        <Text style={[styles.badgeSmall, { backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }]}>Mốc hiện tại</Text>
                      ) : (
                        <Text style={styles.badgeSmall}>Phiên bản cũ</Text>
                      )}
                      {snapshot.scoringMethod && latestSnapshot?.scoringMethod && snapshot.scoringMethod !== latestSnapshot.scoringMethod ? (
                        <Text style={[styles.badgeSmall, { backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B' }]}>Không thể so sánh kỹ năng</Text>
                      ) : null}
                    </View>

                    <TouchableOpacity style={styles.historyViewDetailBtn} onPress={() => openSnapshot(snapshot.id)}>
                      <Text style={styles.historyViewDetailBtnText}>Xem chi tiết</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Kỹ năng nổi bật ────────────────────────────────────────── */}
            <View style={styles.card}>
              <SectionTitle text="Kỹ năng nổi bật" icon={<Target size={18} color={theme.colors.primaryLight} />} />
              <Text style={[styles.overviewSubtitle, { marginBottom: 12 }]}>Các kỹ năng mạnh nhất trong mốc mới nhất.</Text>
              <SkillList items={topSkills} />
            </View>

            {/* ── Kỹ năng cần bổ sung ────────────────────────────────────── */}
            <View style={styles.card}>
              <SectionTitle text="Kỹ năng cần bổ sung" icon={<AlertCircle size={18} color={theme.colors.primaryLight} />} />
              <Text style={[styles.overviewSubtitle, { marginBottom: 12 }]}>Những kỹ năng nên ưu tiên để cải thiện hồ sơ học tập.</Text>
              <MissingSkillList items={latestSnapshot?.missingSkills ?? []} />
            </View>

            {/* ── Dữ liệu đóng góp ────────────────────────────────────────── */}
            <View style={styles.card}>
              <SectionTitle text="Dữ liệu đóng góp" icon={<UserRound size={18} color={theme.colors.primaryLight} />} />
              <Text style={[styles.overviewSubtitle, { marginBottom: 12 }]}>Thông tin hệ thống dùng để đánh giá phần đóng góp cá nhân.</Text>
              <View style={{ gap: 8 }}>
                <View style={styles.infoRowBlock}>
                  <Text style={styles.infoRowLabel}>Tài khoản GitHub</Text>
                  <Text style={styles.infoRowValue}>{contributionScope?.githubUsername || 'Chưa xác định'}</Text>
                </View>
                <View style={styles.infoRowBlock}>
                  <Text style={styles.infoRowLabel}>Khoảng thời gian ghi nhận</Text>
                  <Text style={styles.infoRowValue}>
                    {contributionScope?.firstCommitDate ? formatDate(contributionScope.firstCommitDate) : 'Chưa có'} {'->'} {contributionScope?.lastCommitDate ? formatDate(contributionScope.lastCommitDate) : 'Chưa có'}
                  </Text>
                </View>
                <View style={styles.infoRowBlock}>
                  <Text style={styles.infoRowLabel}>Phân tích gần nhất</Text>
                  <Text style={styles.infoRowValue}>
                    {latestSnapshot?.analyzedAt || latestSnapshot?.createdAt ? formatDate(latestSnapshot.analyzedAt || latestSnapshot.createdAt) : 'Chưa có'}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Picker Modal */}
      <Modal
        visible={pickerType !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerType(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPickerType(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {pickerType === 'from' ? 'Chọn mốc gốc' : 'Chọn mốc mới'}
              </Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setPickerType(null)}>
                <X size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={snapshots}
              keyExtractor={(item, index) => item.id || String(index)}
              renderItem={({ item, index }) => {
                const isSelected = pickerType === 'from' ? fromId === item.id : toId === item.id;
                const disabled = isOptionDisabled(item.id);
                const displayIndex = snapshots.length - index;

                return (
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      isSelected && styles.optionItemActive,
                      disabled && styles.optionItemDisabled,
                    ]}
                    disabled={disabled}
                    onPress={() => {
                      if (pickerType === 'from') {
                        if (item.id === toId) {
                          setToId(fromId);
                        }
                        setFromId(item.id);
                      } else {
                        if (item.id === fromId) {
                          setFromId(toId);
                        }
                        setToId(item.id);
                      }
                      setPickerType(null);
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.optionItemText, isSelected && styles.optionItemTextActive]}>
                        Mốc {displayIndex} - {formatDate(item.analyzedAt || item.createdAt)}
                      </Text>
                      {isSelected && <CheckCircle2 size={16} color="#818CF8" />}
                    </View>
                    <Text style={[styles.optionItemSub, isSelected && styles.optionItemSubActive]}>
                      {item.pipelineVersion ? `Pipeline ${item.pipelineVersion}` : 'Pipeline: —'}{index === 0 ? ' · Phiên bản hiện tại' : ' · Phiên bản cũ'} · {formatScore(item.overallScore)} điểm
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
  },

  // Header
  headerGradient: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 12,
  },
  overallBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  overallChange: {
    fontSize: 12,
    fontWeight: '600',
  },

  overviewCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 14,
  },
  overviewTitleBlock: { flex: 1 },
  overviewTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  overviewSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  scopeBadge: {
    color: '#67E8F9',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: '700',
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  currentScoreCard: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.4)',
  },
  metricCard: {
    flex: 1,
    minWidth: '47%',
    padding: 11,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  scoreLine: { flexDirection: 'row', alignItems: 'baseline', marginTop: 3 },
  currentScore: { color: '#818CF8', fontSize: 34, fontWeight: '900' },
  scoreUnit: { color: theme.colors.textSecondary, fontSize: 11, marginLeft: 5 },
  levelText: { color: theme.colors.textSecondary, fontSize: 11 },
  metricValue: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '800', marginTop: 6 },
  metricHint: { color: theme.colors.textMuted, fontSize: 10, marginTop: 4, lineHeight: 14 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },

  // Cards
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },

  // Chart
  chartContainer: { marginTop: 4 },
  chartYLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginBottom: 8,
  },
  chartInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 14,
    paddingBottom: 4,
    paddingRight: 12,
  },
  chartBar: {
    alignItems: 'center',
    width: 44,
  },
  chartScore: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    marginBottom: 4,
  },
  chartBarTrack: {
    width: 28,
    height: 70,
    justifyContent: 'flex-end',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chartDate: {
    color: theme.colors.textMuted,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 12,
  },

  // Dropdown Pickers
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  selectorCol: {
    flex: 1,
  },
  selectorBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  selectorBoxText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    marginRight: 6,
  },
  pairHintText: {
    fontSize: 11,
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 15,
  },
  compareBtn: {
    marginTop: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  compareBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  // Comparison Results UI
  compareResultContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 16,
  },
  compareResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  compareResultTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  compareResultSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  updateBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  updateBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  comparisonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  comparisonGridCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 10,
  },
  comparisonGridLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  comparisonGridValue: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
  },
  comparisonGridDesc: {
    color: theme.colors.textMuted,
    fontSize: 9,
    marginTop: 4,
    lineHeight: 12,
  },
  warningBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  warningTitle: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },
  warningText: {
    color: 'rgba(245, 158, 11, 0.85)',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  assessmentBox: {
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  assessmentTitle: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  assessmentDesc: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  aiSummaryBox: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  aiSummaryTitle: {
    color: '#C4B5FD',
    fontSize: 12,
    fontWeight: '700',
  },
  aiSummaryText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  incompatibleBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  incompatibleText: {
    color: '#F59E0B',
    fontSize: 11,
    lineHeight: 16,
  },

  // Modal sheets
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalSheet: {
    backgroundColor: '#11102A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '75%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalCloseBtn: {
    padding: 4,
  },
  optionItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionItemActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: '#6366F1',
  },
  optionItemDisabled: {
    opacity: 0.35,
  },
  optionItemText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  optionItemTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  optionItemSub: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginTop: 4,
  },
  optionItemSubActive: {
    color: '#C4B5FD',
  },
  badgeSmall: {
    fontSize: 9,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },

  // Snapshot Detail Box
  snapshotDetailCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
  },
  snapshotDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  snapshotDetailTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  snapshotDetailSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  snapshotDetailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  snapshotDetailGridCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  snapshotDetailGridLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
  },
  snapshotDetailGridValue: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  snapshotDetailSkillsBlock: {
    marginTop: 10,
  },
  snapshotDetailSkillsLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },

  // Lịch sử mốc
  historyItemCard: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  historyItemTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  historyItemDate: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  historyItemDetailText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  historyItemTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  historyViewDetailBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  historyViewDetailBtnText: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '600',
  },

  // Skill row list
  skillRowListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.02)',
  },
  skillRowListItemTitle: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  skillRowListItemSub: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  skillBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  skillBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  missingSkillListItem: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.15)',
  },
  missingSkillListItemText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '500',
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  skillChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  skillChipText: {
    fontSize: 10,
    fontWeight: '600',
  },

  infoRowBlock: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  infoRowLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
  },
  infoRowValue: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  emptyText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    fontSize: 12,
    paddingVertical: 16,
  },
});
