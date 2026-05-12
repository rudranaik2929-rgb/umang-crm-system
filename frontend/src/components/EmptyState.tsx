import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  testIDAction?: string;
  variant?: 'leads' | 'whatsapp' | 'default';
}

export function EmptyState({ title = 'Nothing here yet', description, actionLabel, onAction, testIDAction, variant = 'default' }: Props) {
  const { colors } = useTheme();
  const icon = variant === 'whatsapp' ? '💬' : variant === 'leads' ? '📁' : '✨';
  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="empty-state">
      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Text style={{ fontSize: 32 }}>{icon}</Text>
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.desc, { color: colors.textSecondary }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          testID={testIDAction || 'empty-state-action'}
          style={[styles.btn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.btnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    gap: 12,
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  desc: { fontSize: 13, textAlign: 'center', maxWidth: 380, lineHeight: 18 },
  btn: { paddingHorizontal: 20, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
