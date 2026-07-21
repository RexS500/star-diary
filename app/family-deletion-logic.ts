export type FamilyDeletionSummary = {
  memberCount: number;
  childCount: number;
  starRecordCount: number;
  taskCount: number;
  taskCompletionRecordCount: number;
  rewardCount: number;
  specialRewardCount: number;
  redemptionCount: number;
  quickIndicatorCount: number;
  invitationCount: number;
  imageCount: number;
};

type FamilyStateShape = Record<string, unknown>;

function arrayCount(state: FamilyStateShape, key: string) {
  return Array.isArray(state[key]) ? state[key].length : 0;
}

export function summarizeFamilyState(raw: string | null | undefined) {
  let state: FamilyStateShape = {};
  try {
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) state = parsed as FamilyStateShape;
  } catch {
    state = {};
  }
  return {
    childCount: arrayCount(state, "children"),
    starRecordCount: arrayCount(state, "entries"),
    taskCount: arrayCount(state, "dailyTasks"),
    taskCompletionRecordCount: arrayCount(state, "dailyTaskRecords"),
    rewardCount: arrayCount(state, "rewards"),
    specialRewardCount: arrayCount(state, "specialRewards"),
    redemptionCount: arrayCount(state, "redemptions"),
    quickIndicatorCount: arrayCount(state, "templates"),
  };
}

export function forceDeleteConfirmationValid(options: {
  submittedName: unknown;
  familyName: string;
  confirmed: unknown;
  mode: unknown;
}) {
  return options.mode === "force"
    && options.confirmed === true
    && typeof options.submittedName === "string"
    && options.submittedName === options.familyName;
}

export function familyMediaKeysForDeletion(keys: unknown[], familyId: string) {
  const prefix = `families/${familyId}/`;
  return [...new Set(keys.filter((key): key is string => typeof key === "string" && key.startsWith(prefix)))];
}

export function mediaKeysReferencedByFamilyState(raw: string | null | undefined) {
  if (!raw) return [];
  let state: unknown;
  try {
    state = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  const keys = new Set<string>();
  const mediaKeyFromUrl = (value: string) => {
    try {
      const parsed = new URL(value, "https://star-diary.local");
      return parsed.pathname === "/api/media" ? parsed.searchParams.get("key") : null;
    } catch {
      return null;
    }
  };
  const inspect = (value: unknown) => {
    if (typeof value === "string") {
      const key = mediaKeyFromUrl(value);
      if (key) keys.add(key);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(inspect);
      return;
    }
    if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(inspect);
  };
  inspect(state);
  return [...keys];
}
