export type GeofenceSchemaState = 'missing' | 'legacy_id_only' | 'current' | 'unsupported';

export function classifyGeofenceColumns(columns: readonly string[]): GeofenceSchemaState {
  if (columns.length === 0) return 'missing';
  if (columns.length === 1 && columns[0] === 'id') return 'legacy_id_only';

  const names = [...columns].sort();
  if (
    names.length === 3 &&
    names[0] === 'id' &&
    names[1] === 'updated_at' &&
    names[2] === 'vertices'
  ) {
    return 'current';
  }

  return 'unsupported';
}
