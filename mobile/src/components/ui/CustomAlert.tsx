import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react-native';
import { theme } from '../../theme';

export type AlertType = 'info' | 'success' | 'warning' | 'error';

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  type?: AlertType;
  showCancel?: boolean;
  cancelText?: string;
  confirmText?: string;
  onCancel?: () => void;
  onConfirm: () => void;
}

export const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  type = 'info',
  showCancel = false,
  cancelText = 'Hủy',
  confirmText = 'Xác nhận',
  onCancel,
  onConfirm,
}) => {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={28} color={theme.colors.success} />;
      case 'warning':
        return <AlertTriangle size={28} color={theme.colors.warning} />;
      case 'error':
        return <AlertCircle size={28} color={theme.colors.error} />;
      case 'info':
      default:
        return <Info size={28} color={theme.colors.secondaryLight} />;
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel || onConfirm}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>{getIcon()}</View>
            <Text style={styles.title}>{title}</Text>
          </View>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            {showCancel && (
              <TouchableOpacity
                style={[styles.btn, styles.btnCancel]}
                onPress={onCancel}
                activeOpacity={0.8}
              >
                <Text style={styles.btnCancelText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, styles.btnConfirm]}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.btnConfirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#18181B',
    borderColor: '#27272A',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: theme.roundness.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCancel: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#27272A',
  },
  btnCancelText: {
    color: theme.colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  btnConfirm: {
    backgroundColor: '#6D28D9',
  },
  btnConfirmText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
