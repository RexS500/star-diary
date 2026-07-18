import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORY_META, OFFICIAL_TASKS, OFFICIAL_TASK_TEMPLATES, TIME_SLOT_META } from "../app/official-task-library.ts";
import { DEFAULT_OFFICIAL_TASK_FILTERS, officialTaskResults } from "../app/official-task-library-logic.ts";

test("official library ships stable, varied and complete first-party content",()=>{
  assert.ok(OFFICIAL_TASKS.length>=60&&OFFICIAL_TASKS.length<=100);
  assert.equal(new Set(OFFICIAL_TASKS.map(task=>task.id)).size,OFFICIAL_TASKS.length);
  assert.ok(OFFICIAL_TASKS.every(task=>task.id.startsWith("official-")&&task.suggestedStars>=1&&task.difficulty>=1&&task.difficulty<=5));
  assert.deepEqual(new Set(OFFICIAL_TASKS.map(task=>task.category)),new Set(Object.keys(CATEGORY_META)));
  assert.deepEqual(new Set(OFFICIAL_TASKS.map(task=>task.timeSlot)),new Set(Object.keys(TIME_SLOT_META)));
  assert.equal(OFFICIAL_TASK_TEMPLATES.length,8);
  assert.ok(OFFICIAL_TASK_TEMPLATES.every(pack=>pack.taskIds.every(id=>OFFICIAL_TASKS.some(task=>task.id===id))));
});

test("default results follow the real day from wake-up through anytime",()=>{
  const results=officialTaskResults(DEFAULT_OFFICIAL_TASK_FILTERS,"flow",[]);
  const orders=results.map(task=>TIME_SLOT_META[task.timeSlot].order);
  assert.deepEqual(orders,[...orders].sort((a,b)=>a-b));
});

test("search and combined age, category and time filters work locally",()=>{
  const brushing=officialTaskResults({...DEFAULT_OFFICIAL_TASK_FILTERS,search:" 刷牙 "},"flow",[]);
  assert.ok(brushing.length>=2&&brushing.every(task=>task.title.includes("刷牙")||task.keywords.some(word=>word.includes("刷牙"))));
  const filtered=officialTaskResults({...DEFAULT_OFFICIAL_TASK_FILTERS,age:"age_6_8",category:"self_care",timeSlot:"before_bed"},"flow",[]);
  assert.ok(filtered.length>0&&filtered.every(task=>task.category==="self_care"&&task.timeSlot==="before_bed"&&task.ageGroups.includes("age_6_8")));
});

test("popular, stars, difficulty and favorites sorts are stable",()=>{
  const favorites=[OFFICIAL_TASKS.at(-1).id];
  assert.equal(officialTaskResults(DEFAULT_OFFICIAL_TASK_FILTERS,"favorites",favorites)[0].id,favorites[0]);
  const lowStars=officialTaskResults(DEFAULT_OFFICIAL_TASK_FILTERS,"stars_asc",[]),lowDifficulty=officialTaskResults(DEFAULT_OFFICIAL_TASK_FILTERS,"difficulty_asc",[]),popular=officialTaskResults(DEFAULT_OFFICIAL_TASK_FILTERS,"popular",[]);
  assert.ok(lowStars[0].suggestedStars<=lowStars.at(-1).suggestedStars);
  assert.ok(lowDifficulty[0].difficulty<=lowDifficulty.at(-1).difficulty);
  assert.ok(popular[0].popularityScore>=popular.at(-1).popularityScore);
});
