import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';
import { platformLabel } from '../lib/constants';
import { formatBudgetStringLakhs } from '../lib/leadFormat';
import { PanelRefreshButton } from './PanelRefreshButton';

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
  items?: any[];
  total?: number;
  onOpenLead?: (leadId: string) => void;
  onViewAll?: () => void;
  refreshKey?: number;
  onRefresh?: () => void;
};

export function MissedLeadsPanel({
  compact = false,
  maxItems = 6,
  items: itemsProp,
  total: totalProp,
  onOpenLead,
  onViewAll,
  refreshKey = 0,
  onRefresh,
}: Props) {
  const { colors } = useTheme();
  const [items, setItems] = useState<any[]>(itemsProp ?? []);
  const [total, setTotal] = useState(totalProp ?? 0);
  const [loading, setLoading] = useState(itemsProp == null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (itemsProp != null) {
      setItems(itemsProp);
      setTotal(totalProp ?? itemsProp.length);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/stats/me/activity/missed_leads', { params: { limit: 500 } });
      const leads = Array.isArray(res.data?.items) ? res.data.items : [];
      const nextTotal = Number(res.data?.total ?? leads.length);
      setTotal(nextTotal);
      setItems(leads);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load missed leads.');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [itemsProp, totalProp]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading && items.length === 0) {
    return <ActivityIndicator color={colors.negative} style={{ marginVertical: 16 }} />;
  }

  if (error) {
    return (
      <View>
        <Text style={{ color: colors.negative, fontSize: 12, marginBottom: 8 }}>{error}</Text>
        <Pressable onPress={load}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
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
        <View style={styles.panelHead}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
            {total} lead{total === 1 ? '' : 's'} assigned 24h+ ago with no update
          </Text>
          <PanelRefreshButton onPress={() => { load(); onRefresh?.(); }} loading={loading} testID="missed-leads-refresh" />
        </View>
      ) : (
        <View style={styles.panelHead}>
          <Text style={{ color: colors.negative, fontSize: 11, flex: 1, fontWeight: '700' }}>
            {total} need urgent action
          </Text>
          <PanelRefreshButton onPress={() => { load(); onRefresh?.(); }} loading={loading} testID="missed-leads-refresh" />
        </View>
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
              <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }} numberOfLines={2}>
                {[lead.property_type, lead.location].filter(Boolean).join(' · ') || 'Location / requirement pending'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                {leadSourceLabel(lead.source)}
                {lead.budget ? ` · ${formatBudgetStringLakhs(lead.budget) || lead.budget} L` : ''}
                {' · assigned '}{formatAssignedAgo(lead.assigned_at || lead.updated_at || lead.created_at)}
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
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
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
