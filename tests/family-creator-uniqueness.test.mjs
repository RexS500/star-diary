import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("database rejects a second family created by the same user until the first is deleted", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE app_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE families (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by_user_id TEXT);`);
  db.exec(await read("drizzle/0008_family_creator_and_image_policy.sql"));
  db.prepare("INSERT INTO families (id, name, created_by_user_id) VALUES (?, ?, ?)").run("family-a", "A", "user-1");
  assert.throws(
    () => db.prepare("INSERT INTO families (id, name, created_by_user_id) VALUES (?, ?, ?)").run("family-b", "B", "user-1"),
    /UNIQUE constraint failed/,
  );
  db.prepare("DELETE FROM families WHERE id = ?").run("family-a");
  assert.doesNotThrow(() => db.prepare("INSERT INTO families (id, name, created_by_user_id) VALUES (?, ?, ?)").run("family-b", "B", "user-1"));
  db.close();
});

test("onboarding enforces ownership before writes and returns the exact product error", async () => {
  const service = await read("app/family-onboarding-service.ts");
  assert.match(service, /SELECT id FROM families WHERE created_by_user_id = \? LIMIT 1/);
  assert.match(service, /每個 Google 帳號只能建立一個家庭。/);
  assert.match(service, /families_created_by_user_unique/);
  assert.match(service, /FAMILY_CREATION_LIMIT/);
});
