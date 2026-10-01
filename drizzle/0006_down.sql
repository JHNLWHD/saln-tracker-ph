CREATE TEMP TABLE transcription_correction_ids AS SELECT id FROM editorial_corrections WHERE target_type IN ('financial_summary','secondary_report');
DELETE FROM editorial_corrections WHERE target_type IN ('financial_summary','secondary_report');
DELETE FROM manifest_applications WHERE id IN (SELECT id FROM transcription_correction_ids);
DROP TABLE transcription_correction_ids;
DROP TABLE financial_summaries;
DROP TABLE secondary_reports;
CREATE TABLE `__previous_editorial_corrections` (
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
	CONSTRAINT "correction_target_type" CHECK("__previous_editorial_corrections"."target_type" in ('person','tenure','filing','source_document')),
	CONSTRAINT "correction_revision" CHECK("__previous_editorial_corrections"."revision" > 0 and (("__previous_editorial_corrections"."revision" = 1 and "__previous_editorial_corrections"."previous_correction_id" is null) or ("__previous_editorial_corrections"."revision" > 1 and "__previous_editorial_corrections"."previous_correction_id" is not null))),
	CONSTRAINT "correction_reason" CHECK(length(trim("__previous_editorial_corrections"."reason")) > 0),
	CONSTRAINT "correction_changes" CHECK(json_valid("__previous_editorial_corrections"."changes") and json_type("__previous_editorial_corrections"."changes") = 'object'),
	CONSTRAINT "correction_previous_values" CHECK(json_valid("__previous_editorial_corrections"."previous_values") and json_type("__previous_editorial_corrections"."previous_values") = 'object'),
	CONSTRAINT "correction_citations" CHECK(json_valid("__previous_editorial_corrections"."citations") and json_type("__previous_editorial_corrections"."citations") = 'array' and json_array_length("__previous_editorial_corrections"."citations") > 0)
);
INSERT INTO __previous_editorial_corrections SELECT * FROM editorial_corrections;
DROP TABLE editorial_corrections;
ALTER TABLE __previous_editorial_corrections RENAME TO editorial_corrections;
CREATE UNIQUE INDEX corrections_target_revision ON editorial_corrections(target_type,target_id,revision);
CREATE TABLE `__previous_manifest_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`digest` text NOT NULL,
	`canonical_payload` text NOT NULL,
	`applied_at` text NOT NULL,
	CONSTRAINT "manifest_version" CHECK("__previous_manifest_applications"."version" = 1),
	CONSTRAINT "manifest_kind" CHECK("__previous_manifest_applications"."kind" in ('person','filing','correction','identities','roster')),
	CONSTRAINT "manifest_digest" CHECK(length("__previous_manifest_applications"."digest") = 64 and "__previous_manifest_applications"."digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "manifest_payload" CHECK(json_valid("__previous_manifest_applications"."canonical_payload") and json_type("__previous_manifest_applications"."canonical_payload") = 'object')
);

INSERT INTO `__previous_manifest_applications`("id", "version", "kind", "digest", "canonical_payload", "applied_at") SELECT "id", "version", "kind", "digest", "canonical_payload", "applied_at" FROM `manifest_applications` WHERE kind not in ('summary','report');
DROP TABLE `manifest_applications`;
ALTER TABLE `__previous_manifest_applications` RENAME TO `manifest_applications`;
