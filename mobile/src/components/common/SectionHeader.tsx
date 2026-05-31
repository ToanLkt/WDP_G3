import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../theme/theme';

interface SectionHeaderProps {
  title: string;
  actionText?: string;
  onActionTextPress?: () => void;
  accentColor?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  actionText,
  onActionTextPress,
  accentColor = theme.colors.primary,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.leftWrapper}>
        <View style={[styles.indicator, { backgroundColor: accentColor }]} />
        <Text style={styles.titleText}>{title}</Text>
      </View>
      {actionText && onActionTextPress && (
        <TouchableOpacity onPress={onActionTextPress} activeOpacity={0.7}>
          <Text style={styles.actionText}>{actionText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: theme.spacing.md,
    width: '100%',
  },
  leftWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicator: {
    width: 4,
    height: 18,
    borderRadius: 2,
    marginRight: theme.spacing.sm,
  },
  titleText: {
    fontSize: theme.typography.sizes.md + 1,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    letterSpacing: 0.3,
  },
  actionText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.secondary,
    fontWeight: theme.typography.weights.medium,
  },
});
