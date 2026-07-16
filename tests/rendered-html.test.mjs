import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Star Diary keeps its production metadata and application shell", async () => {
  const [layout, page, home] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /lang="zh-Hant"/);
  assert.match(layout, /title:\s*"星星日記｜家庭獎勵追蹤"/);
  assert.match(page, /<StarHome\s*\/>/);
  assert.match(home, /正在載入家庭資料/);
  assert.doesNotMatch(`${layout}\n${page}\n${home}`, /codex-preview|Your site is taking shape|Codex is working/i);
});

test("daily tasks are connected to settings, challenge navigation and server actions", async () => {
  const [home, route, css] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(home, /每日任務設定/);
  assert.match(home, /任務挑戰/);
  assert.match(home, /今日獲得/);
  assert.match(home, /本週完成率/);
  assert.match(home, /連續達標/);
  assert.match(route, /child_daily_task_complete/);
  assert.match(route, /parent_daily_task_action/);
  assert.match(route, /sourceType:\s*"daily_task"/);
  assert.match(css, /\.daily-task-settings-card/);
  assert.match(css, /\.task-card-grid/);
});
