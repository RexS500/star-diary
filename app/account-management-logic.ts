export const INVITATION_TTL_MS = 10 * 60 * 1000;

export type FamilyMemberRole = "owner" | "parent" | "child";
export type InvitationRole = "parent" | "child";
export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";
export type PermissionPreset = "only_self" | "share_all" | "view_all" | "custom";

const EMPTY_ARRAY_STATE_KEYS = [
  "children",
  "entries",
  "rewards",
  "templates",
  "redemptions",
  "specialRewards",
  "rewardIconLibrary",
  "dailyTasks",
  "dailyTaskRecords",
  "favoriteOfficialTaskIds",
] as const;
const EMPTY_OBJECT_STATE_KEYS = ["dailyTaskSettings"] as const;
const EMPTY_TEXT_STATE_KEYS = [
  "passwordHash",
  "securityAnswerHash",
  "securityAnswerHint",
  "securityLockedUntil",
  "securityQuestionText",
  "securityQuestionType",
  "securityResetTokenExpiresAt",
  "securityResetTokenHash",
] as const;
const EMPTY_NUMBER_STATE_KEYS = ["securityFailedAttempts"] as const;
const KNOWN_EMPTY_STATE_KEYS = new Set<string>([
  ...EMPTY_ARRAY_STATE_KEYS,
  ...EMPTY_OBJECT_STATE_KEYS,
  ...EMPTY_TEXT_STATE_KEYS,
  ...EMPTY_NUMBER_STATE_KEYS,
  "dailyTaskSortMode",
]);

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

function hasMeaningfulStateValue(value: unknown): boolean {
  if (value == null || value === false || value === 0 || value === "") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

export function isEmptyFamilyState(raw: string | null | undefined) {
  if (!raw) return true;
  let state: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    state = parsed as Record<string, unknown>;
  } catch {
    return false;
  }

  for (const key of EMPTY_ARRAY_STATE_KEYS) {
    const value = state[key];
    if (value !== undefined && (!Array.isArray(value) || value.length > 0)) return false;
  }
  for (const key of EMPTY_OBJECT_STATE_KEYS) {
    const value = state[key];
    if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value as object).length > 0)) return false;
  }
  for (const key of EMPTY_TEXT_STATE_KEYS) {
    const value = state[key];
    if (value != null && (typeof value !== "string" || value.trim().length > 0)) return false;
  }
  for (const key of EMPTY_NUMBER_STATE_KEYS) {
    const value = state[key];
    if (value != null && (typeof value !== "number" || value !== 0)) return false;
  }
  if (state.dailyTaskSortMode !== undefined && state.dailyTaskSortMode !== "flow") return false;

  return !Object.entries(state).some(([key, value]) => !KNOWN_EMPTY_STATE_KEYS.has(key) && hasMeaningfulStateValue(value));
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
