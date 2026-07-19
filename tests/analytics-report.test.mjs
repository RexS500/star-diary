import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnalyticsReport,
  resolveAnalyticsDateRange,
  splitAnalyticsRangeIntoWeekPeriods,
} from "../app/analytics-report.ts";

test("analysis ranges resolve to stable calendar boundaries", () => {
  assert.deepEqual(resolveAnalyticsDateRange({ preset: "last_30_days", todayKey: "2026-07-19" }), {
    preset: "last_30_days",
    label: "最近 30 天",
    start: "2026-06-20",
    end: "2026-07-19",
    days: Array.from({ length: 30 }, (_, index) => new Date(Date.UTC(2026, 5, 20 + index)).toISOString().slice(0, 10)),
  });
  assert.equal(resolveAnalyticsDateRange({ preset: "previous_month", todayKey: "2026-01-10" }).start, "2025-12-01");
  assert.equal(resolveAnalyticsDateRange({ preset: "previous_month", todayKey: "2026-01-10" }).end, "2025-12-31");
  assert.equal(resolveAnalyticsDateRange({ preset: "all", todayKey: "2026-07-19", earliestDate: "2025-03-02" }).start, "2025-03-02");
  assert.equal(resolveAnalyticsDateRange({ preset: "custom", todayKey: "2026-07-19", customStart: "2026-07-20", customEnd: "2026-07-02" }).start, "2026-07-02");
});

test("default two-week charts stay as two independent seven-day periods", () => {
  const range = resolveAnalyticsDateRange({ preset: "two_weeks", todayKey: "2026-07-19" });
  const periods = splitAnalyticsRangeIntoWeekPeriods(range, "2026-07-19");
  assert.deepEqual(periods.map(period => period.label), ["上週", "本週"]);
  assert.deepEqual(periods.map(period => period.days.length), [7, 7]);
  assert.equal(periods[0].end, "2026-07-18");
  assert.equal(periods[1].start, "2026-07-19");
});

test("report keeps redemption costs separate and includes zero-value calendar days", () => {
  const range = resolveAnalyticsDateRange({ preset: "custom", todayKey: "2026-07-19", customStart: "2026-07-17", customEnd: "2026-07-19" });
  const report = buildAnalyticsReport({
    childId: "c1",
    childName: "Vanessa",
    range,
    todayKey: "2026-07-19",
    templates: [{ id: "quick-1", title: "整理書包", amount: 2, type: "star" }],
    entries: [
      { id: "e1", childId: "c1", title: "整理書包", amount: 2, type: "star", date: "2026-07-17 08:00", occurredAt: "2026-07-17T00:00:00.000Z", createdAt: "2026-07-17T00:00:00.000Z", status: "completed", sourceType: "quick_add" },
      { id: "e2", childId: "c1", title: "打架", amount: 1, type: "deduct", date: "2026-07-17 09:00", occurredAt: "2026-07-17T01:00:00.000Z", createdAt: "2026-07-17T01:00:00.000Z", status: "completed", sourceType: "quick_deduct" },
      { id: "e3", childId: "c1", title: "特別貼紙", amount: 3, type: "special", date: "2026-07-18 10:00", occurredAt: "2026-07-18T02:00:00.000Z", createdAt: "2026-07-18T02:00:00.000Z", status: "completed", sourceType: "special_reward" },
    ],
    redemptions: [{ id: "r1", childId: "c1", reward: "冰淇淋", cost: 12, quantity: 2, totalCost: 24, date: "2026-07-18 18:00", createdAt: "2026-07-18T10:00:00.000Z", status: "completed" }],
    dailyTasks: [],
    dailyTaskRecords: [
      { id: "d1", definitionId: "task-1", childId: "c1", date: "2026-07-17", titleSnapshot: "刷牙", iconSnapshot: "🪥", rewardStarsSnapshot: 1, status: "completed", completedAt: "2026-07-17T12:00:00.000Z", createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T12:00:00.000Z" },
      { id: "d2", definitionId: "task-2", childId: "c1", date: "2026-07-17", titleSnapshot: "閱讀", iconSnapshot: "📚", rewardStarsSnapshot: 1, status: "skipped", createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T12:00:00.000Z" },
    ],
    dailyTaskSettings: {},
    exportedAt: "2026-07-19T04:00:00.000Z",
  });
  assert.equal(report.summary.added, 2);
  assert.equal(report.summary.deducted, 1);
  assert.equal(report.summary.net, 1);
  assert.equal(report.summary.special, 3);
  assert.equal(report.summary.redemptionCost, 24);
  assert.equal(report.redemptionSummary.quantity, 2);
  assert.equal(report.dailyStatistics.length, 3);
  assert.deepEqual(report.dailyStatistics.at(-1), { date: "2026-07-19", added: 0, deducted: 0, special: 0, scheduledTasks: 0, completedTasks: 0, incompleteTasks: 0, skippedTasks: 0, net: 0, completionRate: null });
  assert.deepEqual(report.starDetails.map(row => row.source), ["快速加星", "快速扣星", "特殊獎勵"]);
  assert.deepEqual(report.taskRows.map(row => row.status), ["已完成", "今日不適用"]);
});
