import {
    addCalendarDays,
    calendarDateRange,
    isTaskScheduled,
    weekdayForDateKey,
    type DailyTaskDefinition,
    type DailyTaskRecord,
} from "./daily-task-logic.ts";

export type TaskExecutionStatus = "completed" | "missed" | "not_applicable" | "in_progress";

export type TaskExecutionMetric = {
    definitionId: string;
    childId: string;
    date: string;
    title: string;
    icon: string;
    rewardStars: number;
    status: TaskExecutionStatus;
    completedAt?: string;
    backfilled: boolean;
    backfillSource?: "current_definition";
    fromHistoricalRecord: boolean;
};

export type DailyTaskCompletionMetric = {
    date: string;
    weekday: number;
    scheduledCount: number;
    completedCount: number;
    missedCount: number;
    notApplicableCount: number;
    inProgressCount: number;
    backfilledCount: number;
    completionRate: number | null;
    isTodayInProgress: boolean;
    isFuture: boolean;
    executions: TaskExecutionMetric[];
};

export type TaskHealthStatus = "insufficient_data" | "established" | "stable" | "developing" | "observe" | "needs_review";
export type HabitMaturityStatus = "building" | "developing" | "stable" | "established" | "graduated";

export type TaskHealthMetric = {
    definitionId: string;
    title: string;
    icon: string;
    currentTask: boolean;
    graduated: boolean;
    rangeStart: string;
    rangeEnd: string;
    scheduledCount: number;
    completedCount: number;
    missedCount: number;
    notApplicableCount: number;
    backfilledCount: number;
    backfillRatio: number;
    completionRate: number | null;
    currentCompletionStreak: number;
    longestCompletionStreak: number;
    currentMissStreak: number;
    longestMissStreak: number;
    weekdayFrequency: number;
    healthStatus: TaskHealthStatus;
    maturityStatus: HabitMaturityStatus;
    recommendations: string[];
    executions: TaskExecutionMetric[];
};

export type GraduatedHabitMetric = {
    definitionId: string;
    title: string;
    icon: string;
    graduatedAt: string;
    lastThirtyDaysScheduled: number;
    lastThirtyDaysCompleted: number;
    lastThirtyDaysRate: number | null;
    totalCompleted: number;
    graduationCount: number;
};

const recordPriority: Record<DailyTaskRecord["status"], number> = {
    completed: 4,
    skipped: 3,
    pending_approval: 2,
    pending: 1,
};

function preferredRecord(left: DailyTaskRecord, right: DailyTaskRecord) {
    const priorityDifference = recordPriority[left.status] - recordPriority[right.status];
    if (priorityDifference) return priorityDifference > 0 ? left : right;
    return String(left.updatedAt || left.createdAt).localeCompare(String(right.updatedAt || right.createdAt)) >= 0 ? left : right;
}

function executionFromRecord(record: DailyTaskRecord, todayKey: string): TaskExecutionMetric {
    const status: TaskExecutionStatus = record.status === "completed"
        ? "completed"
        : record.status === "skipped"
            ? "not_applicable"
            : record.status === "pending_approval" || record.date === todayKey
                ? "in_progress"
                : "missed";
    return {
        definitionId: record.definitionId,
        childId: record.childId,
        date: record.date,
        title: record.titleSnapshot || "未命名任務",
        icon: record.iconSnapshot || "⭐",
        rewardStars: Math.max(0, Math.trunc(Number(record.rewardStarsSnapshot) || 0)),
        status,
        completedAt: record.completedAt || record.approvedAt,
        backfilled: Boolean(record.backfilledAt || record.backfillSource),
        backfillSource: record.backfillSource,
        fromHistoricalRecord: true,
    };
}

export function buildTaskExecutions(input: {
    childId: string;
    start: string;
    end: string;
    todayKey: string;
    definitions: DailyTaskDefinition[];
    records: DailyTaskRecord[];
}) {
    const end = input.end < input.todayKey ? input.end : input.todayKey;
    if (!input.childId || input.start > end) return [];
    const definitions = new Map(input.definitions.map(task => [task.id, task]));
    const recordsByKey = new Map<string, DailyTaskRecord>();
    const daysWithHistoricalInstances = new Set<string>();
    for (const record of input.records) {
        if (record.childId !== input.childId || record.date < input.start || record.date > end) continue;
        daysWithHistoricalInstances.add(record.date);
        const key = `${record.definitionId}|${record.childId}|${record.date}`;
        const existing = recordsByKey.get(key);
        recordsByKey.set(key, existing ? preferredRecord(existing, record) : record);
    }
    const result = [...recordsByKey.values()].map(record => executionFromRecord(record, input.todayKey));

    // Historical instances are the source of truth. Current definitions are only a
    // compatibility fallback for a date that has no saved instances at all.
    for (const date of calendarDateRange(input.start, end)) {
        if (daysWithHistoricalInstances.has(date)) continue;
        for (const task of definitions.values()) {
            if (!task.applicableChildIds.includes(input.childId) || !isTaskScheduled(task, date)) continue;
            result.push({
                definitionId: task.id,
                childId: input.childId,
                date,
                title: task.title,
                icon: task.icon,
                rewardStars: Math.max(0, Math.trunc(Number(task.rewardStars) || 0)),
                status: date === input.todayKey ? "in_progress" : "missed",
                backfilled: false,
                fromHistoricalRecord: false,
            });
        }
    }
    return result.sort((left, right) => left.date.localeCompare(right.date)
        || left.title.localeCompare(right.title, "zh-TW")
        || left.definitionId.localeCompare(right.definitionId));
}

export function buildDailyTaskCompletionSeries(input: {
    childId: string;
    start: string;
    end: string;
    todayKey: string;
    definitions: DailyTaskDefinition[];
    records: DailyTaskRecord[];
}) {
    const executions = buildTaskExecutions(input);
    const byDate = new Map<string, TaskExecutionMetric[]>();
    for (const execution of executions) {
        const rows = byDate.get(execution.date) || [];
        rows.push(execution);
        byDate.set(execution.date, rows);
    }
    return calendarDateRange(input.start, input.end).map((date): DailyTaskCompletionMetric => {
        const rows = byDate.get(date) || [];
        const completedCount = rows.filter(row => row.status === "completed").length;
        const missedCount = rows.filter(row => row.status === "missed").length;
        const inProgressCount = rows.filter(row => row.status === "in_progress").length;
        const scheduledCount = completedCount + missedCount + inProgressCount;
        return {
            date,
            weekday: weekdayForDateKey(date),
            scheduledCount,
            completedCount,
            missedCount,
            notApplicableCount: rows.filter(row => row.status === "not_applicable").length,
            inProgressCount,
            backfilledCount: rows.filter(row => row.status === "completed" && row.backfilled).length,
            completionRate: scheduledCount ? Math.round(completedCount / scheduledCount * 100) : null,
            isTodayInProgress: date === input.todayKey && inProgressCount > 0,
            isFuture: date > input.todayKey,
            executions: rows,
        };
    });
}

export function calculateWeightedCompletionRate(days: DailyTaskCompletionMetric[], options: { excludeTodayInProgress?: boolean } = {}) {
    const included = days.filter(day => !day.isFuture && !(options.excludeTodayInProgress && day.isTodayInProgress));
    const scheduled = included.reduce((sum, day) => sum + day.completedCount + day.missedCount, 0);
    const completed = included.reduce((sum, day) => sum + day.completedCount, 0);
    return scheduled ? Math.round(completed / scheduled * 100) : null;
}

export function calculateFullCompletionStreak(days: DailyTaskCompletionMetric[]) {
    let streak = 0;
    for (const day of [...days].filter(day => !day.isFuture && !day.isTodayInProgress).sort((a, b) => b.date.localeCompare(a.date))) {
        const effective = day.completedCount + day.missedCount;
        if (!effective) continue;
        if (day.completedCount !== effective) break;
        streak += 1;
    }
    return streak;
}

function streaks(executions: TaskExecutionMetric[]) {
    let currentCompletion = 0, longestCompletion = 0, currentMiss = 0, longestMiss = 0;
    for (const execution of executions) {
        if (execution.status === "not_applicable" || execution.status === "in_progress") continue;
        if (execution.status === "completed") {
            currentCompletion += 1;
            longestCompletion = Math.max(longestCompletion, currentCompletion);
            currentMiss = 0;
        } else {
            currentMiss += 1;
            longestMiss = Math.max(longestMiss, currentMiss);
            currentCompletion = 0;
        }
    }
    return { currentCompletion, longestCompletion, currentMiss, longestMiss };
}

export function taskHealthStatus(scheduledCount: number, completionRate: number | null, currentCompletionStreak: number): TaskHealthStatus {
    if (scheduledCount < 3 || completionRate === null) return "insufficient_data";
    if (scheduledCount >= 10 && completionRate >= 95 && currentCompletionStreak >= 7) return "established";
    if (completionRate >= 85) return "stable";
    if (completionRate >= 70) return "developing";
    if (completionRate >= 50) return "observe";
    return "needs_review";
}

export function habitMaturityStatus(input: { graduated: boolean; scheduledCount: number; completionRate: number | null; currentCompletionStreak: number; currentMissStreak: number }): HabitMaturityStatus {
    if (input.graduated) return "graduated";
    if (input.scheduledCount >= 20 && (input.completionRate ?? 0) >= 95 && input.currentCompletionStreak >= 14 && input.currentMissStreak === 0) return "established";
    if ((input.completionRate ?? 0) >= 85) return "stable";
    if ((input.completionRate ?? 0) >= 70) return "developing";
    return "building";
}

export function generateTaskRecommendations(metric: Pick<TaskHealthMetric,
    "completionRate" | "scheduledCount" | "currentMissStreak" | "weekdayFrequency" | "backfillRatio" | "completedCount" | "title">) {
    const rate = metric.completionRate;
    const recommendations: string[] = [];
    if (rate !== null && rate < 50) recommendations.push("可以一起檢視任務難度、執行頻率或安排時段是否合適。");
    if (metric.currentMissStreak >= 3) recommendations.push("最近連續幾次未完成，建議先和孩子聊聊遇到的阻礙。");
    if (rate !== null && rate < 70 && /(分鐘|小時|\d+\s*(min|hour))/i.test(metric.title)) recommendations.push("可以嘗試把任務時間縮短，拆成更容易開始的小階段。");
    if (rate !== null && rate < 70 && metric.weekdayFrequency >= 6) recommendations.push("任務安排很頻繁，可以考慮保留休息日或降低每週次數。");
    if (metric.scheduledCount < 5 && metric.weekdayFrequency <= 2) recommendations.push("目前樣本還少，建議維持設定並累積更多紀錄後再判斷。");
    if (rate !== null && rate >= 70 && rate < 85) recommendations.push("目前正在穩定發展，可先維持難度並持續觀察。");
    if (rate !== null && rate >= 95 && metric.scheduledCount >= 10) recommendations.push("表現已相當穩定，可考慮降低獎勵、改為間歇鼓勵或準備習慣畢業。");
    if (metric.completedCount >= 5 && metric.backfillRatio >= 0.4) recommendations.push("補登比例較高，可以調整提醒時間，讓完成當下更容易記錄。");
    if (!recommendations.length) recommendations.push("目前沒有需要立即調整的訊號，保持觀察即可。");
    return recommendations.slice(0, 3);
}

export function buildTaskHealthMetrics(input: {
    childId: string;
    start: string;
    end: string;
    todayKey: string;
    definitions: DailyTaskDefinition[];
    records: DailyTaskRecord[];
}) {
    const executions = buildTaskExecutions(input);
    const definitions = new Map(input.definitions.map(task => [task.id, task]));
    const grouped = new Map<string, TaskExecutionMetric[]>();
    for (const execution of executions) {
        const rows = grouped.get(execution.definitionId) || [];
        rows.push(execution);
        grouped.set(execution.definitionId, rows);
    }
    for (const task of input.definitions) if (!grouped.has(task.id) && task.applicableChildIds.includes(input.childId)) grouped.set(task.id, []);

    const metrics: TaskHealthMetric[] = [];
    for (const [definitionId, rows] of grouped) {
        const definition = definitions.get(definitionId);
        const ordered = [...rows].sort((left, right) => left.date.localeCompare(right.date));
        const completedCount = ordered.filter(row => row.status === "completed").length;
        const missedCount = ordered.filter(row => row.status === "missed").length;
        const scheduledCount = completedCount + missedCount;
        const completionRate = scheduledCount ? Math.round(completedCount / scheduledCount * 100) : null;
        const sequence = streaks(ordered);
        const title = definition?.title || ordered.at(-1)?.title || "已刪除的任務";
        const graduated = definition?.habitStatus === "graduated";
        const base = {
            definitionId,
            title,
            icon: definition?.icon || ordered.at(-1)?.icon || "⭐",
            currentTask: Boolean(definition),
            graduated,
            rangeStart: input.start,
            rangeEnd: input.end,
            scheduledCount,
            completedCount,
            missedCount,
            notApplicableCount: ordered.filter(row => row.status === "not_applicable").length,
            backfilledCount: ordered.filter(row => row.status === "completed" && row.backfilled).length,
            backfillRatio: completedCount ? ordered.filter(row => row.status === "completed" && row.backfilled).length / completedCount : 0,
            completionRate,
            currentCompletionStreak: sequence.currentCompletion,
            longestCompletionStreak: sequence.longestCompletion,
            currentMissStreak: sequence.currentMiss,
            longestMissStreak: sequence.longestMiss,
            weekdayFrequency: definition ? new Set(definition.weekdays).size : new Set(ordered.map(row => weekdayForDateKey(row.date))).size,
            healthStatus: taskHealthStatus(scheduledCount, completionRate, sequence.currentCompletion),
            maturityStatus: habitMaturityStatus({ graduated, scheduledCount, completionRate, currentCompletionStreak: sequence.currentCompletion, currentMissStreak: sequence.currentMiss }),
            executions: ordered,
        } satisfies Omit<TaskHealthMetric, "recommendations">;
        metrics.push({ ...base, recommendations: generateTaskRecommendations(base) });
    }
    const statusOrder: Record<TaskHealthStatus, number> = { needs_review: 0, observe: 1, developing: 2, stable: 3, established: 4, insufficient_data: 5 };
    return metrics.sort((left, right) => Number(left.graduated) - Number(right.graduated)
        || statusOrder[left.healthStatus] - statusOrder[right.healthStatus]
        || (left.completionRate ?? 101) - (right.completionRate ?? 101)
        || left.title.localeCompare(right.title, "zh-TW"));
}

export function buildGraduatedHabitMetrics(input: {
    childId: string;
    todayKey: string;
    definitions: DailyTaskDefinition[];
    records: DailyTaskRecord[];
}) {
    const childRecords = input.records.filter(record => record.childId === input.childId);
    return input.definitions
        .filter(task => task.habitStatus === "graduated" && task.applicableChildIds.includes(input.childId))
        .map((task): GraduatedHabitMetric => {
            const end = task.graduatedAt?.slice(0, 10) || input.todayKey;
            const start = addCalendarDays(end, -29);
            const rows = childRecords.filter(record => record.definitionId === task.id && record.date >= start && record.date <= end);
            const completed = rows.filter(record => record.status === "completed").length;
            const missed = rows.filter(record => record.status === "pending" || record.status === "pending_approval").length;
            const scheduled = completed + missed;
            return {
                definitionId: task.id,
                title: task.title,
                icon: task.icon,
                graduatedAt: task.graduatedAt || "",
                lastThirtyDaysScheduled: scheduled,
                lastThirtyDaysCompleted: completed,
                lastThirtyDaysRate: scheduled ? Math.round(completed / scheduled * 100) : null,
                totalCompleted: childRecords.filter(record => record.definitionId === task.id && record.status === "completed").length,
                graduationCount: (task.habitHistory || []).filter(item => item.status === "graduated").length || 1,
            };
        })
        .sort((left, right) => right.graduatedAt.localeCompare(left.graduatedAt) || left.title.localeCompare(right.title, "zh-TW"));
}
