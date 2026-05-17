import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { View, ActivityIndicator, Platform } from 'react-native';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { StatusBar } from 'expo-status-bar';

function useWebPrivacyShield(user: any, themeName: string) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // 1. Inject global CSS to block text selection except in inputs
    const style = document.createElement('style');
    style.innerHTML = `
      * {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
      }
      input, textarea {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
    `;
    document.head.appendChild(style);

    // 2. Setup dynamic watermark
    let watermarkOverlay: HTMLDivElement | null = null;
    if (user) {
      const email = user.email || 'confidential';
      const role = user.role || 'Staff';
      const formattedDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const watermarkText = `Umang CRM — CONFIDENTIAL — ${email} (${role}) — ${formattedDate}`;
      const fillColor = themeName === 'dark' ? 'rgba(255, 255, 255, 0.038)' : 'rgba(0, 0, 0, 0.038)';
      
      const svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
          <text x="50%" y="50%" fill="${fillColor}" font-size="11" font-family="sans-serif" text-anchor="middle" transform="rotate(-28 200 150)">
            ${watermarkText}
          </text>
        </svg>
      `;
      const encodedSvg = encodeURIComponent(svgString);
      const watermarkUrl = `data:image/svg+xml;utf8,${encodedSvg}`;

      watermarkOverlay = document.createElement('div');
      watermarkOverlay.id = 'privacy-shield-watermark';
      watermarkOverlay.style.position = 'fixed';
      watermarkOverlay.style.top = '0';
      watermarkOverlay.style.left = '0';
      watermarkOverlay.style.width = '100vw';
      watermarkOverlay.style.height = '100vh';
      watermarkOverlay.style.pointerEvents = 'none';
      watermarkOverlay.style.zIndex = '99999';
      watermarkOverlay.style.backgroundImage = `url("${watermarkUrl}")`;
      document.body.appendChild(watermarkOverlay);
    }

    // 3. Prevent right-click context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      alert("🔒 PRIVACY SHIELD: Right-click context menu is disabled for security.");
    };

    // 4. Prevent dragging content
    const handleDrag = (e: DragEvent) => {
      e.preventDefault();
    };

    // 5. Prevent copying text
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      alert("🔒 PRIVACY SHIELD: Copying CRM data is disabled for security.");
    };

    // 6. Intercept key combinations (Print, DevTools, PrintScreen)
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block F12 and Ctrl+Shift+I / Cmd+Opt+I (Developer Tools)
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.metaKey && e.altKey && e.key === 'i')
      ) {
        e.preventDefault();
        alert("🔒 PRIVACY SHIELD: Developer tools access is blocked.");
        return;
      }

      // Block Ctrl+P / Cmd+P (Print Page)
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        alert("🔒 PRIVACY SHIELD: Printing dashboard pages is disabled.");
        return;
      }

      // Block Ctrl+S / Cmd+S (Save Page)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        alert("🔒 PRIVACY SHIELD: Saving page contents locally is disabled.");
        return;
      }

      // Intercept physical PrintScreen key
      if (e.key === 'PrintScreen') {
        navigator.clipboard.writeText('');
        alert("🔒 PRIVACY SHIELD: Screenshot captured. Clipboard cleared for privacy.");
      }
    };

    // 7. Blur screen on tab/window unfocus (Switcher Security Mask)
    const handleBlur = () => {
      const existing = document.getElementById('privacy-shield-blur-mask');
      if (existing) return;

      const mask = document.createElement('div');
      mask.id = 'privacy-shield-blur-mask';
      mask.style.position = 'fixed';
      mask.style.top = '0';
      mask.style.left = '0';
      mask.style.width = '100vw';
      mask.style.height = '100vh';
      mask.style.backdropFilter = 'blur(25px)';
      mask.style.webkitBackdropFilter = 'blur(25px)';
      mask.style.backgroundColor = 'rgba(20, 12, 7, 0.6)';
      mask.style.zIndex = '999999';
      mask.style.display = 'flex';
      mask.style.flexDirection = 'column';
      mask.style.alignItems = 'center';
      mask.style.justifyContent = 'center';
      mask.style.gap = '12px';

      const title = document.createElement('h2');
      title.innerText = '🔒 Privacy Shield Active';
      title.style.color = '#FDFBF9';
      title.style.fontFamily = 'sans-serif';
      title.style.margin = '0';
      title.style.fontSize = '24px';
      
      const sub = document.createElement('p');
      sub.innerText = 'Click anywhere on this screen to refocus and unlock the CRM';
      sub.style.color = '#A38B7D';
      sub.style.fontFamily = 'sans-serif';
      sub.style.margin = '0';
      sub.style.fontSize = '13px';

      mask.appendChild(title);
      mask.appendChild(sub);
      
      // Unlock on click
      mask.addEventListener('click', () => {
        mask.remove();
        window.focus();
      });

      document.body.appendChild(mask);
    };

    const handleFocus = () => {
      const mask = document.getElementById('privacy-shield-blur-mask');
      if (mask) mask.remove();
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('dragstart', handleDrag);
    document.addEventListener('copy', handleCopy);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      style.remove();
      if (watermarkOverlay) watermarkOverlay.remove();
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('dragstart', handleDrag);
      document.removeEventListener('copy', handleCopy);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, themeName]);
}

function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const { exchangeSession, refresh, user } = useAuth();
  const [bootstrapping, setBootstrapping] = useState(true);
  const { colors, themeName } = useTheme();

  useWebPrivacyShield(user, themeName);

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

