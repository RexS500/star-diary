import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8");

test("state API uses dedicated secure parent password and recovery actions", () => {
  for (const action of ["set_parent_password", "change_parent_password", "update_security_question", "verify_security_answer", "reset_parent_password"]) {
    assert.match(source, new RegExp(`body\\.action === "${action}"`));
  }
  assert.match(source, /hashSecret\(body\.newPassword/);
  assert.match(source, /hashSecret\(normalizeSecurityAnswer\(body\.securityAnswer/);
  assert.match(source, /securityFailedAttempts >= 5/);
  assert.match(source, /5 \* 60_000/);
  assert.doesNotMatch(source, /parentPasswordPlainText|securityAnswerPlainText/);
});

test("initial parent password setup is separate from recovery question setup", () => {
  const start = source.indexOf('if (body.action === "set_parent_password")');
  const end = source.indexOf('if (body.action === "change_parent_password")', start);
  const block = source.slice(start, end);
  assert.match(block, /state\.passwordHash = await hashSecret\(body\.newPassword/);
  assert.doesNotMatch(block, /validateSecuritySetup|normalizeSecurityAnswer/);
  assert.match(block, /state\.securityQuestionType = ""/);
  assert.match(block, /state\.securityAnswerHash = ""/);
});

test("safe payload removes hashes and reset tokens", () => {
  for (const field of ["passwordHash", "securityAnswerHash", "securityResetTokenHash", "securityResetTokenExpiresAt"]) {
    assert.match(source, new RegExp(`delete safe\\.${field}`));
  }
});

test("child entries cannot submit an occurrence time and parent saves reject future times", () => {
  assert.match(source, /submitted\.occurredAt/);
  assert.match(source, /Date\.parse\(entry\.occurredAt\) > Date\.now\(\)/);
});

test("daily tasks migrate legacy child ownership and materialize independent child records", () => {
  assert.match(source, /legacyChildId \? \[legacyChildId\] : \[\]/);
  assert.match(source, /for \(const childId of task\.applicableChildIds\)/);
  assert.match(source, /const key = `\$\{task\.id\}\|\$\{childId\}\|\$\{date\}`/);
  assert.match(source, /task\.enabled !== false && !applicable\.some/);
  assert.match(source, /Array\.isArray\(body\.state\.children\) \? body\.state\.children : current\.state\.children/);
  assert.match(source, /uniqueWeekdays\(task\.weekdays\)\.length === 0/);
});

test("settings saves reject invalid quantity values before normalization", () => {
  assert.match(source, /isPositiveInteger\(task\.rewardStars\)/);
  assert.match(source, /isPositiveInteger\(asRecord\(raw\)\.cost\)/);
  assert.match(source, /isPositiveInteger\(asRecord\(raw\)\.amount\)/);
  assert.match(source, /setting\.goalValue > maximum/);
});

test("official task source, flow fields and favorites survive family persistence",()=>{
  assert.match(source,/sourceType: task\.sourceType === "official" \? "official" : "custom"/);
  assert.match(source,/sourceOfficialTaskId/);
  assert.match(source,/timeSlot: taskTimeSlots\.has/);
  assert.match(source,/state\.favoriteOfficialTaskIds = Array\.isArray/);
  assert.match(source,/state\.dailyTaskSortMode = state\.dailyTaskSortMode === "custom"/);
});

test("quick indicator type ordering persists while legacy arrays remain compatible",()=>{
  assert.match(source,/function normalizeTemplates/);
  assert.match(source,/templateTypes\.has\(template\.type\)/);
  assert.match(source,/Number\.isFinite\(Number\(template\.sortOrder\)\)/);
  assert.match(source,/state\.templates = normalizeTemplates\(state\.templates\)/);
});

test("server reconciles cached child stars from the shared ledger",()=>{
  assert.match(source,/reconcileChildStarBalances\(state\.children, state\.entries, state\.redemptions\)/);
  assert.match(source,/calculateChildStarBalance\(state\.entries,state\.redemptions,record\.childId\)/);
  assert.doesNotMatch(source,/child\.stars\s*[+\-]=/);
});

test("yesterday task backfill is a parent-only dated task completion",()=>{
  const start=source.indexOf('if (body.action === "parent_daily_task_backfill")');
  const end=source.indexOf('if (body.action === "parent_daily_task_action")',start);
  const block=source.slice(start,end);
  assert.ok(start>0);
  assert.match(block,/requireFamilyManager\(family\)/);
  assert.match(block,/addCalendarDays\(taipeiDateKey\(\), -1\)/);
  assert.match(block,/item\.date === yesterday/);
  assert.match(block,/completeDailyTask\(state, record, "parent", \{ backfilled: true \}\)/);
  assert.match(source,/occurredAt = historical \? taipeiDateKeyAtNoonIso\(record\.date\) : nowIso/);
  assert.match(source,/createdAt: nowIso/);
  assert.match(source,/record\.backfilledAt = nowIso/);
  assert.match(source,/歷史任務請使用昨天補登功能/);
});

test("current task definitions can create a separately marked yesterday backfill",()=>{
  const start=source.indexOf('if (body.action === "parent_daily_task_backfill_current_definition")');
  const end=source.indexOf('if (body.action === "parent_daily_task_action")',start);
  const block=source.slice(start,end);
  assert.ok(start>0);
  assert.match(block,/requireFamilyManager\(family\)/);
  assert.match(block,/task\.enabled/);
  assert.match(block,/task\.applicableChildIds\.includes\(child\.id\)/);
  assert.match(block,/task\.weekdays\.includes\(weekdayForDateKey\(yesterday\)\)/);
  assert.match(block,/state\.dailyTaskRecords\.some/);
  assert.match(block,/titleSnapshot: task\.title/);
  assert.match(block,/rewardStarsSnapshot: task\.rewardStars/);
  assert.match(block,/backfillSource: "current_definition"/);
  assert.match(block,/completeDailyTask\(state, record, "parent", \{ backfilled: true \}\)/);
});
