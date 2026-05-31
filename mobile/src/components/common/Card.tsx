import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '../../theme/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  glow?: 'cyan' | 'violet' | 'none';
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  padded = true,
  glow = 'none',
}) => {
  const getGlowStyle = () => {
    if (glow === 'cyan') return theme.shadows.glowCyan;
    if (glow === 'violet') return theme.shadows.glowViolet;
    return null;
  };

  return (
    <View style={[
      styles.card,
      padded ? styles.padded : undefined,
      getGlowStyle(),
      style,
    ]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    overflow: 'hidden',
  },
  padded: {
    padding: 20,
  },
});