import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { CrmNotification } from '../notifications/types';
import { PRIORITY_COLORS, TYPE_ICONS } from '../notifications/types';

function formatRelativeTime(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

interface Props {
  item: CrmNotification;
  onPress?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}

export function NotificationCard({ item, onPress, onDelete, compact }: Props) {
  const { colors } = useTheme();
  const icon = TYPE_ICONS[item.type] || 'notifications-outline';
  const priorityColor = PRIORITY_COLORS[item.priority || 'normal'] || colors.primary;
  const unread = !item.is_read;
  const meta = item.metadata as Record<string, string> | undefined;
  const subtitle = meta?.customer_name || meta?.phone || '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: unread ? colors.primary + '08' : colors.surface,
          borderColor: unread ? colors.primary + '35' : colors.border,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.995 : 1 }],
        },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: priorityColor + '18', borderColor: priorityColor + '40' }]}>
        <Ionicons name={icon as any} size={compact ? 18 : 20} color={priorityColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.time, { color: colors.textMuted }]}>{formatRelativeTime(item.created_at)}</Text>
        </View>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <Text
          style={[styles.message, { color: colors.textSecondary }]}
          numberOfLines={compact ? 2 : 4}
        >
          {item.message}
        </Text>
      </View>
      {unread ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
      {onDelete ? (
        <Pressable onPress={(e: any) => { e?.stopPropagation?.(); onDelete(); }} hitSlop={8} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '700' },
  time: { fontSize: 11 },
  subtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  message: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  deleteBtn: { padding: 4, marginTop: 2 },
});
