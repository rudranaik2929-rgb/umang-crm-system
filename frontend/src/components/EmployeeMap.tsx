import React, { useMemo } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../theme/ThemeContext';

interface Employee {
  employee_id: string;
  name: string;
  role: string;
  last_lat?: number;
  last_lng?: number;
  last_seen_at?: string;
}

interface Props {
  employees: Employee[];
  selectedId?: string | null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function EmployeeMap({ employees, selectedId }: Props) {
  const { colors } = useTheme();

  const located = useMemo(
    () => employees.filter((e) => e.last_lat != null && e.last_lng != null),
    [employees],
  );

  const html = useMemo(() => {
    const markers = located.map((e) => {
      const name = escapeHtml(e.name || 'Employee');
      const role = escapeHtml(e.role || '');
      const seen = e.last_seen_at
        ? escapeHtml(new Date(e.last_seen_at).toLocaleString('en-IN'))
        : '—';
      const highlight = selectedId === e.employee_id;
      return `
        L.marker([${e.last_lat}, ${e.last_lng}], {
          title: '${name}',
        })
          .addTo(map)
          .bindPopup('<b>${name}</b><br>${role}<br>Last seen: ${seen}');
        ${highlight ? `map.setView([${e.last_lat}, ${e.last_lng}], 14);` : ''}
      `;
    }).join('\n');

    const fitBounds = located.length > 0
      ? `var group = L.featureGroup([${located.map((e) => `L.marker([${e.last_lat}, ${e.last_lng}])`).join(',')}]);
         map.fitBounds(group.getBounds().pad(0.15));`
      : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; background: #0A1628; }
          #map { height: 100vh; width: 100vw; background: #0A1628; }
          .leaflet-container { background: #0A1628 !important; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map').setView([19.47, 72.8], 10);
          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap'
          }).addTo(map);
          ${markers}
          ${fitBounds}
        </script>
      </body>
      </html>
    `;
  }, [located, selectedId]);

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
  container: { flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1 },
  map: { flex: 1 },
  empty: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
