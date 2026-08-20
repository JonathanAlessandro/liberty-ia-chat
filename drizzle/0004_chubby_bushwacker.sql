ALTER TABLE `documents` ADD `sourceAuthority` enum('internal_training','official_registered') DEFAULT 'internal_training' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `effectiveAt` timestamp;--> statement-breakpoint
CREATE INDEX `documents_source_priority_idx` ON `documents` (`sourceAuthority`,`effectiveAt`);