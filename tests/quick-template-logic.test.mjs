import assert from "node:assert/strict";
import test from "node:test";
import {
  changeTemplateType,
  moveTemplateWithinType,
  normalizeTemplateSortOrders,
  orderedTemplatesByType,
} from "../app/quick-template-logic.ts";

const legacy = [
  { id: "s1", type: "star", title: "加一" },
  { id: "d1", type: "deduct", title: "扣一" },
  { id: "s2", type: "star", title: "加二" },
  { id: "d2", type: "deduct", title: "扣二" },
  { id: "x1", type: "special", title: "特別" },
];

test("legacy mixed arrays keep their original order inside each type", () => {
  assert.deepEqual(orderedTemplatesByType(legacy, "star").map(item => item.id), ["s1", "s2"]);
  assert.deepEqual(orderedTemplatesByType(legacy, "deduct").map(item => item.id), ["d1", "d2"]);
  const normalized = normalizeTemplateSortOrders(legacy);
  assert.deepEqual(orderedTemplatesByType(normalized, "star").map(item => item.sortOrder), [0, 1]);
  assert.deepEqual(orderedTemplatesByType(normalized, "deduct").map(item => item.sortOrder), [0, 1]);
});

test("moving one type never changes the order of another type", () => {
  const moved = moveTemplateWithinType(legacy, "s2", -1);
  assert.deepEqual(orderedTemplatesByType(moved, "star").map(item => item.id), ["s2", "s1"]);
  assert.deepEqual(orderedTemplatesByType(moved, "deduct").map(item => item.id), ["d1", "d2"]);
  assert.equal(moveTemplateWithinType(moved, "s2", -1), moved);
});

test("changing type keeps the id and moves the item to the destination end", () => {
  const changed = changeTemplateType(legacy, "s1", "deduct");
  assert.deepEqual(orderedTemplatesByType(changed, "star").map(item => item.id), ["s2"]);
  assert.deepEqual(orderedTemplatesByType(changed, "deduct").map(item => item.id), ["d1", "d2", "s1"]);
  assert.equal(changed.find(item => item.id === "s1")?.title, "加一");
});
