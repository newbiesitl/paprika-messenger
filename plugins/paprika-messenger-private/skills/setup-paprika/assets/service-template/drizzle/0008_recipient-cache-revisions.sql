CREATE TABLE `recipient_catalog_version` (
	`singleton` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`cache_scope` text DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	CONSTRAINT "recipient_catalog_singleton" CHECK("recipient_catalog_version"."singleton" = 1),
	CONSTRAINT "recipient_catalog_revision" CHECK("recipient_catalog_version"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE `recipient_directory_versions` (
	`board` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`board`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recipient_directory_revision" CHECK("recipient_directory_versions"."revision" >= 0)
);

--> statement-breakpoint
-- Existing cached metadata remains the authoritative cloud layer. These
-- monotonic counters invalidate client pages without native catalog lookups.
INSERT INTO recipient_catalog_version(singleton,revision) VALUES(1,1);
INSERT INTO recipient_directory_versions(board,revision) SELECT id,1 FROM boards;
--> statement-breakpoint
CREATE TRIGGER recipient_catalog_board_added AFTER INSERT ON boards BEGIN
  INSERT INTO recipient_directory_versions(board,revision) VALUES(NEW.id,0);
  UPDATE recipient_catalog_version SET revision=revision+1 WHERE singleton=1;
END;
--> statement-breakpoint
CREATE TRIGGER recipient_catalog_board_changed AFTER UPDATE OF label,description ON boards
WHEN OLD.label IS NOT NEW.label OR OLD.description IS NOT NEW.description BEGIN
  UPDATE recipient_catalog_version SET revision=revision+1 WHERE singleton=1;
END;
--> statement-breakpoint
CREATE TRIGGER recipient_directory_registered AFTER INSERT ON participants BEGIN
  UPDATE recipient_directory_versions SET revision=revision+1 WHERE board=NEW.board;
END;
--> statement-breakpoint
CREATE TRIGGER recipient_directory_binding_changed AFTER UPDATE OF label,kind,thread_id,unregistered_at ON participants
WHEN OLD.label IS NOT NEW.label OR OLD.kind IS NOT NEW.kind OR OLD.thread_id IS NOT NEW.thread_id
  OR OLD.unregistered_at IS NOT NEW.unregistered_at BEGIN
  UPDATE recipient_directory_versions SET revision=revision+1 WHERE board=NEW.board;
END;
--> statement-breakpoint
CREATE TRIGGER recipient_directory_metadata_added AFTER INSERT ON recipient_metadata BEGIN
  UPDATE recipient_directory_versions SET revision=revision+1 WHERE board=NEW.board;
END;
--> statement-breakpoint
CREATE TRIGGER recipient_directory_metadata_changed AFTER UPDATE ON recipient_metadata BEGIN
  UPDATE recipient_directory_versions SET revision=revision+1 WHERE board=NEW.board;
END;
--> statement-breakpoint
CREATE TRIGGER recipient_directory_link_added AFTER INSERT ON recipient_conversations BEGIN
  UPDATE recipient_directory_versions SET revision=revision+1 WHERE board=NEW.board;
END;
--> statement-breakpoint
CREATE TRIGGER recipient_directory_link_changed AFTER UPDATE ON recipient_conversations BEGIN
  UPDATE recipient_directory_versions SET revision=revision+1 WHERE board=NEW.board;
END;
--> statement-breakpoint
CREATE TRIGGER recipient_directory_recency_added AFTER INSERT ON recipient_activity BEGIN
  UPDATE recipient_directory_versions SET revision=revision+1 WHERE board=NEW.board;
END;
--> statement-breakpoint
CREATE TRIGGER recipient_directory_recency_changed AFTER UPDATE ON recipient_activity BEGIN
  UPDATE recipient_directory_versions SET revision=revision+1 WHERE board=NEW.board;
END;
