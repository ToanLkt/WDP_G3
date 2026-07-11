import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

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

function changeColor(change: number): string {
  if (change > 0) return '#10B981'; // green
  if (change < 0) return '#EF4444'; // red
  return theme.colors.textMuted;
}

function changeIcon(change: number): string {
  if (change > 0) return '▲';
  if (change < 0) return '▼';
  return '–';
}

function levelColor(level?: string): string {
  switch (level?.toLowerCase()) {
    case 'strong': return '#10B981';
    case 'developing': return '#F59E0B';
    case 'weak': return '#EF4444';
    default: return theme.colors.textMuted;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionTitle: React.FC<{ text: string; icon?: string }> = ({ text, icon }) => (
  <View style={styles.sectionHeader}>
    {icon ? <Text style={styles.sectionIcon}>{icon}</Text> : null}
    <Text style={styles.sectionTitle}>{text}</Text>
  </View>
);

/** Animated bar that grows to % width when mounted */
const ScoreBar: React.FC<{ score: number; color: string }> = ({ score, color }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.min(Math.max(score, 0), 100) / 100,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [score]);

  return (
    <View style={styles.barTrack}>
      <Animated.View
        style={[
          styles.barFill,
          {
            backgroundColor: color,
            flex: anim,
          },
        ]}
      />
    </View>
  );
};

/** Snapshot selector pill button */
const SnapshotPill: React.FC<{
  snapshot: AnalysisSnapshot;
  selected: boolean;
  onPress: () => void;
}> = ({ snapshot, selected, onPress }) => (
  <TouchableOpacity
    style={[styles.pill, selected && styles.pillSelected]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>
      {formatDate(snapshot.createdAt)}
    </Text>
    <Text style={[styles.pillScore, selected && styles.pillScoreSelected]}>
      {formatScore(snapshot.overallScore)}đ
    </Text>
  </TouchableOpacity>
);

/** Score change row */
const ScoreRow: React.FC<{ item: SnapshotScoreChange }> = ({ item }) => (
  <View style={styles.scoreRow}>
    <Text style={styles.scoreLabel}>{item.label || item.key}</Text>
    <View style={styles.scoreValues}>
      <Text style={styles.scoreVal}>{formatScore(item.before)}</Text>
      <Text style={styles.scoreSep}>→</Text>
      <Text style={[styles.scoreVal, { color: changeColor(item.change) }]}>
        {formatScore(item.after)}
      </Text>
      <Text style={[styles.scoreDiff, { color: changeColor(item.change) }]}>
        {changeIcon(item.change)}{Math.abs(item.change).toFixed(1)}
      </Text>
    </View>
  </View>
);

/** Skill change chip */
const SkillChip: React.FC<{ item: SkillComparisonItem }> = ({ item }) => {
  const bg =
    item.status === 'improved'
      ? '#064E3B'
      : item.status === 'regressed'
      ? '#7F1D1D'
      : '#1E293B';
  const fg =
    item.status === 'improved'
      ? '#6EE7B7'
      : item.status === 'regressed'
      ? '#FCA5A5'
      : theme.colors.textMuted;

  return (
    <View style={[styles.skillChip, { backgroundColor: bg }]}>
      <Text style={[styles.skillChipText, { color: fg }]}>{item.skill}</Text>
      {item.changePercent !== undefined ? (
        <Text style={[styles.skillChipDiff, { color: fg }]}>
          {changeIcon(item.changePercent ?? 0)}
          {Math.abs(item.changePercent ?? 0).toFixed(0)}%
        </Text>
      ) : null}
    </View>
  );
};

// ─── Progress Timeline Bar chart ──────────────────────────────────────────────

const TimelineChart: React.FC<{ snapshots: AnalysisSnapshot[] }> = ({ snapshots }) => {
  if (snapshots.length === 0) return null;
  const maxScore = Math.max(...snapshots.map((s) => s.overallScore ?? 0), 1);

  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartYLabel}>Điểm tổng thể</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartInner}>
          {snapshots.map((snap, idx) => {
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
  const [comparison, setComparison] = useState<SnapshotComparison | null>(null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scores' | 'skills' | 'summary'>('scores');

  // Load snapshots + auto comparison on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [list, autoComp] = await Promise.all([
          fetchSnapshots(repoId),
          fetchProgressComparison(repoId),
        ]);

        if (cancelled) return;

        const sorted = [...list].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        setSnapshots(sorted);
        setComparison(autoComp);

        if (sorted.length >= 2) {
          setFromId(sorted[0].id);
          setToId(sorted[sorted.length - 1].id);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message ?? 'Lỗi tải dữ liệu');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [repoId]);

  // Custom comparison when user changes selectors
  const runCustomComparison = useCallback(async () => {
    if (!fromId || !toId || fromId === toId) return;
    setComparing(true);
    try {
      const result = await fetchCompareSnapshots(fromId, toId);
      setComparison(result);
    } catch (e) {
      setError((e as Error).message ?? 'Lỗi so sánh');
    } finally {
      setComparing(false);
    }
  }, [fromId, toId]);

  // ── Render states ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Đang tải tiến trình…</Text>
      </View>
    );
  }

  if (error && !comparison) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const hasEnoughData = (comparison?.enoughData ?? true) && snapshots.length >= 2;
  const scoreChanges = comparison?.scoreChanges ?? [];
  const improvements = comparison?.improvements ?? [];
  const regressions = comparison?.regressions ?? [];
  const topImproved = comparison?.topImprovedSkills ?? [];
  const topRegressed = comparison?.topRegressedSkills ?? [];
  const newSkills = comparison?.newSkills ?? [];
  const overallChange = comparison?.overallChange ?? 0;

  return (
    <View style={styles.root}>
      {/* Header gradient */}
      <LinearGradient
        colors={['#1E1B4B', '#0F172A']}
        style={styles.headerGradient}
      >
        <Text style={styles.headerTitle}>{repoName}</Text>
        <Text style={styles.headerSubtitle}>Theo dõi tiến trình phát triển</Text>

        {/* Overall change badge */}
        {comparison && (
          <View style={[styles.overallBadge, { borderColor: changeColor(overallChange) }]}>
            <Text style={[styles.overallChange, { color: changeColor(overallChange) }]}>
              {changeIcon(overallChange)} {Math.abs(overallChange).toFixed(1)} điểm tổng thể
            </Text>
          </View>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Timeline Chart ───────────────────────────────────────────── */}
        {snapshots.length > 0 && (
          <View style={styles.card}>
            <SectionTitle text="Lịch sử điểm số" icon="📈" />
            <TimelineChart snapshots={snapshots} />
          </View>
        )}

        {/* ── Snapshot Selectors ───────────────────────────────────────── */}
        {snapshots.length >= 2 && (
          <View style={styles.card}>
            <SectionTitle text="Chọn mốc so sánh" icon="🔀" />

            <Text style={styles.selectorLabel}>Từ mốc:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
              {snapshots.map((s, idx) => (
                <SnapshotPill
                  key={s.id || idx}
                  snapshot={s}
                  selected={fromId === s.id}
                  onPress={() => setFromId(s.id)}
                />
              ))}
            </ScrollView>

            <Text style={styles.selectorLabel}>Đến mốc:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
              {snapshots.map((s, idx) => (
                <SnapshotPill
                  key={s.id || idx}
                  snapshot={s}
                  selected={toId === s.id}
                  onPress={() => setToId(s.id)}
                />
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.compareBtn,
                (comparing || fromId === toId) && { opacity: 0.5 },
              ]}
              onPress={runCustomComparison}
              disabled={comparing || fromId === toId}
              activeOpacity={0.8}
            >
              {comparing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.compareBtnText}>So sánh 2 mốc</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Not enough data notice ───────────────────────────────────── */}
        {!hasEnoughData && snapshots.length < 2 && (
          <View style={[styles.card, styles.noticeCard]}>
            <Text style={styles.noticeIcon}>📊</Text>
            <Text style={styles.noticeTitle}>Chưa đủ dữ liệu</Text>
            <Text style={styles.noticeText}>
              Cần ít nhất 2 lần phân tích để theo dõi tiến trình. Hãy phân tích lại sau khi bạn
              commit thêm code.
            </Text>
          </View>
        )}

        {/* ── Comparison tabs ──────────────────────────────────────────── */}
        {comparison && (
          <>
            <View style={styles.tabBar}>
              {(['scores', 'skills', 'summary'] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, activeTab === tab && styles.tabActive]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                    {tab === 'scores' ? '📊 Điểm số' : tab === 'skills' ? '🧠 Kỹ năng' : '📝 Tóm tắt'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── SCORES TAB ─────────────────────────────────────────────── */}
            {activeTab === 'scores' && (
              <View style={styles.card}>
                {scoreChanges.length === 0 ? (
                  <Text style={styles.emptyText}>Không có dữ liệu điểm số.</Text>
                ) : (
                  <>
                    {scoreChanges.map((item, i) => (
                      <View key={i}>
                        <ScoreRow item={item} />
                        <View style={styles.barRow}>
                          <Text style={styles.barSubLabel}>Trước</Text>
                          <ScoreBar score={item.before} color="#64748B" />
                          <Text style={styles.barSubLabel}>Sau</Text>
                          <ScoreBar
                            score={item.after}
                            color={changeColor(item.change)}
                          />
                        </View>
                        {i < scoreChanges.length - 1 && <View style={styles.divider} />}
                      </View>
                    ))}

                    {/* Summary counts */}
                    <View style={styles.summaryRow}>
                      <View style={[styles.summaryBadge, { backgroundColor: '#064E3B' }]}>
                        <Text style={styles.summaryNum}>{improvements.length}</Text>
                        <Text style={styles.summaryLbl}>Cải thiện</Text>
                      </View>
                      <View style={[styles.summaryBadge, { backgroundColor: '#7F1D1D' }]}>
                        <Text style={styles.summaryNum}>{regressions.length}</Text>
                        <Text style={styles.summaryLbl}>Suy giảm</Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* ── SKILLS TAB ─────────────────────────────────────────────── */}
            {activeTab === 'skills' && (
              <View style={styles.card}>
                {topImproved.length > 0 && (
                  <>
                    <Text style={styles.subSectionTitle}>✅ Kỹ năng cải thiện nhiều nhất</Text>
                    <View style={styles.chipRow}>
                      {topImproved.map((item, i) => (
                        <SkillChip key={i} item={item} />
                      ))}
                    </View>
                  </>
                )}

                {topRegressed.length > 0 && (
                  <>
                    <Text style={[styles.subSectionTitle, { marginTop: 16 }]}>
                      ⚠️ Kỹ năng suy giảm
                    </Text>
                    <View style={styles.chipRow}>
                      {topRegressed.map((item, i) => (
                        <SkillChip key={i} item={item} />
                      ))}
                    </View>
                  </>
                )}

                {newSkills.length > 0 && (
                  <>
                    <Text style={[styles.subSectionTitle, { marginTop: 16 }]}>
                      🆕 Kỹ năng mới
                    </Text>
                    <View style={styles.chipRow}>
                      {newSkills.map((item, i) => (
                        <SkillChip key={i} item={item} />
                      ))}
                    </View>
                  </>
                )}

                {/* Skill comparison summary numbers */}
                {comparison.skillComparisonSummary && (
                  <View style={styles.skillSummaryGrid}>
                    {[
                      { label: 'Cải thiện', val: comparison.skillComparisonSummary.improvedCount, c: '#10B981' },
                      { label: 'Suy giảm', val: comparison.skillComparisonSummary.regressedCount, c: '#EF4444' },
                      { label: 'Không đổi', val: comparison.skillComparisonSummary.unchangedCount, c: theme.colors.textMuted },
                      { label: 'Kỹ năng mới', val: comparison.skillComparisonSummary.newSkillCount, c: '#60A5FA' },
                    ].map(({ label, val, c }) => (
                      <View key={label} style={styles.skillStat}>
                        <Text style={[styles.skillStatNum, { color: c }]}>{val}</Text>
                        <Text style={styles.skillStatLabel}>{label}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {topImproved.length === 0 && topRegressed.length === 0 && newSkills.length === 0 && (
                  <Text style={styles.emptyText}>Không có thay đổi kỹ năng đáng kể.</Text>
                )}
              </View>
            )}

            {/* ── SUMMARY TAB ────────────────────────────────────────────── */}
            {activeTab === 'summary' && (
              <View style={styles.card}>
                {/* Snapshot pair info */}
                {comparison.firstSnapshot && comparison.latestSnapshot && (
                  <View style={styles.snapshotPair}>
                    <View style={styles.snapshotInfo}>
                      <Text style={styles.snapshotLabel}>Mốc đầu</Text>
                      <Text style={styles.snapshotDate}>
                        {formatDate(comparison.firstSnapshot.createdAt)}
                      </Text>
                      <Text style={[styles.snapshotScore, { color: '#94A3B8' }]}>
                        {formatScore(comparison.firstSnapshot.overallScore)}đ
                      </Text>
                    </View>
                    <Text style={styles.snapshotArrow}>→</Text>
                    <View style={styles.snapshotInfo}>
                      <Text style={styles.snapshotLabel}>Mốc mới nhất</Text>
                      <Text style={styles.snapshotDate}>
                        {formatDate(comparison.latestSnapshot.createdAt)}
                      </Text>
                      <Text style={[styles.snapshotScore, { color: changeColor(overallChange) }]}>
                        {formatScore(comparison.latestSnapshot.overallScore)}đ
                      </Text>
                    </View>
                  </View>
                )}

                {/* Level change */}
                {comparison.delta?.levelChanged && (
                  <View style={styles.levelChangeBadge}>
                    <Text style={styles.levelChangeText}>
                      🎯 Level thay đổi: {comparison.delta.fromLevel} → {comparison.delta.toLevel}
                    </Text>
                  </View>
                )}

                {/* AI summary text */}
                {comparison.summary ? (
                  <View style={styles.summaryBox}>
                    <Text style={styles.summaryBoxTitle}>🤖 Nhận xét từ AI</Text>
                    <Text style={styles.summaryBoxText}>{comparison.summary}</Text>
                  </View>
                ) : null}

                {/* Missing skills */}
                {comparison.remainingMissingSkills?.length > 0 && (
                  <>
                    <Text style={[styles.subSectionTitle, { marginTop: 16 }]}>
                      ❌ Kỹ năng còn thiếu
                    </Text>
                    <View style={styles.chipRow}>
                      {comparison.remainingMissingSkills.map((skill: any, i) => {
                        const skillName = typeof skill === 'object' && skill !== null ? (skill.name || skill.skillName || skill.skill || JSON.stringify(skill)) : String(skill);
                        return (
                          <View key={i} style={[styles.skillChip, { backgroundColor: '#1C1917' }]}>
                            <Text style={[styles.skillChipText, { color: '#FCA5A5' }]}>{skillName}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}

                {comparison.resolvedMissingSkills?.length > 0 && (
                  <>
                    <Text style={[styles.subSectionTitle, { marginTop: 16 }]}>
                      ✅ Kỹ năng đã giải quyết
                    </Text>
                    <View style={styles.chipRow}>
                      {comparison.resolvedMissingSkills.map((skill: any, i) => {
                        const skillName = typeof skill === 'object' && skill !== null ? (skill.name || skill.skillName || skill.skill || JSON.stringify(skill)) : String(skill);
                        return (
                          <View key={i} style={[styles.skillChip, { backgroundColor: '#064E3B' }]}>
                            <Text style={[styles.skillChipText, { color: '#6EE7B7' }]}>{skillName}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
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
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
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
  },
  overallChange: {
    fontSize: 13,
    fontWeight: '600',
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 12 },

  // Cards
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  noticeCard: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noticeIcon: { fontSize: 40, marginBottom: 12 },
  noticeTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 8,
  },
  noticeText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: { fontSize: 16, marginRight: 8 },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },

  // Chart
  chartContainer: { marginTop: 4 },
  chartYLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginBottom: 8,
  },
  chartInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 12,
    paddingBottom: 4,
    paddingRight: 8,
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
    height: 90,
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

  // Selector pills
  selectorLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  pillRow: { marginBottom: 4 },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillSelected: {
    backgroundColor: 'rgba(109,40,217,0.25)',
    borderColor: theme.colors.primary,
  },
  pillLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  pillLabelSelected: { color: '#C4B5FD' },
  pillScore: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  pillScoreSelected: { color: '#E9D5FF' },

  compareBtn: {
    marginTop: 14,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  compareBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: theme.colors.primary,
  },
  tabText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // Score rows & bars
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  scoreLabel: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  scoreValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreVal: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'right',
  },
  scoreSep: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  scoreDiff: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 42,
    textAlign: 'right',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  barSubLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    width: 30,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  barFill: {
    height: 6,
    borderRadius: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  summaryBadge: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  summaryNum: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  summaryLbl: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    marginTop: 2,
  },

  // Skill chips
  subSectionTitle: {
    color: theme.colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  skillChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  skillChipDiff: {
    fontSize: 11,
  },

  // Skill summary grid
  skillSummaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
  },
  skillStat: { alignItems: 'center' },
  skillStatNum: {
    fontSize: 22,
    fontWeight: '800',
  },
  skillStatLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },

  // Summary tab
  snapshotPair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  snapshotInfo: { alignItems: 'center', flex: 1 },
  snapshotLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginBottom: 4,
  },
  snapshotDate: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  snapshotScore: {
    fontSize: 20,
    fontWeight: '800',
  },
  snapshotArrow: {
    color: theme.colors.textMuted,
    fontSize: 18,
    paddingHorizontal: 8,
  },
  levelChangeBadge: {
    backgroundColor: 'rgba(109,40,217,0.2)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.4)',
  },
  levelChangeText: {
    color: '#C4B5FD',
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },
  summaryBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
  },
  summaryBoxTitle: {
    color: theme.colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 8,
  },
  summaryBoxText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    lineHeight: 22,
  },
  emptyText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    fontSize: 13,
    paddingVertical: 20,
  },
});
