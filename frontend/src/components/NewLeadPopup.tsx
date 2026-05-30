import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';

interface RecentLead {
  lead_id: string;
  name?: string;
  phone?: string;
  platform?: string;
  platform_label?: string;
  created_at?: string;
}

const PLATFORM_META: Record<string, { icon: any; color: string }> = {
  housing: { icon: 'home', color: '#0EA5E9' },
  meta: { icon: 'logo-facebook', color: '#1877F2' },
  manual: { icon: 'create-outline', color: '#8B5CF6' },
  other: { icon: 'globe-outline', color: '#64748B' },
  brokerage: { icon: 'briefcase-outline', color: '#D97706' },
};

function formatArrival(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// Polls for newly arrived leads (Housing / Meta / manual) and shows a stacked
// toast for each one as it lands, with the platform and real arrival date-time.
// Designed for the manager/admin dashboard.
export function NewLeadPopup({ enabled = true, pollMs = 20000 }: { enabled?: boolean; pollMs?: number }) {
  const { colors } = useTheme();
  const [queue, setQueue] = useState<RecentLead[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await api.get('/leads/recent', { params: { limit: 20 } });
      const leads: RecentLead[] = Array.isArray(res.data?.leads) ? res.data.leads : [];
      if (!primedRef.current) {
        // First load: remember everything so we only pop for genuinely new arrivals.
        leads.forEach((l) => l.lead_id && seenRef.current.add(l.lead_id));
        primedRef.current = true;
        return;
      }
      const fresh = leads.filter((l) => l.lead_id && !seenRef.current.has(l.lead_id));
      if (fresh.length) {
        fresh.forEach((l) => seenRef.current.add(l.lead_id));
        // Show newest at the top, cap the visible stack.
        setQueue((prev) => [...fresh, ...prev].slice(0, 4));
      }
    } catch {
      // Ignore transient/cold-start errors; next tick retries.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    poll();
    const id = setInterval(poll, pollMs);
    return () => clearInterval(id);
  }, [enabled, poll, pollMs]);

  const dismiss = (leadId: string) => setQueue((prev) => prev.filter((l) => l.lead_id !== leadId));

  if (!enabled || queue.length === 0) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {queue.map((lead) => {
        const meta = PLATFORM_META[lead.platform || 'other'] || PLATFORM_META.other;
        return (
          <View key={lead.lead_id} style={[styles.toast, { backgroundColor: colors.surface, borderColor: meta.color + '55' }]} testID={`new-lead-toast-${lead.lead_id}`}>
            <View style={[styles.iconWrap, { backgroundColor: meta.color + '1A' }]}>
              <Ionicons name={meta.icon} size={18} color={meta.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                New lead: {lead.name || 'Unnamed'}
              </Text>
              <Text style={[styles.meta, { color: meta.color }]} numberOfLines={1}>
                {lead.platform_label || 'Lead'}
              </Text>
              <Text style={[styles.time, { color: colors.textMuted }]} numberOfLines={1}>
                {formatArrival(lead.created_at)}{lead.phone ? ` · ${lead.phone}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => dismiss(lead.lead_id)} hitSlop={8} style={styles.close}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 16, right: 16, zIndex: 10000, gap: 10, maxWidth: 340,
  },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 12, padding: 12, width: 320,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13, fontWeight: '700' },
  meta: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  time: { fontSize: 11, marginTop: 2 },
  close: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
