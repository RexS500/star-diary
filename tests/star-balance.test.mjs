import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateChildStarBalance,
  likelyMissingBalanceLine,
  reconcileChildStarBalances,
} from "../app/star-balance.ts";

test("Vanessa records reduce to 18 and identify the stale cached task reward", () => {
  const childId = "vanessa";
  const entries = [
    { id: "homework", childId, title: "每日任務：完成功課", amount: 1, type: "star", status: "completed", occurredAt: "2026-07-20T13:57:30.061Z" },
    { id: "brush", childId, title: "每日任務：睡前刷牙", amount: 1, type: "star", status: "completed", occurredAt: "2026-07-20T13:42:54.523Z" },
    { id: "dishes", childId, title: "每日任務：收餐具", amount: 1, type: "star", status: "completed", occurredAt: "2026-07-20T13:39:06.767Z" },
    { id: "dress", childId, title: "每日任務：自己起床", amount: 1, type: "star", status: "completed", occurredAt: "2026-07-20T13:39:01.891Z" },
    { id: "exam", childId, title: "英文考試100分", amount: 2, type: "star", status: "completed", sourceType: "manual", occurredAt: "2026-07-20T12:42:00.000Z" },
    { id: "housework-2", childId, title: "幫忙做家事", amount: 1, type: "star", status: "completed", occurredAt: "2026-07-20T12:30:31.448Z" },
    { id: "housework-1", childId, title: "幫忙做家事", amount: 1, type: "star", status: "completed", occurredAt: "2026-07-19T13:21:12.731Z" },
    { id: "sleep", childId, title: "每日任務：準時睡覺", amount: 1, type: "star", status: "completed", occurredAt: "2026-07-19T13:13:23.210Z" },
    { id: "brush-old", childId, title: "每日任務：睡前刷牙", amount: 1, type: "star", status: "completed", occurredAt: "2026-07-19T13:13:20.456Z" },
    { id: "dishes-old", childId, title: "每日任務：收餐具", amount: 1, type: "star", status: "completed", occurredAt: "2026-07-19T13:13:15.783Z" },
    { id: "backfill", childId, title: "之前得到的星星", amount: 5, type: "star", status: "completed", sourceType: "manual", occurredAt: "2026-07-17T09:19:00.000Z", createdAt: "2026-07-19T09:20:21.996Z" },
    { id: "swim-2", childId, title: "每日任務：參加游泳訓練", amount: 1, type: "star", status: "completed", occurredAt: "2026-07-19T03:12:07.829Z" },
    { id: "swim-1", childId, title: "每日任務：參加游泳訓練", amount: 1, type: "star", status: "completed", occurredAt: "2026-07-18T03:24:19.979Z" },
  ];
  const report = calculateChildStarBalance(entries, [], childId);

  assert.equal(report.added, 18);
  assert.equal(report.total, 18);
  assert.equal(report.lines.filter(line => line.included).length, 13);
  assert.equal(likelyMissingBalanceLine(report, 17)?.id, "homework");
});

test("balance rules include manual and backfill records but exclude pending, revoked, deleted and special rewards", () => {
  const entries = [
    { id: "manual", childId: "c1", title: "補登", amount: 10, type: "star", sourceType: "manual", status: "completed" },
    { id: "deduct", childId: "c1", title: "提醒", amount: 2, type: "deduct", status: "completed" },
    { id: "special", childId: "c1", title: "冰淇淋", amount: 8, type: "special", status: "completed" },
    { id: "pending", childId: "c1", title: "待確認", amount: 99, type: "star", status: "pending" },
    { id: "revoked", childId: "c1", title: "已撤銷", amount: 99, type: "star", status: "revoked" },
    { id: "deleted", childId: "c1", title: "已刪除", amount: 99, type: "star", status: "completed", deleteFlag: true },
  ];
  const redemptions = [
    { id: "redeemed", childId: "c1", reward: "獎品", cost: 3, status: "completed", source: "star" },
    { id: "pending-redeem", childId: "c1", reward: "待確認獎品", cost: 30, status: "pending", source: "star" },
    { id: "special-redeem", childId: "c1", reward: "特殊庫存", cost: 30, status: "completed", source: "special" },
  ];
  const report = calculateChildStarBalance(entries, redemptions, "c1");

  assert.deepEqual({ added: report.added, deducted: report.deducted, redemptionSpent: report.redemptionSpent, total: report.total }, { added: 10, deducted: 2, redemptionSpent: 3, total: 5 });
  assert.equal(report.lines.find(line => line.id === "special")?.included, false);
  assert.equal(report.lines.find(line => line.id === "pending")?.included, false);
  assert.equal(report.lines.find(line => line.id === "deleted")?.included, false);
  assert.equal(report.lines.find(line => line.id === "special-redeem")?.included, false);

  const children = reconcileChildStarBalances([{ id: "c1", stars: 999 }, { id: "c2", stars: 7 }], entries, redemptions);
  assert.deepEqual(children.map(child => child.stars), [5, 0]);
});
