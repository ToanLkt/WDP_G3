import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, Image, Platform } from 'react-native';
import { GitFork, CheckCircle, ShieldCheck, RefreshCw } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { theme } from '../../theme';
import { useApp } from '../../contexts/AppContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { RepositoriesStackParamList } from '../../navigation/AppNavigator';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import { getGitHubOAuthSetupHint } from '../../services/github';

type NavigationProp = NativeStackNavigationProp<RepositoriesStackParamList, 'ConnectGitHub'>;

const STEPS = [
  'Tap Connect with GitHub below.',
  'Sign in and authorize the app on GitHub.',
  'Return to the app and tap Refresh status.',
];

export const ConnectGitHubScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { connectToGitHub, githubConnected, githubUser, disconnectFromGitHub, refreshGitHubStatus } = useApp();
  const { tabBarPaddingBottom } = useTabBarAwareScroll();

  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleConnect = async () => {
    setError('');
    setIsConnecting(true);
    try {
      await connectToGitHub();
      navigation.navigate('RepoList');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not connect GitHub. Please try again.';
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRefresh = async () => {
    setError('');
    setIsRefreshing(true);
    try {
      const connected = await refreshGitHubStatus();
      if (connected) {
        navigation.navigate('RepoList');
        return;
      }
      setError('Not connected yet. Finish authorization on GitHub, then try again.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not refresh GitHub status.';
      setError(message);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (githubConnected && githubUser) {
    return (
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: tabBarPaddingBottom }]}>
        <View style={styles.connectedContainer}>
          <Card style={styles.profileCard} glow="cyan">
            <View style={styles.successBadge}>
              <CheckCircle size={20} color={theme.colors.success} />
              <Text style={styles.successBadgeText}>Successfully Connected</Text>
            </View>

            <Image source={{ uri: githubUser.avatarUrl }} style={styles.avatar} />
            <Text style={styles.username}>{githubUser.username}</Text>
            <Text style={styles.bio}>{githubUser.bio}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{githubUser.publicRepos}</Text>
                <Text style={styles.statLabel}>Public Repos</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>Active</Text>
                <Text style={styles.statLabel}>Token Status</Text>
              </View>
            </View>

            <Button
              title="Continue to Repositories"
              onPress={() => navigation.navigate('RepoList')}
              style={styles.actionBtn}
            />

            <Button
              title="Disconnect Integration"
              onPress={disconnectFromGitHub}
              variant="outline"
              textStyle={{ color: theme.colors.error }}
            />
          </Card>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: tabBarPaddingBottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <Card style={styles.introCard}>
        <View style={styles.introHeader}>
          <GitFork size={28} color={theme.colors.textPrimary} style={styles.githubIcon} />
          <Text style={styles.introTitle}>Link your GitHub Account</Text>
        </View>
        <Text style={styles.introText}>
          Connect securely via GitHub OAuth. You will be redirected to GitHub to approve access — no personal access token required.
        </Text>
      </Card>

      <Card style={styles.stepsCard}>
        {STEPS.map((step, index) => (
          <View key={step} style={[styles.stepRow, index === STEPS.length - 1 && styles.stepRowLast]}>
            <ShieldCheck size={18} color={theme.colors.secondaryLight} />
            <Text style={styles.stepDesc}>{step}</Text>
          </View>
        ))}
      </Card>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Card style={styles.actionsCard}>
        <Button
          title="Connect with GitHub"
          onPress={handleConnect}
          loading={isConnecting}
          variant="secondary"
          style={styles.actionBtn}
        />

        <Button
          title="Refresh status"
          onPress={handleRefresh}
          loading={isRefreshing}
          variant="outline"
          icon={<RefreshCw size={16} color={theme.colors.textPrimary} />}
        />
      </Card>

      <Text style={styles.hintText}>{getGitHubOAuthSetupHint()}</Text>
      {Platform.OS === 'android' ? (
        <Text style={styles.hintText}>On Android emulator, run: adb reverse tcp:5000 tcp:5000</Text>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  connectedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
  },
  profileCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: theme.roundness.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  successBadgeText: {
    color: theme.colors.success,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    marginLeft: theme.spacing.sm,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
    marginBottom: theme.spacing.md,
  },
  username: {
    fontSize: theme.typography.sizes.xl - 2,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  bio: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  statBox: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  statLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  introCard: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  introHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  githubIcon: {
    marginRight: theme.spacing.sm,
  },
  introTitle: {
    fontSize: theme.typography.sizes.md + 2,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  introText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },
  stepsCard: {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderColor: 'rgba(16, 185, 129, 0.18)',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  stepRowLast: {
    marginBottom: 0,
  },
  stepDesc: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
    lineHeight: theme.typography.lineHeights.sm,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.sizes.sm,
    lineHeight: theme.typography.lineHeights.sm,
  },
  actionsCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  actionBtn: {
    marginBottom: theme.spacing.sm,
  },
  hintText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    lineHeight: theme.typography.lineHeights.sm,
    marginBottom: theme.spacing.xs,
  },
});
