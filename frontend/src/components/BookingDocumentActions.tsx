import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';

type Props = {
  booking: any;
  colors: any;
  onUploaded?: (updated: any) => void | Promise<void>;
  onPreview: () => void;
  testIDPrefix: string;
};

const UPLOAD_TIMEOUT_MS = 120000;

function hasBookingDocument(booking: any) {
  const doc = booking?.booking_document;
  return Boolean(doc && typeof doc === 'object' && doc.storage_path);
}

function uploadErrorMessage(error: any): string {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (error?.code === 'ECONNABORTED') return 'Upload timed out. Try a smaller file.';
  if (!error?.response) return 'Could not reach server. Check your connection.';
  return 'Upload failed. Only PDF and JPEG files up to 15 MB are allowed.';
}

export function BookingDocumentActions({
  booking,
  colors,
  onUploaded,
  onPreview,
  testIDPrefix,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasDoc = hasBookingDocument(booking);

  const uploadFile = async (file: File) => {
    if (!booking?.booking_id) return;
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file, file.name || 'document.pdf');
      const res = await api.post(`/bookings/${booking.booking_id}/document`, formData, {
        timeout: UPLOAD_TIMEOUT_MS,
      });
      setMessage('Document uploaded.');
      if (onUploaded) {
        await onUploaded(res.data?.booking || { ...booking, booking_document: res.data?.document });
      }
    } catch (e: any) {
      setMessage(uploadErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const pickAndUpload = () => {
    if (uploading) return;
    setMessage(null);

    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setMessage('Document upload is available on web.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,application/pdf,image/jpeg';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop()?.toLowerCase();
      const mime = (file.type || '').toLowerCase();
      const allowedExt = ext === 'pdf' || ext === 'jpg' || ext === 'jpeg';
      const allowedMime = mime === 'application/pdf' || mime === 'image/jpeg' || mime === 'image/jpg';
      if (!allowedExt && !allowedMime) {
        setMessage('Only PDF and JPEG files are allowed.');
        return;
      }
      await uploadFile(file);
    };
    input.click();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          testID={`${testIDPrefix}-upload`}
          onPress={pickAndUpload}
          disabled={uploading}
          style={[styles.btn, { borderColor: colors.primary, backgroundColor: colors.primary + '10', opacity: uploading ? 0.7 : 1 }]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="cloud-upload-outline" size={14} color={colors.primary} />
          )}
          <Text style={[styles.btnText, { color: colors.primary }]}>Upload</Text>
        </Pressable>

        <Pressable
          testID={`${testIDPrefix}-document`}
          onPress={hasDoc ? onPreview : pickAndUpload}
          disabled={uploading}
          style={[styles.btn, {
            borderColor: hasDoc ? colors.info : colors.border,
            backgroundColor: hasDoc ? colors.info + '10' : colors.surfaceAlt,
            opacity: uploading ? 0.7 : 1,
          }]}
        >
          <Ionicons name={hasDoc ? 'document-text-outline' : 'document-outline'} size={14} color={hasDoc ? colors.info : colors.textMuted} />
          <Text style={[styles.btnText, { color: hasDoc ? colors.info : colors.textMuted }]}>Document</Text>
        </Pressable>

        {hasDoc ? (
          <Pressable
            testID={`${testIDPrefix}-preview`}
            onPress={onPreview}
            style={[styles.btn, { borderColor: colors.positive, backgroundColor: colors.positive + '10' }]}
          >
            <Ionicons name="eye-outline" size={14} color={colors.positive} />
            <Text style={[styles.btnText, { color: colors.positive }]}>Preview</Text>
          </Pressable>
        ) : null}
      </View>

      {message ? (
        <Text
          style={{
            color: message.includes('uploaded') ? colors.positive : colors.negative,
            fontSize: 10,
            marginTop: 4,
            maxWidth: 220,
            textAlign: 'right',
          }}
          numberOfLines={2}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end', flexShrink: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnText: { fontSize: 10, fontWeight: '700' },
});
