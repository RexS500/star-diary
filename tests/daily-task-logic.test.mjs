import assert from "node:assert/strict";
import test from "node:test";

import {
  addCalendarDays,
  calculateTaskStreak,
  goalResult,
  isCalendarDateKey,
  isTaskScheduled,
  taskProgress,
  taipeiDateKey,
  weekStartDateKey,
  weeklyTaskProgress,
} from "../app/daily-task-logic.ts";

const settings = (goalMode = "percentage", goalValue = 80) => ({ goalMode, goalValue, completionMode: "instant" });
const record = (date, status, suffix = "1") => ({
  id: `${date}-${suffix}`,
  definitionId: `task-${suffix}`,
  childId: "c1",
  date,
  titleSnapshot: "整理書包",
  iconSnapshot: "🎒",
  rewardStarsSnapshot: 2,
  status,
  createdAt: `${date}T00:00:00.000Z`,
  updatedAt: `${date}T00:00:00.000Z`,
});

test("uses Asia/Taipei at the UTC midnight boundary", () => {
  assert.equal(taipeiDateKey("2026-07-15T15:59:59Z"), "2026-07-15");
  assert.equal(taipeiDateKey("2026-07-15T16:00:00Z"), "2026-07-16");
});

test("week starts on Monday", () => {
  assert.equal(weekStartDateKey("2026-07-19"), "2026-07-13");
  assert.equal(weekStartDateKey("2026-07-20"), "2026-07-20");
});

test("calendar helpers reject impossible dates and handle boundaries", () => {
  assert.equal(isCalendarDateKey("2026-02-29"), false);
  assert.equal(isCalendarDateKey("2024-02-29"), true);
  assert.equal(addCalendarDays("2024-02-29", 1), "2024-03-01");
  assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
});

test("scheduled tasks respect enabled state, start date and weekday", () => {
  const task = { enabled: true, scheduleStart: "2026-07-16", weekdays: [4] };
  assert.equal(isTaskScheduled(task, "2026-07-16"), true);
  assert.equal(isTaskScheduled(task, "2026-07-15"), false);
  assert.equal(isTaskScheduled({ ...task, enabled: false }, "2026-07-16"), false);
  assert.equal(isTaskScheduled({ ...task, weekdays: [5] }, "2026-07-16"), false);
});

test("skipped tasks leave both numerator and denominator", () => {
  assert.deepEqual(taskProgress([
    record("2026-07-16", "completed", "1"),
    record("2026-07-16", "completed", "2"),
    record("2026-07-16", "pending", "3"),
    record("2026-07-16", "skipped", "4"),
  ]), { completed: 2, total: 3, percentage: 67 });
});

test("supports all, percentage and count goals", () => {
  assert.equal(goalResult({ completed: 4, total: 4, percentage: 100 }, settings("all", 1)).met, true);
  assert.equal(goalResult({ completed: 3, total: 4, percentage: 75 }, settings("all", 1)).met, false);
  assert.equal(goalResult({ completed: 4, total: 5, percentage: 80 }, settings("percentage", 80)).met, true);
  assert.equal(goalResult({ completed: 3, total: 4, percentage: 75 }, settings("percentage", 80)).met, false);
  assert.equal(goalResult({ completed: 3, total: 5, percentage: 60 }, settings("count", 3)).met, true);
  assert.equal(goalResult({ completed: 3, total: 3, percentage: 100 }, settings("count", 5)).met, true);
  assert.equal(goalResult({ completed: 0, total: 0, percentage: null }, settings()).evaluable, false);
});

test("weekly completion rate uses Monday through today and excludes skipped", () => {
  const records = [
    record("2026-07-13", "completed", "1"), record("2026-07-13", "completed", "2"), record("2026-07-13", "skipped", "3"),
    record("2026-07-14", "completed", "4"), record("2026-07-14", "pending", "5"),
    record("2026-07-15", "skipped", "6"),
    record("2026-07-16", "pending", "7"), record("2026-07-16", "pending", "8"),
    record("2026-07-17", "completed", "9"),
  ];
  assert.deepEqual(weeklyTaskProgress(records, "2026-07-16"), { completed: 3, total: 6, percentage: 50 });
});

test("today does not break a streak before the day ends", () => {
  const previous = [
    record("2026-07-13", "completed", "1"),
    record("2026-07-14", "completed", "2"),
    record("2026-07-15", "skipped", "3"),
  ];
  assert.equal(calculateTaskStreak([...previous, record("2026-07-16", "pending", "4")], settings("all", 1), "2026-07-16"), 2);
  assert.equal(calculateTaskStreak([...previous, record("2026-07-16", "completed", "4")], settings("all", 1), "2026-07-16"), 3);
  assert.equal(calculateTaskStreak([record("2026-07-14", "completed", "1"), record("2026-07-15", "pending", "2"), record("2026-07-16", "pending", "3")], settings("all", 1), "2026-07-16"), 0);
});

test("streak uses each historical day's saved goal", () => {
  const historical = ["1", "2", "3", "4"].map(suffix => ({ ...record("2026-07-15", "completed", suffix), goalModeSnapshot: "percentage", goalValueSnapshot: 80 }));
  historical.push({ ...record("2026-07-15", "pending", "5"), goalModeSnapshot: "percentage", goalValueSnapshot: 80 });
  assert.equal(calculateTaskStreak([...historical, record("2026-07-16", "pending", "6")], settings("all", 1), "2026-07-16"), 1);
});
