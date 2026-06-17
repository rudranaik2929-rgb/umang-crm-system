import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api, getSnapshot, setSnapshot } from '../lib/api';
import { platformLabel } from '../lib/constants';

function leadSourceLabel(source?: string) {
  const s = String(source || '').toLowerCase();
  if (s.includes('housing')) return platformLabel('housing');
  if (s.includes('facebook') || s.includes('meta') || s.includes('instagram')) return platformLabel('meta');
  if (!s || s.includes('import') || s === 'manual' || s === 'direct' || s === 'database') return platformLabel('manual');
  return source || platformLabel('other');
}

type Props = {
  compact?: boolean;
  maxItems?: number;
  onOpenLead?: (leadId: string) => void;
  onViewAll?: () => void;
};

export function MissedLeadsPanel({ compact = false, maxItems = 6, onOpenLead, onViewAll }: Props) {
  const { colors } = useTheme();
  const cached = getSnapshot<any>('missed-leads-panel');
  const [items, setItems] = useState<any[]>(cached?.items ?? []);
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [loading, setLoading] = useState(!cached);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/stats/me/activity/missed_leads', { params: { limit: 500 } });
      const leads = Array.isArray(res.data?.items) ? res.data.items : [];
      const nextTotal = Number(res.data?.total ?? leads.length);
      setTotal(nextTotal);
      setItems(leads);
      setSnapshot('missed-leads-panel', { items: leads, total: nextTotal });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && items.length === 0) {
    return <ActivityIndicator color={colors.negative} style={{ marginVertical: 16 }} />;
  }

  if (items.length === 0) {
    return (
      <Text style={{ color: colors.textMuted, fontSize: compact ? 12 : 13, paddingVertical: 8 }}>
        No missed leads — great job keeping your queue updated.
      </Text>
    );
  }

  const shown = items.slice(0, maxItems);

  return (
    <View>
      {!compact ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>
          {total} lead{total === 1 ? '' : 's'} assigned 24h+ ago with no update
        </Text>
      ) : (
        <Text style={{ color: colors.negative, fontSize: 11, marginBottom: 8, fontWeight: '700' }}>
          {total} need urgent action
        </Text>
      )}
      <View style={styles.list}>
        {shown.map((lead) => (
            <Pressable
              key={lead.lead_id}
              testID={`missed-lead-${lead.lead_id}`}
              onPress={() => onOpenLead?.(lead.lead_id)}
              style={({ pressed }: any) => [
                styles.row,
                {
                  borderColor: colors.negative + '44',
                  backgroundColor: pressed ? colors.negative + '10' : colors.surfaceAlt,
                },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.negative + '18' }]}>
                <Ionicons name="alert-circle" size={16} color={colors.negative} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                  {lead.name || 'Lead'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{lead.phone || '—'}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>
                  {leadSourceLabel(lead.source)} · assigned {formatAssignedAgo(lead.assigned_at || lead.updated_at || lead.created_at)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.negative} />
            </Pressable>
          ))}
      </View>
      {onViewAll && total > maxItems ? (
        <Pressable onPress={onViewAll} style={{ marginTop: 8 }}>
          <Text style={{ color: colors.negative, fontSize: 12, fontWeight: '700' }}>View all {total} missed leads →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function formatAssignedAgo(value?: string) {
  if (!value) return 'recently';
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return 'recently';
  const hours = Math.max(1, Math.round((Date.now() - ts) / (60 * 60 * 1000)));
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
