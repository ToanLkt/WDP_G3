import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { GitFork, Key, CheckCircle, Info, ExternalLink, ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { theme } from '../../theme/theme';
import { useApp } from '../../context/AppContext';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { SectionHeader } from '../../components/common/SectionHeader';
import { RepositoriesStackParamList } from '../../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RepositoriesStackParamList, 'ConnectGitHub'>;

export const ConnectGitHubScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { connectToGitHub, githubConnected, githubUser, disconnectFromGitHub } = useApp();
  
  const [pat, setPat] = useState('');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setError('');
    if (!pat.trim()) {
      setError('Please enter a Personal Access Token.');
      return;
    }
    
    setIsConnecting(true);
    try {
      await connectToGitHub(pat.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to connect. Please check your token.');
    } finally {
      setIsConnecting(false);
    }
  };

  const fillMockToken = () => {
    setPat('ghp_mocktokenfordevs');
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {githubConnected && githubUser ? (
        // Connected State UI
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
              style={styles.continueBtn}
            />

            <Button
              title="Disconnect Integration"
              onPress={disconnectFromGitHub}
              variant="outline"
              textStyle={{ color: theme.colors.error }}
            />
          </Card>
        </View>
      ) : (
        // Not Connected State UI
        <View style={styles.formContainer}>
          <Card style={styles.introCard}>
            <View style={styles.introHeader}>
              <GitFork size={28} color={theme.colors.textPrimary} style={styles.githubIcon} />
              <Text style={styles.introTitle}>Link your GitHub Account</Text>
            </View>
            <Text style={styles.introText}>
              Antigravity uses a secure GitHub Personal Access Token (PAT) to analyze your public code repos, readmes, and recent commits.
            </Text>
          </Card>

          <SectionHeader title="How to generate a PAT" accentColor={theme.colors.secondary} />
          
          <Card style={styles.stepsCard}>
            <View style={styles.stepRow}>
              <Text style={styles.stepNum}>1</Text>
              <Text style={styles.stepDesc}>Go to your GitHub Account **Settings** &gt; **Developer Settings**.</Text>
            </View>
            <View style={styles.stepRow}>
              <Text style={styles.stepNum}>2</Text>
              <Text style={styles.stepDesc}>Select **Personal Access Tokens** &gt; **Tokens (classic)**.</Text>
            </View>
            <View style={styles.stepRow}>
              <Text style={styles.stepNum}>3</Text>
              <Text style={styles.stepDesc}>Click **Generate new token (classic)**.</Text>
            </View>
            <View style={styles.stepRow}>
              <Text style={styles.stepNum}>4</Text>
              <Text style={styles.stepDesc}>Select the **repo** scope checkmark checkbox, generate, and copy the token.</Text>
            </View>
          </Card>

          <Card style={styles.formCard}>
            <Text style={styles.formTitle}>Enter Personal Access Token</Text>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Input
              placeholder="e.g. ghp_1a2b3c4d5e6f..."
              value={pat}
              onChangeText={(text) => {
                setPat(text);
                if (error) setError('');
              }}
              icon={Key}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Button
              title="Connect Account"
              onPress={handleConnect}
              loading={isConnecting}
              variant="secondary"
              style={styles.connectBtn}
            />

            <TouchableOpacity 
              onPress={fillMockToken}
              style={styles.demoTokenBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.demoTokenText}>Generate mock PAT for testing (ghp_...)</Text>
            </TouchableOpacity>
          </Card>
        </View>
      )}
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
  continueBtn: {
    marginBottom: theme.spacing.md,
  },
  formContainer: {
    width: '100%',
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
    backgroundColor: '#0F1117',
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.secondary,
    fontWeight: theme.typography.weights.bold,
    fontSize: theme.typography.sizes.xs + 1,
    textAlign: 'center',
    lineHeight: 20,
    marginRight: theme.spacing.md,
    overflow: 'hidden',
  },
  stepDesc: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
    lineHeight: theme.typography.lineHeights.sm,
  },
  formCard: {
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  formTitle: {
    fontSize: theme.typography.sizes.md + 1,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.lg,
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
    textAlign: 'center',
  },
  connectBtn: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  demoTokenBtn: {
    alignSelf: 'center',
    paddingVertical: theme.spacing.xs,
  },
  demoTokenText: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.secondary,
    fontWeight: theme.typography.weights.medium,
    textDecorationLine: 'underline',
  },
});
