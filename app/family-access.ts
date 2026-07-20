import { env } from "cloudflare:workers";
import type { Session } from "next-auth";
import { auth } from "../auth";

export type FamilyRole = "owner" | "parent" | "viewer";
export type FamilyAccess = {
  familyId: string;
  familyName: string;
  role: FamilyRole;
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  };
};

type MembershipRow = {
  family_id: string;
  family_name: string;
  role: FamilyRole;
};

type FamilyRow = {
  id: string;
  claimed_by_user_id: string | null;
};

const LEGACY_FAMILY_ID = "legacy-family-v1";
const WRITE_ROLES = new Set<FamilyRole>(["owner", "parent"]);

export class FamilyAccessError extends Error {
  constructor(message: string, public status: 401 | 403 | 404 = 401) {
    super(message);
  }
}

export function normalizeAccountEmail(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("en-US") || "";
}

function familyNameForUser(name: string | null | undefined) {
  const clean = name?.trim().slice(0, 80);
  return clean ? `${clean} 的家庭` : "我的家庭";
}

function sessionUser(session: Session | null): FamilyAccess["user"] {
  const id = session?.user?.id;
  const email = normalizeAccountEmail(session?.user?.email);
  if (!id || !email) throw new FamilyAccessError("請先使用 Google 帳號登入", 401);
  return {
    id,
    email,
    name: session.user.name || null,
    image: session.user.image || null,
  };
}

async function membershipForUser(userId: string) {
  return env.DB.prepare(
    `SELECT fm.family_id, f.name AS family_name, fm.role
       FROM family_members fm
       JOIN families f ON f.id = fm.family_id
      WHERE fm.user_id = ?
      ORDER BY CASE fm.role WHEN 'owner' THEN 0 WHEN 'parent' THEN 1 ELSE 2 END,
               fm.created_at ASC
      LIMIT 1`,
  ).bind(userId).first<MembershipRow>();
}

async function claimLegacyFamily(user: FamilyAccess["user"]) {
  const configuredOwner = normalizeAccountEmail(env.INITIAL_OWNER_EMAIL);
  if (!configuredOwner || configuredOwner !== user.email) return null;

  const legacy = await env.DB.prepare(
    "SELECT id, claimed_by_user_id FROM families WHERE id = ? AND legacy_state = 1",
  ).bind(LEGACY_FAMILY_ID).first<FamilyRow>();
  if (!legacy) return null;
  if (legacy.claimed_by_user_id && legacy.claimed_by_user_id !== user.id) {
    throw new FamilyAccessError("既有家庭已完成認領，請聯絡家庭管理者", 403);
  }

  const now = new Date().toISOString();
  const claim = await env.DB.prepare(
    `UPDATE families
        SET claimed_by_user_id = ?, claimed_at = COALESCE(claimed_at, ?), updated_at = ?
      WHERE id = ? AND (claimed_by_user_id IS NULL OR claimed_by_user_id = ?)`,
  ).bind(user.id, now, now, LEGACY_FAMILY_ID, user.id).run();
  if (Number(claim.meta.changes || 0) !== 1 && !legacy.claimed_by_user_id) {
    throw new FamilyAccessError("既有家庭正在由管理者認領，請稍後再試", 403);
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO family_members (family_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
  ).bind(LEGACY_FAMILY_ID, user.id, now).run();
  return membershipForUser(user.id);
}

async function createFamilyForUser(user: FamilyAccess["user"]) {
  const familyId = `family-${user.id}`;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO families (id, name, legacy_state, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
    ).bind(familyId, familyNameForUser(user.name), now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO family_members (family_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
    ).bind(familyId, user.id, now),
  ]);
  return membershipForUser(user.id);
}

export async function getFamilyForAuthenticatedUser(
  user: FamilyAccess["user"],
): Promise<FamilyAccess> {
  const membership =
    await membershipForUser(user.id) ||
    await claimLegacyFamily(user) ||
    await createFamilyForUser(user);
  if (!membership) throw new FamilyAccessError("無法建立家庭資料，請稍後再試", 403);
  return {
    familyId: membership.family_id,
    familyName: membership.family_name,
    role: membership.role,
    user,
  };
}

export async function requireAuthenticatedUser() {
  return sessionUser(await auth());
}

export async function requireFamilyMembership(
  access: "read" | "write" = "read",
): Promise<FamilyAccess> {
  const family = await getFamilyForAuthenticatedUser(await requireAuthenticatedUser());
  if (access === "write" && !WRITE_ROLES.has(family.role)) {
    throw new FamilyAccessError("目前帳號沒有修改家庭資料的權限", 403);
  }
  return family;
}

export const getCurrentFamily = requireFamilyMembership;

export function assertResourceBelongsToFamily(
  resourceFamilyId: string | null | undefined,
  currentFamilyId: string,
) {
  if (!resourceFamilyId || resourceFamilyId !== currentFamilyId) {
    // Return the same result as a missing resource to avoid leaking existence.
    throw new FamilyAccessError("找不到資料", 404);
  }
}

export function familyAccessErrorResponse(error: unknown) {
  const status = error instanceof FamilyAccessError ? error.status : 500;
  const message = error instanceof FamilyAccessError
    ? error.message
    : "伺服器暫時無法處理要求";
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store, private" } },
  );
}
