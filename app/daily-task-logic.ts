export const TAIPEI_TIME_ZONE = "Asia/Taipei";

export type DailyTaskStatus = "pending" | "completed" | "skipped" | "pending_approval";
export type DailyTaskGoalMode = "all" | "percentage" | "count";
export type DailyTaskCompletionMode = "instant" | "approval";
export type DailyTaskSortMode = "flow" | "custom";
export type DailyTaskTimeSlot = "wake_up" | "before_breakfast" | "before_school" | "after_school" | "after_dinner" | "before_bed" | "anytime";
export type DailyTaskHabitStatus = "active" | "graduated";

export type DailyTaskHabitHistoryEntry = {
    status: DailyTaskHabitStatus;
    at: string;
    by?: string;
};

export type DailyTaskDefinition = {
    id: string;
    applicableChildIds: string[];
    title: string;
    icon: string;
    rewardStars: number;
    weekdays: number[];
    enabled: boolean;
    sortOrder: number;
    customOrder?: number;
    timeSlot?: DailyTaskTimeSlot;
    sourceType?: "official" | "custom";
    sourceOfficialTaskId?: string;
    createdAt: string;
    updatedAt: string;
    scheduleStart: string;
    habitStatus?: DailyTaskHabitStatus;
    graduatedAt?: string;
    graduatedBy?: string;
    resumedAt?: string;
    habitHistory?: DailyTaskHabitHistoryEntry[];
};

export type DailyTaskRecord = {
    id: string;
    definitionId: string;
    childId: string;
    date: string;
    titleSnapshot: string;
    iconSnapshot: string;
    rewardStarsSnapshot: number;
    goalModeSnapshot?: DailyTaskGoalMode;
    goalValueSnapshot?: number;
    status: DailyTaskStatus;
    occurredAt?: string;
    completedAt?: string;
    backfilledAt?: string;
    backfillSource?: "current_definition";
    isVirtualBackfillCandidate?: boolean;
    approvedAt?: string;
    requestedAt?: string;
    skippedAt?: string;
    completedBy?: "child" | "parent";
    rewardEntryId?: string;
    createdAt: string;
    updatedAt: string;
};

export type DailyTaskSettings = {
    goalMode: DailyTaskGoalMode;
    goalValue: number;
    completionMode: DailyTaskCompletionMode;
};

export type DailyTaskSettingsMap = Record<string, DailyTaskSettings>;

export const DEFAULT_DAILY_TASK_SETTINGS: DailyTaskSettings = {
    goalMode: "percentage",
    goalValue: 80,
    completionMode: "instant",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

export function taipeiDateKey(value: Date | number | string = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const parts = dateFormatter.formatToParts(date);
    const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
    return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function isCalendarDateKey(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addCalendarDays(dateKey: string, amount: number) {
    if (!isCalendarDateKey(dateKey)) return dateKey;
    const [year, month, day] = dateKey.split("-").map(Number);
    if (![year, month, day].every(Number.isFinite)) return dateKey;
    return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

export function taipeiDateKeyAtNoonIso(dateKey: string) {
    if (!isCalendarDateKey(dateKey)) return "";
    const [year, month, day] = dateKey.split("-").map(Number);
    const instant = new Date(Date.UTC(year, month - 1, day, 4));
    return taipeiDateKey(instant) === dateKey ? instant.toISOString() : "";
}

export function weekdayForDateKey(dateKey: string) {
    if (!isCalendarDateKey(dateKey)) return 0;
    const [year, month, day] = dateKey.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return weekday === 0 ? 7 : weekday;
}

export function weekStartDateKey(dateKey: string) {
    return addCalendarDays(dateKey, 1 - weekdayForDateKey(dateKey));
}

export function calendarDateRange(start: string, end: string) {
    const dates: string[] = [];
    if (!isCalendarDateKey(start) || !isCalendarDateKey(end)) return dates;
    for (let cursor = start, guard = 0; cursor <= end && guard < 4000; cursor = addCalendarDays(cursor, 1), guard += 1) dates.push(cursor);
    return dates;
}

export function formatTaipeiDate(dateKey: string) {
    if (!isCalendarDateKey(dateKey)) return dateKey;
    const [year, month, day] = dateKey.split("-").map(Number);
    if (![year, month, day].every(Number.isFinite)) return dateKey;
    return new Intl.DateTimeFormat("zh-TW", {
        timeZone: TAIPEI_TIME_ZONE,
        month: "long",
        day: "numeric",
        weekday: "long",
    }).format(new Date(Date.UTC(year, month - 1, day, 4)));
}

export function formatTaipeiTime(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-TW", {
        timeZone: TAIPEI_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(date);
}

export function taskSettingsForChild(settings: DailyTaskSettingsMap | undefined, childId: string): DailyTaskSettings {
    const value = settings?.[childId];
    if (!value) return { ...DEFAULT_DAILY_TASK_SETTINGS };
    const goalMode: DailyTaskGoalMode = value.goalMode === "all" || value.goalMode === "count" ? value.goalMode : "percentage";
    const completionMode: DailyTaskCompletionMode = value.completionMode === "approval" ? "approval" : "instant";
    const rawGoal = Math.max(1, Math.floor(Number(value.goalValue) || DEFAULT_DAILY_TASK_SETTINGS.goalValue));
    return { goalMode, completionMode, goalValue: goalMode === "percentage" ? Math.min(100, rawGoal) : rawGoal };
}

export type TaskProgress = { completed: number; total: number; percentage: number | null };

export const DAILY_TASK_TIME_SLOT_ORDER:Record<DailyTaskTimeSlot,number>={wake_up:0,before_breakfast:1,before_school:2,after_school:3,after_dinner:4,before_bed:5,anytime:6};
export function compareDailyTaskDefinitions(left:Pick<DailyTaskDefinition,"title"|"sortOrder"|"customOrder"|"timeSlot">,right:Pick<DailyTaskDefinition,"title"|"sortOrder"|"customOrder"|"timeSlot">,mode:DailyTaskSortMode="flow"){
    if(mode==="custom")return (left.customOrder??left.sortOrder)-(right.customOrder??right.sortOrder)||(left.title||"").localeCompare(right.title||"","zh-TW");
    return (DAILY_TASK_TIME_SLOT_ORDER[left.timeSlot||"anytime"]-DAILY_TASK_TIME_SLOT_ORDER[right.timeSlot||"anytime"])||left.sortOrder-right.sortOrder||(left.title||"").localeCompare(right.title||"","zh-TW");
}

export function taskProgress(records: DailyTaskRecord[]): TaskProgress {
    const effective = records.filter(record => record.status !== "skipped");
    const completed = effective.filter(record => record.status === "completed").length;
    return { completed, total: effective.length, percentage: effective.length ? Math.round(completed / effective.length * 100) : null };
}

export function dailyTaskDayView(
    records: DailyTaskRecord[],
    definitions: Pick<DailyTaskDefinition, "id" | "title" | "sortOrder" | "customOrder" | "timeSlot">[],
    childId: string,
    dateKey: string,
    sortMode:DailyTaskSortMode="custom",
) {
    const sortOrder = new Map(
        [...definitions].sort((left,right)=>compareDailyTaskDefinitions(left,right,sortMode)).map((task,index) => [task.id, index]),
    );
    const todayRecords = records
        .filter(record => record.childId === childId && record.date === dateKey)
        .sort((left, right) =>
            (sortOrder.get(left.definitionId) ?? 999) - (sortOrder.get(right.definitionId) ?? 999)
            || left.titleSnapshot.localeCompare(right.titleSnapshot, "zh-TW"),
        );
    return {
        records: todayRecords,
        pending: todayRecords.filter(record => record.status === "pending" || record.status === "pending_approval"),
        finished: todayRecords.filter(record => record.status === "completed" || record.status === "skipped"),
        progress: taskProgress(todayRecords),
    };
}

export function currentDefinitionBackfillCandidates(
    definitions: DailyTaskDefinition[],
    records: DailyTaskRecord[],
    childId: string,
    dateKey: string,
    sortMode: DailyTaskSortMode = "flow",
) {
    if (!childId || !isCalendarDateKey(dateKey)) return [];
    const weekday = weekdayForDateKey(dateKey);
    const existing = new Set(records.map(record => `${record.definitionId}|${record.childId}|${record.date}`));
    return [...definitions]
        .filter(task => task.enabled
            && task.habitStatus !== "graduated"
            && task.applicableChildIds.includes(childId)
            && task.weekdays.includes(weekday)
            && !existing.has(`${task.id}|${childId}|${dateKey}`))
        .sort((left, right) => compareDailyTaskDefinitions(left, right, sortMode))
        .map(task => ({
            id: `current-definition:${task.id}:${childId}:${dateKey}`,
            definitionId: task.id,
            childId,
            date: dateKey,
            titleSnapshot: task.title,
            iconSnapshot: task.icon,
            rewardStarsSnapshot: task.rewardStars,
            status: "pending" as const,
            backfillSource: "current_definition" as const,
            isVirtualBackfillCandidate: true,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
        }));
}

export function goalResult(progress: TaskProgress, settings: DailyTaskSettings) {
    if (!progress.total) return { evaluable: false, met: false, required: 0 };
    if (settings.goalMode === "all") return { evaluable: true, met: progress.completed === progress.total, required: progress.total };
    if (settings.goalMode === "count") {
        const required = Math.min(Math.max(1, Math.floor(settings.goalValue)), progress.total);
        return { evaluable: true, met: progress.completed >= required, required };
    }
    const percentage = Math.min(100, Math.max(1, settings.goalValue));
    const required = Math.ceil(progress.total * percentage / 100);
    return { evaluable: true, met: progress.completed * 100 >= progress.total * percentage, required };
}

export function taskGoalSettingsForRecords(records: DailyTaskRecord[], fallback: DailyTaskSettings): DailyTaskSettings {
    const snapshot = records.find(record => record.goalModeSnapshot && Number.isFinite(record.goalValueSnapshot));
    const goalMode = snapshot?.goalModeSnapshot, goalValue = snapshot?.goalValueSnapshot;
    if (!goalMode || !Number.isFinite(goalValue)) return fallback;
    return taskSettingsForChild({ snapshot: {
        goalMode,
        goalValue: Number(goalValue),
        completionMode: fallback.completionMode,
    } }, "snapshot");
}

export function weeklyTaskProgress(records: DailyTaskRecord[], todayKey: string) {
    const start = weekStartDateKey(todayKey);
    return taskProgress(records.filter(record => record.date >= start && record.date <= todayKey));
}

export function calculateTaskStreak(records: DailyTaskRecord[], settings: DailyTaskSettings, todayKey: string) {
    const groups = new Map<string, DailyTaskRecord[]>();
    for (const record of records) {
        if (record.date > todayKey) continue;
        const rows = groups.get(record.date) || [];
        rows.push(record);
        groups.set(record.date, rows);
    }
    const dates = [...groups.keys()].sort((a, b) => b.localeCompare(a));
    let streak = 0;
    for (const date of dates) {
        const progress = taskProgress(groups.get(date) || []);
        const result = goalResult(progress, taskGoalSettingsForRecords(groups.get(date) || [], settings));
        if (!result.evaluable) continue;
        if (date === todayKey && !result.met) continue;
        if (!result.met) break;
        streak += 1;
    }
    return streak;
}

export function isTaskScheduled(task: Pick<DailyTaskDefinition, "enabled" | "weekdays" | "scheduleStart" | "habitStatus">, dateKey: string) {
    return task.habitStatus !== "graduated" && isCalendarDateKey(task.scheduleStart) && isCalendarDateKey(dateKey) && task.enabled && task.scheduleStart <= dateKey && task.weekdays.includes(weekdayForDateKey(dateKey));
}
