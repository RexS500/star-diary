import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root));
const pngSize = buffer => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });

test("web manifest is installable and uses the complete Star Diary icon set", async () => {
  const manifest = JSON.parse(await readFile(new URL("public/manifest.json", root), "utf8"));
  assert.equal(manifest.name, "星星日記 Star Diary");
  assert.equal(manifest.short_name, "星星日記");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "portrait");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.theme_color, "#2563a6");
  assert.equal(manifest.background_color, "#2563a6");
  for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
    const icon = manifest.icons.find(item => item.src === `/icon-${size}.png`);
    assert.equal(icon?.sizes, `${size}x${size}`);
    assert.deepEqual(pngSize(await read(`public/icon-${size}.png`)), { width: size, height: size });
  }
  assert.ok(manifest.icons.some(item => item.sizes === "512x512" && item.purpose === "maskable"));
});

test("Apple and browser assets are generated from the project logo at valid sizes", async () => {
  assert.deepEqual(pngSize(await read("public/apple-touch-icon.png")), { width: 180, height: 180 });
  assert.deepEqual(pngSize(await read("public/favicon-16.png")), { width: 16, height: 16 });
  assert.deepEqual(pngSize(await read("public/favicon-32.png")), { width: 32, height: 32 });
  assert.deepEqual(pngSize(await read("public/android-chrome-192.png")), { width: 192, height: 192 });
  assert.deepEqual(pngSize(await read("public/android-chrome-512.png")), { width: 512, height: 512 });
  assert.deepEqual(pngSize(await read("public/splash-1170x2532.png")), { width: 1170, height: 2532 });
  assert.deepEqual(pngSize(await read("public/launch-v2-1170x2532.png")), { width: 1170, height: 2532 });
  const ico = await read("public/favicon.ico");
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);
  const generator = await readFile(new URL("scripts/generate-pwa-assets.ps1", root), "utf8");
  assert.match(generator, /#2563A6/);
  assert.match(generator, /width \* 0\.32/);
  assert.match(generator, /launch-v2-/);
});

test("service worker caches the shell while protecting live state and version checks", async () => {
  const sw = await readFile(new URL("public/sw.js", root), "utf8");
  assert.match(sw, /CACHE_PREFIX = "star-diary-pwa-v3-auth"/);
  assert.match(sw, /request\.method !== "GET"/);
  assert.match(sw, /url\.pathname === "\/api\/state"/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/auth"\)/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/media"\)/);
  assert.doesNotMatch(sw, /DATA_CACHE|cache\.put\(request.*api\/state/);
  assert.match(sw, /url\.pathname === "\/api\/version"/);
  assert.match(sw, /cache: "no-store"/);
  assert.match(sw, /request\.mode === "navigate"/);
  assert.match(sw, /caches\.match\("\/offline\.html"\)/);
  assert.match(sw, /staleWhileRevalidate/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(sw, /caches\.delete/);
  assert.match(sw, /startsWith\("star-diary"\)/);
});

test("PWA metadata, installation guidance and automatic version checks are wired into the app", async () => {
  const [layout, manager, home, css, versionRoute, vite] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/pwa-manager.tsx", root), "utf8"),
    readFile(new URL("app/star-home.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/api/version/route.ts", root), "utf8"),
    readFile(new URL("vite.config.ts", root), "utf8"),
  ]);
  assert.match(layout, /manifest: "\/manifest\.json"/);
  assert.match(layout, /appleWebApp/);
  assert.match(layout, /startupImage/);
  assert.match(layout, /launch-v2-1170x2532\.png/);
  assert.match(layout, /meta name="theme-color" content="#2563a6"/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(layout, /<PwaManager\/>/);
  assert.match(manager, /beforeinstallprompt/);
  assert.match(manager, /加入 iPhone 主畫面/);
  assert.match(manager, /星星日記已更新/);
  assert.match(manager, /Version \{__STAR_DIARY_VERSION__\}/);
  assert.match(manager, /serviceWorker\.register/);
  assert.match(manager, /pwa-launch-splash/);
  assert.match(manager, /MAX_SPLASH_MS = 300/);
  assert.match(manager, /star-diary:ready/);
  assert.doesNotMatch(manager, /1100/);
  assert.doesNotMatch(manager, /STAR DIARY/);
  assert.match(css, /\.pwa-launch-splash[^}]+background:#2563a6/);
  assert.match(css, /\.pwa-launch-brand img[^}]+width:min\(32vw,132px\)/);
  assert.doesNotMatch(css, /pwa-brand-reveal|pwa-splash-finish/);
  assert.match(home, /className="visually-hidden">正在載入家庭資料/);
  assert.match(versionRoute, /Cache-Control.*no-store/);
  assert.match(vite, /rev-list", "--count", "HEAD"/);
  assert.match(vite, /__STAR_DIARY_VERSION__/);
  assert.match(vite, /__STAR_DIARY_BUILD_ID__/);
});
