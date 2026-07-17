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
  assert.match(home, /dailyTaskDayView/);
  assert.match(home, /task-summary-progress/);
  assert.match(home, /今天沒有安排每日任務/);
  assert.doesNotMatch(home, /刷新任務|refreshTasks/);
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

test("parent password and recovery settings have independent confirm and cancel controls", async () => {
  const [home, css] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const start = home.indexOf("function ParentSecuritySettings(");
  const end = home.indexOf("function ForgotPasswordModal(", start);
  const block = home.slice(start, end);
  assert.match(block, /function resetPasswordDraft\(\)/);
  assert.match(block, /function resetSecurityDraft\(\)/);
  assert.match(block, /passwordSet\?changePassword\(\):setInitialPassword\(\)/);
  assert.match(block, /onClick=\{\(\)=>void updateSecurity\(\)\}/);
  assert.match(block, /disabled=\{busy\|\|!passwordSet\}/);
  assert.match(block, /確認設定/);
  assert.match(block, />取消<\/button>/);
  assert.doesNotMatch(block, /passwordSet\?updateSecurity\(\):setInitialPassword\(\)/);
  assert.match(css, /\.security-form-actions button:disabled/);
  assert.match(css, /\.security-form-actions button:focus-visible/);
});

test("record modal keeps one mounted scroll container while the iPhone keyboard changes", async () => {
  const [home, css] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const modalAt = home.indexOf("function RecordModal(");
  const appAt = home.indexOf("export default function App()");
  const modalEnd = home.indexOf("function Analytics(", modalAt);
  const modal = home.slice(modalAt, modalEnd);
  assert.ok(modalAt >= 0 && modalAt < appAt, "RecordModal must stay at module scope so parent renders do not remount it");
  assert.equal(home.match(/function RecordModal\(/g)?.length, 1);
  assert.doesNotMatch(home, /\{record\s*&&\s*<RecordModal[^>]*\bkey\s*=/);
  assert.match(modal, /visualViewport/);
  assert.match(modal, /scrollIntoView\(\{block:"nearest",inline:"nearest",behavior:"smooth"\}\)/);
  assert.doesNotMatch(modal, /scrollTo\s*\(|\.scrollTop\s*=|autoFocus|block:\s*["']start["']/);
  assert.match(modal, /value=\{name\}[^>]*onChange=\{event=>setName\(event\.target\.value\)\}/);
  assert.match(modal, /獎勵數量<input[^>]*value=\{n\}[^>]*onChange=\{event=>setN\(/);
  assert.match(modal, /if\(await onSave\([^)]*\)\)onClose\(\)/);
  assert.match(css, /\.record-modal-back\{[^}]*overflow:hidden;[^}]*overscroll-behavior:contain/);
  assert.match(css, /\.record-modal\{[^}]*100dvh[^}]*overflow-y:auto;[^}]*overscroll-behavior:contain;[^}]*-webkit-overflow-scrolling:touch/);
  assert.match(css, /\.record-modal[^}]*safe-area-inset-bottom/);
});

test("weekly analytics share real child records across both modes and responsive charts", async () => {
  const [home, logic, css] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/analytics-logic.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(home, /每週星星變化/);
  assert.match(home, /星星來源分析/);
  assert.match(home, /兌換統計/);
  assert.match(home, /<Analytics entries=\{data\.entries\} redemptions=\{data\.redemptions\}/);
  assert.doesNotMatch(home, /tab === "資料分析"\s*&&\s*role === "家長"/);
  assert.match(home, /\["首頁", "任務挑戰", "星星紀錄", "資料分析"/);
  assert.match(logic, /ANALYTICS_WEEKDAY_LABELS = \["日", "一", "二", "三", "四", "五", "六"\]/);
  assert.match(logic, /sourceType === "daily_task"/);
  assert.match(logic, /getWeeklyRedemptionSummary/);
  assert.match(css, /\.weekly-diverging-chart/);
  assert.match(css, /\.donut-chart/);
  assert.match(css, /\.mobile-redemption-cards/);
});

test("daily task settings expose shared child applicability controls", async () => {
  const [home, css] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(home, /applicableChildIds/);
  assert.match(home, />全選</);
  assert.match(home, />全部取消</);
  assert.match(home, /請至少選擇一位適用孩子/);
  assert.match(css, /\.task-child-options/);
  assert.match(css, /\.daily-task-settings-card\.has-error/);
});
