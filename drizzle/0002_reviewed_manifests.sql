CREATE TABLE `manifest_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`digest` text NOT NULL,
	`canonical_payload` text NOT NULL,
	`applied_at` text NOT NULL,
	CONSTRAINT "manifest_version" CHECK("manifest_applications"."version" = 1),
	CONSTRAINT "manifest_kind" CHECK("manifest_applications"."kind" in ('person','filing')),
	CONSTRAINT "manifest_digest" CHECK(length("manifest_applications"."digest") = 64 and "manifest_applications"."digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "manifest_payload" CHECK(json_valid("manifest_applications"."canonical_payload") and json_type("manifest_applications"."canonical_payload") = 'object')
);
