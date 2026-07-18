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
