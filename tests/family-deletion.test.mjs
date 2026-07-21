import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  familyMediaKeysForDeletion,
  forceDeleteConfirmationValid,
  mediaKeysReferencedByFamilyState,
  summarizeFamilyState,
} from "../app/family-deletion-logic.ts";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("force-delete confirmation requires exact family name, checkbox and force mode", () => {
  const valid = { submittedName: "Shih Vanessa 的家庭", familyName: "Shih Vanessa 的家庭", confirmed: true, mode: "force" };
  assert.equal(forceDeleteConfirmationValid(valid), true);
  assert.equal(forceDeleteConfirmationValid({ ...valid, submittedName: " Shih Vanessa 的家庭" }), false);
  assert.equal(forceDeleteConfirmationValid({ ...valid, confirmed: false }), false);
  assert.equal(forceDeleteConfirmationValid({ ...valid, mode: "leave" }), false);
});

test("deletion summary counts every current JSON-backed data family", () => {
  assert.deepEqual(summarizeFamilyState(JSON.stringify({
    children: [{}, {}], entries: [{}, {}, {}], dailyTasks: [{}], dailyTaskRecords: [{}, {}],
    rewards: [{}], specialRewards: [{}, {}], redemptions: [{}], templates: [{}, {}],
  })), {
    childCount: 2,
    starRecordCount: 3,
    taskCount: 1,
    taskCompletionRecordCount: 2,
    rewardCount: 1,
    specialRewardCount: 2,
    redemptionCount: 1,
    quickIndicatorCount: 2,
  });
});

test("R2 cleanup accepts only the current family namespace", () => {
  assert.deepEqual(familyMediaKeysForDeletion([
    "families/family-test/avatars/a.jpg",
    "families/rex-family/avatars/keep.jpg",
    "legacy-image.jpg",
    "families/family-test/avatars/a.jpg",
  ], "family-test"), ["families/family-test/avatars/a.jpg"]);
  assert.deepEqual(mediaKeysReferencedByFamilyState(JSON.stringify({
    avatar: "/api/media?key=families%2Ffamily-test%2Favatars%2Fa.jpg",
    rewards: [{ image: "/api/media?key=legacy-reward.jpg" }],
  })), ["families/family-test/avatars/a.jpg", "legacy-reward.jpg"]);
});

test("audit migration survives family cascade while Auth.js users and other families remain", async () => {
  const migrations = await Promise.all([
    "drizzle/0002_auth_and_family_scope.sql",
    "drizzle/0003_account_management_and_invitations.sql",
    "drizzle/0004_shared_child_accounts.sql",
    "drizzle/0005_force_family_deletion.sql",
  ].map(read));
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE app_state (id text PRIMARY KEY NOT NULL, data text NOT NULL, updated_at integer NOT NULL)");
  for (const migration of migrations) db.exec(migration);
  const now = "2026-07-21T00:00:00.000Z";
  for (const [id, email] of [["owner-test", "vanessa@example.com"], ["owner-rex", "rex@example.com"], ["child-test", "child@example.com"]]) {
    db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(id, email);
  }
  db.prepare("INSERT INTO accounts (id, userId, type, provider, providerAccountId) VALUES (?, ?, 'oauth', 'google', ?)").run("account-test", "owner-test", "google-test");
  db.prepare("INSERT INTO sessions (id, sessionToken, userId, expires) VALUES (?, ?, ?, ?)").run("session-test", "token-test", "owner-test", "2027-01-01T00:00:00.000Z");
  db.prepare("INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run("family-test", "Shih Vanessa 的家庭", now, now);
  db.prepare("INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run("rex-family", "Rex Family", now, now);
  db.prepare("INSERT INTO family_members (family_id, user_id, role, child_id, created_at, updated_at, status) VALUES (?, ?, 'owner', NULL, ?, ?, 'active')").run("family-test", "owner-test", now, now);
  db.prepare("INSERT INTO family_members (family_id, user_id, role, child_id, child_account_mode, created_at, updated_at, status) VALUES (?, ?, 'child', ?, 'personal', ?, ?, 'active')").run("family-test", "child-test", "child-1", now, now);
  db.prepare("INSERT INTO family_members (family_id, user_id, role, child_id, created_at, updated_at, status) VALUES (?, ?, 'owner', NULL, ?, ?, 'active')").run("rex-family", "owner-rex", now, now);
  db.prepare("INSERT INTO family_state (family_id, data, updated_at) VALUES (?, ?, 1)").run("family-test", JSON.stringify({ children: [{ id: "child-1" }], entries: [{ id: "entry-1" }] }));
  db.prepare("INSERT INTO family_state (family_id, data, updated_at) VALUES (?, ?, 1)").run("rex-family", JSON.stringify({ children: [{ id: "max" }] }));
  db.prepare("INSERT INTO member_child_permissions (family_id, user_id, child_id, can_view, can_operate, created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?)").run("family-test", "child-test", "child-1", now, now);
  db.prepare("INSERT INTO family_invitations (id, family_id, token_hash, role, child_id, child_account_mode, status, created_by_user_id, created_at, expires_at) VALUES (?, ?, ?, 'parent', NULL, NULL, 'pending', ?, ?, ?)").run("invite-test", "family-test", "hash-test", "owner-test", now, "2026-07-21T00:10:00.000Z");
  db.prepare("INSERT INTO media_objects (family_id, object_key, kind, created_by_user_id, created_at) VALUES (?, ?, 'avatars', ?, ?)").run("family-test", "families/family-test/avatars/a.jpg", "owner-test", now);

  db.exec("BEGIN");
  assert.throws(() => {
    db.prepare("DELETE FROM families WHERE id = ?").run("family-test");
    db.prepare("INSERT INTO family_deletion_audit (id, action, actor_user_id, actor_email, family_id, family_name, deleted_at, summary_json) VALUES (?, 'invalid', ?, ?, ?, ?, ?, ?)")
      .run("bad-audit", "owner-test", "vanessa@example.com", "family-test", "Shih Vanessa 的家庭", now, "{}");
  }, /CHECK/);
  db.exec("ROLLBACK");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM families WHERE id = 'family-test'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM family_state WHERE family_id = 'family-test'").get().count, 1);

  db.exec("BEGIN");
  db.prepare("INSERT INTO family_deletion_audit (id, action, actor_user_id, actor_email, family_id, family_name, deleted_at, summary_json, r2_cleanup_status) VALUES (?, 'delete_family', ?, ?, ?, ?, ?, ?, 'pending')")
    .run("audit-test", "owner-test", "vanessa@example.com", "family-test", "Shih Vanessa 的家庭", now, "{}");
  db.prepare("DELETE FROM families WHERE id = ?").run("family-test");
  db.exec("COMMIT");

  for (const table of ["families", "family_members", "family_state", "member_child_permissions", "family_invitations", "media_objects"]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${table === "families" ? "id" : "family_id"} = ?`).get("family-test").count, 0);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM family_deletion_audit WHERE family_id = ?").get("family-test").count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM families WHERE id = 'rex-family'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM family_state WHERE family_id = 'rex-family'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users WHERE id = 'owner-test'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM accounts WHERE userId = 'owner-test'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE userId = 'owner-test'").get().count, 1);
  db.close();
});

test("force-delete API derives family from session and enforces Owner, CSRF and transaction guards", async () => {
  const [route, service, csrf, ui, migration] = await Promise.all([
    read("app/api/family/route.ts"),
    read("app/account-service.ts"),
    read("app/csrf.ts"),
    read("app/account-management.tsx"),
    read("drizzle/0005_force_family_deletion.sql"),
  ]);
  assert.match(route, /requireFamilyMembership\("read"\)/);
  assert.match(route, /validSameOriginCsrfRequest/);
  assert.doesNotMatch(route, /body\.familyId/);
  assert.match(service, /family\.role !== "owner"/);
  assert.match(service, /familyNameConfirmation/);
  assert.match(service, /input\.confirmed !== true/);
  assert.match(service, /env\.DB\.batch\(deletionStatements\)/);
  assert.doesNotMatch(service, /(?:SELECT|DELETE) (?:FROM )?(?:children|star_entries|rewards|redemptions)/);
  assert.match(service, /DELETE FROM member_child_permissions/);
  assert.match(service, /DELETE FROM family_invitations/);
  assert.match(service, /DELETE FROM media_objects/);
  assert.match(service, /DELETE FROM family_state/);
  assert.match(service, /DELETE FROM family_members/);
  assert.match(service, /DELETE FROM families/);
  assert.doesNotMatch(service.slice(service.indexOf("export async function forceDeleteCurrentFamily")), /DELETE FROM (?:users|accounts|sessions|verification_tokens)/);
  assert.match(csrf, /HttpOnly; SameSite=Strict/);
  assert.match(csrf, /x-star-diary-csrf/);
  assert.match(ui, /請輸入完整家庭名稱/);
  assert.match(ui, /我了解此操作會永久刪除所有家庭資料/);
  assert.match(ui, /forceDeleteName !== snapshot\.family\.name/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "family_deletion_audit"/);
  assert.doesNotMatch(migration, /FOREIGN KEY/);
});
