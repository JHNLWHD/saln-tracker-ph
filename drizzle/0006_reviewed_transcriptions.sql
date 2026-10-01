CREATE TABLE `financial_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`filing_id` text NOT NULL,
	`sources` text NOT NULL,
	`total_assets` text NOT NULL,
	`total_liabilities` text NOT NULL,
	`declared_net_worth` text NOT NULL,
	`currency` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`reviewed_by` text NOT NULL,
	FOREIGN KEY (`filing_id`) REFERENCES `filings`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "summary_currency" CHECK("financial_summaries"."currency" = 'PHP'),
	CONSTRAINT "summary_sources" CHECK(json_valid("financial_summaries"."sources") and json_type("financial_summaries"."sources") = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `summary_filing` ON `financial_summaries` (`filing_id`);--> statement-breakpoint
CREATE TABLE `secondary_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`publisher` text NOT NULL,
	`published_date` text,
	`note` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`reviewed_by` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reports_person` ON `secondary_reports` (`person_id`);--> statement-breakpoint
CREATE TABLE `__new_editorial_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`previous_correction_id` text,
	`revision` integer NOT NULL,
	`reason` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`reviewed_by` text NOT NULL,
	`previous_values` text NOT NULL,
	`changes` text NOT NULL,
	`citations` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `manifest_applications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`previous_correction_id`) REFERENCES `editorial_corrections`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "correction_target_type" CHECK("__new_editorial_corrections"."target_type" in ('person','tenure','filing','source_document','financial_summary','secondary_report')),
	CONSTRAINT "correction_revision" CHECK("__new_editorial_corrections"."revision" > 0 and (("__new_editorial_corrections"."revision" = 1 and "__new_editorial_corrections"."previous_correction_id" is null) or ("__new_editorial_corrections"."revision" > 1 and "__new_editorial_corrections"."previous_correction_id" is not null))),
	CONSTRAINT "correction_reason" CHECK(length(trim("__new_editorial_corrections"."reason")) > 0),
	CONSTRAINT "correction_changes" CHECK(json_valid("__new_editorial_corrections"."changes") and json_type("__new_editorial_corrections"."changes") = 'object'),
	CONSTRAINT "correction_previous_values" CHECK(json_valid("__new_editorial_corrections"."previous_values") and json_type("__new_editorial_corrections"."previous_values") = 'object'),
	CONSTRAINT "correction_citations" CHECK(json_valid("__new_editorial_corrections"."citations") and json_type("__new_editorial_corrections"."citations") = 'array' and json_array_length("__new_editorial_corrections"."citations") > 0)
);
--> statement-breakpoint
INSERT INTO `__new_editorial_corrections`("id", "target_type", "target_id", "previous_correction_id", "revision", "reason", "reviewed_at", "reviewed_by", "previous_values", "changes", "citations") SELECT "id", "target_type", "target_id", "previous_correction_id", "revision", "reason", "reviewed_at", "reviewed_by", "previous_values", "changes", "citations" FROM `editorial_corrections`;--> statement-breakpoint
DROP TABLE `editorial_corrections`;--> statement-breakpoint
ALTER TABLE `__new_editorial_corrections` RENAME TO `editorial_corrections`;--> statement-breakpoint
CREATE UNIQUE INDEX `corrections_target_revision` ON `editorial_corrections` (`target_type`,`target_id`,`revision`);--> statement-breakpoint
CREATE TABLE `__new_manifest_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`digest` text NOT NULL,
	`canonical_payload` text NOT NULL,
	`applied_at` text NOT NULL,
	CONSTRAINT "manifest_version" CHECK("__new_manifest_applications"."version" = 1),
	CONSTRAINT "manifest_kind" CHECK("__new_manifest_applications"."kind" in ('person','filing','correction','identities','roster','summary','report')),
	CONSTRAINT "manifest_digest" CHECK(length("__new_manifest_applications"."digest") = 64 and "__new_manifest_applications"."digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "manifest_payload" CHECK(json_valid("__new_manifest_applications"."canonical_payload") and json_type("__new_manifest_applications"."canonical_payload") = 'object')
);
--> statement-breakpoint
INSERT INTO `__new_manifest_applications`("id", "version", "kind", "digest", "canonical_payload", "applied_at") SELECT "id", "version", "kind", "digest", "canonical_payload", "applied_at" FROM `manifest_applications`;--> statement-breakpoint
DROP TABLE `manifest_applications`;--> statement-breakpoint
ALTER TABLE `__new_manifest_applications` RENAME TO `manifest_applications`;
