import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import {
  demoDevicesTable,
  geofenceTable,
  violationsTable,
} from '../../db/schema';
import {
  getDeterministicInsidePoint,
  getDeterministicOutsidePoint,
  getValidatedPolygon,
  isPointInPolygon,
  isValidCoordinate,
  type Coordinate,
} from '../domain/geofence';
import {
  assertCanRemoveDevice,
  assertCanSimulate,
  evaluateLifecycle,
  type PositionEvent,
  type PositionStatus,
} from '../domain/lifecycle';
import { db, initializeDatabase } from '../utils/db';

export type ViolationResolution = 'returned' | 'fence_changed';
export type { PositionEvent, PositionStatus } from '../domain/lifecycle';

export type Geofence = {
  vertices: Coordinate[];
  updatedAt: string;
};

export type DemoDevice = {
  id: string;
  position: Coordinate | null;
  buzzerEnabled: boolean;
};

export type Violation = {
  id: number;
  deviceId: string;
  outsidePosition: Coordinate;
  outsideAt: string;
  returnedPosition: Coordinate | null;
  resolution: ViolationResolution | null;
  resolvedAt: string | null;
};

export type DemoSnapshot = {
  geofence: Geofence | null;
  devices: DemoDevice[];
  violations: Violation[];
};

export type PositionUpdate = {
  device: DemoDevice;
  status: PositionStatus;
  event: PositionEvent;
  position: Coordinate;
  detectedAt: string;
  violation: Violation | null;
};

export type SaveGeofenceResult = {
  geofence: Geofence;
  replaced: boolean;
};

type DeviceRow = typeof demoDevicesTable.$inferSelect;
type GeofenceRow = typeof geofenceTable.$inferSelect;
type ViolationRow = typeof violationsTable.$inferSelect;
type PositionExpectation = 'inside' | 'outside';
type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const currentTimestamp = (): string => new Date().toISOString();

const toCoordinate = (
  latitude: number | null,
  longitude: number | null,
): Coordinate | null => {
  if (latitude === null && longitude === null) return null;
  if (latitude === null || longitude === null) {
    throw new Error('Stored device coordinates are incomplete.');
  }
  return { latitude, longitude };
};

const toDevice = (row: DeviceRow): DemoDevice => ({
  id: row.id,
  position: toCoordinate(row.latitude, row.longitude),
  buzzerEnabled: row.buzzerEnabled,
});

const toViolation = (row: ViolationRow): Violation => {
  const outsidePosition = toCoordinate(row.outsideLatitude, row.outsideLongitude);
  if (outsidePosition === null) throw new Error('Stored breach coordinates are missing.');

  const returnedPosition = toCoordinate(row.returnLatitude, row.returnLongitude);
  return {
    id: row.id,
    deviceId: row.deviceId,
    outsidePosition,
    outsideAt: row.outsideAt,
    returnedPosition,
    resolution: row.resolution,
    resolvedAt: row.resolvedAt,
  };
};

const toGeofence = (row: GeofenceRow): Geofence => ({
  vertices: getValidatedPolygon(row.vertices),
  updatedAt: row.updatedAt,
});

const requireGeofence = (tx: DatabaseTransaction): Geofence => {
  const row = tx.select().from(geofenceTable).where(eq(geofenceTable.id, 1)).get();
  if (!row) throw new Error('Save a geofence before simulating device positions.');
  return toGeofence(row);
};

const requireDevice = (tx: DatabaseTransaction, id: string): DeviceRow => {
  const row = tx.select().from(demoDevicesTable).where(eq(demoDevicesTable.id, id)).get();
  if (!row) throw new Error(`Device "${id}" is not configured.`);
  return row;
};

const requireDeviceById = (tx: DatabaseTransaction, id: string): DeviceRow => {
  const normalizedId = id.trim();
  if (!normalizedId) throw new Error('Enter a device ID.');
  const row = tx
    .select()
    .from(demoDevicesTable)
    .all()
    .find((device) => device.id.toLowerCase() === normalizedId.toLowerCase());
  if (!row) throw new Error(`Device "${normalizedId}" is not configured.`);
  return row;
};

const requireActiveViolation = (
  tx: DatabaseTransaction,
  deviceId: string,
): ViolationRow | undefined =>
  tx
    .select()
    .from(violationsTable)
    .where(and(eq(violationsTable.deviceId, deviceId), isNull(violationsTable.resolution)))
    .get();

const persistPosition = (
  tx: DatabaseTransaction,
  deviceId: string,
  position: Coordinate,
  expected: PositionExpectation | undefined,
  detectedAt: string,
  geofence: Geofence,
): PositionUpdate => {
  requireDevice(tx, deviceId);
  const inside = isPointInPolygon(position, geofence.vertices);
  if (expected !== undefined && inside !== (expected === 'inside')) {
    throw new Error(`The candidate position must be ${expected} the saved geofence.`);
  }

  const activeViolation = requireActiveViolation(tx, deviceId);
  const decision = evaluateLifecycle(inside, activeViolation !== undefined);
  let violation: Violation | null = null;

  tx.update(demoDevicesTable)
    .set({ latitude: position.latitude, longitude: position.longitude })
    .where(eq(demoDevicesTable.id, deviceId))
    .run();

  if (decision.resolveActiveViolation && activeViolation) {
    tx.update(violationsTable)
      .set({
        returnLatitude: position.latitude,
        returnLongitude: position.longitude,
        resolution: 'returned',
        resolvedAt: detectedAt,
      })
      .where(eq(violationsTable.id, activeViolation.id))
      .run();
    const resolvedViolation = tx
      .select()
      .from(violationsTable)
      .where(eq(violationsTable.id, activeViolation.id))
      .get();
    if (!resolvedViolation) throw new Error('The returned violation could not be reloaded.');
    violation = toViolation(resolvedViolation);
  } else if (decision.createViolation) {
    const createdViolation = tx
      .insert(violationsTable)
      .values({
        deviceId,
        outsideLatitude: position.latitude,
        outsideLongitude: position.longitude,
        outsideAt: detectedAt,
        returnLatitude: null,
        returnLongitude: null,
        resolution: null,
        resolvedAt: null,
      })
      .returning()
      .get();
    if (!createdViolation) throw new Error('The breach could not be recorded.');
    violation = toViolation(createdViolation);
  } else if (activeViolation) {
    violation = toViolation(activeViolation);
  }

  const updatedDevice = tx
    .select()
    .from(demoDevicesTable)
    .where(eq(demoDevicesTable.id, deviceId))
    .get();
  if (!updatedDevice) throw new Error('The updated device could not be reloaded.');

  return {
    device: toDevice(updatedDevice),
    status: decision.status,
    event: decision.event,
    position,
    detectedAt,
    violation,
  };
};

export async function getDemoSnapshot(): Promise<DemoSnapshot> {
  await initializeDatabase();

  return db.transaction((tx) => {
    const fenceRow = tx.select().from(geofenceTable).where(eq(geofenceTable.id, 1)).get();
    const devices = tx
      .select()
      .from(demoDevicesTable)
      .orderBy(asc(demoDevicesTable.id))
      .all()
      .map(toDevice);
    const violations = tx
      .select()
      .from(violationsTable)
      .orderBy(desc(violationsTable.outsideAt), desc(violationsTable.id))
      .limit(10)
      .all()
      .map(toViolation);

    return {
      geofence: fenceRow ? toGeofence(fenceRow) : null,
      devices,
      violations,
    };
  });
}

export async function saveGeofence(
  inputVertices: readonly Coordinate[],
): Promise<SaveGeofenceResult> {
  const vertices = getValidatedPolygon(inputVertices);
  await initializeDatabase();

  return db.transaction((tx) => {
    const previous = tx.select().from(geofenceTable).where(eq(geofenceTable.id, 1)).get();
    const updatedAt = currentTimestamp();
    if (previous) {
      tx.update(violationsTable)
        .set({ resolution: 'fence_changed', resolvedAt: updatedAt })
        .where(isNull(violationsTable.resolution))
        .run();
      tx.update(demoDevicesTable).set({ latitude: null, longitude: null }).run();
      tx.update(geofenceTable)
        .set({ vertices, updatedAt })
        .where(eq(geofenceTable.id, 1))
        .run();
    } else {
      tx.insert(geofenceTable).values({ id: 1, vertices, updatedAt }).run();
    }

    return {
      geofence: { vertices, updatedAt },
      replaced: previous !== undefined,
    };
  });
}

export async function addDemoDevice(inputId: string): Promise<DemoDevice> {
  const id = inputId.trim();
  if (!id) throw new Error('Enter a device ID.');
  await initializeDatabase();

  return db.transaction((tx) => {
    const configured = tx.select().from(demoDevicesTable).all();
    if (configured.length >= 5) throw new Error('A maximum of five devices can be configured.');
    if (configured.some((device) => device.id.toLowerCase() === id.toLowerCase())) {
      throw new Error(`Device ID "${id}" is already configured.`);
    }

    tx.insert(demoDevicesTable)
      .values({ id, latitude: null, longitude: null, buzzerEnabled: false })
      .run();
    const created = tx
      .select()
      .from(demoDevicesTable)
      .where(eq(demoDevicesTable.id, id))
      .get();
    if (!created) throw new Error(`Device "${id}" could not be loaded after saving.`);
    return toDevice(created);
  });
}

export async function removeDemoDevice(inputId: string): Promise<void> {
  await initializeDatabase();

  db.transaction((tx) => {
    const device = requireDeviceById(tx, inputId);
    assertCanRemoveDevice(requireActiveViolation(tx, device.id) !== undefined);
    tx.delete(demoDevicesTable).where(eq(demoDevicesTable.id, device.id)).run();
  });
}

export async function setVisualBuzzer(
  inputId: string,
  enabled: boolean,
): Promise<DemoDevice> {
  await initializeDatabase();

  return db.transaction((tx) => {
    const device = requireDeviceById(tx, inputId);
    tx.update(demoDevicesTable)
      .set({ buzzerEnabled: enabled })
      .where(eq(demoDevicesTable.id, device.id))
      .run();
    const updated = tx
      .select()
      .from(demoDevicesTable)
      .where(eq(demoDevicesTable.id, device.id))
      .get();
    if (!updated) throw new Error(`Device "${device.id}" could not be reloaded.`);
    return toDevice(updated);
  });
}

export async function updateSimulatedPosition(
  inputId: string,
  position: Coordinate,
): Promise<PositionUpdate> {
  if (!isValidCoordinate(position)) {
    throw new Error('The position must use a valid latitude and longitude.');
  }
  await initializeDatabase();

  return db.transaction((tx) => {
    const device = requireDeviceById(tx, inputId);
    const geofence = requireGeofence(tx);
    if (!isPointInPolygon(position, geofence.vertices)) {
      const activeViolation = requireActiveViolation(tx, device.id);
      if (!activeViolation) {
        const currentPosition = toCoordinate(device.latitude, device.longitude);
        const hasPlacedInsidePosition =
          currentPosition !== null && isPointInPolygon(currentPosition, geofence.vertices);
        assertCanSimulate('breach', hasPlacedInsidePosition, false);
      }
    }
    return persistPosition(
      tx,
      device.id,
      { latitude: position.latitude, longitude: position.longitude },
      undefined,
      currentTimestamp(),
      geofence,
    );
  });
}

export async function placeHerdInside(): Promise<PositionUpdate[]> {
  await initializeDatabase();

  return db.transaction((tx) => {
    const geofence = requireGeofence(tx);
    const devices = tx.select().from(demoDevicesTable).orderBy(asc(demoDevicesTable.id)).all();
    const detectedAt = currentTimestamp();

    return devices.map((device) => {
      const position = getDeterministicInsidePoint(geofence.vertices, device.id);
      return persistPosition(tx, device.id, position, 'inside', detectedAt, geofence);
    });
  });
}

export async function simulateBreach(inputId: string): Promise<PositionUpdate> {
  await initializeDatabase();

  return db.transaction((tx) => {
    const device = requireDeviceById(tx, inputId);
    const geofence = requireGeofence(tx);
    const currentPosition = toCoordinate(device.latitude, device.longitude);
    const activeViolation = requireActiveViolation(tx, device.id);
    const hasPlacedInsidePosition =
      currentPosition !== null && isPointInPolygon(currentPosition, geofence.vertices);
    assertCanSimulate('breach', hasPlacedInsidePosition, activeViolation !== undefined);
    const position = getDeterministicOutsidePoint(geofence.vertices, device.id);
    return persistPosition(tx, device.id, position, 'outside', currentTimestamp(), geofence);
  });
}

export async function simulateReturn(inputId: string): Promise<PositionUpdate> {
  await initializeDatabase();

  return db.transaction((tx) => {
    const device = requireDeviceById(tx, inputId);
    const geofence = requireGeofence(tx);
    const activeViolation = requireActiveViolation(tx, device.id);
    assertCanSimulate('return', false, activeViolation !== undefined);
    const position = getDeterministicInsidePoint(geofence.vertices, device.id);
    return persistPosition(tx, device.id, position, 'inside', currentTimestamp(), geofence);
  });
}
