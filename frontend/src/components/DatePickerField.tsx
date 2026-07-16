import React, { useRef } from 'react';
import { View, Text, Pressable, TextInput, Platform, StyleSheet } from 'react-native';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';

export function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toIsoDateInput(value?: string | null) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateLabel(value?: string | null) {
  const iso = toIsoDateInput(value);
  if (!iso) return '';
  const parsed = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function isoDateToPayload(isoDate: string) {
  const day = toIsoDateInput(isoDate) || todayIsoDate();
  return `${day}T12:00:00.000Z`;
}

type Props = {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  colors: any;
  testID?: string;
  helper?: string;
};

export function DatePickerField({ label, value, onChange, colors, testID, helper }: Props) {
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const openDatePicker = () => {
    if (Platform.OS !== 'web') return;
    const input = dateInputRef.current;
    if (!input) return;

    const restore = () => {
      input.style.position = 'fixed';
      input.style.top = '50%';
      input.style.left = '50%';
      input.style.width = '1px';
      input.style.height = '1px';
      input.style.opacity = '0.01';
      input.style.pointerEvents = 'none';
      input.style.zIndex = '-1';
    };

    input.style.position = 'fixed';
    input.style.top = '0';
    input.style.left = '0';
    input.style.width = '100%';
    input.style.height = '100%';
    input.style.opacity = '0.01';
    input.style.pointerEvents = 'auto';
    input.style.zIndex = '2147483647';

    const onDone = () => {
      restore();
      input.removeEventListener('blur', onDone);
      input.removeEventListener('change', onDone);
    };
    input.addEventListener('blur', onDone, { once: true });
    input.addEventListener('change', onDone, { once: true });

    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {
      /* fall through */
    }
    input.focus();
    input.click();
  };

  if (Platform.OS === 'web') {
    const webDateInput = (
      <input
        ref={dateInputRef as any}
        data-testid={testID ? `${testID}-native` : undefined}
        className="crm-date-input"
        type="date"
        value={value || todayIsoDate()}
        onChange={(e) => onChange(e.target.value)}
        aria-hidden
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          width: 1,
          height: 1,
          opacity: 0.01,
          pointerEvents: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          zIndex: -1,
        }}
      />
    );

    return (
      <View>
        <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>{label}</Text>
        <Pressable
          testID={testID}
          onPress={openDatePicker}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{
            minHeight: 44,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: colors.surfaceAlt,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
            {formatDateLabel(value) || 'Tap to pick date'}
          </Text>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Change</Text>
        </Pressable>
        {helper ? (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>{helper}</Text>
        ) : null}
        {typeof document !== 'undefined' ? createPortal(webDateInput, document.body) : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textMuted}
        style={{
          height: 40,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 10,
          color: colors.text,
          backgroundColor: colors.surfaceAlt,
        }}
      />
      {helper ? (
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
});
