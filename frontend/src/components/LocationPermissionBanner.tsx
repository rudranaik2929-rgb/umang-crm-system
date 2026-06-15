import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { LocationStatus } from '../hooks/useEmployeeLocation';

type Props = {
  status: LocationStatus;
  onRequest: () => void;
};

export function LocationPermissionBanner({ status, onRequest }: Props) {
  const { colors } = useTheme();

  if (status !== 'denied' && status !== 'checking') return null;
  if (Platform.OS !== 'web') return null;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name="location-outline" size={20} color="#F97316" />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>
          {status === 'checking' ? 'Requesting GPS access…' : 'GPS access needed for employee tracking'}
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Allow location when prompted so your manager can see you on the Employee Tracking map while you work.
        </Text>
      </View>
      {status === 'denied' ? (
        <Pressable onPress={onRequest} style={styles.btn}>
          <Text style={styles.btnText}>Allow GPS</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  title: { fontSize: 13, fontWeight: '700' },
  sub: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  btn: {
    backgroundColor: '#F97316',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
