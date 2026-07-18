import test from "node:test";
import assert from "node:assert/strict";
import {
  EVERY_DAY,
  WEEKDAYS,
  WEEKEND,
  normalizeWeekdays,
  weekdayPreset,
} from "../app/weekday-selection.ts";

test("weekday presets use the persisted Monday-through-Sunday values", () => {
  assert.deepEqual([...EVERY_DAY], [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual([...WEEKDAYS], [1, 2, 3, 4, 5]);
  assert.deepEqual([...WEEKEND], [6, 7]);
});

test("preset selection is derived only from the normalized weekday values", () => {
  assert.equal(weekdayPreset([7, 3, 1, 6, 2, 5, 4]), "everyday");
  assert.equal(weekdayPreset([5, 1, 3, 2, 4, 4]), "weekdays");
  assert.equal(weekdayPreset([7, 6]), "weekend");
  assert.equal(weekdayPreset([1, 3, 5]), null);
  assert.equal(weekdayPreset([]), null);
});

test("weekday persistence is unique, valid and stably ordered", () => {
  assert.deepEqual(normalizeWeekdays([5, 1, 3, 2, 4, 4, 0, 8, Number.NaN]), [1, 2, 3, 4, 5]);
});
