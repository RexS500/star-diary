import test from "node:test";
import assert from "node:assert/strict";
import {
  hashSecret,
  normalizeSecurityAnswer,
  securityLockStatus,
  sha256Hex,
  validatePasswordPair,
  validateSecuritySetup,
  verifySecret,
} from "../app/security-logic.ts";

test("password validation covers confirmation, length and reuse", () => {
  assert.equal(validatePasswordPair("", ""), "新密碼不可為空");
  assert.equal(validatePasswordPair("123", "123"), "密碼至少 4 個字元");
  assert.equal(validatePasswordPair("1234", "4321"), "兩次輸入的密碼不一致");
  assert.equal(validatePasswordPair("1234", "1234", "1234"), "新密碼不可與原始密碼相同");
  assert.equal(validatePasswordPair("new-pass", "new-pass", "old-pass"), "");
});

test("security answers trim outer whitespace and ignore English case", () => {
  assert.equal(normalizeSecurityAnswer("  Mi Mi  "), "mi mi");
  assert.equal(validateSecuritySetup("pet", "我的第一隻寵物叫什麼名字？", "Mi Mi", " mi mi "), "");
  assert.equal(validateSecuritySetup("custom", "", "答案", "答案"), "請填寫自訂安全問題");
});

test("new secrets use salted PBKDF2 while legacy SHA-256 remains verifiable", async () => {
  const password = "家庭密碼1234";
  const stored = await hashSecret(password);
  assert.match(stored, /^pbkdf2-sha256\$/);
  assert.notEqual(stored, password);
  assert.equal(await verifySecret(password, stored), true);
  assert.equal(await verifySecret("錯誤", stored), false);
  const legacy = await sha256Hex(password);
  assert.equal(await verifySecret(password, legacy), true);
});

test("persistent lock state expires after its timestamp", () => {
  const now = Date.parse("2026-07-17T04:00:00.000Z");
  assert.equal(securityLockStatus(5, "2026-07-17T04:05:00.000Z", now).locked, true);
  assert.equal(securityLockStatus(5, "2026-07-17T03:59:59.000Z", now).locked, false);
});
