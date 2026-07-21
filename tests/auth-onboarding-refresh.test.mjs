import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authCallbackPath, inviteCallbackPath, parseAuthIntent } from "../app/auth-intent.ts";
import {
  PULL_REFRESH_THRESHOLD_PX,
  pullDirection,
  pullReady,
  resistedPullDistance,
} from "../app/pull-to-refresh-logic.ts";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("auth intent is a fixed allowlist and produces only internal callback paths", () => {
  assert.equal(parseAuthIntent("create_family"), "create_family");
  assert.equal(parseAuthIntent("accept_invite"), "accept_invite");
  assert.equal(parseAuthIntent("https://evil.example"), "sign_in");
  assert.equal(authCallbackPath("create_family"), "/?auth_intent=create_family");
  assert.equal(authCallbackPath("sign_in"), "/?auth_intent=sign_in");
  assert.equal(inviteCallbackPath("safe/token"), "/join/safe%2Ftoken");
});

test("pull refresh locks direction, resists distance, and has one stable threshold", () => {
  assert.equal(pullDirection(3, 4), "pending");
  assert.equal(pullDirection(30, 10), "horizontal");
  assert.equal(pullDirection(5, 40), "vertical");
  assert.notEqual(pullDirection(20, 22), "vertical");
  assert.equal(resistedPullDistance(-10), 0);
  assert.ok(resistedPullDistance(100) < 100);
  assert.equal(pullReady(PULL_REFRESH_THRESHOLD_PX - 1), false);
  assert.equal(pullReady(PULL_REFRESH_THRESHOLD_PX), true);
});

test("PWA pull refresh and manual refresh share live data reload without blocking horizontal UI", async () => {
  const [component, home, account, css] = await Promise.all([
    read("app/pull-to-refresh.tsx"), read("app/star-home.tsx"),
    read("app/account-management.tsx"), read("app/globals.css"),
  ]);
  assert.match(component, /passive: false/);
  assert.match(component, /\.main-navigation/);
  assert.match(component, /\[role='dialog'\]/);
  assert.match(component, /horizontal/);
  assert.match(component, /pageIsAtTop/);
  assert.match(home, /<PullToRefresh onRefresh=\{refreshAllData\}/);
  assert.match(home, /↻ 重新整理資料/);
  assert.match(home, /目前有尚未儲存的變更，確定要重新整理嗎？/);
  assert.match(home, /\/api\/auth\/session/);
  assert.match(home, /APP_DATA_REFRESH_EVENT/);
  assert.match(account, /APP_DATA_REFRESH_EVENT/);
  assert.match(css, /\.pull-refresh-indicator/);
  assert.match(css, /safe-area-inset-top/);
});

test("Google sign-in no longer creates a family and onboarding writes only after explicit confirmation", async () => {
  const [access, login, page, onboarding, route, invite] = await Promise.all([
    read("app/family-access.ts"), read("app/login-screen.tsx"), read("app/page.tsx"),
    read("app/family-onboarding-service.ts"), read("app/api/onboarding/route.ts"),
    read("app/join/[token]/invite-join-client.tsx"),
  ]);
  assert.doesNotMatch(access, /createFamilyForUser/);
  assert.match(access, /findFamilyForAuthenticatedUser/);
  assert.match(access, /尚未加入任何家庭/);
  assert.match(login, /建立新的星星日記家庭/);
  assert.match(login, /登入既有家庭/);
  assert.match(login, /prompt: "select_account"/);
  assert.match(page, /<NoFamilyAccount/);
  assert.match(onboarding, /createFamilyAndOwner/);
  assert.match(onboarding, /INSERT INTO families/);
  assert.match(onboarding, /INSERT INTO family_members/);
  assert.match(onboarding, /INSERT INTO family_state/);
  assert.match(route, /body\.action !== "create_family"/);
  assert.match(invite, /inviteCallbackPath\(token\)/);
  assert.match(invite, /\/api\/invitations\//);
  assert.doesNotMatch(invite, /create_family/);
});
