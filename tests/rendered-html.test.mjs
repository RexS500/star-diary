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
  assert.match(page, /<StarHome account=\{\{[\s\S]*role: familyAccess\.role,[\s\S]*boundChildId: familyAccess\.boundChildId,[\s\S]*childAccountMode: familyAccess\.childAccountMode,[\s\S]*\}\}\/>/);
  assert.match(page, /const session = await auth\(\)/);
  assert.match(page, /<LoginScreen/);
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
  assert.match(home, /dayLabel}獲得/);
  assert.match(home, /本週完成率/);
  assert.match(home, /連續達標/);
  assert.match(home, /dailyTaskDayView/);
  assert.match(home, /task-summary-progress/);
  assert.match(home, /dayLabel}沒有安排每日任務/);
  assert.doesNotMatch(home, /刷新任務|refreshTasks/);
  assert.match(route, /child_daily_task_complete/);
  assert.match(route, /parent_daily_task_action/);
  assert.match(route, /parent_daily_task_backfill/);
  assert.match(route, /parent_daily_task_backfill_current_definition/);
  assert.match(route, /sourceType:\s*"daily_task"/);
  for (const label of ["查看昨天任務", "返回今天任務", "昨天任務補登模式", "昨天原本任務", "可補登任務", "依目前設定補登", "補登完成", "確認補登", "請家長協助補登"]) assert.match(home, new RegExp(label));
  assert.match(css, /\.daily-task-settings-card/);
  assert.match(css, /\.task-card-grid/);
  assert.match(css, /\.task-backfill-banner/);
  assert.match(css, /\.task-current-definition-badge/);
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

test("family settings use five persistent, mobile-scrollable internal tabs", async () => {
  const [home, css] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const key of ["children", "security", "dailyTasks", "quickActions", "rewards"]) assert.match(home, new RegExp(`key: "${key}"`));
  for (const label of ["孩子資料", "安全設定", "每日任務", "快速指標", "星星寶庫"]) assert.match(home, new RegExp(label));
  assert.match(home, /useState<SettingsTabKey>\("children"\)/);
  assert.match(home, /settingsTabFromHash/);
  assert.match(home, /window\.history\.pushState/);
  assert.match(home, /SettingsContent\(\)/);
  assert.match(home, /settingsTabScrollPositions/);
  assert.match(home, /role="tablist"/);
  assert.match(home, /role="tabpanel"/);
  assert.match(css, /\.settings-tabs\{[^}]*overflow-x:auto/);
  assert.match(css, /\.settings-tabs button\{[^}]*min-height:46px/);
  assert.match(css, /data-active-tab="dailyTasks"/);
  assert.match(css, /\.family-settings-center \.settings-grid>\.settings-card\{display:none\}/);
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
  const appAt = home.indexOf("export default function App(");
  const modalEnd = home.indexOf("function SecretField(", modalAt);
  const modal = home.slice(modalAt, modalEnd);
  assert.ok(modalAt >= 0 && modalAt < appAt, "RecordModal must stay at module scope so parent renders do not remount it");
  assert.equal(home.match(/function RecordModal\(/g)?.length, 1);
  assert.doesNotMatch(home, /\{record\s*&&\s*<RecordModal[^>]*\bkey\s*=/);
  assert.match(modal, /visualViewport/);
  assert.match(modal, /scrollIntoView\(\{block:"nearest",inline:"nearest",behavior:"smooth"\}\)/);
  assert.doesNotMatch(modal, /scrollTo\s*\(|\.scrollTop\s*=|autoFocus|block:\s*["']start["']/);
  assert.match(modal, /value=\{name\}[^>]*onChange=\{event=>setName\(event\.target\.value\)\}/);
  assert.match(modal, /獎勵數量<EditableIntegerInput[^>]*onChange=\{setN\}/);
  assert.match(modal, /if\(await onSave\([^)]*\)\)onClose\(\)/);
  assert.match(css, /\.record-modal-back\{[^}]*overflow:hidden;[^}]*overscroll-behavior:contain/);
  assert.match(css, /\.record-modal\{[^}]*100dvh[^}]*overflow-y:auto;[^}]*overscroll-behavior:contain;[^}]*-webkit-overflow-scrolling:touch/);
  assert.match(css, /\.record-modal[^}]*safe-area-inset-bottom/);
});

test("range analytics share real child records across both modes and responsive charts", async () => {
  const [home, logic, css] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/analytics-logic.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(home, /每日星星變化/);
  assert.match(home, /星星來源分析/);
  assert.match(home, /兌換統計/);
  assert.match(home, /<Analytics data=\{data\} child=\{child\}/);
  assert.match(home, /上週＋本週/);
  assert.match(home, /最近 30 天/);
  assert.match(home, /刷新並匯出中/);
  assert.match(home, /splitAnalyticsRangeIntoWeekPeriods/);
  assert.match(home, /weekly-chart-list/);
  assert.match(home, /scaleMaximum=\{chartMaximum\}/);
  assert.match(home, /weekly-breakdown-list">\{chartWeeks\.map\(week=><WeeklyBreakdownSection/);
  assert.match(home, /redemption-week-list">\{weeklyRedemptions\.map\(week=><WeeklyRedemptionTable/);
  assert.match(home, /const weeklyRedemptions=useMemo\(\(\)=>chartPeriods\.map/);
  assert.doesNotMatch(home, /<WeeklyBreakdownSection week=\{report\.starAnalysis\}/);
  assert.doesNotMatch(home, /redemption-week-grid is-single/);
  assert.doesNotMatch(home, /weekly-chart-scroll/);
  assert.doesNotMatch(home, /tab === "資料分析"\s*&&\s*role === "家長"/);
  assert.match(home, /\["首頁", "任務挑戰", "星星紀錄", "資料分析"/);
  assert.match(logic, /ANALYTICS_WEEKDAY_LABELS = \["日", "一", "二", "三", "四", "五", "六"\]/);
  assert.match(logic, /sourceType === "daily_task"/);
  assert.match(logic, /getWeeklyRedemptionSummary/);
  assert.match(css, /\.weekly-diverging-chart/);
  assert.match(css, /\.weekly-chart-list/);
  assert.match(css, /\.weekly-breakdown-list,\.redemption-week-list/);
  assert.doesNotMatch(css, /\.weekly-chart-scroll/);
  assert.match(css, /\.donut-chart/);
  assert.match(css, /\.mobile-redemption-cards/);
});

test("home, rewards and debug mode use the shared ledger balance", async () => {
  const [home,balance] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/star-balance.ts", import.meta.url), "utf8"),
  ]);
  assert.match(home,/calculateChildStarBalance\(data\.entries,data\.redemptions,child\.id\)/);
  assert.match(home,/我的星星[\s\S]*childBalance\.total/);
  assert.match(home,/目前有 <b>\{childBalance\.total\}/);
  assert.match(home,/debugStars/);
  assert.match(balance,/Reduce Total = \$\{report\.total\}/);
  assert.match(balance,/首頁目前顯示 = \$\{displayedTotal\}/);
  assert.match(balance,/是否納入計算/);
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
  assert.ok(home.indexOf('className="settings-card wide daily-goal-settings daily-goal-settings-card"') < home.indexOf('className="settings-card wide daily-task-settings"'));
  assert.equal(home.match(/的每日達標條件/g)?.length, 1);
  assert.match(css, /data-active-tab="dailyTasks"[^\n]*daily-goal-settings-card/);
});

test("quantity fields share an editable integer input and mobile stepper", async () => {
  const [home, css] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(home, /function EditableIntegerInput/);
  assert.match(home, /inputMode="numeric"/);
  assert.match(home, /pattern="\[0-9\]\*"/);
  assert.match(home, /aria-label="減少 1"/);
  assert.match(home, /aria-label="增加 1"/);
  for (const field of ["reward-cost-", "task-reward-", "template-amount-", "daily-goal-", "record-stars", "record-special"]) assert.match(home, new RegExp(field));
  assert.match(home, /invalidIntegerFields\.size/);
  assert.match(css, /\.integer-control/);
});

test("daily task weekday shortcuts derive their selected state from weekdays", async () => {
  const [home, logic, css] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/weekday-selection.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(home, /preset=weekdayPreset\(task\.weekdays\)/);
  assert.match(home, /aria-pressed=\{preset==="everyday"\}/);
  assert.match(home, /aria-pressed=\{preset==="weekdays"\}/);
  assert.match(home, /aria-pressed=\{preset==="weekend"\}/);
  assert.match(home, /className="weekday-clear"/);
  assert.match(home, /missingWeekday&&<p className="task-weekday-error"/);
  assert.match(home, /invalidWeekdayTask/);
  assert.match(logic, /normalizeWeekdays/);
  assert.match(css, /\.weekday-shortcuts button\[aria-pressed="true"\]/);
});

test("quick indicators are grouped and independently ordered in settings and home", async () => {
  const [home, logic, css] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/quick-template-logic.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(home, /renderTemplateGroup\("star","加星指標","⭐"\).*renderTemplateGroup\("deduct","扣星指標","➖"\)/s);
  assert.match(home, /renderGroup\("star","⭐ 快速加星".*renderGroup\("deduct","➖ 快速扣星"/s);
  assert.match(home, /＋ 新增\{typeName\}/);
  assert.match(home, /↑ 上移/);
  assert.match(home, /↓ 下移/);
  assert.match(home, /尚未設定快速加星指標/);
  assert.match(home, /尚未設定快速扣星指標/);
  assert.match(logic, /moveTemplateWithinType/);
  assert.match(logic, /changeTemplateType/);
  assert.match(css, /\.template-type-star/);
  assert.match(css, /\.template-type-deduct/);
  assert.match(css, /\.home-template-buttons \.deduct-pick/);
});

test("official task library is wired into the existing family daily task settings",async()=>{
  const [home,library,css]=await Promise.all([
    readFile(new URL("../app/star-home.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/official-task-library-modal.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/globals.css",import.meta.url),"utf8"),
  ]);
  assert.match(home,/從官方任務庫加入/);
  assert.match(home,/sourceOfficialTaskId:task\.id/);
  assert.match(home,/dailyTasks:\[\.\.\.current\.dailyTasks,\.\.\.additions\]/);
  assert.match(home,/favoriteOfficialTaskIds/);
  for(const text of ["官方任務庫","官方任務包","只看官方推薦","只看我的最愛","已選取","仍然新增一份"])assert.match(library,new RegExp(text));
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/\.official-library-shell/);
  assert.match(css,/@media\(max-width:560px\)/);
});

test("task analytics, health recommendations, and habit graduation are wired into the shared task system", async () => {
  const [home, analytics, css] = await Promise.all([
    readFile(new URL("../app/star-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/task-analytics.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const text of ["每日任務達成率分析", "任務健康度與調整建議", "已養成習慣", "習慣畢業", "依目前設定補登"]) assert.match(home, new RegExp(text));
  assert.match(home, /parent_daily_task_habit_action/);
  assert.match(home, /daily-task-setting-/);
  assert.match(analytics, /fromHistoricalRecord/);
  assert.match(analytics, /current_definition/);
  assert.match(analytics, /scheduledCount >= 20/);
  assert.match(css, /\.task-completion-chart/);
  assert.match(css, /\.task-health-grid/);
  assert.match(css, /@media\(max-width:480px\)/);
});
