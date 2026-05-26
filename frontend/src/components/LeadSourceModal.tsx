import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions, Platform, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';

const { height: SCREEN_H } = Dimensions.get('window');

const SOURCE_META: Record<string, { icon: any; color: string; label: string }> = {
  website:     { icon: 'globe-outline',         color: '#E88B35', label: 'Website' },
  facebook:    { icon: 'logo-facebook',         color: '#1877F2', label: 'Facebook Ads' },
  instagram:   { icon: 'logo-instagram',        color: '#E4405F', label: 'Instagram' },
  magicbricks: { icon: 'business-outline',      color: '#E53935', label: 'MagicBricks' },
  '99acres':   { icon: 'home-outline',          color: '#1B5E20', label: '99 Acres' },
  housing:     { icon: 'map-outline',           color: '#00BFA5', label: 'Housing.com' },
  referral:    { icon: 'people-outline',        color: '#7C3AED', label: 'Referral' },
  walkin:      { icon: 'walk-outline',          color: '#0EA5E9', label: 'Walk-in' },
  direct:      { icon: 'call-outline',          color: '#64748B', label: 'Direct / Other' },
  google:      { icon: 'logo-google',           color: '#4285F4', label: 'Google Ads' },
};

function getMeta(src: string) {
  const key = src.toLowerCase().replace(/[\s_-]+/g, '');
  for (const [k, v] of Object.entries(SOURCE_META)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return SOURCE_META.direct;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

type LeadSourceData = {
  total: number;
  sources: { source: string; count: number; active: number; negative: number }[];
};

const DEMO_SOURCE_DATA: LeadSourceData = {
  total: 47,
  sources: [
    { source: 'website', count: 14, active: 12, negative: 2 },
    { source: 'facebook', count: 10, active: 8, negative: 2 },
    { source: 'magicbricks', count: 8, active: 7, negative: 1 },
    { source: '99acres', count: 6, active: 5, negative: 1 },
    { source: 'referral', count: 5, active: 5, negative: 0 },
    { source: 'direct', count: 4, active: 3, negative: 1 },
  ],
};

function normalizeSourceData(payload: any): LeadSourceData {
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  const normalizedSources: LeadSourceData['sources'] = sources.map((source: any) => ({
    source: String(source?.source || 'direct'),
    count: Number(source?.count || 0),
    active: Number(source?.active || 0),
    negative: Number(source?.negative || 0),
  }));

  return {
    total: Number(
      payload?.total ?? normalizedSources.reduce((sum, source) => sum + source.count, 0)
    ),
    sources: normalizedSources,
  };
}

export function LeadSourceModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const [data, setData] = useState<LeadSourceData | null>(null);
  const [loading, setLoading] = useState(false);

  // Animations
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const barAnims = useRef<Animated.Value[]>([]).current;

  const setSourceData = useCallback((nextData: LeadSourceData) => {
    barAnims.length = 0;
    nextData.sources.forEach(() => barAnims.push(new Animated.Value(0)));
    setData(nextData);
  }, [barAnims]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const res = await api.get('/stats/leads-by-source');
      setSourceData(normalizeSourceData(res.data));
    } catch {
      setSourceData(DEMO_SOURCE_DATA);
    } finally {
      setLoading(false);
    }
  }, [setSourceData]);

  useEffect(() => {
    if (visible) {
      loadData();
      // Animate in
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 12, useNativeDriver: true }),
      ]).start();
    } else {
      // Reset
      backdropAnim.setValue(0);
      slideAnim.setValue(60);
      scaleAnim.setValue(0.92);
    }
  }, [backdropAnim, loadData, scaleAnim, slideAnim, visible]);

  useEffect(() => {
    if (!data?.sources.length) return;

    // Stagger bar animations after the rows have rendered with live Animated.Value refs.
    const anims = barAnims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 500,
        delay: i * 80,
        useNativeDriver: false, // width animation can't use native driver
      })
    );
    Animated.stagger(80, anims).start();
  }, [barAnims, data]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 80, duration: 200, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  if (!visible) return null;

  const maxCount = data ? Math.max(1, ...data.sources.map(s => s.count)) : 1;

  const isWeb = Platform.OS === 'web';

  const content = (
    <View style={st.fullOverlay}>
      {/* Backdrop */}
      <Animated.View style={[st.backdrop, { opacity: backdropAnim }]}>
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
      </Animated.View>

      {/* Modal Card */}
      <Animated.View
        style={[
          st.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            transform: [
              { translateY: slideAnim },
              { scale: scaleAnim },
            ],
          },
        ]}
      >
        {/* Header */}
        <View style={st.header}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[st.headerIcon, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="pie-chart" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[st.headerTitle, { color: colors.text }]}>Lead Source Breakdown</Text>
                <Text style={[st.headerSub, { color: colors.textMuted }]}>
                  {data ? `${data.total} total leads from ${data.sources.length} sources` : 'Loading...'}
                </Text>
              </View>
            </View>
          </View>
          <Pressable onPress={handleClose} style={[st.closeBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Divider */}
        <View style={[st.divider, { backgroundColor: colors.border }]} />

        {/* Source Bars */}
        {loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted }}>Loading sources…</Text>
          </View>
        ) : data?.sources.length ? data.sources.map((src, i) => {
          const meta = getMeta(src.source);
          const pct = data.total > 0 ? Math.round((src.count / data.total) * 100) : 0;
          const barWidth = barAnims[i] ? barAnims[i].interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', `${(src.count / maxCount) * 100}%`],
          }) : '0%';

          return (
            <Animated.View
              key={src.source}
              style={[
                st.sourceRow,
                {
                  opacity: barAnims[i] || 1,
                },
              ]}
            >
              {/* Icon + Label */}
              <View style={st.sourceLeft}>
                <View style={[st.sourceIcon, { backgroundColor: meta.color + '18' }]}>
                  <Ionicons name={meta.icon} size={16} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.sourceName, { color: colors.text }]}>{meta.label}</Text>
                  <Text style={[st.sourceDetail, { color: colors.textMuted }]}>
                    {src.active} active · {src.negative} negative
                  </Text>
                </View>
              </View>

              {/* Bar + Count */}
              <View style={st.sourceRight}>
                <View style={[st.barTrack, { backgroundColor: colors.surfaceAlt }]}>
                  <Animated.View
                    style={[
                      st.barFill,
                      {
                        backgroundColor: meta.color,
                        width: barWidth,
                      },
                    ]}
                  />
                </View>
                <View style={st.countWrap}>
                  <Text style={[st.countText, { color: colors.text }]}>{src.count}</Text>
                  <Text style={[st.pctText, { color: meta.color }]}>{pct}%</Text>
                </View>
              </View>
            </Animated.View>
          );
        }) : (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted }}>No lead sources yet.</Text>
          </View>
        )}

        {/* Footer */}
        <View style={[st.footer, { borderTopColor: colors.border }]}>
          <View style={st.footerItem}>
            <View style={[st.footerDot, { backgroundColor: colors.positive }]} />
            <Text style={[st.footerText, { color: colors.textSecondary }]}>
              Active: {data ? data.sources.reduce((a, s) => a + s.active, 0) : 0}
            </Text>
          </View>
          <View style={st.footerItem}>
            <View style={[st.footerDot, { backgroundColor: colors.negative }]} />
            <Text style={[st.footerText, { color: colors.textSecondary }]}>
              Negative: {data ? data.sources.reduce((a, s) => a + s.negative, 0) : 0}
            </Text>
          </View>
          <View style={st.footerItem}>
            <View style={[st.footerDot, { backgroundColor: colors.primary }]} />
            <Text style={[st.footerText, { color: colors.textSecondary }]}>
              Total: {data?.total || 0}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );

  // On web, render as a fixed overlay; on native, use Modal
  if (isWeb) return content;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleClose}>
      {content}
    </Modal>
  );
}

const st = StyleSheet.create({
  fullOverlay: {
    ...Platform.select({
      web: {
        position: 'fixed' as any,
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999,
      },
      default: {
        flex: 1,
      },
    }),
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...Platform.select({
      web: { position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0 },
      default: { ...StyleSheet.absoluteFillObject },
    }),
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: '92%',
    maxWidth: 540,
    maxHeight: SCREEN_H * 0.85,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 25px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 25 },
        shadowOpacity: 0.4,
        shadowRadius: 40,
        elevation: 30,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    marginVertical: 18,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  sourceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 140,
  },
  sourceIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceName: {
    fontSize: 13,
    fontWeight: '600',
  },
  sourceDetail: {
    fontSize: 10,
    marginTop: 1,
  },
  sourceRight: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  countWrap: {
    alignItems: 'flex-end',
    minWidth: 44,
  },
  countText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  pctText: {
    fontSize: 10,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingTop: 16,
    marginTop: 14,
    borderTopWidth: 1,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
