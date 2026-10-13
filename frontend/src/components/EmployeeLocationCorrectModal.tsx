import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';

export interface CorrectableEmployee {
  employee_id: string;
  name?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  last_lat?: number | string | null;
  last_lng?: number | string | null;
  address?: string | null;
}

interface Props {
  visible: boolean;
  employee: CorrectableEmployee | null;
  onClose: () => void;
  /** Called after a successful save/clear so the caller can refresh. */
  onSaved?: () => void;
}

function asCoord(value: number | string | null | undefined): string {
  if (value == null || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '';
}

function formatWhen(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function EmployeeLocationCorrectModal({ visible, employee, onClose, onSaved }: Props) {
  const { colors } = useTheme();
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!visible || !employee) return;
    setLat(asCoord(employee.latitude ?? employee.last_lat));
    setLng(asCoord(employee.longitude ?? employee.last_lng));
    setAddress(employee.address || '');
    setError(null);
    setBusy(false);
  }, [visible, employee?.employee_id]);

  useEffect(() => {
    if (!visible || !employee?.employee_id) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    api.get(`/employees/${employee.employee_id}/location-history`, { params: { limit: 20 } })
      .then((r) => { if (!cancelled) setHistory(r.data?.points || []); })
      .catch(() => { if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [visible, employee?.employee_id]);

  if (!visible || !employee) return null;

  const useMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not available on this device. Enter coordinates manually.');
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
      },
      () => setError('Could not read your current location. Enter coordinates manually.'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const validate = (): string | null => {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return 'Enter valid latitude and longitude numbers.';
    if (la < -90 || la > 90) return 'Latitude must be between -90 and 90.';
    if (ln < -180 || ln > 180) return 'Longitude must be between -180 and 180.';
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/employees/${employee.employee_id}/location`, {
        latitude: Number(lat),
        longitude: Number(lng),
        address: address.trim() || null,
      });
      onSaved?.();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not save the location. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/employees/${employee.employee_id}/location`, { clear: true });
      onSaved?.();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not clear the location. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  ];

  const body = (
    <View style={styles.backdrop} pointerEvents="box-none">
      <Pressable style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]} onPress={onClose} />
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border, zIndex: 2, elevation: 8 },
        ]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>
              {employee.name || 'Employee'} — Set Location
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              Fix a wrong GPS pin or clear it. Manual fixes are tagged “Manual”.
            </Text>
          </View>
          <Pressable onPress={onClose} style={[styles.close, { borderColor: colors.border }]}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Pressable
          onPress={useMyLocation}
          style={({ pressed }) => [
            styles.useBtn,
            { borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons name="locate" size={15} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
            Use my current location
          </Text>
        </Pressable>

        <View style={styles.rowInputs}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Latitude</Text>
            <TextInput
              value={lat}
              onChangeText={setLat}
              placeholder="e.g. 19.0760"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              style={inputStyle}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Longitude</Text>
            <TextInput
              value={lng}
              onChangeText={setLng}
              placeholder="e.g. 72.8777"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              style={inputStyle}
            />
          </View>
        </View>

        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>
          Area / address note (optional)
        </Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Leave blank to auto-detect"
          placeholderTextColor={colors.textMuted}
          style={inputStyle}
        />

        <View style={styles.historyWrap}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Recent locations</Text>
          {historyLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 8 }} />
          ) : history.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>No location history recorded yet.</Text>
          ) : (
            history.slice(0, 6).map((p, idx) => (
              <View key={`${p.created_at || idx}-${idx}`} style={[styles.historyRow, { borderColor: colors.border }]}>
                <Ionicons
                  name={p.source === 'manual' ? 'create-outline' : 'navigate-outline'}
                  size={13}
                  color={p.source === 'manual' ? '#3730A3' : colors.textSecondary}
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text, fontSize: 12 }} numberOfLines={1}>
                    {p.address || `${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)}`}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                    {formatWhen(p.captured_at || p.created_at)}
                    {p.accuracy != null ? ` · ±${Math.round(Number(p.accuracy))} m` : ''}
                    {p.source === 'manual' ? ' · manual fix' : ''}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.negative} />
            <Text style={{ color: colors.negative, fontSize: 12, flex: 1 }}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            onPress={clear}
            disabled={busy}
            style={({ pressed }) => [
              styles.clearBtn,
              { borderColor: colors.negative, opacity: busy ? 0.5 : pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={{ color: colors.negative, fontWeight: '700', fontSize: 13 }}>Clear</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={onClose}
            disabled={busy}
            style={({ pressed }) => [
              styles.cancelBtn,
              { borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={busy}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: colors.primary, opacity: busy ? 0.6 : pressed ? 0.85 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Save location</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return createPortal(
      <View
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          width: '100vw', height: '100vh',
          zIndex: 9500,
          backgroundColor: 'rgba(0,0,0,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
        } as any}
      >
        {body}
      </View>,
      document.body,
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  title: { fontSize: 16, fontWeight: '800' },
  close: {
    width: 32, height: 32, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  useBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, height: 40,
  },
  rowInputs: { flexDirection: 'row', gap: 12, marginTop: 14 },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    borderWidth: 1, borderRadius: 10, height: 42,
    paddingHorizontal: 12, fontSize: 14,
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  historyWrap: { marginTop: 14 },
  historyRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 6,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  clearBtn: { borderWidth: 1, borderRadius: 10, height: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { borderWidth: 1, borderRadius: 10, height: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { borderRadius: 10, height: 40, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minWidth: 130 },
});
