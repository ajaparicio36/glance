import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  type CameraRef,
  type PressEvent,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
} from 'react-native';

import type {
  Coordinate,
  GlanceMapProps,
} from './glance-map.types';

export type {
  Coordinate,
  GlanceMapProps,
  MapDevice,
} from './glance-map.types';

const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER: Coordinate = [121.0244, 14.5547];
const CAMERA_FIT_PADDING = { top: 82, right: 72, bottom: 104, left: 36 };
const ZOOM_STEP = 1;

type MapPressEvent = NativeSyntheticEvent<PressEvent>;

function closeRing(vertices: readonly Coordinate[]): [number, number][] {
  const ring = vertices.map(
    ([longitude, latitude]): [number, number] => [longitude, latitude],
  );
  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([...first]);
  }

  return ring;
}

function toFeatureCollection(
  geometry: GeoJSON.Geometry | null,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: geometry
      ? [{ type: 'Feature', properties: {}, geometry }]
      : [],
  };
}

function getBounds(coordinates: readonly Coordinate[]): [number, number, number, number] | null {
  if (coordinates.length === 0) return null;

  let west = coordinates[0][0];
  let east = coordinates[0][0];
  let south = coordinates[0][1];
  let north = coordinates[0][1];

  for (const [longitude, latitude] of coordinates.slice(1)) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }

  if (west === east) {
    west -= 0.004;
    east += 0.004;
  }

  if (south === north) {
    south -= 0.004;
    north += 0.004;
  }

  return [west, south, east, north];
}

export default function GlanceMap({
  polygon,
  devices,
  selectedDeviceId = null,
  editMode = false,
  previewVertices = [],
  onMapPress,
  onDevicePress,
  initialCenter = DEFAULT_CENTER,
}: GlanceMapProps) {
  const cameraRef = useRef<CameraRef>(null);
  const mapReadyRef = useRef(false);
  const pendingFitRef = useRef(false);
  const zoomRef = useRef(10);
  const savedCoordinates = useMemo<Coordinate[]>(
    () => [...polygon, ...devices.map((device) => device.coordinate)],
    [devices, polygon],
  );
  const bounds = useMemo(() => getBounds(savedCoordinates), [savedCoordinates]);
  const fitKey = JSON.stringify(savedCoordinates);
  const boundsRef = useRef(bounds);
  const savedPolygon = useMemo(
    () =>
      toFeatureCollection(
        polygon.length >= 3
          ? { type: 'Polygon', coordinates: [closeRing(polygon)] }
          : null,
      ),
    [polygon],
  );
  const previewGeometry = useMemo<GeoJSON.Geometry | null>(() => {
    if (previewVertices.length < 2) return null;

    if (previewVertices.length >= 3) {
      return { type: 'Polygon', coordinates: [closeRing(previewVertices)] };
    }

    return {
      type: 'LineString',
      coordinates: previewVertices.map(([longitude, latitude]) => [longitude, latitude]),
    };
  }, [previewVertices]);
  const previewData = useMemo(
    () => toFeatureCollection(previewGeometry),
    [previewGeometry],
  );

  const fitToSavedContent = useCallback(() => {
    const currentBounds = boundsRef.current;
    if (!currentBounds) return;

    cameraRef.current?.fitBounds(currentBounds, {
      padding: CAMERA_FIT_PADDING,
      duration: 650,
      easing: 'ease',
    });
  }, []);

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  useEffect(() => {
    if (!boundsRef.current) return;

    if (mapReadyRef.current) {
      fitToSavedContent();
    } else {
      pendingFitRef.current = true;
    }
  }, [fitKey, fitToSavedContent]);

  const handleMapReady = useCallback(() => {
    mapReadyRef.current = true;
    if (pendingFitRef.current) {
      pendingFitRef.current = false;
      fitToSavedContent();
    }
  }, [fitToSavedContent]);

  const handleMapPress = useCallback(
    (event: MapPressEvent) => {
      if (!editMode || !onMapPress) return;

      const [longitude, latitude] = event.nativeEvent.lngLat;
      onMapPress([longitude, latitude]);
    },
    [editMode, onMapPress],
  );

  const handleRegionChange = useCallback(
    (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      zoomRef.current = event.nativeEvent.zoom;
    },
    [],
  );

  const zoomBy = useCallback((direction: -1 | 1) => {
    const nextZoom = Math.max(3, Math.min(19, zoomRef.current + direction * ZOOM_STEP));
    zoomRef.current = nextZoom;
    cameraRef.current?.zoomTo(nextZoom, { duration: 180, easing: 'ease' });
  }, []);

  return (
    <View style={styles.root}>
      <MapLibreMap
        androidView="texture"
        attribution
        attributionPosition={{ top: 12, left: 12 }}
        logo
        logoPosition={{ bottom: 18, right: 14 }}
        mapStyle={OPENFREEMAP_STYLE_URL}
        onDidFinishLoadingMap={handleMapReady}
        onPress={editMode && onMapPress ? handleMapPress : undefined}
        onRegionDidChange={handleRegionChange}
        style={StyleSheet.absoluteFill}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: [...initialCenter], zoom: 10 }}
          maxZoom={19}
          minZoom={3}
        />

        {polygon.length >= 3 ? (
          <GeoJSONSource data={savedPolygon} id="glance-saved-fence">
            <Layer
              id="glance-saved-fence-fill"
              paint={{ 'fill-color': '#0f766e', 'fill-opacity': 0.15 }}
              type="fill"
            />
            <Layer
              id="glance-saved-fence-line"
              paint={{ 'line-color': '#0f766e', 'line-width': 3 }}
              type="line"
            />
          </GeoJSONSource>
        ) : null}

        {editMode && previewGeometry ? (
          <GeoJSONSource data={previewData} id="glance-fence-preview">
            {previewGeometry.type === 'Polygon' ? (
              <Layer
                id="glance-fence-preview-fill"
                paint={{ 'fill-color': '#f59e0b', 'fill-opacity': 0.18 }}
                type="fill"
              />
            ) : null}
            <Layer
              id="glance-fence-preview-line"
              paint={{ 'line-color': '#d97706', 'line-width': 3, 'line-dasharray': [1.5, 1] }}
              type="line"
            />
          </GeoJSONSource>
        ) : null}

        {editMode
          ? previewVertices.map((coordinate, index) => (
              <Marker
                anchor="center"
                key={`preview-${index}-${coordinate[0]}-${coordinate[1]}`}
                lngLat={[...coordinate]}
              >
                <View accessible accessibilityLabel={`Fence point ${index + 1}`} style={styles.vertexMarker}>
                  <Text style={styles.vertexNumber}>{index + 1}</Text>
                </View>
              </Marker>
            ))
          : null}

        {devices.map((device) => {
          const selected = device.id === selectedDeviceId;

          return (
            <Marker
              accessibilityLabel={`Select device ${device.id}`}
              accessibilityRole="button"
              anchor="center"
              id={device.id}
              key={device.id}
              lngLat={[...device.coordinate]}
              onPress={() => onDevicePress?.(device.id)}
            >
              <View
                accessible
                accessibilityLabel={`Select device ${device.id}`}
                accessibilityRole="button"
                style={[styles.deviceMarker, selected && styles.selectedDeviceMarker]}
              >
                <MaterialCommunityIcons color="#ffffff" name="cow" size={20} />
              </View>
            </Marker>
          );
        })}
      </MapLibreMap>

      <View accessibilityLabel="Map zoom controls" style={styles.zoomControls}>
        <Pressable
          accessibilityLabel="Zoom in"
          accessibilityRole="button"
          onPress={() => zoomBy(1)}
          style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons color="#102a2a" name="plus" size={22} />
        </Pressable>
        <View style={styles.controlDivider} />
        <Pressable
          accessibilityLabel="Zoom out"
          accessibilityRole="button"
          onPress={() => zoomBy(-1)}
          style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons color="#102a2a" name="minus" size={22} />
        </Pressable>
      </View>

      <View pointerEvents="none" style={styles.attributionLabel}>
        <Text style={styles.attributionText}>
          © OpenStreetMap contributors · Map style by OpenFreeMap
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#e8efed',
    flex: 1,
    minHeight: 240,
    overflow: 'hidden',
  },
  zoomControls: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d6e1df',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
    overflow: 'hidden',
    position: 'absolute',
    right: 16,
    shadowColor: '#112b29',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    top: 62,
  },
  zoomButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  pressed: {
    backgroundColor: '#edf5f3',
  },
  controlDivider: {
    backgroundColor: '#e2e9e7',
    height: StyleSheet.hairlineWidth,
    width: 32,
  },
  attributionLabel: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(37,64,60,0.18)',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    position: 'absolute',
  },
  attributionText: {
    color: '#29413e',
    fontSize: 10,
  },
  deviceMarker: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 2,
    elevation: 4,
    height: 36,
    justifyContent: 'center',
    shadowColor: '#0f302c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 3,
    width: 36,
  },
  selectedDeviceMarker: {
    backgroundColor: '#b45309',
    borderColor: '#fff1d6',
    height: 42,
    width: 42,
  },
  vertexMarker: {
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderColor: '#c2410c',
    borderRadius: 12,
    borderWidth: 2,
    elevation: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  vertexNumber: {
    color: '#9a3412',
    fontSize: 11,
    fontWeight: '700',
  },
});
