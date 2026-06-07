import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import {
  User,
  loginUser as apiLogin,
  registerUser as apiRegister,
  logoutUser as apiLogout,
  fetchCurrentUser,
  fetchProfile,
  AuthResponse,
} from '../services/auth';
import { GitHubUser, connectGitHubOAuth, fetchGitHubMe, disconnectGitHub } from '../services/github';
import {
  Repository,
  fetchCachedRepositoriesList,
  syncRepositoriesFromGitHub,
  analyzeRepository as apiAnalyzeRepo,
  AnalyzeRepositoryOptions,
} from '../services/repo';
import { ChatMessage, createChatSession, fetchChatSessions, fetchChatSessionDetail, sendChatMessage } from '../services/chat';
import { Roadmap, generateRoadmap as apiGenerateRoadmap, fetchMyRoadmapsList } from '../services/roadmap';
import {
  clearStoredUser,
  clearToken,
  loadStoredToken,
  setUnauthorizedHandler,
} from '../api/client';
import type { Profile } from '../types';

interface AppContextType {
  user: User | null;
  profile: Profile | null;
  token: string | null;
  isBootstrapping: boolean;
  githubConnected: boolean;
  githubUser: GitHubUser | null;
  repositories: Repository[];
  chatHistory: { [repoId: string]: ChatMessage[] };
  roadmaps: { [repoId: string]: Roadmap };
  activeRoadmapId: string | null;
  isLoading: boolean;

  loginUser: (email: string, password: string) => Promise<AuthResponse>;
  registerUser: (email: string, password: string, name: string) => Promise<AuthResponse>;
  logoutUser: () => Promise<void>;
  connectToGitHub: () => Promise<void>;
  refreshGitHubStatus: () => Promise<boolean>;
  syncRepositoriesFromGitHub: () => Promise<void>;
  disconnectFromGitHub: () => Promise<void>;
  analyzeRepository: (repoId: string, options?: AnalyzeRepositoryOptions) => Promise<void>;
  sendMessageToAI: (messageText: string, repoId: string) => Promise<void>;
  generateRoadmapAction: (repoId: string) => Promise<Roadmap>;
  toggleRoadmapStepStatus: (repoId: string, stepId: string) => void;
  selectActiveRoadmap: (repoId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [chatHistory, setChatHistory] = useState<{ [repoId: string]: ChatMessage[] }>({});
  const [repoChatSessions, setRepoChatSessions] = useState<{ [repoId: string]: string }>({});
  const [roadmaps, setRoadmaps] = useState<{ [repoId: string]: Roadmap }>({});
  const [activeRoadmapId, setActiveRoadmapId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const resetSessionState = useCallback(() => {
    setUser(null);
    setProfile(null);
    setTokenState(null);
    setGithubConnected(false);
    setGithubUser(null);
    setRepositories([]);
    setChatHistory({});
    setRepoChatSessions({});
    setRoadmaps({});
    setActiveRoadmapId(null);
  }, []);

  const syncBackendData = async (userRepos: Repository[]) => {
    try {
      const rList = await fetchMyRoadmapsList();
      const roadmapMap: { [repoId: string]: Roadmap } = {};
      rList.forEach((rm) => {
        if (rm.repoId) {
          roadmapMap[rm.repoId] = rm;
        }
      });
      setRoadmaps(roadmapMap);
      if (rList.length > 0) {
        setActiveRoadmapId(rList[0].repoId);
      }

      const sessions = await fetchChatSessions();
      const updatedSessions: { [repoId: string]: string } = {};
      const updatedHistory: { [repoId: string]: ChatMessage[] } = {};

      for (const session of sessions) {
        let matchedRepoId = 'general';

        const matchingRepo = userRepos.find((repo) => session.title.includes(repo.name));
        if (matchingRepo) {
          matchedRepoId = matchingRepo.id;
        } else if (
          session.title === 'General AI Consultation'
          || session.title.toLowerCase().includes('general')
          || session.title === 'Tư vấn GitHub của tôi'
        ) {
          matchedRepoId = 'general';
        }

        updatedSessions[matchedRepoId] = session.id;

        try {
          const msgs = await fetchChatSessionDetail(session.id);
          updatedHistory[matchedRepoId] = msgs;
        } catch {
          // Ignore individual session detail errors
        }
      }

      setRepoChatSessions(updatedSessions);
      setChatHistory((prev) => ({
        ...prev,
        ...updatedHistory,
      }));
    } catch (err) {
      console.warn('Error syncing backend roadmaps and chats:', err);
    }
  };

  const hydrateUserSession = async () => {
    try {
      const profilePayload = await fetchProfile();
      const profileRecord = profilePayload as Record<string, unknown>;
      const profileData = (profileRecord.profile ?? profileRecord) as Profile;
      if (profileData?.fullName) {
        setProfile(profileData);
      }
    } catch {
      setProfile(null);
    }

    const githubProfile = await fetchGitHubMe();
    if (githubProfile) {
      setGithubUser(githubProfile);
      setGithubConnected(true);

      const repos = await fetchCachedRepositoriesList();
      setRepositories(repos);
      await syncBackendData(repos);
    } else {
      setGithubUser(null);
      setGithubConnected(false);
      setRepositories([]);
    }
  };

  useEffect(() => {
    const welcomeMsg: ChatMessage = {
      id: 'welcome_general',
      text: 'Chào bạn! Tôi là AI Mentor của bạn. Hãy hỏi tôi về các kỹ năng, CV, hoặc phân tích repository của bạn nhé!',
      sender: 'ai',
      timestamp: new Date().toISOString(),
    };

    setChatHistory((prev) => ({
      general: prev.general && prev.general.length > 1 ? prev.general : [welcomeMsg],
    }));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      resetSessionState();
    });

    const bootstrap = async () => {
      try {
        const storedToken = await loadStoredToken();
        if (!storedToken) return;

        setTokenState(storedToken);
        const currentUser = await fetchCurrentUser();
        setUser(currentUser);
        await hydrateUserSession();
      } catch {
        await clearToken();
        await clearStoredUser();
        resetSessionState();
      } finally {
        setIsBootstrapping(false);
      }
    };

    bootstrap();

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [resetSessionState]);

  const loginUser = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiLogin(email, password);
      setUser(res.user);
      setTokenState(res.token);
      await hydrateUserSession();
      return res;
    } finally {
      setIsLoading(false);
    }
  };

  const registerUser = async (email: string, password: string, name: string) => {
    setIsLoading(true);
    try {
      const res = await apiRegister(email, password, name);
      setUser(res.user);
      setTokenState(res.token);
      setGithubUser(null);
      setGithubConnected(false);
      setRepositories([]);
      return res;
    } finally {
      setIsLoading(false);
    }
  };

  const logoutUser = async () => {
    setIsLoading(true);
    try {
      await apiLogout();
    } catch {
      await clearToken();
      await clearStoredUser();
    } finally {
      resetSessionState();
      setIsLoading(false);
    }
  };

  const refreshGitHubStatus = async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const githubProfile = await fetchGitHubMe();
      if (githubProfile) {
        setGithubUser(githubProfile);
        setGithubConnected(true);
        const repos = await fetchCachedRepositoriesList();
        setRepositories(repos);
        await syncBackendData(repos);
        return true;
      }

      setGithubUser(null);
      setGithubConnected(false);
      setRepositories([]);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const syncRepositoriesAction = async () => {
    setIsLoading(true);
    try {
      const githubProfile = await fetchGitHubMe();
      if (!githubProfile) {
        setGithubUser(null);
        setGithubConnected(false);
        setRepositories([]);
        return;
      }

      setGithubUser(githubProfile);
      setGithubConnected(true);
      const repos = await syncRepositoriesFromGitHub();
      setRepositories(repos);
      await syncBackendData(repos);
    } finally {
      setIsLoading(false);
    }
  };

  const connectToGitHub = async () => {
    setIsLoading(true);
    try {
      const result = await connectGitHubOAuth();

      if (result === 'success') {
        const githubProfile = await fetchGitHubMe();
        if (githubProfile) {
          setGithubUser(githubProfile);
          setGithubConnected(true);
        }
        await syncRepositoriesAction();
        return;
      }

      if (result === 'cancelled') {
        throw new Error('Đã hủy liên kết GitHub.');
      }

      throw new Error('Could not complete GitHub connection. Authorize on GitHub and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectFromGitHub = async () => {
    setIsLoading(true);
    try {
      await disconnectGitHub();
      setGithubUser(null);
      setGithubConnected(false);
      setRepositories([]);
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeRepository = async (repoId: string, options?: AnalyzeRepositoryOptions) => {
    try {
      await apiAnalyzeRepo(repoId, options);

      setRepositories((prevRepos) =>
        prevRepos.map((repo) =>
          repo.id === repoId ? { ...repo, is_analyzed: true } : repo
        )
      );

      const repoItem = repositories.find((repo) => repo.id === repoId);
      const repoName = repoItem ? repoItem.name : 'dự án';

      const welcome: ChatMessage = {
        id: `welcome_${repoId}`,
        text: `Tôi đã hoàn thành phân tích repository **${repoName}**! Dữ liệu phân tích đã sẵn sàng. Bạn có câu hỏi nào về Tech Stack, lỗi README, hay cách viết dự án này vào CV không?`,
        sender: 'ai',
        timestamp: new Date().toISOString(),
      };

      setChatHistory((prevChats) => ({
        ...prevChats,
        [repoId]: [welcome],
      }));
    } catch (error) {
      console.error('Error analyzing repository:', error);
      throw error;
    }
  };

  const sendMessageToAI = async (messageText: string, repoId: string) => {
    const activeRepoId = repoId || 'general';
    const repoItem = repositories.find((repo) => repo.id === repoId);

    const userMsg: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      text: messageText,
      sender: 'user',
      timestamp: new Date().toISOString(),
    };

    setChatHistory((prevChats) => {
      const currentHistory = prevChats[activeRepoId] || [];
      return {
        ...prevChats,
        [activeRepoId]: [...currentHistory, userMsg],
      };
    });

    try {
      let sessionId = repoChatSessions[activeRepoId];
      if (!sessionId) {
        const title = activeRepoId === 'general'
          ? 'General AI Consultation'
          : `Tư vấn repo ${repoItem?.name || 'dự án'}`;
        const newSession = await createChatSession(title);
        sessionId = newSession.id;
        setRepoChatSessions((prev) => ({
          ...prev,
          [activeRepoId]: sessionId,
        }));
      }

      const { assistantMessage } = await sendChatMessage(sessionId, messageText);

      setChatHistory((prevChats) => {
        const currentHistory = prevChats[activeRepoId] || [];
        return {
          ...prevChats,
          [activeRepoId]: [...currentHistory, assistantMessage],
        };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Có lỗi xảy ra khi liên kết với AI Mentor. Vui lòng kiểm tra và gửi lại.';
      const errorMsg: ChatMessage = {
        id: `msg_error_${Date.now()}`,
        text: message,
        sender: 'ai',
        timestamp: new Date().toISOString(),
      };

      setChatHistory((prevChats) => {
        const currentHistory = prevChats[activeRepoId] || [];
        return {
          ...prevChats,
          [activeRepoId]: [...currentHistory, errorMsg],
        };
      });
    }
  };

  const generateRoadmapAction = async (repoId: string) => {
    setIsLoading(true);
    try {
      const repoItem = repositories.find((repo) => repo.id === repoId);
      const repoName = repoItem ? repoItem.name : 'dự án';
      const roadmapData = await apiGenerateRoadmap(repoId, repoName);

      setRoadmaps((prev) => ({
        ...prev,
        [repoId]: roadmapData,
      }));
      setActiveRoadmapId(repoId);
      return roadmapData;
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRoadmapStepStatus = (repoId: string, stepId: string) => {
    const targetRoadmap = roadmaps[repoId];
    if (!targetRoadmap) return;

    const updatedSteps = targetRoadmap.steps.map((step) => {
      if (step.id === stepId) {
        let nextStatus: 'locked' | 'in_progress' | 'completed' = 'locked';
        if (step.status === 'locked') nextStatus = 'in_progress';
        else if (step.status === 'in_progress') nextStatus = 'completed';
        else nextStatus = 'locked';
        return { ...step, status: nextStatus };
      }
      return step;
    });

    const completedCount = updatedSteps.filter((step) => step.status === 'completed').length;
    const progressPercent = Math.round((completedCount / updatedSteps.length) * 100);

    setRoadmaps((prev) => ({
      ...prev,
      [repoId]: {
        ...targetRoadmap,
        steps: updatedSteps,
        progressPercent,
      },
    }));
  };

  const selectActiveRoadmap = (repoId: string) => {
    setActiveRoadmapId(repoId);
  };

  return (
    <AppContext.Provider
      value={{
        user,
        profile,
        token,
        isBootstrapping,
        githubConnected,
        githubUser,
        repositories,
        chatHistory,
        roadmaps,
        activeRoadmapId,
        isLoading,
        loginUser,
        registerUser,
        logoutUser,
        connectToGitHub,
        refreshGitHubStatus,
        syncRepositoriesFromGitHub: syncRepositoriesAction,
        disconnectFromGitHub,
        analyzeRepository,
        sendMessageToAI,
        generateRoadmapAction,
        toggleRoadmapStepStatus,
        selectActiveRoadmap,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
