import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView, Platform, Dimensions, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/auth/AuthContext';

const HERO_IMG = 'https://static.prod-images.emergentagent.com/jobs/bcbec8c6-82ba-422e-a9c5-02053dc9d61d/images/35dda4ad3fda80d98d3e686fde61d9fcf2b36147d133e43a32eed389dcf53913.png';

export default function Index() {
  const router = useRouter();
  const { user, loading, exchangeSession } = useAuth();
  const { colors, themeName, toggle } = useTheme();
  const { width } = Dimensions.get('window');
  const isWide = width >= 900;

  // Remove auto-redirect to allow user to see the login screen
  // useEffect(() => {
  //   if (!loading && user) {
  //     if (!user.role) router.replace('/select-role' as any);
  //     else router.replace('/(app)/dashboard' as any);
  //   }
  // }, [user, loading, router]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const onLogin = async () => {
    if (!email || !password) {
      alert('Please enter both email and password');
      return;
    }

    setIsLoggingIn(true);
    try {
      const loggedInUser = await exchangeSession({
        email: email.trim(),
        password: password.trim()
      });
      if (loggedInUser) {
        if (!loggedInUser.role) router.replace('/select-role' as any);
        else router.replace('/(app)/dashboard' as any);
      } else {
        alert('Login failed. Please check your credentials.');
      }
    } catch (err) {
      alert('An error occurred during login. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const onContinue = () => {
    if (user) {
      if (!user.role) router.replace('/select-role' as any);
      else router.replace('/(app)/dashboard' as any);
    }
  };

  const onEnquiry = () => router.push('/enquire' as any);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* LEFT — HERO */}
      {isWide && (
        <View style={styles.hero}>
          <Image source={{ uri: HERO_IMG }} style={styles.heroImg} />
          <View style={styles.heroOverlay}>
            <View style={styles.heroBrand}>
              <Image
                source={require('../assets/images/logo.jpeg')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.heroBrandTitle}>Umang Properties</Text>
            </View>
            <View style={{ flex: 1 }} />
            <Text style={styles.heroTitle}>Premium real estate{`\n`}workflow, end-to-end.</Text>
            <Text style={styles.heroSub}>
              From the first website enquiry to the keys in hand — orchestrate every department in a single elegant cockpit.
            </Text>
            <View style={styles.heroPills}>
              {['Telecaller', 'Site Visits', 'Bookings', 'Loans'].map((t) => (
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
                source={require('../assets/images/logo.jpeg')}
                style={styles.logoImageSm}
                resizeMode="contain"
              />
              <Text style={[styles.brandText, { color: colors.text }]}>Umang Properties</Text>
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

          <Text style={[styles.kicker, { color: colors.textMuted }]}>WELCOME BACK</Text>
          <Text style={[styles.headline, { color: colors.text }]}>Sign in to your CRM</Text>
          <Text style={[styles.subhead, { color: colors.textSecondary, marginBottom: 20 }]}>
            Real estate operations, refined. Manage leads, site visits, bookings, loans and outbound campaigns from one trusted workspace.
          </Text>

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
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {user ? (
            <Pressable
              onPress={onContinue}
              disabled={isLoggingIn}
              testID="continue-btn"
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: isLoggingIn ? 0.7 : 1 }]}
            >
              <Text style={[styles.primaryText, { color: '#fff' }]}>Continue as {user.name}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onLogin}
              disabled={isLoggingIn}
              testID="login-btn"
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: isLoggingIn ? 0.7 : 1 }]}
            >
              {isLoggingIn ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[styles.primaryText, { color: '#fff' }]}>Log in to CRM</Text>
              )}
            </Pressable>
          )}

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
            © {new Date().getFullYear()} Umang Properties — Enterprise CRM
          </Text>
        </View>
      </ScrollView>
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
  divider: { height: 1, marginVertical: 28 },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 44, borderRadius: 10, borderWidth: 1,
  },
  outlineText: { fontSize: 13, fontWeight: '600' },
  footer: { fontSize: 11, marginTop: 24, textAlign: 'left' },
});
