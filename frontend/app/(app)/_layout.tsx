import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Slot, useRouter, usePathname } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeContext';
import { Sidebar } from '../../src/components/Sidebar';
import { MobileBottomNav } from '../../src/components/MobileBottomNav';
import { MobileNavProvider, useMobileNav } from '../../src/components/MobileNavContext';
import { LocationPermissionBanner } from '../../src/components/LocationPermissionBanner';
import { shouldTrackEmployeeLocation } from '../../src/hooks/useEmployeeLocation';
import { hasSessionToken } from '../../src/lib/api';
import { canAccess, defaultRouteFor, pageKeyFromPathname } from '../../src/lib/constants';
import { useResponsive } from '../../src/hooks/useResponsive';

function AppShell() {
  const { user, loading, locationStatus, requestLocationAccess } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { isMobile } = useResponsive();
  const mobileNav = useMobileNav();

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
    const home = defaultRouteFor(user.role, user.email, user.allowed_pages);

    if (pageKey && !canAccess(user.role, pageKey, user.email, user.allowed_pages)) {
      router.replace(home as any);
    }
  }, [user, loading, router, pathname]);

  useEffect(() => {
    mobileNav?.closeDrawer();
  }, [pathname]);

  const sessionKnown = !!user || hasSessionToken();

  if (!sessionKnown && (loading || !user)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.shell, { backgroundColor: colors.background }]}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      {isMobile && mobileNav?.drawerOpen ? (
        <Sidebar
          collapsed={false}
          onToggle={() => {}}
          mobileOverlay
          onMobileClose={mobileNav.closeDrawer}
        />
      ) : null}
      <View style={[styles.main, isMobile && styles.mainMobile]}>
        {shouldTrackEmployeeLocation(user) ? (
          <LocationPermissionBanner status={locationStatus} onRequest={requestLocationAccess} />
        ) : null}
        <Slot />
      </View>
      {isMobile ? <MobileBottomNav onOpenMenu={() => mobileNav?.openDrawer()} /> : null}
    </View>
  );
}

export default function AppLayout() {
  return (
    <MobileNavProvider>
      <AppShell />
    </MobileNavProvider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', height: '100%' },
  main: { flex: 1, height: '100%' },
  mainMobile: { paddingBottom: 62, minWidth: 0 },
});
