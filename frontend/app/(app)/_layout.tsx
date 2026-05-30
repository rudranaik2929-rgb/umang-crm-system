import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Slot, useRouter, usePathname } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeContext';
import { Sidebar } from '../../src/components/Sidebar';
import { canAccess, defaultRouteFor, pageKeyFromPathname } from '../../src/lib/constants';

export default function AppLayout() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/' as any);
      return;
    }
    if (!user.role) {
      router.replace('/select-role' as any);
      return;
    }

    const pageKey = pageKeyFromPathname(pathname);
    if (pageKey && !canAccess(user.role, pageKey, user.email, user.allowed_pages)) {
      router.replace(defaultRouteFor(user.role, user.email, user.allowed_pages) as any);
    }
  }, [user, loading, router, pathname]);

  if (loading || !user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.shell, { backgroundColor: colors.background }]}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <View style={{ flex: 1, height: '100%' }}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', height: '100%' },
});
