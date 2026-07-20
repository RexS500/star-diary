import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const authMigration = await readFile(
  new URL("../drizzle/0002_auth_and_family_scope.sql", import.meta.url),
  "utf8",
);
const accountMigration = await readFile(
  new URL("../drizzle/0003_account_management_and_invitations.sql", import.meta.url),
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
  db.exec(authMigration);
  db.exec(accountMigration);
  return db;
}

test("auth and account migrations are additive and copy rather than remove legacy state", () => {
  const db = migratedDatabase();
  assert.equal(db.prepare("SELECT count(*) AS count FROM app_state WHERE id = 'family'").get().count, 1);
  const copied = db.prepare("SELECT data FROM family_state WHERE family_id = ?").get("legacy-family-v1");
  assert.deepEqual(JSON.parse(copied.data), { children: [{ id: "legacy-child" }] });
  for (const table of [
    "users", "accounts", "sessions", "verification_tokens",
    "families", "family_members", "family_state", "media_objects",
    "family_invitations", "member_child_permissions",
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
  db.prepare("INSERT INTO family_members (family_id, user_id, role, child_id, created_at, updated_at, status) VALUES (?, ?, ?, NULL, ?, ?, 'active')")
    .run("family-a", "user-a", "owner", now, now);
  db.prepare("INSERT INTO family_members (family_id, user_id, role, child_id, created_at, updated_at, status) VALUES (?, ?, ?, NULL, ?, ?, 'active')")
    .run("family-b", "user-b", "owner", now, now);
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

test("account migration preserves legacy members and enforces one family and one active Child binding", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(authMigration);
  const now = new Date().toISOString();
  for (const userId of ["owner-user", "viewer-user", "other-user"]) {
    db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(userId, `${userId}@example.com`);
  }
  db.prepare("INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run("family-a", "A", now, now);
  db.prepare("INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run("family-b", "B", now, now);
  db.prepare("INSERT INTO family_members (family_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run("family-a", "owner-user", "owner", now);
  db.prepare("INSERT INTO family_members (family_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run("family-a", "viewer-user", "viewer", now);
  db.exec(accountMigration);

  assert.equal(db.prepare("SELECT role FROM family_members WHERE user_id = ?").get("owner-user").role, "owner");
  assert.equal(db.prepare("SELECT role FROM family_members WHERE user_id = ?").get("viewer-user").role, "child");
  assert.throws(() => db.prepare("INSERT INTO family_members (family_id, user_id, role, child_id, created_at, updated_at, status) VALUES (?, ?, 'parent', NULL, ?, ?, 'active')").run("family-b", "owner-user", now, now), /UNIQUE/);
  db.prepare("INSERT INTO family_members (family_id, user_id, role, child_id, created_at, updated_at, status) VALUES (?, ?, 'child', ?, ?, ?, 'active')").run("family-a", "other-user", "child-max", now, now);
  db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run("second-child-user", "second@example.com");
  assert.throws(() => db.prepare("INSERT INTO family_members (family_id, user_id, role, child_id, created_at, updated_at, status) VALUES (?, ?, 'child', ?, ?, ?, 'active')").run("family-a", "second-child-user", "child-max", now, now), /UNIQUE/);
  db.close();
});

test("database invitation guards reject expired, cancelled, reused, and duplicate pending Child invites", () => {
  const db = migratedDatabase();
  const createdAt = "2026-07-21T00:00:00.000Z";
  const validAt = "2026-07-21T00:05:00.000Z";
  const expiresAt = "2026-07-21T00:10:00.000Z";
  for (const userId of ["creator", "acceptor"]) db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(userId, `${userId}@example.com`);
  db.prepare("INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run("invite-family", "Invite", createdAt, createdAt);
  db.prepare("INSERT INTO family_members (family_id, user_id, role, child_id, created_at, updated_at, status) VALUES (?, ?, 'owner', NULL, ?, ?, 'active')").run("invite-family", "creator", createdAt, createdAt);
  const insertInvite = db.prepare(`INSERT INTO family_invitations
    (id, family_id, token_hash, role, child_id, status, created_by_user_id, created_at, expires_at)
    VALUES (?, 'invite-family', ?, ?, ?, ?, 'creator', ?, ?)`);
  insertInvite.run("valid", "hash-valid", "parent", null, "pending", createdAt, expiresAt);
  insertInvite.run("expired", "hash-expired", "parent", null, "pending", createdAt, validAt);
  insertInvite.run("cancelled", "hash-cancelled", "parent", null, "cancelled", createdAt, expiresAt);

  const accept = db.prepare(`UPDATE family_invitations
    SET status='accepted', accepted_at=?, accepted_by_user_id=?
    WHERE id=? AND status='pending' AND accepted_by_user_id IS NULL AND expires_at>?`);
  assert.equal(accept.run(validAt, "acceptor", "valid", validAt).changes, 1);
  assert.equal(accept.run(validAt, "acceptor", "valid", validAt).changes, 0);
  assert.equal(accept.run(expiresAt, "acceptor", "expired", expiresAt).changes, 0);
  assert.equal(accept.run(validAt, "acceptor", "cancelled", validAt).changes, 0);

  insertInvite.run("child-one", "hash-child-one", "child", "max", "pending", createdAt, expiresAt);
  assert.throws(() => insertInvite.run("child-two", "hash-child-two", "child", "max", "pending", createdAt, expiresAt), /UNIQUE/);
  db.prepare("UPDATE family_invitations SET status='expired' WHERE id='child-one'").run();
  assert.doesNotThrow(() => insertInvite.run("child-three", "hash-child-three", "child", "max", "pending", createdAt, expiresAt));
  db.close();
});

test("database permissions reject operate without view", () => {
  const db = migratedDatabase();
  const now = new Date().toISOString();
  for (const userId of ["owner", "child-user"]) db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(userId, `${userId}@example.com`);
  db.prepare("INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run("permissions-family", "Permissions", now, now);
  db.prepare("INSERT INTO family_members (family_id, user_id, role, child_id, created_at, updated_at, status) VALUES (?, ?, 'owner', NULL, ?, ?, 'active')").run("permissions-family", "owner", now, now);
  db.prepare("INSERT INTO family_members (family_id, user_id, role, child_id, created_at, updated_at, status) VALUES (?, ?, 'child', 'vanessa', ?, ?, 'active')").run("permissions-family", "child-user", now, now);
  const insertPermission = db.prepare(`INSERT INTO member_child_permissions
    (family_id, user_id, child_id, can_view, can_operate, created_at, updated_at)
    VALUES ('permissions-family', 'child-user', ?, ?, ?, ?, ?)`);
  assert.throws(() => insertPermission.run("max", 0, 1, now, now), /CHECK/);
  assert.doesNotThrow(() => insertPermission.run("vanessa", 1, 1, now, now));
  db.close();
});
