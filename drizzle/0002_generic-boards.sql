ALTER TABLE `boards` ADD `label` text;--> statement-breakpoint
ALTER TABLE `boards` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `coordination` ADD `title` text DEFAULT 'Coordination' NOT NULL;--> statement-breakpoint
ALTER TABLE `coordination` ADD `body` text;
--> statement-breakpoint
DROP TRIGGER coordination_revision;
--> statement-breakpoint
CREATE TRIGGER coordination_revision AFTER UPDATE ON coordination BEGIN
  INSERT INTO events(board,kind,entity_id,payload) VALUES(NEW.board,'coordination_updated',NEW.board,
    json_object('board',NEW.board,'title',NEW.title,
      'body',COALESCE(NEW.body,'Reference: ' || NEW.queue_reference || char(10) ||
        'Responsible participant: ' || NEW.execution_owner || char(10) ||
        'Status: ' || NEW.launch_status || char(10) || 'Reported time: ' || COALESCE(NEW.reported_clock,'Not reported')),
      'queue_reference',NEW.queue_reference,'execution_owner',NEW.execution_owner,
      'launch_status',NEW.launch_status,'reported_clock',NEW.reported_clock,'revision',NEW.revision,
      'last_confirmed_at',NEW.last_confirmed_at,'confirmed_by',NEW.confirmed_by));
END;
