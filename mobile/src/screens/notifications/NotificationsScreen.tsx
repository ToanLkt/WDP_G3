import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Inbox,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../../theme';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CustomAlert } from '../../components/ui/CustomAlert';
import { getApiErrorMessage } from '../../api/client';
import { notificationApi } from '../../api/notification';
import { useTabBarAwareScroll } from '../../hooks/useTabBarAwareScroll';
import type { NotificationItem } from '../../types';

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const defaultPagination: Pagination = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
};

type NotificationMeta = {
  label: string;
  icon: any;
  tone: string;
  badge: 'primary' | 'success' | 'info';
};

const getNotificationMeta = (item: NotificationItem): NotificationMeta | null => {
  const text = `${item.type} ${item.title} ${item.message}`.toLowerCase();
  if (text.includes('roadmap') || text.includes('lộ trình')) {
    if (
      text.includes('complete') ||
      text.includes('completed') ||
      text.includes('finish') ||
      text.includes('hoàn thành')
    ) {
      return {
        label: 'Roadmap hoàn thành',
        icon: CheckCircle2,
        tone: 'rgba(16, 185, 129, 0.1)',
        badge: 'success',
      };
    }
    if (
      text.includes('create') ||
      text.includes('created') ||
      text.includes('generate') ||
      text.includes('tạo')
    ) {
      return {
        label: 'Roadmap đã tạo',
        icon: Sparkles,
        tone: 'rgba(99, 102, 241, 0.1)',
        badge: 'info',
      };
    }
  }
  if (
    text.includes('repository') ||
    text.includes('repo') ||
    text.includes('github') ||
    text.includes('analysis') ||
    text.includes('phân tích')
  ) {
    return {
      label: 'Repository',
      icon: GitBranch,
      tone: 'rgba(6, 182, 212, 0.1)',
      badge: 'primary',
    };
  }
  return null;
};

const normalizeNotification = (payload: unknown): NotificationItem => {
  const item =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return {
    id: String(item.id ?? item._id ?? item.notificationId ?? Math.random().toString()),
    title: String(item.title ?? item.subject ?? 'Thông báo'),
    message: String(item.message ?? item.content ?? item.description ?? ''),
    type: String(item.type ?? 'SYSTEM'),
    read: Boolean(item.read ?? item.isRead),
    createdAt:
      typeof item.createdAt === 'string'
        ? item.createdAt
        : typeof item.created_at === 'string'
        ? item.created_at
        : undefined,
  };
};

const extractItems = (payload: unknown) => {
  if (Array.isArray(payload)) return payload;
  const record =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.notifications)
    ? record.notifications
    : [];
};

const extractPagination = (payload: unknown): Pagination => {
  const record =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const pagination =
    record.pagination && typeof record.pagination === 'object'
      ? (record.pagination as Record<string, unknown>)
      : {};
  return {
    page: Number(pagination.page ?? defaultPagination.page),
    limit: Number(pagination.limit ?? defaultPagination.limit),
    total: Number(pagination.total ?? defaultPagination.total),
    totalPages: Number(pagination.totalPages ?? defaultPagination.totalPages),
  };
};

const formatDate = (value?: string) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return value;
  }
};

export const NotificationsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { tabBarPaddingBottom } = useTabBarAwareScroll();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>(defaultPagination);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Dialog State
  const [alertDialog, setAlertDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    onConfirm: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {},
  });

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

  const fetchNotifications = async (nextPage = page) => {
    setIsLoading(true);
    setError('');
    try {
      const payload = await notificationApi.getMine({
        page: nextPage,
        limit: defaultPagination.limit,
      });
      const norm = extractItems(payload)
        .map(normalizeNotification)
        .filter((item) => getNotificationMeta(item) !== null);
      setItems(norm);
      setPagination(extractPagination(payload));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications(page);
  }, [page]);

  const goToPage = (nextPage: number) => {
    if (nextPage < 1) return;
    if (pagination.totalPages > 0 && nextPage > pagination.totalPages) return;
    setPage(nextPage);
  };

  const markAsRead = async (item: NotificationItem) => {
    if (item.read || isUpdatingId) return;
    setIsUpdatingId(item.id);
    try {
      await notificationApi.markAsRead(item.id);
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry))
      );
      setAlertDialog({
        visible: true,
        title: 'Thành công',
        message: 'Đã đánh dấu thông báo đã đọc.',
        type: 'success',
        onConfirm: () => setAlertDialog((prev) => ({ ...prev, visible: false })),
      });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsUpdatingId(null);
    }
  };

  const removeNotification = async (item: NotificationItem) => {
    if (isUpdatingId) return;
    setIsUpdatingId(item.id);
    try {
      await notificationApi.remove(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setAlertDialog({
        visible: true,
        title: 'Thành công',
        message: 'Đã xóa thông báo.',
        type: 'success',
        onConfirm: () => setAlertDialog((prev) => ({ ...prev, visible: false })),
      });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsUpdatingId(null);
    }
  };

  const listHeader = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>Thông báo</Text>
          <Text style={styles.subtitle}>
            Theo dõi roadmap được tạo, roadmap đã hoàn thành và các cập nhật.
          </Text>
        </View>
      </View>
      <View style={styles.filterRow}>
        <Badge
          label={`${unreadCount} chưa đọc`}
          variant={unreadCount ? 'warning' : 'muted'}
        />
        <Button
          title="Làm mới"
          onPress={() => fetchNotifications(page)}
          loading={isLoading}
          fullWidth={false}
          style={styles.refreshBtn}
          icon={<RefreshCw size={14} color={theme.colors.textPrimary} />}
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {isLoading && items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Đang tải thông báo...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarPaddingBottom }]}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => fetchNotifications(page)}
              tintColor={theme.colors.secondary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Inbox size={48} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>Chưa có thông báo</Text>
              <Text style={styles.emptySubtitle}>
                Thông báo về roadmap và repository sẽ xuất hiện tại đây.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = getNotificationMeta(item);
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <Card style={styles.itemCard} padded={false}>
                <View style={styles.itemRow}>
                  <View style={[styles.iconBox, { backgroundColor: meta.tone }]}>
                    <Icon size={20} color={meta.badge === 'success' ? theme.colors.success : theme.colors.primaryLight} />
                  </View>
                  <View style={styles.contentCol}>
                    <View style={styles.titleMeta}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Badge label={meta.label} variant={item.read ? 'muted' : meta.badge} />
                      {!item.read && <View style={styles.unreadDot} />}
                    </View>
                    {item.message ? (
                      <Text style={styles.itemMsg}>{item.message}</Text>
                    ) : null}
                    {item.createdAt ? (
                      <Text style={styles.itemTime}>{formatDate(item.createdAt)}</Text>
                    ) : null}
                  </View>
                  <View style={styles.actionCol}>
                    {!item.read && (
                      <TouchableOpacity
                        onPress={() => markAsRead(item)}
                        style={styles.actionBtn}
                        disabled={isUpdatingId === item.id}
                      >
                        <CheckCircle2 size={16} color={theme.colors.success} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => removeNotification(item)}
                      style={styles.actionBtn}
                      disabled={isUpdatingId === item.id}
                    >
                      <Trash2 size={16} color={theme.colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            );
          }}
        />
      )}

      {pagination.total > 0 && (
        <View style={styles.paginationRow}>
          <Text style={styles.paginationText}>
            Trang {pagination.page} / {Math.max(pagination.totalPages, 1)}
          </Text>
          <View style={styles.pageButtons}>
            <Button
              title="Trước"
              variant="outline"
              fullWidth={false}
              disabled={pagination.page <= 1}
              onPress={() => goToPage(pagination.page - 1)}
              icon={<ChevronLeft size={16} color={theme.colors.textPrimary} />}
              style={styles.pageBtn}
            />
            <Button
              title="Sau"
              variant="outline"
              fullWidth={false}
              disabled={pagination.totalPages === 0 || pagination.page >= pagination.totalPages}
              onPress={() => goToPage(pagination.page + 1)}
              style={styles.pageBtn}
            />
          </View>
        </View>
      )}

      <CustomAlert
        visible={alertDialog.visible}
        title={alertDialog.title}
        message={alertDialog.message}
        type={alertDialog.type}
        onConfirm={alertDialog.onConfirm}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  header: {
    marginBottom: theme.spacing.md,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  refreshBtn: {
    height: 36,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
  emptyContainer: {
    paddingVertical: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    padding: theme.spacing.md,
    borderRadius: theme.roundness.sm,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.sizes.sm,
  },
  itemCard: {
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: theme.roundness.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentCol: {
    flex: 1,
    gap: 4,
  },
  titleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  itemTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.secondary,
  },
  itemMsg: {
    fontSize: theme.typography.sizes.xs + 1,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  itemTime: {
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  actionCol: {
    gap: 8,
    alignItems: 'center',
  },
  actionBtn: {
    padding: 6,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: '#18181B',
  },
  paginationText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
  },
  pageButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  pageBtn: {
    height: 36,
  },
});
