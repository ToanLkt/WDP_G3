import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'text';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = true,
  style,
  textStyle,
  icon,
}) => {
  const isButtonDisabled = disabled || loading;

  const layoutStyle = fullWidth ? styles.fullWidth : undefined;

  const getOutlineStyle = () => {
    if (variant === 'outline') {
      return {
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      };
    }
    return {};
  };

  const renderContent = () => (
    <View style={[styles.contentRow, icon ? styles.contentRowWithIcon : undefined]}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'text' ? theme.colors.secondary : theme.colors.textPrimary}
        />
      ) : (
        <>
          {icon}
          <Text style={[
            styles.baseText,
            variant === 'primary' && styles.primaryText,
            variant === 'secondary' && styles.secondaryText,
            variant === 'outline' && styles.outlineText,
            variant === 'text' && styles.textVariantText,
            isButtonDisabled && styles.disabledText,
            textStyle,
          ]}>
            {title}
          </Text>
        </>
      )}
    </View>
  );

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        style={[styles.baseButton, layoutStyle, isButtonDisabled && styles.disabledTouchable, style]}
        onPress={onPress}
        disabled={isButtonDisabled}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={isButtonDisabled ? ['#5B21B6', '#4C1D95'] : ['#8B5CF6', '#6D28D9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradientContainer, isButtonDisabled && styles.gradientDisabled]}
        >
          {renderContent()}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (variant === 'secondary' && !isButtonDisabled) {
    return (
      <TouchableOpacity 
        style={[styles.baseButton, layoutStyle, style]} 
        onPress={onPress} 
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={['#06B6D4', '#0891B2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientContainer}
        >
          {renderContent()}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.baseButton,
        layoutStyle,
        getOutlineStyle(),
        variant === 'text' && styles.textButton,
        isButtonDisabled && styles.disabledButton,
        (variant === 'outline' || variant === 'text') && styles.outlineButton,
        style,
      ]}
      onPress={onPress}
      disabled={isButtonDisabled}
      activeOpacity={0.8}
    >
      {renderContent()}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseButton: {
    height: 48,
    borderRadius: theme.roundness.sm,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  gradientContainer: {
    flex: 1,
    width: '100%',
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
  },
  gradientDisabled: {
    opacity: 0.65,
  },
  disabledTouchable: {
    opacity: 0.9,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  contentRowWithIcon: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  outlineButton: {
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'stretch',
  },
  textButton: {
    backgroundColor: 'transparent',
    height: 40,
  },
  disabledButton: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
  },
  baseText: {
    fontSize: theme.typography.sizes.sm + 1,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.5,
  },
  primaryText: {
    color: theme.colors.textPrimary,
  },
  secondaryText: {
    color: theme.colors.textPrimary,
  },
  outlineText: {
    color: theme.colors.textPrimary,
  },
  textVariantText: {
    color: theme.colors.secondary,
  },
  disabledText: {
    color: theme.colors.textMuted,
  },
});
