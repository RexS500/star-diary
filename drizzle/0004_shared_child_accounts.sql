-- Personal and shared Child accounts.
-- Existing Child memberships and invitations with a child_id remain personal.

ALTER TABLE "family_members"
ADD COLUMN "child_account_mode" text
  CHECK ("child_account_mode" IS NULL OR "child_account_mode" IN ('personal', 'shared'));

UPDATE "family_members"
   SET "child_account_mode" = 'personal'
 WHERE "role" = 'child' AND "child_id" IS NOT NULL;

UPDATE "family_members"
   SET "child_account_mode" = 'shared'
 WHERE "role" = 'child' AND "child_id" IS NULL;

CREATE TABLE "family_invitations_v4" (
  "id" text PRIMARY KEY NOT NULL,
  "family_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('parent', 'child')),
  "child_id" text,
  "child_account_mode" text CHECK ("child_account_mode" IS NULL OR "child_account_mode" IN ('personal', 'shared')),
  "child_permissions_json" text,
  "status" text NOT NULL DEFAULT 'pending'
    CHECK ("status" IN ('pending', 'accepted', 'expired', 'cancelled')),
  "created_by_user_id" text NOT NULL,
  "created_at" text NOT NULL,
  "expires_at" text NOT NULL,
  "accepted_at" text,
  "accepted_by_user_id" text,
  "cancelled_at" text,
  FOREIGN KEY ("family_id") REFERENCES "families" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
  FOREIGN KEY ("accepted_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CHECK (
    ("role" = 'parent' AND "child_id" IS NULL AND "child_account_mode" IS NULL)
    OR ("role" = 'child' AND "child_account_mode" = 'personal' AND "child_id" IS NOT NULL)
    OR ("role" = 'child' AND "child_account_mode" = 'shared' AND "child_id" IS NULL)
  )
);

INSERT INTO "family_invitations_v4" (
  "id", "family_id", "token_hash", "role", "child_id",
  "child_account_mode", "child_permissions_json", "status",
  "created_by_user_id", "created_at", "expires_at", "accepted_at",
  "accepted_by_user_id", "cancelled_at"
)
SELECT
  "id", "family_id", "token_hash", "role", "child_id",
  CASE WHEN "role" = 'child' THEN 'personal' ELSE NULL END,
  NULL,
  "status", "created_by_user_id", "created_at", "expires_at", "accepted_at",
  "accepted_by_user_id", "cancelled_at"
FROM "family_invitations";

DROP TABLE "family_invitations";
ALTER TABLE "family_invitations_v4" RENAME TO "family_invitations";

CREATE UNIQUE INDEX "family_invitations_token_hash_unique"
  ON "family_invitations" ("token_hash");
CREATE INDEX "family_invitations_family_status_idx"
  ON "family_invitations" ("family_id", "status", "expires_at");
CREATE INDEX "family_invitations_child_idx"
  ON "family_invitations" ("family_id", "child_id");
CREATE UNIQUE INDEX "family_invitations_pending_child_unique"
  ON "family_invitations" ("family_id", "child_id")
  WHERE "role" = 'child' AND "child_account_mode" = 'personal'
    AND "status" = 'pending' AND "child_id" IS NOT NULL;

INSERT OR IGNORE INTO "app_migrations" ("version", "applied_at")
VALUES (
  '0004_shared_child_accounts',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
