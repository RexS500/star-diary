import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("the page and private APIs derive identity and family access on the server", async () => {
  const [page, state, media, access] = await Promise.all([
    read("app/page.tsx"),
    read("app/api/state/route.ts"),
    read("app/api/media/route.ts"),
    read("app/family-access.ts"),
  ]);
  assert.match(page, /const session = await auth\(\)/);
  assert.match(page, /<LoginScreen/);
  assert.match(state, /requireFamilyMembership\("read"\)/);
  assert.match(state, /assertChildPermission/);
  assert.match(state, /requireFamilyManager/);
  assert.match(state, /WHERE family_id = \?/);
  assert.doesNotMatch(state, /WHERE id = ['"]family['"]/);
  assert.match(media, /requireFamilyMembership\("read"\)/);
  assert.match(media, /requireFamilyMembership\("write"\)/);
  assert.match(media, /mediaKeyBelongsToFamily/);
  assert.match(media, /private, no-store/);
  assert.match(access, /await auth\(\)/);
  assert.match(access, /INITIAL_OWNER_EMAIL/);
  assert.match(access, /WRITE_ROLES/);
});

test("Google Auth.js uses database sessions and the official D1 adapter", async () => {
  const auth = await read("auth.ts");
  assert.match(auth, /D1Adapter\(env\.DB\)/);
  assert.match(auth, /strategy: "database"/);
  assert.match(auth, /Google\(/);
  assert.match(auth, /AUTH_GOOGLE_ID/);
  assert.match(auth, /AUTH_GOOGLE_SECRET/);
  assert.match(auth, /AUTH_SECRET/);
  assert.match(auth, /trustHost: true/);
});

test("PWA never serves cached private state after logout or account switches", async () => {
  const sw = await read("public/sw.js");
  assert.match(sw, /star-diary-pwa-v4-refresh/);
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /cache: "no-store"/);
  assert.doesNotMatch(sw, /DATA_CACHE/);
});
