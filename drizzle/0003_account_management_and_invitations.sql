-- Account management, one-time family invitations, and child-profile access.
-- Existing users, families, family_state, and all Star Diary history remain intact.

CREATE TABLE "family_members_v3" (
  "family_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('owner', 'parent', 'child')),
  "child_id" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'disabled')),
  PRIMARY KEY ("family_id", "user_id"),
  FOREIGN KEY ("family_id") REFERENCES "families" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

INSERT INTO "family_members_v3" (
  "family_id", "user_id", "role", "child_id", "created_at", "updated_at", "status"
)
SELECT
  "family_id",
  "user_id",
  CASE "role" WHEN 'viewer' THEN 'child' ELSE "role" END,
  NULL,
  "created_at",
  "created_at",
  'active'
FROM "family_members";

DROP TABLE "family_members";
ALTER TABLE "family_members_v3" RENAME TO "family_members";

CREATE UNIQUE INDEX "family_members_user_unique"
  ON "family_members" ("user_id");
CREATE INDEX "family_members_family_id_idx"
  ON "family_members" ("family_id");
CREATE UNIQUE INDEX "family_members_child_binding_unique"
  ON "family_members" ("family_id", "child_id")
  WHERE "role" = 'child' AND "child_id" IS NOT NULL AND "status" = 'active';

CREATE TABLE "family_invitations" (
  "id" text PRIMARY KEY NOT NULL,
  "family_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('parent', 'child')),
  "child_id" text,
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
  CHECK (("role" = 'parent' AND "child_id" IS NULL) OR
         ("role" = 'child' AND "child_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "family_invitations_token_hash_unique"
  ON "family_invitations" ("token_hash");
CREATE INDEX "family_invitations_family_status_idx"
  ON "family_invitations" ("family_id", "status", "expires_at");
CREATE INDEX "family_invitations_child_idx"
  ON "family_invitations" ("family_id", "child_id");
CREATE UNIQUE INDEX "family_invitations_pending_child_unique"
  ON "family_invitations" ("family_id", "child_id")
  WHERE "role" = 'child' AND "status" = 'pending' AND "child_id" IS NOT NULL;

CREATE TABLE "member_child_permissions" (
  "family_id" text NOT NULL,
  "user_id" text NOT NULL,
  "child_id" text NOT NULL,
  "can_view" integer NOT NULL DEFAULT 0 CHECK ("can_view" IN (0, 1)),
  "can_operate" integer NOT NULL DEFAULT 0 CHECK ("can_operate" IN (0, 1)),
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  PRIMARY KEY ("family_id", "user_id", "child_id"),
  FOREIGN KEY ("family_id", "user_id")
    REFERENCES "family_members" ("family_id", "user_id") ON DELETE CASCADE,
  CHECK ("can_operate" = 0 OR "can_view" = 1)
);

CREATE INDEX "member_child_permissions_user_idx"
  ON "member_child_permissions" ("user_id");
CREATE INDEX "member_child_permissions_child_idx"
  ON "member_child_permissions" ("family_id", "child_id");

INSERT OR IGNORE INTO "app_migrations" ("version", "applied_at")
VALUES (
  '0003_account_management_and_invitations',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
