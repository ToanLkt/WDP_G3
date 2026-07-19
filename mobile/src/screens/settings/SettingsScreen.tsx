import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { CustomAlert } from '../../components/ui/CustomAlert';
import {
  LogOut,
  User,
  LockKeyhole,
  ChevronDown,
  Save,
  RefreshCw,
  GitBranch,
  Bell,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../../theme';
import { useApp } from '../../contexts/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import {
  changePassword,
  createProfile,
  fetchProfile,
  updateProfile,
} from '../../services/auth';
import type { Profile } from '../../types';
import { getApiErrorMessage } from '../../api/client';

type ExpandedSection = 'profile' | 'password' | null;

type ProfileForm = {
  fullName: string;
  university: string;
  major: string;
  year: string;
  targetCareer: string;
  currentSkills: string;
  githubUsername: string;
};

const emptyProfileForm = (): ProfileForm => ({
  fullName: '',
  university: '',
  major: '',
  year: '1',
  targetCareer: '',
  currentSkills: '',
  githubUsername: '',
});

const profileToForm = (profile: Profile | null, fallbackName = '', githubUsername = ''): ProfileForm => ({
  fullName: profile?.fullName || fallbackName,
  university: profile?.university || '',
  major: profile?.major || '',
  year: String(profile?.year || 1),
  targetCareer: profile?.targetCareer || '',
  currentSkills: profile?.currentSkills?.join(', ') || '',
  githubUsername: profile?.githubUsername || githubUsername,
});

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { tabBarPaddingBottom } = useTabBarAwareScroll();
  const { user, profile, githubConnected, githubUser, disconnectFromGitHub, logoutUser, refreshGitHubStatus } = useApp();

  const [expanded, setExpanded] = useState<ExpandedSection>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm());
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false);
  const [isRefreshingGithub, setIsRefreshingGithub] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showDisconnectAlert, setShowDisconnectAlert] = useState(false);

  const loadProfileForm = useCallback(async () => {
    setIsRefreshingProfile(true);
    try {
      const payload = await fetchProfile();
      const record = (payload as Record<string, unknown>)?.profile ?? payload;
      const data = record as Profile;
      setProfileForm(profileToForm(data, user?.name, user?.githubUsername));
    } catch {
      setProfileForm(profileToForm(profile, user?.name, user?.githubUsername));
    } finally {
      setIsRefreshingProfile(false);
    }
  }, [profile, user?.name, user?.githubUsername]);

  useEffect(() => {
    setProfileForm(profileToForm(profile, user?.name, user?.githubUsername));
  }, [profile, user?.name, user?.githubUsername]);

  const toggleSection = (section: ExpandedSection) => {
    setExpanded((current) => (current === section ? null : section));
    setFeedback(null);
  };

  const updateProfileField = (field: keyof ProfileForm, value: string) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    setFeedback(null);
    try {
      const payload = {
        fullName: profileForm.fullName.trim(),
        university: profileForm.university.trim(),
        major: profileForm.major.trim(),
        year: Number(profileForm.year) || 1,
        targetCareer: profileForm.targetCareer.trim(),
        currentSkills: profileForm.currentSkills
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean),
        githubUsername: profileForm.githubUsername.trim() || undefined,
      };

      try {
        await updateProfile(payload);
      } catch {
        await createProfile(payload);
      }

      await loadProfileForm();
      setFeedback({ type: 'success', message: 'Profile saved.' });
    } catch (err) {
      setFeedback({ type: 'error', message: getApiErrorMessage(err) || 'Could not save profile.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setIsChangingPassword(true);
    setFeedback(null);
    try {
      await changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword,
        passwordForm.confirmPassword
      );
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setFeedback({ type: 'success', message: 'Password updated.' });
    } catch (err) {
      setFeedback({ type: 'error', message: getApiErrorMessage(err) || 'Could not change password.' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const githubUsername = githubUser?.username || user?.githubUsername || profileForm.githubUsername || 'not-connected';

  return (
    <View style={styles.rootContainer}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingTop: insets.top + theme.spacing.md, paddingBottom: tabBarPaddingBottom },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Settings</Text>
          <Text style={styles.pageSubtitle}>Manage your profile, GitHub, and account.</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('NotificationsTab')} style={styles.notificationBtn}>
          <Bell size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {feedback ? (
        <View style={[styles.feedbackBanner, feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess]}>
          <Text style={feedback.type === 'error' ? styles.feedbackErrorText : styles.feedbackSuccessText}>
            {feedback.message}
          </Text>
        </View>
      ) : null}

      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.cardDesc}>Login details from your auth session.</Text>
        <Input label="Email" value={user?.email || ''} editable={false} />
        <Input label="Display name" value={user?.name || ''} editable={false} style={styles.fieldGap} />
        <View style={styles.badgeRow}>
          <Badge label={githubConnected ? 'GitHub connected' : 'GitHub not connected'} variant={githubConnected ? 'success' : 'muted'} />
          {githubUsername !== 'not-connected' ? (
            <Badge label={`@${githubUsername}`} variant="secondary" />
          ) : null}
        </View>
      </Card>

      <Card style={styles.sectionCard} padded={false}>
        <TouchableOpacity style={styles.accordionHeader} onPress={() => toggleSection('profile')} activeOpacity={0.85}>
          <View style={styles.accordionIconWrap}>
            <User size={18} color={theme.colors.secondaryLight} />
          </View>
          <View style={styles.accordionText}>
            <Text style={styles.cardTitle}>Student profile</Text>
            <Text style={styles.cardDesc}>Tap to edit and save your profile.</Text>
          </View>
          <ChevronDown
            size={18}
            color={theme.colors.textMuted}
            style={expanded === 'profile' ? styles.chevronOpen : undefined}
          />
        </TouchableOpacity>

        {expanded === 'profile' && (
          <View style={styles.accordionBody}>
            <Input
              label="Full name"
              value={profileForm.fullName}
              onChangeText={(value) => updateProfileField('fullName', value)}
            />
            <Input
              label="University"
              value={profileForm.university}
              onChangeText={(value) => updateProfileField('university', value)}
              style={styles.fieldGap}
            />
            <Input
              label="Major"
              value={profileForm.major}
              onChangeText={(value) => updateProfileField('major', value)}
              style={styles.fieldGap}
            />
            <Input
              label="Year"
              value={profileForm.year}
              onChangeText={(value) => updateProfileField('year', value)}
              keyboardType="number-pad"
              style={styles.fieldGap}
            />
            <Input
              label="Target career"
              value={profileForm.targetCareer}
              onChangeText={(value) => updateProfileField('targetCareer', value)}
              style={styles.fieldGap}
            />
            <Input
              label="GitHub username"
              value={profileForm.githubUsername}
              onChangeText={(value) => updateProfileField('githubUsername', value)}
              style={styles.fieldGap}
            />
            <Input
              label="Current skills"
              value={profileForm.currentSkills}
              onChangeText={(value) => updateProfileField('currentSkills', value)}
              placeholder="JavaScript, React, Node.js"
              style={styles.fieldGap}
            />
            <View style={styles.actionRow}>
              <Button
                title="Save profile"
                onPress={handleSaveProfile}
                loading={isSavingProfile}
                icon={<Save size={14} color={theme.colors.textPrimary} />}
                style={styles.actionBtn}
              />
              <Button
                title="Reload"
                variant="outline"
                onPress={loadProfileForm}
                loading={isRefreshingProfile}
                fullWidth={false}
                style={styles.actionBtn}
                icon={<RefreshCw size={14} color={theme.colors.textPrimary} />}
              />
            </View>
          </View>
        )}
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.githubHeader}>
          <GitBranch size={18} color={theme.colors.textPrimary} />
          <View style={styles.accordionText}>
            <Text style={styles.cardTitle}>GitHub</Text>
            <Text style={styles.cardDesc}>OAuth connection status.</Text>
          </View>
        </View>
        <View style={styles.githubStatusBox}>
          {githubConnected && githubUser?.avatarUrl ? (
            <Image source={{ uri: githubUser.avatarUrl }} style={styles.gitAvatar} />
          ) : null}
          <View style={styles.githubStatusText}>
            <Text style={styles.githubUser}>@{githubUsername}</Text>
            <Text style={styles.githubState}>{githubConnected ? 'Connected' : 'Not connected'}</Text>
          </View>
          <Badge label={githubConnected ? 'Active' : 'Inactive'} variant={githubConnected ? 'success' : 'muted'} />
        </View>
        <Button
          title={githubConnected ? 'Ngắt kết nối GitHub' : 'Kết nối GitHub'}
          variant="outline"
          onPress={() =>
            githubConnected
              ? setShowDisconnectAlert(true)
              : navigation.navigate('ConnectGitHub')
          }
          style={styles.githubBtn}
        />
        <Button
          title="Refresh GitHub status"
          variant="outline"
          loading={isRefreshingGithub}
          onPress={async () => {
            setIsRefreshingGithub(true);
            setFeedback(null);
            try {
              const connected = await refreshGitHubStatus();
              setFeedback({
                type: connected ? 'success' : 'error',
                message: connected ? 'GitHub connected.' : 'GitHub is not connected yet.',
              });
            } catch (err) {
              setFeedback({ type: 'error', message: getApiErrorMessage(err) || 'Could not refresh GitHub status.' });
            } finally {
              setIsRefreshingGithub(false);
            }
          }}
          icon={<RefreshCw size={14} color={theme.colors.textPrimary} />}
          style={styles.githubRefreshBtn}
        />
      </Card>

      <Card style={styles.sectionCard} padded={false}>
        <TouchableOpacity style={styles.accordionHeader} onPress={() => toggleSection('password')} activeOpacity={0.85}>
          <View style={styles.accordionIconWrap}>
            <LockKeyhole size={18} color={theme.colors.warning} />
          </View>
          <View style={styles.accordionText}>
            <Text style={styles.cardTitle}>Change password</Text>
            <Text style={styles.cardDesc}>Tap to update your account password.</Text>
          </View>
          <ChevronDown
            size={18}
            color={theme.colors.textMuted}
            style={expanded === 'password' ? styles.chevronOpen : undefined}
          />
        </TouchableOpacity>

        {expanded === 'password' && (
          <View style={styles.accordionBody}>
            <Input
              label="Current password"
              value={passwordForm.currentPassword}
              onChangeText={(value) => setPasswordForm((current) => ({ ...current, currentPassword: value }))}
              isPassword
            />
            <Input
              label="New password"
              value={passwordForm.newPassword}
              onChangeText={(value) => setPasswordForm((current) => ({ ...current, newPassword: value }))}
              isPassword
              style={styles.fieldGap}
            />
            <Input
              label="Confirm password"
              value={passwordForm.confirmPassword}
              onChangeText={(value) => setPasswordForm((current) => ({ ...current, confirmPassword: value }))}
              isPassword
              style={styles.fieldGap}
            />
            <Button
              title="Change password"
              variant="outline"
              onPress={handleChangePassword}
              loading={isChangingPassword}
              style={styles.passwordBtn}
            />
          </View>
        )}
      </Card>

      <Card style={styles.logoutCard}>
        <Text style={styles.logoutTitle}>Sign out</Text>
        <Text style={styles.logoutDesc}>Clear local session and log out of this device.</Text>
        <Button
          title="Sign out"
          variant="outline"
          onPress={logoutUser}
          icon={<LogOut size={16} color={theme.colors.error} />}
          textStyle={{ color: theme.colors.error }}
          style={styles.logoutBtn}
        />
      </Card>

      <Text style={styles.versionText}>GitAnalyzer Mobile v1.0.0</Text>
    </ScrollView>

    <CustomAlert
      visible={showDisconnectAlert}
      title="Ngắt kết nối GitHub"
      message="Bạn có chắc muốn ngắt kết nối tài khoản GitHub? Bạn sẽ cần kết nối lại để phân tích repositories."
      type="warning"
      showCancel
      cancelText="Hủy"
      confirmText="Ngắt kết nối"
      onCancel={() => setShowDisconnectAlert(false)}
      onConfirm={() => {
        setShowDisconnectAlert(false);
        disconnectFromGitHub();
      }}
    />
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.lg,
  },
  pageHeader: {
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  notificationBtn: {
    padding: 8,
    marginRight: -8,
  },
  pageTitle: {
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  pageSubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
    lineHeight: theme.typography.lineHeights.sm,
  },
  feedbackBanner: {
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  feedbackError: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  feedbackSuccessText: {
    color: theme.colors.success,
    fontSize: theme.typography.sizes.sm,
  },
  feedbackErrorText: {
    color: theme.colors.error,
    fontSize: theme.typography.sizes.sm,
  },
  sectionCard: {
    marginBottom: theme.spacing.md,
  },
  cardTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  cardDesc: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textMuted,
    marginTop: 2,
    marginBottom: theme.spacing.md,
  },
  fieldGap: {
    marginTop: theme.spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  accordionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.roundness.sm,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accordionText: {
    flex: 1,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  accordionBody: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
  githubHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  githubStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  gitAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  githubStatusText: {
    flex: 1,
  },
  githubUser: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  githubState: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  githubBtn: {
    height: 44,
  },
  githubRefreshBtn: {
    marginTop: theme.spacing.sm,
    height: 44,
  },
  passwordBtn: {
    marginTop: theme.spacing.md,
    height: 44,
  },
  logoutCard: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  logoutTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.error,
    marginBottom: 4,
  },
  logoutDesc: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  logoutBtn: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  versionText: {
    textAlign: 'center',
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.lg,
  },
});
