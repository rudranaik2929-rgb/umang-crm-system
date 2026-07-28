import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView, Platform, Dimensions, TextInput, ActivityIndicator, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/auth/AuthContext';
import { defaultRouteFor } from '../src/lib/constants';
import { warmUpBackend } from '../src/lib/api';

const HERO_IMG = 'https://static.prod-images.emergentagent.com/jobs/bcbec8c6-82ba-422e-a9c5-02053dc9d61d/images/35dda4ad3fda80d98d3e686fde61d9fcf2b36147d133e43a32eed389dcf53913.png';

export default function Index() {
  const router = useRouter();
  const { user, loading, exchangeSession } = useAuth();
  const { colors, themeName, toggle } = useTheme();
  const { width } = Dimensions.get('window');
  const isWide = width >= 900;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginStatus, setLoginStatus] = useState<string | null>(null);
  const [shiftVisible, setShiftVisible] = useState(false);
  const [shiftDevice, setShiftDevice] = useState<string | undefined>();
  const [isShifting, setIsShifting] = useState(false);

  useEffect(() => {
    setLoginStatus('Connecting…');
    warmUpBackend().then((ok) => {
      setLoginStatus(ok ? null : 'Cannot reach server. Check your connection and try again.');
    });
  }, []);

  // Already signed in (valid session) → go to app; never show "Continue as …" bypass.
  useEffect(() => {
    if (loading || !user) return;
    if (!user.role) router.replace('/select-role' as any);
    else router.replace(defaultRouteFor(user.role, user.email, user.allowed_pages) as any);
  }, [user, loading, router]);

  const completeLogin = (loggedInUser: { role?: string | null; email: string; allowed_pages?: string[] | null }) => {
    setLoginStatus(null);
    setShiftVisible(false);
    if (!loggedInUser.role) router.replace('/select-role' as any);
    else router.replace(defaultRouteFor(loggedInUser.role, loggedInUser.email, loggedInUser.allowed_pages) as any);
  };

  const onLogin = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      alert('Please enter your email and password.');
      return;
    }

    setIsLoggingIn(true);
    setLoginStatus('Signing in…');
    try {
      await warmUpBackend(true);
      const result = await exchangeSession({
        email: trimmedEmail,
        password: trimmedPassword,
      });
      if (result.status === 'ok') {
        completeLogin(result.user);
      } else if (result.status === 'shift_required') {
        setLoginStatus(null);
        setShiftDevice(result.active_device);
        setShiftVisible(true);
      } else {
        setLoginStatus(null);
        alert('Invalid email or password. Use the login created by your manager.');
      }
    } catch (e: any) {
      setLoginStatus(e?.message || 'Could not sign in. Try again in a minute.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const onShift = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    setIsShifting(true);
    setLoginStatus('Shifting session…');
    try {
      const result = await exchangeSession({
        email: trimmedEmail,
        password: trimmedPassword,
        force_shift: true,
      });
      if (result.status === 'ok') {
        completeLogin(result.user);
      } else if (result.status === 'invalid') {
        setShiftVisible(false);
        alert('Invalid email or password. Use the login created by your manager.');
      } else {
        alert(result.message || 'Could not shift session. Try again.');
      }
    } catch (e: any) {
      setLoginStatus(e?.message || 'Could not shift session.');
    } finally {
      setIsShifting(false);
    }
  };

  const onEnquiry = () => router.push('/enquire' as any);

  // Redirect only when session exists — never block the login form while checking session.
  if (user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* LEFT — HERO */}
      {isWide && (
        <View style={styles.hero}>
          <Image source={{ uri: HERO_IMG }} style={styles.heroImg} />
          <View style={styles.heroOverlay}>
            <View style={styles.heroBrand}>
              <Image
                source={require('../assets/images/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.heroBrandTitle}>Umang Hometech LLP</Text>
            </View>
            <View style={{ flex: 1 }} />
            <Text style={styles.heroTitle}>Premium real estate{`\n`}workflow, end-to-end.</Text>
            <Text style={styles.heroSub}>
              From the first website enquiry to the keys in hand — orchestrate every department in a single elegant cockpit.
            </Text>
            <View style={styles.heroPills}>
              {['Telecaller', 'Sales Executive', 'Bookings', 'Loans'].map((t) => (
                <View key={t} style={styles.heroPill}>
                  <Text style={styles.heroPillText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* RIGHT — AUTH PANEL */}
      <ScrollView
        contentContainerStyle={styles.right}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.rightInner}>
          <View style={styles.topRow}>
            <View style={styles.brandRow}>
              <Image
                source={require('../assets/images/logo.png')}
                style={styles.logoImageSm}
                resizeMode="contain"
              />
              <Text style={[styles.brandText, { color: colors.text }]}>Umang Hometech LLP</Text>
            </View>
            <Pressable
              onPress={toggle}
              testID="landing-theme-toggle"
              style={[styles.themeBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            >
              <Ionicons name={themeName === 'dark' ? 'sunny-outline' : 'moon-outline'} size={16} color={colors.text} />
            </Pressable>
          </View>

          <View style={{ flex: 1, minHeight: 40 }} />

          <Text style={[styles.kicker, { color: colors.textMuted }]}>UMANG HOMETECH</Text>
          <Text style={[styles.headline, { color: colors.text }]}>Log in to Umang</Text>
          <Text style={[styles.subhead, { color: colors.textSecondary, marginBottom: 20 }]}>
            Enter the email and password provided by your manager. Each employee has a separate login.
          </Text>
          {loginStatus ? (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              {loginStatus}
            </Text>
          ) : null}

          <View style={{ width: '100%', gap: 12, marginBottom: 12 }}>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Email Address"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <View style={styles.passwordRow}>
              <TextInput
                testID="login-password"
                style={[styles.input, styles.passwordInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceAlt }]}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="current-password"
              />
              <Pressable
                testID="login-password-toggle"
                onPress={() => setShowPassword((v) => !v)}
                style={[styles.eyeBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={onLogin}
            disabled={isLoggingIn}
            testID="login-btn"
            style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: isLoggingIn ? 0.7 : 1 }]}
          >
            {isLoggingIn ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={[styles.primaryText, { color: '#fff' }]}>Log in to Umang</Text>
            )}
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Text style={[styles.subhead, { color: colors.textSecondary, marginBottom: 12 }]}>
            Are you a customer interested in a property?
          </Text>
          <Pressable
            onPress={onEnquiry}
            testID="public-enquiry-btn"
            style={[styles.outlineBtn, { borderColor: colors.primary }]}
          >
            <Ionicons name="paper-plane-outline" size={16} color={colors.primary} />
            <Text style={[styles.outlineText, { color: colors.primary }]}>Submit a property enquiry</Text>
          </Pressable>

          <View style={{ flex: 1 }} />
          <Text style={[styles.footer, { color: colors.textMuted }]}>
            © {new Date().getFullYear()} Umang Hometech LLP — Enterprise CRM
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={shiftVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !isShifting && setShiftVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Already logged in elsewhere</Text>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              This account is active on {shiftDevice || 'another device'}. Shift moves your session here and signs out the other device.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                testID="shift-cancel-btn"
                disabled={isShifting}
                onPress={() => setShiftVisible(false)}
                style={[styles.modalBtn, styles.modalCancel, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="shift-confirm-btn"
                disabled={isShifting}
                onPress={onShift}
                style={[styles.modalBtn, { backgroundColor: colors.primary, opacity: isShifting ? 0.7 : 1 }]}
              >
                {isShifting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Shift</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row' },
  hero: { width: '50%', position: 'relative' },
  heroImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 48,
    backgroundColor: 'rgba(2,6,23,0.55)',
  },
  heroBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoImage: { width: 44, height: 44, borderRadius: 8 },
  heroBrandTitle: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.4 },
  heroTitle: { color: '#fff', fontSize: 38, fontWeight: '700', letterSpacing: -0.6, lineHeight: 46 },
  heroSub: { color: '#E2E8F0', fontSize: 14, marginTop: 12, lineHeight: 22, maxWidth: 460 },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 26 },
  heroPill: { paddingHorizontal: 12, height: 30, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', justifyContent: 'center' },
  heroPillText: { color: '#fff', fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },

  right: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', minHeight: Platform.OS === 'web' ? '100%' : '100%' },
  rightInner: { width: '100%', maxWidth: 460, padding: Platform.OS === 'web' && Dimensions.get('window').width > 600 ? 48 : 24, flex: 1, justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoImageSm: { width: 38, height: 38, borderRadius: 8 },
  brandText: { fontSize: 14, fontWeight: '700' },
  themeBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginTop: 12 },
  headline: { fontSize: 30, fontWeight: '700', letterSpacing: -0.8, marginTop: 6 },
  subhead: { fontSize: 13, lineHeight: 20, marginTop: 10 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 48, borderRadius: 10, marginTop: 8,
  },
  primaryText: { fontSize: 14, fontWeight: '600' },
  input: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, fontSize: 15 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordInput: { flex: 1 },
  eyeBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: 1, marginVertical: 28 },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 44, borderRadius: 10, borderWidth: 1,
  },
  outlineText: { fontSize: 13, fontWeight: '600' },
  footer: { fontSize: 11, marginTop: 24, textAlign: 'left' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    borderWidth: 1,
    padding: 22,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { fontSize: 14, lineHeight: 21 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancel: { borderWidth: 1 },
});
