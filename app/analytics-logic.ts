import { addCalendarDays, taipeiDateKey } from "./daily-task-logic.ts";

export const ANALYTICS_WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

const STAR_COLORS = ["#2563a6", "#1687a7", "#357a5b", "#6d5bd0", "#c08a19", "#4878bd", "#0f8a8a", "#7b67b5", "#5e8c3f", "#9b7622"];
const DEDUCT_COLORS = ["#b42318", "#c2413a", "#9f322c", "#d05a4e", "#8f2d2a", "#d9685c", "#a6453b", "#c95045"];

export type AnalyticsEntryLike = {
    id?: string;
    childId: string;
    title?: string;
    amount?: number;
    type?: string;
    date?: string;
    status?: string;
    sourceType?: string;
    sourceId?: string;
    createdAt?: string;
};

export type AnalyticsRedemptionLike = {
    id?: string;
    childId: string;
    reward?: string;
    rewardNameSnapshot?: string;
    cost?: number;
    costSnapshot?: number;
    totalCost?: number;
    quantity?: number;
    date?: string;
    status?: string;
    source?: string;
    completedAt?: string;
    createdAt?: string;
    updatedAt?: string;
};

export type WeekPeriod = {
    key: "previous" | "current";
    label: "上週" | "本週";
    start: string;
    end: string;
    days: string[];
};

export type StarCategory = {
    key: string;
    label: string;
    type: "star" | "deduct";
    sourceType: string;
    amount: number;
    count: number;
    color: string;
};

export type DailyStarAnalytics = {
    date: string;
    weekday: typeof ANALYTICS_WEEKDAY_LABELS[number];
    isFuture: boolean;
    starTotal: number;
    deductTotal: number;
    starItems: StarCategory[];
    deductItems: StarCategory[];
};

export type WeeklyStarAnalytics = {
    period: WeekPeriod;
    days: DailyStarAnalytics[];
    starTotal: number;
    deductTotal: number;
    net: number;
    starItems: StarCategory[];
    deductItems: StarCategory[];
    recordCount: number;
};

export type RedemptionSummaryItem = {
    key: string;
    name: string;
    quantity: number;
    totalCost: number;
    latestAt: number;
};

export type RedemptionSortKey = "name" | "quantity" | "totalCost" | "latestAt";
export type SortDirection = "asc" | "desc";

const normalizedText = (value: unknown) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
const comparisonText = (value: unknown) => normalizedText(value).toLocaleLowerCase("zh-TW");
const finiteNumber = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
};
const positiveInteger = (value: unknown, fallback = 1) => {
    const number = finiteNumber(value);
    return number === undefined || number <= 0 ? fallback : Math.max(1, Math.floor(number));
};

function hashText(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return hash >>> 0;
}

export function categoryColor(key: string, type: "star" | "deduct") {
    const palette = type === "deduct" ? DEDUCT_COLORS : STAR_COLORS;
    return palette[hashText(key) % palette.length];
}

export function analyticsTimestamp(value: unknown) {
    if (typeof value !== "string" || !value.trim()) return Number.NaN;
    const text = value.trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return Date.parse(text);
    const match = text.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) return Date.UTC(+match[1], +match[2] - 1, +match[3], +(match[4] || 0) - 8, +(match[5] || 0), +(match[6] || 0));
    return Date.parse(text);
}

export function analyticsDateKey(value: unknown) {
    const timestamp = analyticsTimestamp(value);
    if (Number.isFinite(timestamp)) return taipeiDateKey(timestamp);
    if (typeof value === "string") {
        const match = value.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
        if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    }
    return "";
}

export function entryAnalyticsTimestamp(entry: AnalyticsEntryLike) {
    const created = analyticsTimestamp(entry.createdAt);
    return Number.isFinite(created) ? created : analyticsTimestamp(entry.date);
}

export function entryAnalyticsDateKey(entry: AnalyticsEntryLike) {
    const timestamp = entryAnalyticsTimestamp(entry);
    return Number.isFinite(timestamp) ? taipeiDateKey(timestamp) : analyticsDateKey(entry.date);
}

export function getWeekPeriods(referenceDateKey = taipeiDateKey()): { previous: WeekPeriod; current: WeekPeriod } {
    const reference = new Date(`${referenceDateKey}T00:00:00Z`);
    const currentStart = addCalendarDays(referenceDateKey, -reference.getUTCDay());
    const makePeriod = (key: WeekPeriod["key"], label: WeekPeriod["label"], start: string): WeekPeriod => ({
        key,
        label,
        start,
        end: addCalendarDays(start, 6),
        days: Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index)),
    });
    return {
        previous: makePeriod("previous", "上週", addCalendarDays(currentStart, -7)),
        current: makePeriod("current", "本週", currentStart),
    };
}

export function normalizeRecordCategory(entry: AnalyticsEntryLike): Omit<StarCategory, "amount" | "count" | "color"> | null {
    if (entry.type !== "star" && entry.type !== "deduct") return null;
    const type = entry.type;
    const sourceType = entry.sourceType === "daily_task" ? "daily_task" : type === "star" ? "star_record" : "deduct_record";
    const original = normalizedText(entry.title) || "未命名項目";
    const label = sourceType === "daily_task" ? normalizedText(original.replace(/^每日任務\s*[：:]\s*/u, "")) || "每日任務" : original;
    const key = `${type}:${sourceType}:${comparisonText(label)}`;
    return { key, label, type, sourceType };
}

const categorySort = (a: StarCategory, b: StarCategory) =>
    b.amount - a.amount || b.count - a.count || a.label.localeCompare(b.label, "zh-TW");

export function getWeeklyStarAnalytics(entries: AnalyticsEntryLike[], childId: string, period: WeekPeriod, todayKey = taipeiDateKey()): WeeklyStarAnalytics {
    const dailyMaps = new Map(period.days.map(date => [date, {
        star: new Map<string, StarCategory>(),
        deduct: new Map<string, StarCategory>(),
    }]));
    let recordCount = 0;
    for (const entry of entries) {
        if (entry.childId !== childId || (entry.status ?? "completed") !== "completed") continue;
        const category = normalizeRecordCategory(entry);
        if (!category) continue;
        const date = entryAnalyticsDateKey(entry);
        const daily = dailyMaps.get(date);
        if (!daily) continue;
        const amount = Math.abs(Math.trunc(finiteNumber(entry.amount) ?? 0));
        if (!amount) continue;
        const target = daily[category.type];
        const current = target.get(category.key) ?? { ...category, amount: 0, count: 0, color: categoryColor(category.key, category.type) };
        current.amount += amount;
        current.count += 1;
        target.set(category.key, current);
        recordCount += 1;
    }

    const totals = { star: new Map<string, StarCategory>(), deduct: new Map<string, StarCategory>() };
    const days = period.days.map((date, index): DailyStarAnalytics => {
        const maps = dailyMaps.get(date)!;
        for (const type of ["star", "deduct"] as const) {
            for (const item of maps[type].values()) {
                const current = totals[type].get(item.key) ?? { ...item, amount: 0, count: 0 };
                current.amount += item.amount;
                current.count += item.count;
                totals[type].set(item.key, current);
            }
        }
        const starItems = [...maps.star.values()].sort(categorySort);
        const deductItems = [...maps.deduct.values()].sort(categorySort);
        return {
            date,
            weekday: ANALYTICS_WEEKDAY_LABELS[index],
            isFuture: date > todayKey,
            starTotal: starItems.reduce((sum, item) => sum + item.amount, 0),
            deductTotal: deductItems.reduce((sum, item) => sum + item.amount, 0),
            starItems,
            deductItems,
        };
    });
    const starItems = [...totals.star.values()].sort(categorySort);
    const deductItems = [...totals.deduct.values()].sort(categorySort);
    const starTotal = starItems.reduce((sum, item) => sum + item.amount, 0);
    const deductTotal = deductItems.reduce((sum, item) => sum + item.amount, 0);
    return { period, days, starTotal, deductTotal, net: starTotal - deductTotal, starItems, deductItems, recordCount };
}

function redemptionTimestamp(redemption: AnalyticsRedemptionLike) {
    for (const value of [redemption.completedAt, redemption.createdAt, redemption.updatedAt, redemption.date]) {
        const timestamp = analyticsTimestamp(value);
        if (Number.isFinite(timestamp)) return timestamp;
    }
    return Number.NaN;
}

function validRedemption(redemption: AnalyticsRedemptionLike) {
    const status = (redemption.status ?? "completed").toLocaleLowerCase();
    return status === "completed" || status === "redeemed" || status === "fulfilled";
}

export function getWeeklyRedemptionSummary(redemptions: AnalyticsRedemptionLike[], childId: string, period: WeekPeriod): RedemptionSummaryItem[] {
    const grouped = new Map<string, RedemptionSummaryItem>();
    for (const redemption of redemptions) {
        if (redemption.childId !== childId || !validRedemption(redemption)) continue;
        const timestamp = redemptionTimestamp(redemption);
        const date = Number.isFinite(timestamp) ? taipeiDateKey(timestamp) : analyticsDateKey(redemption.date);
        if (!date || date < period.start || date > period.end) continue;
        const name = normalizedText(redemption.rewardNameSnapshot ?? redemption.reward) || "未命名獎品";
        const key = comparisonText(name);
        const quantity = positiveInteger(redemption.quantity, 1);
        const explicitTotal = finiteNumber(redemption.totalCost);
        const snapshotCost = finiteNumber(redemption.costSnapshot);
        const legacyCost = finiteNumber(redemption.cost);
        const totalCost = Math.max(0, Math.trunc(explicitTotal ?? (snapshotCost === undefined ? (legacyCost ?? 0) : snapshotCost * quantity)));
        const current = grouped.get(key) ?? { key, name, quantity: 0, totalCost: 0, latestAt: Number.NEGATIVE_INFINITY };
        current.quantity += quantity;
        current.totalCost += totalCost;
        current.latestAt = Math.max(current.latestAt, Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY);
        grouped.set(key, current);
    }
    return sortRedemptionSummary([...grouped.values()], "totalCost", "desc");
}

export function sortRedemptionSummary(items: RedemptionSummaryItem[], key: RedemptionSortKey, direction: SortDirection) {
    const sign = direction === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
        const primary = key === "name"
            ? a.name.localeCompare(b.name, "zh-TW")
            : (a[key] - b[key]);
        if (primary) return primary * sign;
        return (b.totalCost - a.totalCost) || (b.quantity - a.quantity) || a.name.localeCompare(b.name, "zh-TW");
    });
}

export function formatWeekRange(period: WeekPeriod) {
    const compact = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
    return `${compact(period.start)}－${compact(period.end)}`;
}

export function formatRedemptionTime(timestamp: number) {
    if (!Number.isFinite(timestamp)) return "時間未記錄";
    return new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(timestamp);
}
