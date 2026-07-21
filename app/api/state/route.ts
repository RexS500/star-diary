import { env } from "cloudflare:workers";
import {
    addCalendarDays,
    calendarDateRange,
    isCalendarDateKey,
    isTaskScheduled,
    taipeiDateKey,
    taipeiDateKeyAtNoonIso,
    taskSettingsForChild,
    type DailyTaskDefinition,
    type DailyTaskRecord,
    type DailyTaskSettings,
    type DailyTaskSettingsMap,
    type DailyTaskStatus,
} from "../../daily-task-logic";
import {
    createRecoveryToken,
    hashSecret,
    normalizeSecurityAnswer,
    securityLockStatus,
    sha256Hex,
    validatePasswordPair,
    validateSecuritySetup,
    verifySecret,
} from "../../security-logic";
import { calculateChildStarBalance, reconcileChildStarBalances } from "../../star-balance";
import {
    FamilyAccessError,
    assertChildPermission,
    familyAccessErrorResponse,
    getMemberChildPermissions,
    requireFamilyMembership,
    type FamilyAccess,
    type MemberChildPermission,
} from "../../family-access";
import {
    recordFamilyStateDiff,
    recordOperationalError,
    recordOperationalEvent,
    requestTraceId,
} from "../../operations-telemetry";

const initial = {
    children: [],
    entries: [],
    rewards: [],
    specialRewards: [],
    templates: [],
    redemptions: [],
    rewardIconLibrary: [],
    dailyTasks: [],
    dailyTaskRecords: [],
    dailyTaskSettings: {},
    favoriteOfficialTaskIds: [],
    dailyTaskSortMode: "flow",
    passwordHash: "",
    securityQuestionType: "",
    securityQuestionText: "",
    securityAnswerHash: "",
    securityAnswerHint: "",
    securityFailedAttempts: 0,
    securityLockedUntil: "",
    securityResetTokenHash: "",
    securityResetTokenExpiresAt: "",
};

// The persisted legacy JSON intentionally accepts fields introduced by older site versions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>;
type StoredState = JsonRecord & {
    children: JsonRecord[];
    entries: JsonRecord[];
    dailyTasks: DailyTaskDefinition[];
    dailyTaskRecords: DailyTaskRecord[];
    dailyTaskSettings: DailyTaskSettingsMap;
    favoriteOfficialTaskIds: string[];
    dailyTaskSortMode: "flow" | "custom";
    passwordHash: string;
    securityQuestionType: string;
    securityQuestionText: string;
    securityAnswerHash: string;
    securityAnswerHint: string;
    securityFailedAttempts: number;
    securityLockedUntil: string;
    securityResetTokenHash: string;
    securityResetTokenExpiresAt: string;
};
type StateRow = { data: string; updated_at: number };

class ApiError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

const asRecord = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? { ...(value as JsonRecord) } : {};
const imageIdentity = (value: string) => value.replace(/([?&])v=[^&]*/g, "").replace(/[?&]$/, "");
const positiveInt = (value: unknown) => Math.max(1, Math.abs(Math.floor(Number(value) || 1)));
const isPositiveInteger = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 1;
const taskTimeSlots = new Set(["wake_up", "before_breakfast", "before_school", "after_school", "after_dinner", "before_bed", "anytime"]);
const templateTypes = new Set(["star", "deduct", "special"]);
const validDateKey = isCalendarDateKey;
const validIso = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const uniqueWeekdays = (value: unknown) => {
    if (!Array.isArray(value)) return [1, 2, 3, 4, 5, 6, 7];
    return [...new Set(value.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b);
};

function normalizeRewards(value: unknown) {
    return Array.isArray(value) ? value.map(raw => {
        const reward = asRecord(raw), icon = typeof reward.icon === "string" && reward.icon.trim() ? reward.icon : "🎁", image = typeof reward.image === "string" && reward.image.trim() ? reward.image : undefined;
        return image ? { ...reward, icon, image } : { ...reward, icon, image: undefined };
    }) : [];
}

function normalizeTemplates(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map((raw, index) => {
        const template = asRecord(raw), type = templateTypes.has(template.type) ? template.type : "star";
        return {
            ...template,
            id: typeof template.id === "string" && template.id ? template.id : crypto.randomUUID(),
            title: typeof template.title === "string" && template.title.trim() ? template.title.trim() : "新指標",
            amount: positiveInt(template.amount),
            type,
            sortOrder: Number.isFinite(Number(template.sortOrder)) ? Math.floor(Number(template.sortOrder)) : index,
        };
    });
}

function normalizeDailyTasks(value: unknown, childIds: Set<string>) {
    const nowIso = new Date().toISOString(), today = taipeiDateKey();
    if (!Array.isArray(value)) return [];
    return value.map((raw, index) => {
        const task = asRecord(raw), legacyChildId = typeof task.childId === "string" ? task.childId : "";
        const rawApplicable = Array.isArray(task.applicableChildIds) ? task.applicableChildIds : legacyChildId ? [legacyChildId] : [];
        const applicableChildIds = [...new Set(rawApplicable.filter((childId): childId is string => typeof childId === "string" && childIds.has(childId)))];
        const createdAt = validIso(task.createdAt) ? task.createdAt : nowIso;
        return {
            id: typeof task.id === "string" && task.id ? task.id : crypto.randomUUID(),
            applicableChildIds,
            title: typeof task.title === "string" && task.title.trim() ? task.title.trim() : "新任務",
            icon: typeof task.icon === "string" && task.icon.trim() ? task.icon : "⭐",
            rewardStars: positiveInt(task.rewardStars),
            weekdays: uniqueWeekdays(task.weekdays),
            enabled: task.enabled !== false && applicableChildIds.length > 0,
            sortOrder: Number.isFinite(Number(task.sortOrder)) ? Math.floor(Number(task.sortOrder)) : index,
            customOrder: Number.isFinite(Number(task.customOrder)) ? Math.floor(Number(task.customOrder)) : index,
            timeSlot: taskTimeSlots.has(task.timeSlot) ? task.timeSlot : "anytime",
            sourceType: task.sourceType === "official" ? "official" : "custom",
            ...(task.sourceType === "official" && typeof task.sourceOfficialTaskId === "string" && task.sourceOfficialTaskId ? { sourceOfficialTaskId: task.sourceOfficialTaskId } : {}),
            createdAt,
            updatedAt: validIso(task.updatedAt) ? task.updatedAt : createdAt,
            scheduleStart: validDateKey(task.scheduleStart) ? task.scheduleStart : today,
        } satisfies DailyTaskDefinition;
    }).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

function normalizeDailyTaskRecords(value: unknown) {
    const statuses = new Set<DailyTaskStatus>(["pending", "completed", "skipped", "pending_approval"]), nowIso = new Date().toISOString();
    if (!Array.isArray(value)) return [];
    return value.map(raw => {
        const record = asRecord(raw), childId = typeof record.childId === "string" ? record.childId : "", definitionId = typeof record.definitionId === "string" ? record.definitionId : "";
        if (!childId || !definitionId || !validDateKey(record.date)) return null;
        const inferredStatus: DailyTaskStatus = record.completedAt || record.rewardEntryId ? "completed" : record.requestedAt ? "pending_approval" : record.skippedAt ? "skipped" : "pending";
        const status = statuses.has(record.status as DailyTaskStatus) ? record.status as DailyTaskStatus : inferredStatus;
        const normalized: DailyTaskRecord = {
            id: typeof record.id === "string" && record.id ? record.id : crypto.randomUUID(),
            definitionId,
            childId,
            date: record.date,
            titleSnapshot: typeof record.titleSnapshot === "string" && record.titleSnapshot.trim() ? record.titleSnapshot.trim() : "每日任務",
            iconSnapshot: typeof record.iconSnapshot === "string" && record.iconSnapshot.trim() ? record.iconSnapshot : "⭐",
            rewardStarsSnapshot: positiveInt(record.rewardStarsSnapshot),
            status,
            createdAt: validIso(record.createdAt) ? record.createdAt : nowIso,
            updatedAt: validIso(record.updatedAt) ? record.updatedAt : nowIso,
        };
        if (record.goalModeSnapshot === "all" || record.goalModeSnapshot === "percentage" || record.goalModeSnapshot === "count") normalized.goalModeSnapshot = record.goalModeSnapshot;
        if (Number.isFinite(Number(record.goalValueSnapshot))) normalized.goalValueSnapshot = positiveInt(record.goalValueSnapshot);
        for (const key of ["occurredAt", "completedAt", "backfilledAt", "approvedAt", "requestedAt", "skippedAt"] as const) if (validIso(record[key])) normalized[key] = record[key];
        if (record.completedBy === "child" || record.completedBy === "parent") normalized.completedBy = record.completedBy;
        if (typeof record.rewardEntryId === "string" && record.rewardEntryId) normalized.rewardEntryId = record.rewardEntryId;
        return normalized;
    }).filter((record): record is DailyTaskRecord => Boolean(record));
}

function normalizeState(value: unknown): StoredState {
    const state = asRecord(value);
    state.children = Array.isArray(state.children) ? state.children : initial.children;
    state.entries = Array.isArray(state.entries) ? state.entries : [];
    state.templates = normalizeTemplates(state.templates);
    state.redemptions = Array.isArray(state.redemptions) ? state.redemptions : [];
    const legacyRewards = Array.isArray(state.rewards) ? state.rewards : [];
    if (!Array.isArray(state.specialRewards)) {
        state.specialRewards = legacyRewards.filter((reward: JsonRecord) => Number(reward?.stock) > 0).map((reward: JsonRecord) => ({ ...reward, cost: 0 }));
        state.rewards = legacyRewards.filter((reward: JsonRecord) => Number(reward?.cost) > 0).map((reward: JsonRecord) => ({ ...reward, stock: 0 }));
    }
    state.rewards = normalizeRewards(state.rewards);
    state.specialRewards = normalizeRewards(state.specialRewards);
    const library: JsonRecord[] = [], seen = new Set<string>();
    const addAsset = (raw: unknown, fallbackName = "自訂圖片") => {
        const asset = asRecord(raw), image = typeof asset.image === "string" && asset.image.trim() ? asset.image.trim() : "", identity = imageIdentity(image);
        if (!image || seen.has(identity)) return;
        seen.add(identity);
        library.push({ id: typeof asset.id === "string" && asset.id ? asset.id : crypto.randomUUID(), name: typeof asset.name === "string" && asset.name.trim() ? asset.name.trim() : fallbackName, image, ...(typeof asset.hash === "string" && asset.hash ? { hash: asset.hash } : {}), ...(validIso(asset.createdAt) ? { createdAt: asset.createdAt } : {}) });
    };
    if (Array.isArray(state.rewardIconLibrary)) for (const asset of state.rewardIconLibrary) addAsset(asset);
    for (const reward of [...state.rewards, ...state.specialRewards]) if (typeof reward.image === "string" && reward.image) addAsset({ image: reward.image, name: `${typeof reward.name === "string" && reward.name.trim() ? reward.name.trim() : "獎品"}圖片` });
    state.rewardIconLibrary = library;

    const childIds = new Set<string>(state.children.map((child: JsonRecord) => child.id).filter((id: unknown): id is string => typeof id === "string"));
    state.dailyTasks = normalizeDailyTasks(state.dailyTasks, childIds);
    state.dailyTaskRecords = normalizeDailyTaskRecords(state.dailyTaskRecords);
    const rawSettings = asRecord(state.dailyTaskSettings), settings: DailyTaskSettingsMap = {};
    for (const childId of childIds) settings[childId] = taskSettingsForChild(rawSettings as DailyTaskSettingsMap, childId);
    state.dailyTaskSettings = settings;
    state.favoriteOfficialTaskIds = Array.isArray(state.favoriteOfficialTaskIds) ? [...new Set(state.favoriteOfficialTaskIds.filter((id:unknown):id is string=>typeof id === "string" && Boolean(id)))] : [];
    state.dailyTaskSortMode = state.dailyTaskSortMode === "custom" ? "custom" : "flow";
    const goalByDay = new Map<string, { goalMode: DailyTaskSettings["goalMode"]; goalValue: number }>();
    const normalizedRecords: DailyTaskRecord[] = (state.dailyTaskRecords as DailyTaskRecord[]).map(record => {
        const key = `${record.childId}|${record.date}`, existing = goalByDay.get(key), childSettings = taskSettingsForChild(settings, record.childId);
        const goalMode = record.goalModeSnapshot || existing?.goalMode || childSettings.goalMode, goalValue = record.goalValueSnapshot || existing?.goalValue || childSettings.goalValue;
        goalByDay.set(key, { goalMode, goalValue });
        return { ...record, goalModeSnapshot: goalMode, goalValueSnapshot: goalValue };
    });
    const statusPriority: Record<DailyTaskStatus, number> = { pending: 1, skipped: 2, pending_approval: 3, completed: 4 }, recordsByKey = new Map<string, DailyTaskRecord>();
    for (const record of normalizedRecords) {
        const key = dailyRecordKey(record), current = recordsByKey.get(key);
        if (!current || statusPriority[record.status] > statusPriority[current.status] || statusPriority[record.status] === statusPriority[current.status] && record.updatedAt > current.updatedAt) recordsByKey.set(key, record);
    }
    state.dailyTaskRecords = [...recordsByKey.values()];
    state.passwordHash = typeof state.passwordHash === "string" ? state.passwordHash : "";
    state.securityQuestionType = typeof state.securityQuestionType === "string" ? state.securityQuestionType : "";
    state.securityQuestionText = typeof state.securityQuestionText === "string" ? state.securityQuestionText : "";
    state.securityAnswerHash = typeof state.securityAnswerHash === "string" ? state.securityAnswerHash : "";
    state.securityAnswerHint = typeof state.securityAnswerHint === "string" ? state.securityAnswerHint : "";
    state.securityFailedAttempts = Number.isFinite(Number(state.securityFailedAttempts)) ? Math.max(0, Math.floor(Number(state.securityFailedAttempts))) : 0;
    state.securityLockedUntil = validIso(state.securityLockedUntil) ? state.securityLockedUntil : "";
    state.securityResetTokenHash = typeof state.securityResetTokenHash === "string" ? state.securityResetTokenHash : "";
    state.securityResetTokenExpiresAt = validIso(state.securityResetTokenExpiresAt) ? state.securityResetTokenExpiresAt : "";
    state.children = reconcileChildStarBalances(state.children, state.entries, state.redemptions);
    return state as StoredState;
}

function materializeDailyTaskRecords(state: StoredState, throughDate = taipeiDateKey()) {
    const existing = new Set(state.dailyTaskRecords.map(record => `${record.definitionId}|${record.childId}|${record.date}`)), goals = new Map<string, { goalMode: DailyTaskSettings["goalMode"]; goalValue: number }>(), nowIso = new Date().toISOString(), additions: DailyTaskRecord[] = [];
    for (const record of state.dailyTaskRecords) if (record.goalModeSnapshot && Number.isFinite(record.goalValueSnapshot)) goals.set(`${record.childId}|${record.date}`, { goalMode: record.goalModeSnapshot, goalValue: Number(record.goalValueSnapshot) });
    for (const task of state.dailyTasks) {
        if (!task.enabled || task.scheduleStart > throughDate) continue;
        for (const childId of task.applicableChildIds) for (const date of calendarDateRange(task.scheduleStart, throughDate)) {
            const key = `${task.id}|${childId}|${date}`;
            if (existing.has(key) || !isTaskScheduled(task, date)) continue;
            existing.add(key);
            const goalKey = `${childId}|${date}`, childSettings = taskSettingsForChild(state.dailyTaskSettings, childId), goal = goals.get(goalKey) || { goalMode: childSettings.goalMode, goalValue: childSettings.goalValue };
            goals.set(goalKey, goal);
            additions.push({ id: crypto.randomUUID(), definitionId: task.id, childId, date, titleSnapshot: task.title, iconSnapshot: task.icon, rewardStarsSnapshot: task.rewardStars, goalModeSnapshot: goal.goalMode, goalValueSnapshot: goal.goalValue, status: "pending", createdAt: nowIso, updatedAt: nowIso });
        }
    }
    if (additions.length) state.dailyTaskRecords = [...additions, ...state.dailyTaskRecords];
    return state;
}

function prepareTaskDefinitionsForSave(previous: DailyTaskDefinition[], incoming: DailyTaskDefinition[]) {
    const oldById = new Map(previous.map(task => [task.id, task])), nowIso = new Date().toISOString(), today = taipeiDateKey();
    return incoming.map((task, index) => {
        const old = oldById.get(task.id);
        if (!old) return { ...task, sortOrder: index, createdAt: nowIso, updatedAt: nowIso, scheduleStart: today };
        const applicabilityChanged = old.applicableChildIds.join(",") !== task.applicableChildIds.join(",");
        const scheduleChanged = old.enabled !== task.enabled || old.weekdays.join(",") !== task.weekdays.join(",") || applicabilityChanged;
        const changed = scheduleChanged || old.title !== task.title || old.icon !== task.icon || old.rewardStars !== task.rewardStars || old.sortOrder !== index || old.customOrder !== task.customOrder || old.timeSlot !== task.timeSlot;
        return { ...task, sortOrder: index, createdAt: old.createdAt, scheduleStart: scheduleChanged && task.enabled ? today : old.scheduleStart, updatedAt: changed ? nowIso : old.updatedAt };
    });
}

function reconcileTodayPendingRecords(state: StoredState) {
    const today = taipeiDateKey(), definitions = new Map(state.dailyTasks.map(task => [task.id, task])), nowIso = new Date().toISOString();
    state.dailyTaskRecords = state.dailyTaskRecords.flatMap(record => {
        if (record.date !== today || record.status !== "pending") return [record];
        const task = definitions.get(record.definitionId);
        if (!task || !task.applicableChildIds.includes(record.childId) || !isTaskScheduled(task, today)) return [];
        return [{ ...record, titleSnapshot: task.title, iconSnapshot: task.icon, rewardStarsSnapshot: task.rewardStars, updatedAt: nowIso }];
    });
}

async function setup(familyId: string): Promise<{ state: StoredState; revision: number }> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        let row = await env.DB.prepare("SELECT data, updated_at FROM family_state WHERE family_id = ?").bind(familyId).first<StateRow>();
        if (!row) {
            const state = materializeDailyTaskRecords(normalizeState(initial)), revision = Date.now();
            await env.DB.prepare("INSERT OR IGNORE INTO family_state (family_id,data,updated_at) VALUES (?,?,?)").bind(familyId, JSON.stringify(state), revision).run();
            row = await env.DB.prepare("SELECT data, updated_at FROM family_state WHERE family_id = ?").bind(familyId).first<StateRow>();
            if (!row) continue;
        }
        const state = materializeDailyTaskRecords(normalizeState(JSON.parse(row.data))), serialized = JSON.stringify(state);
        if (serialized === row.data) return { state, revision: Number(row.updated_at) };
        const revision = Math.max(Date.now(), Number(row.updated_at) + 1), result = await env.DB.prepare("UPDATE family_state SET data=?,updated_at=? WHERE family_id=? AND updated_at=?").bind(serialized, revision, familyId, row.updated_at).run();
        if (Number(result.meta.changes || 0) === 1) return { state, revision };
    }
    throw new ApiError("資料正在被其他裝置更新，請稍後再試", 409);
}

async function writeState(state: StoredState, previousRevision: number, familyId: string) {
    const normalized = materializeDailyTaskRecords(normalizeState(state)), revision = Math.max(Date.now(), previousRevision + 1);
    const result = await env.DB.prepare("UPDATE family_state SET data=?,updated_at=? WHERE family_id=? AND updated_at=?").bind(JSON.stringify(normalized), revision, familyId, previousRevision).run();
    if (Number(result.meta.changes || 0) !== 1) throw new ApiError("資料已被其他裝置更新，請重新整理後再操作", 409);
    return { state: normalized, revision };
}

async function mutateState(familyId: string, mutator: (state: StoredState) => Promise<boolean | void> | boolean | void) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await setup(familyId), changed = await mutator(current.state);
        if (changed === false) return setup(familyId);
        try { return await writeState(current.state, current.revision, familyId); }
        catch (error) { if (!(error instanceof ApiError) || error.status !== 409 || attempt === 2) throw error; }
    }
    throw new ApiError("資料正在被其他裝置更新，請稍後再試", 409);
}

async function requireParent(state: StoredState, password = "") {
    if (state.passwordHash && !await verifySecret(password, state.passwordHash)) throw new ApiError("密碼錯誤", 403);
}

async function requireOriginalParentPassword(state: StoredState, password = "") {
    if (!state.passwordHash || !await verifySecret(password, state.passwordHash)) throw new ApiError("原始密碼不正確", 403);
}

function safePayload(state: StoredState, revision: number, extra: JsonRecord = {}) {
    const safe: JsonRecord = { ...state };
    delete safe.passwordHash;
    delete safe.securityAnswerHash;
    delete safe.securityFailedAttempts;
    delete safe.securityLockedUntil;
    delete safe.securityResetTokenHash;
    delete safe.securityResetTokenExpiresAt;
    const lock = securityLockStatus(state.securityFailedAttempts, state.securityLockedUntil);
    return {
        ok: true,
        state: safe,
        passwordSet: Boolean(state.passwordHash),
        security: {
            configured: Boolean(state.securityAnswerHash && state.securityQuestionText),
            questionType: state.securityQuestionType,
            questionText: state.securityQuestionText,
            hint: state.securityAnswerHint,
            ...(lock.lockedUntil ? { lockedUntil: lock.lockedUntil } : {}),
        },
        revision,
        ...extra,
    };
}

function stateForFamilyAccess(
    state: StoredState,
    family: FamilyAccess,
    permissions: MemberChildPermission[],
) {
    if (family.role !== "child") return state;
    const visibleChildIds = new Set(
        permissions.filter(permission => permission.canView).map(permission => permission.childId),
    );
    const safe = { ...state } as StoredState;
    safe.children = state.children.filter(child => visibleChildIds.has(String(child.id)));
    safe.entries = state.entries.filter(entry => visibleChildIds.has(String(entry.childId)));
    safe.redemptions = state.redemptions.filter((redemption: JsonRecord) => visibleChildIds.has(String(redemption.childId)));
    safe.dailyTaskRecords = state.dailyTaskRecords.filter(record => visibleChildIds.has(record.childId));
    safe.dailyTasks = state.dailyTasks.flatMap(task => {
        const applicableChildIds = task.applicableChildIds.filter(childId => visibleChildIds.has(childId));
        return applicableChildIds.length ? [{ ...task, applicableChildIds }] : [];
    });
    safe.dailyTaskSettings = Object.fromEntries(
        Object.entries(state.dailyTaskSettings).filter(([childId]) => visibleChildIds.has(childId)),
    );
    // Child accounts never receive parent-only quick actions or settings-only asset metadata.
    safe.templates = [];
    safe.rewardIconLibrary = [];
    safe.favoriteOfficialTaskIds = [];
    return safe;
}

function accessPayload(
    state: StoredState,
    revision: number,
    family: FamilyAccess,
    permissions: MemberChildPermission[],
    extra: JsonRecord = {},
) {
    const payload = safePayload(stateForFamilyAccess(state, family, permissions), revision, extra);
    if (family.role === "child") {
        payload.security = { configured: false, questionType: "", questionText: "", hint: "" };
    }
    return {
        ...payload,
        access: {
            role: family.role,
            boundChildId: family.boundChildId,
            childAccountMode: family.childAccountMode,
            permissions,
        },
    };
}

function requireFamilyManager(family: FamilyAccess) {
    if (family.role !== "owner" && family.role !== "parent") {
        throw new FamilyAccessError("孩子帳號無法修改家庭設定或新增星星紀錄", 403);
    }
}

const dailyRecordKey = (record: Pick<DailyTaskRecord, "definitionId" | "childId" | "date">) => `${record.definitionId}|${record.childId}|${record.date}`;

function isActiveTaskEntry(entry: JsonRecord, record: DailyTaskRecord) {
    return entry.sourceType === "daily_task" && entry.sourceId === record.id && entry.childId === record.childId && entry.type === "star" && positiveInt(entry.amount) === positiveInt(record.rewardStarsSnapshot) && (entry.status === undefined || entry.status === "completed");
}

function findActiveTaskEntry(state: StoredState, record: DailyTaskRecord) {
    const byId = record.rewardEntryId ? state.entries.find(entry => entry.id === record.rewardEntryId && isActiveTaskEntry(entry, record)) : undefined;
    return byId || state.entries.find(entry => isActiveTaskEntry(entry, record));
}

function completeDailyTask(state: StoredState, record: DailyTaskRecord, actor: "child" | "parent", options: { backfilled?: boolean } = {}) {
    if (record.status === "completed") return false;
    if (record.status === "skipped") throw new ApiError("請先將任務恢復為待完成", 409);
    const duplicate = state.dailyTaskRecords.find(item => item.id !== record.id && dailyRecordKey(item) === dailyRecordKey(record) && (item.status === "completed" || item.status === "pending_approval"));
    if (duplicate) throw new ApiError("今天這項任務已經送出或完成，請先刷新頁面", 409);
    const existing = findActiveTaskEntry(state, record);
    const nowIso = new Date().toISOString();
    const historical = record.date < taipeiDateKey();
    const occurredAt = historical ? taipeiDateKeyAtNoonIso(record.date) : nowIso;
    if (!occurredAt) throw new ApiError("任務日期不正確，請刷新後再試", 409);
    if (existing) {
        existing.occurredAt = occurredAt;
        existing.date = new Date(occurredAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
        existing.createdAt = validIso(existing.createdAt) ? existing.createdAt : nowIso;
        record.status = "completed";
        record.rewardEntryId = existing.id;
        record.occurredAt = occurredAt;
        record.completedAt = record.completedAt || nowIso;
        if (options.backfilled) record.backfilledAt = nowIso;
        record.approvedAt = nowIso;
        record.completedBy = actor;
        record.updatedAt = nowIso;
        delete record.requestedAt;
        delete record.skippedAt;
        return true;
    }
    const entry = { id: crypto.randomUUID(), childId: record.childId, title: `每日任務：${record.titleSnapshot}`, amount: positiveInt(record.rewardStarsSnapshot), type: "star", date: new Date(occurredAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }), occurredAt, createdAt: nowIso, status: "completed", sourceType: "daily_task", sourceId: record.id };
    const child = state.children.find(item => item.id === record.childId);
    if (!child) throw new ApiError("找不到孩子資料", 404);
    state.entries = [entry, ...state.entries];
    record.status = "completed";
    record.occurredAt = occurredAt;
    record.completedAt = nowIso;
    if (options.backfilled) record.backfilledAt = nowIso;
    record.approvedAt = nowIso;
    record.completedBy = actor;
    record.rewardEntryId = entry.id;
    record.updatedAt = nowIso;
    delete record.requestedAt;
    delete record.skippedAt;
    return true;
}

async function recordDailyTaskCompletionEvents(state: StoredState, recordId: string | undefined, family: FamilyAccess, source: string) {
    const completedRecord = state.dailyTaskRecords.find(item => item.id === recordId);
    if (completedRecord?.status !== "completed") return;
    await recordOperationalEvent({
        eventType: "daily_task_completed",
        familyId: family.familyId,
        userId: family.user.id,
        source,
        dedupeKey: `state-daily-task:${family.familyId}:${completedRecord.id}:completed`,
        occurredAt: completedRecord.occurredAt || completedRecord.completedAt,
    });
    const rewardEntry = state.entries.find(entry => entry.id === completedRecord.rewardEntryId);
    if (rewardEntry) await recordOperationalEvent({
        eventType: "star_add",
        familyId: family.familyId,
        userId: family.user.id,
        amount: positiveInt(rewardEntry.amount),
        source: "daily_task",
        dedupeKey: `state-entry:${family.familyId}:${rewardEntry.id}:completed`,
        occurredAt: rewardEntry.occurredAt,
    });
}

export async function GET() {
    try {
        const family = await requireFamilyMembership("read");
        const { familyId } = family;
        const permissions = await getMemberChildPermissions(family);
        const { state, revision } = await setup(familyId);
        return Response.json(accessPayload(state, revision, family, permissions), { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
    } catch (error) {
        if (error instanceof FamilyAccessError) return familyAccessErrorResponse(error);
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: error instanceof ApiError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
    }
}

export async function POST(req: Request) {
    let traceFamilyId: string | null = null;
    let traceUserId: string | null = null;
    try {
        const family = await requireFamilyMembership("read");
        const { familyId } = family;
        traceFamilyId = familyId;
        traceUserId = family.user.id;
        const permissions = await getMemberChildPermissions(family);
        const body = await req.json() as {
            action: string;
            password?: string;
            currentPassword?: string;
            newPassword?: string;
            confirmPassword?: string;
            securityQuestionType?: string;
            securityQuestionText?: string;
            securityAnswer?: string;
            confirmSecurityAnswer?: string;
            securityAnswerHint?: string;
            recoveryToken?: string;
            state?: Record<string, unknown>;
            record?: Record<string, unknown>;
            recordId?: string;
            childId?: string;
            operation?: string;
            expectedRevision?: number;
        };

        const childAccountActions = new Set(["child_redemption", "child_daily_task_complete"]);
        if (family.role === "child" && !childAccountActions.has(body.action)) requireFamilyManager(family);

        if (body.action === "set_parent_password") {
            const passwordError = validatePasswordPair(body.newPassword || "", body.confirmPassword || "");
            if (passwordError) throw new ApiError(passwordError, 400);
            const result = await mutateState(familyId, async state => {
                if (state.passwordHash) throw new ApiError("家長密碼已設定，請使用修改密碼功能", 409);
                state.passwordHash = await hashSecret(body.newPassword || "");
                state.securityQuestionType = "";
                state.securityQuestionText = "";
                state.securityAnswerHash = "";
                state.securityAnswerHint = "";
                state.securityFailedAttempts = 0;
                state.securityLockedUntil = "";
                state.securityResetTokenHash = "";
                state.securityResetTokenExpiresAt = "";
            });
            return Response.json(accessPayload(result.state, result.revision, family, permissions));
        }

        if (body.action === "change_parent_password") {
            const passwordError = validatePasswordPair(body.newPassword || "", body.confirmPassword || "", body.currentPassword || "");
            if (passwordError) throw new ApiError(passwordError, 400);
            const result = await mutateState(familyId, async state => {
                if (!state.passwordHash) throw new ApiError("尚未設定家長密碼", 409);
                await requireOriginalParentPassword(state, body.currentPassword || "");
                state.passwordHash = await hashSecret(body.newPassword || "");
                state.securityResetTokenHash = "";
                state.securityResetTokenExpiresAt = "";
            });
            return Response.json(accessPayload(result.state, result.revision, family, permissions));
        }

        if (body.action === "update_security_question") {
            const securityError = validateSecuritySetup(body.securityQuestionType || "", body.securityQuestionText || "", body.securityAnswer || "", body.confirmSecurityAnswer || "");
            if (securityError) throw new ApiError(securityError, 400);
            const securityQuestionText = body.securityQuestionText?.trim();
            if (!securityQuestionText) throw new ApiError("請選擇安全提示問題", 400);
            const result = await mutateState(familyId, async state => {
                if (!state.passwordHash) throw new ApiError("請先設定家長密碼", 409);
                await requireOriginalParentPassword(state, body.currentPassword || "");
                state.securityQuestionType = body.securityQuestionType || "";
                state.securityQuestionText = securityQuestionText;
                state.securityAnswerHash = await hashSecret(normalizeSecurityAnswer(body.securityAnswer || ""));
                state.securityAnswerHint = body.securityAnswerHint?.trim() || "";
                state.securityFailedAttempts = 0;
                state.securityLockedUntil = "";
                state.securityResetTokenHash = "";
                state.securityResetTokenExpiresAt = "";
            });
            return Response.json(accessPayload(result.state, result.revision, family, permissions));
        }

        if (body.action === "verify_security_answer") {
            let recoveryToken = "", answerCorrect = false, lockedAfterFailure = false;
            const result = await mutateState(familyId, async state => {
                if (!state.passwordHash || !state.securityAnswerHash || !state.securityQuestionText) throw new ApiError("目前尚未設定安全提示問題，無法使用此方式重設密碼。", 409);
                const lock = securityLockStatus(state.securityFailedAttempts, state.securityLockedUntil);
                if (lock.locked) throw new ApiError("嘗試次數過多，請稍後再試", 429);
                answerCorrect = await verifySecret(normalizeSecurityAnswer(body.securityAnswer || ""), state.securityAnswerHash);
                if (!answerCorrect) {
                    state.securityFailedAttempts += 1;
                    if (state.securityFailedAttempts >= 5) {
                        state.securityLockedUntil = new Date(Date.now() + 5 * 60_000).toISOString();
                        lockedAfterFailure = true;
                    }
                    return true;
                }
                recoveryToken = createRecoveryToken();
                state.securityResetTokenHash = await sha256Hex(recoveryToken);
                state.securityResetTokenExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
                state.securityFailedAttempts = 0;
                state.securityLockedUntil = "";
                return true;
            });
            if (!answerCorrect) throw new ApiError(lockedAfterFailure ? "嘗試次數過多，請稍後再試" : "答案不正確，請再試一次", lockedAfterFailure ? 429 : 403);
            return Response.json(accessPayload(result.state, result.revision, family, permissions, { recoveryToken }));
        }

        if (body.action === "reset_parent_password") {
            const passwordError = validatePasswordPair(body.newPassword || "", body.confirmPassword || "");
            if (passwordError) throw new ApiError(passwordError, 400);
            const result = await mutateState(familyId, async state => {
                if (!state.securityResetTokenHash || !validIso(state.securityResetTokenExpiresAt) || Date.parse(state.securityResetTokenExpiresAt) <= Date.now()) throw new ApiError("重設連結已失效，請重新驗證安全問題", 403);
                if (!body.recoveryToken || await sha256Hex(body.recoveryToken) !== state.securityResetTokenHash) throw new ApiError("重設驗證失效，請重新驗證安全問題", 403);
                if (state.passwordHash && await verifySecret(body.newPassword || "", state.passwordHash)) throw new ApiError("新密碼不可與原始密碼相同", 400);
                state.passwordHash = await hashSecret(body.newPassword || "");
                state.securityResetTokenHash = "";
                state.securityResetTokenExpiresAt = "";
                state.securityFailedAttempts = 0;
                state.securityLockedUntil = "";
            });
            return Response.json(accessPayload(result.state, result.revision, family, permissions));
        }

        if (body.action === "child_entry") {
            requireFamilyManager(family);
            const submitted = body.record;
            if (!submitted || submitted.status !== "pending" || submitted.sourceType || submitted.sourceId || submitted.revokedAt || submitted.occurredAt) throw new ApiError("不正確的孩子紀錄", 400);
            const type = submitted.type === "deduct" || submitted.type === "special" ? submitted.type : submitted.type === "star" ? "star" : null;
            if (!type || typeof submitted.childId !== "string" || typeof submitted.title !== "string" || !submitted.title.trim()) throw new ApiError("紀錄內容不完整", 400);
            const nowIso = new Date().toISOString(), record = { id: typeof submitted.id === "string" && submitted.id ? submitted.id : crypto.randomUUID(), childId: submitted.childId, title: submitted.title.trim(), amount: positiveInt(submitted.amount), type, date: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }), occurredAt: nowIso, createdAt: nowIso, status: "pending" };
            const result = await mutateState(familyId, state => {
                if (!state.children.some(child => child.id === record.childId)) throw new ApiError("找不到孩子資料", 404);
                if (state.entries.some(entry => entry.id === record.id)) return false;
                state.entries = [record, ...state.entries];
            });
            return Response.json(accessPayload(result.state, result.revision, family, permissions));
        }

        if (body.action === "child_redemption") {
            const record = body.record;
            if (!record || record.status !== "pending") throw new ApiError("不正確的兌換申請", 400);
            if (typeof record.childId !== "string") throw new ApiError("兌換申請缺少孩子資料", 400);
            await assertChildPermission(family, record.childId, "operate");
            const result = await mutateState(familyId, state => {
                if (!state.children.some(child => child.id === record.childId)) throw new ApiError("找不到孩子資料", 404);
                if (state.redemptions.some((item: JsonRecord) => item.id === record.id)) return false;
                state.redemptions = [record, ...state.redemptions];
            });
            return Response.json(accessPayload(result.state, result.revision, family, permissions));
        }

        if (body.action === "child_daily_task_complete") {
            if (!body.childId) throw new ApiError("任務缺少孩子資料", 400);
            await assertChildPermission(family, body.childId, "operate");
            const result = await mutateState(familyId, state => {
                const today = taipeiDateKey(), record = state.dailyTaskRecords.find(item => item.id === body.recordId && item.childId === body.childId && item.date === today);
                if (!record) throw new ApiError("找不到今天的任務，請刷新後再試", 404);
                if (record.status === "completed" || record.status === "pending_approval") return false;
                if (record.status === "skipped") throw new ApiError("這項任務今天已標記為不適用", 409);
                const duplicate = state.dailyTaskRecords.find(item => item.id !== record.id && dailyRecordKey(item) === dailyRecordKey(record) && (item.status === "completed" || item.status === "pending_approval"));
                if (duplicate) throw new ApiError("今天這項任務已經送出或完成，請先刷新頁面", 409);
                const settings = taskSettingsForChild(state.dailyTaskSettings, record.childId), nowIso = new Date().toISOString();
                if (settings.completionMode === "approval") {
                    record.status = "pending_approval";
                    record.requestedAt = nowIso;
                    record.completedBy = "child";
                    record.updatedAt = nowIso;
                    return true;
                }
                return completeDailyTask(state, record, "child");
            });
            await recordDailyTaskCompletionEvents(result.state, body.recordId, family, "child");
            return Response.json(accessPayload(result.state, result.revision, family, permissions));
        }

        if (body.action === "parent_daily_task_backfill") {
            requireFamilyManager(family);
            const yesterday = addCalendarDays(taipeiDateKey(), -1);
            const result = await mutateState(familyId, async state => {
                await requireParent(state, body.password || "");
                const record = state.dailyTaskRecords.find(item => item.id === body.recordId && item.childId === body.childId && item.date === yesterday);
                if (!record) throw new ApiError("找不到昨天的任務，請刷新後再試", 404);
                if (record.status === "completed") throw new ApiError("昨天這項任務已經完成，不能重複補登", 409);
                if (record.status === "skipped") throw new ApiError("這項任務已標記為昨天不適用", 409);
                return completeDailyTask(state, record, "parent", { backfilled: true });
            });
            await recordDailyTaskCompletionEvents(result.state, body.recordId, family, "parent_backfill");
            return Response.json(accessPayload(result.state, result.revision, family, permissions));
        }

        if (body.action === "parent_daily_task_action") {
            requireFamilyManager(family);
            const result = await mutateState(familyId, async state => {
                await requireParent(state, body.password || "");
                const record = state.dailyTaskRecords.find(item => item.id === body.recordId);
                if (!record) throw new ApiError("找不到任務紀錄，請刷新後再試", 404);
                const nowIso = new Date().toISOString();
                if (body.operation === "complete") {
                    if (record.date !== taipeiDateKey()) throw new ApiError("歷史任務請使用昨天補登功能", 409);
                    if (record.status !== "pending") throw new ApiError("只有尚未完成的任務可以由家長標記完成", 409);
                    return completeDailyTask(state, record, "parent");
                }
                if (body.operation === "approve") {
                    if (record.status !== "pending_approval") throw new ApiError("這筆任務目前不在等待確認狀態", 409);
                    return completeDailyTask(state, record, "parent");
                }
                if (body.operation === "reject") {
                    if (record.status !== "pending_approval") return false;
                    record.status = "pending"; record.updatedAt = nowIso; delete record.requestedAt; delete record.completedBy; return true;
                }
                if (body.operation === "skip") {
                    if (record.status === "completed") throw new ApiError("請先撤銷完成，再標記今日不適用", 409);
                    if (record.status === "skipped") return false;
                    record.status = "skipped"; record.skippedAt = nowIso; record.updatedAt = nowIso; delete record.requestedAt; delete record.completedBy; return true;
                }
                if (body.operation === "restore") {
                    if (record.status !== "skipped") return false;
                    record.status = "pending"; record.updatedAt = nowIso; delete record.skippedAt; return true;
                }
                if (body.operation === "undo") {
                    if (record.status === "pending_approval") { record.status = "pending"; record.updatedAt = nowIso; delete record.requestedAt; delete record.completedBy; return true; }
                    if (record.status !== "completed") return false;
                    const entry = findActiveTaskEntry(state, record), child = state.children.find(item => item.id === record.childId);
                    if (!entry || !child) throw new ApiError("找不到對應的星星紀錄", 409);
                    const amount = positiveInt(entry.amount),balance=calculateChildStarBalance(state.entries,state.redemptions,record.childId);
                    if (balance.total < amount) throw new ApiError(`目前星星不足以撤銷，請先補回 ${amount - balance.total} 顆`, 409);
                    entry.status = "revoked";
                    entry.revokedAt = nowIso;
                    record.status = "pending";
                    record.updatedAt = nowIso;
                    delete record.occurredAt; delete record.completedAt; delete record.backfilledAt; delete record.approvedAt; delete record.completedBy; delete record.rewardEntryId;
                    return true;
                }
                throw new ApiError("不支援的任務操作", 400);
            });
            if (body.operation === "complete" || body.operation === "approve") await recordDailyTaskCompletionEvents(result.state, body.recordId, family, "parent");
            return Response.json(accessPayload(result.state, result.revision, family, permissions));
        }

        requireFamilyManager(family);
        const current = await setup(familyId);
        await requireParent(current.state, body.password || "");
        if (body.action === "verify") return Response.json({ ok: true, revision: current.revision });
        if (body.action !== "save" || !body.state) throw new ApiError("不正確的儲存內容", 400);
        if (!Number.isFinite(body.expectedRevision)) throw new ApiError("這個頁面版本過舊，請重新整理後再儲存", 428);
        if (Number(body.expectedRevision) !== current.revision) throw new ApiError("資料已被其他裝置更新，已為您保留最新版本，請重新整理後再儲存", 409);
        if (Array.isArray(body.state.entries)) {
            for (const raw of body.state.entries) {
                const entry = asRecord(raw);
                if (entry.occurredAt !== undefined && (!validIso(entry.occurredAt) || Date.parse(entry.occurredAt) > Date.now())) throw new ApiError("紀錄時間不可晚於現在", 400);
            }
        }
        if (Array.isArray(body.state.dailyTasks)) {
            const submittedChildren = Array.isArray(body.state.children) ? body.state.children : current.state.children;
            const validChildIds = new Set(submittedChildren.map(raw => asRecord(raw).id).filter((id): id is string => typeof id === "string" && Boolean(id)));
            for (const raw of body.state.dailyTasks) {
                const task = asRecord(raw), legacyChildId = typeof task.childId === "string" ? task.childId : "";
                const applicable = Array.isArray(task.applicableChildIds) ? task.applicableChildIds : legacyChildId ? [legacyChildId] : [];
                if (task.enabled !== false && !applicable.some(childId => typeof childId === "string" && validChildIds.has(childId))) throw new ApiError("啟用的每日任務請至少選擇一位適用孩子", 400);
                if (task.enabled !== false && uniqueWeekdays(task.weekdays).length === 0) throw new ApiError("啟用的每日任務請至少選擇一個執行星期", 400);
                if (!isPositiveInteger(task.rewardStars)) throw new ApiError("每日任務獎勵必須是至少 1 的整數", 400);
            }
        }
        if (Array.isArray(body.state.children)) {
            const submittedChildIds = new Set(body.state.children.map(raw => asRecord(raw).id).filter((id): id is string => typeof id === "string" && Boolean(id)));
            const [boundMembersResult] = await env.DB.batch([env.DB.prepare(
                "SELECT child_id FROM family_members WHERE family_id = ? AND role = 'child' AND status = 'active' AND child_id IS NOT NULL",
            ).bind(familyId)]);
            const boundMembers = boundMembersResult.results as Array<{ child_id: string }>;
            if (boundMembers.some(member => !submittedChildIds.has(member.child_id))) {
                throw new ApiError("這位孩子仍綁定孩子帳號，請先在帳號管理移除該成員", 409);
            }
        }
        if (Array.isArray(body.state.rewards) && body.state.rewards.some(raw => !isPositiveInteger(asRecord(raw).cost))) throw new ApiError("獎品需要星星必須是至少 1 的整數", 400);
        if (Array.isArray(body.state.templates) && body.state.templates.some(raw => !isPositiveInteger(asRecord(raw).amount))) throw new ApiError("快速指標數量必須是至少 1 的整數", 400);
        if (body.state.dailyTaskSettings && typeof body.state.dailyTaskSettings === "object") {
            for (const raw of Object.values(asRecord(body.state.dailyTaskSettings))) {
                const setting = asRecord(raw), maximum = setting.goalMode === "percentage" ? 100 : Number.MAX_SAFE_INTEGER;
                if (!isPositiveInteger(setting.goalValue) || setting.goalValue > maximum) throw new ApiError(setting.goalMode === "percentage" ? "每日完成率必須是 1 到 100 的整數" : "每日達標數量必須是至少 1 的整數", 400);
            }
        }
        const next = normalizeState({
            ...current.state,
            ...body.state,
            passwordHash: current.state.passwordHash,
            securityQuestionType: current.state.securityQuestionType,
            securityQuestionText: current.state.securityQuestionText,
            securityAnswerHash: current.state.securityAnswerHash,
            securityAnswerHint: current.state.securityAnswerHint,
            securityFailedAttempts: current.state.securityFailedAttempts,
            securityLockedUntil: current.state.securityLockedUntil,
            securityResetTokenHash: current.state.securityResetTokenHash,
            securityResetTokenExpiresAt: current.state.securityResetTokenExpiresAt,
        });
        next.dailyTasks = prepareTaskDefinitionsForSave(current.state.dailyTasks, next.dailyTasks);
        reconcileTodayPendingRecords(next);
        const saved = await writeState(next, current.revision, familyId);
        await recordFamilyStateDiff({
            before: current.state,
            after: saved.state,
            familyId,
            userId: family.user.id,
        });
        return Response.json(accessPayload(saved.state, saved.revision, family, permissions));
    } catch (error) {
        if (error instanceof FamilyAccessError) return familyAccessErrorResponse(error);
        if (!(error instanceof ApiError) || error.status >= 500) {
            await recordOperationalError({
                category: "state_api_error",
                error,
                route: "/api/state",
                method: "POST",
                statusCode: error instanceof ApiError ? error.status : 500,
                familyId: traceFamilyId,
                userId: traceUserId,
                requestId: requestTraceId(req),
            });
        }
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: error instanceof ApiError ? error.status : 500 });
    }
}
