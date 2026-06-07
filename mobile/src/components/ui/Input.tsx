import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { Eye, EyeOff, Mail, Lock, Search, LucideIcon } from 'lucide-react-native';
import { theme } from '../../theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: LucideIcon;
  isPassword?: boolean;
  isEmail?: boolean;
  isSearch?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon: PropIcon,
  isPassword = false,
  isEmail = false,
  isSearch = false,
  style,
  ...props
}) => {
  const [secure, setSecure] = useState(isPassword);
  const [isFocused, setIsFocused] = useState(false);

  const getLeftIcon = (): React.ReactNode => {
    let SelectedIcon: LucideIcon | null = PropIcon || null;

    if (!SelectedIcon) {
      if (isPassword) SelectedIcon = Lock;
      else if (isEmail) SelectedIcon = Mail;
      else if (isSearch) SelectedIcon = Search;
    }

    if (SelectedIcon) {
      const iconColor = isFocused 
        ? theme.colors.secondary 
        : error 
          ? '#EF4444' 
          : '#888';
      return <SelectedIcon size={18} color={iconColor} style={styles.leftIcon} />;
    }

    return null;
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View
        style={[
          styles.inputContainer,
          error ? styles.inputError : undefined,
          isFocused ? { borderColor: theme.colors.borderFocused } : undefined,
        ]}
      >
        {getLeftIcon()}
        <TextInput
          {...props}
          style={[styles.input, style]}
          placeholderTextColor="#888"
          secureTextEntry={secure}
          autoCorrect={false}
          underlineColorAndroid="transparent"
          showSoftInputOnFocus={true}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />

        {isPassword && (
          <TouchableOpacity
            onPress={() => setSecure(!secure)}
            style={styles.eyeBtn}
          >
            {secure ? <EyeOff size={18} color="#888" /> : <Eye size={18} color="#FFF" />}
          </TouchableOpacity>
        )}
      </View>

      {!!error && (
        <Text style={styles.errorText}>
          {error}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    color: '#FFF',
    marginBottom: 6,
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 10,
    backgroundColor: '#1A1A1A',
    minHeight: 50,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    color: '#FFF',
    fontSize: 16,
    height: 50,
  },
  leftIcon: {
    marginRight: 10,
  },
  eyeBtn: {
    padding: 6,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    marginTop: 4,
    color: '#EF4444',
    fontSize: 12,
  },
});