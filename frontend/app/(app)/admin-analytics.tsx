import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, TextInput, Platform } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api } from '../../src/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LeadSourceModal } from '../../src/components/LeadSourceModal';

const ADMIN_PIN = '9999';
const SESSION_KEY = 'umang_admin_unlocked';
const GOLD = '#D4A843';
const CARD_BG = '#0D1B2A';
const CARD_BORDER = '#1B2E45';

function isUnlocked(): boolean {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.sessionStorage.getItem(SESSION_KEY) === '1';
    }
  } catch {}
  return false;
}

function setUnlocked(v: boolean) {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (v) window.sessionStorage.setItem(SESSION_KEY, '1');
      else window.sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {}
}

export default function AdminAnalytics() {
  const { colors } = useTheme();
  const router = useRouter();
  const [unlocked, setUnlockedState] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [graphData, setGraphData] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);

  useEffect(() => { setUnlockedState(isUnlocked()); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, g, e] = await Promise.all([
        api.get('/stats/dashboard'),
        api.get('/stats/dashboard/graph'),
        api.get('/stats/employees'),
      ]);
      setStats(s.data);
      setGraphData(g.data);
      setEmployees(e.data || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (unlocked) load(); }, [unlocked, load]);

  const submitPin = () => {
    setError(null);
    if (pin.trim() === ADMIN_PIN) {
      setUnlocked(true);
      setUnlockedState(true);
      setPin('');
    } else { setError('Incorrect PIN. Try again.'); }
  };

  if (!unlocked) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Admin Analytics" subtitle="Restricted Access" />
        <View style={styles.gateWrap}>
          <View style={[styles.gateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.lockCircle, { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}>
              <Ionicons name="lock-closed" size={28} color={colors.accent} />
            </View>
            <Text style={[styles.gateTitle, { color: colors.text }]}>Admin Command Center</Text>
            <Text style={[styles.gateDesc, { color: colors.textSecondary }]}>
              Revenue, detailed performance scores, and growth charts are restricted to administrators.
            </Text>
            <TextInput
              value={pin}
              onChangeText={(v) => setPin(v.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={4}
              onSubmitEditing={submitPin}
              style={[styles.pinInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceAlt }]}
            />
            {error && <Text style={{ color: colors.negative, fontSize: 12, marginTop: 8 }}>{error}</Text>}
            <Pressable onPress={submitPin} style={[styles.unlockBtn, { backgroundColor: colors.primary }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Unlock Full Analytics</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const sd = stats?.stage_distribution || {};
  const totalLeads = stats?.total_leads || 0;
  const hotCount = (sd.positive || 0) + (sd.site_visit || 0) + (sd.booking || 0) + (sd.loan || 0) + (sd.registration || 0) + (sd.closed || 0);
  const warmCount = sd.contacted || 0;
  const coldCount = sd.new || 0;
  const perfScore = totalLeads > 0 ? Math.min(100, Math.round((hotCount / totalLeads) * 100)) : 0;
  const revenue = stats?.revenue_pipeline || 0;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Command Analytics" subtitle="Revenue & Performance Intelligence" />
      <ScrollView contentContainerStyle={styles.content}>
        {loading || !stats ? (
          <View style={{ padding: 60, alignItems: 'center' }}><ActivityIndicator color={GOLD} size="large" /></View>
        ) : (
          <>
            {/* ====== HERO: System Performance ====== */}
            <View style={[styles.hero, { backgroundColor: '#0D1B2A', borderColor: GOLD + '40' }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>ADMIN INTELLIGENCE</Text>
                <Text style={styles.heroTitle}>Performance Overview</Text>
                <View style={styles.heroPills}>
                  <View style={styles.heroPill}><Text style={styles.heroPillText}>{stats?.employees || 0} Team Members</Text></View>
                  <View style={styles.heroPill}><Text style={styles.heroPillText}>{totalLeads} Total Leads</Text></View>
                </View>
                <Text style={styles.heroDesc}>
                  Total pipeline revenue stands at ₹{(revenue / 100000).toFixed(1)}L. Conversion efficiency is calculated based on hot lead progression.
                </Text>
              </View>
              <View style={styles.gaugeWrap}>
                <GaugeChart score={perfScore} />
                <Text style={styles.gaugeLabel}>CONVERSION SCORE</Text>
              </View>
            </View>

            {/* ====== DETAILED STAT CARDS ====== */}
            <View style={styles.tempGrid}>
              <TempCard icon="flame" label="Hot Leads" value={hotCount} color="#EF4444" desc="Booking Potential" />
              <TempCard icon="sunny" label="Warm Leads" value={warmCount} color="#F59E0B" desc="Follow-up Queue" />
              <TempCard icon="cash-outline" label="Revenue" value={`₹${(revenue / 100000).toFixed(1)}L`} color={GOLD} desc="Monthly Pipeline" />
              <TempCard icon="people-outline" label="Employees" value={employees.length} color="#3B82F6" desc="Active Force" />
            </View>

            {/* ====== GROWTH CHARTS ====== */}
            <View style={styles.chartRow}>
              {graphData?.leads_by_day && (
                <View style={[styles.card, { flex: 1.2 }]}>
                  <Text style={styles.cardTitle}>Acquisition Flow (30D)</Text>
                  <SVGLineChart data={graphData.leads_by_day.map((d: any) => ({ label: d.date.slice(8), value: d.count }))} color="#3B82F6" height={200} />
                </View>
              )}
              {graphData?.revenue_by_month && (
                <View style={[styles.card, { flex: 1 }]}>
                  <Text style={styles.cardTitle}>Revenue Pipeline (12M)</Text>
                  <SVGLineChart data={graphData.revenue_by_month.map((d: any) => ({ label: new Date(d.month + '-01').toLocaleString('en', { month: 'short' }), value: d.revenue }))} color={GOLD} height={200} formatY={(v: number) => `${Math.round(v / 100000)}L`} />
                </View>
              )}
            </View>

            {/* ====== EMPLOYEE LEADERBOARD ====== */}
            <View style={[styles.card, { padding: 24 }]}>
              <Text style={styles.cardTitle}>Employee Performance Leaderboard</Text>
              <View style={{ marginTop: 20, gap: 12 }}>
                {employees.sort((a,b) => b.actions_total - a.actions_total).slice(0, 5).map((e, idx) => (
                  <View key={e.employee_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1B2E45' }}>
                    <Text style={{ color: GOLD, fontWeight: '700', width: 24 }}>#{idx + 1}</Text>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{e.name[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '600' }}>{e.name}</Text>
                      <Text style={{ color: '#ffffff60', fontSize: 10 }}>{e.department}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: GOLD, fontWeight: '700' }}>{e.actions_total}</Text>
                      <Text style={{ color: '#ffffff40', fontSize: 9 }}>ACTIONS</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
      <LeadSourceModal visible={sourceModalVisible} onClose={() => setSourceModalVisible(false)} />
    </View>
  );
}

function TempCard({ icon, label, value, color, desc }: any) {
  return (
    <View style={[styles.tempCard, { borderColor: CARD_BORDER }]}>
      <View style={[styles.tempIcon, { backgroundColor: color + '15' }]}><Ionicons name={icon} size={22} color={color} /></View>
      <View><Text style={styles.tempLabel}>{label.toUpperCase()}</Text><Text style={[styles.tempVal, { color }]}>{value}</Text><Text style={styles.tempDesc}>{desc}</Text></View>
    </View>
  );
}

function GaugeChart({ score }: { score: number }) {
  const isWeb = Platform.OS === 'web';
  if (!isWeb) return <View style={{ height: 80, justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>{score}%</Text></View>;
  const angle = (score / 100) * 180;
  const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
    const rad = (a: number) => (a * Math.PI) / 180;
    const x1 = cx + r * Math.cos(rad(startAngle)), y1 = cy + r * Math.sin(rad(startAngle));
    const x2 = cx + r * Math.cos(rad(endAngle)), y2 = cy + r * Math.sin(rad(endAngle));
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  return (
    <View style={{ alignItems: 'center', width: 140, height: 90 }}>
      <svg viewBox="0 0 200 110" style={{ width: 140, height: 90 } as any}>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1B2E45" strokeWidth="14" strokeLinecap="round" />
        <path d={describeArc(100, 100, 80, 180, 180 + angle)} fill="none" stroke={GOLD} strokeWidth="14" strokeLinecap="round" />
        <text x="100" y="90" textAnchor="middle" fill="#ffffff" fontSize="28" fontWeight="700">{score}%</text>
      </svg>
    </View>
  );
}

function SVGLineChart({ data, color, height, formatY }: any) {
  const isWeb = Platform.OS === 'web';
  if (!isWeb || data.length < 2) return <View style={{ height, backgroundColor: '#ffffff05', borderRadius: 8 }} />;
  const max = Math.max(1, ...data.map((d: any) => d.value));
  const buildPath = () => {
    let p = `M 0 ${100 - (data[0].value / max) * 90}`;
    const step = 100 / (data.length - 1);
    for (let i = 0; i < data.length - 1; i++) {
      const x1 = i * step, y1 = 100 - (data[i].value / max) * 90, x2 = (i + 1) * step, y2 = 100 - (data[i+1].value / max) * 90;
      p += ` C ${x1 + step/2} ${y1}, ${x2 - step/2} ${y2}, ${x2} ${y2}`;
    }
    return p;
  };
  const linePath = buildPath(), areaPath = linePath + ` L 100 100 L 0 100 Z`;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 40, justifyContent: 'space-between', height }}>
          {[...Array(5)].map((_, i) => <Text key={i} style={{ color: '#ffffff40', fontSize: 8, textAlign: 'right', paddingRight: 4 }}>{formatY ? formatY(Math.round(max * (1 - i/4))) : Math.round(max * (1 - i/4))}</Text>)}
        </View>
        <View style={{ flex: 1, height }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' } as any}>
            <defs><linearGradient id={`a-${color}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
            <path d={areaPath} fill={`url(#a-${color})`} /><path d={linePath} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </svg>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 24 },
  card: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER, padding: 24 },
  cardTitle: { color: '#ffffffE0', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  hero: { flexDirection: 'row', padding: 32, borderRadius: 20, borderWidth: 1, alignItems: 'center', gap: 32 },
  kicker: { color: GOLD, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  heroTitle: { color: '#fff', fontSize: 32, fontWeight: '700', letterSpacing: -1, marginTop: 8 },
  heroPills: { flexDirection: 'row', gap: 8, marginTop: 16 },
  heroPill: { backgroundColor: '#1B2E45', paddingHorizontal: 10, height: 24, borderRadius: 99, justifyContent: 'center' },
  heroPillText: { color: '#ffffffB0', fontSize: 10, fontWeight: '600' },
  heroDesc: { color: '#ffffff80', fontSize: 14, lineHeight: 22, marginTop: 20, maxWidth: 500 },
  gaugeWrap: { alignItems: 'center', width: 200 },
  gaugeLabel: { color: '#ffffff60', fontSize: 10, fontWeight: '700', marginTop: 12 },
  tempGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  tempCard: { flex: 1, minWidth: 220, backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, padding: 20, flexDirection: 'row', gap: 16, alignItems: 'center' },
  tempIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tempLabel: { color: '#ffffff60', fontSize: 10, fontWeight: '700' },
  tempVal: { fontSize: 26, fontWeight: '700', color: '#fff' },
  tempDesc: { color: '#ffffff40', fontSize: 11 },
  chartRow: { flexDirection: 'row', gap: 16 },
  // gate
  gateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  gateCard: { width: '100%', maxWidth: 440, padding: 32, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  lockCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  gateTitle: { fontSize: 22, fontWeight: '700', marginTop: 18 },
  gateDesc: { fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  pinInput: { height: 56, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 8, width: '100%', marginTop: 20 },
  unlockBtn: { marginTop: 18, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
});
