-- Auth.js official Cloudflare D1 adapter tables.
-- This migration is additive and idempotent: the legacy app_state table is
-- deliberately preserved so production can be rolled back without data loss.
CREATE TABLE IF NOT EXISTS "app_state" (
  "id" text PRIMARY KEY NOT NULL,
  "data" text NOT NULL,
  "updated_at" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" text NOT NULL,
  "userId" text NOT NULL DEFAULT NULL,
  "type" text NOT NULL DEFAULT NULL,
  "provider" text NOT NULL DEFAULT NULL,
  "providerAccountId" text NOT NULL DEFAULT NULL,
  "refresh_token" text DEFAULT NULL,
  "access_token" text DEFAULT NULL,
  "expires_at" number DEFAULT NULL,
  "token_type" text DEFAULT NULL,
  "scope" text DEFAULT NULL,
  "id_token" text DEFAULT NULL,
  "session_state" text DEFAULT NULL,
  "oauth_token_secret" text DEFAULT NULL,
  "oauth_token" text DEFAULT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" text NOT NULL,
  "sessionToken" text NOT NULL,
  "userId" text NOT NULL DEFAULT NULL,
  "expires" datetime NOT NULL DEFAULT NULL,
  PRIMARY KEY ("sessionToken")
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" text NOT NULL DEFAULT '',
  "name" text DEFAULT NULL,
  "email" text DEFAULT NULL,
  "emailVerified" datetime DEFAULT NULL,
  "image" text DEFAULT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "verification_tokens" (
  "identifier" text NOT NULL,
  "token" text NOT NULL DEFAULT NULL,
  "expires" datetime NOT NULL DEFAULT NULL,
  PRIMARY KEY ("token")
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_account_unique"
  ON "accounts" ("provider", "providerAccountId");
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("userId");
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions" ("expires");

-- A user may belong to more families in the future. The current product uses
-- one active family per user, while the role column already supports invites.
CREATE TABLE IF NOT EXISTS "families" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "legacy_state" integer NOT NULL DEFAULT 0 CHECK ("legacy_state" IN (0, 1)),
  "claimed_by_user_id" text,
  "claimed_at" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "family_members" (
  "family_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('owner', 'parent', 'viewer')),
  "created_at" text NOT NULL,
  PRIMARY KEY ("family_id", "user_id"),
  FOREIGN KEY ("family_id") REFERENCES "families" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "family_members_user_id_idx"
  ON "family_members" ("user_id");
CREATE INDEX IF NOT EXISTS "family_members_family_id_idx"
  ON "family_members" ("family_id");

-- Existing Star Diary business data remains one JSON document, but each row is
-- now directly owned by a family. This avoids rewriting the mature app model.
CREATE TABLE IF NOT EXISTS "family_state" (
  "family_id" text PRIMARY KEY NOT NULL,
  "data" text NOT NULL,
  "updated_at" integer NOT NULL,
  FOREIGN KEY ("family_id") REFERENCES "families" ("id") ON DELETE CASCADE
);

-- New uploads are tracked and scoped even though the bytes live in R2.
CREATE TABLE IF NOT EXISTS "media_objects" (
  "family_id" text NOT NULL,
  "object_key" text NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('avatars', 'rewards')),
  "created_by_user_id" text NOT NULL,
  "created_at" text NOT NULL,
  PRIMARY KEY ("family_id", "object_key"),
  FOREIGN KEY ("family_id") REFERENCES "families" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "media_objects_key_idx"
  ON "media_objects" ("object_key");

CREATE TABLE IF NOT EXISTS "app_migrations" (
  "version" text PRIMARY KEY NOT NULL,
  "applied_at" text NOT NULL
);

-- The legacy family has a stable non-secret id. INITIAL_OWNER_EMAIL is checked
-- only on the server when its owner signs in for the first time.
INSERT OR IGNORE INTO "families" (
  "id", "name", "legacy_state", "created_at", "updated_at"
) VALUES (
  'legacy-family-v1', '既有家庭', 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

-- Copy, never move or delete, the current production JSON document.
INSERT OR IGNORE INTO "family_state" ("family_id", "data", "updated_at")
SELECT 'legacy-family-v1', "data", "updated_at"
FROM "app_state"
WHERE "id" = 'family';

INSERT OR IGNORE INTO "app_migrations" ("version", "applied_at")
VALUES ('0002_auth_and_family_scope', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
