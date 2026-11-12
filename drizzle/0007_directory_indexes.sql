CREATE INDEX `people_name_order` ON `people` (`canonical_name`,`id`);--> statement-breakpoint
CREATE INDEX `tenures_constituency` ON `tenures` (`constituency_id`,`person_id`);