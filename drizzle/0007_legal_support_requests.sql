-- Public legal/contact form tickets. Family content access is never granted by
-- submitting this form; support_access_grants remains the separate authority.
CREATE TABLE "support_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "family_id" text REFERENCES "families"("id") ON DELETE SET NULL,
  "category" text NOT NULL
    CHECK ("category" IN ('bug', 'feature', 'remote_support', 'partnership', 'other')),
  "contact_name" text NOT NULL,
  "reply_email" text NOT NULL,
  "subject" text NOT NULL,
  "message" text NOT NULL,
  "status" text NOT NULL DEFAULT 'new'
    CHECK ("status" IN ('new', 'in_progress', 'waiting_user', 'resolved', 'closed')),
  "ip_hash" text,
  "user_agent" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);

CREATE INDEX "support_requests_status_created_idx"
  ON "support_requests" ("status", "created_at");
CREATE INDEX "support_requests_user_idx"
  ON "support_requests" ("user_id", "created_at");
CREATE INDEX "support_requests_family_idx"
  ON "support_requests" ("family_id", "created_at");
CREATE INDEX "support_requests_rate_idx"
  ON "support_requests" ("ip_hash", "created_at");

INSERT OR IGNORE INTO "app_migrations" ("version", "applied_at")
VALUES ('0007_legal_support_requests', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
