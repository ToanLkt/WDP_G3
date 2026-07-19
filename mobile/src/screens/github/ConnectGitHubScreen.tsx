import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Linking,
} from 'react-native';
import {
  GitFork,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';

import { theme } from '../../theme';
import { useApp } from '../../contexts/AppContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SettingsStackParamList, MainTabParamList } from '../../navigation/AppNavigator';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';

type NavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<SettingsStackParamList, 'ConnectGitHub'>,
  BottomTabNavigationProp<MainTabParamList>
>;

// GitHub Octocat icon via react-native-svg (lucide-react-native peer dep — always available)
const GitHubIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = '#000' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </Svg>
);

export const ConnectGitHubScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const {
    connectToGitHub,
    githubConnected,
    githubUser,
    disconnectFromGitHub,
    refreshGitHubStatus,
    repositories,
    syncRepositoriesFromGitHub,
    isLoading,
    githubLogoutUrl,
    githubJustDisconnected,
    logoutHintVisible,
    setLogoutHintVisible,
  } = useApp();
  const { tabBarPaddingBottom } = useTabBarAwareScroll();

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Reload repositories info on mount
  useEffect(() => {
    refreshGitHubStatus().catch(() => undefined);
  }, []);

  const isPostLogoutFlow = (githubJustDisconnected || logoutHintVisible) && !githubConnected;

  const handleRefresh = async () => {
    setError('');
    setIsRefreshing(true);
    try {
      await refreshGitHubStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể làm mới trạng thái.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDisconnect = async () => {
    setError('');
    try {
      await disconnectFromGitHub();
      setNotice('GitHub đã được ngắt liên kết khỏi hệ thống.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể ngắt kết nối.');
    }
  };

  const handleConnectAnotherAccount = async () => {
    setError('');
    try {
      if (githubConnected) {
        await disconnectFromGitHub();
      }
      // Open GitHub logout
      const logoutUrl = githubLogoutUrl || 'https://github.com/logout';
      await Linking.openURL(logoutUrl);
      setLogoutHintVisible(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể mở trang đăng xuất GitHub.');
    }
  };

  const handleOpenGitHubLogout = async () => {
    const logoutUrl = githubLogoutUrl || 'https://github.com/logout';
    try {
      await Linking.openURL(logoutUrl);
      setLogoutHintVisible(true);
    } catch {
      setError('Không thể mở trình duyệt.');
    }
  };

  const handleConnectGitHub = async (options?: { forceAccountSelection?: boolean }) => {
    setError('');
    try {
      await connectToGitHub(options);
      setNotice('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể kết nối GitHub. Vui lòng thử lại.';
      setError(message);
    }
  };

  const handleSyncRepositories = async () => {
    setError('');
    setIsSyncing(true);
    try {
      await syncRepositoriesFromGitHub();
      setNotice('Đã đồng bộ repositories thành công.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể đồng bộ repositories.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLoadFromCache = async () => {
    setError('');
    setIsRefreshing(true);
    try {
      await refreshGitHubStatus();
      setNotice('Đã tải repositories từ cache.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải từ cache.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: tabBarPaddingBottom }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          {navigation.canGoBack() && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <ArrowLeft size={24} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          )}
          <Text style={styles.title}>Kết nối GitHub</Text>
        </View>
        <Text style={styles.subtitle}>
          Kết nối OAuth để đồng bộ repository, packages và commits từ GitHub.
        </Text>
      </View>

      {/* Error Banner */}
      {error ? (
        <View style={styles.errorBanner}>
          <AlertCircle size={16} color={theme.colors.error} style={styles.bannerIcon} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Notice Banner */}
      {notice ? (
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {/* ─── POST-LOGOUT FLOW ─── */}
      {isPostLogoutFlow ? (
        <Card padded={false} style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>GitHub đã được ngắt liên kết</Text>
            <Text style={styles.cardSubtitle}>
              Ngắt kết nối trong app chỉ ngắt liên kết GitHub khỏi hệ thống. Nếu GitHub vẫn tự
              dùng tài khoản cũ, hãy đăng xuất GitHub.com hoặc dùng cửa sổ ẩn danh.
            </Text>

            <View style={styles.buttonGroup}>
              <Button
                title="Kết nối lại GitHub"
                onPress={() => handleConnectGitHub({ forceAccountSelection: true })}
                loading={isLoading}
                variant="primary"
                style={styles.btnSpacing}
              />
              <TouchableOpacity
                style={styles.outlineBtn}
                onPress={handleOpenGitHubLogout}
                activeOpacity={0.75}
              >
                <ExternalLink size={15} color={theme.colors.textPrimary} style={styles.outlineBtnIcon} />
                <Text style={styles.outlineBtnText}>
                  Đăng xuất GitHub.com để dùng tài khoản khác
                </Text>
              </TouchableOpacity>
            </View>

            {logoutHintVisible && (
              <View style={styles.hintBox}>
                <Text style={styles.hintText}>
                  Đã mở trang đăng xuất GitHub.com. Sau khi đăng xuất xong, quay lại app và bấm
                  Kết nối lại GitHub.
                </Text>
              </View>
            )}
          </View>
        </Card>
      ) : (
        /* ─── MAIN OAUTH CARD ─── */
        <Card padded={false} style={styles.card}>
          {/* Gradient Top Bar */}
          <LinearGradient
            colors={['#6366F1', '#06B6D4', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientBar}
          />

          <View style={styles.cardContent}>
            <View style={styles.oauthRow}>
              {/* Left: Icon + info */}
              <View style={styles.oauthLeft}>
                <View
                  style={[
                    styles.iconBox,
                    githubConnected ? styles.iconBoxConnected : styles.iconBoxDefault,
                  ]}
                >
                  {githubConnected ? (
                    <CheckCircle2 size={24} color="#10B981" />
                  ) : (
                    <GitFork size={24} color={theme.colors.textSecondary} />
                  )}
                </View>
                <View style={styles.oauthInfo}>
                  <View style={styles.oauthTitleRow}>
                    <Text style={styles.oauthTitle}>GitHub OAuth</Text>
                    <View
                      style={[
                        styles.badge,
                        githubConnected ? styles.badgeSuccess : styles.badgeDefault,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          githubConnected ? styles.badgeTextSuccess : styles.badgeTextDefault,
                        ]}
                      >
                        {githubConnected ? 'Đã kết nối' : 'Chưa kết nối'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.oauthSubtitle}>
                    {githubConnected && githubUser ? (
                      <>Đang kết nối với tài khoản{' '}
                        <Text style={styles.usernameHighlight}>@{githubUser.username}</Text>.</>
                    ) : (
                      'Đăng nhập GitHub để cấp quyền đọc repository.'
                    )}
                  </Text>
                </View>
              </View>

              {/* Right: Action buttons */}
              <View style={styles.oauthActions}>
                <Button
                  title="Làm mới"
                  onPress={handleRefresh}
                  loading={isRefreshing}
                  variant="outline"
                  fullWidth={true}
                  icon={<RefreshCw size={14} color={theme.colors.textPrimary} style={{ marginRight: 5 }} />}
                />
                {githubConnected ? (
                  <>
                    <Button
                      title="Ngắt kết nối"
                      onPress={handleDisconnect}
                      loading={isLoading}
                      variant="outline"
                      fullWidth={true}
                    />
                    <Button
                      title="Kết nối GitHub khác"
                      onPress={handleConnectAnotherAccount}
                      loading={isLoading}
                      variant="primary"
                      fullWidth={true}
                    />
                  </>
                ) : (
                  <Button
                    title="Kết nối GitHub"
                    onPress={() => handleConnectGitHub()}
                    loading={isLoading}
                    variant="primary"
                    fullWidth={true}
                    icon={<GitFork size={16} color="#fff" style={{ marginRight: 6 }} />}
                  />
                )}
              </View>
            </View>

            {/* Info note */}
            <View style={styles.infoNote}>
              <Text style={styles.infoNoteText}>
                Ngắt kết nối trong app chỉ ngắt liên kết GitHub khỏi hệ thống. Nếu GitHub vẫn tự
                dùng tài khoản cũ, hãy đăng xuất GitHub.com hoặc dùng cửa sổ ẩn danh.
              </Text>
            </View>

            {/* Connected user info */}
            {githubConnected && githubUser && (
              <View style={styles.userRow}>
                {githubUser.avatarUrl ? (
                  <Image source={{ uri: githubUser.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <GitFork size={18} color={theme.colors.textSecondary} />
                  </View>
                )}
                <View>
                  <Text style={styles.userRowName}>@{githubUser.username}</Text>
                  <Text style={styles.userRowNote}>
                    Ngắt kết nối trong app chỉ ngắt liên kết GitHub khỏi hệ thống.
                  </Text>
                </View>
              </View>
            )}
          </View>
        </Card>
      )}

      {/* ─── NOT CONNECTED WARNING ─── */}
      {!githubConnected && !isPostLogoutFlow && (
        <View style={styles.warningBanner}>
          <AlertCircle size={16} color="#D97706" style={styles.bannerIcon} />
          <Text style={styles.warningText}>
            Cần kết nối GitHub trước khi đồng bộ repository và chạy phân tích.
          </Text>
        </View>
      )}

      {/* ─── REPOSITORIES SECTION ─── */}
      {githubConnected && (
        <Card padded={false} style={styles.card}>
          <View style={styles.cardContent}>
            {/* Repo section header */}
            <View style={styles.repoHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Repositories</Text>
                <Text style={styles.cardSubtitle}>
                  Repository đã cache hiện có: {repositories.length}
                </Text>
              </View>
            </View>

            {/* Repo action buttons */}
            <View style={styles.repoBtnGroup}>
              <Button
                title="Tải từ cache"
                onPress={handleLoadFromCache}
                loading={isRefreshing}
                variant="outline"
                icon={<RefreshCw size={14} color={theme.colors.textPrimary} style={{ marginRight: 5 }} />}
                style={styles.repoBtn}
              />
              <Button
                title="Đồng bộ repositories"
                onPress={handleSyncRepositories}
                loading={isSyncing}
                variant="primary"
                icon={<RefreshCw size={14} color="#fff" style={{ marginRight: 5 }} />}
                style={styles.repoBtn}
              />
              <Button
                title="Mở repositories →"
                onPress={() => navigation.navigate('RepositoriesTab', { screen: 'RepoList' })}
                variant="outline"
                icon={<ArrowRight size={14} color={theme.colors.textPrimary} style={{ marginRight: 5 }} />}
                style={styles.repoBtn}
              />
            </View>

            {/* Repo list preview */}
            {repositories.length > 0 && (
              <View style={styles.repoList}>
                {repositories.slice(0, 5).map((repo) => (
                  <TouchableOpacity
                    key={repo.id}
                    style={styles.repoItem}
                    onPress={() =>
                      navigation.navigate('RepositoriesTab', {
                        screen: 'RepoDetail',
                        params: {
                          repoId: repo.id,
                          repoName: repo.fullName || repo.name,
                        },
                      })
                    }
                    activeOpacity={0.75}
                  >
                    <Text style={styles.repoName}>{repo.fullName || repo.name}</Text>
                    <Text style={styles.repoLang}>{repo.language}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </Card>
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
  header: {
    marginBottom: theme.spacing.lg,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  backButton: {
    marginRight: theme.spacing.md,
    padding: 4,
    marginLeft: -4,
  },
  title: {
    fontSize: theme.typography.sizes.xxxl - 6,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },

  // ─── Banners ───
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  noticeBanner: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  bannerIcon: {
    marginRight: theme.spacing.sm,
    marginTop: 1,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.sizes.sm,
    flex: 1,
    lineHeight: theme.typography.lineHeights.sm,
  },
  noticeText: {
    color: '#22D3EE',
    fontSize: theme.typography.sizes.sm,
    lineHeight: theme.typography.lineHeights.sm,
  },
  warningText: {
    color: '#D97706',
    fontSize: theme.typography.sizes.sm,
    flex: 1,
    lineHeight: theme.typography.lineHeights.sm,
  },

  // ─── Card ───
  card: {
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
  },
  gradientBar: {
    height: 6,
    width: '100%',
  },
  cardContent: {
    padding: theme.spacing.lg,
  },
  cardTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  cardSubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
    marginBottom: theme.spacing.md,
  },

  // ─── OAuth Row ───
  oauthRow: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  oauthLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: theme.roundness.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxConnected: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  iconBoxDefault: {
    backgroundColor: theme.colors.surfaceLight,
  },
  oauthInfo: {
    flex: 1,
  },
  oauthTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: 4,
  },
  oauthTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.roundness.full,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  badgeDefault: {
    backgroundColor: theme.colors.surfaceLight,
  },
  badgeText: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.medium,
  },
  badgeTextSuccess: {
    color: '#10B981',
  },
  badgeTextDefault: {
    color: theme.colors.textSecondary,
  },
  oauthSubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },
  usernameHighlight: {
    color: '#6366F1',
    fontWeight: theme.typography.weights.bold,
  },

  oauthActions: {
    flexDirection: 'column',
    gap: theme.spacing.sm,
    width: '100%',
  },

  // ─── Info note ───
  infoNote: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  infoNoteText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },

  // ─── User row ───
  userRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userRowName: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textPrimary,
  },
  userRowNote: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  // ─── Post-logout ───
  buttonGroup: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  btnSpacing: {
    marginBottom: 0,
  },
  hintBox: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  hintText: {
    fontSize: theme.typography.sizes.sm,
    color: '#22D3EE',
    lineHeight: theme.typography.lineHeights.sm,
  },

  // ─── Repositories section ───
  repoHeaderRow: {
    marginBottom: theme.spacing.md,
  },
  repoBtnGroup: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  repoBtn: {
    marginBottom: 0,
  },
  repoList: {
    gap: theme.spacing.sm,
  },
  repoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  repoName: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  repoLang: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textSecondary,
  },

  // ─── Custom outline button (text-wrap safe) ───
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 12,
    width: '100%',
  },
  outlineBtnIcon: {
    marginRight: theme.spacing.sm,
    flexShrink: 0,
  },
  outlineBtnText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textPrimary,
    flex: 1,
    flexWrap: 'wrap',
  },
});
