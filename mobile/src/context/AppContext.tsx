import React, { createContext, useState, useContext, useEffect } from 'react';
import { User, mockLogin, mockRegister, AuthResponse } from '../services/auth';
import { GitHubUser, mockConnectGitHub } from '../services/github';
import { Repository, INITIAL_REPOSITORIES, mockAnalyzeRepo } from '../services/repo';
import { ChatMessage, mockSendMessage } from '../services/chat';
import { Roadmap, mockGenerateRoadmap } from '../services/roadmap';

interface AppContextType {
  user: User | null;
  token: string | null;
  githubConnected: boolean;
  githubUser: GitHubUser | null;
  repositories: Repository[];
  chatHistory: { [repoId: string]: ChatMessage[] }; // Chat history indexed by repoId (or 'general')
  roadmaps: { [repoId: string]: Roadmap }; // History of all generated roadmaps
  activeRoadmapId: string | null; // Id of the currently selected roadmap
  isLoading: boolean;
  
  // Actions
  loginUser: (email: string, password: string) => Promise<AuthResponse>;
  registerUser: (email: string, password: string, name: string) => Promise<AuthResponse>;
  logoutUser: () => void;
  connectToGitHub: (pat: string) => Promise<GitHubUser>;
  disconnectFromGitHub: () => void;
  analyzeRepository: (repoId: string) => Promise<void>;
  sendMessageToAI: (messageText: string, repoId: string) => Promise<void>;
  generateRoadmapAction: (repoId: string) => Promise<Roadmap>;
  toggleRoadmapStepStatus: (repoId: string, stepId: string) => void;
  selectActiveRoadmap: (repoId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [githubConnected, setGithubConnected] = useState<boolean>(false);
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>(INITIAL_REPOSITORIES);
  const [chatHistory, setChatHistory] = useState<{ [repoId: string]: ChatMessage[] }>({});
  const [roadmaps, setRoadmaps] = useState<{ [repoId: string]: Roadmap }>({});
  const [activeRoadmapId, setActiveRoadmapId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Auto load some welcome messages for repositories or general
  useEffect(() => {
    // Seed standard welcome chats
    const welcomeMsg: ChatMessage = {
      id: 'welcome_general',
      text: 'Chào bạn! Tôi là AI Mentor của bạn. Hãy hỏi tôi về các kỹ năng, CV, hoặc phân tích repository của bạn nhé!',
      sender: 'ai',
      timestamp: new Date().toISOString(),
    };
    
    setChatHistory({
      general: [welcomeMsg]
    });
  }, []);

  const loginUser = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await mockLogin(email, password);
      setUser(res.user);
      setToken(res.token);
      return res;
    } finally {
      setIsLoading(false);
    }
  };

  const registerUser = async (email: string, password: string, name: string) => {
    setIsLoading(true);
    try {
      const res = await mockRegister(email, password, name);
      setUser(res.user);
      setToken(res.token);
      return res;
    } finally {
      setIsLoading(false);
    }
  };

  const logoutUser = () => {
    setUser(null);
    setToken(null);
    setGithubConnected(false);
    setGithubUser(null);
    setRoadmaps({});
    setActiveRoadmapId(null);
    // Reset analytical mutations to default state on logout
    setRepositories(INITIAL_REPOSITORIES);
  };

  const connectToGitHub = async (pat: string) => {
    setIsLoading(true);
    try {
      const userProfile = await mockConnectGitHub(pat);
      setGithubUser(userProfile);
      setGithubConnected(true);
      return userProfile;
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectFromGitHub = () => {
    setGithubUser(null);
    setGithubConnected(false);
  };

  const analyzeRepository = async (repoId: string) => {
    // We do NOT toggle global isLoading so that the repo listing screen can
    // manage its own detailed inline loading card state and not block the whole screen!
    try {
      await mockAnalyzeRepo(repoId);
      
      setRepositories((prevRepos) =>
        prevRepos.map((repo) =>
          repo.id === repoId ? { ...repo, is_analyzed: true } : repo
        )
      );

      // Seed repo-specific welcome AI message
      const repoItem = repositories.find((r) => r.id === repoId);
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
    const repoItem = repositories.find((r) => r.id === repoId);
    
    // 1. Create and append User Message
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

    // 2. Fetch AI feedback response
    try {
      const aiResponse = await mockSendMessage(messageText, {
        repoId: repoId,
        repoName: repoItem?.name,
      });

      setChatHistory((prevChats) => {
        const currentHistory = prevChats[activeRepoId] || [];
        return {
          ...prevChats,
          [activeRepoId]: [...currentHistory, aiResponse],
        };
      });
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `msg_error_${Date.now()}`,
        text: 'Có lỗi xảy ra khi liên kết với AI Mentor. Vui lòng kiểm tra và gửi lại.',
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
      const repoItem = repositories.find((r) => r.id === repoId);
      const repoName = repoItem ? repoItem.name : 'dự án';
      const repoLang = repoItem ? repoItem.language : 'TypeScript';
      const roadmapData = await mockGenerateRoadmap(repoId, repoName, repoLang);
      
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

    const completedCount = updatedSteps.filter(s => s.status === 'completed').length;
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
        token,
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
