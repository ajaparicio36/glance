import { sql } from 'drizzle-orm';
import {
  check,
  index,
  int,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { Coordinate } from '../src/domain/geofence';

export const geofenceTable = sqliteTable(
  'geofence',
  {
    id: int('id').primaryKey(),
    vertices: text('vertices', { mode: 'json' }).$type<Coordinate[]>().notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [check('geofence_singleton_id', sql`${table.id} = 1`)],
);

export const demoDevicesTable = sqliteTable(
  'demo_devices',
  {
    id: text('id').notNull().primaryKey(),
    latitude: real('latitude'),
    longitude: real('longitude'),
    buzzerEnabled: int('buzzer_enabled', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    uniqueIndex('demo_devices_id_case_insensitive').on(sql`lower(${table.id})`),
    check('demo_devices_id_not_blank', sql`length(trim(${table.id})) > 0`),
    check(
      'demo_devices_position_pair',
      sql`(${table.latitude} IS NULL AND ${table.longitude} IS NULL) OR (${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL AND ${table.latitude} BETWEEN -90 AND 90 AND ${table.longitude} BETWEEN -180 AND 180)`,
    ),
  ],
);

export const violationsTable = sqliteTable(
  'violations',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    deviceId: text('device_id').notNull(),
    outsideLatitude: real('outside_latitude').notNull(),
    outsideLongitude: real('outside_longitude').notNull(),
    outsideAt: text('outside_at').notNull(),
    returnLatitude: real('return_latitude'),
    returnLongitude: real('return_longitude'),
    resolution: text('resolution', { enum: ['returned', 'fence_changed'] }),
    resolvedAt: text('resolved_at'),
  },
  (table) => [
    uniqueIndex('violations_one_active_per_device')
      .on(table.deviceId)
      .where(sql`${table.resolution} IS NULL`),
    index('violations_outside_at').on(table.outsideAt),
    check(
      'violations_outside_coordinates',
      sql`${table.outsideLatitude} BETWEEN -90 AND 90 AND ${table.outsideLongitude} BETWEEN -180 AND 180`,
    ),
    check(
      'violations_resolution_state',
      sql`(
        ${table.resolution} IS NULL
        AND ${table.returnLatitude} IS NULL
        AND ${table.returnLongitude} IS NULL
        AND ${table.resolvedAt} IS NULL
      ) OR (
        ${table.resolution} = 'returned'
        AND ${table.returnLatitude} IS NOT NULL
        AND ${table.returnLongitude} IS NOT NULL
        AND ${table.returnLatitude} BETWEEN -90 AND 90
        AND ${table.returnLongitude} BETWEEN -180 AND 180
        AND ${table.resolvedAt} IS NOT NULL
      ) OR (
        ${table.resolution} = 'fence_changed'
        AND ${table.returnLatitude} IS NULL
        AND ${table.returnLongitude} IS NULL
        AND ${table.resolvedAt} IS NOT NULL
      )`,
    ),
  ],
);
