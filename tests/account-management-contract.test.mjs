import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("migration stores only invite hashes and enforces membership and child binding uniqueness", async () => {
  const migration = await read("drizzle/0003_account_management_and_invitations.sql");
  assert.match(migration, /CREATE TABLE "family_invitations"/);
  assert.match(migration, /"token_hash" text NOT NULL/);
  assert.doesNotMatch(migration, /"token" text/);
  assert.match(migration, /family_members_user_unique/);
  assert.match(migration, /family_members_child_binding_unique/);
  assert.match(migration, /family_invitations_pending_child_unique/);
  assert.match(migration, /CREATE TABLE "member_child_permissions"/);
  assert.match(migration, /CHECK \("can_operate" = 0 OR "can_view" = 1\)/);
});

test("invite acceptance derives role and child from the hashed server record", async () => {
  const service = await read("app/account-service.ts");
  assert.match(service, /createInvitationCredential\(\)/);
  assert.match(service, /invitationRowByHash\(await sha256Hex\(token\)\)/);
  assert.match(service, /expires_at > \?/);
  assert.match(service, /status = 'pending'/);
  assert.match(service, /accepted_by_user_id IS NULL/);
  assert.match(service, /SELECT family_id, \?, role, child_id/);
  assert.match(service, /env\.DB\.batch\(statements\)/);
  const acceptBlock = service.slice(service.indexOf("export async function acceptFamilyInvitation"));
  assert.doesNotMatch(acceptBlock, /input\.(?:role|childId|familyId)/);
});

test("Child data and actions are authorized on the server, not only hidden in React", async () => {
  const [state, access, home] = await Promise.all([
    read("app/api/state/route.ts"),
    read("app/family-access.ts"),
    read("app/star-home.tsx"),
  ]);
  assert.match(state, /stateForFamilyAccess/);
  assert.match(state, /visibleChildIds/);
  assert.match(state, /assertChildPermission\(family, record\.childId, "operate"\)/);
  assert.match(state, /assertChildPermission\(family, body\.childId, "operate"\)/);
  assert.match(state, /if \(body\.action === "child_entry"\) \{\s*requireFamilyManager\(family\)/);
  assert.match(access, /member_child_permissions/);
  assert.match(access, /canOperate/);
  assert.match(home, /account\.role!=="child"&&<button className=\{role === "家長"/);
  assert.match(home, /canOperateSelectedChild/);
  assert.match(home, /<AccountManagement onMessage=\{say\}/);
});

test("Google login and account switching force the real account chooser", async () => {
  const [login, join, home] = await Promise.all([
    read("app/login-screen.tsx"),
    read("app/join/[token]/invite-join-client.tsx"),
    read("app/star-home.tsx"),
  ]);
  assert.match(login, /prompt: "select_account"/);
  assert.match(join, /prompt: "select_account"/);
  assert.match(home, /signOut\(\{callbackUrl:"\/\?switch=1"\}\)/);
  assert.match(home, />切換帳號<\/button>/);
});

test("leaving and deleting an empty family are server-guarded self-service actions", async () => {
  const [service, route, accountUi, home] = await Promise.all([
    read("app/account-service.ts"),
    read("app/api/account/route.ts"),
    read("app/account-management.tsx"),
    read("app/star-home.tsx"),
  ]);
  assert.match(route, /body\.action === "leave_family"/);
  assert.match(route, /body\.action === "delete_empty_family"/);
  assert.match(service, /export async function leaveCurrentFamily/);
  assert.match(service, /role IN \('parent', 'child'\)/);
  assert.match(service, /export async function deleteEmptyFamily/);
  assert.match(service, /id <> 'legacy-family-v1'/);
  assert.match(service, /NOT EXISTS \(SELECT 1 FROM media_objects/);
  assert.match(service, /NOT EXISTS \(SELECT 1 FROM family_invitations/);
  assert.match(service, /updated_at = \?/);
  assert.match(service, /DELETE FROM sessions/);
  assert.match(accountUi, /action: "leave_family"/);
  assert.match(accountUi, /action: "delete_empty_family"/);
  assert.match(accountUi, /最後確認/);
  assert.match(accountUi, /signOut\(\{ callbackUrl: "\/\?switch=1" \}\)/);
  assert.match(home, /account\.role==="child" \? \["帳號管理"\]/);
});
