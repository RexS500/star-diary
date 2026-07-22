import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFamilyMediaKey,
  isFamilyScopedMediaKey,
  mediaKeyBelongsToFamily,
  mediaKeyFromUrl,
  mediaKeysInState,
  stateReferencesMediaKey,
} from "../app/media-scope.ts";

test("new R2 object keys include only a family namespace, random id, and WebP extension", () => {
  const key = buildFamilyMediaKey("family-a", "avatars", "fixed-id");
  assert.equal(key, "families/family-a/avatars/fixed-id.webp");
  assert.equal(mediaKeyBelongsToFamily(key, "family-a"), true);
  assert.equal(mediaKeyBelongsToFamily(key, "family-b"), false);
  assert.equal(isFamilyScopedMediaKey(key), true);
  assert.doesNotMatch(key, /孩子|jpg|png/i);
});

test("legacy media is readable only when the current family's state references it", () => {
  const key = "avatars/legacy-photo.jpg";
  const stateA = { children: [{ avatar: `/api/media?key=${encodeURIComponent(key)}&v=1` }] };
  const stateB = { children: [{ avatar: "/api/media?key=avatars%2Fother.jpg" }] };
  assert.equal(mediaKeyFromUrl(stateA.children[0].avatar), key);
  assert.equal(stateReferencesMediaKey(stateA, key), true);
  assert.equal(stateReferencesMediaKey(stateB, key), false);
  assert.equal(isFamilyScopedMediaKey(key), false);
  assert.deepEqual([...mediaKeysInState(stateA)], [key]);
});

test("a foreign new-format key can never fall back to legacy reference checks", async () => {
  const route = await import("node:fs/promises").then(fs => fs.readFile(
    new URL("../app/api/media/route.ts", import.meta.url),
    "utf8",
  ));
  assert.match(route, /!isFamilyScopedMediaKey\(key\).*legacyKeyBelongsToFamily/s);
});
