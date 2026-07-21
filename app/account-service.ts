import { env } from "cloudflare:workers";
import type { FamilyAccess } from "./family-access";
import {
  INVITATION_TTL_MS,
  canRemoveFamilyMember,
  createInvitationCredential,
  effectiveInvitationStatus,
  invitationTokenLooksValid,
  isEmptyFamilyState,
  isFamilyManager,
  normalizeChildPermissions,
  sha256Hex,
  type ChildPermission,
  type FamilyMemberRole,
  type InvitationRole,
  type InvitationStatus,
  type PermissionPreset,
} from "./account-management-logic";

type ChildSummary = { id: string; name: string };
type FamilyStateRow = { data: string };
type FamilyExitStateRow = { data: string; updated_at: number };
type FamilyExitFamilyRow = { legacy_state: number };
type CountRow = { count: number };
type MemberRow = {
  family_id: string;
  user_id: string;
  role: FamilyMemberRole;
  child_id: string | null;
  created_at: string;
  updated_at: string;
  status: "active" | "disabled";
  name: string | null;
  email: string | null;
  image: string | null;
};
type PermissionRow = {
  user_id: string;
  child_id: string;
  can_view: number;
  can_operate: number;
};
type InvitationRow = {
  id: string;
  family_id: string;
  family_name: string;
  token_hash: string;
  role: InvitationRole;
  child_id: string | null;
  status: InvitationStatus;
  created_by_user_id: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  cancelled_at: string | null;
};

export class AccountApiError extends Error {
  constructor(message: string, public status: 401 | 403 | 404 | 409 | 410 | 422 = 422) {
    super(message);
  }
}

export function accountApiErrorResponse(error: unknown) {
  const status = error instanceof AccountApiError ? error.status : 500;
  return Response.json(
    { error: error instanceof Error ? error.message : "伺服器暫時無法處理要求" },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

function requireManager(family: FamilyAccess) {
  if (!isFamilyManager(family.role)) throw new AccountApiError("目前帳號沒有管理家庭成員的權限", 403);
}

async function inspectFamilyExit(family: FamilyAccess) {
  const [familyResult, membersResult, stateResult, mediaResult, invitationsResult, permissionsResult] = await env.DB.batch([
    env.DB.prepare("SELECT legacy_state FROM families WHERE id = ?").bind(family.familyId),
    env.DB.prepare("SELECT COUNT(*) AS count FROM family_members WHERE family_id = ? AND status = 'active'").bind(family.familyId),
    env.DB.prepare("SELECT data, updated_at FROM family_state WHERE family_id = ?").bind(family.familyId),
    env.DB.prepare("SELECT COUNT(*) AS count FROM media_objects WHERE family_id = ?").bind(family.familyId),
    env.DB.prepare("SELECT COUNT(*) AS count FROM family_invitations WHERE family_id = ?").bind(family.familyId),
    env.DB.prepare("SELECT COUNT(*) AS count FROM member_child_permissions WHERE family_id = ?").bind(family.familyId),
  ]);
  const familyRow = familyResult.results?.[0] as FamilyExitFamilyRow | undefined;
  if (!familyRow) throw new AccountApiError("找不到目前家庭", 404);
  const stateRow = stateResult.results?.[0] as FamilyExitStateRow | undefined;
  const memberCount = Number((membersResult.results?.[0] as CountRow | undefined)?.count || 0);
  const relatedDataCount = [mediaResult, invitationsResult, permissionsResult]
    .reduce((total, result) => total + Number((result.results?.[0] as CountRow | undefined)?.count || 0), 0);
  const stateIsEmpty = isEmptyFamilyState(stateRow?.data);
  const familyIsEmpty = stateIsEmpty && relatedDataCount === 0;
  const isLegacyFamily = Boolean(familyRow.legacy_state) || family.familyId === "legacy-family-v1";
  const canLeave = family.role === "parent" || family.role === "child";
  const canDeleteEmptyFamily = family.role === "owner" && memberCount === 1 && familyIsEmpty && !isLegacyFamily;
  let blockedReason: string | null = null;
  if (family.role === "owner") {
    if (isLegacyFamily) blockedReason = "既有正式家庭不可刪除；如需離開，請先轉移 Owner。";
    else if (memberCount > 1) blockedReason = "Owner 必須先將 Owner 轉移給另一位 Parent，才能離開家庭。";
    else if (!familyIsEmpty) blockedReason = "家庭仍有孩子、星星、任務、獎勵、紀錄、圖片或邀請資料，不能刪除。";
  }
  return {
    memberCount,
    familyIsEmpty,
    canLeave,
    canDeleteEmptyFamily,
    blockedReason,
    stateUpdatedAt: stateRow?.updated_at ?? null,
  };
}

export async function getFamilyChildren(familyId: string): Promise<ChildSummary[]> {
  const row = await env.DB.prepare("SELECT data FROM family_state WHERE family_id = ?")
    .bind(familyId).first<FamilyStateRow>();
  if (!row) return [];
  try {
    const state = JSON.parse(row.data) as { children?: Array<{ id?: unknown; name?: unknown }> };
    if (!Array.isArray(state.children)) return [];
    return state.children.flatMap(child => typeof child.id === "string" && child.id
      ? [{ id: child.id, name: typeof child.name === "string" && child.name.trim() ? child.name.trim() : "孩子" }]
      : []);
  } catch {
    return [];
  }
}

async function invitationRowByHash(tokenHash: string) {
  return env.DB.prepare(
    `SELECT i.*, f.name AS family_name
       FROM family_invitations i
       JOIN families f ON f.id = i.family_id
      WHERE i.token_hash = ?`,
  ).bind(tokenHash).first<InvitationRow>();
}

function publicInvitation(row: InvitationRow, children: ChildSummary[], now = Date.now()) {
  const status = effectiveInvitationStatus(row.status, row.expires_at, now);
  return {
    id: row.id,
    familyName: row.family_name,
    role: row.role,
    childId: row.child_id,
    childName: children.find(child => child.id === row.child_id)?.name || null,
    status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    cancelledAt: row.cancelled_at,
  };
}

export async function getInvitationByToken(token: string, now = Date.now()) {
  if (!invitationTokenLooksValid(token)) throw new AccountApiError("找不到這個邀請", 404);
  const row = await invitationRowByHash(await sha256Hex(token));
  if (!row) throw new AccountApiError("找不到這個邀請", 404);
  const invitation = publicInvitation(row, await getFamilyChildren(row.family_id), now);
  if (invitation.status === "expired") throw new AccountApiError("這個邀請已失效，請家長重新建立", 410);
  if (invitation.status === "cancelled") throw new AccountApiError("這個邀請已取消", 409);
  if (invitation.status === "accepted") throw new AccountApiError("這個邀請已經使用過", 409);
  return invitation;
}

export async function getAccountManagementSnapshot(family: FamilyAccess, now = Date.now()) {
  const exit = await inspectFamilyExit(family);
  const familyExit = {
    memberCount: exit.memberCount,
    isEmpty: exit.familyIsEmpty,
    canLeave: exit.canLeave,
    canDeleteEmptyFamily: exit.canDeleteEmptyFamily,
    blockedReason: exit.blockedReason,
  };
  if (!isFamilyManager(family.role)) {
    return {
      family: { id: family.familyId, name: family.familyName },
      currentUser: { id: family.user.id, role: family.role },
      children: [],
      members: [],
      activeInvitations: [],
      invitationHistory: [],
      familyExit,
    };
  }
  const children = await getFamilyChildren(family.familyId);
  const [membersResult, permissionsResult, invitationsResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT fm.*, u.name, u.email, u.image
         FROM family_members fm
         JOIN users u ON u.id = fm.user_id
        WHERE fm.family_id = ?
        ORDER BY CASE fm.role WHEN 'owner' THEN 0 WHEN 'parent' THEN 1 ELSE 2 END,
                 fm.created_at ASC`,
    ).bind(family.familyId),
    env.DB.prepare(
      `SELECT user_id, child_id, can_view, can_operate
         FROM member_child_permissions
        WHERE family_id = ?
        ORDER BY user_id, child_id`,
    ).bind(family.familyId),
    env.DB.prepare(
      `SELECT i.*, f.name AS family_name
         FROM family_invitations i
         JOIN families f ON f.id = i.family_id
        WHERE i.family_id = ?
        ORDER BY i.created_at DESC
        LIMIT 100`,
    ).bind(family.familyId),
  ]);
  const permissions = permissionsResult.results as PermissionRow[];
  const members = (membersResult.results as MemberRow[]).map(member => ({
    userId: member.user_id,
    name: member.name || "Google 使用者",
    email: member.email || "",
    image: member.image,
    role: member.role,
    childId: member.child_id,
    childName: children.find(child => child.id === member.child_id)?.name || null,
    joinedAt: member.created_at,
    status: member.status,
    permissions: permissions.filter(permission => permission.user_id === member.user_id).map(permission => ({
      childId: permission.child_id,
      canView: Boolean(permission.can_view),
      canOperate: Boolean(permission.can_operate),
    })),
  }));
  const invitations = (invitationsResult.results as InvitationRow[]).map(row => publicInvitation(row, children, now));
  return {
    family: { id: family.familyId, name: family.familyName },
    currentUser: { id: family.user.id, role: family.role },
    children,
    members,
    activeInvitations: invitations.filter(invitation => invitation.status === "pending"),
    invitationHistory: invitations.filter(invitation => invitation.status !== "pending"),
    familyExit,
  };
}

export async function createFamilyInvitation(
  family: FamilyAccess,
  input: { role?: unknown; childId?: unknown },
  origin: string,
  now = Date.now(),
) {
  requireManager(family);
  const role = input.role === "parent" || input.role === "child" ? input.role : null;
  if (!role) throw new AccountApiError("請選擇 Parent 或 Child", 422);
  const children = await getFamilyChildren(family.familyId);
  const childId = role === "child" && typeof input.childId === "string" ? input.childId : null;
  if (role === "child" && !children.some(child => child.id === childId)) throw new AccountApiError("請選擇要綁定的孩子", 422);

  if (childId) {
    await env.DB.prepare(
      `UPDATE family_invitations
          SET status = 'expired'
        WHERE family_id = ? AND role = 'child' AND child_id = ?
          AND status = 'pending' AND expires_at <= ?`,
    ).bind(family.familyId, childId, new Date(now).toISOString()).run();
    const bound = await env.DB.prepare(
      `SELECT 1 AS found FROM family_members
        WHERE family_id = ? AND role = 'child' AND child_id = ? AND status = 'active'
        LIMIT 1`,
    ).bind(family.familyId, childId).first<{ found: number }>();
    if (bound) throw new AccountApiError("這位孩子已綁定其他有效 Child 帳號", 409);
    const pending = await env.DB.prepare(
      `SELECT 1 AS found FROM family_invitations
        WHERE family_id = ? AND role = 'child' AND child_id = ?
          AND status = 'pending' AND expires_at > ?
        LIMIT 1`,
    ).bind(family.familyId, childId, new Date(now).toISOString()).first<{ found: number }>();
    if (pending) throw new AccountApiError("這位孩子已有尚未失效的邀請", 409);
  }

  const { token, tokenHash } = await createInvitationCredential();
  const id = crypto.randomUUID();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + INVITATION_TTL_MS).toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO family_invitations
         (id, family_id, token_hash, role, child_id, status, created_by_user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).bind(id, family.familyId, tokenHash, role, childId, family.user.id, createdAt, expiresAt).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/family_invitations_pending_child_unique|UNIQUE constraint failed: family_invitations\.family_id, family_invitations\.child_id/i.test(message)) {
      throw new AccountApiError("這位孩子已有尚未失效的邀請", 409);
    }
    throw error;
  }
  return {
    id,
    familyName: family.familyName,
    role,
    childId,
    childName: children.find(child => child.id === childId)?.name || null,
    status: "pending" as const,
    createdAt,
    expiresAt,
    inviteUrl: `${origin}/join/${token}`,
  };
}

export async function cancelFamilyInvitation(family: FamilyAccess, invitationId: string, now = Date.now()) {
  requireManager(family);
  const row = await env.DB.prepare(
    `SELECT i.*, f.name AS family_name
       FROM family_invitations i JOIN families f ON f.id = i.family_id
      WHERE i.id = ? AND i.family_id = ?`,
  ).bind(invitationId, family.familyId).first<InvitationRow>();
  if (!row) throw new AccountApiError("找不到這個邀請", 404);
  const status = effectiveInvitationStatus(row.status, row.expires_at, now);
  if (status === "expired") throw new AccountApiError("這個邀請已失效", 410);
  if (status === "accepted") throw new AccountApiError("這個邀請已經使用過", 409);
  if (status === "cancelled") throw new AccountApiError("這個邀請已取消", 409);
  const result = await env.DB.prepare(
    `UPDATE family_invitations SET status = 'cancelled', cancelled_at = ?
      WHERE id = ? AND family_id = ? AND status = 'pending' AND expires_at > ?`,
  ).bind(new Date(now).toISOString(), invitationId, family.familyId, new Date(now).toISOString()).run();
  if (Number(result.meta.changes || 0) !== 1) throw new AccountApiError("邀請狀態已更新，請重新整理", 409);
}

export async function updateMemberChildPermissions(
  family: FamilyAccess,
  input: { userId?: unknown; preset?: unknown; permissions?: unknown },
  now = Date.now(),
) {
  requireManager(family);
  const userId = typeof input.userId === "string" ? input.userId : "";
  const preset = input.preset === "only_self" || input.preset === "share_all" || input.preset === "view_all" || input.preset === "custom"
    ? input.preset as PermissionPreset
    : null;
  if (!userId || !preset) throw new AccountApiError("權限設定不完整", 422);
  const member = await env.DB.prepare(
    `SELECT child_id FROM family_members
      WHERE family_id = ? AND user_id = ? AND role = 'child' AND status = 'active'`,
  ).bind(family.familyId, userId).first<{ child_id: string | null }>();
  if (!member?.child_id) throw new AccountApiError("找不到可設定的 Child 成員", 404);
  const children = await getFamilyChildren(family.familyId);
  const custom = Array.isArray(input.permissions) ? input.permissions.flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const value = raw as Record<string, unknown>;
    return typeof value.childId === "string" ? [{ childId: value.childId, canView: value.canView === true, canOperate: value.canOperate === true }] : [];
  }) : [];
  const normalized = normalizeChildPermissions({ childIds: children.map(child => child.id), boundChildId: member.child_id, preset, custom });
  const timestamp = new Date(now).toISOString();
  const statements = [
    env.DB.prepare("DELETE FROM member_child_permissions WHERE family_id = ? AND user_id = ?").bind(family.familyId, userId),
    ...normalized.map(permission => env.DB.prepare(
      `INSERT INTO member_child_permissions
         (family_id, user_id, child_id, can_view, can_operate, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(family.familyId, userId, permission.childId, permission.canView ? 1 : 0, permission.canOperate ? 1 : 0, timestamp, timestamp)),
  ];
  await env.DB.batch(statements);
  return normalized;
}

export async function removeFamilyMember(family: FamilyAccess, userId: string) {
  requireManager(family);
  const target = await env.DB.prepare(
    `SELECT role FROM family_members WHERE family_id = ? AND user_id = ? AND status = 'active'`,
  ).bind(family.familyId, userId).first<{ role: FamilyMemberRole }>();
  if (!target) throw new AccountApiError("找不到這位家庭成員", 404);
  if (!canRemoveFamilyMember(family.role, target.role)) throw new AccountApiError("你沒有權限移除這位家庭成員", 403);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE userId = ?").bind(userId),
    env.DB.prepare("DELETE FROM family_members WHERE family_id = ? AND user_id = ? AND role <> 'owner'").bind(family.familyId, userId),
  ]);
}

export async function leaveCurrentFamily(family: FamilyAccess) {
  if (family.role === "owner") {
    throw new AccountApiError("Owner 不能直接離開家庭；請先轉移 Owner，空白測試家庭則使用「刪除空白家庭」。", 409);
  }
  const results = await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM family_members
        WHERE family_id = ? AND user_id = ? AND role IN ('parent', 'child') AND status = 'active'`,
    ).bind(family.familyId, family.user.id),
    env.DB.prepare(
      `DELETE FROM sessions
        WHERE userId = ?
          AND NOT EXISTS (SELECT 1 FROM family_members WHERE user_id = ?)`,
    ).bind(family.user.id, family.user.id),
  ]);
  if (Number(results[0].meta.changes || 0) !== 1) throw new AccountApiError("家庭關係已變更，請重新登入後再試", 409);
}

export async function deleteEmptyFamily(family: FamilyAccess) {
  if (family.role !== "owner") throw new AccountApiError("只有 Owner 可以刪除空白家庭", 403);
  const exit = await inspectFamilyExit(family);
  if (!exit.canDeleteEmptyFamily) throw new AccountApiError(exit.blockedReason || "家庭不是可刪除的空白家庭", 409);
  const results = await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM families
        WHERE id = ?
          AND id <> 'legacy-family-v1'
          AND legacy_state = 0
          AND (SELECT COUNT(*) FROM family_members WHERE family_id = families.id AND status = 'active') = 1
          AND EXISTS (
            SELECT 1 FROM family_members
             WHERE family_id = families.id AND user_id = ? AND role = 'owner' AND status = 'active'
          )
          AND NOT EXISTS (SELECT 1 FROM media_objects WHERE family_id = families.id)
          AND NOT EXISTS (SELECT 1 FROM family_invitations WHERE family_id = families.id)
          AND NOT EXISTS (SELECT 1 FROM member_child_permissions WHERE family_id = families.id)
          AND (
            (? IS NULL AND NOT EXISTS (SELECT 1 FROM family_state WHERE family_id = families.id))
            OR EXISTS (
              SELECT 1 FROM family_state
               WHERE family_id = families.id AND updated_at = ?
            )
          )`,
    ).bind(family.familyId, family.user.id, exit.stateUpdatedAt, exit.stateUpdatedAt),
    env.DB.prepare(
      `DELETE FROM sessions
        WHERE userId = ?
          AND NOT EXISTS (SELECT 1 FROM family_members WHERE user_id = ?)`,
    ).bind(family.user.id, family.user.id),
  ]);
  if (Number(results[0].meta.changes || 0) !== 1) throw new AccountApiError("家庭資料已變更，未執行刪除，請重新整理確認", 409);
}

export async function acceptFamilyInvitation(
  token: string,
  user: FamilyAccess["user"],
  now = Date.now(),
) {
  if (!invitationTokenLooksValid(token)) throw new AccountApiError("找不到這個邀請", 404);
  const tokenHash = await sha256Hex(token);
  const row = await invitationRowByHash(tokenHash);
  if (!row) throw new AccountApiError("找不到這個邀請", 404);
  const status = effectiveInvitationStatus(row.status, row.expires_at, now);
  if (status === "expired") throw new AccountApiError("這個邀請已失效，請家長重新建立", 410);
  if (status === "cancelled") throw new AccountApiError("這個邀請已取消", 409);
  if (status === "accepted") throw new AccountApiError("這個邀請已經使用過", 409);

  const existing = await env.DB.prepare(
    "SELECT family_id FROM family_members WHERE user_id = ? LIMIT 1",
  ).bind(user.id).first<{ family_id: string }>();
  if (existing?.family_id === row.family_id) throw new AccountApiError("此 Google 帳號已經是家庭成員", 409);
  if (existing) throw new AccountApiError("此 Google 帳號已加入其他家庭，目前無法接受新的家庭邀請。", 409);

  const children = await getFamilyChildren(row.family_id);
  if (row.role === "child") {
    if (!row.child_id || !children.some(child => child.id === row.child_id)) throw new AccountApiError("邀請綁定的孩子已不存在", 409);
    const bound = await env.DB.prepare(
      `SELECT 1 AS found FROM family_members
        WHERE family_id = ? AND role = 'child' AND child_id = ? AND status = 'active' LIMIT 1`,
    ).bind(row.family_id, row.child_id).first<{ found: number }>();
    if (bound) throw new AccountApiError("這位孩子已綁定其他有效 Child 帳號", 409);
  }

  const timestamp = new Date(now).toISOString();
  const statements = [
    env.DB.prepare(
      `UPDATE family_invitations
          SET status = 'accepted', accepted_at = ?, accepted_by_user_id = ?
        WHERE id = ? AND token_hash = ? AND status = 'pending'
          AND accepted_by_user_id IS NULL AND expires_at > ?`,
    ).bind(timestamp, user.id, row.id, tokenHash, timestamp),
    env.DB.prepare(
      `INSERT INTO family_members
         (family_id, user_id, role, child_id, created_at, updated_at, status)
       SELECT family_id, ?, role, child_id, ?, ?, 'active'
         FROM family_invitations
        WHERE id = ? AND status = 'accepted' AND accepted_by_user_id = ?`,
    ).bind(user.id, timestamp, timestamp, row.id, user.id),
  ];
  if (row.role === "child" && row.child_id) {
    const defaults = normalizeChildPermissions({ childIds: children.map(child => child.id), boundChildId: row.child_id, preset: "only_self" });
    for (const permission of defaults) {
      statements.push(env.DB.prepare(
        `INSERT INTO member_child_permissions
           (family_id, user_id, child_id, can_view, can_operate, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM family_invitations
             WHERE id = ? AND status = 'accepted' AND accepted_by_user_id = ?
          )`,
      ).bind(row.family_id, user.id, permission.childId, permission.canView ? 1 : 0, permission.canOperate ? 1 : 0, timestamp, timestamp, row.id, user.id));
    }
  }
  try {
    const results = await env.DB.batch(statements);
    if (Number(results[0].meta.changes || 0) !== 1) throw new AccountApiError("邀請已被使用或失效", 409);
  } catch (error) {
    if (error instanceof AccountApiError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/family_members_user_unique|UNIQUE constraint failed: family_members\.user_id/i.test(message)) {
      throw new AccountApiError("此 Google 帳號已加入其他家庭，目前無法接受新的家庭邀請。", 409);
    }
    if (/family_members_child_binding_unique|UNIQUE constraint failed: family_members\.family_id, family_members\.child_id/i.test(message)) {
      throw new AccountApiError("這位孩子已綁定其他有效 Child 帳號", 409);
    }
    throw error;
  }
  return { familyId: row.family_id, familyName: row.family_name, role: row.role };
}

export type { ChildPermission };
