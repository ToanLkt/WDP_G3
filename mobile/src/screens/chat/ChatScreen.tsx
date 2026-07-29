import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Send, Sparkles, Plus, Menu, X, Bell, Trash2, Check, ChevronDown } from 'lucide-react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../../theme';
import { useApp } from '../../contexts/AppContext';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CustomAlert } from '../../components/ui/CustomAlert';
import { TAB_BAR_HEIGHT } from '../../contexts/TabBarScrollContext';
import {
  ChatMessage,
  ChatSession,
  createChatSession,
  fetchChatSessionDetail,
  fetchChatSessions,
  sendChatMessage,
  deleteChatSession,
  mergeChatMessages,
  type SendMessageResult,
} from '../../services/chat';
import {
  emitChatRead,
  emitChatTyping,
  joinChatSession,
  leaveChatSession,
  type ChatMessageCreatedEvent,
  type ChatSessionUpdatedEvent,
  type ChatTypingEvent,
} from '../../services/socket/chatSocket';
import { fetchMyAnalyses } from '../../services/analysis';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

const SUGGESTED_PROMPTS = [
  'Dựa trên GitHub của tôi, tôi nên học gì tiếp theo?',
  'Repository nào của tôi nên đưa vào portfolio?',
  'Tôi phù hợp Backend hay Fullstack hơn?',
  'Hãy gợi ý kế hoạch cải thiện commit và documentation.',
];

const toDisplayMessage = (message: ChatMessage) => message;

export const ChatScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  // Chỉ cách tab bar một chút — không dùng tabBarPaddingBottom (dành cho scroll list).
  const composerBottomPad = TAB_BAR_HEIGHT + theme.spacing.xl;
  const { githubConnected, repositories } = useApp();

  const { repoId, repoName } = route.params || {};

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [analyzedRepositories, setAnalyzedRepositories] = useState<Array<{
    id: string;
    name: string;
    role: string;
    score?: number;
  }>>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [selectedRepositoryId, setSelectedRepositoryId] = useState('');
  const [repositoryPickerExpanded, setRepositoryPickerExpanded] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [deleteConfirmSession, setDeleteConfirmSession] = useState<ChatSession | null>(null);
  /** True when the current session is in MANUAL (admin) mode */
  const [isManualMode, setIsManualMode] = useState(false);
  const [isAdminTyping, setIsAdminTyping] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const loadSessionMessages = useCallback(async (sessionId: string) => {
    const msgs = await fetchChatSessionDetail(sessionId);
    setMessages(msgs);
    scrollToBottom();
  }, [scrollToBottom]);

  const selectSession = useCallback(async (session: ChatSession) => {
    setCurrentSession(session);
    setIsManualMode(session.effectiveMode === 'MANUAL' || session.status === 'waiting_admin');
    setError(null);
    setSidebarVisible(false);
    navigation.setParams({ repoId: undefined, repoName: undefined });

    try {
      await loadSessionMessages(session.id);
    } catch {
      setMessages(session.messages ?? []);
    }
  }, [loadSessionMessages, navigation]);

  const loadSessions = useCallback(async (preferRepoName?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await fetchChatSessions();
      setSessions(list);

      if (preferRepoName) {
        const matched = list.find((s) => s.title.includes(preferRepoName));
        if (matched) {
          setCurrentSession(matched);
          setSidebarVisible(false);
          const msgs = await fetchChatSessionDetail(matched.id);
          setMessages(msgs);
          scrollToBottom();
          return list;
        }
      }

      if (list.length > 0) {
        const first = list[0];
        setCurrentSession(first);
        const msgs = await fetchChatSessionDetail(first.id);
        setMessages(msgs);
        scrollToBottom();
      }

      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải cuộc trò chuyện.');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [scrollToBottom]);

  useEffect(() => {
    loadSessions(repoName);
    fetchMyAnalyses()
      .then((items) => {
        setAnalysisCount(items.length);
        setAnalyzedRepositories(items
          .map((item) => ({
            id: item.repositoryId,
            name: item.repositoryName || item.repoName || item.repositoryId,
            role: item.careerDirection?.primary || 'Role chưa rõ',
            score: item.scores?.overallScore ?? item.scores?.overall,
          }))
          .filter((item) => Boolean(item.id)));
      })
      .catch(() => setAnalysisCount(0));
  }, [repoName, loadSessions]);

  useEffect(() => {
    const sessionId = currentSession?.id;
    if (!sessionId) return undefined;

    const socket = joinChatSession(sessionId);
    const joinAndMarkRead = () => {
      socket.emit(
        'chat:join',
        { sessionId },
        (ack?: { success?: boolean; error?: { message?: string; code?: string } }) => {
          if (!ack?.success) {
            const detail = ack?.error?.message || ack?.error?.code;
            setError(`Không thể tham gia cuộc trò chuyện realtime${detail ? ` (${detail})` : ''}.`);
            return;
          }
          emitChatRead(sessionId);
        },
      );
    };
    const handleMessageCreated = (event: ChatMessageCreatedEvent) => {
      if (event.sessionId && event.sessionId !== sessionId) return;
      const incoming = event.message;
      if (!incoming.content) return;

      const incomingMessage: ChatMessage = {
        id: String(incoming._id ?? incoming.id ?? `socket-${Date.now()}`),
        text: incoming.content,
        sender: incoming.senderType === 'ADMIN'
          ? 'admin'
          : incoming.senderType === 'USER' || incoming.role === 'user'
            ? 'user'
            : 'ai',
        timestamp: incoming.createdAt ?? incoming.timestamp ?? new Date().toISOString(),
      };

      setMessages((previous) => mergeChatMessages(previous, [incomingMessage]));
      if (incomingMessage.sender !== 'user') setIsSending(false);
      setCurrentSession((previous) => previous
        ? {
          ...previous,
          lastMessage: incomingMessage.text,
          lastMessageAt: incomingMessage.timestamp,
        }
        : previous);
      setSessions((previous) => previous.map((item) => item.id === sessionId
        ? { ...item, lastMessage: incomingMessage.text, lastMessageAt: incomingMessage.timestamp }
        : item));
      if (incomingMessage.sender !== 'user') scrollToBottom();
    };
    const handleSessionUpdated = (event: ChatSessionUpdatedEvent) => {
      if (event.sessionId && event.sessionId !== sessionId) return;
      const updated = event.session;
      setIsManualMode(updated.effectiveMode === 'MANUAL' || updated.status === 'waiting_admin');
      const patch = {
        ...(updated.title ? { title: updated.title } : {}),
        ...(updated.status ? { status: updated.status } : {}),
        ...(updated.mode !== undefined ? { mode: updated.mode } : {}),
        ...(updated.modeSource ? { modeSource: updated.modeSource } : {}),
        ...(updated.effectiveMode ? { effectiveMode: updated.effectiveMode } : {}),
        ...(updated.lastMessageAt !== undefined ? { lastMessageAt: updated.lastMessageAt } : {}),
        ...(updated.updatedAt ? { updatedAt: updated.updatedAt } : {}),
      };
      setCurrentSession((previous) => previous ? { ...previous, ...patch } : previous);
      setSessions((previous) => previous.map((item) => item.id === sessionId ? { ...item, ...patch } : item));
      if (updated.status === 'closed') setIsSending(false);
    };
    const handleConnectError = (error: Error & { data?: { code?: string; message?: string } }) => {
      const detail = error.data?.message || error.data?.code || error.message;
      setError(`Không thể kết nối realtime${detail ? ` (${detail})` : ''}. Bạn vẫn có thể gửi tin nhắn bình thường.`);
    };
    const handleTyping = (event: ChatTypingEvent) => {
      if (event.sessionId && event.sessionId !== sessionId) return;
      if (event.actorType === 'ADMIN') setIsAdminTyping(Boolean(event.isTyping));
    };
    const handleConnect = () => {
      setError(null);
      joinAndMarkRead();
    };

    socket.on('connect', handleConnect);
    socket.on('chat:message_created', handleMessageCreated);
    socket.on('chat:session_updated', handleSessionUpdated);
    socket.on('chat:read_updated', handleSessionUpdated);
    socket.on('chat:typing', handleTyping);
    socket.on('connect_error', handleConnectError);
    if (socket.connected) handleConnect();

    return () => {
      leaveChatSession(sessionId);
      socket.off('connect', handleConnect);
      socket.off('chat:message_created', handleMessageCreated);
      socket.off('chat:session_updated', handleSessionUpdated);
      socket.off('chat:read_updated', handleSessionUpdated);
      socket.off('chat:typing', handleTyping);
      socket.off('connect_error', handleConnectError);
      setIsAdminTyping(false);
    };
  }, [currentSession?.id, scrollToBottom]);

  useEffect(() => {
    setIsManualMode(currentSession?.effectiveMode === 'MANUAL' || currentSession?.status === 'waiting_admin');
  }, [currentSession?.effectiveMode, currentSession?.status]);

  const openCreateSession = () => {
    setNewSessionTitle('');
    setSelectedRepositoryId('');
    setRepositoryPickerExpanded(false);
    setCreateModalVisible(true);
  };

  const handleCreateSession = async () => {
    const title = newSessionTitle.trim();
    if (!title) return;

    setIsLoading(true);
    setError(null);
    try {
      const session = await createChatSession(title, selectedRepositoryId || undefined);
      setSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)]);
      setCurrentSession(session);
      setMessages([]);
      setSidebarVisible(false);
      setCreateModalVisible(false);
      navigation.setParams({ repoId: undefined, repoName: undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo cuộc trò chuyện.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = (session: ChatSession) => {
    setDeleteConfirmSession(session);
  };

  const confirmDeleteSession = async () => {
    const session = deleteConfirmSession;
    if (!session) return;

    setDeleteConfirmSession(null);
    setDeletingSessionId(session.id);
    try {
      await deleteChatSession(session.id);
      const remaining = sessions.filter((item) => item.id !== session.id);
      setSessions(remaining);
      if (currentSession?.id === session.id) {
        const next = remaining[0];
        if (next) {
          await selectSession(next);
        } else {
          setCurrentSession(null);
          setMessages([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa cuộc trò chuyện.');
    } finally {
      setDeletingSessionId(null);
    }
  };

  const ensureSession = async (): Promise<ChatSession> => {
    if (currentSession?.id) return currentSession;

    if (repoId && repoName) {
      const session = await createChatSession(`Tư vấn repo ${repoName}`);
      setSessions((prev) => [session, ...prev]);
      setCurrentSession(session);
      return session;
    }

    const session = await createChatSession('Tư vấn GitHub của tôi');
    setSessions((prev) => [session, ...prev]);
    setCurrentSession(session);
    return session;
  };

  const handleSend = async (textToSend?: string) => {
    const content = (textToSend ?? inputText).trim();
    if (!content || isSending) return;

    setInputText('');
    setIsSending(true);
    setError(null);

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      text: content,
      sender: 'user',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    scrollToBottom();

    try {
      const session = await ensureSession();
      const result = await sendChatMessage(session.id, content);

      // Update mode tracking
      setIsManualMode(result.effectiveMode === 'MANUAL' || result.status === 'waiting_admin');

      // Replace the optimistic local user message with the server message. The
      // same server message can also arrive through Socket.IO, so merge by id.
      setMessages((previous) => mergeChatMessages(
        previous.filter((message) => message.id !== optimistic.id),
        [result.userMessage],
      ));

      if (result.assistantMessage) {
        setMessages((prev) => mergeChatMessages(prev, [result.assistantMessage!]));
        scrollToBottom();
        setSessions((prev) =>
          prev.map((s) =>
            s.id === session.id
              ? { ...s, lastMessage: result.assistantMessage!.text, title: s.title || session.title }
              : s
          )
        );
      } else {
        // MANUAL mode: show a placeholder admin waiting message
        const waitingMsg: ChatMessage = {
          id: `waiting-${Date.now()}`,
          text: 'Tin nhắn của bạn đã được ghi nhận. Hỗ trợ viên sẽ phản hồi sớm.',
          sender: 'admin',
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, waitingMsg]);
        scrollToBottom();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Có lỗi khi gửi tin nhắn.';
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          text: message,
          sender: 'ai',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const renderAiAvatar = () => (
    <LinearGradient
      colors={['#6366F1', '#7C3AED']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.aiAvatarGradient}
    >
      <Sparkles size={14} color="#FFFFFF" />
    </LinearGradient>
  );

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isUser = item.sender === 'user';
    const isAdmin = item.sender === 'admin';
    const isAi = !isUser && !isAdmin;
    return (
      <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAi]}>
        {!isUser && renderAiAvatar()}
        <View style={[
          styles.bubble,
          isUser ? styles.userBubble : isAdmin ? styles.adminBubble : styles.aiBubble,
        ]}>
          {isAdmin && (
            <Text style={styles.adminLabel}>Hỗ trợ viên</Text>
          )}
          <Text style={[styles.bubbleText, isUser ? styles.userText : styles.aiText]}>{item.text}</Text>
          <Text style={[styles.timeText, isAi ? styles.timeAi : styles.timeUser]}>
            {formatRelativeTime(item.timestamp)}
          </Text>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <LinearGradient
        colors={['#6366F1', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.emptyIcon}
      >
        <Sparkles size={32} color="#FFFFFF" />
      </LinearGradient>
      <Text style={styles.emptyTitle}>Bắt đầu hỏi AI Mentor</Text>
      <Text style={styles.emptySubtitle}>
        Chat dựa trên repository, phân tích và ngữ cảnh GitHub của bạn.
      </Text>
      <View style={styles.promptGrid}>
        {SUGGESTED_PROMPTS.map((prompt) => (
          <TouchableOpacity
            key={prompt}
            style={styles.promptCard}
            onPress={() => setInputText(prompt)}
            activeOpacity={0.85}
          >
            <Text style={styles.promptText}>{prompt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const sessionTitle = currentSession?.title
    ?? (repoName ? `Tư vấn repo ${repoName}` : 'AI Mentor');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setSidebarVisible(true)} activeOpacity={0.8}>
          <Menu size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle} numberOfLines={1}>{sessionTitle}</Text>
          <Text style={styles.headerSubtitle} numberOfLines={2}>
            Chat dựa trên repository, phân tích và ngữ cảnh GitHub của bạn.
          </Text>
          {repoName ? <Badge label={`Context: ${repoName}`} variant="secondary" style={styles.contextBadge} /> : null}
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('NotificationsTab')} style={styles.notificationBtn}>
          <Bell size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {isManualMode && (
        <View style={styles.manualModeBanner}>
          <Text style={styles.manualModeBannerText}>
            🔔 Phiên này đang chờ hỗ trợ viên. AI sẽ không phản hồi cho đến khi được kích hoạt lại.
          </Text>
        </View>
      )}

      {isLoading && messages.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages.map(toDisplayMessage)}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          style={styles.messagesList}
          contentContainerStyle={[
            styles.messagesContent,
            messages.length === 0 && styles.messagesContentEmpty,
            { paddingBottom: theme.spacing.md },
          ]}
          onContentSizeChange={scrollToBottom}
          ListEmptyComponent={renderEmptyState}
          ListFooterComponent={
            isSending || isAdminTyping ? (
              <View style={styles.messageRow}>
                {renderAiAvatar()}
                <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
                  <ActivityIndicator size="small" color={theme.colors.textMuted} />
                  <Text style={styles.typingText}>
                    {isAdminTyping ? 'Hỗ trợ viên đang nhập...' : 'AI Mentor đang trả lời...'}
                  </Text>
                </View>
              </View>
            ) : null
          }
        />
      )}

      <View style={[styles.composerDock, { paddingBottom: composerBottomPad }]}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            placeholder="Nhập câu hỏi..."
            placeholderTextColor={theme.colors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            onChange={(event) => {
              if (currentSession?.id) emitChatTyping(currentSession.id, Boolean(event.nativeEvent.text.trim()));
            }}
            multiline
            maxLength={1000}
            editable={!isSending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || isSending) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!inputText.trim() || isSending}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={inputText.trim() && !isSending ? ['#8B5CF6', '#6D28D9'] : ['#334155', '#1E293B']}
              style={styles.sendBtnGradient}
            >
              <Send size={18} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={sidebarVisible} animationType="slide" transparent onRequestClose={() => setSidebarVisible(false)}>
        <View style={styles.modalRoot}>
          <View
            style={[styles.sidebar, { paddingTop: insets.top + theme.spacing.lg }]}
          >
            <View style={styles.sidebarHeader}>
              <Text style={styles.sidebarTitle}>AI Mentor</Text>
              <TouchableOpacity onPress={() => setSidebarVisible(false)} hitSlop={12}>
                <X size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Button
              title="Tạo cuộc trò chuyện"
              onPress={openCreateSession}
              loading={isLoading}
              icon={<Plus size={16} color={theme.colors.textPrimary} />}
            />

            <View style={styles.contextSection}>
              <Text style={styles.contextHeading}>NGỮ CẢNH AI</Text>
              <View style={styles.contextRow}>
                <Text style={styles.contextLabel}>GitHub</Text>
                <Badge label={githubConnected ? 'Đã kết nối' : 'Thiếu'} variant={githubConnected ? 'success' : 'muted'} />
              </View>
              <View style={styles.contextRow}>
                <Text style={styles.contextLabel}>Repos</Text>
                <Badge label={String(repositories.length)} variant={repositories.length ? 'secondary' : 'muted'} />
              </View>
              <View style={styles.contextRow}>
                <Text style={styles.contextLabel}>Phân tích</Text>
                <Badge label={String(analysisCount)} variant={analysisCount ? 'success' : 'muted'} />
              </View>
            </View>

            <Text style={styles.historyHeading}>Lịch sử trò chuyện</Text>
            <ScrollView style={styles.sessionList} showsVerticalScrollIndicator={false}>
              {sessions.length === 0 ? (
                <Text style={styles.emptySessions}>Chưa có cuộc trò chuyện.</Text>
              ) : (
                sessions.map((session) => {
                  const isActive = currentSession?.id === session.id;
                  return (
                    <View
                      key={session.id}
                      style={[styles.sessionItem, isActive && styles.sessionItemActive]}
                    >
                      <TouchableOpacity
                        style={styles.sessionMain}
                        onPress={() => selectSession(session)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.sessionTitle, isActive && styles.sessionTitleActive]} numberOfLines={1}>
                          {session.title}
                        </Text>
                        <Text style={styles.sessionTime}>{formatRelativeTime(session.createdAt)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteSessionButton}
                        onPress={() => handleDeleteSession(session)}
                        disabled={deletingSessionId === session.id}
                        hitSlop={8}
                      >
                        {deletingSessionId === session.id
                          ? <ActivityIndicator size="small" color={theme.colors.error} />
                          : <Trash2 size={15} color={theme.colors.textMuted} />}
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSidebarVisible(false)} />
        </View>
      </Modal>

      <Modal
        visible={createModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.createModalRoot}>
          <TouchableOpacity
            style={styles.createModalBackdrop}
            activeOpacity={1}
            onPress={() => setCreateModalVisible(false)}
          />
          <View style={styles.createModalCard}>
            <View style={styles.createModalHeader}>
              <Text style={styles.createModalTitle}>Tạo cuộc trò chuyện mới</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)} hitSlop={10}>
                <X size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.formLabel}>Tiêu đề</Text>
            <TextInput
              style={styles.createTitleInput}
              value={newSessionTitle}
              onChangeText={setNewSessionTitle}
              placeholder="Ví dụ: Tư vấn lộ trình Backend"
              placeholderTextColor={theme.colors.textMuted}
              autoFocus
              editable={!isLoading}
            />

            <Text style={[styles.formLabel, styles.contextPickerLabel]}>Ngữ cảnh tư vấn</Text>
            <View style={styles.contextPickerWrapper}>
            <TouchableOpacity
              style={styles.contextPickerTrigger}
              onPress={() => setRepositoryPickerExpanded((expanded) => !expanded)}
              activeOpacity={0.8}
            >
              <View style={styles.contextOptionText}>
                <Text style={styles.contextOptionTitle}>
                  {selectedRepositoryId
                    ? analyzedRepositories.find((item) => item.id === selectedRepositoryId)?.name || 'Repository đã chọn'
                    : 'Dùng phân tích mới nhất'}
                </Text>
                <Text style={styles.contextOptionHint}>
                  {selectedRepositoryId ? 'Bấm để đổi repository' : 'AI tự chọn dữ liệu phân tích gần nhất'}
                </Text>
              </View>
              <ChevronDown
                size={18}
                color={theme.colors.secondary}
                style={repositoryPickerExpanded ? styles.chevronExpanded : undefined}
              />
            </TouchableOpacity>
            {repositoryPickerExpanded && (
              <ScrollView
                style={styles.contextOptionsPanel}
                contentContainerStyle={styles.contextOptionsContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {selectedRepositoryId && (
                  <TouchableOpacity
                    style={styles.contextOption}
                    onPress={() => {
                      setSelectedRepositoryId('');
                      setRepositoryPickerExpanded(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.contextOptionText}>
                      <Text style={styles.contextOptionTitle}>Dùng phân tích mới nhất</Text>
                      <Text style={styles.contextOptionHint}>AI tự chọn dữ liệu phân tích gần nhất</Text>
                    </View>
                  </TouchableOpacity>
                )}
                {analyzedRepositories.map((repository) => (
                  <TouchableOpacity
                    key={repository.id}
                    style={[styles.contextOption, selectedRepositoryId === repository.id && styles.contextOptionSelected]}
                    onPress={() => {
                      setSelectedRepositoryId(repository.id);
                      setRepositoryPickerExpanded(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.contextOptionText}>
                      <Text style={styles.contextOptionTitle} numberOfLines={1}>{repository.name}</Text>
                      <Text style={styles.contextOptionHint} numberOfLines={1}>
                        {repository.role}{typeof repository.score === 'number' ? ` · ${Math.round(repository.score)}%` : ''}
                      </Text>
                    </View>
                    {selectedRepositoryId === repository.id && <Check size={18} color={theme.colors.secondary} />}
                  </TouchableOpacity>
                ))}
                {!analyzedRepositories.length && (
                  <Text style={styles.noContextText}>Chưa có repository được phân tích.</Text>
                )}
              </ScrollView>
            )}
            </View>

            <View style={styles.createModalActions}>
              <Button
                title="Hủy"
                variant="outline"
                fullWidth={false}
                onPress={() => setCreateModalVisible(false)}
                disabled={isLoading}
                style={styles.modalActionButton}
              />
              <Button
                title="Tạo"
                fullWidth={false}
                onPress={handleCreateSession}
                loading={isLoading}
                disabled={!newSessionTitle.trim()}
                style={styles.modalActionButton}
              />
            </View>
          </View>
        </View>
      </Modal>
      <CustomAlert
        visible={Boolean(deleteConfirmSession)}
        title="Xóa cuộc trò chuyện"
        message={`Bạn có chắc muốn xóa "${deleteConfirmSession?.title || 'cuộc trò chuyện này'}"?`}
        type="warning"
        showCancel
        cancelText="Hủy"
        confirmText="Xóa"
        onCancel={() => setDeleteConfirmSession(null)}
        onConfirm={confirmDeleteSession}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.roundness.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  headerTextBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.typography.sizes.md + 1,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textMuted,
    marginTop: 4,
    lineHeight: theme.typography.lineHeights.xs + 4,
  },
  contextBadge: {
    marginTop: theme.spacing.sm,
  },
  errorBanner: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.roundness.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.sizes.sm,
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  messagesContentEmpty: {
    flexGrow: 1,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  messageRowAi: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  messageRowUser: {
    width: '100%',
    maxWidth: '100%',
    justifyContent: 'flex-end',
  },
  aiAvatarGradient: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  bubble: {
    borderRadius: theme.roundness.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 4,
    maxWidth: '100%',
  },
  aiBubble: {
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: '#6366F1',
    borderBottomRightRadius: 4,
    maxWidth: '88%',
  },
  bubbleText: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: theme.typography.lineHeights.sm + 4,
  },
  aiText: {
    color: theme.colors.textPrimary,
  },
  userText: {
    color: '#FFFFFF',
  },
  timeText: {
    fontSize: 10,
    marginTop: 6,
  },
  timeAi: {
    color: theme.colors.textMuted,
  },
  timeUser: {
    color: 'rgba(255,255,255,0.75)',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typingText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  emptySubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  promptGrid: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  promptCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  promptText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.sm,
  },
  composerDock: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  textInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    backgroundColor: theme.colors.surfaceLight,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: theme.typography.sizes.sm,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: theme.roundness.sm,
    overflow: 'hidden',
  },
  sendBtnDisabled: {
    opacity: 0.7,
  },
  sendBtnGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  createModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  createModalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  createModalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.roundness.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  createModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  createModalTitle: {
    flex: 1,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  formLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  createTitleInput: {
    height: 46,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.typography.sizes.sm,
  },
  contextPickerLabel: {
    marginTop: theme.spacing.lg,
  },
  contextOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceLight,
  },
  contextPickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    borderRadius: theme.roundness.sm,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceLight,
  },
  contextPickerWrapper: {
    position: 'relative',
  },
  contextOptionsPanel: {
    maxHeight: 190,
    marginTop: theme.spacing.sm,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.sm,
    backgroundColor: theme.colors.surfaceLight,
  },
  contextOptionsContent: {
    paddingBottom: 2,
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  contextOptionSelected: {
    borderColor: theme.colors.secondary,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  contextOptionText: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  contextOptionTitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.medium,
  },
  contextOptionHint: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    marginTop: 3,
  },
  noContextText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
  },
  createModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  modalActionButton: {
    minWidth: 92,
  },
  sidebar: {
    width: '82%',
    maxWidth: 320,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  sidebarTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  notificationBtn: {
    padding: 8,
    marginRight: -8,
  },
  contextSection: {
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  contextHeading: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: theme.spacing.sm,
  },
  contextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  contextLabel: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
  },
  historyHeading: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  sessionList: {
    flex: 1,
  },
  emptySessions: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
    paddingVertical: theme.spacing.md,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.roundness.sm,
    marginBottom: 4,
  },
  sessionItemActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  sessionTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textSecondary,
  },
  sessionMain: {
    flex: 1,
  },
  deleteSessionButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: theme.spacing.xs,
  },
  sessionTitleActive: {
    color: theme.colors.secondaryLight,
    fontWeight: theme.typography.weights.bold,
  },
  sessionTime: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  adminBubble: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  adminLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F59E0B',
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  manualModeBanner: {
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: theme.roundness.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  manualModeBannerText: {
    fontSize: theme.typography.sizes.sm,
    color: '#F59E0B',
    lineHeight: 20,
  },
});
