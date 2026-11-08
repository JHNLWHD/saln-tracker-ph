CREATE TABLE `citations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`publisher` text NOT NULL,
	`type` text NOT NULL,
	`published_date` text,
	CONSTRAINT "citation_type" CHECK("citations"."type" in ('official_record','public_article'))
);
--> statement-breakpoint
CREATE TABLE `constituencies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`jurisdiction_id` text,
	FOREIGN KEY (`jurisdiction_id`) REFERENCES `jurisdictions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "constituency_kind" CHECK("constituencies"."kind" in ('nation','legislative_district','party_list','provincial_district','local_district','at_large'))
);
--> statement-breakpoint
CREATE TABLE `electoral_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`office_id` text NOT NULL,
	`start_date` text,
	`end_date` text,
	FOREIGN KEY (`office_id`) REFERENCES `offices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jurisdiction_relationships` (
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`from_id`, `to_id`, `kind`),
	FOREIGN KEY (`from_id`) REFERENCES `jurisdictions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_id`) REFERENCES `jurisdictions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "jurisdiction_relationship_kind" CHECK("jurisdiction_relationships"."kind" in ('geographic','administrative')),
	CONSTRAINT "jurisdiction_not_self" CHECK("jurisdiction_relationships"."from_id" != "jurisdiction_relationships"."to_id")
);
--> statement-breakpoint
CREATE TABLE `jurisdictions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	CONSTRAINT "jurisdiction_kind" CHECK("jurisdictions"."kind" in ('country','region','province','city','municipality','legislative_district'))
);
--> statement-breakpoint
CREATE TABLE `offices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`included` integer NOT NULL,
	`jurisdiction_id` text,
	FOREIGN KEY (`jurisdiction_id`) REFERENCES `jurisdictions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "office_kind" CHECK("offices"."kind" in ('elected','chamber_leadership')),
	CONSTRAINT "office_included" CHECK("offices"."included" in (0,1))
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`canonical_name` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`reviewed_by` text NOT NULL,
	CONSTRAINT "person_name_present" CHECK(length(trim("people"."canonical_name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_slug_unique` ON `people` (`slug`);--> statement-breakpoint
CREATE TABLE `person_names` (
	`person_id` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`person_id`, `value`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tenure_citations` (
	`tenure_id` text NOT NULL,
	`citation_id` text NOT NULL,
	`supports` text NOT NULL,
	PRIMARY KEY(`tenure_id`, `citation_id`),
	FOREIGN KEY (`tenure_id`) REFERENCES `tenures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`citation_id`) REFERENCES `citations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tenure_citation_supports" CHECK(json_valid("tenure_citations"."supports") and json_type("tenure_citations"."supports") = 'array')
);
--> statement-breakpoint
CREATE TABLE `tenures` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`office_id` text NOT NULL,
	`electoral_term_id` text,
	`constituency_id` text,
	`start_date` text,
	`end_date` text,
	`assumption_method` text NOT NULL,
	`verification_status` text NOT NULL,
	`disputed_facts` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`office_id`) REFERENCES `offices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`electoral_term_id`) REFERENCES `electoral_terms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`constituency_id`) REFERENCES `constituencies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tenure_verification" CHECK("tenures"."verification_status" in ('verified','unverified','disputed')),
	CONSTRAINT "tenure_assumption" CHECK("tenures"."assumption_method" in ('election','succession','substitution','vacancy_appointment','chamber_selection','unknown')),
	CONSTRAINT "tenure_disputed_facts" CHECK(json_valid("tenures"."disputed_facts") and json_type("tenures"."disputed_facts") = 'array')
);
--> statement-breakpoint
CREATE INDEX `tenures_person` ON `tenures` (`person_id`);--> statement-breakpoint
CREATE INDEX `tenures_verification` ON `tenures` (`verification_status`,`office_id`);