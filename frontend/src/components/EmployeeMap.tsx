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
}

export function EmployeeMap({ employees }: Props) {
  const { colors } = useTheme();

  const html = useMemo(() => {
    const markers = employees
      .filter(e => e.last_lat && e.last_lng)
      .map(e => `
        L.marker([${e.last_lat}, ${e.last_lng}])
          .addTo(map)
          .bindPopup('<b>${e.name}</b><br>${e.role}<br>Seen: ${new Date(e.last_seen_at!).toLocaleTimeString()}');
      `).join('\n');

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
          var map = L.map('map').setView([18.5204, 73.8567], 12); // Default to Pune
          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap'
          }).addTo(map);
          ${markers}
          
          if (${employees.length} > 0) {
            var group = new L.featureGroup([${employees.filter(e => e.last_lat).map(e => `L.marker([${e.last_lat}, ${e.last_lng}])`).join(',')}]);
            map.fitBounds(group.getBounds().pad(0.1));
          }
        </script>
      </body>
      </html>
    `;
  }, [employees]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceAlt }]}>
        <iframe
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
          title="Employee Map"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceAlt }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.map}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  map: { flex: 1 },
});
