import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api, getSnapshot, setSnapshot } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { Ionicons } from '@expo/vector-icons';

const STATUS_COLOR: Record<string, string> = { draft: '#94A3B8', scheduled: '#0284C7', sent: '#059669', failed: '#E11D48' };

export default function WhatsApp() {
  const { colors } = useTheme();
  const cachedWa = getSnapshot<any>('whatsapp-page');
  const [tab, setTab] = useState<'campaigns' | 'templates'>('campaigns');
  const [campaigns, setCampaigns] = useState<any[]>(cachedWa?.campaigns ?? []);
  const [templates, setTemplates] = useState<any[]>(cachedWa?.templates ?? []);
  const [loading, setLoading] = useState(!cachedWa);
  const [showCampaign, setShowCampaign] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([api.get('/campaigns'), api.get('/templates')]);
      const nextC = c.data || [];
      const nextT = t.data || [];
      setCampaigns(nextC); setTemplates(nextT);
      setSnapshot('whatsapp-page', { campaigns: nextC, templates: nextT });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sendCampaign = async (id: string) => {
    setBusy(id);
    try { await api.post(`/campaigns/${id}/send`); await load(); }
    finally { setBusy(null); }
  };

  const deleteCampaign = async (id: string) => {
    setBusy(id);
    try { await api.delete(`/campaigns/${id}`); await load(); }
    finally { setBusy(null); }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="WhatsApp Outbound Campaigns"
        subtitle="Broadcast, schedule & track delivery"
        rightAction={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable testID="wa-create-template" onPress={() => setShowTemplate(true)}
              style={[styles.secondary, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="document-text-outline" size={14} color={colors.text} />
              <Text style={[styles.secondaryText, { color: colors.text }]}>Create Template</Text>
            </Pressable>
            <Pressable testID="wa-create-campaign" onPress={() => setShowCampaign(true)}
              style={[styles.primary, { backgroundColor: colors.primary }]}>
              <Ionicons name="paper-plane" size={14} color="#fff" />
              <Text style={styles.primaryText}>New Campaign</Text>
            </Pressable>
          </View>
        }
      />
      {/* Stats */}
      <View style={styles.statsRow}>
        <StatPill label="Total Campaigns" value={campaigns.length} icon="rocket-outline" colors={colors} />
        <StatPill label="Sent" value={campaigns.filter((c) => c.status === 'sent').length} icon="checkmark-done-outline" colors={colors} c={colors.positive} />
        <StatPill label="Scheduled" value={campaigns.filter((c) => c.status === 'scheduled').length} icon="time-outline" colors={colors} c={colors.info} />
        <StatPill label="Templates" value={templates.length} icon="document-outline" colors={colors} c={colors.accent} />
      </View>

      {/* Tab switcher */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {['campaigns', 'templates'].map((t) => (
          <Pressable key={t} testID={`wa-tab-${t}`} onPress={() => setTab(t as any)}
            style={[styles.tab, { borderBottomColor: tab === t ? colors.primary : 'transparent' }]}>
            <Text style={{ color: tab === t ? colors.primary : colors.textSecondary, fontWeight: '600', fontSize: 13, textTransform: 'capitalize' }}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
        {loading ? <ActivityIndicator color={colors.primary} /> : tab === 'campaigns' ? (
          campaigns.length === 0 ? (
            <EmptyState
              variant="whatsapp"
              title="Your first WhatsApp blast awaits"
              description="Create a broadcast or schedule an outbound campaign to your active or negative leads."
              actionLabel="Create Campaign"
              onAction={() => setShowCampaign(true)}
              testIDAction="empty-wa-campaign"
            />
          ) : campaigns.map((c) => (
            <View key={c.campaign_id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={[styles.iconBig, { backgroundColor: '#25D36618' }]}>
                  <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{c.name}</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                    Audience: {c.audience}{c.audience_filter ? ` · ${c.audience_filter}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                    <Badge text={c.status.toUpperCase()} color={STATUS_COLOR[c.status]} />
                    {c.scheduled_at && <Badge text={`Scheduled ${new Date(c.scheduled_at).toLocaleString()}`} color={colors.info} />}
                  </View>
                </View>
              </View>

              {c.status === 'sent' && (
                <View style={[styles.metricsRow]}>
                  <Metric label="SENT" value={c.sent_count} colors={colors} />
                  <Metric label="DELIVERED" value={c.delivered_count} colors={colors} c={colors.info} />
                  <Metric label="READ" value={c.read_count} colors={colors} c={colors.positive} />
                  <Metric label="REPLIED" value={c.replied_count} colors={colors} c={colors.accent} />
                </View>
              )}

              <View style={[styles.actions]}>
                {c.status !== 'sent' && (
                  <Pressable testID={`wa-send-${c.campaign_id}`} onPress={() => sendCampaign(c.campaign_id)} disabled={busy === c.campaign_id}
                    style={[styles.act, { borderColor: colors.positive + '60', backgroundColor: colors.positive + '10' }]}>
                    {busy === c.campaign_id ? <ActivityIndicator size="small" color={colors.positive} /> : <>
                      <Ionicons name="paper-plane" size={13} color={colors.positive} />
                      <Text style={{ color: colors.positive, fontSize: 11, fontWeight: '600' }}>Send Campaign</Text>
                    </>}
                  </Pressable>
                )}
                <Pressable testID={`wa-delete-${c.campaign_id}`} onPress={() => deleteCampaign(c.campaign_id)}
                  style={[styles.act, { borderColor: colors.negative + '60', backgroundColor: colors.negative + '10' }]}>
                  <Ionicons name="trash-outline" size={13} color={colors.negative} />
                  <Text style={{ color: colors.negative, fontSize: 11, fontWeight: '600' }}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          templates.length === 0 ? (
            <EmptyState
              variant="whatsapp"
              title="No message templates yet"
              description="Create reusable WhatsApp message templates with placeholders for the next campaign."
              actionLabel="Create Template"
              onAction={() => setShowTemplate(true)}
              testIDAction="empty-wa-template"
            />
          ) : templates.map((t) => (
            <View key={t.template_id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.iconBig, { backgroundColor: colors.accent + '18' }]}>
                  <Ionicons name="document-text" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t.name}</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>Saved {new Date(t.created_at).toLocaleDateString()}</Text>
                </View>
                <Pressable testID={`wa-tpl-delete-${t.template_id}`}
                  onPress={async () => { await api.delete(`/templates/${t.template_id}`); await load(); }}>
                  <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
              <Text style={[styles.tplBody, { color: colors.textSecondary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>{t.body}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <CampaignModal visible={showCampaign} onClose={() => setShowCampaign(false)} templates={templates} onCreated={async () => { setShowCampaign(false); await load(); }} colors={colors} />
      <TemplateModal visible={showTemplate} onClose={() => setShowTemplate(false)} onCreated={async () => { setShowTemplate(false); await load(); }} colors={colors} />
    </View>
  );
}

function StatPill({ label, value, icon, colors, c }: any) {
  const accent = c || colors.primary;
  return (
    <View style={[styles.statPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: accent + '18' }]}>
        <Ionicons name={icon} size={14} color={accent} />
      </View>
      <View>
        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>{label.toUpperCase()}</Text>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{value}</Text>
      </View>
    </View>
  );
}

function Metric({ label, value, colors, c }: any) {
  return (
    <View style={styles.metric}>
      <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 }}>{label}</Text>
      <Text style={{ color: c || colors.text, fontSize: 18, fontWeight: '700', marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function CampaignModal({ visible, onClose, onCreated, templates, colors }: any) {
  const [name, setName] = useState('');
  const [audience, setAudience] = useState('all');
  const [tplId, setTplId] = useState('');
  const [scheduled, setScheduled] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name) return;
    setBusy(true);
    try {
      await api.post('/campaigns', {
        name, audience, template_id: tplId || null,
        scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
      });
      onCreated(); setName(''); setScheduled(''); setTplId('');
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>New Campaign</Text>
          <FormField label="CAMPAIGN NAME" testID="wa-name" value={name} onChange={setName} colors={colors} />
          <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>AUDIENCE</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {['all', 'positive', 'negative'].map((a) => (
              <Pressable key={a} testID={`wa-audience-${a}`} onPress={() => setAudience(a)}
                style={[styles.chip, {
                  borderColor: audience === a ? colors.primary : colors.border,
                  backgroundColor: audience === a ? colors.primary + '20' : colors.surfaceAlt,
                }]}>
                <Text style={{ color: audience === a ? colors.primary : colors.text, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>{a}</Text>
              </Pressable>
            ))}
          </View>
          {templates.length > 0 && (
            <>
              <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>TEMPLATE (OPTIONAL)</Text>
              <ScrollView style={{ maxHeight: 120 }} contentContainerStyle={{ gap: 6 }}>
                {templates.map((t: any) => (
                  <Pressable key={t.template_id} onPress={() => setTplId(t.template_id === tplId ? '' : t.template_id)}
                    style={[styles.leadOpt, {
                      borderColor: tplId === t.template_id ? colors.primary : colors.border,
                      backgroundColor: tplId === t.template_id ? colors.primary + '20' : colors.surfaceAlt,
                    }]}>
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{t.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
          <FormField label="SCHEDULE (OPTIONAL, YYYY-MM-DDTHH:MM)" testID="wa-scheduled" value={scheduled} onChange={setScheduled} colors={colors} placeholder="2026-03-01T10:00" />
          <Pressable testID="wa-campaign-submit" onPress={submit} disabled={busy || !name}
            style={[styles.primary, { backgroundColor: colors.primary, marginTop: 16, height: 42, justifyContent: 'center', opacity: !name ? 0.5 : 1 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create Campaign</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TemplateModal({ visible, onClose, onCreated, colors }: any) {
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name || !body) return;
    setBusy(true);
    try { await api.post('/templates', { name, body }); onCreated(); setName(''); setBody(''); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>New Template</Text>
          <FormField label="TEMPLATE NAME" testID="tpl-name" value={name} onChange={setName} colors={colors} placeholder="Site Visit Reminder" />
          <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>MESSAGE BODY</Text>
          <TextInput testID="tpl-body" value={body} onChangeText={setBody} multiline
            placeholder="Hi {{name}}, your site visit at Umang Skylark is confirmed for {{date}}."
            placeholderTextColor={colors.textMuted}
            style={{ minHeight: 100, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, backgroundColor: colors.surfaceAlt, textAlignVertical: 'top' }} />
          <Pressable testID="tpl-submit" onPress={submit} disabled={busy || !name || !body}
            style={[styles.primary, { backgroundColor: colors.primary, marginTop: 16, height: 42, justifyContent: 'center', opacity: !name || !body ? 0.5 : 1 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save Template</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FormField({ label, value, onChange, colors, testID, placeholder }: any) {
  return (
    <View>
      <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>{label}</Text>
      <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textMuted}
        style={{ height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.text, backgroundColor: colors.surfaceAlt }} />
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 8 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 8, borderWidth: 1 },
  secondaryText: { fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 12, padding: 24, paddingBottom: 0 },
  statPill: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
  statIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', paddingHorizontal: 24, marginTop: 14, borderBottomWidth: 1 },
  tab: { paddingHorizontal: 16, height: 38, justifyContent: 'center', borderBottomWidth: 2 },
  card: { borderRadius: 12, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  iconBig: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricsRow: { flexDirection: 'row', gap: 14, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  metric: { flex: 1 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 14 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 30, borderRadius: 6, borderWidth: 1 },
  tplBody: { fontSize: 12, padding: 12, borderRadius: 8, borderWidth: 1, marginTop: 10, lineHeight: 18 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  modal: { width: '92%', maxWidth: 480, padding: 20, borderRadius: 12, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  chip: { paddingHorizontal: 14, height: 30, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  leadOpt: { padding: 10, borderRadius: 8, borderWidth: 1 },
});
