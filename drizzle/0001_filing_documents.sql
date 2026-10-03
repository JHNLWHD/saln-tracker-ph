CREATE TABLE `filings` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`filer_name` text NOT NULL,
	`reporting_date` text NOT NULL,
	`execution_date` text,
	`receipt_date` text,
	`supersedes_filing_id` text,
	`reviewed_at` text NOT NULL,
	`reviewed_by` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "filing_filer_name" CHECK(length(trim("filings"."filer_name")) > 0),
	CONSTRAINT "filing_no_unreviewed_supersession" CHECK("filings"."supersedes_filing_id" is null)
);
--> statement-breakpoint
CREATE INDEX `filings_person_reporting` ON `filings` (`person_id`,`reporting_date`);--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`filing_id` text NOT NULL,
	`file_name` text NOT NULL,
	`media_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_key` text NOT NULL,
	`original_url` text,
	`provenance_type` text NOT NULL,
	`provenance_note` text NOT NULL,
	`official_release_date` text,
	`acquisition_date` text NOT NULL,
	`archive_publication_date` text NOT NULL,
	`transcription_level` text NOT NULL,
	FOREIGN KEY (`filing_id`) REFERENCES `filings`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "source_document_size" CHECK("source_documents"."byte_size" > 0),
	CONSTRAINT "source_document_checksum" CHECK(length("source_documents"."sha256") = 64 and "source_documents"."sha256" not glob '*[^0-9a-f]*'),
	CONSTRAINT "source_document_storage_key" CHECK("source_documents"."storage_key" = 'documents/sha256/' || "source_documents"."sha256"),
	CONSTRAINT "source_document_media_type" CHECK("source_documents"."media_type" in ('application/pdf','image/jpeg','image/png')),
	CONSTRAINT "source_document_provenance" CHECK("source_documents"."provenance_type" in ('official_download','formal_release','preserved_copy')),
	CONSTRAINT "source_document_provenance_note" CHECK(length(trim("source_documents"."provenance_note")) > 0),
	CONSTRAINT "source_document_transcription" CHECK("source_documents"."transcription_level" in ('document_only','summary_totals','full_itemization'))
);
--> statement-breakpoint
CREATE INDEX `source_documents_filing` ON `source_documents` (`filing_id`);--> statement-breakpoint
CREATE INDEX `source_documents_checksum` ON `source_documents` (`sha256`);--> statement-breakpoint
CREATE INDEX `source_documents_publication` ON `source_documents` (`archive_publication_date`);