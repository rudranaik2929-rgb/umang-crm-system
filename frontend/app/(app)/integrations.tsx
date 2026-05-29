import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api, BACKEND } from '../../src/lib/api';

type IntegrationStatus = {
  facebook?: {
    source: string;
    webhook_path: string;
    verify_token_configured: boolean;
    lead_retrieval_configured: boolean;
  };
  housing?: {
    source: string;
    webhook_path: string;
    sync_path: string;
    profile_id_configured: boolean;
    encryption_key_configured: boolean;
    integration_uuid_configured: boolean;
    api_url: string;
  };
};

type PlatformBreakdown = {
  platform: string;
  label: string;
  count: number;
  active: number;
  negative: number;
};

type HousingVerify = {
  credentials_ok: boolean;
  api_reachable: boolean;
  leads_available: number;
  db_housing_leads: number;
  message?: string;
};

export default function Integrations() {
  const { colors } = useTheme();
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [platforms, setPlatforms] = useState<PlatformBreakdown[]>([]);
  const [housingVerify, setHousingVerify] = useState<HousingVerify | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, plat, verify] = await Promise.all([
        api.get('/integrations/status'),
        api.get('/stats/leads-by-platform'),
        api.get('/integrations/housing/verify'),
      ]);
      setStatus(s.data || {});
      setPlatforms(Array.isArray(plat.data?.platforms) ? plat.data.platforms : []);
      setHousingVerify(verify.data || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const housingPlatform = useMemo(
    () => platforms.find((p) => p.platform === 'housing'),
    [platforms]
  );
  const metaPlatform = useMemo(
    () => platforms.find((p) => p.platform === 'meta'),
    [platforms]
  );
  const manualPlatform = useMemo(
    () => platforms.find((p) => p.platform === 'manual'),
    [platforms]
  );

  const runHousingSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const r = await api.post('/housing/sync', {});
      const created = Array.isArray(r.data?.created) ? r.data.created.length : 0;
      const duplicates = Array.isArray(r.data?.duplicates) ? r.data.duplicates.length : 0;
      const fetched = Number(r.data?.fetched || 0);
      setMessage(`Housing sync: ${fetched} fetched from API, ${created} new, ${duplicates} already in CRM.`);
      await load();
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Housing sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Integrations" subtitle="Portal lead intake and source health" />
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.grid}>
            <IntegrationPanel
              colors={colors}
              icon="map-outline"
              title="Housing.com"
              endpoint={`${BACKEND}${status?.housing?.webhook_path || '/api/housing/webhook'}`}
              source={housingPlatform}
              checks={[
                ['Profile ID', !!status?.housing?.profile_id_configured],
                ['Encryption key', !!status?.housing?.encryption_key_configured],
                ['Integration UUID', !!status?.housing?.integration_uuid_configured],
                ['API reachable', !!housingVerify?.api_reachable],
                ['Leads in API (24h)', (housingVerify?.leads_available || 0) > 0],
              ]}
              extraNote={
                housingVerify
                  ? `API: ${housingVerify.leads_available} available · CRM: ${housingVerify.db_housing_leads} stored`
                  : undefined
              }
              actionLabel={syncing ? 'Syncing' : 'Sync Leads (last 24h)'}
              actionIcon="sync-outline"
              onAction={runHousingSync}
              actionDisabled={syncing}
            />

            <IntegrationPanel
              colors={colors}
              icon="logo-facebook"
              title="Meta (Facebook Lead Ads)"
              endpoint={`${BACKEND}${status?.facebook?.webhook_path || '/api/facebook/webhook'}`}
              source={metaPlatform}
              checks={[
                ['Verify token', !!status?.facebook?.verify_token_configured],
                ['Lead retrieval', !!status?.facebook?.lead_retrieval_configured],
              ]}
            />
          </View>

          {message ? (
            <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.info} />
              <Text style={[styles.noticeText, { color: colors.text }]}>{message}</Text>
            </View>
          ) : null}

          <View style={[styles.tablePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.tableHead}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Leads by Platform</Text>
              <Text style={[styles.panelSub, { color: colors.textMuted }]}>Manual · Housing · Meta</Text>
            </View>
            {[manualPlatform, housingPlatform, metaPlatform].filter(Boolean).length ? (
              [manualPlatform, housingPlatform, metaPlatform].map((platform) => platform ? (
                <View key={platform.platform} style={[styles.sourceRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.sourceName, { color: colors.text }]} numberOfLines={1}>{platform.label}</Text>
                  <Text style={[styles.sourceMetric, { color: colors.textSecondary }]}>{platform.active} active</Text>
                  <Text style={[styles.sourceMetric, { color: colors.textSecondary }]}>{platform.negative} negative</Text>
                  <Text style={[styles.sourceCount, { color: colors.text }]}>{platform.count}</Text>
                </View>
              ) : null)
            ) : (
              <View style={styles.empty}>
                <Text style={{ color: colors.textMuted }}>No leads yet. Sync Housing or add manual leads.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function IntegrationPanel({ colors, icon, title, endpoint, source, checks, extraNote, actionLabel, actionIcon, onAction, actionDisabled }: any) {
  const configured = checks.every((check: any[]) => check[1]);
  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.panelHead}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + '18' }]}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.panelSub, { color: configured ? colors.positive : colors.warning }]}>
            {configured ? 'Configured' : 'Needs credentials'}
          </Text>
        </View>
      </View>

      <View style={[styles.endpointBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Text style={[styles.endpointLabel, { color: colors.textMuted }]}>Webhook URL</Text>
        <Text style={[styles.endpointText, { color: colors.text }]} numberOfLines={2}>{endpoint}</Text>
      </View>

      <View style={styles.checks}>
        {checks.map(([label, ok]: any[]) => (
          <View key={label} style={styles.checkRow}>
            <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle-outline'} size={16} color={ok ? colors.positive : colors.warning} />
            <Text style={[styles.checkText, { color: colors.textSecondary }]}>{label}</Text>
          </View>
        ))}
      </View>

      {extraNote ? (
        <Text style={[styles.extraNote, { color: colors.textSecondary }]}>{extraNote}</Text>
      ) : null}

      <View style={[styles.metricStrip, { borderTopColor: colors.border }]}>
        <View>
          <Text style={[styles.metricValue, { color: colors.text }]}>{source?.count || 0}</Text>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>CRM leads</Text>
        </View>
        <View>
          <Text style={[styles.metricValue, { color: colors.positive }]}>{source?.active || 0}</Text>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Active</Text>
        </View>
        <View>
          <Text style={[styles.metricValue, { color: colors.negative }]}>{source?.negative || 0}</Text>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Negative</Text>
        </View>
      </View>

      {onAction ? (
        <Pressable
          onPress={onAction}
          disabled={actionDisabled}
          style={[styles.actionBtn, { backgroundColor: colors.primary, opacity: actionDisabled ? 0.65 : 1 }]}
        >
          <Ionicons name={actionIcon || 'play-outline'} size={16} color="#fff" />
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  panel: { flexGrow: 1, flexBasis: 360, borderWidth: 1, borderRadius: 8, padding: 16, gap: 14 },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  panelSub: { fontSize: 12, marginTop: 2 },
  endpointBox: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 4 },
  endpointLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  endpointText: { fontSize: 12, fontWeight: '600' },
  checks: { gap: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { fontSize: 13 },
  extraNote: { fontSize: 12, fontWeight: '600' },
  metricStrip: { borderTopWidth: 1, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  metricValue: { fontSize: 22, fontWeight: '800' },
  metricLabel: { fontSize: 11, marginTop: 2 },
  actionBtn: { height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  notice: { borderWidth: 1, borderRadius: 8, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' },
  noticeText: { fontSize: 13, fontWeight: '600' },
  tablePanel: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  tableHead: { padding: 16 },
  sourceRow: { borderTopWidth: 1, minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  sourceName: { flex: 1, fontSize: 13, fontWeight: '700' },
  sourceMetric: { width: 110, fontSize: 12, textAlign: 'right' },
  sourceCount: { width: 52, fontSize: 15, fontWeight: '800', textAlign: 'right' },
  empty: { padding: 28, alignItems: 'center' },
});
