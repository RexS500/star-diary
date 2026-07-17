import test from "node:test";
import assert from "node:assert/strict";
import { formatTaipeiOccurrence, isFutureTaipeiDateTime, taipeiDateTimeInput, taipeiLocalToIso } from "../app/record-time.ts";
import { entryAnalyticsDateKey, entryAnalyticsTimestamp } from "../app/analytics-logic.ts";

test("Taipei date and time inputs map to the correct instant", () => {
  assert.equal(taipeiLocalToIso("2026-07-14", "19:30"), "2026-07-14T11:30:00.000Z");
  assert.deepEqual(taipeiDateTimeInput(new Date("2026-07-14T11:30:00.000Z")), { date: "2026-07-14", time: "19:30" });
  assert.match(formatTaipeiOccurrence("2026-07-14T11:30:00.000Z"), /2026\/07\/14.*19:30/);
});

test("invalid or future occurrence times are rejected", () => {
  assert.equal(taipeiLocalToIso("2026-02-30", "12:00"), "");
  const now = Date.parse("2026-07-17T04:06:30.000Z");
  assert.equal(isFutureTaipeiDateTime("2026-07-17", "12:06", now), false);
  assert.equal(isFutureTaipeiDateTime("2026-07-17", "12:07", now), true);
});

test("analytics prefer occurredAt and fall back to legacy createdAt", () => {
  const backfilled = { childId: "c1", type: "star", occurredAt: "2026-07-14T11:30:00.000Z", createdAt: "2026-07-17T04:06:00.000Z", date: "2026/7/17 12:06:00" };
  assert.equal(entryAnalyticsTimestamp(backfilled), Date.parse(backfilled.occurredAt));
  assert.equal(entryAnalyticsDateKey(backfilled), "2026-07-14");
  const legacy = { childId: "c1", type: "star", createdAt: "2026-07-17T04:06:00.000Z", date: "2026/7/17 12:06:00" };
  assert.equal(entryAnalyticsDateKey(legacy), "2026-07-17");
});
