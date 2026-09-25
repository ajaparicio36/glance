import { int, sqliteTable } from "drizzle-orm/sqlite-core";

export const geofenceTable = sqliteTable("geofence", {
    id: int("id").primaryKey({ autoIncrement: true })
})