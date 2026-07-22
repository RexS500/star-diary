import {
    analyticsDateKey,
    analyticsTimestamp,
    entryAnalyticsDateKey,
    entryAnalyticsTimestamp,
    getWeekPeriods,
    getWeeklyRedemptionSummary,
    getWeeklyStarAnalytics,
    type AnalyticsEntryLike,
    type AnalyticsRedemptionLike,
    type WeekPeriod,
} from "./analytics-logic.ts";
import {
    addCalendarDays,
    calculateTaskStreak,
    calendarDateRange,
    taskSettingsForChild,
    taipeiDateKey,
    type DailyTaskDefinition,
    type DailyTaskRecord,
    type DailyTaskSettingsMap,
} from "./daily-task-logic.ts";
import { isCompletedStarRedemption, isEffectiveStarRecord, redemptionStarCost } from "./star-balance.ts";
import {
    buildDailyTaskCompletionSeries,
    buildGraduatedHabitMetrics,
    buildTaskHealthMetrics,
    calculateWeightedCompletionRate,
    type DailyTaskCompletionMetric,
    type GraduatedHabitMetric,
    type TaskHealthMetric,
} from "./task-analytics.ts";

export type AnalyticsRangePreset = "two_weeks" | "current_month" | "previous_month" | "last_30_days" | "custom" | "all";

export type AnalyticsDateRange = {
    preset: AnalyticsRangePreset;
    label: string;
    start: string;
    end: string;
    days: string[];
};

export type AnalyticsReportEntry = AnalyticsEntryLike & {
    note?: string;
};

export type AnalyticsReportTemplate = {
    id?: string;
    title?: string;
    amount?: number;
    type?: string;
};

export type StarDetailRow = {
    occurredAt: string;
    createdAt: string;
    type: "加星" | "扣星" | "特殊獎勵";
    source: string;
    content: string;
    amount: number;
    note: string;
};

export type DailyStatisticsRow = {
    date: string;
    added: number;
    deducted: number;
    special: number;
    net: number;
    scheduledTasks: number;
    completedTasks: number;
    incompleteTasks: number;
    skippedTasks: number;
    completionRate: number | null;
};

export type DailyTaskReportRow = {
    date: string;
    title: string;
    status: "已完成" | "未完成" | "今日不適用" | "等待家長確認" | "進行中";
    completedAt: string;
    rewardStars: number;
    applicableChild: string;
};

export type RedemptionReportRow = {
    redeemedAt: string;
    rewardName: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    status: string;
};

export type AnalyticsReport = {
    childName: string;
    range: AnalyticsDateRange;
    exportedAt: string;
    starAnalysis: ReturnType<typeof getWeeklyStarAnalytics>;
    summary: {
        added: number;
        deducted: number;
        special: number;
        net: number;
        redemptionCost: number;
        taskCompletionRate: number | null;
        streak: number;
        completedTasks: number;
        incompleteTasks: number;
        skippedTasks: number;
    };
    starDetails: StarDetailRow[];
    dailyStatistics: DailyStatisticsRow[];
    taskRows: DailyTaskReportRow[];
    dailyTaskCompletion: DailyTaskCompletionMetric[];
    taskHealth: TaskHealthMetric[];
    graduatedHabits: GraduatedHabitMetric[];
    redemptionRows: RedemptionReportRow[];
    redemptionSummary: {
        count: number;
        quantity: number;
        totalCost: number;
        mostFrequentReward: string;
        highestCostReward: string;
    };
};

const finiteInteger = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.abs(Math.trunc(number)) : 0;
};

function previousMonthRange(todayKey: string) {
    const [year, month] = todayKey.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
    return { start, end };
}

export function earliestAnalyticsDate(
    childId: string,
    entries: AnalyticsReportEntry[],
    redemptions: AnalyticsRedemptionLike[],
    taskRecords: DailyTaskRecord[],
    fallback = taipeiDateKey(),
) {
    const dates = [
        ...entries.filter(item => item.childId === childId).map(entryAnalyticsDateKey),
        ...redemptions.filter(item => item.childId === childId).map(item => {
            for (const value of [item.completedAt, item.createdAt, item.updatedAt, item.date]) {
                const date = analyticsDateKey(value);
                if (date) return date;
            }
            return "";
        }),
        ...taskRecords.filter(item => item.childId === childId).map(item => item.date),
    ].filter(Boolean).sort();
    return dates[0] || fallback;
}

export function resolveAnalyticsDateRange(options: {
    preset: AnalyticsRangePreset;
    todayKey: string;
    earliestDate?: string;
    customStart?: string;
    customEnd?: string;
}): AnalyticsDateRange {
    const { preset, todayKey } = options;
    let start = todayKey, end = todayKey, label = "自訂日期";
    if (preset === "two_weeks") {
        const weeks = getWeekPeriods(todayKey);
        start = weeks.previous.start;
        end = weeks.current.end;
        label = "上週＋本週";
    } else if (preset === "current_month") {
        start = `${todayKey.slice(0, 7)}-01`;
        end = todayKey;
        label = "本月";
    } else if (preset === "previous_month") {
        ({ start, end } = previousMonthRange(todayKey));
        label = "上個月";
    } else if (preset === "last_30_days") {
        start = addCalendarDays(todayKey, -29);
        end = todayKey;
        label = "最近 30 天";
    } else if (preset === "all") {
        start = options.earliestDate && options.earliestDate <= todayKey ? options.earliestDate : todayKey;
        end = todayKey;
        label = "全部紀錄";
    } else {
        const first = options.customStart || todayKey;
        const last = options.customEnd || todayKey;
        start = first <= last ? first : last;
        end = first <= last ? last : first;
    }
    return { preset, label, start, end, days: calendarDateRange(start, end) };
}

export function analyticsPeriod(range: AnalyticsDateRange): WeekPeriod {
    return { key: range.preset, label: range.label, start: range.start, end: range.end, days: range.days };
}

export function splitAnalyticsRangeIntoWeekPeriods(range: AnalyticsDateRange, todayKey: string): WeekPeriod[] {
    if (range.preset === "two_weeks") {
        const periods = getWeekPeriods(todayKey);
        return [periods.previous, periods.current];
    }
    const groups: string[][] = [];
    let current: string[] = [];
    for (const date of range.days) {
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        if (weekday === 0 && current.length) {
            groups.push(current);
            current = [];
        }
        current.push(date);
        if (weekday === 6) {
            groups.push(current);
            current = [];
        }
    }
    if (current.length) groups.push(current);
    return groups.map((days, index) => ({
        key: `${range.preset}-${index + 1}`,
        label: groups.length === 1 ? range.label : `第 ${index + 1} 週`,
        start: days[0],
        end: days.at(-1)!,
        days,
    }));
}

function redemptionTimestamp(item: AnalyticsRedemptionLike) {
    for (const value of [item.completedAt, item.createdAt, item.updatedAt, item.date]) {
        const timestamp = analyticsTimestamp(value);
        if (Number.isFinite(timestamp)) return timestamp;
    }
    return Number.NaN;
}

function redemptionStatus(item: AnalyticsRedemptionLike) {
    if (isCompletedStarRedemption(item)) return "已完成";
    const status = String(item.status ?? "completed").toLocaleLowerCase();
    if (status === "pending") return "等待家長確認";
    if (status === "cancelled") return "已取消";
    if (status === "rejected") return "已拒絕";
    if (status === "failed") return "失敗";
    return status || "未記錄";
}

function entrySource(entry: AnalyticsReportEntry, templates: AnalyticsReportTemplate[]) {
    if (entry.sourceType === "daily_task") return "每日任務";
    if (entry.sourceType === "quick_add") return "快速加星";
    if (entry.sourceType === "quick_deduct") return "快速扣星";
    if (entry.sourceType === "special_reward" || entry.type === "special") return "特殊獎勵";
    if (entry.sourceType === "manual") return "手動補登";
    const matchedTemplate = templates.some(template =>
        template.type === entry.type
        && String(template.title ?? "").trim() === String(entry.title ?? "").trim()
        && finiteInteger(template.amount) === finiteInteger(entry.amount),
    );
    if (matchedTemplate) return entry.type === "deduct" ? "快速扣星" : "快速加星";
    return "手動補登";
}

function dateTimeText(value: unknown, fallback: unknown) {
    const timestamp = analyticsTimestamp(value);
    const fallbackTimestamp = analyticsTimestamp(fallback);
    const selected = Number.isFinite(timestamp) ? timestamp : fallbackTimestamp;
    return Number.isFinite(selected) ? new Date(selected).toISOString() : String(value ?? fallback ?? "");
}

export function buildAnalyticsReport(input: {
    childId: string;
    childName: string;
    range: AnalyticsDateRange;
    todayKey: string;
    entries: AnalyticsReportEntry[];
    redemptions: AnalyticsRedemptionLike[];
    templates: AnalyticsReportTemplate[];
    dailyTasks: DailyTaskDefinition[];
    dailyTaskRecords: DailyTaskRecord[];
    dailyTaskSettings: DailyTaskSettingsMap;
    exportedAt?: string;
}): AnalyticsReport {
    const period = analyticsPeriod(input.range);
    const starAnalysis = getWeeklyStarAnalytics(input.entries, input.childId, period, input.todayKey);
    const entries = input.entries
        .filter(item => item.childId === input.childId && isEffectiveStarRecord(item))
        .filter(item => {
            const date = entryAnalyticsDateKey(item);
            return date >= input.range.start && date <= input.range.end;
        })
        .sort((left, right) => entryAnalyticsTimestamp(left) - entryAnalyticsTimestamp(right));
    const starDetails: StarDetailRow[] = entries
        .filter(item => item.type === "star" || item.type === "deduct" || item.type === "special")
        .map(item => {
            const occurredAt = dateTimeText(item.occurredAt, item.date);
            const createdAt = dateTimeText(item.createdAt, item.date);
            const backfilled = Number.isFinite(Date.parse(occurredAt)) && Number.isFinite(Date.parse(createdAt)) && Math.abs(Date.parse(createdAt) - Date.parse(occurredAt)) > 60_000;
            return {
                occurredAt,
                createdAt,
                type: item.type === "deduct" ? "扣星" : item.type === "special" ? "特殊獎勵" : "加星",
                source: entrySource(item, input.templates),
                content: String(item.title ?? "未命名項目").trim() || "未命名項目",
                amount: finiteInteger(item.amount),
                note: String(item.note ?? "").trim() || (backfilled ? "補登紀錄" : ""),
            };
        });

    const dailyTaskCompletion = buildDailyTaskCompletionSeries({
        childId: input.childId,
        start: input.range.start,
        end: input.range.end,
        todayKey: input.todayKey,
        definitions: input.dailyTasks,
        records: input.dailyTaskRecords,
    });
    const completionExecutions = dailyTaskCompletion.flatMap(day => day.executions);
    const completedTasks = completionExecutions.filter(item => item.status === "completed").length;
    const skippedTasks = completionExecutions.filter(item => item.status === "not_applicable").length;
    const incompleteTasks = completionExecutions.filter(item => item.status === "missed").length;
    const taskRows: DailyTaskReportRow[] = completionExecutions.map(execution => ({
        date: execution.date,
        title: execution.title,
        status: execution.status === "completed" ? "已完成" : execution.status === "not_applicable" ? "今日不適用" : execution.status === "in_progress" ? "進行中" : "未完成",
        completedAt: execution.completedAt || "",
        rewardStars: execution.rewardStars,
        applicableChild: input.childName,
    }));

    const dailyMap = new Map(input.range.days.map(date => [date, {
        date,
        added: 0,
        deducted: 0,
        special: 0,
        scheduledTasks: 0,
        completedTasks: 0,
        incompleteTasks: 0,
        skippedTasks: 0,
    }]));
    for (const entry of entries) {
        const day = dailyMap.get(entryAnalyticsDateKey(entry));
        if (!day) continue;
        const amount = finiteInteger(entry.amount);
        if (entry.type === "star") day.added += amount;
        else if (entry.type === "deduct") day.deducted += amount;
        else if (entry.type === "special") day.special += amount;
    }
    for (const metric of dailyTaskCompletion) {
        const day = dailyMap.get(metric.date);
        if (!day) continue;
        day.scheduledTasks = metric.scheduledCount;
        day.completedTasks = metric.completedCount;
        day.skippedTasks = metric.notApplicableCount;
        day.incompleteTasks = metric.missedCount + metric.inProgressCount;
    }
    const dailyStatistics: DailyStatisticsRow[] = [...dailyMap.values()].map(day => {
        const effective = day.completedTasks + day.incompleteTasks;
        return {
            ...day,
            net: day.added - day.deducted,
            completionRate: effective ? Math.round(day.completedTasks / effective * 100) : null,
        };
    });

    const redemptionRows = input.redemptions
        .filter(item => item.childId === input.childId)
        .map(item => ({ item, timestamp: redemptionTimestamp(item) }))
        .filter(({ item, timestamp }) => {
            const date = Number.isFinite(timestamp) ? taipeiDateKey(timestamp) : analyticsDateKey(item.date);
            return date >= input.range.start && date <= input.range.end;
        })
        .sort((left, right) => left.timestamp - right.timestamp)
        .map(({ item, timestamp }): RedemptionReportRow => {
            const quantity = Math.max(1, finiteInteger(item.quantity) || 1);
            const snapshotCost = Number(item.costSnapshot);
            const legacyCost = Number(item.cost);
            const unitCost = Math.max(0, Math.trunc(Number.isFinite(snapshotCost) ? snapshotCost : Number.isFinite(legacyCost) ? legacyCost : 0));
            const plannedTotal = redemptionStarCost(item);
            return {
                redeemedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : String(item.date ?? ""),
                rewardName: String(item.rewardNameSnapshot ?? item.reward ?? "未命名獎品").trim() || "未命名獎品",
                quantity,
                unitCost,
                totalCost: isCompletedStarRedemption(item) ? plannedTotal : 0,
                status: redemptionStatus(item),
            };
        });
    const completedRows = redemptionRows.filter(item => item.status === "已完成");
    const groupedRedemptions = getWeeklyRedemptionSummary(input.redemptions, input.childId, period);
    const mostFrequentReward = [...groupedRedemptions].sort((a, b) => b.quantity - a.quantity || b.totalCost - a.totalCost || a.name.localeCompare(b.name, "zh-TW"))[0]?.name || "無";
    const highestCostReward = [...groupedRedemptions].sort((a, b) => b.totalCost - a.totalCost || b.quantity - a.quantity || a.name.localeCompare(b.name, "zh-TW"))[0]?.name || "無";
    const special = entries.filter(item => item.type === "special").reduce((sum, item) => sum + finiteInteger(item.amount), 0);
    const redemptionCost = completedRows.reduce((sum, item) => sum + item.totalCost, 0);
    const taskHealth = buildTaskHealthMetrics({
        childId: input.childId,
        start: input.range.start,
        end: input.range.end,
        todayKey: input.todayKey,
        definitions: input.dailyTasks,
        records: input.dailyTaskRecords,
    });
    const graduatedHabits = buildGraduatedHabitMetrics({
        childId: input.childId,
        todayKey: input.todayKey,
        definitions: input.dailyTasks,
        records: input.dailyTaskRecords,
    });

    return {
        childName: input.childName,
        range: input.range,
        exportedAt: input.exportedAt || new Date().toISOString(),
        starAnalysis,
        summary: {
            added: starAnalysis.starTotal,
            deducted: starAnalysis.deductTotal,
            special,
            net: starAnalysis.net,
            redemptionCost,
            taskCompletionRate: calculateWeightedCompletionRate(dailyTaskCompletion, { excludeTodayInProgress: true }),
            streak: calculateTaskStreak(
                input.dailyTaskRecords.filter(item => item.childId === input.childId),
                taskSettingsForChild(input.dailyTaskSettings, input.childId),
                input.todayKey,
            ),
            completedTasks,
            incompleteTasks,
            skippedTasks,
        },
        starDetails,
        dailyStatistics,
        taskRows,
        dailyTaskCompletion,
        taskHealth,
        graduatedHabits,
        redemptionRows,
        redemptionSummary: {
            count: completedRows.length,
            quantity: completedRows.reduce((sum, item) => sum + item.quantity, 0),
            totalCost: redemptionCost,
            mostFrequentReward,
            highestCostReward,
        },
    };
}
