-- Application-owned operations telemetry and administration foundation.
-- Cloudflare Analytics is intentionally not required by this migration.

ALTER TABLE "users" ADD COLUMN "created_at" text;
ALTER TABLE "users" ADD COLUMN "last_login_at" text;
ALTER TABLE "users" ADD COLUMN "login_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "status" text NOT NULL DEFAULT 'active'
  CHECK ("status" IN ('active', 'disabled'));
ALTER TABLE "users" ADD COLUMN "disabled_at" text;
ALTER TABLE "users" ADD COLUMN "disabled_by_user_id" text;
ALTER TABLE "users" ADD COLUMN "disabled_reason" text;

UPDATE "users"
   SET "created_at" = COALESCE("created_at", strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

ALTER TABLE "families" ADD COLUMN "created_by_user_id" text;
ALTER TABLE "families" ADD COLUMN "last_activity_at" text;
ALTER TABLE "families" ADD COLUMN "status" text NOT NULL DEFAULT 'active'
  CHECK ("status" IN ('active', 'disabled'));
ALTER TABLE "families" ADD COLUMN "is_test" integer NOT NULL DEFAULT 0
  CHECK ("is_test" IN (0, 1));
ALTER TABLE "families" ADD COLUMN "disabled_at" text;
ALTER TABLE "families" ADD COLUMN "disabled_by_user_id" text;
ALTER TABLE "families" ADD COLUMN "disabled_reason" text;

UPDATE "families"
   SET "created_by_user_id" = COALESCE(
         "created_by_user_id",
         (SELECT "user_id" FROM "family_members"
           WHERE "family_id" = "families"."id" AND "role" = 'owner'
           ORDER BY "created_at" LIMIT 1),
         "claimed_by_user_id"
       ),
       "last_activity_at" = COALESCE("last_activity_at", "updated_at");

ALTER TABLE "media_objects" ADD COLUMN "size_bytes" integer NOT NULL DEFAULT 0;
ALTER TABLE "media_objects" ADD COLUMN "content_type" text;

CREATE TABLE "user_daily_activity" (
  "activity_date" text NOT NULL,
  "user_id" text NOT NULL,
  "first_seen_at" text NOT NULL,
  "last_seen_at" text NOT NULL,
  "request_count" integer NOT NULL DEFAULT 1,
  PRIMARY KEY ("activity_date", "user_id")
);
CREATE INDEX "user_daily_activity_user_idx"
  ON "user_daily_activity" ("user_id", "activity_date");

CREATE TABLE "feature_usage_events" (
  "id" text PRIMARY KEY NOT NULL,
  "event_type" text NOT NULL,
  "occurred_at" text NOT NULL,
  "day_key" text NOT NULL,
  "family_id" text,
  "user_id" text,
  "amount" integer,
  "quantity" integer NOT NULL DEFAULT 1,
  "source" text,
  "dedupe_key" text,
  "metadata_json" text
);
CREATE INDEX "feature_usage_events_day_type_idx"
  ON "feature_usage_events" ("day_key", "event_type");
CREATE INDEX "feature_usage_events_family_day_idx"
  ON "feature_usage_events" ("family_id", "day_key");
CREATE UNIQUE INDEX "feature_usage_events_dedupe_unique"
  ON "feature_usage_events" ("dedupe_key");

CREATE TABLE "system_error_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "category" text NOT NULL,
  "error_code" text,
  "message" text NOT NULL,
  "route" text,
  "method" text,
  "status_code" integer,
  "family_id" text,
  "user_id" text,
  "request_id" text,
  "metadata_json" text,
  "occurred_at" text NOT NULL,
  "resolved_at" text
);
CREATE INDEX "system_error_logs_time_idx" ON "system_error_logs" ("occurred_at");
CREATE INDEX "system_error_logs_category_idx"
  ON "system_error_logs" ("category", "occurred_at");

CREATE TABLE "admin_audit_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "admin_user_id" text NOT NULL,
  "action_type" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "before_data" text,
  "after_data" text,
  "reason" text NOT NULL,
  "created_at" text NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "request_id" text,
  "result_status" text NOT NULL DEFAULT 'success'
    CHECK ("result_status" IN ('success', 'failed'))
);
CREATE INDEX "admin_audit_logs_created_idx" ON "admin_audit_logs" ("created_at");
CREATE INDEX "admin_audit_logs_target_idx"
  ON "admin_audit_logs" ("target_type", "target_id");

CREATE TABLE "support_access_grants" (
  "id" text PRIMARY KEY NOT NULL,
  "family_id" text NOT NULL,
  "granted_by_user_id" text NOT NULL,
  "granted_to_admin_user_id" text NOT NULL,
  "reason" text NOT NULL,
  "created_at" text NOT NULL,
  "expires_at" text NOT NULL,
  "revoked_at" text
);
CREATE INDEX "support_access_grants_family_idx"
  ON "support_access_grants" ("family_id", "expires_at");

CREATE TABLE "resource_metric_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "captured_at" text NOT NULL,
  "day_key" text NOT NULL,
  "metric_name" text NOT NULL,
  "metric_value" integer NOT NULL,
  "source" text NOT NULL DEFAULT 'application',
  "metadata_json" text
);
CREATE INDEX "resource_metric_snapshots_day_idx"
  ON "resource_metric_snapshots" ("day_key", "metric_name");

INSERT OR IGNORE INTO "app_migrations" ("version", "applied_at")
VALUES ('0006_admin_operations_and_reporting', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
