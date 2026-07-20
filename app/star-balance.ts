export type StarBalanceEntryLike = {
    id?: string;
    childId?: string;
    title?: string;
    amount?: number;
    type?: string;
    date?: string;
    status?: string;
    sourceType?: string;
    occurredAt?: string;
    createdAt?: string;
    revokedAt?: string;
    deletedAt?: string;
    deleteFlag?: unknown;
    deleted?: unknown;
    isDeleted?: unknown;
    isCompleted?: unknown;
};

export type StarBalanceRedemptionLike = {
    id?: string;
    childId?: string;
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
    deletedAt?: string;
    deleteFlag?: unknown;
    deleted?: unknown;
    isDeleted?: unknown;
};

export type StarBalanceLine = {
    id: string;
    kind: "entry" | "redemption";
    date: string;
    title: string;
    type: string;
    sourceType: string;
    amount: number;
    delta: number;
    included: boolean;
    reason: string;
    timestamp: number;
};

export type ChildStarBalance = {
    childId: string;
    added: number;
    deducted: number;
    redemptionSpent: number;
    rawTotal: number;
    total: number;
    lines: StarBalanceLine[];
};

const completedRedemptionStatuses = new Set(["completed", "redeemed", "fulfilled"]);

function finiteInteger(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.abs(Math.trunc(number)) : 0;
}

function enabledFlag(value: unknown) {
    return value === true || value === 1 || String(value).toLocaleLowerCase() === "true";
}

function isDeletedRecord(record: { deletedAt?: string; deleteFlag?: unknown; deleted?: unknown; isDeleted?: unknown }) {
    return Boolean(record.deletedAt) || enabledFlag(record.deleteFlag) || enabledFlag(record.deleted) || enabledFlag(record.isDeleted);
}

function recordTimestamp(values: unknown[]) {
    for (const value of values) {
        if (typeof value !== "string" || !value.trim()) continue;
        const timestamp = Date.parse(value);
        if (Number.isFinite(timestamp)) return timestamp;
    }
    return Number.NEGATIVE_INFINITY;
}

function entryExclusionReason(entry: StarBalanceEntryLike) {
    if (isDeletedRecord(entry)) return "已刪除";
    if (entry.revokedAt || String(entry.status ?? "").toLocaleLowerCase() === "revoked") return "已撤銷";
    if (entry.isCompleted === false || String(entry.status ?? "completed").toLocaleLowerCase() !== "completed") return "尚未完成或等待確認";
    if (entry.type !== "star" && entry.type !== "deduct" && entry.type !== "special") return "不支援的紀錄類型";
    if (!finiteInteger(entry.amount)) return "星星數量無效";
    return "";
}

export function isEffectiveStarRecord(entry: StarBalanceEntryLike) {
    return entryExclusionReason(entry) === "";
}

export function starEntryBalanceLine(entry: StarBalanceEntryLike): StarBalanceLine {
    const amount = finiteInteger(entry.amount), baseReason = entryExclusionReason(entry);
    const balanceType = entry.type === "star" || entry.type === "deduct";
    const included = !baseReason && balanceType;
    const reason = baseReason || (entry.type === "special" ? "特殊獎勵只影響庫存，不影響星星餘額" : "納入星星餘額");
    return {
        id: String(entry.id ?? ""),
        kind: "entry",
        date: String(entry.occurredAt ?? entry.date ?? entry.createdAt ?? ""),
        title: String(entry.title ?? "未命名紀錄").trim() || "未命名紀錄",
        type: String(entry.type ?? "unknown"),
        sourceType: String(entry.sourceType ?? "legacy"),
        amount,
        delta: included ? (entry.type === "deduct" ? -amount : amount) : 0,
        included,
        reason,
        timestamp: recordTimestamp([entry.occurredAt, entry.createdAt, entry.date]),
    };
}

export function isCompletedStarRedemption(redemption: StarBalanceRedemptionLike) {
    if (isDeletedRecord(redemption)) return false;
    return completedRedemptionStatuses.has(String(redemption.status ?? "completed").toLocaleLowerCase());
}

export function redemptionStarCost(redemption: StarBalanceRedemptionLike) {
    if (redemption.source === "special") return 0;
    const quantity = Math.max(1, finiteInteger(redemption.quantity) || 1);
    const explicitTotal = Number(redemption.totalCost);
    if (Number.isFinite(explicitTotal)) return Math.max(0, Math.trunc(explicitTotal));
    const snapshotCost = Number(redemption.costSnapshot);
    if (Number.isFinite(snapshotCost)) return Math.max(0, Math.trunc(snapshotCost)) * quantity;
    const legacyCost = Number(redemption.cost);
    return Number.isFinite(legacyCost) ? Math.max(0, Math.trunc(legacyCost)) : 0;
}

export function redemptionBalanceLine(redemption: StarBalanceRedemptionLike): StarBalanceLine {
    const completed = isCompletedStarRedemption(redemption), cost = redemptionStarCost(redemption), special = redemption.source === "special";
    const included = completed && !special && cost > 0;
    return {
        id: String(redemption.id ?? ""),
        kind: "redemption",
        date: String(redemption.completedAt ?? redemption.createdAt ?? redemption.updatedAt ?? redemption.date ?? ""),
        title: String(redemption.rewardNameSnapshot ?? redemption.reward ?? "未命名獎品").trim() || "未命名獎品",
        type: "redemption",
        sourceType: String(redemption.source ?? "star"),
        amount: cost,
        delta: included ? -cost : 0,
        included,
        reason: !completed ? "兌換尚未完成" : special ? "特殊獎勵兌換不消耗星星" : cost <= 0 ? "兌換未消耗星星" : "納入星星餘額",
        timestamp: recordTimestamp([redemption.completedAt, redemption.createdAt, redemption.updatedAt, redemption.date]),
    };
}

export function calculateChildStarBalance(entries: StarBalanceEntryLike[], redemptions: StarBalanceRedemptionLike[], childId: string): ChildStarBalance {
    const lines = [
        ...entries.filter(entry => entry.childId === childId).map(starEntryBalanceLine),
        ...redemptions.filter(redemption => redemption.childId === childId).map(redemptionBalanceLine),
    ].sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));
    const included = lines.filter(line => line.included);
    const added = included.filter(line => line.kind === "entry" && line.delta > 0).reduce((sum, line) => sum + line.delta, 0);
    const deducted = included.filter(line => line.kind === "entry" && line.delta < 0).reduce((sum, line) => sum + Math.abs(line.delta), 0);
    const redemptionSpent = included.filter(line => line.kind === "redemption").reduce((sum, line) => sum + Math.abs(line.delta), 0);
    const rawTotal = added - deducted - redemptionSpent;
    return { childId, added, deducted, redemptionSpent, rawTotal, total: Math.max(0, rawTotal), lines };
}

export function reconcileChildStarBalances<T extends { id: string; stars?: unknown }>(children: T[], entries: StarBalanceEntryLike[], redemptions: StarBalanceRedemptionLike[]): Array<T & { stars: number }> {
    return children.map(child => ({ ...child, stars: calculateChildStarBalance(entries, redemptions, child.id).total }));
}

export function likelyMissingBalanceLine(report: ChildStarBalance, cachedTotal: number) {
    const difference = report.total - cachedTotal;
    if (!difference) return null;
    return [...report.lines]
        .filter(line => line.included && line.delta === difference && report.total - line.delta === cachedTotal)
        .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;
}

export function logStarBalanceDebug(input: { childName: string; report: ChildStarBalance; cachedTotal: number; displayedTotal: number }) {
    const { childName, report, cachedTotal, displayedTotal } = input;
    console.groupCollapsed(`⭐ 星星餘額 Debug：${childName}`);
    console.log("====================");
    console.log("目前所有紀錄：");
    console.table(report.lines.map(line => ({
        日期: line.date,
        名稱: line.title,
        Type: line.type,
        來源: line.sourceType,
        星星: line.delta > 0 ? `+${line.delta}` : String(line.delta),
        是否納入計算: line.included ? "✅" : "❌",
        原因: line.reason,
    })));
    console.log(`Reduce Total = ${report.total}`);
    console.log(`首頁目前顯示 = ${displayedTotal}`);
    console.log(`舊 children.stars 快取 = ${cachedTotal}`);
    const missing = likelyMissingBalanceLine(report, cachedTotal);
    if (cachedTotal !== report.total) console.warn(missing ? `快取未同步的紀錄：${missing.date}｜${missing.title}｜${missing.delta > 0 ? "+" : ""}${missing.delta}` : `快取與紀錄相差 ${report.total - cachedTotal} 顆，舊資料沒有逐筆餘額稽核，無法唯一定位單筆紀錄。`);
    console.groupEnd();
}
