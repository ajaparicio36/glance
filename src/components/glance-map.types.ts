export type Coordinate = readonly [longitude: number, latitude: number];

export type MapDevice = {
  id: string;
  coordinate: Coordinate;
};

export type GlanceMapProps = {
  polygon: readonly Coordinate[];
  devices: readonly MapDevice[];
  selectedDeviceId?: string | null;
  editMode?: boolean;
  previewVertices?: readonly Coordinate[];
  onMapPress?: (coordinate: Coordinate) => void;
  onDevicePress?: (deviceId: string) => void;
  initialCenter?: Coordinate;
};
