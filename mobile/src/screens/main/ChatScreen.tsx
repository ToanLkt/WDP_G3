import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity, TextInput } from 'react-native';
import { Send, Terminal, Sparkles, MessageSquare } from 'lucide-react-native';
import { useRoute, useNavigation } from '@react-navigation/native';

import { theme } from '../../theme/theme';
import { useApp } from '../../context/AppContext';
import { Badge } from '../../components/common/Badge';

export const ChatScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  
  // Destructure optional context from navigation route
  const { repoId, repoName } = route.params || {};
  const activeRepoId = repoId || 'general';

  const { chatHistory, sendMessageToAI, repositories } = useApp();
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // Get active history
  const activeHistory = chatHistory[activeRepoId] || [];

  // Seed default chat history on mount if needed
  useEffect(() => {
    // Scroll to bottom on load
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150);
  }, [activeHistory]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;
    setInputText('');
    setIsTyping(true);
    
    try {
      await sendMessageToAI(textToSend.trim(), repoId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const getSuggestedChips = () => {
    if (repoId) {
      return [
        { label: 'Dự án này viết vào CV thế nào?', query: `Dự án ${repoName} viết vào CV của tôi thế nào cho chuyên nghiệp?` },
        { label: 'Tôi mạnh ở điểm gì?', query: 'Phân tích điểm mạnh kỹ thuật của tôi qua dự án này.' },
        { label: 'Dự án này còn thiếu gì?', query: 'Repo này còn thiếu những tiêu chuẩn nào cần bổ sung?' },
      ];
    }
    return [
      { label: 'Cách viết CV lập trình viên', query: 'Hướng dẫn tôi cách viết CV cho lập trình viên ấn tượng.' },
      { label: 'Điểm mạnh kỹ thuật của tôi', query: 'Phân tích điểm mạnh kỹ thuật của tôi qua các repository.' },
      { label: 'Bổ sung gì cho code sạch hơn?', query: 'Làm thế nào để tôi cải thiện kỹ năng viết code sạch và module hóa?' },
    ];
  };

  const renderMessageItem = ({ item }: { item: any }) => {
    const isAi = item.sender === 'ai';
    return (
      <View style={[styles.bubbleWrapper, isAi ? styles.aiWrapper : styles.userWrapper]}>
        {isAi && (
          <View style={styles.aiAvatar}>
            <Sparkles size={13} color={theme.colors.secondaryLight} />
          </View>
        )}
        <View style={[
          styles.bubble,
          isAi ? styles.aiBubble : styles.userBubble
        ]}>
          <Text style={[styles.bubbleText, isAi ? styles.aiText : styles.userText]}>
            {item.text}
          </Text>
          <Text style={styles.timestampText}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* 1. Context Title Banner */}
      {repoId ? (
        <View style={styles.contextBanner}>
          <View style={styles.contextLeft}>
            <Terminal size={14} color={theme.colors.secondary} style={{ marginRight: 6 }} />
            <Text style={styles.contextLabel} numberOfLines={1}>
              Active Context: <Text style={{ color: theme.colors.secondary }}>{repoName}</Text>
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => navigation.setParams({ repoId: undefined, repoName: undefined })}
            activeOpacity={0.7}
          >
            <Badge label="Reset General" variant="muted" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.contextBanner}>
          <View style={styles.contextLeft}>
            <MessageSquare size={14} color={theme.colors.primaryLight} style={{ marginRight: 6 }} />
            <Text style={styles.contextLabel}>General AI Consultation</Text>
          </View>
        </View>
      )}

      {/* 2. Messages List */}
      <FlatList
        ref={flatListRef}
        data={activeHistory}
        keyExtractor={(item) => item.id}
        renderItem={renderMessageItem}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={
          isTyping ? (
            <View style={styles.typingContainer}>
              <View style={styles.aiAvatar}>
                <Sparkles size={13} color={theme.colors.secondaryLight} />
              </View>
              <View style={styles.typingBubble}>
                <Text style={styles.typingText}>AI Mentor is thinking...</Text>
              </View>
            </View>
          ) : null
        }
      />

      {/* 3. Suggested Prompt Chips */}
      <View style={styles.chipsSection}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={getSuggestedChips()}
          keyExtractor={(item, index) => String(index)}
          contentContainerStyle={styles.chipsContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.chipBtn}
              onPress={() => handleSend(item.query)}
              disabled={isTyping}
              activeOpacity={0.8}
            >
              <Text style={styles.chipText}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* 4. TextInput Bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          placeholder="Ask AI Mentor anything..."
          placeholderTextColor={theme.colors.textMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
          editable={!isTyping}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
          onPress={() => handleSend(inputText)}
          disabled={!inputText.trim() || isTyping}
          activeOpacity={0.8}
        >
          <Send size={16} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  contextLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: theme.spacing.md,
  },
  contextLabel: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.medium,
  },
  messagesList: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  bubbleWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: theme.spacing.md,
    maxWidth: '85%',
  },
  aiWrapper: {
    alignSelf: 'flex-start',
  },
  userWrapper: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  aiAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
    marginBottom: 2,
  },
  bubble: {
    borderRadius: theme.roundness.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    ...theme.shadows.sm,
  },
  aiBubble: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 2,
  },
  userBubble: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 2,
  },
  bubbleText: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: theme.typography.lineHeights.sm + 2,
  },
  aiText: {
    color: theme.colors.textPrimary,
  },
  userText: {
    color: theme.colors.textPrimary,
  },
  timestampText: {
    fontSize: 9,
    color: theme.colors.textMuted,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  typingBubble: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.md,
    borderBottomLeftRadius: 2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
  },
  typingText: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },
  chipsSection: {
    backgroundColor: 'transparent',
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
  },
  chipsContent: {
    paddingHorizontal: theme.spacing.lg,
  },
  chipBtn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    marginRight: theme.spacing.sm,
  },
  chipText: {
    color: theme.colors.secondaryLight,
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.medium,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#0B0C10',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.md,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: Platform.OS === 'ios' ? 8 : 4,
    marginRight: theme.spacing.md,
    fontSize: theme.typography.sizes.sm,
    maxHeight: 80,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  sendBtnDisabled: {
    backgroundColor: theme.colors.surfaceLight,
  },
});
