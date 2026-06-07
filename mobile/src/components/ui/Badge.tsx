import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { theme } from '../../theme';

type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'muted';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'primary',
  style,
  textStyle,
}) => {
  const getBadgeColors = () => {
    switch (variant) {
      case 'primary':
        return {
          bg: 'rgba(124, 58, 237, 0.15)',
          border: 'rgba(124, 58, 237, 0.3)',
          text: theme.colors.primaryLight,
        };
      case 'secondary':
        return {
          bg: 'rgba(6, 182, 212, 0.15)',
          border: 'rgba(6, 182, 212, 0.3)',
          text: theme.colors.secondaryLight,
        };
      case 'success':
        return {
          bg: 'rgba(16, 185, 129, 0.12)',
          border: 'rgba(16, 185, 129, 0.3)',
          text: theme.colors.success,
        };
      case 'warning':
        return {
          bg: 'rgba(245, 158, 11, 0.12)',
          border: 'rgba(245, 158, 11, 0.3)',
          text: theme.colors.warning,
        };
      case 'error':
        return {
          bg: 'rgba(239, 104, 104, 0.12)',
          border: 'rgba(239, 104, 104, 0.3)',
          text: theme.colors.error,
        };
      case 'muted':
      default:
        return {
          bg: 'rgba(148, 163, 184, 0.1)',
          border: 'rgba(148, 163, 184, 0.2)',
          text: theme.colors.textSecondary,
        };
    }
  };

  const colors = getBadgeColors();

  return (
    <View style={[
      styles.badge, 
      { backgroundColor: colors.bg, borderColor: colors.border },
      style
    ]}>
      <Text
        style={[styles.badgeText, { color: colors.text }, textStyle]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs - 1,
    borderRadius: theme.roundness.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
