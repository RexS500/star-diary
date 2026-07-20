import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const migration = await readFile(
  new URL("../drizzle/0002_auth_and_family_scope.sql", import.meta.url),
  "utf8",
);

function migratedDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`CREATE TABLE app_state (
    id text PRIMARY KEY NOT NULL,
    data text NOT NULL,
    updated_at integer NOT NULL
  )`);
  db.prepare("INSERT INTO app_state (id, data, updated_at) VALUES (?, ?, ?)")
    .run("family", JSON.stringify({ children: [{ id: "legacy-child" }] }), 100);
  db.exec(migration);
  return db;
}

test("auth migration is additive, repeatable, and copies rather than removes legacy state", () => {
  const db = migratedDatabase();
  assert.doesNotThrow(() => db.exec(migration));
  assert.equal(db.prepare("SELECT count(*) AS count FROM app_state WHERE id = 'family'").get().count, 1);
  const copied = db.prepare("SELECT data FROM family_state WHERE family_id = ?").get("legacy-family-v1");
  assert.deepEqual(JSON.parse(copied.data), { children: [{ id: "legacy-child" }] });
  for (const table of [
    "users", "accounts", "sessions", "verification_tokens",
    "families", "family_members", "family_state", "media_objects",
  ]) {
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?").get(table).count,
      1,
    );
  }
  db.close();
});

test("family-scoped reads, updates, and deletes cannot cross family boundaries", () => {
  const db = migratedDatabase();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run("user-a", "a@example.com");
  db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run("user-b", "b@example.com");
  db.prepare("INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run("family-a", "A", now, now);
  db.prepare("INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run("family-b", "B", now, now);
  db.prepare("INSERT INTO family_members (family_id, user_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run("family-a", "user-a", "owner", now);
  db.prepare("INSERT INTO family_members (family_id, user_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run("family-b", "user-b", "owner", now);
  db.prepare("INSERT INTO family_state (family_id, data, updated_at) VALUES (?, ?, ?)")
    .run("family-a", JSON.stringify({ secret: "A-only" }), 1);
  db.prepare("INSERT INTO family_state (family_id, data, updated_at) VALUES (?, ?, ?)")
    .run("family-b", JSON.stringify({ secret: "B-only" }), 1);

  const familyForUser = db.prepare(`SELECT fm.family_id
    FROM family_members fm WHERE fm.user_id = ? LIMIT 1`).get("user-a").family_id;
  const ownState = db.prepare("SELECT data FROM family_state WHERE family_id = ?").get(familyForUser);
  assert.deepEqual(JSON.parse(ownState.data), { secret: "A-only" });

  const crossUpdate = db.prepare(
    "UPDATE family_state SET data = ? WHERE family_id = ? AND family_id = ?",
  ).run(JSON.stringify({ secret: "stolen" }), "family-b", familyForUser);
  assert.equal(crossUpdate.changes, 0);
  const crossDelete = db.prepare(
    "DELETE FROM family_state WHERE family_id = ? AND family_id = ?",
  ).run("family-b", familyForUser);
  assert.equal(crossDelete.changes, 0);
  assert.deepEqual(
    JSON.parse(db.prepare("SELECT data FROM family_state WHERE family_id = ?").get("family-b").data),
    { secret: "B-only" },
  );
  db.close();
});
