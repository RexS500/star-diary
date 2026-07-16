import { env } from "cloudflare:workers";
import {
    calendarDateRange,
    isCalendarDateKey,
    isTaskScheduled,
    taipeiDateKey,
    taskSettingsForChild,
    type DailyTaskDefinition,
    type DailyTaskRecord,
    type DailyTaskSettings,
    type DailyTaskSettingsMap,
    type DailyTaskStatus,
} from "../../daily-task-logic";

const initial = {
    children: [{ id: "c1", name: "小宇", gender: "boy", avatar: "boy", stars: 0 }],
    entries: [],
    rewards: [{ id: "r1", icon: "🍦", name: "冰淇淋", cost: 12, stock: 0 }, { id: "r2", icon: "🎮", name: "遊戲 30 分鐘", cost: 20, stock: 0 }],
    specialRewards: [],
    templates: [{ id: "t1", title: "主動整理書包", amount: 3, type: "star" }, { id: "t2", title: "幫忙做家事", amount: 2, type: "star" }],
    redemptions: [],
    rewardIconLibrary: [],
    dailyTasks: [],
    dailyTaskRecords: [],
    dailyTaskSettings: {},
    passwordHash: "",
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
    passwordHash: string;
};
type StateRow = { data: string; updated_at: number };

class ApiError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

const asRecord = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? { ...(value as JsonRecord) } : {};
const imageIdentity = (value: string) => value.replace(/([?&])v=[^&]*/g, "").replace(/[?&]$/, "");
const positiveInt = (value: unknown) => Math.max(1, Math.abs(Math.floor(Number(value) || 1)));
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

function normalizeDailyTasks(value: unknown, childIds: Set<string>) {
    const nowIso = new Date().toISOString(), today = taipeiDateKey();
    if (!Array.isArray(value)) return [];
    return value.map((raw, index) => {
        const task = asRecord(raw), childId = typeof task.childId === "string" ? task.childId : "";
        if (!childIds.has(childId)) return null;
        const createdAt = validIso(task.createdAt) ? task.createdAt : nowIso;
        return {
            id: typeof task.id === "string" && task.id ? task.id : crypto.randomUUID(),
            childId,
            title: typeof task.title === "string" && task.title.trim() ? task.title.trim() : "新任務",
            icon: typeof task.icon === "string" && task.icon.trim() ? task.icon : "⭐",
            rewardStars: positiveInt(task.rewardStars),
            weekdays: uniqueWeekdays(task.weekdays),
            enabled: task.enabled !== false,
            sortOrder: Number.isFinite(Number(task.sortOrder)) ? Math.floor(Number(task.sortOrder)) : index,
            createdAt,
            updatedAt: validIso(task.updatedAt) ? task.updatedAt : createdAt,
            scheduleStart: validDateKey(task.scheduleStart) ? task.scheduleStart : today,
        } satisfies DailyTaskDefinition;
    }).filter((task): task is DailyTaskDefinition => Boolean(task)).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

function normalizeDailyTaskRecords(value: unknown, childIds: Set<string>) {
    const statuses = new Set<DailyTaskStatus>(["pending", "completed", "skipped", "pending_approval"]), nowIso = new Date().toISOString();
    if (!Array.isArray(value)) return [];
    return value.map(raw => {
        const record = asRecord(raw), childId = typeof record.childId === "string" ? record.childId : "", definitionId = typeof record.definitionId === "string" ? record.definitionId : "";
        if (!childIds.has(childId) || !definitionId || !validDateKey(record.date)) return null;
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
        for (const key of ["completedAt", "approvedAt", "requestedAt", "skippedAt"] as const) if (validIso(record[key])) normalized[key] = record[key];
        if (record.completedBy === "child" || record.completedBy === "parent") normalized.completedBy = record.completedBy;
        if (typeof record.rewardEntryId === "string" && record.rewardEntryId) normalized.rewardEntryId = record.rewardEntryId;
        return normalized;
    }).filter((record): record is DailyTaskRecord => Boolean(record));
}

function normalizeState(value: unknown): StoredState {
    const state = asRecord(value);
    state.children = Array.isArray(state.children) && state.children.length ? state.children : initial.children;
    state.entries = Array.isArray(state.entries) ? state.entries : [];
    state.templates = Array.isArray(state.templates) ? state.templates : [];
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
    state.dailyTaskRecords = normalizeDailyTaskRecords(state.dailyTaskRecords, childIds);
    const rawSettings = asRecord(state.dailyTaskSettings), settings: DailyTaskSettingsMap = {};
    for (const childId of childIds) settings[childId] = taskSettingsForChild(rawSettings as DailyTaskSettingsMap, childId);
    state.dailyTaskSettings = settings;
    const taskOwners = new Map((state.dailyTasks as DailyTaskDefinition[]).map(task => [task.id, task.childId])), goalByDay = new Map<string, { goalMode: DailyTaskSettings["goalMode"]; goalValue: number }>();
    const normalizedRecords: DailyTaskRecord[] = (state.dailyTaskRecords as DailyTaskRecord[]).filter(record => !taskOwners.has(record.definitionId) || taskOwners.get(record.definitionId) === record.childId).map(record => {
        const key = `${record.childId}|${record.date}`, existing = goalByDay.get(key), childSettings = settings[record.childId];
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
    return state as StoredState;
}

function materializeDailyTaskRecords(state: StoredState, throughDate = taipeiDateKey()) {
    const existing = new Set(state.dailyTaskRecords.map(record => `${record.definitionId}|${record.childId}|${record.date}`)), goals = new Map<string, { goalMode: DailyTaskSettings["goalMode"]; goalValue: number }>(), nowIso = new Date().toISOString(), additions: DailyTaskRecord[] = [];
    for (const record of state.dailyTaskRecords) if (record.goalModeSnapshot && Number.isFinite(record.goalValueSnapshot)) goals.set(`${record.childId}|${record.date}`, { goalMode: record.goalModeSnapshot, goalValue: Number(record.goalValueSnapshot) });
    for (const task of state.dailyTasks) {
        if (!task.enabled || task.scheduleStart > throughDate) continue;
        for (const date of calendarDateRange(task.scheduleStart, throughDate)) {
            const key = `${task.id}|${task.childId}|${date}`;
            if (existing.has(key) || !isTaskScheduled(task, date)) continue;
            existing.add(key);
            const goalKey = `${task.childId}|${date}`, childSettings = taskSettingsForChild(state.dailyTaskSettings, task.childId), goal = goals.get(goalKey) || { goalMode: childSettings.goalMode, goalValue: childSettings.goalValue };
            goals.set(goalKey, goal);
            additions.push({ id: crypto.randomUUID(), definitionId: task.id, childId: task.childId, date, titleSnapshot: task.title, iconSnapshot: task.icon, rewardStarsSnapshot: task.rewardStars, goalModeSnapshot: goal.goalMode, goalValueSnapshot: goal.goalValue, status: "pending", createdAt: nowIso, updatedAt: nowIso });
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
        const scheduleChanged = old.enabled !== task.enabled || old.weekdays.join(",") !== task.weekdays.join(",");
        const changed = scheduleChanged || old.title !== task.title || old.icon !== task.icon || old.rewardStars !== task.rewardStars || old.sortOrder !== index;
        return { ...task, childId: old.childId, sortOrder: index, createdAt: old.createdAt, scheduleStart: scheduleChanged && task.enabled ? today : old.scheduleStart, updatedAt: changed ? nowIso : old.updatedAt };
    });
}

function reconcileTodayPendingRecords(state: StoredState) {
    const today = taipeiDateKey(), definitions = new Map(state.dailyTasks.map(task => [task.id, task])), nowIso = new Date().toISOString();
    state.dailyTaskRecords = state.dailyTaskRecords.flatMap(record => {
        if (record.date !== today || record.status !== "pending") return [record];
        const task = definitions.get(record.definitionId);
        if (!task || !isTaskScheduled(task, today)) return [];
        return [{ ...record, childId: task.childId, titleSnapshot: task.title, iconSnapshot: task.icon, rewardStarsSnapshot: task.rewardStars, updatedAt: nowIso }];
    });
}

async function ensureTable() {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)").run();
}

async function setup(): Promise<{ state: StoredState; revision: number }> {
    await ensureTable();
    for (let attempt = 0; attempt < 4; attempt += 1) {
        let row = await env.DB.prepare("SELECT data, updated_at FROM app_state WHERE id = ?").bind("family").first<StateRow>();
        if (!row) {
            const state = materializeDailyTaskRecords(normalizeState(initial)), revision = Date.now();
            await env.DB.prepare("INSERT OR IGNORE INTO app_state (id,data,updated_at) VALUES (?,?,?)").bind("family", JSON.stringify(state), revision).run();
            row = await env.DB.prepare("SELECT data, updated_at FROM app_state WHERE id = ?").bind("family").first<StateRow>();
            if (!row) continue;
        }
        const state = materializeDailyTaskRecords(normalizeState(JSON.parse(row.data))), serialized = JSON.stringify(state);
        if (serialized === row.data) return { state, revision: Number(row.updated_at) };
        const revision = Math.max(Date.now(), Number(row.updated_at) + 1), result = await env.DB.prepare("UPDATE app_state SET data=?,updated_at=? WHERE id=? AND updated_at=?").bind(serialized, revision, "family", row.updated_at).run();
        if (Number(result.meta.changes || 0) === 1) return { state, revision };
    }
    throw new ApiError("資料正在被其他裝置更新，請稍後再試", 409);
}

async function writeState(state: StoredState, previousRevision: number) {
    const normalized = materializeDailyTaskRecords(normalizeState(state)), revision = Math.max(Date.now(), previousRevision + 1);
    const result = await env.DB.prepare("UPDATE app_state SET data=?,updated_at=? WHERE id=? AND updated_at=?").bind(JSON.stringify(normalized), revision, "family", previousRevision).run();
    if (Number(result.meta.changes || 0) !== 1) throw new ApiError("資料已被其他裝置更新，請重新整理後再操作", 409);
    return { state: normalized, revision };
}

async function mutateState(mutator: (state: StoredState) => Promise<boolean | void> | boolean | void) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await setup(), changed = await mutator(current.state);
        if (changed === false) return setup();
        try { return await writeState(current.state, current.revision); }
        catch (error) { if (!(error instanceof ApiError) || error.status !== 409 || attempt === 2) throw error; }
    }
    throw new ApiError("資料正在被其他裝置更新，請稍後再試", 409);
}

async function hash(value: string) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes)).map(item => item.toString(16).padStart(2, "0")).join("");
}

async function requireParent(state: StoredState, password = "") {
    if (state.passwordHash && await hash(password) !== state.passwordHash) throw new ApiError("密碼錯誤", 403);
}

function safePayload(state: StoredState, revision: number, extra: JsonRecord = {}) {
    const { passwordHash, ...safe } = state;
    return { ok: true, state: safe, passwordSet: Boolean(passwordHash), revision, ...extra };
}

const dailyRecordKey = (record: Pick<DailyTaskRecord, "definitionId" | "childId" | "date">) => `${record.definitionId}|${record.childId}|${record.date}`;

function isActiveTaskEntry(entry: JsonRecord, record: DailyTaskRecord) {
    return entry.sourceType === "daily_task" && entry.sourceId === record.id && entry.childId === record.childId && entry.type === "star" && positiveInt(entry.amount) === positiveInt(record.rewardStarsSnapshot) && (entry.status === undefined || entry.status === "completed");
}

function findActiveTaskEntry(state: StoredState, record: DailyTaskRecord) {
    const byId = record.rewardEntryId ? state.entries.find(entry => entry.id === record.rewardEntryId && isActiveTaskEntry(entry, record)) : undefined;
    return byId || state.entries.find(entry => isActiveTaskEntry(entry, record));
}

function completeDailyTask(state: StoredState, record: DailyTaskRecord, actor: "child" | "parent") {
    if (record.status === "completed") return false;
    if (record.status === "skipped") throw new ApiError("請先將任務恢復為待完成", 409);
    const duplicate = state.dailyTaskRecords.find(item => item.id !== record.id && dailyRecordKey(item) === dailyRecordKey(record) && (item.status === "completed" || item.status === "pending_approval"));
    if (duplicate) throw new ApiError("今天這項任務已經送出或完成，請先刷新頁面", 409);
    const existing = findActiveTaskEntry(state, record);
    const nowIso = new Date().toISOString();
    if (existing) {
        record.status = "completed";
        record.rewardEntryId = existing.id;
        record.completedAt = record.completedAt || nowIso;
        record.approvedAt = nowIso;
        record.completedBy = actor;
        record.updatedAt = nowIso;
        delete record.requestedAt;
        delete record.skippedAt;
        return true;
    }
    const entry = { id: crypto.randomUUID(), childId: record.childId, title: `每日任務：${record.titleSnapshot}`, amount: positiveInt(record.rewardStarsSnapshot), type: "star", date: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }), createdAt: nowIso, status: "completed", sourceType: "daily_task", sourceId: record.id };
    const child = state.children.find(item => item.id === record.childId);
    if (!child) throw new ApiError("找不到孩子資料", 404);
    child.stars = Math.max(0, Number(child.stars) || 0) + entry.amount;
    state.entries = [entry, ...state.entries];
    record.status = "completed";
    record.completedAt = nowIso;
    record.approvedAt = nowIso;
    record.completedBy = actor;
    record.rewardEntryId = entry.id;
    record.updatedAt = nowIso;
    delete record.requestedAt;
    delete record.skippedAt;
    return true;
}

export async function GET() {
    try {
        const { state, revision } = await setup();
        return Response.json(safePayload(state, revision), { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: error instanceof ApiError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json() as { action: string; password?: string; newPassword?: string; state?: Record<string, unknown>; record?: Record<string, unknown>; recordId?: string; childId?: string; operation?: string; expectedRevision?: number };

        if (body.action === "child_entry") {
            const submitted = body.record;
            if (!submitted || submitted.status !== "pending" || submitted.sourceType || submitted.sourceId || submitted.revokedAt) throw new ApiError("不正確的孩子紀錄", 400);
            const type = submitted.type === "deduct" || submitted.type === "special" ? submitted.type : submitted.type === "star" ? "star" : null;
            if (!type || typeof submitted.childId !== "string" || typeof submitted.title !== "string" || !submitted.title.trim()) throw new ApiError("紀錄內容不完整", 400);
            const nowIso = new Date().toISOString(), record = { id: typeof submitted.id === "string" && submitted.id ? submitted.id : crypto.randomUUID(), childId: submitted.childId, title: submitted.title.trim(), amount: positiveInt(submitted.amount), type, date: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }), createdAt: nowIso, status: "pending" };
            const result = await mutateState(state => {
                if (!state.children.some(child => child.id === record.childId)) throw new ApiError("找不到孩子資料", 404);
                if (state.entries.some(entry => entry.id === record.id)) return false;
                state.entries = [record, ...state.entries];
            });
            return Response.json(safePayload(result.state, result.revision));
        }

        if (body.action === "child_redemption") {
            const record = body.record;
            if (!record || record.status !== "pending") throw new ApiError("不正確的兌換申請", 400);
            const result = await mutateState(state => {
                if (!state.children.some(child => child.id === record.childId)) throw new ApiError("找不到孩子資料", 404);
                if (state.redemptions.some((item: JsonRecord) => item.id === record.id)) return false;
                state.redemptions = [record, ...state.redemptions];
            });
            return Response.json(safePayload(result.state, result.revision));
        }

        if (body.action === "child_daily_task_complete") {
            const result = await mutateState(state => {
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
            return Response.json(safePayload(result.state, result.revision));
        }

        if (body.action === "parent_daily_task_action") {
            const result = await mutateState(async state => {
                await requireParent(state, body.password || "");
                const record = state.dailyTaskRecords.find(item => item.id === body.recordId);
                if (!record) throw new ApiError("找不到任務紀錄，請刷新後再試", 404);
                const nowIso = new Date().toISOString();
                if (body.operation === "complete") {
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
                    const amount = positiveInt(entry.amount);
                    if ((Number(child.stars) || 0) < amount) throw new ApiError(`目前星星不足以撤銷，請先補回 ${amount - (Number(child.stars) || 0)} 顆`, 409);
                    child.stars -= amount;
                    entry.status = "revoked";
                    entry.revokedAt = nowIso;
                    record.status = "pending";
                    record.updatedAt = nowIso;
                    delete record.completedAt; delete record.approvedAt; delete record.completedBy; delete record.rewardEntryId;
                    return true;
                }
                throw new ApiError("不支援的任務操作", 400);
            });
            return Response.json(safePayload(result.state, result.revision));
        }

        const current = await setup();
        await requireParent(current.state, body.password || "");
        if (body.action === "verify") return Response.json({ ok: true, revision: current.revision });
        if (body.action !== "save" || !body.state) throw new ApiError("不正確的儲存內容", 400);
        if (!Number.isFinite(body.expectedRevision)) throw new ApiError("這個頁面版本過舊，請重新整理後再儲存", 428);
        if (Number(body.expectedRevision) !== current.revision) throw new ApiError("資料已被其他裝置更新，已為您保留最新版本，請重新整理後再儲存", 409);
        const passwordHash = body.newPassword ? await hash(body.newPassword) : current.state.passwordHash;
        const next = normalizeState({ ...current.state, ...body.state, passwordHash });
        next.dailyTasks = prepareTaskDefinitionsForSave(current.state.dailyTasks, next.dailyTasks);
        reconcileTodayPendingRecords(next);
        const saved = await writeState(next, current.revision);
        return Response.json(safePayload(saved.state, saved.revision));
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: error instanceof ApiError ? error.status : 500 });
    }
}
