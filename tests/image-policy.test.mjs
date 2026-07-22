import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectWebp, validateStoredWebp } from "../app/webp-validation.ts";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const onePixelWebp = () => Uint8Array.from(Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==",
  "base64",
).subarray(0, 42));

test("server validates WebP signature, RIFF length, dimensions, and metadata", () => {
  assert.deepEqual(inspectWebp(onePixelWebp()), { width: 1, height: 1, chunkTypes: ["VP8 "] });
  assert.equal(validateStoredWebp(onePixelWebp(), 512).width, 1);
  assert.throws(() => inspectWebp(Uint8Array.from([1, 2, 3])), /有效的 WebP/);
  const withMetadata = onePixelWebp();
  withMetadata.set([69, 88, 73, 70], 12);
  assert.throws(() => inspectWebp(withMetadata), /中繼資料/);
});

test("upload route accepts only compressed metadata-free WebP under 500 KB", async () => {
  const route = await read("app/api/media/route.ts");
  assert.match(route, /file\.type\.toLowerCase\(\) !== "image\/webp"/);
  assert.match(route, /endsWith\("\.webp"\)/);
  assert.match(route, /MAX_STORED_IMAGE_BYTES/);
  assert.match(route, /validateStoredWebp/);
  assert.match(route, /contentType: "image\/webp"/);
  assert.doesNotMatch(route, /8 \* 1024 \* 1024/);
});

test("browser pipeline validates signatures, orients, strips metadata, and emits WebP", async () => {
  const client = await read("app/client-image-processing.ts");
  assert.match(client, /imageOrientation: "from-image"/);
  assert.match(client, /INPUT_MAX_DIMENSION = 1600/);
  assert.match(client, /image\/webp/);
  assert.match(client, /\[0\.82, 0\.79, 0\.76, 0\.75\]/);
  assert.match(client, /MAX_STORED_IMAGE_BYTES/);
});

test("settings save removes old family-scoped R2 objects only after references disappear", async () => {
  const stateRoute = await read("app/api/state/route.ts");
  assert.match(stateRoute, /cleanupUnreferencedFamilyMedia/);
  assert.match(stateRoute, /mediaKeysInState\(before\)/);
  assert.match(stateRoute, /!afterKeys\.has\(key\)/);
  assert.match(stateRoute, /mediaKeyBelongsToFamily\(key, familyId\)/);
  assert.match(stateRoute, /env\.MEDIA\.delete\(key\)/);
  assert.match(stateRoute, /DELETE FROM media_objects WHERE family_id = \? AND object_key = \?/);
});
