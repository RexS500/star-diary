-- One Google/Auth.js user can own only one created family at a time.
-- The row must be deleted before the same creator can create another family.

CREATE UNIQUE INDEX IF NOT EXISTS "families_created_by_user_unique"
  ON "families" ("created_by_user_id")
  WHERE "created_by_user_id" IS NOT NULL;

INSERT OR IGNORE INTO "app_migrations" ("version", "applied_at")
VALUES ('0008_family_creator_and_image_policy', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
