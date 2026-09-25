import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as SQLite from 'expo-sqlite';
import { appMigrations } from '@/data/migrations';
import { classifyGeofenceColumns } from '@/data/geofence-schema';

const expo = SQLite.openDatabaseSync('glance.db');
export const db = drizzle(expo);

let migrationsReady: Promise<void> | null = null;

function removeLegacyGeofenceTable(): void {
  const columns = expo.getAllSync<{ name: string }>('PRAGMA table_info(geofence)');
  const state = classifyGeofenceColumns(columns.map(({ name }) => name));
  if (state === 'missing' || state === 'current') return;
  if (state === 'legacy_id_only') {
    expo.execSync('DROP TABLE geofence');
    return;
  }

  throw new Error(
    'The saved geofence table has an unsupported schema and could not be upgraded safely.',
  );
}

export function initializeDatabase(): Promise<void> {
  migrationsReady ??= Promise.resolve()
    .then(() => {
      expo.execSync('PRAGMA journal_mode = WAL');
      removeLegacyGeofenceTable();
      return migrate(db, { migrations: appMigrations });
    })
    .then(() => undefined);
  return migrationsReady;
}
