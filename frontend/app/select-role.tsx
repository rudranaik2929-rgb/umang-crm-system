import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/auth/AuthContext';
import { ROLES } from '../src/lib/constants';

export default function SelectRole() {
  const { colors } = useTheme();
  const { user, setRole, loading } = useAuth();
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!loading && !user) router.replace('/' as any);
    if (!loading && user?.role) router.replace('/(app)/dashboard' as any);
  }, [user, loading, router]);

  const choose = async (r: string) => {
    setPending(r);
    await setRole(r);
    router.replace('/(app)/dashboard' as any);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.wrap}>
      <View style={{ width: '100%', maxWidth: 720 }}>
        <Text style={[styles.kicker, { color: colors.textMuted }]}>FIRST-TIME SETUP</Text>
        <Text style={[styles.title, { color: colors.text }]}>Choose your starting role</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          You can switch roles anytime from the top bar — perfect for the demo where you act as every department.
        </Text>

        <View style={styles.grid}>
          {ROLES.map((r) => (
            <Pressable
              key={r.key}
              testID={`select-role-${r.key}`}
              onPress={() => choose(r.key)}
              disabled={pending !== null}
              style={({ hovered }: any) => [
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: hovered ? colors.primary : colors.border,
                  opacity: pending && pending !== r.key ? 0.5 : 1,
                },
              ]}
            >
              <View style={[styles.cardIcon, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons
                  name={
                    r.key === 'admin' ? 'shield-checkmark-outline' :
                    r.key === 'telecaller' ? 'call-outline' :
                    r.key === 'site_visit' ? 'location-outline' :
                    r.key === 'booking' ? 'document-text-outline' :
                    r.key === 'loan' ? 'business-outline' : 'megaphone-outline'
                  }
                  size={20}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{r.label}</Text>
              <Text style={[styles.cardDept, { color: colors.textMuted }]}>{r.dept}</Text>
              {pending === r.key && (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 48, alignItems: 'center', justifyContent: 'center', minHeight: '100%' },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 6 },
  subtitle: { fontSize: 13, marginTop: 8, maxWidth: 540 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 28 },
  card: {
    width: 220, padding: 18, borderRadius: 12, borderWidth: 1, gap: 6,
  },
  cardIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', marginTop: 6 },
  cardDept: { fontSize: 11 },
});
