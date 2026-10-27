import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '../../src/components/TopBar';
import { StatCard } from '../../src/components/StatCard';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api, downloadMonthlyLeadsExport, downloadStoredLeadsExport } from '../../src/lib/api';
import { isAdminRole, isSupervisor, isTeamLead } from '../../src/lib/constants';

// ---- API shapes (docs/TEAM_LEADS.md §4 "Lead exports") ----
type DayRow = {
  date: string;
  count: number;
  housing: number;
  meta: number;
  manual: number;
  other: number;
  brokerage: number;
};

type HistoryRow = {
  export_id: string;
  month: string;
  scope?: string;
  team_lead_id?: string | null;
  file_name?: string | null;
  row_count?: number;
  stored?: boolean;
  kind?: string;
  created_by_name?: string | null;
  created_at?: string | null;
};

type Summary = {
  month: string;
  total: number;
  days: DayRow[];
  by_platform: Record<string, number>;
  by_status: { active?: number; negative?: number };
  by_team: Record<string, number>;
  average_per_day: number;
  busiest_day: { date: string; count: number } | null;
  scope?: string;
  history?: HistoryRow[];
  history_ready?: boolean;
  storage_bucket?: string;
  generated_at?: string;
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PLATFORM_COLUMNS: { key: keyof DayRow; label: string; color: string }[] = [
  { key: 'housing', label: 'Housing', color: '#0284C7' },
  { key: 'meta', label: 'Meta', color: '#6366F1' },
  { key: 'manual', label: 'Database', color: '#059669' },
  { key: 'other', label: 'Other', color: '#A38B7D' },
  { key: 'brokerage', label: 'Broker', color: '#D97706' },
];

function pad2(v: number) { return v < 10 ? `0${v}` : String(v); }

/** Today's calendar date in IST (Asia/Kolkata) — the backend buckets months/days in IST,
 *  so the browser's own time zone must not decide what "this month" is. */
function istToday(): { y: number; m: number; d: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const y = get('year');
    const m = get('month');
    const d = get('day');
    if (y && m && d) return { y, m, d };
  } catch {}
  // IST is a fixed UTC+05:30 (no DST).
  const ist = new Date(Date.now() + 330 * 60 * 1000);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth() + 1, d: ist.getUTCDate() };
}

function currentMonthKey(): string {
  const { y, m } = istToday();
  return `${y}-${pad2(m)}`;
}

function todayIso(): string {
  const { y, m, d } = istToday();
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthLabel(month?: string | null): string {
  if (!month) return '';
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** "2026-10-06" → "Mon 06 Oct" (parsed as a local calendar date, no TZ shift). */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return `${WEEKDAY_SHORT[date.getDay()]} ${pad2(d)} ${MONTH_SHORT[m - 1]}`;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Errors from blob downloads carry the JSON body as a Blob — read `detail` out of it. */
async function errorDetail(e: any, fallback: string): Promise<string> {
  const data = e?.response?.data;
  try {
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const parsed = JSON.parse(await data.text());
      if (typeof parsed?.detail === 'string' && parsed.detail.trim()) return parsed.detail;
    }
  } catch {}
  const detail = data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (e?.response?.status === 401) return 'Session expired. Please log in again.';
  if (e?.code === 'ECONNABORTED' || String(e?.message || '').toLowerCase().includes('timeout')) {
    return `${fallback} The server took too long — try again in a minute.`;
  }
  return e?.message || fallback;
}

type ExportNotice = { kind: 'ok' | 'warn' | 'error'; text: string } | null;

export default function ExportLeadsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role, user?.email);
  const allowed = isSupervisor(user?.role, user?.email);
  const teamLead = !isAdmin && isTeamLead(user?.role);
  const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

  const thisMonth = currentMonthKey();
  const [month, setMonth] = useState(thisMonth);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<ExportNotice>(null);
  const [historyBusy, setHistoryBusy] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async (m: string, quiet = false) => {
    if (!allowed) { setLoading(false); return; }
    const seq = ++requestSeq.current;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await api.get('/exports/leads/summary', { params: { month: m }, timeout: 120000 });
      if (seq !== requestSeq.current) return;
      const d = res.data || {};
      setSummary({
        month: d.month || m,
        total: num(d.total),
        days: Array.isArray(d.days) ? d.days : [],
        by_platform: d.by_platform || {},
        by_status: d.by_status || {},
        by_team: d.by_team || {},
        average_per_day: num(d.average_per_day),
        busiest_day: d.busiest_day || null,
        scope: d.scope,
        history: Array.isArray(d.history) ? d.history : [],
        history_ready: d.history_ready !== false,
        storage_bucket: d.storage_bucket,
        generated_at: d.generated_at,
      });
    } catch (e: any) {
      if (seq !== requestSeq.current) return;
      setError(await errorDetail(e, 'Could not load the month summary.'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [allowed]);

  useEffect(() => { load(month); }, [load, month]);

  const goMonth = (delta: number) => {
    const next = shiftMonth(month, delta);
    if (next > thisMonth) return;
    setNotice(null);
    setMonth(next);
  };

  const runExport = async () => {
    if (exporting) return;
    if (!isWeb) {
      setNotice({ kind: 'warn', text: 'Excel download works on the web app. Open the CRM in a browser to export.' });
      return;
    }
    setExporting(true);
    setNotice(null);
    try {
      const r = await downloadMonthlyLeadsExport(month);
      setNotice(r.stored
        ? { kind: 'ok', text: `Downloaded ${r.rows} leads · saved to backend archive` }
        : { kind: 'warn', text: `Downloaded ${r.rows} leads, but the copy could not be saved to Supabase Storage (check the ${summary?.storage_bucket || 'lead-exports'} bucket).` });
      await load(month, true);
    } catch (e: any) {
      setNotice({ kind: 'error', text: await errorDetail(e, 'Export failed.') });
    } finally { setExporting(false); }
  };

  const downloadHistory = async (row: HistoryRow) => {
    if (!isWeb) {
      setHistoryError('Downloads work on the web app. Open the CRM in a browser.');
      return;
    }
    setHistoryBusy(row.export_id);
    setHistoryError(null);
    try {
      await downloadStoredLeadsExport(row.export_id);
    } catch (e: any) {
      setHistoryError(await errorDetail(e, 'Could not download that export.'));
    } finally { setHistoryBusy(null); }
  };

  const days = summary?.days || [];
  const today = todayIso();
  const maxDay = useMemo(() => Math.max(1, ...days.map((d) => num(d.count))), [days]);
  const totals = useMemo(() => {
    const t: Record<string, number> = { count: 0, housing: 0, meta: 0, manual: 0, other: 0, brokerage: 0 };
    for (const d of days) {
      for (const k of Object.keys(t)) t[k] += num((d as any)[k]);
    }
    return t;
  }, [days]);
  const undated = summary ? Math.max(0, summary.total - totals.count) : 0;
  const teamEntries = useMemo(() => Object.entries(summary?.by_team || {}).sort((a, b) => b[1] - a[1]), [summary]);
  const teamMax = Math.max(1, ...teamEntries.map(([, v]) => num(v)));
  const history = summary?.history || [];

  const scopeIsTeam = teamLead || (summary?.scope ? summary.scope.startsWith('team:') : false);
  const subtitle = scopeIsTeam
    ? `Your team's leads${user?.name ? ` (${user.name})` : ''} · ${monthLabel(month)}`
    : `All teams · every lead received in ${monthLabel(month)}`;

  const exportLabel = `Export ${monthLabel(month)} to Excel`;

  const renderExportButton = (testID: string, big = false) => (
    <Pressable
      testID={testID}
      onPress={runExport}
      disabled={exporting || loading}
      style={[big ? styles.bigBtn : styles.primary, { backgroundColor: colors.primary, opacity: exporting || loading ? 0.7 : 1 }]}
    >
      {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="download-outline" size={big ? 16 : 14} color="#fff" />}
      <Text style={[styles.primaryText, big && { fontSize: 13 }]}>{exporting ? 'Preparing Excel…' : exportLabel}</Text>
    </Pressable>
  );

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <TopBar title="Export Leads" subtitle="Administrator and Team Leads only" />
        <View style={{ padding: 24, flex: 1 }}>
          <EmptyState
            title="Not available"
            description="Monthly lead exports are for the administrator and Team Leads."
          />
        </View>
      </View>
    );
  }

  const busiest = summary?.busiest_day;
  const active = num(summary?.by_status?.active);
  const negative = num(summary?.by_status?.negative);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title="Export Leads" subtitle={subtitle} rightAction={renderExportButton('export-month-topbar')} />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        {/* Month picker */}
        <View style={[styles.monthBar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Pressable
            testID="export-prev-month"
            onPress={() => goMonth(-1)}
            style={[styles.arrowBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            accessibilityLabel="Previous month"
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <View style={{ alignItems: 'center', minWidth: 170 }}>
            <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel(month)}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              {month === thisMonth ? 'Current month · IST calendar' : 'IST calendar month'}
            </Text>
          </View>
          <Pressable
            testID="export-next-month"
            onPress={() => goMonth(1)}
            disabled={month >= thisMonth}
            style={[styles.arrowBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: month >= thisMonth ? 0.35 : 1 }]}
            accessibilityLabel="Next month"
          >
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
          {month !== thisMonth ? (
            <Pressable onPress={() => { setNotice(null); setMonth(thisMonth); }} style={[styles.outlineBtnSm, { borderColor: colors.primary }]}>
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 12 }}>This month</Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
          {loading && summary ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          <Pressable onPress={() => load(month)} hitSlop={10} accessibilityLabel="Refresh" testID="export-refresh">
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Pressable>
        </View>

        {notice ? (
          <View style={[styles.banner, {
            borderColor: notice.kind === 'ok' ? colors.positive : notice.kind === 'warn' ? colors.warning : colors.negative,
            backgroundColor: (notice.kind === 'ok' ? colors.positive : notice.kind === 'warn' ? colors.warning : colors.negative) + '12',
          }]}>
            <Ionicons
              name={notice.kind === 'ok' ? 'checkmark-circle-outline' : notice.kind === 'warn' ? 'warning-outline' : 'alert-circle-outline'}
              size={18}
              color={notice.kind === 'ok' ? colors.positive : notice.kind === 'warn' ? colors.warning : colors.negative}
            />
            <Text style={[styles.bannerText, { color: notice.kind === 'error' ? colors.negative : colors.text }]}>{notice.text}</Text>
            <Pressable onPress={() => setNotice(null)} hitSlop={10}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <View style={[styles.banner, { borderColor: colors.negative, backgroundColor: colors.negative + '12' }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.negative} />
            <Text style={[styles.bannerText, { color: colors.negative }]}>{error}</Text>
            <Pressable onPress={() => load(month)} style={[styles.outlineBtnSm, { borderColor: colors.negative }]}>
              <Text style={{ color: colors.negative, fontWeight: '600', fontSize: 12 }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {loading && !summary ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : null}

        {summary ? (
          <View style={{ gap: 16, opacity: loading ? 0.6 : 1 }}>
            {summary.month !== month ? (
              loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} /> : null
            ) : (
              <>
                <View style={styles.statRow}>
                  <StatCard
                    testID="export-stat-total"
                    label="Total leads this month"
                    value={summary.total}
                    delta={`Every lead received in ${monthLabel(month)}`}
                    icon="albums-outline"
                  />
                  <StatCard
                    testID="export-stat-average"
                    label="Average per day"
                    value={summary.average_per_day}
                    delta={month === thisMonth ? 'Days elapsed so far' : 'Across the whole month'}
                    icon="trending-up-outline"
                    accent={colors.info}
                  />
                  <StatCard
                    testID="export-stat-busiest"
                    label="Busiest day"
                    value={busiest ? busiest.count : '—'}
                    delta={busiest ? dayLabel(busiest.date) : 'No leads yet'}
                    icon="flame-outline"
                    accent={colors.warning}
                  />
                  <StatCard
                    testID="export-stat-status"
                    label="Active vs not interested"
                    value={`${active} / ${negative}`}
                    delta={`${active} active · ${negative} not interested`}
                    icon="pulse-outline"
                    accent={colors.positive}
                  />
                </View>

                <View style={styles.platformRow}>
                  {PLATFORM_COLUMNS.map((p) => (
                    <View key={p.key} style={[styles.platformTile, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.dot, { backgroundColor: p.color }]} />
                        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          {p.key === 'brokerage' ? 'Broker pool' : p.key === 'manual' ? 'Database (manual)' : p.label}
                        </Text>
                      </View>
                      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{num(summary.by_platform?.[p.key as string])}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.note, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, flex: 1 }}>
                    Counts include every lead received this month — broker-pool and not-interested leads too — so nothing is missing from the export.
                    {isAdmin
                      ? " Last month's export is archived automatically at month end."
                      : " Your history below lists your team's own exports; your administrator's month-end archive covers every team."}
                  </Text>
                </View>

                {/* Per-day table */}
                <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <View style={[styles.cardHead, { borderBottomColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                    <View style={{ flex: 1, minWidth: 200 }}>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>Leads per day — {monthLabel(month)}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                        {days.length} days · {summary.total} leads{scopeIsTeam ? " · your team's leads only" : ''}
                      </Text>
                    </View>
                    {renderExportButton('export-month-table', true)}
                  </View>
                  <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                    <View style={{ flex: 1, minWidth: 820 }}>
                      <View style={[styles.tHead, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.th, { color: colors.textMuted, width: 110 }]}>DATE</Text>
                        <Text style={[styles.th, styles.numCol, { color: colors.textMuted }]}>TOTAL</Text>
                        {PLATFORM_COLUMNS.map((p) => (
                          <Text key={p.key} style={[styles.th, styles.numCol, { color: colors.textMuted }]}>{p.label.toUpperCase()}</Text>
                        ))}
                        <Text style={[styles.th, { color: colors.textMuted, flex: 1, paddingLeft: 16 }]}>VOLUME</Text>
                      </View>
                      {days.length === 0 ? (
                        <Text style={{ color: colors.textMuted, fontSize: 13, padding: 16 }}>No days returned for this month.</Text>
                      ) : days.map((d) => {
                        const isToday = d.date === today;
                        const isFuture = d.date > today;
                        const count = num(d.count);
                        return (
                          <View
                            key={d.date}
                            testID={`export-day-${d.date}`}
                            style={[styles.tRow, {
                              borderBottomColor: colors.border,
                              backgroundColor: isToday ? colors.primary + '14' : 'transparent',
                              opacity: isFuture ? 0.45 : 1,
                            }]}
                          >
                            <View style={{ width: 110, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ color: colors.text, fontSize: 12, fontWeight: isToday ? '800' : '600' }}>{dayLabel(d.date)}</Text>
                              {isToday ? <Badge text="TODAY" color={colors.primary} /> : null}
                            </View>
                            <Text style={[styles.numCol, styles.numCell, { color: count ? colors.text : colors.textMuted, fontWeight: '700' }]}>{count}</Text>
                            {PLATFORM_COLUMNS.map((p) => {
                              const v = num(d[p.key]);
                              return (
                                <Text key={p.key} style={[styles.numCol, styles.numCell, { color: v ? colors.textSecondary : colors.textMuted }]}>{v}</Text>
                              );
                            })}
                            <View style={{ flex: 1, paddingLeft: 16 }}>
                              <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
                                {count > 0 ? (
                                  <View style={{ flexDirection: 'row', width: `${Math.max(2, (count / maxDay) * 100)}%`, height: '100%', borderRadius: 4, overflow: 'hidden' }}>
                                    {PLATFORM_COLUMNS.map((p) => {
                                      const v = num(d[p.key]);
                                      return v ? <View key={p.key} style={{ flex: v, backgroundColor: p.color }} /> : null;
                                    })}
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                      <View style={[styles.tRow, styles.totalRow, { borderTopColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                        <Text style={{ width: 110, color: colors.text, fontSize: 12, fontWeight: '800' }}>Month total</Text>
                        <Text style={[styles.numCol, styles.numCell, { color: colors.text, fontWeight: '800' }]}>{totals.count}</Text>
                        {PLATFORM_COLUMNS.map((p) => (
                          <Text key={p.key} style={[styles.numCol, styles.numCell, { color: colors.text, fontWeight: '700' }]}>{totals[p.key as string]}</Text>
                        ))}
                        <View style={{ flex: 1, paddingLeft: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                          {PLATFORM_COLUMNS.map((p) => (
                            <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <View style={[styles.dot, { backgroundColor: p.color }]} />
                              <Text style={{ color: colors.textMuted, fontSize: 10 }}>{p.label}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  </ScrollView>
                  {undated > 0 ? (
                    <Text style={{ color: colors.warning, fontSize: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
                      {undated} lead{undated === 1 ? '' : 's'} counted in the month total could not be placed on a day (missing created date). They are still in the Excel export.
                    </Text>
                  ) : null}
                </View>

                {/* By team */}
                {isAdmin && teamEntries.length > 0 ? (
                  <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <View style={[styles.cardHead, { borderBottomColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                      <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]}>By team</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Who owns this month's leads now</Text>
                    </View>
                    {teamEntries.map(([name, count]) => (
                      <View key={name} style={[styles.teamRow, { borderBottomColor: colors.border }]}>
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', width: 180 }} numberOfLines={1}>{name}</Text>
                        <View style={{ flex: 1 }}>
                          <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
                            <View style={{
                              width: `${Math.max(2, (num(count) / teamMax) * 100)}%`, height: '100%', borderRadius: 4,
                              backgroundColor: name === 'Admin pool' ? colors.warning : colors.primary,
                            }} />
                          </View>
                        </View>
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', width: 60, textAlign: 'right' }}>{num(count)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            )}

            {/* Export history */}
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={[styles.cardHead, { borderBottomColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Export history</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    Every export is saved in the backend archive{summary.storage_bucket ? ` (${summary.storage_bucket})` : ''} and can be downloaded again.
                  </Text>
                </View>
              </View>
              {summary.history_ready === false ? (
                <View style={[styles.banner, { margin: 12, borderColor: colors.warning, backgroundColor: colors.warning + '14' }]}>
                  <Ionicons name="warning-outline" size={16} color={colors.warning} />
                  <Text style={[styles.bannerText, { color: colors.text }]}>
                    Export history is not set up yet. Run supabase/TEAM_LEADS_AND_EXPORTS.sql in the Supabase SQL Editor. Downloads still work.
                  </Text>
                </View>
              ) : null}
              {historyError ? <Text style={{ color: colors.negative, fontSize: 12, paddingHorizontal: 16, paddingTop: 10 }}>{historyError}</Text> : null}
              {history.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 13, padding: 16 }}>
                  No exports yet. Use "{exportLabel}" to create the first one.
                </Text>
              ) : (
                <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                  <View style={{ flex: 1, minWidth: 760 }}>
                    <View style={[styles.tHead, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.th, { color: colors.textMuted, width: 130 }]}>MONTH</Text>
                      <Text style={[styles.th, { color: colors.textMuted, width: 70, textAlign: 'right' }]}>ROWS</Text>
                      <Text style={[styles.th, { color: colors.textMuted, width: 130, paddingLeft: 16 }]}>KIND</Text>
                      <Text style={[styles.th, { color: colors.textMuted, flex: 1 }]}>CREATED BY</Text>
                      <Text style={[styles.th, { color: colors.textMuted, width: 160 }]}>CREATED AT</Text>
                      <Text style={[styles.th, { color: colors.textMuted, width: 90 }]}>STORED</Text>
                      <Text style={[styles.th, { color: colors.textMuted, width: 110, textAlign: 'right' }]}>FILE</Text>
                    </View>
                    {history.map((h) => {
                      const stored = !!h.stored;
                      const busy = historyBusy === h.export_id;
                      return (
                        <View key={h.export_id} style={[styles.tRow, { borderBottomColor: colors.border }]}>
                          <Text style={{ width: 130, color: colors.text, fontSize: 13, fontWeight: '600' }}>{monthLabel(h.month)}</Text>
                          <Text style={{ width: 70, color: colors.text, fontSize: 13, textAlign: 'right' }}>{num(h.row_count)}</Text>
                          <View style={{ width: 130, paddingLeft: 16 }}>
                            <Badge
                              text={h.kind === 'auto' ? 'AUTO MONTH-END' : 'MANUAL'}
                              color={h.kind === 'auto' ? colors.info : colors.primary}
                            />
                          </View>
                          <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>{h.created_by_name || '—'}</Text>
                          <Text style={{ width: 160, color: colors.textSecondary, fontSize: 12 }}>{formatDateTime(h.created_at)}</Text>
                          <View style={{ width: 90 }}>
                            <Badge text={stored ? 'STORED' : 'NOT STORED'} color={stored ? colors.positive : colors.negative} />
                          </View>
                          <View style={{ width: 110, alignItems: 'flex-end' }}>
                            <Pressable
                              testID={`export-history-download-${h.export_id}`}
                              onPress={() => downloadHistory(h)}
                              disabled={!stored || busy}
                              style={[styles.smallBtnOutline, { borderColor: stored ? colors.primary : colors.border, opacity: stored ? 1 : 0.45 }]}
                            >
                              {busy ? <ActivityIndicator size="small" color={colors.primary} /> : (
                                <Ionicons name="download-outline" size={13} color={stored ? colors.primary : colors.textMuted} />
                              )}
                              <Text style={{ color: stored ? colors.primary : colors.textMuted, fontWeight: '600', fontSize: 12 }}>Download</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 8 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  bigBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, height: 42, borderRadius: 10 },
  outlineBtnSm: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 8, borderWidth: 1 },
  smallBtnOutline: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 7, borderWidth: 1 },
  monthBar: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  arrowBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 18, fontWeight: '700' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 18 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  platformTile: { flexGrow: 1, flexBasis: 150, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
  card: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  tHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  th: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  totalRow: { borderTopWidth: 1, borderBottomWidth: 0, paddingVertical: 10 },
  numCol: { width: 72, textAlign: 'right' },
  numCell: { fontSize: 12 },
  barTrack: { height: 10, borderRadius: 4, overflow: 'hidden' },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
