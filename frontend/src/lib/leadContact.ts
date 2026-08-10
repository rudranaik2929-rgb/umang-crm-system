import { Alert, Linking, Platform } from 'react-native';

export function digitsOnly(phone?: string) {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.startsWith('91') && d.length >= 12) return d;
  return d;
}

/** Consistent display format: +91 98765 43210 (used by every lead list/popup). */
export function formatPhoneDisplay(phone?: string): string {
  const raw = String(phone || '').trim();
  if (!raw || raw === '—') return '';
  const d = raw.replace(/\D/g, '');
  let ten: string | null = null;
  if (d.length === 10) ten = d;
  else if (d.length >= 12 && d.startsWith('91')) ten = d.slice(2, 12);
  else if (d.length === 12 && d.startsWith('0')) ten = d.slice(1);
  if (!ten) {
    const masked = /^\*+$|^x+$/i.test(raw) || /^(\d)\1+$/.test(d);
    return masked ? '' : raw;
  }
  if (/^(\d)\1{9}$/.test(ten)) return '';
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
}

export function telUri(phone?: string) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const d = raw.replace(/[^\d+]/g, '');
  return d ? `tel:${d}` : '';
}

export async function openPhoneCall(phone?: string) {
  const uri = telUri(phone);
  if (!uri) {
    Alert.alert('No phone number', 'This lead has no phone number to call.');
    return;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Web: navigate straight to tel: so the browser dialer opens immediately
    // on click — no intermediate alert / permission prompt.
    window.location.href = uri;
    return;
  }
  try {
    const can = await Linking.canOpenURL(uri);
    if (!can) {
      Alert.alert('Cannot call', phone || '');
      return;
    }
    await Linking.openURL(uri);
  } catch {
    Alert.alert('Call failed', 'Could not open the phone dialer.');
  }
}

export async function openWhatsApp(phone?: string) {
  const wa = digitsOnly(phone);
  if (!wa) {
    Alert.alert('No phone number', 'This lead has no phone number for WhatsApp.');
    return;
  }
  const url = Platform.OS === 'ios'
    ? `https://wa.me/${wa}`
    : `whatsapp://send?phone=${wa}`;
  const fallback = `https://wa.me/${wa}`;
  try {
    await Linking.openURL(url);
  } catch {
    try {
      await Linking.openURL(fallback);
    } catch {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(fallback, '_blank');
        return;
      }
      Alert.alert('WhatsApp failed', 'Could not open WhatsApp.');
    }
  }
}

export async function copyPhone(phone?: string) {
  const text = String(phone || '').trim();
  if (!text) return;
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      Alert.alert('Copied', 'Phone number copied.');
      return;
    }
  } catch {
    /* fallback below */
  }
  if (Platform.OS !== 'web') {
    try {
      const { Share } = require('react-native');
      await Share.share({ message: text });
      return;
    } catch {
      /* fall through */
    }
  }
  Alert.alert('Phone number', text);
}
