import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("admin access is a server-side secret allowlist", async () => {
  const [auth, layout, overviewApi] = await Promise.all([
    read("app/admin-auth.ts"),
    read("app/admin/layout.tsx"),
    read("app/api/admin/overview/route.ts"),
  ]);
  assert.match(auth, /env\.ADMIN_EMAILS/);
  assert.match(auth, /requireAuthenticatedUser\(\)/);
  assert.match(auth, /configured\.has/);
  assert.doesNotMatch(auth, /rexshih0706@gmail\.com/);
  assert.match(layout, /await getOptionalAdmin\(\)/);
  assert.match(overviewApi, /await requireAdmin\(\)/);
});

test("operations migration owns reporting, errors and immutable audit structures in D1", async () => {
  const migration = await read("drizzle/0006_admin_operations_and_reporting.sql");
  assert.match(migration, /CREATE TABLE "user_daily_activity"/);
  assert.match(migration, /CREATE TABLE "feature_usage_events"/);
  assert.match(migration, /CREATE TABLE "system_error_logs"/);
  assert.match(migration, /CREATE TABLE "admin_audit_logs"/);
  assert.match(migration, /CREATE TABLE "support_access_grants"/);
  assert.match(migration, /CREATE TABLE "resource_metric_snapshots"/);
  assert.match(migration, /"reason" text NOT NULL/);
  assert.match(migration, /"ip_address" text/);
  assert.match(migration, /"user_agent" text/);
});

test("reports use D1 application records and defer Cloudflare infrastructure metrics", async () => {
  const service = await read("app/admin-service.ts");
  assert.match(service, /FROM user_daily_activity/);
  assert.match(service, /FROM feature_usage_events/);
  assert.match(service, /FROM system_error_logs/);
  assert.match(service, /FROM media_objects/);
  assert.match(service, /deferredCloudflareMetrics/);
  assert.doesNotMatch(service, /api\.cloudflare\.com|graphql/i);
});

test("telemetry excludes private child and task content", async () => {
  const telemetry = await read("app/operations-telemetry.ts");
  assert.match(telemetry, /without copying child names, task titles, notes, or images/);
  assert.doesNotMatch(telemetry, /entry\.title|taskRecord\.title|child\.name/);
  assert.match(telemetry, /INSERT OR IGNORE INTO feature_usage_events/);
  assert.match(telemetry, /dedupe_key/);
});
