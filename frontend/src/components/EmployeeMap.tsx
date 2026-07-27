import React, { useMemo } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../theme/ThemeContext';

/** Google Maps JavaScript API key (Maps JS only — no Directions/Places/Distance Matrix). */
const GOOGLE_MAPS_API_KEY =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) || '';

export interface TrackedEmployee {
  employee_id: string;
  name: string;
  role?: string;
  last_lat?: number | null;
  last_lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  last_seen_at?: string | null;
  updated_at?: string | null;
  current_lead_name?: string | null;
  current_lead?: { name?: string | null } | null;
}

interface Props {
  employees: TrackedEmployee[];
  selectedId?: string | null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markerColor(iso?: string | null): string {
  if (!iso) return '#DC2626';
  const age = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(age) || age < 0) return '#DC2626';
  if (age < 5 * 60 * 1000) return '#16A34A'; // green — within 5 min
  if (age < 15 * 60 * 1000) return '#EA580C'; // orange — within 15 min
  return '#DC2626'; // red — older
}

function latOf(e: TrackedEmployee) {
  return e.latitude ?? e.last_lat;
}

function lngOf(e: TrackedEmployee) {
  return e.longitude ?? e.last_lng;
}

function seenOf(e: TrackedEmployee) {
  return e.updated_at || e.last_seen_at;
}

function leadNameOf(e: TrackedEmployee) {
  return e.current_lead_name || e.current_lead?.name || '—';
}

export function EmployeeMap({ employees, selectedId }: Props) {
  const { colors } = useTheme();

  const located = useMemo(
    () => employees.filter((e) => latOf(e) != null && lngOf(e) != null),
    [employees],
  );

  const html = useMemo(() => {
    const key = escapeHtml(GOOGLE_MAPS_API_KEY);
    const markersJson = JSON.stringify(
      located.map((e) => ({
        id: e.employee_id,
        lat: Number(latOf(e)),
        lng: Number(lngOf(e)),
        name: e.name || 'Employee',
        lead: leadNameOf(e),
        seen: seenOf(e)
          ? new Date(seenOf(e) as string).toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })
          : '—',
        color: markerColor(seenOf(e)),
        highlight: selectedId === e.employee_id,
      })),
    );

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #0f172a; }
    .gm-style .gm-style-iw-c { border-radius: 10px !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var MARKERS = ${markersJson};
    function pinSvg(color) {
      return 'data:image/svg+xml;charset=UTF-8,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">' +
          '<path fill="' + color + '" stroke="#fff" stroke-width="2" ' +
          'd="M18 1C9.7 1 3 7.7 3 16c0 11.2 15 30 15 30s15-18.8 15-30C33 7.7 26.3 1 18 1z"/>' +
          '<circle cx="18" cy="16" r="6" fill="#fff"/></svg>'
        );
    }
    function initMap() {
      var map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 19.47, lng: 72.8 },
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
      });
      var bounds = new google.maps.LatLngBounds();
      var info = new google.maps.InfoWindow();
      MARKERS.forEach(function (m) {
        var pos = { lat: m.lat, lng: m.lng };
        bounds.extend(pos);
        var marker = new google.maps.Marker({
          position: pos,
          map: map,
          title: m.name,
          icon: {
            url: pinSvg(m.color),
            scaledSize: new google.maps.Size(36, 48),
            anchor: new google.maps.Point(18, 48),
          },
          zIndex: m.highlight ? 999 : 1,
        });
        marker.addListener('click', function () {
          info.setContent(
            '<div style="font-family:system-ui,sans-serif;min-width:180px;padding:2px 0">' +
            '<div style="font-weight:700;font-size:14px;margin-bottom:6px">' + m.name + '</div>' +
            '<div style="font-size:12px;color:#334155;margin-bottom:4px"><b>Current Lead:</b> ' + m.lead + '</div>' +
            '<div style="font-size:12px;color:#64748b"><b>Last Updated:</b> ' + m.seen + '</div>' +
            '</div>'
          );
          info.open(map, marker);
          if (m.highlight) map.panTo(pos);
        });
        if (m.highlight) {
          map.setCenter(pos);
          map.setZoom(14);
          google.maps.event.trigger(marker, 'click');
        }
      });
      if (MARKERS.length > 1 && !MARKERS.some(function (m) { return m.highlight; })) {
        map.fitBounds(bounds, 48);
      } else if (MARKERS.length === 1 && !MARKERS[0].highlight) {
        map.setCenter({ lat: MARKERS[0].lat, lng: MARKERS[0].lng });
        map.setZoom(13);
      }
    }
  </script>
  <script async defer
    src="https://maps.googleapis.com/maps/api/js?key=${key}&callback=initMap">
  </script>
</body>
</html>`;
  }, [located, selectedId]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Google Maps API key missing</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, textAlign: 'center', lineHeight: 18 }}>
          Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in frontend/.env (Maps JavaScript API only).
        </Text>
      </View>
    );
  }

  if (located.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>No GPS data yet</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, textAlign: 'center', lineHeight: 18 }}>
          Employees must log in on mobile/laptop and allow location access. Their position will appear here on the map.
        </Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <iframe
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
          title="Employee Map"
          allow="geolocation"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      <WebView originWhitelist={['*']} source={{ html }} style={styles.map} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, minHeight: 320 },
  map: { flex: 1 },
  empty: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    minHeight: 320,
  },
});
