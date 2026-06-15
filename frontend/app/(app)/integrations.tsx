import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api, BACKEND, getSnapshot, setSnapshot } from '../../src/lib/api';

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

type FacebookVerify = {
  token_configured: boolean;
  token_valid: boolean;
  token_error?: string | null;
  db_meta_leads: number;
  forms_count?: number;
  page_id?: string | null;
  pending_webhook_events?: number;
  last_error?: string | null;
  fix_steps?: string[];
};

type MetaLeadRow = {
  lead_id: string;
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  created_at?: string;
};

export default function Integrations() {
  const { colors } = useTheme();
  const cachedInteg = getSnapshot<any>('integrations-page');
  const [status, setStatus] = useState<IntegrationStatus | null>(cachedInteg?.status ?? null);
  const [platforms, setPlatforms] = useState<PlatformBreakdown[]>(cachedInteg?.platforms ?? []);
  const [housingVerify, setHousingVerify] = useState<HousingVerify | null>(cachedInteg?.housingVerify ?? null);
  const [loading, setLoading] = useState(!cachedInteg);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fbEvents, setFbEvents] = useState<any[]>(cachedInteg?.fbEvents ?? []);
  const [fbVerify, setFbVerify] = useState<FacebookVerify | null>(cachedInteg?.fbVerify ?? null);
  const [metaLeads, setMetaLeads] = useState<MetaLeadRow[]>(cachedInteg?.metaLeads ?? []);
  const [metaSyncing, setMetaSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, plat, verify, fb, fbV, metaList] = await Promise.all([
        api.get('/integrations/status'),
        api.get('/stats/leads-by-platform'),
        api.get('/integrations/housing/verify'),
        api.get('/integrations/facebook/events', { params: { limit: 5 } }).catch(() => ({ data: { events: [] } })),
        api.get('/integrations/facebook/verify').catch(() => ({ data: null })),
        api.get('/leads/by-platform/meta', { params: { limit: 50 } }).catch(() => ({ data: { leads: [] } })),
      ]);
      const nextStatus = s.data || {};
      const nextPlatforms = Array.isArray(plat.data?.platforms) ? plat.data.platforms : [];
      const nextHousing = verify.data || null;
      const nextEvents = Array.isArray(fb.data?.events) ? fb.data.events : [];
      const nextFbVerify = fbV.data || null;
      const nextMeta = Array.isArray(metaList.data?.leads) ? metaList.data.leads : [];
      setStatus(nextStatus);
      setPlatforms(nextPlatforms);
      setHousingVerify(nextHousing);
      setFbEvents(nextEvents);
      setFbVerify(nextFbVerify);
      setMetaLeads(nextMeta);
      setSnapshot('integrations-page', {
        status: nextStatus, platforms: nextPlatforms, housingVerify: nextHousing,
        fbEvents: nextEvents, fbVerify: nextFbVerify, metaLeads: nextMeta,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().then(async () => {
      try {
        const v = await api.get('/integrations/facebook/verify');
        const pending = Number(v.data?.pending_webhook_events || 0);
        if (pending > 0 && v.data?.token_valid) {
          await api.post('/integrations/facebook/resync', {});
          await load();
        }
      } catch {
        // ignore background resync errors
      }
    });
  }, [load]);

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
      const skipped = Number(r.data?.skipped_stale || 0);
      const fetched = Number(r.data?.fetched || 0);
      setMessage(
        `Housing sync: ${fetched} fetched, ${created} new, ${duplicates} already in CRM${skipped ? `, ${skipped} old skipped` : ''} (recent leads only).`,
      );
      await load();
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Housing sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const runMetaResync = async () => {
    setMetaSyncing(true);
    setMessage(null);
    try {
      const r = await api.post('/integrations/facebook/resync', {});
      const created = Number(r.data?.created || 0);
      const failed = Number(r.data?.failed || 0);
      const retried = Number(r.data?.retried || 0);
      if (created > 0) {
        setMessage(`Meta resync: ${created} new lead(s) imported from ${retried} webhook event(s).`);
      } else if (failed > 0 && retried > 0) {
        setMessage('Meta resync: only test webhook IDs found. Use Import Past Meta Leads for real submissions.');
      } else {
        setMessage('Meta resync: no pending webhook leads. Use Import Past Meta Leads to pull from Facebook forms.');
      }
      await load();
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Meta resync failed.');
    } finally {
      setMetaSyncing(false);
    }
  };

  const runMetaImport = async () => {
    setMetaSyncing(true);
    setMessage(null);
    try {
      const r = await api.post('/integrations/facebook/import', { days: 90, limit: 500 });
      const created = Number(r.data?.created || 0);
      const fetched = Number(r.data?.fetched || 0);
      const duplicates = Number(r.data?.duplicates || 0);
      const forms = Array.isArray(r.data?.forms) ? r.data.forms.length : 0;
      setMessage(
        `Meta import: ${fetched} fetched from ${forms} form(s), ${created} new, ${duplicates} already in CRM (last 90 days).`,
      );
      await load();
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Meta import failed.');
    } finally {
      setMetaSyncing(false);
    }
  };

  const metaExtraNote = useMemo(() => {
    if (!fbVerify?.token_configured) {
      return 'Webhook URL verified ≠ leads working. Add FACEBOOK_PAGE_ACCESS_TOKEN on Render (Page token with leads_retrieval).';
    }
    if (fbVerify?.token_error) {
      return fbVerify.token_error;
    }
    if ((fbVerify?.pending_webhook_events || 0) > 0) {
      return `${fbVerify?.pending_webhook_events} webhook lead(s) waiting — click Resync Webhooks after token is set.`;
    }
    if (metaLeads.length > 0) {
      return `${metaLeads.length} in CRM · ${fbVerify?.forms_count ?? 0} form(s) · Page ${fbVerify?.page_id || '—'}`;
    }
    if (fbVerify?.token_valid) {
      return `Token OK · ${fbVerify?.forms_count ?? 0} Lead Ad form(s). Click Import Past Meta Leads for older submissions.`;
    }
    if (fbEvents.length) {
      return `Last event: ${fbEvents[0].status} · ${fbEvents[0].external_id || '—'}`;
    }
    return 'Submit a real lead via your Facebook Lead Ad form, then Import or Resync.';
  }, [fbEvents, fbVerify, metaLeads.length]);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Integrations" subtitle="Portal lead intake and source health" />
      {loading && !status ? (
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
                ['Leads in API (2h)', (housingVerify?.leads_available || 0) > 0],
              ]}
              extraNote={
                housingVerify
                  ? `API: ${housingVerify.leads_available} available · CRM: ${housingVerify.db_housing_leads} stored`
                  : undefined
              }
              actionLabel={syncing ? 'Syncing' : 'Sync New Housing Leads (2h)'}
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
                ['Page token (lead fetch)', !!status?.facebook?.lead_retrieval_configured && !!fbVerify?.token_valid],
                ['Page token valid', !!fbVerify?.token_valid],
                ['Recent webhooks', fbEvents.length > 0],
              ]}
              extraNote={metaExtraNote}
              actionLabel={metaSyncing ? 'Importing…' : 'Import Past Meta Leads (90 days)'}
              actionIcon="cloud-download-outline"
              onAction={runMetaImport}
              actionDisabled={metaSyncing || !fbVerify?.token_valid}
              secondaryActionLabel={metaSyncing ? undefined : 'Resync Webhooks'}
              onSecondaryAction={metaSyncing ? undefined : runMetaResync}
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

          {metaLeads.length > 0 ? (
            <View style={[styles.tablePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.tableHead}>
                <Text style={[styles.panelTitle, { color: colors.text }]}>Meta Leads in CRM</Text>
                <Text style={[styles.panelSub, { color: colors.textMuted }]}>{metaLeads.length} from Facebook Lead Ads</Text>
              </View>
              {metaLeads.map((lead) => (
                <View key={lead.lead_id} style={[styles.sourceRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.sourceName, { color: colors.text }]} numberOfLines={1}>{lead.name}</Text>
                  <Text style={[styles.sourceMetric, { color: colors.textSecondary }]} numberOfLines={1}>{lead.phone || lead.email || '—'}</Text>
                  <Text style={[styles.sourceCount, { color: colors.text }]}>{String(lead.created_at || '').slice(0, 10)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.notice, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.info} />
              <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
                Meta shows 0 leads until you import. Click Import Past Meta Leads on the Facebook panel above — this pulls previously submitted Lead Ad forms from Meta (last 90 days).
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function IntegrationPanel({ colors, icon, title, endpoint, source, checks, extraNote, actionLabel, actionIcon, onAction, actionDisabled, secondaryActionLabel, onSecondaryAction }: any) {
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

      {onSecondaryAction ? (
        <Pressable
          onPress={onSecondaryAction}
          disabled={actionDisabled}
          style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, opacity: actionDisabled ? 0.65 : 1 }]}
        >
          <Ionicons name="sync-outline" size={16} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.primary }]}>{secondaryActionLabel}</Text>
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
