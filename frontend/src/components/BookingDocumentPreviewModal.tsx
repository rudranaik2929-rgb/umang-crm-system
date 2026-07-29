import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, Platform, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { api, getBackendOrigin } from '../lib/api';

type BookingDocumentMeta = {
  file_name?: string;
  content_type?: string;
  uploaded_at?: string;
  uploaded_by?: string;
  size_bytes?: number;
};

type Props = {
  visible: boolean;
  booking: any | null;
  colors: any;
  onClose: () => void;
};

function formatWhen(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatSize(bytes?: number) {
  const n = Number(bytes || 0);
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function BookingDocumentPreviewModal({ visible, booking, colors, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<BookingDocumentMeta | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);

  const bookingId = booking?.booking_id;
  const isPdf = (meta?.content_type || '').includes('pdf');
  const isImage = (meta?.content_type || '').startsWith('image/');

  useEffect(() => {
    if (!visible || !bookingId) {
      setMeta(null);
      setPreviewUrl(null);
      setError(null);
      setLoading(false);
      if (imageBlobUrl) {
        URL.revokeObjectURL(imageBlobUrl);
        setImageBlobUrl(null);
      }
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/bookings/${bookingId}/document`);
        if (cancelled) return;
        if (!res.data?.has_document) {
          setError('No document uploaded for this booking.');
          setMeta(null);
          setPreviewUrl(null);
          return;
        }
        const doc = res.data.document as BookingDocumentMeta;
        setMeta(doc);
        const fullUrl = `${getBackendOrigin()}/api/bookings/${bookingId}/document/preview`;
        setPreviewUrl(fullUrl);

        if (Platform.OS === 'web' && (doc.content_type || '').startsWith('image/')) {
          const blobRes = await api.get(`/bookings/${bookingId}/document/preview`, { responseType: 'blob' });
          if (cancelled) return;
          const blobUrl = URL.createObjectURL(blobRes.data);
          setImageBlobUrl(blobUrl);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.response?.data?.detail || 'Could not load document preview.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, bookingId]);

  useEffect(() => () => {
    if (imageBlobUrl) URL.revokeObjectURL(imageBlobUrl);
  }, [imageBlobUrl]);

  const viewerHeight = useMemo(() => Math.min(Math.max(height * 0.62, 360), 720), [height]);
  const viewerWidth = useMemo(() => Math.min(width - 48, 920), [width]);

  if (!booking) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, width: viewerWidth }]}
          onPress={(e: any) => e?.stopPropagation?.()}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>Document Preview</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                {booking.lead_name} · {meta?.file_name || booking.property_name}
              </Text>
            </View>
            <Pressable onPress={onClose} style={[styles.closeBtn, { borderColor: colors.border }]}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {meta ? (
            <View style={[styles.metaRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSoft }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                {formatSize(meta.size_bytes)} · {formatWhen(meta.uploaded_at)}
              </Text>
              {meta.uploaded_by ? (
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>By {meta.uploaded_by}</Text>
              ) : null}
            </View>
          ) : null}

          {loading ? (
            <View style={[styles.viewer, { height: viewerHeight, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.textMuted, marginTop: 10, fontSize: 12 }}>Loading preview…</Text>
            </View>
          ) : error ? (
            <View style={[styles.viewer, { height: 180, borderColor: colors.negative + '55' }]}>
              <Ionicons name="alert-circle-outline" size={22} color={colors.negative} />
              <Text style={{ color: colors.negative, fontSize: 12, marginTop: 8, textAlign: 'center' }}>{error}</Text>
            </View>
          ) : previewUrl && isPdf ? (
            Platform.OS === 'web' ? (
              <iframe
                title={`Booking document ${bookingId}`}
                src={previewUrl}
                style={{
                  width: '100%',
                  height: viewerHeight,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  backgroundColor: colors.surfaceAlt,
                } as any}
              />
            ) : (
              <WebView
                source={{ uri: previewUrl }}
                style={{ width: '100%', height: viewerHeight, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
                startInLoadingState
                renderLoading={() => <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}
              />
            )
          ) : previewUrl && isImage ? (
            <View style={[styles.viewer, { height: viewerHeight, borderColor: colors.border, padding: 8 }]}>
              <Image
                source={{ uri: imageBlobUrl || previewUrl }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { maxWidth: 920, maxHeight: '92%', borderRadius: 12, borderWidth: 1, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  closeBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  metaRow: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12, gap: 4 },
  viewer: { borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
