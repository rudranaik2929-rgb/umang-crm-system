import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { downloadLeadsExcel } from '../lib/api';
import { DatePickerField, formatDateLabel, todayIsoDate } from './DatePickerField';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ExportLeadsModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClose = () => {
    if (loading) return;
    setDateFrom('');
    setDateTo('');
    setErrorMsg(null);
    onClose();
  };

  const handleExport = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params: Record<string, string> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      else if (dateFrom) params.date_to = todayIsoDate();
      await downloadLeadsExcel(params);
      handleClose();
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.detail || e?.message || 'Download failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const rangeLabel = dateFrom || dateTo
    ? `${formatDateLabel(dateFrom) || 'Start'} → ${formatDateLabel(dateTo) || 'Today'}`
    : 'All leads (no date filter)';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="download-outline" size={20} color={colors.primary} />
              <Text style={[styles.title, { color: colors.text }]}>Download Leads (Excel)</Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={12} disabled={loading}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 4 }}>
            <Text style={[styles.desc, { color: colors.textSecondary }]}>
              Pick a date range like a booking calendar — leads received between the two dates are exported.
            </Text>

            <DatePickerField
              label="FROM DATE"
              value={dateFrom}
              onChange={(iso) => setDateFrom(iso)}
              colors={colors}
              testID="export-date-from"
            />

            <DatePickerField
              label="TO DATE"
              value={dateTo}
              onChange={(iso) => setDateTo(iso)}
              colors={colors}
              testID="export-date-to"
            />

            <View style={[styles.rangeCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{rangeLabel}</Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Text style={[styles.infoText, { color: colors.textMuted }]}>
                Leave dates empty to download every lead. Dates follow the CRM date shown on the dashboard (local time).
              </Text>
            </View>

            {errorMsg ? (
              <View style={[styles.alertCard, { backgroundColor: colors.negative + '10', borderColor: colors.negative }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.negative} />
                <Text style={[styles.alertText, { color: colors.negative }]}>{errorMsg}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleExport}
              disabled={loading}
              testID="export-download-btn"
              style={[styles.actionBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Download Excel</Text>
                </>
              )}
            </Pressable>

            <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 2 }}>
              Exports as .xlsx — opens directly in Excel
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  sheet: { width: '90%', maxWidth: 460, maxHeight: '88%', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  header: { padding: 20, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700' },
  desc: { fontSize: 13, lineHeight: 18 },
  rangeCard: { marginTop: 16, padding: 12, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoCard: { padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 10 },
  infoText: { fontSize: 11, lineHeight: 16 },
  alertCard: { padding: 12, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 10 },
  alertText: { fontSize: 12, lineHeight: 18, flex: 1 },
  actionBtn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 16 },
});
