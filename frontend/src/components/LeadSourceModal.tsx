import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, Modal, ScrollView, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api, META_INTEGRATION_TIMEOUT_MS } from '../lib/api';
import { LeadDetailModal } from './LeadDetailModal';
import { WorkflowStatusBadge } from './Badge';
import {
  formatBudgetRangeLakhs,
  formatBudgetStringLakhs,
  formatHousingConfiguration,
  formatHousingLeadDate,
} from '../lib/leadFormat';
import { platformLabel } from '../lib/constants';
import { useMainContentOverlayStyle } from '../layout/SidebarLayoutContext';

type PlatformRow = {
  platform: string;
  label: string;
  count: number;
  active: number;
  negative: number;
  sources?: { source: string; count: number }[];
};

type PlatformData = {
  total: number;
  platforms: PlatformRow[];
};

type LeadRow = {
  lead_id: string;
  name: string;
  phone?: string;
  email?: string;
  location?: string;
  budget?: string;
  property_type?: string;
  source?: string;
  stage?: string;
  status?: string;
  notes?: string;
  external_lead_id?: string;
  raw_payload?: Record<string, unknown>;
  created_at?: string;
};

const PLATFORM_UI: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  manual: { icon: 'create-outline', color: '#6366F1' },
  housing: { icon: 'map-outline', color: '#00BFA5' },
  meta: { icon: 'logo-facebook', color: '#1877F2' },
  other: { icon: 'ellipsis-horizontal-outline', color: '#64748B' },
};

function normalizePlatformData(payload: any): PlatformData {
  const platforms = Array.isArray(payload?.platforms) ? payload.platforms : [];
  return {
    total: Number(payload?.total ?? platforms.reduce((sum: number, p: any) => sum + Number(p?.count || 0), 0)),
    platforms: platforms.map((p: any) => ({
      platform: String(p?.platform || 'other'),
      label: String(p?.label || p?.platform || 'Other'),
      count: Number(p?.count || 0),
      active: Number(p?.active || 0),
      negative: Number(p?.negative || 0),
      sources: Array.isArray(p?.sources) ? p.sources : [],
    })),
  };
}

function housingProjectLabel(lead: LeadRow): string | null {
  const notes = lead.notes || '';
  const match = notes.match(/Project:\s*(.+)/i);
  if (match) return match[1].trim();
  const raw = lead.raw_payload;
  if (raw && typeof raw === 'object') {
    const name = raw.project_name || raw.project;
    if (name) return String(name);
  }
  return null;
}

function formatDate(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  visible: boolean;
  onClose: () => void;
  userRole?: string | null;
  onChanged?: () => void;
  /** company = all CRM leads (admin dashboard); mine = only leads assigned to this employee */
  scope?: 'company' | 'mine';
}

export function LeadSourceModal({ visible, onClose, userRole, onChanged, scope = 'company' }: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const overlayStyle = useMainContentOverlayStyle();
  const isWide = windowWidth >= 900;
  const [data, setData] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'platforms' | 'leads'>('platforms');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformRow | null>(null);
  const [platformLeads, setPlatformLeads] = useState<LeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [metaStatus, setMetaStatus] = useState<string | null>(null);
  const [leadFilter, setLeadFilter] = useState<string>('all');
  const [listTotal, setListTotal] = useState(0);

  const selectedPlatformRef = useRef<PlatformRow | null>(null);
  const viewRef = useRef<'platforms' | 'leads'>('platforms');

  const resetDrillDown = useCallback(() => {
    setView('platforms');
    setSelectedPlatform(null);
    setPlatformLeads([]);
    setLeadsError(null);
    setOpenLeadId(null);
    setLeadFilter('all');
    setListTotal(0);
  }, []);

  const canSyncIntegrations = scope === 'company' && ['admin', 'manager', 'marketing'].includes(String(userRole || '').toLowerCase());
  const isMine = scope === 'mine';
  const statsPath = isMine ? '/stats/me/leads-by-platform' : '/stats/leads-by-platform';
  const modalTitle = isMine ? 'My Queue by Platform' : 'Leads by Platform';
  const modalSubtitle = isMine ? 'Your assigned leads · Database · Housing · Meta' : 'Database · Housing · Meta';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await api.get(statsPath);
      const normalized = normalizePlatformData(res.data);
      setData(normalized);
      const metaCount = normalized.platforms.find((p) => p.platform === 'meta')?.count || 0;
      if (metaCount === 0 && canSyncIntegrations) {
        try {
          const v = await api.get('/integrations/facebook/verify');
          if (!v.data?.token_valid) {
            setMetaStatus(v.data?.token_error || 'Meta Page token missing or expired on server.');
          } else {
            setMetaStatus(null);
          }
        } catch {
          setMetaStatus(null);
        }
      } else {
        setMetaStatus(null);
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load lead sources.');
    } finally {
      setLoading(false);
    }
  }, [canSyncIntegrations, statsPath]);

  const loadPlatformLeads = useCallback(async (platform: PlatformRow, filter: string = leadFilter) => {
    setLeadsLoading(true);
    setLeadsError(null);
    setSelectedPlatform(platform);
    setView('leads');
    try {
      const params: Record<string, any> = { limit: 500 };
      if (filter && filter !== 'all') params.status_filter = filter;
      const leadsUrl = isMine
        ? `/stats/me/leads/by-platform/${platform.platform}`
        : `/leads/by-platform/${platform.platform}`;
      const res = await api.get(leadsUrl, { params });
      setPlatformLeads(Array.isArray(res.data?.leads) ? res.data.leads : []);
      setListTotal(Number(res.data?.total ?? 0));
    } catch (e: any) {
      setLeadsError(e?.response?.data?.detail || 'Could not load leads.');
      setPlatformLeads([]);
      setListTotal(0);
    } finally {
      setLeadsLoading(false);
    }
  }, [isMine, leadFilter]);

  const handlePlatformPress = useCallback(async (platform: PlatformRow) => {
    // Open list immediately — do not wait for Housing/Meta sync (can take 30s+).
    await loadPlatformLeads(platform);

    if (!canSyncIntegrations) return;

    try {
      if (platform.platform === 'housing') {
        await api.post('/integrations/housing/poll', {});
        } else if (platform.platform === 'meta') {
          await api.post('/integrations/facebook/poll', {}, { timeout: META_INTEGRATION_TIMEOUT_MS });
        }
      const res = await api.get(statsPath);
      const normalized = normalizePlatformData(res.data);
      setData(normalized);
      const refreshed = normalized.platforms.find((p) => p.platform === platform.platform) || platform;
      await loadPlatformLeads(refreshed);
      onChanged?.();
    } catch {
      // List already visible from first loadPlatformLeads call
    }
  }, [canSyncIntegrations, loadPlatformLeads, onChanged, statsPath]);

  useEffect(() => {
    selectedPlatformRef.current = selectedPlatform;
    viewRef.current = view;
  }, [selectedPlatform, view]);

  useEffect(() => {
    if (!visible) return undefined;
    resetDrillDown();
    loadData();
    return undefined;
  }, [visible, loadData, resetDrillDown]);

  useEffect(() => {
    if (!visible) return undefined;
    const refresh = setInterval(() => {
      loadData();
      const platform = selectedPlatformRef.current;
      if (platform && viewRef.current === 'leads') {
        loadPlatformLeads(platform);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(refresh);
  }, [visible, loadData, loadPlatformLeads]);

  if (!visible) return null;

  const mainPlatforms = (data?.platforms || []).filter((p) => ['manual', 'housing', 'meta', 'other'].includes(p.platform));
  const orderedKeys = ['manual', 'housing', 'meta'];
  if (mainPlatforms.some((p) => p.platform === 'other' && p.count > 0)) {
    orderedKeys.push('other');
  }
  const ordered = orderedKeys.map((key) => {
    const found = mainPlatforms.find((p) => p.platform === key);
    return found || {
      platform: key,
      label: platformLabel(key),
      count: 0, active: 0, negative: 0, sources: [],
    };
  });

  const content = (
    <View style={[overlayStyle, st.fullScreen, { backgroundColor: colors.background }]}>
      <View style={st.contentShell}>
      <View style={[st.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          {view === 'leads' && selectedPlatform ? (
            <Pressable onPress={resetDrillDown} style={st.backRow}>
              <Ionicons name="chevron-back" size={18} color={colors.primary} />
              <Text style={[st.backText, { color: colors.primary }]}>All platforms</Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: view === 'leads' ? 6 : 0 }}>
            <View style={[st.headerIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name={view === 'leads' ? 'list-outline' : 'pie-chart'} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.headerTitle, { color: colors.text }]}>
                {view === 'leads' && selectedPlatform ? selectedPlatform.label : modalTitle}
              </Text>
              <Text style={[st.headerSub, { color: colors.textMuted }]}>
                {view === 'leads' && selectedPlatform
                  ? `${listTotal || platformLeads.length} leads · tap a row for full details`
                  : data
                    ? isMine
                      ? `${data.total} assigned leads · choose Database, Housing, or Meta`
                      : `${data.total} classified leads · choose Database, Housing, or Meta`
                    : loading
                      ? 'Loading…'
                      : modalSubtitle}
              </Text>
            </View>
          </View>
        </View>
        <Pressable onPress={onClose} style={[st.closeBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={st.body}>
        {view === 'platforms' ? (
          loading ? (
            <View style={st.centerBox}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.textMuted, marginTop: 12 }}>Loading platforms…</Text>
            </View>
          ) : error ? (
            <View style={st.centerBox}>
              <Text style={{ color: colors.negative, textAlign: 'center', marginBottom: 12 }}>{error}</Text>
              <Pressable onPress={loadData} style={[st.retryBtn, { backgroundColor: colors.primary }]}>
                <Text style={st.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView contentContainerStyle={st.platformScroll} showsVerticalScrollIndicator={false}>
              <View style={[st.platformGrid, isWide && st.platformGridWide]}>
                {ordered.map((platform) => {
                  const meta = PLATFORM_UI[platform.platform] || PLATFORM_UI.other;
                  const pct = data && data.total > 0 ? Math.round((platform.count / data.total) * 100) : 0;

                  return (
                    <Pressable
                      key={platform.platform}
                      onPress={() => handlePlatformPress(platform)}
                      style={({ pressed }: any) => [
                        st.platformCard,
                        isWide && st.platformCardWide,
                        {
                          backgroundColor: colors.surface,
                          borderColor: meta.color + '55',
                          opacity: pressed ? 0.92 : 1,
                        },
                      ]}
                    >
                      <View style={[st.platformIcon, { backgroundColor: meta.color + '18' }]}>
                        <Ionicons name={meta.icon} size={24} color={meta.color} />
                      </View>
                      <Text style={[st.platformLabel, { color: colors.textMuted }]}>{platform.label}</Text>
                      <Text style={[st.platformCount, { color: colors.text }]}>{platform.count}</Text>
                      <Text style={[st.platformPct, { color: meta.color }]}>{pct}% of total</Text>
                      <View style={[st.miniBar, { backgroundColor: colors.border }]}>
                        <View style={[st.miniBarFill, { backgroundColor: meta.color, width: `${pct}%` }]} />
                      </View>
                      <Text style={[st.platformDetail, { color: colors.textMuted }]}>
                        {platform.active} active · {platform.negative} not interested
                      </Text>
                      {platform.platform === 'housing' && platform.count > 0 ? (
                        <Text style={[st.realBadge, { color: meta.color, borderColor: meta.color + '44', backgroundColor: meta.color + '12' }]}>
                          Original from Housing.com API
                        </Text>
                      ) : null}
                      <Text style={[st.tapHint, { color: meta.color }]}>
                        {platform.count > 0
                          ? 'Open full-screen lead list →'
                          : isMine
                            ? 'No assigned leads from this source'
                            : 'Sync & open full-screen list →'}
                      </Text>
                      {!isMine && platform.count === 0 && platform.platform === 'housing' ? (
                        <Text style={[st.hint, { color: colors.warning }]}>Pulls latest from Housing.com</Text>
                      ) : !isMine && platform.count === 0 && platform.platform === 'meta' ? (
                        <Text style={[st.hint, { color: colors.negative, textAlign: 'center' }]}>
                          {metaStatus || 'New Meta leads via webhook only'}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              <View style={[st.footer, { borderTopColor: colors.border }]}>
                <View style={st.footerItem}>
                  <View style={[st.footerDot, { backgroundColor: colors.positive }]} />
                  <Text style={[st.footerText, { color: colors.textSecondary }]}>
                    Active: {data ? data.platforms.reduce((a, p) => a + p.active, 0) : 0}
                  </Text>
                </View>
                <View style={st.footerItem}>
                  <View style={[st.footerDot, { backgroundColor: colors.negative }]} />
                  <Text style={[st.footerText, { color: colors.textSecondary }]}>
                    Not interested: {data ? data.platforms.reduce((a, p) => a + p.negative, 0) : 0}
                  </Text>
                </View>
                <View style={st.footerItem}>
                  <View style={[st.footerDot, { backgroundColor: colors.primary }]} />
                  <Text style={[st.footerText, { color: colors.textSecondary }]}>Total: {data?.total || 0}</Text>
                </View>
              </View>
            </ScrollView>
          )
        ) : (
          <>
            <View style={st.filterRow}>
              {[
                { key: 'all', label: 'All' },
                { key: 'positive', label: 'Positive' },
                { key: 'not_interested', label: 'Not Interested' },
                { key: 'registration', label: 'Registration' },
                { key: 'booking', label: 'Booking' },
              ].map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => {
                    setLeadFilter(f.key);
                    if (selectedPlatform) loadPlatformLeads(selectedPlatform, f.key);
                  }}
                  style={[st.filterChip, {
                    borderColor: leadFilter === f.key ? colors.primary : colors.border,
                    backgroundColor: leadFilter === f.key ? colors.primary + '18' : colors.surfaceAlt,
                  }]}
                >
                  <Text style={{ color: leadFilter === f.key ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>{f.label}</Text>
                </Pressable>
              ))}
            </View>
            {leadsLoading ? (
              <View style={st.centerBox}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ color: colors.textMuted, marginTop: 12 }}>Loading {selectedPlatform?.label} leads…</Text>
              </View>
            ) : leadsError ? (
              <View style={st.centerBox}>
                <Text style={{ color: colors.negative, textAlign: 'center' }}>{leadsError}</Text>
              </View>
            ) : platformLeads.length === 0 ? (
              <View style={st.centerBox}>
                <Text style={{ color: colors.textMuted }}>No leads in this platform yet.</Text>
              </View>
            ) : (
              <ScrollView style={st.leadList} contentContainerStyle={st.leadListContent} showsVerticalScrollIndicator>
                {isWide ? (
                  <View style={[st.tableHeader, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                    <Text style={[st.tableHeadCell, st.colName, { color: colors.textMuted }]}>Name</Text>
                    <Text style={[st.tableHeadCell, st.colContact, { color: colors.textMuted }]}>Contact</Text>
                    <Text style={[st.tableHeadCell, st.colLocation, { color: colors.textMuted }]}>Location / Project</Text>
                    <Text style={[st.tableHeadCell, st.colBudget, { color: colors.textMuted }]}>Budget</Text>
                    <Text style={[st.tableHeadCell, st.colStatus, { color: colors.textMuted }]}>Status</Text>
                    <Text style={[st.tableHeadCell, st.colDate, { color: colors.textMuted }]}>Date</Text>
                  </View>
                ) : null}
                {platformLeads.map((lead) => {
                  const project = housingProjectLabel(lead);
                  const isHousing = selectedPlatform?.platform === 'housing';
                  const raw = lead.raw_payload;
                  const budgetLabel = isHousing && raw && typeof raw === 'object'
                    ? formatBudgetRangeLakhs(raw.min_price, raw.max_price, lead.budget)
                    : formatBudgetStringLakhs(lead.budget);
                  const configLabel = isHousing && raw && typeof raw === 'object'
                    ? formatHousingConfiguration(raw as Record<string, unknown>)
                    : null;
                  const dateLabel = isHousing && raw && typeof raw === 'object'
                    ? formatHousingLeadDate((raw as any).lead_date, lead.created_at)
                    : formatDate(lead.created_at);

                  if (isWide) {
                    return (
                      <Pressable
                        key={lead.lead_id}
                        onPress={() => setOpenLeadId(lead.lead_id)}
                        style={({ pressed }: any) => [
                          st.tableRow,
                          {
                            backgroundColor: pressed ? colors.primary + '08' : colors.surface,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text style={[st.tableCell, st.colName, st.leadName, { color: colors.text }]} numberOfLines={2}>{lead.name}</Text>
                        <Text style={[st.tableCell, st.colContact, { color: colors.textSecondary }]} numberOfLines={2}>
                          {lead.phone}{lead.email ? `\n${lead.email}` : ''}
                        </Text>
                        <Text style={[st.tableCell, st.colLocation, { color: colors.textMuted }]} numberOfLines={3}>
                          {[project, lead.location, configLabel].filter(Boolean).join('\n') || '—'}
                        </Text>
                        <Text style={[st.tableCell, st.colBudget, { color: colors.textMuted }]} numberOfLines={2}>
                          {budgetLabel ? `${budgetLabel} L` : '—'}
                        </Text>
                        <View style={[st.colStatus, st.tableCell]}>
                          <WorkflowStatusBadge lead={lead} />
                        </View>
                        <Text style={[st.tableCell, st.colDate, { color: colors.textMuted }]} numberOfLines={2}>{dateLabel}</Text>
                      </Pressable>
                    );
                  }

                  return (
                    <Pressable
                      key={lead.lead_id}
                      onPress={() => setOpenLeadId(lead.lead_id)}
                      style={({ pressed }: any) => [
                        st.leadRow,
                        {
                          backgroundColor: pressed ? colors.primary + '08' : colors.surfaceAlt,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View style={st.leadRowTop}>
                        <Text style={[st.leadName, { color: colors.text }]} numberOfLines={1}>{lead.name}</Text>
                        {lead ? <WorkflowStatusBadge lead={lead} /> : null}
                      </View>
                      <Text style={[st.leadSub, { color: colors.textSecondary }]}>
                        {lead.phone}{lead.email ? ` · ${lead.email}` : ''}
                      </Text>
                      {project || lead.location ? (
                        <Text style={[st.leadMeta, { color: colors.textMuted }]} numberOfLines={2}>
                          {[project, lead.location].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                      {configLabel ? (
                        <Text style={[st.leadMeta, { color: colors.textMuted }]}>{configLabel}</Text>
                      ) : null}
                      {budgetLabel ? (
                        <Text style={[st.leadMeta, { color: colors.textMuted }]}>Budget: {budgetLabel} L</Text>
                      ) : null}
                      <View style={st.leadFoot}>
                        <Text style={[st.leadDate, { color: colors.textMuted }]}>{dateLabel}</Text>
                        {isHousing ? (
                          <Text style={[st.realBadgeSmall, { color: '#00BFA5' }]}>Housing.com · Original</Text>
                        ) : selectedPlatform?.platform === 'meta' ? (
                          <Text style={[st.realBadgeSmall, { color: '#1877F2' }]}>Facebook · Meta Lead Ads</Text>
                        ) : (
                          <Text style={[st.leadDate, { color: colors.textMuted }]}>{lead.source}</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </>
        )}
      </View>
      </View>

      <LeadDetailModal
        leadId={openLeadId}
        visible={openLeadId !== null}
        onClose={() => setOpenLeadId(null)}
        onChanged={() => {
          onChanged?.();
          if (selectedPlatform) loadPlatformLeads(selectedPlatform);
          loadData();
        }}
        userRole={userRole}
        overlayZIndex={10050}
      />
    </View>
  );

  if (Platform.OS === 'web') return content;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const st = StyleSheet.create({
  fullScreen: {
    flex: 1,
  },
  contentShell: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  body: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
    width: '100%',
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  backText: { fontSize: 13, fontWeight: '600' },
  headerIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  headerSub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  closeBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  centerBox: { flex: 1, padding: 40, alignItems: 'center', justifyContent: 'center' },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  platformScroll: { paddingVertical: 20, gap: 20 },
  platformGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  platformGridWide: { justifyContent: 'space-between' },
  platformCard: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 4,
    ...Platform.select({
      web: { cursor: 'pointer' as any },
      default: {},
    }),
  },
  platformCardWide: { flex: 1, minHeight: 280 },
  platformIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  platformLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  platformCount: { fontSize: 36, fontWeight: '800', letterSpacing: -1, marginTop: 2 },
  platformPct: { fontSize: 12, fontWeight: '700' },
  miniBar: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden', marginVertical: 6 },
  miniBarFill: { height: '100%', borderRadius: 3 },
  platformDetail: { fontSize: 11 },
  realBadge: { fontSize: 9, fontWeight: '700', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, textAlign: 'center' },
  tapHint: { fontSize: 11, fontWeight: '700', marginTop: 8 },
  hint: { fontSize: 10, textAlign: 'center', marginTop: 6 },
  leadList: { flex: 1 },
  leadListContent: { paddingBottom: 24, gap: 10 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 10,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 10,
    ...Platform.select({
      web: { cursor: 'pointer' as any },
      default: {},
    }),
  },
  tableHeadCell: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableCell: { fontSize: 12, lineHeight: 17 },
  colName: { flex: 1.2, minWidth: 120 },
  colContact: { flex: 1.1, minWidth: 120 },
  colLocation: { flex: 1.4, minWidth: 140 },
  colBudget: { flex: 0.8, minWidth: 90 },
  colStatus: { flex: 0.9, minWidth: 100 },
  colDate: { flex: 0.8, minWidth: 90 },
  leadRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
    ...Platform.select({
      web: { cursor: 'pointer' as any },
      default: {},
    }),
  },
  leadRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  leadName: { fontSize: 15, fontWeight: '700', flex: 1 },
  leadSub: { fontSize: 12 },
  leadMeta: { fontSize: 11, lineHeight: 16 },
  leadFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  leadDate: { fontSize: 10 },
  realBadgeSmall: { fontSize: 10, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 24,
    paddingTop: 20,
    marginTop: 8,
    borderTopWidth: 1,
  },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerDot: { width: 8, height: 8, borderRadius: 4 },
  footerText: { fontSize: 12, fontWeight: '600' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, marginTop: 4 },
  filterChip: { paddingHorizontal: 12, height: 30, borderRadius: 99, borderWidth: 1, justifyContent: 'center' },
});
