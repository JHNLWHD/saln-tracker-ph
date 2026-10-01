CREATE TABLE `identity_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`from_person_id` text NOT NULL,
	`to_person_id` text NOT NULL,
	`manifest_id` text NOT NULL,
	`reason` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`citations` text NOT NULL,
	FOREIGN KEY (`from_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manifest_id`) REFERENCES `manifest_applications`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "identity_match_distinct" CHECK("identity_matches"."from_person_id" != "identity_matches"."to_person_id"),
	CONSTRAINT "identity_match_reason" CHECK(length(trim("identity_matches"."reason")) > 0),
	CONSTRAINT "identity_match_citations" CHECK(json_valid("identity_matches"."citations") and json_type("identity_matches"."citations") = 'array' and json_array_length("identity_matches"."citations") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_matches_from_person_id_unique` ON `identity_matches` (`from_person_id`);--> statement-breakpoint
CREATE INDEX `identity_match_target` ON `identity_matches` (`to_person_id`);--> statement-breakpoint
CREATE TABLE `legacy_documents` (
	`path` text PRIMARY KEY NOT NULL,
	`source_document_id` text NOT NULL,
	`sha256` text NOT NULL,
	`manifest_id` text NOT NULL,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manifest_id`) REFERENCES `manifest_applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `person_aliases` (
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`person_id` text NOT NULL,
	`source_url` text NOT NULL,
	`manifest_id` text NOT NULL,
	PRIMARY KEY(`kind`, `value`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manifest_id`) REFERENCES `manifest_applications`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "person_alias_kind" CHECK("person_aliases"."kind" in ('slug','identifier'))
);
--> statement-breakpoint
CREATE INDEX `person_alias_owner` ON `person_aliases` (`person_id`);--> statement-breakpoint
CREATE TABLE `__new_manifest_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`digest` text NOT NULL,
	`canonical_payload` text NOT NULL,
	`applied_at` text NOT NULL,
	CONSTRAINT "manifest_version" CHECK("__new_manifest_applications"."version" = 1),
	CONSTRAINT "manifest_kind" CHECK("__new_manifest_applications"."kind" in ('person','filing','correction','identities')),
	CONSTRAINT "manifest_digest" CHECK(length("__new_manifest_applications"."digest") = 64 and "__new_manifest_applications"."digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "manifest_payload" CHECK(json_valid("__new_manifest_applications"."canonical_payload") and json_type("__new_manifest_applications"."canonical_payload") = 'object')
);
--> statement-breakpoint
INSERT INTO `__new_manifest_applications`("id", "version", "kind", "digest", "canonical_payload", "applied_at") SELECT "id", "version", "kind", "digest", "canonical_payload", "applied_at" FROM `manifest_applications`;--> statement-breakpoint
DROP TABLE `manifest_applications`;--> statement-breakpoint
ALTER TABLE `__new_manifest_applications` RENAME TO `manifest_applications`;
