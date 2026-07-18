import assert from "node:assert/strict";
import test from "node:test";

import { acceptsEditableIntegerDraft, normalizeEditableInteger, validEditableInteger } from "../app/integer-input-logic.ts";

test("integer fields allow temporary empty, pasted, negative and decimal editing drafts", () => {
  for (const value of ["", "8", "100", "-2", "1.5"]) assert.equal(acceptsEditableIntegerDraft(value), true);
  assert.equal(acceptsEditableIntegerDraft("abc"), false);
});

test("only whole numbers inside the field range are valid for saving", () => {
  assert.equal(validEditableInteger("8"), true);
  for (const value of ["", "0", "-1", "1.5"]) assert.equal(validEditableInteger(value), false);
  assert.equal(validEditableInteger("100", 1, 100), true);
  assert.equal(validEditableInteger("101", 1, 100), false);
});

test("blur normalization restores minimums, floors decimals and clamps percentages", () => {
  assert.equal(normalizeEditableInteger(""), 1);
  assert.equal(normalizeEditableInteger("0"), 1);
  assert.equal(normalizeEditableInteger("-8"), 1);
  assert.equal(normalizeEditableInteger("8.9"), 8);
  assert.equal(normalizeEditableInteger("120", 1, 100), 100);
});
