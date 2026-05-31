import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'text';
  disabled?: boolean;
  loading?: boolean;
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
  style,
  textStyle,
  icon,
}) => {
  const isButtonDisabled = disabled || loading;

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
    <React.Fragment>
      {loading ? (
        <ActivityIndicator 
          size="small" 
          color={variant === 'outline' || variant === 'text' ? theme.colors.secondary : theme.colors.textPrimary} 
        />
      ) : (
        <React.Fragment>
          {icon && <React.Fragment>{icon}</React.Fragment>}
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
        </React.Fragment>
      )}
    </React.Fragment>
  );

  if (variant === 'primary' && !isButtonDisabled) {
    return (
      <TouchableOpacity 
        style={[styles.baseButton, style]} 
        onPress={onPress} 
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={['#8B5CF6', '#6D28D9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientContainer}
        >
          {renderContent()}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (variant === 'secondary' && !isButtonDisabled) {
    return (
      <TouchableOpacity 
        style={[styles.baseButton, style]} 
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
        getOutlineStyle(),
        variant === 'text' && styles.textButton,
        isButtonDisabled && styles.disabledButton,
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
    width: '100%',
  },
  gradientContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
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
