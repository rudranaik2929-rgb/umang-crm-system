import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useNotifications } from '../notifications/NotificationContext';

export function NotificationBell() {
  const { colors } = useTheme();
  const router = useRouter();
  const { unreadCount, refresh } = useNotifications();

  return (
    <Pressable
      testID="notification-bell"
      onPress={() => {
        refresh();
        router.push('/(app)/notifications' as any);
      }}
      style={[styles.bell, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
    >
      <Ionicons name="notifications-outline" size={20} color={colors.text} />
      {unreadCount > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.negative }]}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
