import React from 'react';
import { View, StyleSheet, Text, Image, ScrollView, TouchableOpacity } from 'react-native';
import { LogOut, GitFork, User, Mail, ShieldAlert, ArrowRight, Shield } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { theme } from '../../theme/theme';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { SectionHeader } from '../../components/common/SectionHeader';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, githubConnected, githubUser, disconnectFromGitHub, logoutUser } = useApp();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      
      {/* 1. Profile Summary Card */}
      <Card style={styles.profileCard} glow="none">
        <View style={styles.avatarPlaceholder}>
          <User size={32} color={theme.colors.secondaryLight} />
        </View>
        <Text style={styles.profileName}>{user?.name || 'Developer'}</Text>
        <View style={styles.emailRow}>
          <Mail size={14} color={theme.colors.textMuted} style={{ marginRight: 6 }} />
          <Text style={styles.profileEmail}>{user?.email || 'dev@example.com'}</Text>
        </View>
        <Badge label="Active Session" variant="primary" style={styles.sessionBadge} />
      </Card>

      {/* 2. GitHub Integration Section */}
      <SectionHeader title="Integrations" accentColor={theme.colors.secondary} />
      
      {!githubConnected ? (
        <Card style={styles.integrationCard}>
          <View style={styles.integHeader}>
            <GitFork size={22} color={theme.colors.textPrimary} style={styles.integIcon} />
            <Text style={styles.integTitle}>GitHub Integration</Text>
            <Badge label="Offline" variant="muted" style={styles.integStatusBadge} />
          </View>
          <Text style={styles.integDesc}>
            Link your GitHub repositories via Personal Access Token to explore diagnostic insights and automated code audits.
          </Text>
          <Button
            title="Link Account"
            onPress={() => navigation.navigate('RepositoriesTab', { screen: 'ConnectGitHub' })}
            variant="secondary"
            style={styles.integBtn}
          />
        </Card>
      ) : (
        <Card style={styles.integrationCard} glow="cyan">
          <View style={styles.integHeader}>
            <GitFork size={22} color={theme.colors.secondaryLight} style={styles.integIcon} />
            <Text style={styles.integTitle}>GitHub Integration</Text>
            <Badge label="Connected" variant="success" style={styles.integStatusBadge} />
          </View>
          
          <View style={styles.gitProfileRow}>
            {githubUser && (
              <Image source={{ uri: githubUser.avatarUrl }} style={styles.gitAvatar} />
            )}
            <View style={styles.gitProfileCol}>
              <Text style={styles.gitUserText}>@{githubUser?.username || 'octocat-dev'}</Text>
              <Text style={styles.gitBioText} numberOfLines={1}>{githubUser?.bio || 'Active contributor.'}</Text>
            </View>
          </View>

          <Button
            title="Disconnect GitHub"
            onPress={disconnectFromGitHub}
            variant="outline"
            style={styles.integBtn}
            textStyle={{ color: theme.colors.error }}
          />
        </Card>
      )}

      {/* 3. Account Safety */}
      <SectionHeader title="Account Safety" accentColor={theme.colors.error} />
      
      <Card style={styles.safetyCard}>
        <View style={styles.safetyRow}>
          <Shield size={16} color={theme.colors.success} style={styles.safetyIcon} />
          <Text style={styles.safetyText}>Data Privacy & Local Storage Sandbox</Text>
        </View>
        <View style={styles.safetyRow}>
          <ShieldAlert size={16} color={theme.colors.textMuted} style={styles.safetyIcon} />
          <Text style={styles.safetyText}>Personal Access Tokens are only saved in memory</Text>
        </View>
      </Card>

      {/* 4. Logout Section */}
      <View style={styles.logoutWrapper}>
        <Button
          title="Sign Out of Session"
          onPress={logoutUser}
          variant="outline"
          icon={<LogOut size={16} color={theme.colors.textPrimary} style={{ marginRight: 8 }} />}
          style={styles.logoutBtn}
        />
        <Text style={styles.versionText}>GitAnalyzer Mobile Studio v1.0.0 (Mock Sandbox)</Text>
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
  profileCard: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  profileName: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  profileEmail: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
  },
  sessionBadge: {
    paddingVertical: 1,
    paddingHorizontal: theme.spacing.md,
  },
  integrationCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  integHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  integIcon: {
    marginRight: theme.spacing.sm,
  },
  integTitle: {
    flex: 1,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  integStatusBadge: {
    paddingVertical: 1,
  },
  integDesc: {
    fontSize: theme.typography.sizes.sm - 1,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.xs + 3,
    marginBottom: theme.spacing.lg,
  },
  integBtn: {
    height: 40,
  },
  gitProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1117',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm - 2,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  gitAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    marginRight: theme.spacing.md,
  },
  gitProfileCol: {
    flex: 1,
  },
  gitUserText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  gitBioText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  safetyCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    backgroundColor: '#0F1117',
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  safetyIcon: {
    marginRight: theme.spacing.sm,
  },
  safetyText: {
    flex: 1,
    fontSize: theme.typography.sizes.sm - 1,
    color: theme.colors.textSecondary,
  },
  logoutWrapper: {
    marginTop: theme.spacing.lg,
    alignItems: 'center',
  },
  logoutBtn: {
    marginBottom: theme.spacing.md,
  },
  versionText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
  },
});
