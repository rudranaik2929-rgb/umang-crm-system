import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions, Platform, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';
import { LeadDetailModal } from './LeadDetailModal';
import { WorkflowStatusBadge } from './Badge';
import {
  formatBudgetRangeLakhs,
  formatBudgetStringLakhs,
  formatHousingConfiguration,
  formatHousingLeadDate,
} from '../lib/leadFormat';
import { platformLabel } from '../lib/constants';

const { height: SCREEN_H } = Dimensions.get('window');

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
}

export function LeadSourceModal({ visible, onClose, userRole, onChanged }: Props) {
  const { colors } = useTheme();
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

  const backdropAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
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

  const canSyncIntegrations = ['admin', 'manager', 'marketing'].includes(String(userRole || '').toLowerCase());

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await api.get('/stats/leads-by-platform');
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
  }, [canSyncIntegrations]);

  const loadPlatformLeads = useCallback(async (platform: PlatformRow, filter: string = leadFilter) => {
    setLeadsLoading(true);
    setLeadsError(null);
    setSelectedPlatform(platform);
    setView('leads');
    try {
      const params: Record<string, any> = { limit: 500 };
      if (filter && filter !== 'all') params.status_filter = filter;
      const res = await api.get(`/leads/by-platform/${platform.platform}`, { params });
      setPlatformLeads(Array.isArray(res.data?.leads) ? res.data.leads : []);
      setListTotal(Number(res.data?.total ?? 0));
    } catch (e: any) {
      setLeadsError(e?.response?.data?.detail || 'Could not load leads.');
      setPlatformLeads([]);
      setListTotal(0);
    } finally {
      setLeadsLoading(false);
    }
  }, [leadFilter]);

  const handlePlatformPress = useCallback(async (platform: PlatformRow) => {
    // Open list immediately — do not wait for Housing/Meta sync (can take 30s+).
    await loadPlatformLeads(platform);

    if (!canSyncIntegrations) return;

    try {
      if (platform.platform === 'housing') {
        await api.post('/integrations/housing/poll', {});
        } else if (platform.platform === 'meta') {
          await api.post('/integrations/facebook/import', { days: 90, limit: 500 });
        }
      const res = await api.get('/stats/leads-by-platform');
      const normalized = normalizePlatformData(res.data);
      setData(normalized);
      const refreshed = normalized.platforms.find((p) => p.platform === platform.platform) || platform;
      await loadPlatformLeads(refreshed);
      onChanged?.();
    } catch {
      // List already visible from first loadPlatformLeads call
    }
  }, [canSyncIntegrations, loadPlatformLeads, onChanged]);

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

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 12, useNativeDriver: true }),
      ]).start();
    } else {
      backdropAnim.setValue(0);
      slideAnim.setValue(60);
      scaleAnim.setValue(0.92);
    }
  }, [backdropAnim, scaleAnim, slideAnim, visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 80, duration: 200, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  if (!visible) return null;

  const isWeb = Platform.OS === 'web';
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
    <View style={st.fullOverlay}>
      <Animated.View style={[st.backdrop, { opacity: backdropAnim }]}>
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
      </Animated.View>

      <Animated.View
        style={[
          st.card,
          view === 'leads' && st.cardWide,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          },
        ]}
        {...(isWeb ? { onStartShouldSetResponder: () => true } : {})}
      >
        <View style={st.header}>
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
                  {view === 'leads' && selectedPlatform ? selectedPlatform.label : 'Leads by Platform'}
                </Text>
                <Text style={[st.headerSub, { color: colors.textMuted }]}>
                  {view === 'leads' && selectedPlatform
                    ? `${listTotal || platformLeads.length} leads · tap to open details`
                    : data
                      ? `${data.total} classified leads · tap a platform`
                      : loading
                        ? 'Loading…'
                        : 'Database · Housing · Meta'}
                </Text>
              </View>
            </View>
          </View>
          <Pressable onPress={handleClose} style={[st.closeBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={[st.divider, { backgroundColor: colors.border }]} />

        {view === 'platforms' ? (
          loading ? (
            <View style={st.centerBox}>
              <Text style={{ color: colors.textMuted }}>Loading platforms…</Text>
            </View>
          ) : error ? (
            <View style={st.centerBox}>
              <Text style={{ color: colors.negative, textAlign: 'center', marginBottom: 12 }}>{error}</Text>
              <Pressable onPress={loadData} style={[st.retryBtn, { backgroundColor: colors.primary }]}>
                <Text style={st.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={st.platformGrid}>
              {ordered.map((platform) => {
                const meta = PLATFORM_UI[platform.platform] || PLATFORM_UI.other;
                const pct = data && data.total > 0 ? Math.round((platform.count / data.total) * 100) : 0;

                return (
                  <Pressable
                    key={platform.platform}
                    onPress={() => handlePlatformPress(platform)}
                    style={({ pressed }: any) => [
                      st.platformCard,
                      {
                        backgroundColor: colors.surfaceAlt,
                        borderColor: meta.color + '55',
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                  >
                    <View style={[st.platformIcon, { backgroundColor: meta.color + '18' }]}>
                      <Ionicons name={meta.icon} size={22} color={meta.color} />
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
                      {platform.count > 0 ? 'Tap to view leads →' : 'Tap to sync & view leads →'}
                    </Text>
                    {platform.count === 0 && platform.platform === 'housing' ? (
                      <Text style={[st.hint, { color: colors.warning }]}>Pulls latest from Housing.com</Text>
                    ) : platform.count === 0 && platform.platform === 'meta' ? (
                      <Text style={[st.hint, { color: colors.negative, textAlign: 'center' }]}>
                        {metaStatus || 'Re-imports from Meta webhook events'}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
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
          <ScrollView style={st.leadList} showsVerticalScrollIndicator={false}>
            {platformLeads.map((lead) => {
              const project = housingProjectLabel(lead);
              const isHousing = selectedPlatform?.platform === 'housing';
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
                  {(() => {
                    const raw = lead.raw_payload;
                    const budgetLabel = isHousing && raw && typeof raw === 'object'
                      ? formatBudgetRangeLakhs(raw.min_price, raw.max_price, lead.budget)
                      : formatBudgetStringLakhs(lead.budget);
                    const configLabel = isHousing && raw && typeof raw === 'object'
                      ? formatHousingConfiguration(raw as Record<string, unknown>)
                      : null;
                    return (
                      <>
                        {configLabel ? (
                          <Text style={[st.leadMeta, { color: colors.textMuted }]}>{configLabel}</Text>
                        ) : null}
                        {budgetLabel ? (
                          <Text style={[st.leadMeta, { color: colors.textMuted }]}>Budget: {budgetLabel} L</Text>
                        ) : null}
                      </>
                    );
                  })()}
                  <View style={st.leadFoot}>
                    <Text style={[st.leadDate, { color: colors.textMuted }]}>
                      {isHousing && lead.raw_payload && typeof lead.raw_payload === 'object'
                        ? formatHousingLeadDate((lead.raw_payload as any).lead_date, lead.created_at)
                        : formatDate(lead.created_at)}
                    </Text>
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

        {view === 'platforms' ? (
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
        ) : null}
      </Animated.View>

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

  if (isWeb) return content;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleClose}>
      {content}
    </Modal>
  );
}

const st = StyleSheet.create({
  fullOverlay: {
    ...Platform.select({
      web: { position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: 'box-none' as any },
      default: { flex: 1 },
    }),
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...Platform.select({
      web: { position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 },
      default: { ...StyleSheet.absoluteFillObject },
    }),
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: '94%',
    maxWidth: 720,
    maxHeight: SCREEN_H * 0.88,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    ...Platform.select({
      web: {
        position: 'relative' as any,
        zIndex: 10001,
        pointerEvents: 'auto' as any,
        cursor: 'default' as any,
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
      },
      default: { elevation: 30 },
    }),
  },
  cardWide: { maxWidth: 560 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  backText: { fontSize: 13, fontWeight: '600' },
  headerIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, marginVertical: 18 },
  centerBox: { padding: 40, alignItems: 'center' },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  platformGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  platformCard: {
    flexGrow: 1,
    flexBasis: 200,
    minWidth: 180,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    ...Platform.select({
      web: { cursor: 'pointer' as any },
      default: {},
    }),
  },
  platformIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  platformLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  platformCount: { fontSize: 32, fontWeight: '800', letterSpacing: -1, marginTop: 2 },
  platformPct: { fontSize: 12, fontWeight: '700' },
  miniBar: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden', marginVertical: 6 },
  miniBarFill: { height: '100%', borderRadius: 3 },
  platformDetail: { fontSize: 11 },
  realBadge: { fontSize: 9, fontWeight: '700', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, textAlign: 'center' },
  tapHint: { fontSize: 11, fontWeight: '700', marginTop: 8 },
  hint: { fontSize: 10, textAlign: 'center', marginTop: 6 },
  leadList: { maxHeight: SCREEN_H * 0.5 },
  leadRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
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
    gap: 24,
    paddingTop: 16,
    marginTop: 14,
    borderTopWidth: 1,
  },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerDot: { width: 8, height: 8, borderRadius: 4 },
  footerText: { fontSize: 12, fontWeight: '600' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterChip: { paddingHorizontal: 12, height: 30, borderRadius: 99, borderWidth: 1, justifyContent: 'center' },
});
