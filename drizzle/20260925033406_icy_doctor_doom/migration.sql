CREATE TABLE `demo_devices` (
	`id` text NOT NULL PRIMARY KEY,
	`latitude` real,
	`longitude` real,
	`buzzer_enabled` integer DEFAULT false NOT NULL,
	CONSTRAINT "demo_devices_id_not_blank" CHECK(length(trim("id")) > 0),
	CONSTRAINT "demo_devices_position_pair" CHECK(("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))
);
--> statement-breakpoint
CREATE TABLE `geofence` (
	`id` integer PRIMARY KEY,
	`vertices` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "geofence_singleton_id" CHECK("id" = 1)
);
--> statement-breakpoint
CREATE TABLE `violations` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`device_id` text NOT NULL,
	`outside_latitude` real NOT NULL,
	`outside_longitude` real NOT NULL,
	`outside_at` text NOT NULL,
	`return_latitude` real,
	`return_longitude` real,
	`resolution` text,
	`resolved_at` text,
	CONSTRAINT "violations_outside_coordinates" CHECK("outside_latitude" BETWEEN -90 AND 90 AND "outside_longitude" BETWEEN -180 AND 180),
	CONSTRAINT "violations_resolution_state" CHECK((
        "resolution" IS NULL
        AND "return_latitude" IS NULL
        AND "return_longitude" IS NULL
        AND "resolved_at" IS NULL
      ) OR (
        "resolution" = 'returned'
        AND "return_latitude" IS NOT NULL
        AND "return_longitude" IS NOT NULL
        AND "return_latitude" BETWEEN -90 AND 90
        AND "return_longitude" BETWEEN -180 AND 180
        AND "resolved_at" IS NOT NULL
      ) OR (
        "resolution" = 'fence_changed'
        AND "return_latitude" IS NULL
        AND "return_longitude" IS NULL
        AND "resolved_at" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_devices_id_case_insensitive` ON `demo_devices` (lower("id"));--> statement-breakpoint
CREATE UNIQUE INDEX `violations_one_active_per_device` ON `violations` (`device_id`) WHERE "violations"."resolution" IS NULL;--> statement-breakpoint
CREATE INDEX `violations_outside_at` ON `violations` (`outside_at`);
--> statement-breakpoint
CREATE TRIGGER `demo_devices_max_five` BEFORE INSERT ON `demo_devices` WHEN (SELECT COUNT(*) FROM `demo_devices`) >= 5 BEGIN SELECT RAISE(ABORT, 'A maximum of five devices can be configured.'); END;
