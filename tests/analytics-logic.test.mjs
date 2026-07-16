import assert from "node:assert/strict";
import test from "node:test";

import {
  categoryColor,
  getWeekPeriods,
  getWeeklyRedemptionSummary,
  getWeeklyStarAnalytics,
  normalizeRecordCategory,
  sortRedemptionSummary,
} from "../app/analytics-logic.ts";

const entry = (overrides = {}) => ({
  id: crypto.randomUUID(),
  childId: "c1",
  title: "整理書包",
  amount: 2,
  type: "star",
  date: "2026/7/16 18:30:00",
  status: "completed",
  ...overrides,
});

test("weekly periods use Sunday through Saturday and always contain seven days", () => {
  const periods = getWeekPeriods("2026-07-17");
  assert.deepEqual([periods.current.start, periods.current.end], ["2026-07-12", "2026-07-18"]);
  assert.deepEqual([periods.previous.start, periods.previous.end], ["2026-07-05", "2026-07-11"]);
  assert.deepEqual(periods.current.days, [
    "2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18",
  ]);
});

test("weekly star analytics keeps empty and future days while aggregating matching records", () => {
  const period = getWeekPeriods("2026-07-17").current;
  const analytics = getWeeklyStarAnalytics([
    entry(),
    entry({ id: "second", amount: 3 }),
    entry({ id: "deduct", title: "打架", type: "deduct", amount: -2 }),
    entry({ id: "other-child", childId: "c2", amount: 99 }),
    entry({ id: "pending", status: "pending", amount: 99 }),
    entry({ id: "special", type: "special", amount: 10 }),
  ], "c1", period, "2026-07-17");

  assert.equal(analytics.days.length, 7);
  assert.equal(analytics.days[0].starTotal, 0);
  assert.equal(analytics.days[4].starTotal, 5);
  assert.equal(analytics.days[4].starItems[0].count, 2);
  assert.equal(analytics.days[4].deductTotal, 2);
  assert.equal(analytics.starTotal, 5);
  assert.equal(analytics.deductTotal, 2);
  assert.equal(analytics.net, 3);
  assert.equal(analytics.days[6].isFuture, true);
});

test("daily task categories keep the task name and use stable type-specific colors", () => {
  const category = normalizeRecordCategory(entry({
    title: "每日任務：游泳訓練",
    sourceType: "daily_task",
  }));
  assert.equal(category?.label, "游泳訓練");
  assert.match(category?.key ?? "", /daily_task/);
  assert.equal(categoryColor(category.key, "star"), categoryColor(category.key, "star"));
  assert.notEqual(categoryColor(category.key, "star"), categoryColor(category.key, "deduct"));
});

test("redemptions group snapshot names and use the actual historical total cost", () => {
  const period = getWeekPeriods("2026-07-17").current;
  const summary = getWeeklyRedemptionSummary([
    { id: "1", childId: "c1", reward: "冰淇淋", cost: 12, date: "2026/7/15 18:00:00", status: "completed" },
    { id: "2", childId: "c1", reward: " 冰淇淋 ", costSnapshot: 10, quantity: 2, date: "2026/7/16 18:00:00", status: "completed" },
    { id: "3", childId: "c1", rewardNameSnapshot: "遊戲機", totalCost: 30, quantity: 2, date: "2026/7/14 18:00:00", status: "completed" },
    { id: "4", childId: "c1", reward: "未確認", cost: 100, date: "2026/7/15 18:00:00", status: "pending" },
    { id: "5", childId: "c2", reward: "別人", cost: 100, date: "2026/7/15 18:00:00", status: "completed" },
  ], "c1", period);

  assert.deepEqual(summary.map(item => [item.name, item.quantity, item.totalCost]), [
    ["冰淇淋", 3, 32],
    ["遊戲機", 2, 30],
  ]);
});

test("redemption sorting supports each column and stable tie breakers", () => {
  const items = [
    { key: "b", name: "糖果", quantity: 2, totalCost: 10, latestAt: 20 },
    { key: "a", name: "冰淇淋", quantity: 3, totalCost: 10, latestAt: 10 },
    { key: "c", name: "電影", quantity: 1, totalCost: 30, latestAt: 30 },
  ];
  assert.deepEqual(sortRedemptionSummary(items, "totalCost", "desc").map(item => item.name), ["電影", "冰淇淋", "糖果"]);
  assert.deepEqual(sortRedemptionSummary(items, "quantity", "desc").map(item => item.name), ["冰淇淋", "糖果", "電影"]);
  assert.deepEqual(sortRedemptionSummary(items, "name", "asc").map(item => item.name), ["冰淇淋", "電影", "糖果"]);
  assert.deepEqual(sortRedemptionSummary(items, "latestAt", "desc").map(item => item.name), ["電影", "糖果", "冰淇淋"]);
});
