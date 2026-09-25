import { StyleSheet, Text, View } from 'react-native';

import type { GlanceMapProps } from './glance-map.types';

export type {
  Coordinate,
  GlanceMapProps,
  MapDevice,
} from './glance-map.types';

export default function GlanceMap({ editMode = false }: GlanceMapProps) {
  return (
    <View accessibilityLabel="Map preview unavailable on web" style={styles.container}>
      <Text style={styles.title}>Map preview is available in the mobile app</Text>
      <Text style={styles.description}>
        {editMode
          ? 'Open Glance on iOS or Android to draw a geofence on the map.'
          : 'Open Glance on iOS or Android to view the geofence and livestock locations.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#edf3f1',
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minHeight: 240,
    padding: 24,
  },
  title: {
    color: '#163330',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    color: '#536b67',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 300,
    textAlign: 'center',
  },
});
