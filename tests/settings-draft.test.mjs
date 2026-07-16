import assert from "node:assert/strict";
import test from "node:test";

import {
  clonePersistedState,
  normalizeSettingsForComparison,
  settingsSignature,
} from "../app/settings-draft.ts";

const state = () => ({
  children: [{ id: "c1", name: "Max", gender: "boy", avatar: "boy", stars: 20 }],
  entries: [],
  redemptions: [],
  specialRewards: [],
  templates: [{ id: "t1", title: "整理書包", amount: 2, type: "star" }],
  rewards: [{ id: "r1", icon: "🍦", name: "冰淇淋", cost: 12, stock: 0 }],
  rewardIconLibrary: [],
  dailyTasks: [{
    id: "d1", childId: "c1", title: "刷牙", icon: "🪥", rewardStars: 1,
    weekdays: [1, 2, 3, 4, 5], enabled: true, sortOrder: 0,
    createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z", scheduleStart: "2026-07-16",
  }],
  dailyTaskRecords: [],
  dailyTaskSettings: { c1: { goalMode: "percentage", goalValue: 80, completionMode: "instant" } },
});

test("initial settings and an equivalent recreated object have the same signature", () => {
  const original = state(), recreated = clonePersistedState(original);
  recreated.dailyTasks[0].weekdays = [5, 4, 3, 2, 1, 1];
  recreated.dailyTasks[0].updatedAt = "2026-07-16T01:00:00.000Z";
  assert.equal(settingsSignature(recreated), settingsSignature(original));
});

test("editing and then restoring a value clears the difference", () => {
  const original = state(), draft = clonePersistedState(original), baseline = settingsSignature(original);
  draft.dailyTasks[0].title = "洗澡";
  assert.notEqual(settingsSignature(draft), baseline);
  draft.dailyTasks[0].title = "刷牙";
  assert.equal(settingsSignature(draft), baseline);
});

test("all editable setting families affect the signature", () => {
  const original = state(), baseline = settingsSignature(original);
  const mutations = [
    draft => { draft.children[0].name = "Vanessa"; },
    draft => { draft.children[0].gender = "girl"; },
    draft => { draft.children[0].avatar = "/api/media?key=avatars/max.png"; },
    draft => { draft.children.push({ id: "c2", name: "Mia", gender: "girl", avatar: "girl", stars: 0 }); },
    draft => { draft.templates.push({ id: "t2", title: "幫忙", amount: 1, type: "star" }); },
    draft => { draft.templates[0].type = "deduct"; },
    draft => { draft.templates[0].amount = 3; },
    draft => { draft.rewards[0].image = "/api/media?key=rewards/a.jpg"; },
    draft => { draft.rewards[0].icon = "🎁"; },
    draft => { draft.rewards[0].name = "寶可夢卡"; },
    draft => { draft.rewards[0].cost = 20; },
    draft => { draft.rewardIconLibrary.push({ id: "asset-1", name: "寶可夢卡", image: "/api/media?key=rewards/card.jpg", hash: "abc" }); },
    draft => { draft.dailyTasks[0].icon = "🛁"; },
    draft => { draft.dailyTasks[0].rewardStars = 2; },
    draft => { draft.dailyTasks[0].weekdays = [6, 7]; },
    draft => { draft.dailyTasks[0].enabled = false; },
    draft => { draft.dailyTasks[0].sortOrder = 2; },
    draft => { draft.dailyTaskSettings.c1.goalValue = 90; },
    draft => { draft.dailyTaskSettings.c1.goalMode = "count"; },
    draft => { draft.dailyTaskSettings.c1.completionMode = "approval"; },
  ];
  for (const mutate of mutations) {
    const draft = clonePersistedState(original);
    mutate(draft);
    assert.notEqual(settingsSignature(draft), baseline);
  }
  assert.notEqual(settingsSignature(original, "new-password"), baseline);
});

test("defaults, empty optional fields, and numeric values are normalized before comparison", () => {
  const original = state();
  const equivalent = clonePersistedState(original);

  equivalent.rewards[0].image = undefined;
  equivalent.rewardIconLibrary.push({ id: "asset-1", name: "照片", image: "/photo.jpg" });
  original.rewardIconLibrary.push({ id: "asset-1", name: "照片", image: "/photo.jpg", hash: undefined });
  equivalent.templates[0].amount = "2";
  equivalent.dailyTasks[0].rewardStars = "1";
  equivalent.dailyTasks[0].sortOrder = "0";

  assert.equal(settingsSignature(equivalent), settingsSignature(original));

  const withoutExplicitTaskSettings = clonePersistedState(original);
  withoutExplicitTaskSettings.dailyTaskSettings = {};
  assert.equal(settingsSignature(withoutExplicitTaskSettings), settingsSignature(original));
});

test("weekday order, duplicates, invalid values, and persistence metadata do not cause false changes", () => {
  const original = state();
  const equivalent = clonePersistedState(original);
  equivalent.dailyTasks[0].weekdays = [5, 3, 1, 2, 4, 4, 0, 8, Number.NaN];
  equivalent.dailyTasks[0].createdAt = "2099-01-01T00:00:00.000Z";
  equivalent.dailyTasks[0].updatedAt = "2099-01-02T00:00:00.000Z";
  equivalent.dailyTasks[0].scheduleStart = "2099-01-03";
  equivalent.dailyTasks[0].expanded = true;

  assert.equal(settingsSignature(equivalent), settingsSignature(original));
});

test("normalization returns only persisted editable settings", () => {
  const normalized = normalizeSettingsForComparison(state());

  assert.deepEqual(Object.keys(normalized).sort(), [
    "children",
    "dailyTaskSettings",
    "dailyTasks",
    "newPasswordDraft",
    "rewardIconLibrary",
    "rewards",
    "templates",
  ]);
  assert.deepEqual(normalized.children[0], {
    id: "c1",
    name: "Max",
    gender: "boy",
    avatar: "boy",
  });
  assert.equal("stars" in normalized.children[0], false);
  assert.equal("createdAt" in normalized.dailyTasks[0], false);
  assert.equal("updatedAt" in normalized.dailyTasks[0], false);
  assert.equal("scheduleStart" in normalized.dailyTasks[0], false);
});

test("the saved snapshot does not share nested references with the draft", () => {
  const draft = state(), snapshot = clonePersistedState(draft);
  draft.children[0].name = "Changed";
  draft.dailyTasks[0].weekdays.push(7);
  assert.equal(snapshot.children[0].name, "Max");
  assert.deepEqual(snapshot.dailyTasks[0].weekdays, [1, 2, 3, 4, 5]);
});

test("non-setting records and star balances do not create false dirty state", () => {
  const original = state(), changed = clonePersistedState(original);
  changed.children[0].stars = 999;
  changed.entries.push({ id: "e1", childId: "c1", title: "任務", amount: 1, type: "star", date: "2026/7/16" });
  changed.redemptions.push({ id: "x1", childId: "c1", reward: "冰淇淋", cost: 12 });
  changed.specialRewards.push({ id: "s1", childId: "c1", title: "樂高扭蛋", amount: 1 });
  changed.dailyTaskRecords.push({ id: "record-1", childId: "c1", definitionId: "d1", status: "completed" });
  assert.equal(settingsSignature(changed), settingsSignature(original));
});
