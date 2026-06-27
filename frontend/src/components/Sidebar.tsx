import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../auth/AuthContext';
import { visibleNavFor, ROLES } from '../lib/constants';
import { Ionicons } from '@expo/vector-icons';

const ICON_MAP: Record<string, any> = {
  dashboard: 'speedometer-outline',
  person: 'person-circle-outline',
  admin: 'shield-checkmark-outline',
  pipeline: 'git-branch-outline',
  assign: 'person-add-outline',
  phone: 'call-outline',
  visit: 'location-outline',
  booking: 'document-text-outline',
  bank: 'business-outline',
  wa: 'logo-whatsapp',
  team: 'people-outline',
  archive: 'archive-outline',
  tracking: 'map-outline',
  integrations: 'git-network-outline',
  notifications: 'notifications-outline',
};

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const role = ROLES.find((r) => r.key === user?.role);
  const items = visibleNavFor(user?.role, user?.email, user?.allowed_pages);

  return (
    <View style={[styles.wrap, {
      width: collapsed ? 76 : 264,
      backgroundColor: colors.sidebar,
      borderRightColor: colors.border,
    }]} testID="sidebar">
      <View style={[styles.brand, { borderBottomColor: colors.border }]}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={[styles.logoImage, collapsed && { width: 38, height: 38 }]}
          resizeMode="contain"
        />
        {!collapsed && (
          <View style={{ flex: 1 }}>
            <Text style={[styles.brandTitle, { color: colors.text }]}>Umang Hometech LLP</Text>
            <Text style={[styles.brandSub, { color: colors.textMuted }]}>Real Estate CRM</Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={onToggle}
        testID="sidebar-toggle"
        hitSlop={10}
        style={({ hovered }: any) => [
          styles.floatingToggle,
          {
            backgroundColor: hovered ? colors.primary : colors.surface,
            borderColor: hovered ? colors.primary : colors.border,
            right: -14,
          },
        ]}
      >
        {({ hovered }: any) => (
          <Ionicons
            name={collapsed ? 'chevron-forward' : 'chevron-back'}
            size={16}
            color={hovered ? '#fff' : colors.textSecondary}
          />
        )}
      </Pressable>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 12 }}>
        {!collapsed && (
          <Text style={[styles.section, { color: colors.textMuted }]}>WORKSPACE</Text>
        )}
        {items.map((item) => {
          const active = pathname?.endsWith(item.path.split('/').pop() || '');
          return (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.path as any)}
              testID={`nav-${item.key}`}
              style={({ hovered }: any) => [
                styles.navItem,
                {
                  backgroundColor: active ? colors.primary + '20' : (hovered ? colors.surfaceAlt : 'transparent'),
                  borderLeftColor: active ? colors.primary : 'transparent',
                  paddingHorizontal: collapsed ? 0 : 16,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                },
              ]}
            >
              <Ionicons
                name={ICON_MAP[item.icon] || 'ellipse-outline'}
                size={18}
                color={active ? colors.primary : colors.textSecondary}
              />
              {!collapsed && (
                <Text style={[styles.navLabel, {
                  color: active ? colors.text : colors.textSecondary,
                  fontWeight: active ? '600' : '500',
                }]}>
                  {item.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.userCard, { borderTopColor: colors.border }]}>
        {user?.picture ? (
          <Image source={{ uri: user.picture }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
        )}
        {!collapsed && (
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text numberOfLines={1} style={[styles.userName, { color: colors.text }]}>
              {user?.name || 'Guest'}
            </Text>
            <Text numberOfLines={1} style={[styles.userRole, { color: colors.textMuted }]}>
              {role?.label || 'Member'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: '100%',
    borderRightWidth: 1,
    flexDirection: 'column',
    position: 'relative',
    zIndex: 10,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 64,
    borderBottomWidth: 1,
    gap: 10,
  },
  logoImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  brandTitle: { fontSize: 14, fontWeight: '700' },
  brandSub: { fontSize: 11, marginTop: 1 },
  floatingToggle: {
    position: 'absolute',
    top: 72,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  section: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.4,
    paddingHorizontal: 18, marginBottom: 6, marginTop: 4,
  },
  navItem: {
    flexDirection: 'row', alignItems: 'center',
    height: 40, marginHorizontal: 8, marginVertical: 2,
    borderRadius: 8, gap: 12,
    borderLeftWidth: 3,
  },
  navLabel: { fontSize: 13 },
  navBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  navBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  userCard: {
    flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1,
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  userName: { fontSize: 13, fontWeight: '600' },
  userRole: { fontSize: 11, marginTop: 1 },
});
