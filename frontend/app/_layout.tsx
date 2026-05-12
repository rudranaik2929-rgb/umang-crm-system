import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { View, ActivityIndicator, Platform } from 'react-native';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { StatusBar } from 'expo-status-bar';

function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const { exchangeSession, refresh } = useAuth();
  const [bootstrapping, setBootstrapping] = useState(true);
  const { colors } = useTheme();

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        let sid: string | null = null;
        if (url.hash.includes('session_id=')) {
          const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
          sid = hashParams.get('session_id');
        }
        if (!sid) sid = url.searchParams.get('session_id');
        if (sid) {
          await exchangeSession(sid);
          // clean URL
          window.history.replaceState({}, '', url.pathname);
          await refresh();
        }
      }
      setBootstrapping(false);
    })();
  }, [exchangeSession, refresh]);

  if (bootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

function ThemedStatus() {
  const { themeName } = useTheme();
  return <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SessionBootstrap>
          <ThemedStatus />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
        </SessionBootstrap>
      </AuthProvider>
    </ThemeProvider>
  );
}
