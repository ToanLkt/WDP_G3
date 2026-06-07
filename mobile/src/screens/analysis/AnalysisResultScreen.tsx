import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity } from 'react-native';
import { AlertCircle, BookOpen, Layers, GitCommit, FileText, ChevronRight, MessageSquareCode, ChevronDown } from 'lucide-react-native';
import { useRoute, useNavigation } from '@react-navigation/native';

import { theme } from '../../theme';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorDisplay } from '../../components/ui/ErrorDisplay';
import { fetchAnalysisResult, AnalysisResult } from '../../services/analysis';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';

const PACKAGE_PREVIEW_COUNT = 5;

export const AnalysisResultScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { repoId, repoName } = route.params || { repoId: 'repo_1', repoName: 'Project' };
  const { tabBarPaddingBottom } = useTabBarAwareScroll();
  
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [activeTab, setActiveTab] = useState<'readme' | 'deps' | 'commits'>('readme');
  const [showAllPackages, setShowAllPackages] = useState(false);

  const fetchAnalysis = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAnalysisResult(repoId);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Could not fetch codebase diagnostics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
    setShowAllPackages(false);
  }, [repoId]);

  if (loading) {
    return <LoadingSpinner visible message={`Auditing ${repoName} files...`} />;
  }

  if (error || !data) {
    return <ErrorDisplay message={error || 'No analysis data found.'} onRetry={fetchAnalysis} />;
  }

  const handleConsultAI = () => {
    navigation.navigate('ChatTab', { repoId: data.repoId, repoName: repoName });
  };

  const getDifficultyVariant = (diff: string) => {
    if (diff === 'Advanced') return 'error';
    if (diff === 'Intermediate') return 'warning';
    return 'success';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarPaddingBottom }]}
    >
      
      {/* 1. Profile Title Card */}
      <Card style={styles.titleCard} glow="violet">
        <Text style={styles.projTitle}>{repoName}</Text>
        
        <View style={styles.techStackRow}>
          {data.tech_stack.map((tech) => (
            <Badge key={tech} label={tech} variant="primary" style={styles.techBadge} />
          ))}
        </View>
      </Card>

      {/* 2. Custom Diagnostic Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'readme' && styles.tabBtnActive]}
          onPress={() => setActiveTab('readme')}
        >
          <FileText size={16} color={activeTab === 'readme' ? theme.colors.secondary : theme.colors.textMuted} />
          <Text style={[styles.tabBtnText, activeTab === 'readme' && styles.tabBtnTextActive]}>Readme</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'deps' && styles.tabBtnActive]}
          onPress={() => setActiveTab('deps')}
        >
          <Layers size={16} color={activeTab === 'deps' ? theme.colors.secondary : theme.colors.textMuted} />
          <Text style={[styles.tabBtnText, activeTab === 'deps' && styles.tabBtnTextActive]}>Packages</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'commits' && styles.tabBtnActive]}
          onPress={() => setActiveTab('commits')}
        >
          <GitCommit size={16} color={activeTab === 'commits' ? theme.colors.secondary : theme.colors.textMuted} />
          <Text style={[styles.tabBtnText, activeTab === 'commits' && styles.tabBtnTextActive]}>Commits</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Render Switch */}
      <Card style={styles.tabContentCard}>
        {activeTab === 'readme' && (
          <View>
            <Text style={styles.tabTitleText}>README.md Diagnostic Audit</Text>
            <Text style={styles.tabBodyText}>
              {data.readme_summary || 'This repository contains no README.md file, or the readme is empty. Establishing a descriptive readme is vital for developer coordination and open source contributions.'}
            </Text>
          </View>
        )}

        {activeTab === 'deps' && (
          <View>
            <Text style={styles.tabTitleText}>Key Package Dependencies</Text>
            {data.package_info.length === 0 ? (
              <Text style={styles.tabBodyText}>No external packaging files (e.g. package.json, Cargo.toml) identified.</Text>
            ) : (
              <>
                {(showAllPackages
                  ? data.package_info
                  : data.package_info.slice(0, PACKAGE_PREVIEW_COUNT)
                ).map((pkg, i, arr) => (
                  <View
                    key={`${pkg.name}-${i}`}
                    style={[styles.pkgRow, i === arr.length - 1 && !showAllPackages && data.package_info.length <= PACKAGE_PREVIEW_COUNT && { borderBottomWidth: 0 }]}
                  >
                    <View style={styles.pkgInfo}>
                      <Text style={styles.pkgName} numberOfLines={2} ellipsizeMode="tail">
                        {pkg.name}
                      </Text>
                      <Text style={styles.pkgVersion} numberOfLines={1} ellipsizeMode="tail">
                        Version {pkg.version}
                      </Text>
                    </View>
                    <Badge
                      label={pkg.status}
                      variant={pkg.status === 'outdated' ? 'warning' : 'muted'}
                      style={styles.pkgBadge}
                    />
                  </View>
                ))}

                {data.package_info.length > PACKAGE_PREVIEW_COUNT ? (
                  <TouchableOpacity
                    style={styles.showMoreBtn}
                    onPress={() => setShowAllPackages((current) => !current)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.showMoreText}>
                      {showAllPackages
                        ? 'Show less'
                        : `Show more (${data.package_info.length - PACKAGE_PREVIEW_COUNT} more)`}
                    </Text>
                    <ChevronDown
                      size={16}
                      color={theme.colors.secondaryLight}
                      style={showAllPackages ? styles.showMoreIconOpen : undefined}
                    />
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        )}

        {activeTab === 'commits' && (
          <View>
            <Text style={styles.tabTitleText}>Commit History Health</Text>
            <Text style={styles.tabBodyText}>{data.commit_summary}</Text>
          </View>
        )}
      </Card>

      {/* 3. Missing Elements */}
      {data.missing_items.length > 0 && (
        <View style={styles.missingSection}>
          <SectionHeader title="Identified Flaws" accentColor={theme.colors.error} />
          <Card style={styles.missingCard}>
            {data.missing_items.map((item, i) => (
              <View key={i} style={styles.missingItemRow}>
                <AlertCircle size={15} color={theme.colors.error} style={styles.bulletIcon} />
                <Text style={styles.missingText}>{item}</Text>
              </View>
            ))}
          </Card>
        </View>
      )}

      {/* 4. Upgrade Recommendations */}
      <SectionHeader title="Learning Pathways" accentColor={theme.colors.warning} />
      
      {data.recommendations.map((rec) => (
        <Card key={rec.id} style={styles.recCard}>
          <View style={styles.recHeader}>
            <BookOpen size={18} color={theme.colors.warning} style={styles.recIcon} />
            <Text style={styles.recTitle}>{rec.skill}</Text>
            <Badge 
              label={rec.difficulty} 
              variant={getDifficultyVariant(rec.difficulty)} 
              style={styles.diffBadge}
            />
          </View>
          
          <Text style={styles.recReasonLabel}>WHY LEARN THIS?</Text>
          <Text style={styles.recReasonText}>{rec.reason}</Text>

          <Text style={styles.recActionLabel}>RECOMMENDED STEPS</Text>
          <View style={styles.actionBox}>
            <ChevronRight size={14} color={theme.colors.secondary} style={styles.actionArrow} />
            <Text style={styles.actionText}>{rec.action}</Text>
          </View>
        </Card>
      ))}

      {/* 5. Consultation Shortcut Button */}
      <View style={styles.aiConsultSection}>
        <Card style={styles.aiConsultCard} glow="cyan">
          <View style={styles.aiConsultRow}>
            <View style={styles.aiIconWrapper}>
              <MessageSquareCode size={24} color={theme.colors.secondaryLight} />
            </View>
            <View style={styles.aiTextCol}>
              <Text style={styles.aiConsultTitle}>Consult AI Mentor</Text>
              <Text style={styles.aiConsultDesc}>Ask questions about this analysis or get code samples instantly.</Text>
            </View>
          </View>
          <Button
            title="Chat with AI Mentor"
            onPress={handleConsultAI}
            variant="secondary"
            style={styles.consultBtn}
          />
        </Card>
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
    paddingBottom: theme.spacing.xxl,
  },
  titleCard: {
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
    alignItems: 'center',
  },
  projTitle: {
    fontSize: theme.typography.sizes.xxl - 4,
    fontWeight: theme.typography.weights.heavy,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  techStackRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  techBadge: {
    margin: 3,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: 3,
    marginBottom: theme.spacing.md,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.roundness.sm - 2,
  },
  tabBtnActive: {
    backgroundColor: theme.colors.surfaceLight,
  },
  tabBtnText: {
    fontSize: theme.typography.sizes.xs + 1,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    marginLeft: 6,
  },
  tabBtnTextActive: {
    color: theme.colors.textPrimary,
  },
  tabContentCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    backgroundColor: '#0F1117',
  },
  tabTitleText: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  tabBodyText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm + 2,
  },
  pkgRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  pkgInfo: {
    flex: 1,
    minWidth: 0,
    paddingRight: theme.spacing.xs,
  },
  pkgName: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  pkgVersion: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    marginTop: 2,
    flexShrink: 1,
  },
  pkgBadge: {
    flexShrink: 0,
    marginTop: 2,
  },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  showMoreText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.secondaryLight,
  },
  showMoreIconOpen: {
    transform: [{ rotate: '180deg' }],
  },
  missingSection: {
    marginBottom: theme.spacing.lg,
  },
  missingCard: {
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(239, 68, 68, 0.03)',
    borderColor: 'rgba(239, 68, 68, 0.15)',
  },
  missingItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  bulletIcon: {
    marginRight: theme.spacing.sm,
    marginTop: 2,
  },
  missingText: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.xs + 3,
  },
  recCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    width: '100%',
  },
  recIcon: {
    marginRight: theme.spacing.sm,
  },
  recTitle: {
    flex: 1,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  diffBadge: {
    paddingVertical: 1,
  },
  recReasonLabel: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  recReasonText: {
    fontSize: theme.typography.sizes.sm - 1,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.xs + 3,
    marginBottom: theme.spacing.md,
  },
  recActionLabel: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  actionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0F1117',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm - 2,
    padding: theme.spacing.md,
  },
  actionArrow: {
    marginRight: 6,
    marginTop: 2,
  },
  actionText: {
    flex: 1,
    fontSize: theme.typography.sizes.sm - 1,
    color: theme.colors.textPrimary,
    lineHeight: theme.typography.lineHeights.xs + 3,
  },
  aiConsultSection: {
    marginTop: theme.spacing.xl,
  },
  aiConsultCard: {
    padding: theme.spacing.lg,
  },
  aiConsultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  aiIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  aiTextCol: {
    flex: 1,
  },
  aiConsultTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  aiConsultDesc: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: theme.typography.lineHeights.xs + 2,
  },
  consultBtn: {
    height: 40,
  },
});
