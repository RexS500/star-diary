import test from "node:test";
import assert from "node:assert/strict";
import {
  INVITATION_TTL_MS,
  canRemoveFamilyMember,
  createInvitationCredential,
  effectiveInvitationStatus,
  invitationTokenLooksValid,
  isEmptyFamilyState,
  normalizeChildPermissions,
  permissionPresetFor,
  sha256Hex,
} from "../app/account-management-logic.ts";

test("one-time invitation tokens use 32 random bytes and store only a SHA-256 digest", async () => {
  const first = await createInvitationCredential();
  const second = await createInvitationCredential();
  assert.equal(invitationTokenLooksValid(first.token), true);
  assert.equal(Buffer.from(first.token, "base64url").byteLength, 32);
  assert.equal(first.tokenHash.length, 64);
  assert.equal(first.tokenHash, await sha256Hex(first.token));
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
});

test("invitation expiry is derived from a controlled ten-minute clock", () => {
  const start = Date.parse("2026-07-21T00:00:00.000Z");
  const expiresAt = new Date(start + INVITATION_TTL_MS).toISOString();
  assert.equal(effectiveInvitationStatus("pending", expiresAt, start + INVITATION_TTL_MS - 1), "pending");
  assert.equal(effectiveInvitationStatus("pending", expiresAt, start + INVITATION_TTL_MS), "expired");
  assert.equal(effectiveInvitationStatus("accepted", expiresAt, start + INVITATION_TTL_MS + 1), "accepted");
  assert.equal(effectiveInvitationStatus("cancelled", expiresAt, start), "cancelled");
});

test("Child permission presets preserve self access and enforce operate implies view", () => {
  const childIds = ["vanessa", "max"];
  assert.deepEqual(normalizeChildPermissions({ childIds, boundChildId: "vanessa", preset: "only_self" }), [
    { childId: "vanessa", canView: true, canOperate: true },
    { childId: "max", canView: false, canOperate: false },
  ]);
  assert.deepEqual(normalizeChildPermissions({ childIds, boundChildId: "vanessa", preset: "share_all" }), [
    { childId: "vanessa", canView: true, canOperate: true },
    { childId: "max", canView: true, canOperate: true },
  ]);
  assert.deepEqual(normalizeChildPermissions({ childIds, boundChildId: "vanessa", preset: "view_all" }), [
    { childId: "vanessa", canView: true, canOperate: true },
    { childId: "max", canView: true, canOperate: false },
  ]);
  const custom = normalizeChildPermissions({
    childIds,
    boundChildId: "vanessa",
    preset: "custom",
    custom: [{ childId: "max", canView: false, canOperate: true }],
  });
  assert.deepEqual(custom[1], { childId: "max", canView: true, canOperate: true });
  assert.equal(permissionPresetFor(custom, childIds, "vanessa"), "share_all");
});

test("Owner and Parent removal rules protect the Owner role", () => {
  assert.equal(canRemoveFamilyMember("owner", "parent"), true);
  assert.equal(canRemoveFamilyMember("owner", "child"), true);
  assert.equal(canRemoveFamilyMember("parent", "child"), true);
  assert.equal(canRemoveFamilyMember("parent", "owner"), false);
  assert.equal(canRemoveFamilyMember("parent", "parent"), false);
  assert.equal(canRemoveFamilyMember("owner", "owner"), false);
});

test("empty-family deletion rejects every meaningful family state value", () => {
  const blank = {
    children: [], entries: [], rewards: [], templates: [], redemptions: [],
    specialRewards: [], rewardIconLibrary: [], dailyTasks: [], dailyTaskRecords: [],
    dailyTaskSettings: {}, favoriteOfficialTaskIds: [], dailyTaskSortMode: "flow",
    passwordHash: "", securityAnswerHash: "", securityFailedAttempts: 0,
  };
  assert.equal(isEmptyFamilyState(JSON.stringify(blank)), true);
  assert.equal(isEmptyFamilyState(null), true);
  assert.equal(isEmptyFamilyState("not-json"), false);
  assert.equal(isEmptyFamilyState(JSON.stringify({ ...blank, children: [{ id: "child" }] })), false);
  assert.equal(isEmptyFamilyState(JSON.stringify({ ...blank, entries: [{ id: "entry" }] })), false);
  assert.equal(isEmptyFamilyState(JSON.stringify({ ...blank, passwordHash: "configured" })), false);
  assert.equal(isEmptyFamilyState(JSON.stringify({ ...blank, futureFeatureData: { enabled: true } })), false);
});
