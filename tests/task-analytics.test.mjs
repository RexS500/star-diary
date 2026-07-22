import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDailyTaskCompletionSeries,
  buildGraduatedHabitMetrics,
  buildTaskHealthMetrics,
  calculateWeightedCompletionRate,
} from "../app/task-analytics.ts";
import { addCalendarDays, isTaskScheduled } from "../app/daily-task-logic.ts";

const todayKey = "2026-07-22";
const task = (patch = {}) => ({
  id: "task-1", applicableChildIds: ["c1"], title: "閱讀 10 分鐘", icon: "📚", rewardStars: 1,
  weekdays: [1, 2, 3, 4, 5, 6, 7], enabled: true, sortOrder: 0,
  createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z", scheduleStart: "2026-06-01",
  ...patch,
});
const record = (date, status = "completed", patch = {}) => ({
  id: `${patch.definitionId || "task-1"}-${date}-${status}`, definitionId: "task-1", childId: "c1", date,
  titleSnapshot: "閱讀 10 分鐘", iconSnapshot: "📚", rewardStarsSnapshot: 1, status,
  completedAt: status === "completed" ? `${date}T10:00:00.000Z` : undefined,
  createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`, ...patch,
});

test("daily completion uses scheduled executions and excludes not-applicable records", () => {
  const date = "2026-07-20";
  const records = [0, 1, 2, 3].map(index => record(date, "completed", { id: `done-${index}`, definitionId: `t-${index}` }));
  records.push(record(date, "pending", { id: "miss", definitionId: "t-4" }));
  records.push(record(date, "skipped", { id: "skip", definitionId: "t-5" }));
  const [day] = buildDailyTaskCompletionSeries({ childId: "c1", start: date, end: date, todayKey, definitions: [], records });
  assert.equal(day.scheduledCount, 5);
  assert.equal(day.completedCount, 4);
  assert.equal(day.missedCount, 1);
  assert.equal(day.notApplicableCount, 1);
  assert.equal(day.completionRate, 80);
});

test("current-definition backfill belongs to its task date and increases numerator and denominator", () => {
  const date = "2026-07-21";
  const [day] = buildDailyTaskCompletionSeries({
    childId: "c1", start: date, end: date, todayKey, definitions: [task()],
    records: [record(date, "completed", { backfilledAt: "2026-07-22T03:00:00.000Z", backfillSource: "current_definition" })],
  });
  assert.equal(day.scheduledCount, 1);
  assert.equal(day.completedCount, 1);
  assert.equal(day.backfilledCount, 1);
  assert.equal(day.completionRate, 100);
});

test("today pending is in progress and excluded from weighted health averages", () => {
  const days = buildDailyTaskCompletionSeries({ childId: "c1", start: todayKey, end: todayKey, todayKey, definitions: [task()], records: [record(todayKey, "pending")] });
  assert.equal(days[0].inProgressCount, 1);
  assert.equal(days[0].missedCount, 0);
  assert.equal(days[0].isTodayInProgress, true);
  assert.equal(calculateWeightedCompletionRate(days, { excludeTodayInProgress: true }), null);
});

test("historical snapshots win over changed current definitions", () => {
  const date = "2026-07-20";
  const [day] = buildDailyTaskCompletionSeries({
    childId: "c1", start: date, end: date, todayKey,
    definitions: [task({ title: "新的任務名稱", rewardStars: 5 })],
    records: [record(date, "completed", { titleSnapshot: "舊的任務名稱", rewardStarsSnapshot: 1 })],
  });
  assert.equal(day.executions[0].title, "舊的任務名稱");
  assert.equal(day.executions[0].rewardStars, 1);
});

test("health thresholds, maturity, and completion streaks use weighted executions", () => {
  const records = Array.from({ length: 20 }, (_, index) => {
    const date = addCalendarDays("2026-07-02", index);
    return record(date, index === 0 ? "pending" : "completed", { id: `r-${index}` });
  });
  const [metric] = buildTaskHealthMetrics({ childId: "c1", start: "2026-07-02", end: "2026-07-21", todayKey, definitions: [task()], records });
  assert.equal(metric.scheduledCount, 20);
  assert.equal(metric.completionRate, 95);
  assert.equal(metric.currentCompletionStreak, 19);
  assert.equal(metric.healthStatus, "established");
  assert.equal(metric.maturityStatus, "established");
});

test("insufficient data and needs-review states are distinct", () => {
  const insufficient = buildTaskHealthMetrics({ childId: "c1", start: "2026-07-20", end: "2026-07-21", todayKey, definitions: [task()], records: [record("2026-07-20"), record("2026-07-21")] })[0];
  assert.equal(insufficient.healthStatus, "insufficient_data");
  const low = buildTaskHealthMetrics({ childId: "c1", start: "2026-07-17", end: "2026-07-21", todayKey, definitions: [task()], records: [record("2026-07-17"), record("2026-07-18"), record("2026-07-19", "pending"), record("2026-07-20", "pending"), record("2026-07-21", "pending")] })[0];
  assert.equal(low.completionRate, 40);
  assert.equal(low.healthStatus, "needs_review");
});

test("miss streak ignores not-applicable executions and backfill ratio creates a neutral recommendation", () => {
  const records = [
    record("2026-07-16", "completed", { backfilledAt: "2026-07-17T00:00:00.000Z" }),
    record("2026-07-17", "completed", { backfilledAt: "2026-07-18T00:00:00.000Z" }),
    record("2026-07-18", "completed", { backfilledAt: "2026-07-19T00:00:00.000Z" }),
    record("2026-07-19", "completed"), record("2026-07-20", "completed"),
    record("2026-07-21", "pending"), record("2026-07-20", "skipped", { id: "skipped-extra", definitionId: "task-2" }),
  ];
  const [metric] = buildTaskHealthMetrics({ childId: "c1", start: "2026-07-16", end: "2026-07-21", todayKey, definitions: [task()], records });
  assert.equal(metric.currentMissStreak, 1);
  assert.equal(metric.backfillRatio, 0.6);
  assert.ok(metric.recommendations.some(item => item.includes("提醒時間")));
});

test("graduated tasks stop scheduling while keeping history and graduation metrics", () => {
  const graduated = task({ habitStatus: "graduated", enabled: false, graduatedAt: "2026-07-21T09:00:00.000Z", habitHistory: [{ status: "graduated", at: "2026-07-21T09:00:00.000Z" }] });
  assert.equal(isTaskScheduled(graduated, "2026-07-22"), false);
  const metrics = buildGraduatedHabitMetrics({ childId: "c1", todayKey, definitions: [graduated], records: [record("2026-07-20"), record("2026-07-21")] });
  assert.equal(metrics[0].totalCompleted, 2);
  assert.equal(metrics[0].lastThirtyDaysRate, 100);
  assert.equal(metrics[0].graduationCount, 1);
});
