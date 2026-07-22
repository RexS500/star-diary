import { env } from "cloudflare:workers";
import { DEFAULT_DAILY_TASK_SETTINGS } from "./daily-task-logic";
import { findFamilyForAuthenticatedUser, type FamilyAccess } from "./family-access";
import { recordOperationalEvent } from "./operations-telemetry";

export class FamilyOnboardingError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); }
}

export const FAMILY_CREATION_LIMIT_MESSAGE = "每個 Google 帳號只能建立一個家庭。";

type CreateFamilyInput = {
  familyName: unknown;
  childName: unknown;
  childGender: unknown;
};

function cleanRequiredText(value: unknown, label: string, maximum: number) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean) throw new FamilyOnboardingError(`請輸入${label}`, 422);
  if (clean.length > maximum) throw new FamilyOnboardingError(`${label}請勿超過 ${maximum} 個字`, 422);
  return clean;
}

function initialFamilyState(child: { id: string; name: string; gender: "boy" | "girl" }) {
  return {
    children: [{ ...child, avatar: child.gender, stars: 0 }],
    entries: [], rewards: [], specialRewards: [], templates: [], redemptions: [], rewardIconLibrary: [],
    dailyTasks: [], dailyTaskRecords: [], dailyTaskSettings: { [child.id]: { ...DEFAULT_DAILY_TASK_SETTINGS } },
    favoriteOfficialTaskIds: [], dailyTaskSortMode: "flow",
    passwordHash: "", securityQuestionType: "", securityQuestionText: "", securityAnswerHash: "",
    securityAnswerHint: "", securityFailedAttempts: 0, securityLockedUntil: "",
    securityResetTokenHash: "", securityResetTokenExpiresAt: "",
  };
}

export async function createFamilyAndOwner(user: FamilyAccess["user"], input: CreateFamilyInput) {
  const ownedFamily = await env.DB.prepare(
    "SELECT id FROM families WHERE created_by_user_id = ? LIMIT 1",
  ).bind(user.id).first<{ id: string }>();
  if (ownedFamily) {
    throw new FamilyOnboardingError(FAMILY_CREATION_LIMIT_MESSAGE, 409, "FAMILY_CREATION_LIMIT");
  }
  if (await findFamilyForAuthenticatedUser(user)) {
    throw new FamilyOnboardingError("此 Google 帳號已經是家庭成員，將直接開啟原本家庭。", 409);
  }
  const familyName = cleanRequiredText(input.familyName, "家庭名稱", 80);
  const childName = cleanRequiredText(input.childName, "孩子姓名", 40);
  const childGender = input.childGender === "girl" ? "girl" : "boy";
  const familyId = `family-${crypto.randomUUID()}`;
  const childId = crypto.randomUUID();
  const now = new Date().toISOString();
  const revision = Date.now();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO families
           (id, name, legacy_state, created_at, updated_at,
            created_by_user_id, last_activity_at, status, is_test)
         VALUES (?, ?, 0, ?, ?, ?, ?, 'active', 0)`,
      ).bind(familyId, familyName, now, now, user.id, now),
      env.DB.prepare(
        `INSERT INTO family_members
           (family_id, user_id, role, child_id, child_account_mode, created_at, updated_at, status)
         VALUES (?, ?, 'owner', NULL, NULL, ?, ?, 'active')`,
      ).bind(familyId, user.id, now, now),
      env.DB.prepare(
        "INSERT INTO family_state (family_id, data, updated_at) VALUES (?, ?, ?)",
      ).bind(familyId, JSON.stringify(initialFamilyState({ id: childId, name: childName, gender: childGender })), revision),
    ]);
    if (results.some(result => result.success === false)) throw new Error("D1 batch failed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/families_created_by_user_unique|families\.created_by_user_id/i.test(message)) {
      throw new FamilyOnboardingError(FAMILY_CREATION_LIMIT_MESSAGE, 409, "FAMILY_CREATION_LIMIT");
    }
    if (/family_members_user_unique|family_members\.user_id|unique|constraint/i.test(message)) {
      throw new FamilyOnboardingError("此 Google 帳號已經建立或加入家庭，請重新整理。", 409, "FAMILY_MEMBERSHIP_EXISTS");
    }
    throw new FamilyOnboardingError("建立家庭失敗，請檢查網路後再試。", 500);
  }
  await Promise.all([
    recordOperationalEvent({
      eventType: "family_created",
      familyId,
      userId: user.id,
      dedupeKey: `family_created:${familyId}`,
    }),
    recordOperationalEvent({
      eventType: "member_created",
      familyId,
      userId: user.id,
      source: "owner",
      dedupeKey: `member_created:${familyId}:${user.id}`,
    }),
  ]);
  return { familyId, childId, familyName };
}

export function familyOnboardingErrorResponse(error: unknown) {
  const status = error instanceof FamilyOnboardingError ? error.status : 500;
  const message = error instanceof FamilyOnboardingError ? error.message : "建立家庭失敗，請稍後再試。";
  const code = error instanceof FamilyOnboardingError ? error.code : undefined;
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status, headers: { "Cache-Control": "no-store, private" } });
}
