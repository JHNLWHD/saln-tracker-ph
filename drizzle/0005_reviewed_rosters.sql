CREATE TABLE `roster_members` (
	`snapshot_id` text NOT NULL,
	`tenure_id` text NOT NULL,
	`position` integer NOT NULL,
	`citations` text NOT NULL,
	PRIMARY KEY(`snapshot_id`, `tenure_id`),
	FOREIGN KEY (`snapshot_id`) REFERENCES `roster_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenure_id`) REFERENCES `tenures`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "roster_position" CHECK("roster_members"."position" >= 0),
	CONSTRAINT "roster_evidence" CHECK(json_valid("roster_members"."citations") and json_type("roster_members"."citations") = 'array' and json_array_length("roster_members"."citations") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roster_member_position` ON `roster_members` (`snapshot_id`,`position`);--> statement-breakpoint
CREATE TABLE `roster_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`verified_as_of` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`reviewed_by` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `manifest_applications`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "roster_scope" CHECK("roster_snapshots"."scope" in ('executive','senate','speaker','house','local'))
);
--> statement-breakpoint
CREATE INDEX `roster_scope_date` ON `roster_snapshots` (`scope`,`verified_as_of`);--> statement-breakpoint
CREATE TABLE `__new_manifest_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`digest` text NOT NULL,
	`canonical_payload` text NOT NULL,
	`applied_at` text NOT NULL,
	CONSTRAINT "manifest_version" CHECK("__new_manifest_applications"."version" = 1),
	CONSTRAINT "manifest_kind" CHECK("__new_manifest_applications"."kind" in ('person','filing','correction','identities','roster')),
	CONSTRAINT "manifest_digest" CHECK(length("__new_manifest_applications"."digest") = 64 and "__new_manifest_applications"."digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "manifest_payload" CHECK(json_valid("__new_manifest_applications"."canonical_payload") and json_type("__new_manifest_applications"."canonical_payload") = 'object')
);
--> statement-breakpoint
INSERT INTO `__new_manifest_applications`("id", "version", "kind", "digest", "canonical_payload", "applied_at") SELECT "id", "version", "kind", "digest", "canonical_payload", "applied_at" FROM `manifest_applications`;--> statement-breakpoint
DROP TABLE `manifest_applications`;--> statement-breakpoint
ALTER TABLE `__new_manifest_applications` RENAME TO `manifest_applications`;