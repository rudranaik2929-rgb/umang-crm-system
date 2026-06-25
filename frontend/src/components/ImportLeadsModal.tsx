import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type AssignRow = { employee_id?: string; employee_name: string; count: number };

type ImportResult = {
  imported: number;
  skipped: number;
  assigned: number;
  assignFailed: number;
  breakdown: AssignRow[];
  failedSamples: string[];
  availableEmployees: string[];
};

export function ImportLeadsModal({ visible, onClose, onSuccess }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<'upload' | 'summary'>('upload');

  useEffect(() => {
    if (!visible) {
      setStep('upload');
      setSelectedFile(null);
      setErrorMsg(null);
      setResult(null);
      setLoading(false);
    }
  }, [visible]);

  const pickFile = () => {
    if (typeof document !== 'undefined') {
      setErrorMsg(null);
      setResult(null);
      setStep('upload');
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv, .xlsx, .xls';
      input.onchange = (e: any) => {
        const file = e.target.files[0];
        if (file) {
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
            setErrorMsg('Invalid format! Please pick a CSV or Excel file.');
            return;
          }
          setSelectedFile(file);
        }
      };
      input.click();
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await api.post('/leads/import', formData, {
        timeout: 180000,
      });

      if (res.data && res.data.status === 'success') {
        const breakdown: AssignRow[] = (res.data.assignment_breakdown || []).map((row: any) => ({
          employee_id: row.employee_id,
          employee_name: row.employee_name || 'Employee',
          count: Number(row.count || 0),
        }));
        const failed: any[] = res.data.assign_failed || [];
        const importResult: ImportResult = {
          imported: Number(res.data.imported_count || 0),
          skipped: Number(res.data.skipped_count || 0),
          assigned: Number(res.data.assigned_count || 0),
          assignFailed: Number(res.data.assign_failed_count || 0),
          breakdown,
          failedSamples: failed.slice(0, 5).map((f) => `${f.name} → "${f.assign_to}"`),
          availableEmployees: res.data.available_employees || [],
        };
        setResult(importResult);
        setSelectedFile(null);
        setStep('summary');
      } else {
        setErrorMsg('Import failed. Please verify your file structure.');
      }
    } catch (e: any) {
      console.error(e);
      const detail = e.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: any) => d?.msg || JSON.stringify(d)).join(', ')
          : 'Upload failed. Check Excel headers and try again.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setErrorMsg(null);
    setResult(null);
    setStep('upload');
    onClose();
  };

  const finishImport = () => {
    setStep('upload');
    setResult(null);
    onSuccess();
    onClose();
  };

  const onBackdropPress = () => {
    if (step === 'upload' && !loading) handleClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={step === 'summary' ? finishImport : handleClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onBackdropPress} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {step === 'summary' && result ? (
            <>
              <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.positive} />
                  <Text style={[styles.title, { color: colors.text }]}>Import Complete</Text>
                </View>
                <Pressable onPress={finishImport} hitSlop={12}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
                <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
                  {result.imported} lead(s) imported · {result.assigned} assigned to employees
                </Text>

                {result.breakdown.length > 0 ? (
                  <View style={[styles.popupList, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                    <Text style={[styles.popupListTitle, { color: colors.textMuted }]}>LEADS ASSIGNED BY EMPLOYEE</Text>
                    {result.breakdown.map((row) => (
                      <View key={row.employee_id || row.employee_name} style={styles.popupRow}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }} numberOfLines={2}>
                          {row.employee_name}
                        </Text>
                        <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '800' }}>
                          {row.count} lead{row.count === 1 ? '' : 's'}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={[styles.alertCard, { backgroundColor: colors.warning + '12', borderColor: colors.warning }]}>
                    <Ionicons name="warning-outline" size={18} color={colors.warning} />
                    <Text style={[styles.alertText, { color: colors.textSecondary }]}>
                      No leads were auto-assigned. Use the &quot;Assign to&quot; column with employee names from the Employees page (case does not matter).
                    </Text>
                  </View>
                )}

                {result.assignFailed > 0 ? (
                  <View style={[styles.alertCard, { backgroundColor: colors.warning + '10', borderColor: colors.warning }]}>
                    <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '700' }}>
                        {result.assignFailed} row(s) could not be assigned
                      </Text>
                      {result.failedSamples.map((line) => (
                        <Text key={line} style={{ color: colors.textMuted, fontSize: 11 }}>{line}</Text>
                      ))}
                    </View>
                  </View>
                ) : null}

                {result.skipped > 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }}>
                    {result.skipped} row(s) skipped (missing name or phone).
                  </Text>
                ) : null}

                {result.availableEmployees.length > 0 && result.assigned === 0 ? (
                  <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                    <Text style={[styles.infoTitle, { color: colors.text }]}>Available employees</Text>
                    <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                      {result.availableEmployees.join(' · ')}
                    </Text>
                  </View>
                ) : null}

                <Pressable onPress={finishImport} style={[styles.actionBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Done — Refresh Dashboard</Text>
                </Pressable>
              </ScrollView>
            </>
          ) : (
            <>
              <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                  <Text style={[styles.title, { color: colors.text }]}>Import Leads</Text>
                </View>
                <Pressable onPress={handleClose} hitSlop={12} disabled={loading}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
                <Text style={[styles.desc, { color: colors.textSecondary }]}>
                  Upload Excel (.xlsx) or CSV. Leads auto-assign when the Assign to column matches an employee name (upper/lower case OK).
                </Text>

                <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <Text style={[styles.infoTitle, { color: colors.text }]}>Excel headers (row 1)</Text>
                  <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                    Lead Date · Lead Name · Phone Number · Locality · Configuration · Price · Building/Project Name · Assign to · Source (optional: Facebook / Meta)
                  </Text>
                  <Text style={[styles.infoText, { color: colors.textMuted, marginTop: 8, fontStyle: 'italic' }]}>
                    Example: 30/12/2025 · Shastri Ramnarayan mishra · (+91)-9869122319 · Nalasopara West · 1 BHK · 31.5 Lac · Vimal Classic · khyati shah
                  </Text>
                </View>

                {errorMsg ? (
                  <View style={[styles.alertCard, { backgroundColor: colors.negative + '10', borderColor: colors.negative }]}>
                    <Ionicons name="alert-circle-outline" size={18} color={colors.negative} />
                    <Text style={[styles.alertText, { color: colors.negative }]}>{errorMsg}</Text>
                  </View>
                ) : null}

                {!selectedFile ? (
                  <Pressable
                    onPress={pickFile}
                    style={[styles.pickerArea, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                  >
                    <Ionicons name="document-text-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.pickerTitle, { color: colors.text }]}>Select Excel or CSV File</Text>
                    <Text style={[styles.pickerSub, { color: colors.textMuted }]}>Supports .xlsx, .xls, .csv</Text>
                  </Pressable>
                ) : (
                  <View style={[styles.selectedCard, { borderColor: colors.primary, backgroundColor: colors.primary + '05' }]}>
                    <Ionicons name="document-attach-outline" size={24} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{selectedFile.name}</Text>
                      <Text style={[styles.fileSize, { color: colors.textMuted }]}>
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </Text>
                    </View>
                    <Pressable onPress={() => setSelectedFile(null)} hitSlop={8} disabled={loading}>
                      <Ionicons name="trash-outline" size={18} color={colors.negative} />
                    </Pressable>
                  </View>
                )}

                {selectedFile ? (
                  <Pressable
                    onPress={handleImport}
                    disabled={loading}
                    style={[styles.actionBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="play-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Upload & Auto-Assign</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </ScrollView>
            </>
          )}
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
  infoCard: { padding: 14, borderRadius: 10, borderWidth: 1, gap: 4 },
  infoTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  infoText: { fontSize: 11 },
  alertCard: { padding: 14, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  alertText: { fontSize: 12, lineHeight: 18, flex: 1 },
  pickerArea: {
    padding: 24, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  pickerTitle: { fontSize: 14, fontWeight: '600' },
  pickerSub: { fontSize: 11 },
  selectedCard: { padding: 16, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  fileName: { fontSize: 13, fontWeight: '600' },
  fileSize: { fontSize: 11, marginTop: 2 },
  actionBtn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 4 },
  popupList: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 10 },
  popupListTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 1.1, marginBottom: 4 },
  popupRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
