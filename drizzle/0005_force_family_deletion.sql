-- Permanent Owner-initiated family deletion audit.
-- This table deliberately has no foreign keys so the audit survives deletion
-- of the family and membership rows. Google/Auth.js tables are never touched.

CREATE TABLE IF NOT EXISTS "family_deletion_audit" (
  "id" text PRIMARY KEY NOT NULL,
  "action" text NOT NULL CHECK ("action" = 'delete_family'),
  "actor_user_id" text NOT NULL,
  "actor_email" text NOT NULL,
  "family_id" text NOT NULL,
  "family_name" text NOT NULL,
  "deleted_at" text NOT NULL,
  "summary_json" text NOT NULL,
  "r2_cleanup_status" text NOT NULL DEFAULT 'pending'
    CHECK ("r2_cleanup_status" IN ('pending', 'complete', 'partial')),
  "r2_failed_keys_json" text,
  "cleanup_updated_at" text
);

CREATE INDEX IF NOT EXISTS "family_deletion_audit_family_idx"
  ON "family_deletion_audit" ("family_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "family_deletion_audit_actor_idx"
  ON "family_deletion_audit" ("actor_user_id", "deleted_at");

INSERT OR IGNORE INTO "app_migrations" ("version", "applied_at")
VALUES (
  '0005_force_family_deletion',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
