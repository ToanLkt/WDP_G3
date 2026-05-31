import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { Home, FolderCode, MessageSquareCode, Settings, Milestone } from 'lucide-react-native';
import { StyleSheet, View, TouchableOpacity, Platform } from 'react-native';

import { theme } from '../theme/theme';
import { useApp } from '../context/AppContext';

// Screens
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { HomeScreen } from '../screens/main/HomeScreen';
import { RepositoriesScreen } from '../screens/main/RepositoriesScreen';
import { AnalysisResultScreen } from '../screens/main/AnalysisResultScreen';
import { ChatScreen } from '../screens/main/ChatScreen';
import { SettingsScreen } from '../screens/main/SettingsScreen';
import { ConnectGitHubScreen } from '../screens/github/ConnectGitHubScreen';
import { RoadmapScreen } from '../screens/main/RoadmapScreen';

// 1. Navigation Parameter List Types
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type RepositoriesStackParamList = {
  RepoList: undefined;
  RepoAnalysis: { repoId: string; repoName: string };
  ConnectGitHub: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  RepositoriesTab: undefined;
  RoadmapTab: undefined;
  ChatTab: { repoId?: string; repoName?: string } | undefined;
  SettingsTab: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RepoStack = createNativeStackNavigator<RepositoriesStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// 2. Auth Stack Navigator
const AuthStackNavigator = () => {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
};

// Custom Floating Center Button for the Tab Bar
const CustomTabBarButton = ({ onPress, accessibilityState }: any) => {
  const focused = accessibilityState?.selected;
  return (
    <TouchableOpacity
      style={styles.customBtnWrapper}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={[
        styles.customBtn,
        focused && styles.customBtnFocused
      ]}>
        <Milestone 
          color="#FFFFFF" 
          size={focused ? 26 : 22} 
        />
      </View>
    </TouchableOpacity>
  );
};

// 3. Repositories Nested Stack Navigator
const RepositoriesStackNavigator = () => {
  return (
    <RepoStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: {
          fontWeight: theme.typography.weights.bold,
          fontSize: theme.typography.sizes.md + 1,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <RepoStack.Screen 
        name="RepoList" 
        component={RepositoriesScreen} 
        options={{ title: 'Repositories' }} 
      />
      <RepoStack.Screen 
        name="RepoAnalysis" 
        component={AnalysisResultScreen} 
        options={({ route }) => ({ title: route.params.repoName })} 
      />
      <RepoStack.Screen 
        name="ConnectGitHub" 
        component={ConnectGitHubScreen} 
        options={{ title: 'Connect GitHub' }} 
      />
    </RepoStack.Navigator>
  );
};

// 4. Main Tabs Navigator
const MainTabsNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: {
          fontWeight: theme.typography.weights.bold,
          fontSize: theme.typography.sizes.md + 2,
        },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 0,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          height: Platform.OS === 'ios' ? 88 : 72,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 10,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          elevation: 15,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.3,
          shadowRadius: 10,
          borderWidth: 0,
        },
        tabBarActiveTintColor: theme.colors.secondary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: theme.typography.weights.medium,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size - 2} />,
        }}
      />
      <Tab.Screen
        name="RepositoriesTab"
        component={RepositoriesStackNavigator}
        options={{
          title: 'Repositories',
          headerShown: false, // Stack navigator has its own headers
          tabBarLabel: 'Repos',
          tabBarIcon: ({ color, size }) => <FolderCode color={color} size={size - 2} />,
        }}
      />
      <Tab.Screen
        name="RoadmapTab"
        component={RoadmapScreen}
        options={{
          title: 'Learning Roadmap',
          tabBarLabel: 'Roadmap',
          tabBarButton: (props) => <CustomTabBarButton {...props} />,
        }}
      />
      <Tab.Screen
        name="ChatTab"
        component={ChatScreen}
        options={{
          title: 'AI Mentor',
          tabBarLabel: 'AI Chat',
          tabBarIcon: ({ color, size }) => <MessageSquareCode color={color} size={size - 2} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: 'Settings & Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size - 2} />,
        }}
      />
    </Tab.Navigator>
  );
};

// 5. Main Root Navigator
export const AppNavigator: React.FC = () => {
  const { token } = useApp();

  return (
    <NavigationContainer>
      {token === null ? <AuthStackNavigator /> : <MainTabsNavigator />}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  customBtnWrapper: {
    top: -24, // Elevated higher for that premium floating overlapping style!
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.primary, // Electric violet glow
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  customBtn: {
    width: 64, // Slightly larger button
    height: 64, // Slightly larger button
    borderRadius: 32, // Perfect circle radius
    backgroundColor: '#6D28D9', // Restored Electric Violet background!
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4, // Bold negative space divider
    borderColor: theme.colors.surface, // Matches the tab bar container exactly to give a clean cutout effect!
  },
  customBtnFocused: {
    backgroundColor: theme.colors.secondary, // Bright neon cyan when active!
    shadowColor: theme.colors.secondary,
    shadowOpacity: 0.7,
    shadowRadius: 12,
  },
});
