import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Modal } from 'react-native';
import { theme } from '../../theme/theme';

interface LoadingSpinnerProps {
  visible?: boolean;
  message?: string;
  overlay?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  visible = true,
  message = 'Loading...',
  overlay = false,
}) => {
  if (!visible) return null;

  const content = (
    <View style={overlay ? styles.overlayContainer : styles.inlineContainer}>
      <View style={styles.spinnerWrapper}>
        <ActivityIndicator size="large" color={theme.colors.secondary} />
        {message && <Text style={styles.messageText}>{message}</Text>}
      </View>
    </View>
  );

  if (overlay) {
    return (
      <Modal transparent visible={visible} animationType="fade">
        {content}
      </Modal>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(11, 12, 16, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    backgroundColor: 'transparent',
  },
  spinnerWrapper: {
    padding: theme.spacing.xl,
    borderRadius: theme.roundness.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.glowCyan,
  },
  messageText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily.medium,
    marginTop: theme.spacing.md,
    letterSpacing: 0.5,
  },
});
