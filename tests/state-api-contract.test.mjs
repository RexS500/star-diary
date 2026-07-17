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
