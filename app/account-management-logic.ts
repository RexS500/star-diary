export const INVITATION_TTL_MS = 10 * 60 * 1000;

export type FamilyMemberRole = "owner" | "parent" | "child";
export type InvitationRole = "parent" | "child";
export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";
export type PermissionPreset = "only_self" | "share_all" | "view_all" | "custom";

export type ChildPermission = {
  childId: string;
  canView: boolean;
  canOperate: boolean;
};

export function effectiveInvitationStatus(
  status: InvitationStatus,
  expiresAt: string,
  now = Date.now(),
): InvitationStatus {
  if (status === "pending" && Date.parse(expiresAt) <= now) return "expired";
  return status;
}

export function isFamilyManager(role: FamilyMemberRole) {
  return role === "owner" || role === "parent";
}

export function canRemoveFamilyMember(actor: FamilyMemberRole, target: FamilyMemberRole) {
  if (target === "owner") return false;
  if (actor === "owner") return target === "parent" || target === "child";
  return actor === "parent" && target === "child";
}

export function normalizeChildPermissions(options: {
  childIds: string[];
  boundChildId: string;
  preset: PermissionPreset;
  custom?: ChildPermission[];
}): ChildPermission[] {
  const childIds = [...new Set(options.childIds.filter(Boolean))];
  const custom = new Map((options.custom || []).map(permission => [permission.childId, permission]));
  return childIds.map(childId => {
    const isSelf = childId === options.boundChildId;
    if (options.preset === "share_all") return { childId, canView: true, canOperate: true };
    if (options.preset === "view_all") return { childId, canView: true, canOperate: isSelf };
    if (options.preset === "only_self") return { childId, canView: isSelf, canOperate: isSelf };
    const submitted = custom.get(childId);
    const canOperate = isSelf || Boolean(submitted?.canOperate);
    const canView = isSelf || canOperate || Boolean(submitted?.canView);
    return { childId, canView, canOperate };
  });
}

export function permissionPresetFor(
  permissions: ChildPermission[],
  childIds: string[],
  boundChildId: string,
): PermissionPreset {
  const normalized = normalizeChildPermissions({ childIds, boundChildId, preset: "custom", custom: permissions });
  const matches = (preset: Exclude<PermissionPreset, "custom">) => {
    const expected = normalizeChildPermissions({ childIds, boundChildId, preset });
    return expected.every((value, index) => value.childId === normalized[index]?.childId && value.canView === normalized[index]?.canView && value.canOperate === normalized[index]?.canOperate);
  };
  if (matches("only_self")) return "only_self";
  if (matches("share_all")) return "share_all";
  if (matches("view_all")) return "view_all";
  return "custom";
}

export function invitationTokenLooksValid(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createInvitationCredential() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const token = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return { token, tokenHash: await sha256Hex(token) };
}
