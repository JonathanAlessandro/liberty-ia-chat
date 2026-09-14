ALTER TABLE `messages` ADD `retentionPolicy` enum('legacy_7_days','permanent') DEFAULT 'legacy_7_days' NOT NULL;
--> statement-breakpoint
UPDATE `conversations` AS `conversation`
SET `title` = (
  SELECT LEFT(`message`.`content`, 180)
  FROM `messages` AS `message`
  WHERE `message`.`conversationId` = `conversation`.`id` AND `message`.`role` = 'user'
  ORDER BY `message`.`id`
  LIMIT 1
)
WHERE `conversation`.`title` IS NULL
  AND EXISTS (SELECT 1 FROM `messages` AS `message` WHERE `message`.`conversationId` = `conversation`.`id` AND `message`.`role` = 'user');
