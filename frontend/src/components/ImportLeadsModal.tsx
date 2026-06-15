import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportLeadsModal({ visible, onClose, onSuccess }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    assigned: number;
    assignFailed: number;
  } | null>(null);

  const pickFile = () => {
    if (typeof document !== 'undefined') {
      setErrorMsg(null);
      setResult(null);
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
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (res.data && res.data.status === 'success') {
        setResult({
          imported: res.data.imported_count,
          skipped: res.data.skipped_count,
          assigned: res.data.assigned_count ?? 0,
          assignFailed: res.data.assign_failed_count ?? 0,
        });
        setSelectedFile(null);
        onSuccess();
      } else {
        setErrorMsg('Import failed. Please verify your file structure.');
      }
    } catch (e: any) {
      console.error(e);
      const msg = e.response?.data?.detail || 'An error occurred during import. Verify headers match ("Name", "Phone").';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setErrorMsg(null);
    setResult(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
              <Text style={[styles.title, { color: colors.text }]}>Import Leads</Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <Text style={[styles.desc, { color: colors.textSecondary }]}>
              Upload your Excel (.xlsx) or CSV. Leads are created and auto-assigned when the
              &quot;Assigne to&quot; column matches an employee name in the system.
            </Text>

            <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Text style={[styles.infoTitle, { color: colors.text }]}>Your Excel columns (row 1 headers)</Text>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                Lead Date · Lead Name · Phone Number · Locality · Configuration · Price · Building/Project Name · Assigne to
              </Text>
              <Text style={[styles.infoText, { color: colors.textMuted, marginTop: 8, fontStyle: 'italic' }]}>
                Example: 30/12/2025 · Shastri Ramnarayan mishra · (+91)-9869122319 · Nalasopara West · 1 BHK · 31.5 Lac-37.0 Lac · Vimal Classic · Khyati Shah
              </Text>
              <Text style={[styles.infoText, { color: colors.textSecondary, marginTop: 8 }]}>
                Required: <Text style={{ fontWeight: 'bold' }}>Lead Name</Text> and <Text style={{ fontWeight: 'bold' }}>Phone Number</Text>.
                Assigne to must match employee name exactly (e.g. Khyati Shah).
              </Text>
            </View>

            {/* Error Message */}
            {errorMsg && (
              <View style={[styles.alertCard, { backgroundColor: colors.negative + '10', borderColor: colors.negative }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.negative} />
                <Text style={[styles.alertText, { color: colors.negative }]}>{errorMsg}</Text>
              </View>
            )}

            {/* Success Result */}
            {result && (
              <View style={[styles.alertCard, { backgroundColor: colors.positive + '10', borderColor: colors.positive }]}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.positive} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertText, { color: colors.positive, fontWeight: '700' }]}>
                    Import Successful!
                  </Text>
                  <Text style={[styles.alertSubtext, { color: colors.text }]}>
                    • {result.imported} lead(s) imported
                  </Text>
                  <Text style={[styles.alertSubtext, { color: colors.text }]}>
                    • {result.assigned} auto-assigned to employees
                  </Text>
                  {result.assignFailed > 0 && (
                    <Text style={[styles.alertSubtext, { color: colors.warning }]}>
                      • {result.assignFailed} row(s): employee name in &quot;Assigne to&quot; not found — lead imported but unassigned
                    </Text>
                  )}
                  {result.skipped > 0 && (
                    <Text style={[styles.alertSubtext, { color: colors.textSecondary }]}>
                      • {result.skipped} rows skipped (missing Name or Phone).
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* File Pick Area */}
            {!selectedFile ? (
              <Pressable
                onPress={pickFile}
                style={[
                  styles.pickerArea,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceAlt,
                  },
                ]}
              >
                <Ionicons name="document-text-outline" size={32} color={colors.textSecondary} />
                <Text style={[styles.pickerTitle, { color: colors.text }]}>Select Excel or CSV File</Text>
                <Text style={[styles.pickerSub, { color: colors.textMuted }]}>
                  Supports .xlsx, .xls, .csv
                </Text>
              </Pressable>
            ) : (
              <View style={[styles.selectedCard, { borderColor: colors.primary, backgroundColor: colors.primary + '05' }]}>
                <Ionicons name="document-attach-outline" size={24} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                    {selectedFile.name}
                  </Text>
                  <Text style={[styles.fileSize, { color: colors.textMuted }]}>
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedFile(null)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.negative} />
                </Pressable>
              </View>
            )}

            {/* Action Buttons */}
            {selectedFile && (
              <Pressable
                onPress={handleImport}
                disabled={loading}
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="play-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Process & Import</Text>
                  </>
                )}
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  sheet: { width: '90%', maxWidth: 460, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  header: { padding: 20, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700' },
  desc: { fontSize: 13, lineHeight: 18 },
  infoCard: { padding: 14, borderRadius: 10, borderWidth: 1, gap: 4 },
  infoTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  infoText: { fontSize: 11 },
  alertCard: { padding: 14, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  alertText: { fontSize: 12, lineHeight: 18 },
  alertSubtext: { fontSize: 11, marginTop: 4 },
  pickerArea: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pickerTitle: { fontSize: 14, fontWeight: '600' },
  pickerSub: { fontSize: 11 },
  selectedCard: { padding: 16, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  fileName: { fontSize: 13, fontWeight: '600' },
  fileSize: { fontSize: 11, marginTop: 2 },
  actionBtn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 10 },
});
