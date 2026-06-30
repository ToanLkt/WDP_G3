import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Terminal } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';

import { theme } from '../../theme';
import { useApp } from '../../contexts/AppContext';
import { getGithubAuthUrl } from '../../services/auth';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { AuthStackParamList } from '../../navigation/AppNavigator';

WebBrowser.maybeCompleteAuthSession();

// GitHub OAuth Endpoints
const githubDiscovery = {
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
  revocationEndpoint: 'https://github.com/settings/connections/applications',
};

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

const redirectUri = makeRedirectUri();

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { loginUser, loginWithGoogleAction, loginWithGithubAction } = useApp();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Google Auth Setup
  useEffect(() => {
    import('@react-native-google-signin/google-signin').then(({ GoogleSignin }) => {
      GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
        offlineAccess: true,
      });
    });
  }, []);

  const handleGoogleLoginFlow = async () => {
    setIsSubmitting(true);
    setApiError('');
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (response.type === 'success') {
        if (response.data.idToken) {
          await loginWithGoogleAction(response.data.idToken);
        } else {
          setApiError('Không lấy được idToken từ Google.');
        }
      } else if (response.type === 'cancelled') {
        // User cancelled the login flow
        return;
      } else {
        setApiError('Đăng nhập Google không thành công.');
      }
    } catch (err: any) {
      console.log('Google Signin Error:', err);
      setApiError(err.message || 'Lỗi đăng nhập Google.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGithubLoginFlow = async () => {
    setIsSubmitting(true);
    setApiError('');
    try {
      const authUrl = await getGithubAuthUrl(redirectUri);
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      
      if (result.type === 'success' && result.url) {
        const url = result.url;
        let appToken = null;
        let errorMsg = null;
        
        // Extract token safely across query params and hash fragments
        const tokenKeys = ['accessToken', 'access_token', 'token', 'jwt', 'jwtToken', 'appToken', 'authToken', 'auth_token', 'githubAccessToken'];
        for (const key of tokenKeys) {
          const match = url.match(new RegExp(`[?&#]${key}=([^&#]+)`));
          if (match && match[1]) {
            appToken = decodeURIComponent(match[1]);
            break;
          }
        }

        const errMatch = url.match(/[?&#](error|errorMessage|message)=([^&#]+)/);
        if (errMatch && errMatch[2]) {
          errorMsg = decodeURIComponent(errMatch[2]);
        }

        if (appToken) {
           await loginWithGithubAction(appToken);
        } else {
           throw new Error(errorMsg || `URL không chứa token: ${url.substring(0, 50)}...`);
        }
      }
    } catch (err: any) {
      setApiError(err.message || 'Lỗi đăng nhập GitHub.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const validate = (): boolean => {
    let isValid = true;
    
    // Email validate
    if (!email.trim()) {
      setEmailError('Vui lòng nhập Email.');
      isValid = false;
    } else if (!email.includes('@')) {
      setEmailError('Email không hợp lệ.');
      isValid = false;
    } else {
      setEmailError('');
    }

    // Password validate
    if (!password) {
      setPasswordError('Vui lòng nhập mật khẩu.');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError('Mật khẩu phải có ít nhất 6 ký tự.');
      isValid = false;
    } else {
      setPasswordError('');
    }

    return isValid;
  };

  const handleLogin = async () => {
    setApiError('');
    if (!validate()) return;
    
    setIsSubmitting(true);
    try {
      await loginUser(email.trim(), password);
    } catch (err: any) {
      setApiError(err.message || 'Thông tin đăng nhập không chính xác hoặc lỗi kết nối.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerContainer}>
          <View style={styles.logoCircle}>
            <Terminal size={32} color={theme.colors.secondary} />
          </View>
          <Text style={styles.appName}>GitAnalyzer<Text style={{ color: theme.colors.secondary }}> AI</Text></Text>
          <Text style={styles.tagline}>Nâng tầm chất lượng mã nguồn GitHub cùng AI Mentor</Text>
        </View>

        <Card style={styles.card} glow="violet">
          <Text style={styles.cardTitle}>Đăng Nhập</Text>
          
          {apiError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{apiError}</Text>
            </View>
          ) : null}

          <Input
            label="Địa chỉ Email"
            placeholder="vd: dev@example.com"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError('');
            }}
            error={emailError}
            isEmail
          />

          <Input
            label="Mật khẩu"
            placeholder="••••••••"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (passwordError) setPasswordError('');
            }}
            error={passwordError}
            isPassword
          />

          <Button
            title="Đăng Nhập"
            onPress={handleLogin}
            loading={isSubmitting}
            style={styles.loginButton}
          />
          
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Hoặc</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            title="Tiếp tục với Google"
            onPress={handleGoogleLoginFlow}
            disabled={isSubmitting}
            style={styles.socialButton}
            variant="outline"
          />

          <Button
            title="Tiếp tục với GitHub"
            onPress={handleGithubLoginFlow}
            disabled={isSubmitting}
            style={styles.socialButton}
            variant="outline"
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Mới biết đến GitAnalyzer? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.7}>
              <Text style={styles.registerLink}>Tạo Tài khoản</Text>
            </TouchableOpacity>
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl + 8,
  },
  logoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    ...theme.shadows.glowCyan,
  },
  appName: {
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.heavy,
    color: theme.colors.textPrimary,
    letterSpacing: 2,
    marginBottom: theme.spacing.xs,
  },
  tagline: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: theme.typography.lineHeights.sm,
  },
  card: {
    width: '100%',
    padding: theme.spacing.xl,
  },
  cardTitle: {
    fontSize: theme.typography.sizes.xl - 2,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  errorBoxText: {
    color: theme.colors.error,
    fontSize: theme.typography.sizes.sm,
    textAlign: 'center',
  },
  loginButton: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  socialButton: {
    marginBottom: theme.spacing.sm,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    color: theme.colors.textSecondary,
    paddingHorizontal: theme.spacing.sm,
    fontSize: theme.typography.sizes.sm,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  footerText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
  },
  registerLink: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primaryLight,
  },
});
