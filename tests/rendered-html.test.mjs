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

test("family settings use a reversible draft and a safe-area sticky save bar", async () => {
  const [home, css, draft] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/settings-draft.ts", import.meta.url), "utf8"),
  ]);
  assert.match(home, /你有尚未儲存的設定/);
  assert.match(home, /尚有未儲存的設定/);
  assert.match(home, /繼續編輯/);
  assert.match(home, /放棄修改/);
  assert.match(home, /beforeunload/);
  assert.match(home, /restoreSettingsSnapshot/);
  assert.match(home, /saveAllSettings/);
  assert.doesNotMatch(home, />儲存所有設定</);
  assert.match(css, /\.settings-save-bar/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /\.unsaved-settings-modal/);
  assert.match(draft, /normalizeSettingsForComparison/);
});
