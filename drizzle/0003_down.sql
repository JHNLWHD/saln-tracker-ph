DROP TABLE IF EXISTS editorial_corrections;
CREATE TABLE `__previous_manifest_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`digest` text NOT NULL,
	`canonical_payload` text NOT NULL,
	`applied_at` text NOT NULL,
	CONSTRAINT "manifest_version" CHECK("__previous_manifest_applications"."version" = 1),
	CONSTRAINT "manifest_kind" CHECK("__previous_manifest_applications"."kind" in ('person','filing')),
	CONSTRAINT "manifest_digest" CHECK(length("__previous_manifest_applications"."digest") = 64 and "__previous_manifest_applications"."digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "manifest_payload" CHECK(json_valid("__previous_manifest_applications"."canonical_payload") and json_type("__previous_manifest_applications"."canonical_payload") = 'object')
);

INSERT INTO __previous_manifest_applications SELECT * FROM manifest_applications WHERE kind != 'correction';
DROP TABLE manifest_applications;
ALTER TABLE __previous_manifest_applications RENAME TO manifest_applications;
