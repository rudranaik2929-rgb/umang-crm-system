import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../auth/AuthContext';
import { visibleNavFor } from '../lib/constants';

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  dashboard: 'speedometer-outline',
  person: 'person-circle-outline',
  pipeline: 'git-branch-outline',
  assign: 'person-add-outline',
  phone: 'call-outline',
  visit: 'location-outline',
  booking: 'document-text-outline',
  bank: 'business-outline',
  team: 'people-outline',
  archive: 'archive-outline',
  tracking: 'map-outline',
  integrations: 'git-network-outline',
  notifications: 'notifications-outline',
};

const SHORT_LABELS: Record<string, string> = {
  'my-dashboard': 'Home',
  telecaller: 'Calls',
  'sales-executive': 'Sales',
  notifications: 'Alerts',
  pipeline: 'Pipeline',
  'assign-leads': 'Assign',
  negative: 'Not Int.',
  bookings: 'Bookings',
  loans: 'Loans',
  dashboard: 'Dashboard',
  employees: 'Team',
  broker: 'Broker',
  integrations: 'Integrate',
  tracking: 'Tracking',
};

interface Props {
  onOpenMenu: () => void;
}

const MAX_TABS = 4;

export function MobileBottomNav({ onOpenMenu }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const items = visibleNavFor(user?.role, user?.email, user?.allowed_pages);
  const primary = items.slice(0, MAX_TABS);
  const hasMore = items.length > MAX_TABS;

  const isActive = (path: string) => pathname?.endsWith(path.split('/').pop() || '');

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}
      testID="mobile-bottom-nav"
    >
      {primary.map((item) => {
        const active = isActive(item.path);
        const icon = ICON_MAP[item.icon] || 'ellipse-outline';
        return (
          <Pressable
            key={item.key}
            onPress={() => router.push(item.path as any)}
            style={styles.tab}
            testID={`mobile-nav-${item.key}`}
          >
            <Ionicons name={icon} size={22} color={active ? colors.primary : colors.textMuted} />
            <Text
              numberOfLines={1}
              style={[styles.label, { color: active ? colors.primary : colors.textMuted }]}
            >
              {SHORT_LABELS[item.key] || item.label.split(' ')[0]}
            </Text>
          </Pressable>
        );
      })}
      {hasMore ? (
        <Pressable onPress={onOpenMenu} style={styles.tab} testID="mobile-nav-more">
          <Ionicons name="menu" size={22} color={colors.textSecondary} />
          <Text style={[styles.label, { color: colors.textMuted }]}>More</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'web' ? 10 : 8,
    paddingHorizontal: 4,
    ...(Platform.OS === 'web'
      ? { paddingBottom: 'max(10px, env(safe-area-inset-bottom))' as any }
      : {}),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 48,
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});
