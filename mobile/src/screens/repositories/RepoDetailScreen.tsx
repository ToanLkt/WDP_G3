import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  TextInput,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
  Star,
  GitFork,
  ExternalLink,
  FileJson,
  GitCommit,
  Play,
  Bot,
  RefreshCw,
  Send,
  MessageSquare,
  Flag,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Target,
  Lightbulb,
} from 'lucide-react-native';

import { theme } from '../../theme';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { githubApi } from '../../api/github';
import { aiFeedbackApi } from '../../api/aiFeedback';
import { reportApi } from '../../api/reports';
import { fetchAnalysisResult, fetchRoleMatches } from '../../services/analysis';
import { analyzeRepository } from '../../services/repo';
import { getApiErrorMessage } from '../../api/client';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import type { AIFeedback, AnalysisResult } from '../../types';

// Helper: safely extract a skill name from string | object
function extractSkillName(skill: unknown): string {
  if (typeof skill === 'string') return skill;
  if (skill && typeof skill === 'object') {
    const s = skill as Record<string, unknown>;
    const name = s.name ?? s.skillName ?? s.skill ?? s.canonicalSkillName ?? s.normalizedSkillName ?? s.title ?? s.label;
    if (name && typeof name === 'string') return name;
    if (name) return String(name);
  }
  return String(skill ?? '');
}

const COMMITS_PER_PAGE = 5;
const PACKAGE_BADGE_LIMIT = 10;
const FEEDBACK_LIST_LIMIT = 5;

const reportReasons = [
  'Nội dung không phù hợp',
  'Repository có nội dung gây hiểu nhầm',
  'Repository chứa nội dung spam',
  'Repository có dấu hiệu lạm dụng',
  'Thông tin repository không chính xác',
  'Khác',
];

export const RepoDetailScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { repoId, repoName } = route.params || {};
  const { tabBarPaddingBottom } = useTabBarAwareScroll();

  // Data states
  const [repository, setRepository] = useState<any>(null);
  const [packages, setPackages] = useState<any>(null);
  const [commits, setCommits] = useState<any[]>([]);
  const [latestAnalysis, setLatestAnalysis] = useState<any>(null);
  const [feedback, setFeedback] = useState<AIFeedback | null>(null);
  const [roleMatches, setRoleMatches] = useState<any[]>([]);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Report states
  const [reportReason, setReportReason] = useState(reportReasons[0]);
  const [reportDescription, setReportDescription] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [reportError, setReportError] = useState('');
  const [showReportDropdown, setShowReportDropdown] = useState(false);

  // Pagination
  const [commitPage, setCommitPage] = useState(1);

  // Expand/collapse toggles
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [showAllStrength, setShowAllStrength] = useState(false);
  const [showAllWeakness, setShowAllWeakness] = useState(false);

  // Fetch all initial details
  const loadAllData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // 1. Fetch Repository Details
      const repoPayload = (await githubApi.getRepository(repoId)) as any;
      const repoData = repoPayload?.repository || repoPayload?.repo || repoPayload || {};
      setRepository(repoData);

      // 2. Fetch Packages Cached
      try {
        const pkgs = (await githubApi.getCachedPackages(repoId)) as any;
        const pkgData = pkgs?.packages || pkgs?.files || pkgs || {};
        setPackages(Array.isArray(pkgData) ? pkgData[0] : pkgData);
      } catch (err) {
        console.warn('Failed to load cached packages', err);
      }

      // 3. Fetch Commits Cached
      try {
        const cmtsPayload = (await githubApi.getCachedCommits(repoId)) as any;
        const cmts = cmtsPayload?.commits || cmtsPayload || [];
        setCommits(Array.isArray(cmts) ? cmts : []);
      } catch (err) {
        console.warn('Failed to load cached commits', err);
      }

      // 4. Fetch Latest Analysis Result
      try {
        const result = await fetchAnalysisResult(repoId);
        if (result) setLatestAnalysis(result);
      } catch (err) {
        console.warn('No analysis result found', err);
      }

      // 5. Fetch AI Feedback
      try {
        const fb = (await aiFeedbackApi.getResult(repoId)) as any;
        if (fb) setFeedback(fb as AIFeedback);
      } catch (err) {
        console.warn('Failed to load AI feedback', err);
      }

      // 6. Fetch Role Matches
      try {
        const matchesData = await fetchRoleMatches({ sourceMode: 'single_repo', repoId: repoId });
        if (matchesData?.matches) setRoleMatches(matchesData.matches);
      } catch (err) {
        console.warn('Failed to load role matches', err);
      }
    } catch (err) {
      console.error('Error loading repo data', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (repoId) {
      loadAllData();
    }
  }, [repoId]);

  const handleFetchPackages = async () => {
    setPackagesLoading(true);
    try {
      await githubApi.syncPackages(repoId);
      // Reload packages
      const pkgs = (await githubApi.getCachedPackages(repoId)) as any;
      const pkgData = pkgs?.packages || pkgs?.files || pkgs || {};
      setPackages(Array.isArray(pkgData) ? pkgData[0] : pkgData);
      alert('Đồng bộ packages thành công!');
    } catch (err: any) {
      alert(getApiErrorMessage(err) || 'Không thể đồng bộ packages.');
    } finally {
      setPackagesLoading(false);
    }
  };

  const handleFetchCommits = async () => {
    setCommitsLoading(true);
    try {
      await githubApi.syncCommits(repoId, { perPage: 30, includeStats: true });
      // Reload commits
      const cmtsPayload = (await githubApi.getCachedCommits(repoId)) as any;
      const cmts = cmtsPayload?.commits || cmtsPayload || [];
      setCommits(Array.isArray(cmts) ? cmts : []);
      setCommitPage(1);
      alert('Đồng bộ commits thành công!');
    } catch (err: any) {
      alert(getApiErrorMessage(err) || 'Không thể đồng bộ commits.');
    } finally {
      setCommitsLoading(false);
    }
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      await analyzeRepository(repoId, { forceRefresh: true });
      alert('Phân tích dự án thành công!');
      // Reload data
      await loadAllData(true);
    } catch (err: any) {
      alert(getApiErrorMessage(err) || 'Phân tích thất bại.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAskAi = () => {
    if (!repository) return;
    navigation.navigate('ChatTab', { repoId, repoName: repository.name });
  };

  const handleGenerateFeedback = async () => {
    setIsGeneratingFeedback(true);
    try {
      const fb = (await aiFeedbackApi.generate(repoId)) as any;
      setFeedback(fb as AIFeedback);
      alert('Tạo AI feedback thành công!');
    } catch (err: any) {
      alert(getApiErrorMessage(err) || 'Tạo AI feedback thất bại.');
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const handleSubmitReport = async () => {
    const desc = reportDescription.trim();
    if (!desc) {
      setReportError('Vui lòng mô tả chi tiết vấn đề.');
      return;
    }
    setIsSubmittingReport(true);
    setReportError('');
    setReportMessage('');
    try {
      await reportApi.createReport({
        targetType: 'repository',
        targetId: repoId,
        reason: reportReason,
        description: desc,
      });
      setReportDescription('');
      setReportMessage('Đã gửi báo cáo. Quản trị viên sẽ xem xét nội dung này.');
    } catch (err: any) {
      setReportError(getApiErrorMessage(err));
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const openGithub = () => {
    if (repository?.url && repository.url !== '#') {
      Linking.openURL(repository.url).catch(() => undefined);
    } else if (repository?.htmlUrl) {
      Linking.openURL(repository.htmlUrl).catch(() => undefined);
    }
  };

  // Helper values
  const hasReadme = repository?.hasReadme ?? repository?.has_readme ?? false;
  const isAnalyzed = repository?.analyzed ?? repository?.is_analyzed ?? !!latestAnalysis;

  // Package parsing
  const detectedFiles = packages?.detectedFiles || [];
  const packageNames = packages?.packages || [];
  const frameworks = packages?.frameworks || [];
  const configs = packages?.configs || [];

  // Commit pagination
  const totalCommitPages = Math.max(1, Math.ceil(commits.length / COMMITS_PER_PAGE));
  const visibleCommits = useMemo(() => {
    return commits.slice((commitPage - 1) * COMMITS_PER_PAGE, commitPage * COMMITS_PER_PAGE);
  }, [commits, commitPage]);

  // Derived analysis values
  const latestSummary = latestAnalysis?.summary;
  const latestScope = latestAnalysis?.analysisScope;
  const latestScoreValue = latestSummary?.userReadinessScore ?? latestSummary?.overallScore ?? latestAnalysis?.scores?.overallScore ?? latestAnalysis?.scores?.overall;
  const latestScore = typeof latestScoreValue === 'number' && Number.isFinite(latestScoreValue) ? Math.round(latestScoreValue) : undefined;
  const latestScoreLabel = latestSummary?.userReadinessScore !== undefined ? 'MỨC SẴN SÀNG' : 'ĐIỂM TỔNG QUAN';
  const userCommits = latestScope?.userCommits ?? latestAnalysis?.commitSummary?.totalCommits ?? '—';
  const totalCommits = latestScope?.totalRepoCommits ?? latestAnalysis?.commitSummary?.totalCommits ?? '—';
  const activeDays = latestScope?.activeDays ?? latestAnalysis?.commitSummary?.activeDays ?? 'Chưa có dữ liệu';

  const hasFeedbackContent = Boolean(
    feedback && (
      (feedback.strengthFeedback && feedback.strengthFeedback.length > 0) ||
      (feedback.weaknessFeedback && feedback.weaknessFeedback.length > 0) ||
      feedback.careerSuggestion ||
      feedback.portfolioAdvice ||
      feedback.learningAdvice ||
      (feedback.nextSteps && feedback.nextSteps.length > 0) ||
      (feedback.recommendedTopics && feedback.recommendedTopics.length > 0) ||
      (feedback.riskNotes && feedback.riskNotes.length > 0)
    )
  );

  if (loading) {
    return <LoadingSpinner visible message={`Đang tải repository ${repoName || ''}...`} />;
  }

  if (!repository) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Không tìm thấy repository hoặc xảy ra lỗi.</Text>
        <Button title="Quay lại" onPress={() => navigation.goBack()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarPaddingBottom }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header Info */}
      <View style={styles.header}>
        <Text style={styles.title}>{repository.name}</Text>
        {repository.description ? (
          <Text style={styles.subtitle}>{repository.description}</Text>
        ) : null}

        <View style={styles.metaRow}>
          <Badge label={repository.language || 'Unknown'} variant="info" />
          <View style={styles.statChip}>
            <Star size={12} color={theme.colors.textMuted} />
            <Text style={styles.statChipText}>{repository.stars ?? 0}</Text>
          </View>
          <View style={styles.statChip}>
            <GitFork size={12} color={theme.colors.textMuted} />
            <Text style={styles.statChipText}>{repository.forks ?? 0}</Text>
          </View>
          <TouchableOpacity onPress={openGithub} style={styles.githubLink}>
            <Text style={styles.githubLinkText}>GitHub</Text>
            <ExternalLink size={12} color={theme.colors.primaryLight} />
          </TouchableOpacity>
        </View>

        {/* Header Action Buttons */}
        <View style={styles.headerActionsWrap}>
          <View style={styles.headerActionsRow}>
            <Button
              title="Cập nhật công nghệ"
              variant="outline"
              onPress={handleFetchPackages}
              loading={packagesLoading}
              style={[styles.headerActionBtn, { flex: 1 }]}
              textStyle={styles.headerActionBtnText}
              icon={<FileJson size={14} color={theme.colors.textPrimary} />}
            />
            <Button
              title="Cập nhật lịch sử"
              variant="outline"
              onPress={handleFetchCommits}
              loading={commitsLoading}
              style={[styles.headerActionBtn, { flex: 1 }]}
              textStyle={styles.headerActionBtnText}
              icon={<GitCommit size={14} color={theme.colors.textPrimary} />}
            />
          </View>
          <View style={styles.headerActionsRow}>
            <Button
              title="Tạo AI feedback"
              variant="outline"
              onPress={handleGenerateFeedback}
              loading={isGeneratingFeedback}
              style={[styles.headerActionBtn, { flex: 1 }]}
              textStyle={styles.headerActionBtnText}
              icon={<Bot size={14} color={theme.colors.textPrimary} />}
            />
            <Button
              title="Hỏi AI về repo này"
              variant="outline"
              onPress={handleAskAi}
              style={[styles.headerActionBtn, { flex: 1 }]}
              textStyle={styles.headerActionBtnText}
              icon={<MessageSquare size={14} color={theme.colors.textPrimary} />}
            />
          </View>
          <Button
            title="Phân tích lại"
            variant="primary"
            onPress={handleAnalyze}
            loading={isAnalyzing}
            style={styles.headerActionBtn}
            textStyle={styles.headerActionBtnTextPrimary}
            icon={<Play size={14} color="white" />}
          />
        </View>
      </View>

      {/* Tổng quan năng lực */}
      {latestAnalysis && (
        <Card style={styles.latestAnalysisCard}>
          <View style={styles.latestAnalysisHeader}>
            <View>
              <Text style={styles.cardTitle}>Tổng quan năng lực</Text>
              <Text style={styles.cardSubtitle}>Kết quả mới nhất từ dữ liệu đã đồng bộ của dự án.</Text>
            </View>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.gridCell}>
              <Text style={styles.gridLabel}>ĐỊNH HƯỚNG</Text>
              <Text style={styles.gridValue} numberOfLines={1}>
                {latestAnalysis.careerDirection?.primary || 'Chưa có dữ liệu'}
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridLabel}>{latestScoreLabel}</Text>
              <Text style={styles.gridValue}>
                {latestScore !== undefined ? `${latestScore}%` : 'Chưa có dữ liệu'}
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridLabel}>ĐÓNG GÓP CỦA BẠN / TOÀN DỰ ÁN</Text>
              <Text style={styles.gridValue}>
                {userCommits} / {totalCommits}
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridLabel}>NGÀY HOẠT ĐỘNG</Text>
              <Text style={styles.gridValue}>
                {activeDays}
              </Text>
            </View>
          </View>

          <View style={styles.skillsSection}>
            <Text style={styles.sectionSubTitle}>Kỹ năng nổi bật</Text>
            <View style={styles.badgeWrap}>
              {latestAnalysis.topSkills && latestAnalysis.topSkills.length > 0 ? (
                latestAnalysis.topSkills.slice(0, 6).map((skill: any, i: number) => (
                  <Badge key={i} label={extractSkillName(skill)} variant="success" style={styles.marginBadge} />
                ))
              ) : latestAnalysis.skillVector && latestAnalysis.skillVector.length > 0 ? (
                latestAnalysis.skillVector.slice(0, 6).map((skill: any, i: number) => (
                  <Badge key={i} label={extractSkillName(skill)} variant="success" style={styles.marginBadge} />
                ))
              ) : (
                <Text style={styles.emptyText}>Chưa có kỹ năng nổi bật.</Text>
              )}
            </View>

            <Text style={[styles.sectionSubTitle, { marginTop: 12 }]}>Kỹ năng cần bổ sung</Text>
            <View style={styles.badgeWrap}>
              {latestAnalysis.missingSkills && latestAnalysis.missingSkills.length > 0 ? (
                latestAnalysis.missingSkills.slice(0, 6).map((skill: any, i: number) => {
                  const label = extractSkillName(skill);
                  const importance = skill?.importance ?? '';
                  return (
                    <Badge
                      key={i}
                      label={label}
                      variant={importance === 'high' ? 'error' : 'warning'}
                      style={styles.marginBadge}
                    />
                  );
                })
              ) : (
                <Text style={styles.emptyText}>Chưa có kỹ năng cần bổ sung.</Text>
              )}
            </View>
          </View>


        </Card>
      )}

      {/* Role Matches */}
      {roleMatches && roleMatches.length > 0 && (
        <Card style={styles.roleMatchesCard}>
          <View style={styles.cardHeaderWithIcon}>
            <Target size={20} color={theme.colors.primaryLight} />
            <Text style={styles.cardTitle}>Mức độ phù hợp với vai trò</Text>
          </View>

          <View style={styles.topRoleBanner}>
            <CheckCircle2 size={18} color={theme.colors.primaryLight} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.topRoleBannerSub}>Vai trò gần nhất với repository này</Text>
              <Text style={styles.topRoleBannerTitle}>{roleMatches[0].roleName}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.topRoleBannerScore}>{Math.round(roleMatches[0].matchScore)}%</Text>
              <Text style={styles.topRoleBannerLabel}>{roleMatches[0].matchLevelLabel}</Text>
            </View>
          </View>

          {roleMatches[0].recommendedNextSkills && roleMatches[0].recommendedNextSkills.length > 0 && (
            <View style={styles.nextPriorityBox}>
              <View style={styles.nextPriorityHeader}>
                <Lightbulb size={14} color={theme.colors.warning} />
                <Text style={styles.nextPriorityTitle}>Ưu tiên tiếp theo</Text>
              </View>
              <Text style={styles.nextPriorityText}>
                Bổ sung {roleMatches[0].recommendedNextSkills.slice(0, 3).join(', ')} để cải thiện độ sẵn sàng cho {roleMatches[0].roleName}.
              </Text>
            </View>
          )}

          {/* Filtered role list */}
          <View style={styles.roleList}>
            {(showAllRoles ? roleMatches : roleMatches.slice(0, 1)).map((role, idx) => {
              const score = Math.round(role.matchScore);
              const isTop = idx === 0;
              const color = isTop ? theme.colors.primaryLight : theme.colors.warning;

              return (
                <View key={idx} style={styles.roleMatchItem}>
                  <View style={styles.roleMatchHeader}>
                    <Text style={styles.roleMatchName}>{role.roleName}</Text>
                    <Badge label={role.matchLevelLabel} variant={isTop ? 'primary' : 'warning'} style={{ marginLeft: 8 }} />
                    <View style={{ flex: 1 }} />
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.roleMatchScore, { color }]}>{score}%</Text>
                      <Text style={styles.roleMatchSubScore}>mức độ phù hợp</Text>
                    </View>
                  </View>

                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${score}%`, backgroundColor: color }]} />
                  </View>

                  {/* Missing/Detected/Recommended skills */}
                  <View style={styles.roleSkillsContainer}>
                    <View style={styles.roleSkillsBox}>
                      <Text style={styles.roleSkillsLabel}>CÒN THIẾU CỐT LÕI ({role.missingSkillNames?.length || 0})</Text>
                      <View style={styles.badgeWrap}>
                        {role.missingSkillNames && role.missingSkillNames.length > 0 ? (
                          role.missingSkillNames.slice(0, 5).map((skill: string, i: number) => (
                            <Badge key={i} label={skill} variant="muted" style={styles.marginBadge} />
                          ))
                        ) : (
                          <Text style={styles.emptyText}>Không có.</Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.roleSkillsBox}>
                      <Text style={styles.roleSkillsLabel}>KỸ NĂNG ĐÃ THỂ HIỆN ({role.matchedSkillNames?.length || 0})</Text>
                      <View style={styles.badgeWrap}>
                        {role.matchedSkillNames && role.matchedSkillNames.length > 0 ? (
                          role.matchedSkillNames.slice(0, 5).map((skill: string, i: number) => (
                            <Badge key={i} label={skill} variant="success" style={styles.marginBadge} />
                          ))
                        ) : (
                          <Text style={styles.emptyText}>Chưa có.</Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.roleSkillsBox}>
                      <Text style={styles.roleSkillsLabel}>NÊN BỔ SUNG TIẾP</Text>
                      <View style={styles.badgeWrap}>
                        {role.recommendedNextSkills && role.recommendedNextSkills.length > 0 ? (
                          role.recommendedNextSkills.slice(0, 5).map((skill: string, i: number) => (
                            <Badge key={i} label={skill} variant="warning" style={styles.marginBadge} />
                          ))
                        ) : (
                          <Text style={styles.emptyText}>Chưa có đề xuất.</Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {idx < (showAllRoles ? roleMatches.length : 1) - 1 && <View style={styles.roleDivider} />}
                </View>
              );
            })}
          </View>

          {roleMatches.length > 1 && (
            <TouchableOpacity
              style={styles.showMoreBtn}
              onPress={() => setShowAllRoles(!showAllRoles)}
            >
              <Text style={styles.showMoreBtnText}>
                {showAllRoles
                  ? 'Thu gọn'
                  : `Xem thêm ${roleMatches.length - 1} vai trò khác`}
              </Text>
              {showAllRoles
                ? <ChevronUp size={14} color={theme.colors.primaryLight} />
                : <ChevronDown size={14} color={theme.colors.primaryLight} />}
            </TouchableOpacity>
          )}
        </Card>
      )}


      {/* Packages và Commits trong Grid / List */}
      <View style={styles.gridContainer}>
        {/* Packages Card */}
        <Card style={styles.halfWidthCard}>
          <View style={styles.cardHeaderWithIcon}>
            <FileJson size={18} color={theme.colors.secondaryLight} />
            <Text style={styles.cardHeaderTitle}>Packages / file cấu hình</Text>
          </View>

          {!packageNames.length && !frameworks.length && !detectedFiles.length ? (
            <View style={styles.emptyCardBox}>
              <Text style={styles.emptyCardText}>Chưa có packages cached. Bấm Tải packages để đồng bộ.</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={styles.statsMiniRow}>
                <View style={styles.miniStatBox}>
                  <Text style={styles.miniStatVal}>{detectedFiles.length}</Text>
                  <Text style={styles.miniStatLbl}>file phát hiện</Text>
                </View>
                <View style={styles.miniStatBox}>
                  <Text style={styles.miniStatVal}>{packageNames.length}</Text>
                  <Text style={styles.miniStatLbl}>package</Text>
                </View>
                <View style={styles.miniStatBox}>
                  <Text style={styles.miniStatVal}>{frameworks.length}</Text>
                  <Text style={styles.miniStatLbl}>framework</Text>
                </View>
              </View>

              {frameworks.length > 0 && (
                <View>
                  <Text style={styles.listSectionTitle}>Framework</Text>
                  <View style={styles.badgeWrap}>
                    {frameworks.slice(0, PACKAGE_BADGE_LIMIT).map((item: string) => (
                      <Badge key={item} label={item} variant="info" style={styles.marginBadge} />
                    ))}
                    {frameworks.length > PACKAGE_BADGE_LIMIT && (
                      <Badge label={`+${frameworks.length - PACKAGE_BADGE_LIMIT}`} variant="info" style={styles.marginBadge} />
                    )}
                  </View>
                </View>
              )}

              <View>
                <Text style={styles.listSectionTitle}>Packages chính</Text>
                <View style={styles.badgeWrap}>
                  {packageNames.slice(0, PACKAGE_BADGE_LIMIT).map((item: string) => (
                    <Badge key={item} label={item} variant="primary" style={styles.marginBadge} />
                  ))}
                  {packageNames.length > PACKAGE_BADGE_LIMIT && (
                    <Badge label={`+${packageNames.length - PACKAGE_BADGE_LIMIT}`} variant="primary" style={styles.marginBadge} />
                  )}
                </View>
              </View>

              <View>
                <Text style={styles.listSectionTitle}>File liên quan</Text>
                {detectedFiles.slice(0, 3).map((item: any, idx: number) => (
                  <View key={idx} style={styles.fileItem}>
                    <Text style={styles.fileName}>{item.fileName || item.path || 'File'}</Text>
                    <Badge label={item.type || 'config'} variant="muted" />
                  </View>
                ))}
              </View>
            </View>
          )}
        </Card>

        {/* Commits Card */}
        <Card style={styles.halfWidthCard}>
          <View style={styles.cardHeaderWithIcon}>
            <GitCommit size={18} color={theme.colors.secondaryLight} />
            <Text style={styles.cardHeaderTitle}>Lịch sử commit</Text>
          </View>

          {commits.length === 0 ? (
            <View style={styles.emptyCardBox}>
              <Text style={styles.emptyCardText}>Chưa có commits cached. Bấm Tải commits để đồng bộ.</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={styles.commitOverview}>
                <Text style={styles.commitCount}>{commits.length} commits</Text>
                <Text style={styles.commitCachedLbl}>đã lưu trong cache</Text>
              </View>

              {visibleCommits.map((cmt: any, index: number) => {
                const message = cmt.message || 'No commit message';
                const author = cmt.authorName || cmt.author || 'Tác giả';
                const date = cmt.authorDate || cmt.date || '';
                const sha = cmt.sha || '';

                return (
                  <View key={index} style={styles.commitItem}>
                    <Text style={styles.commitMsg} numberOfLines={1}>
                      {message}
                    </Text>
                    <Text style={styles.commitMeta}>
                      {author} {date ? `· ${new Date(date).toLocaleDateString('vi-VN')}` : ''} {sha ? `· ${sha.slice(0, 7)}` : ''}
                    </Text>
                  </View>
                );
              })}

              {commits.length > COMMITS_PER_PAGE && (
                <View style={styles.paginationRow}>
                  <TouchableOpacity
                    style={[styles.pageBtn, commitPage === 1 && { opacity: 0.4 }]}
                    disabled={commitPage === 1}
                    onPress={() => setCommitPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={16} color={theme.colors.textPrimary} />
                  </TouchableOpacity>
                  <Text style={styles.pageText}>
                    {commitPage} / {totalCommitPages}
                  </Text>
                  <TouchableOpacity
                    style={[styles.pageBtn, commitPage === totalCommitPages && { opacity: 0.4 }]}
                    disabled={commitPage === totalCommitPages}
                    onPress={() => setCommitPage((p) => Math.min(totalCommitPages, p + 1))}
                  >
                    <ChevronRight size={16} color={theme.colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </Card>
      </View>

      {/* AI Feedback */}
      <Card style={styles.feedbackCard}>
        <View style={styles.cardHeaderWithIcon}>
          <Bot size={20} color={theme.colors.primaryLight} />
          <Text style={styles.cardTitle}>AI feedback cho repository này</Text>
        </View>

        {hasFeedbackContent && feedback ? (
          <View style={styles.feedbackContent}>
            <View style={styles.feedbackMetaRow}>
              <Badge label={feedback.projectType || repository.language || 'Project'} variant="info" style={styles.marginBadge} />
              {feedback.careerDirection && <Badge label={feedback.careerDirection} variant="success" style={styles.marginBadge} />}
            </View>
            {(feedback.generatedAt || feedback.createdAt) && (
              <Text style={styles.feedbackMetaDate}>
                Tạo lúc {new Date(feedback.generatedAt || feedback.createdAt || '').toLocaleDateString()}
              </Text>
            )}

            {feedback.summary && (
              <View style={styles.feedbackSummaryBox}>
                <Text style={styles.feedbackSummaryText}>{feedback.summary}</Text>
              </View>
            )}

            {/* Always visible: Điểm mạnh + Điểm yếu */}
            <View style={styles.feedbackSplitGrid}>
              <View style={[styles.feedbackSubCard, styles.strengthBox]}>
                <View style={styles.feedbackSubHeader}>
                  <CheckCircle2 size={16} color={theme.colors.success} />
                  <Text style={styles.feedbackSubTitle}>Feedback điểm mạnh</Text>
                </View>
                {feedback.strengthFeedback && feedback.strengthFeedback.length > 0 ? (
                  feedback.strengthFeedback.map((item, i) => (
                    <Text key={i} style={styles.feedbackItemText}>- {item}</Text>
                  ))
                ) : (
                  <Text style={styles.emptyText}>Chưa có feedback điểm mạnh.</Text>
                )}
              </View>

              <View style={[styles.feedbackSubCard, styles.weaknessBox]}>
                <View style={styles.feedbackSubHeader}>
                  <AlertCircle size={16} color={theme.colors.warning} />
                  <Text style={styles.feedbackSubTitle}>Feedback điểm yếu</Text>
                </View>
                {feedback.weaknessFeedback && feedback.weaknessFeedback.length > 0 ? (
                  feedback.weaknessFeedback.map((item, i) => (
                    <Text key={i} style={styles.feedbackItemText}>- {item}</Text>
                  ))
                ) : (
                  <Text style={styles.emptyText}>Chưa có feedback điểm yếu.</Text>
                )}
              </View>
            </View>

            {/* Collapsible: Các phần còn lại */}
            {showAllStrength && (
              <>
                {feedback.learningAdvice && (
                  <View style={styles.adviceBox}>
                    <View style={styles.feedbackSubHeader}>
                      <BookOpen size={16} color={theme.colors.textPrimary} />
                      <Text style={styles.feedbackSectionTitle}>Gợi ý học tập</Text>
                    </View>
                    <Text style={styles.adviceText}>{feedback.learningAdvice}</Text>
                  </View>
                )}

                <View style={styles.feedbackSplitGrid}>
                  <View style={styles.adviceBox}>
                    <View style={styles.feedbackSubHeader}>
                      <Target size={16} color={theme.colors.textPrimary} />
                      <Text style={styles.feedbackSectionTitle}>Bước tiếp theo</Text>
                    </View>
                    {feedback.nextSteps && feedback.nextSteps.length > 0 ? (
                      feedback.nextSteps.map((item, i) => (
                        <Text key={i} style={styles.feedbackItemText}>- {item}</Text>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>Chưa có gợi ý bước tiếp theo.</Text>
                    )}
                  </View>

                  <View style={styles.adviceBox}>
                    <View style={styles.feedbackSubHeader}>
                      <Lightbulb size={16} color={theme.colors.textPrimary} />
                      <Text style={styles.feedbackSectionTitle}>Chủ đề nên học</Text>
                    </View>
                    <View style={styles.badgeWrap}>
                      {feedback.recommendedTopics && feedback.recommendedTopics.length > 0 ? (
                        feedback.recommendedTopics.map((item, i) => (
                          <Badge key={i} label={item} variant="primary" style={styles.marginBadge} />
                        ))
                      ) : (
                        <Text style={styles.emptyText}>Chưa có chủ đề gợi ý.</Text>
                      )}
                    </View>
                  </View>
                </View>

                {(feedback.careerSuggestion || feedback.portfolioAdvice) && (
                  <View style={styles.feedbackSplitGrid}>
                    {feedback.careerSuggestion && (
                      <View style={[styles.adviceBox, styles.careerBox]}>
                        <Text style={styles.careerBoxTitle}>Gợi ý nghề nghiệp</Text>
                        <Text style={styles.adviceText}>{feedback.careerSuggestion}</Text>
                      </View>
                    )}
                    {feedback.portfolioAdvice && (
                      <View style={[styles.adviceBox, styles.portfolioBox]}>
                        <Text style={styles.portfolioBoxTitle}>Gợi ý portfolio</Text>
                        <Text style={styles.adviceText}>{feedback.portfolioAdvice}</Text>
                      </View>
                    )}
                  </View>
                )}

                {feedback.riskNotes && feedback.riskNotes.length > 0 && (
                  <View style={[styles.adviceBox, styles.riskBox]}>
                    <Text style={styles.riskBoxTitle}>Lưu ý rủi ro</Text>
                    {feedback.riskNotes.map((item, i) => (
                      <Text key={i} style={styles.feedbackItemText}>- {item}</Text>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* Toggle button */}
            <TouchableOpacity
              style={styles.showMoreBtn}
              onPress={() => setShowAllStrength(!showAllStrength)}
            >
              <Text style={styles.showMoreBtnText}>
                {showAllStrength ? 'Thu gọn' : 'Xem thêm chi tiết'}
              </Text>
              {showAllStrength
                ? <ChevronUp size={14} color={theme.colors.primaryLight} />
                : <ChevronDown size={14} color={theme.colors.primaryLight} />}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyFeedbackWrap}>
            <Text style={styles.emptyFeedbackText}>
              Chưa có feedback. Cần có kết quả phân tích trước khi tạo feedback.
            </Text>
            <View style={styles.cardActions}>
              <Button
                title="Tải lại"
                variant="outline"
                onPress={() => loadAllData(true)}
                style={{ flex: 1, marginRight: 8 }}
                icon={<RefreshCw size={14} color={theme.colors.textPrimary} />}
              />
              <Button
                title="Tạo feedback"
                onPress={handleGenerateFeedback}
                loading={isGeneratingFeedback}
                style={{ flex: 1 }}
                icon={<Bot size={14} color={theme.colors.textPrimary} />}
              />
            </View>
          </View>
        )}
      </Card>
      {/* Báo cáo dự án */}
      <Card style={styles.reportCard}>
        <View style={styles.reportHeader}>
          <Flag size={18} color={theme.colors.warning} />
          <Text style={styles.reportTitle}>Báo cáo dự án</Text>
        </View>
        <Text style={styles.reportDescription}>
          Nếu dự án này có nội dung không phù hợp hoặc thông tin bất thường, bạn có thể gửi báo cáo để quản trị viên xem xét.
        </Text>

        {reportMessage ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{reportMessage}</Text>
          </View>
        ) : null}

        {reportError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{reportError}</Text>
          </View>
        ) : null}

        <View style={styles.formItem}>
          <Text style={styles.formLabel}>Lý do báo cáo</Text>
          <TouchableOpacity
            style={styles.dropdownBtn}
            onPress={() => setShowReportDropdown(!showReportDropdown)}
          >
            <Text style={styles.dropdownBtnText}>{reportReason}</Text>
          </TouchableOpacity>

          {showReportDropdown && (
            <View style={styles.dropdownMenu}>
              {reportReasons.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setReportReason(reason);
                    setShowReportDropdown(false);
                  }}
                >
                  <Text style={styles.dropdownItemText}>{reason}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.formItem}>
          <Text style={styles.formLabel}>Mô tả chi tiết</Text>
          <TextInput
            style={styles.textarea}
            multiline
            numberOfLines={4}
            value={reportDescription}
            onChangeText={setReportDescription}
            placeholder="Ví dụ: Repository này có nội dung không phù hợp hoặc thông tin gây hiểu nhầm..."
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>

        <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
          <Button
            title="Gửi báo cáo"
            onPress={handleSubmitReport}
            loading={isSubmittingReport}
            icon={<Send size={14} color={theme.colors.textPrimary} />}
          />
        </View>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: 24,
  },
  header: {
    paddingVertical: theme.spacing.sm,
    gap: 8,
  },
  title: {
    fontSize: theme.typography.sizes.xl + 2,
    fontWeight: theme.typography.weights.heavy,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statChipText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  githubLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
  },
  githubLinkText: {
    fontSize: 12,
    color: theme.colors.primaryLight,
    fontWeight: '600',
  },
  headerActionsWrap: {
    paddingVertical: 12,
    gap: 8,
  },
  headerActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionBtn: {
    height: 36,
    backgroundColor: theme.colors.surfaceLight,
    borderColor: theme.colors.border,
  },
  headerActionBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  headerActionBtnPrimary: {
    height: 32,
    paddingHorizontal: 12,
  },
  headerActionBtnTextPrimary: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoCard: {
    padding: theme.spacing.md,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
    borderColor: 'rgba(99, 102, 241, 0.2)',
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  cardSubtitle: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  latestAnalysisCard: {
    padding: theme.spacing.md,
  },
  latestAnalysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 12,
  },
  gridCell: {
    width: '48%',
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: 8,
  },
  gridLabel: {
    fontSize: 9,
    color: theme.colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  gridValue: {
    fontSize: 13,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginTop: 2,
  },
  skillsSection: {
    marginTop: 8,
  },
  sectionSubTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  marginBadge: {
    marginRight: 2,
    marginBottom: 2,
  },
  reportCard: {
    padding: theme.spacing.md,
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  reportTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.warning,
  },
  reportDescription: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.warning,
    lineHeight: 18,
    marginBottom: 12,
  },
  successBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: theme.colors.success,
    borderWidth: 1,
    borderRadius: theme.roundness.sm,
    padding: 10,
    marginBottom: 12,
  },
  successText: {
    fontSize: 12,
    color: theme.colors.success,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: theme.colors.error,
    borderWidth: 1,
    borderRadius: theme.roundness.sm,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.error,
    fontWeight: '600',
  },
  formItem: {
    marginBottom: 10,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  dropdownBtn: {
    height: 40,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  dropdownBtnText: {
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    backgroundColor: theme.colors.surface,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dropdownItemText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  textarea: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: theme.colors.textPrimary,
    textAlignVertical: 'top',
  },
  gridContainer: {
    flexDirection: 'column',
    gap: theme.spacing.md,
  },
  halfWidthCard: {
    padding: theme.spacing.md,
  },
  cardHeaderWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  emptyCardBox: {
    paddingVertical: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCardText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  statsMiniRow: {
    flexDirection: 'row',
    gap: 8,
  },
  miniStatBox: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
    padding: 8,
    borderRadius: theme.roundness.sm,
    alignItems: 'center',
  },
  miniStatVal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  miniStatLbl: {
    fontSize: 9,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  listSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  fileItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: 8,
    marginBottom: 6,
  },
  fileName: {
    fontSize: 12,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
  commitOverview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surfaceLight,
    padding: 10,
    borderRadius: theme.roundness.sm,
  },
  commitCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  commitCachedLbl: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  commitItem: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: 8,
    marginBottom: 4,
  },
  commitMsg: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  commitMeta: {
    fontSize: 10,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
    marginTop: 6,
  },
  pageBtn: {
    padding: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
  },
  pageText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  feedbackCard: {
    padding: theme.spacing.md,
  },
  feedbackContent: {
    gap: 12,
  },
  feedbackMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  feedbackMetaDate: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  feedbackSummaryBox: {
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: 12,
  },
  feedbackSummaryText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  feedbackSplitGrid: {
    flexDirection: 'column',
    gap: 10,
  },
  feedbackSubCard: {
    padding: 12,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
  },
  strengthBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
    borderColor: 'rgba(16, 185, 129, 0.15)',
  },
  weaknessBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.04)',
    borderColor: 'rgba(245, 158, 11, 0.15)',
  },
  feedbackSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  feedbackSubTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  feedbackItemText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  adviceBox: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: 12,
  },
  feedbackSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  adviceText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  careerBox: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  careerBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgb(55, 48, 163)',
    marginBottom: 6,
  },
  portfolioBox: {
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderColor: 'rgba(6, 182, 212, 0.2)',
  },
  portfolioBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgb(22, 78, 99)',
    marginBottom: 6,
  },
  riskBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
    marginTop: 10,
  },
  riskBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.error,
    marginBottom: 8,
  },
  emptyFeedbackWrap: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 14,
  },
  emptyFeedbackText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },
  roleMatchesCard: {
    padding: theme.spacing.md,
  },
  topRoleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderRadius: theme.roundness.sm,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  topRoleBannerSub: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  topRoleBannerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  topRoleBannerScore: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primaryLight,
  },
  topRoleBannerLabel: {
    fontSize: 10,
    color: theme.colors.error, // Will be overridden ideally, but static for now
    fontWeight: '600',
    marginTop: 2,
  },
  nextPriorityBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: theme.roundness.sm,
    padding: 12,
    marginTop: 12,
  },
  nextPriorityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  nextPriorityTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.warning,
  },
  nextPriorityText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  roleList: {
    marginTop: 16,
  },
  roleMatchItem: {
    marginBottom: 16,
  },
  roleMatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  roleMatchName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  roleMatchScore: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  roleMatchSubScore: {
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  roleSkillsContainer: {
    gap: 12,
  },
  roleSkillsBox: {
    backgroundColor: theme.colors.surfaceLight,
    padding: 10,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  roleSkillsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  roleDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginTop: 16,
  },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  showMoreBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primaryLight,
  },
});
