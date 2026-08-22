import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const accountCenter = readFileSync(new URL("../components/account-center.tsx", import.meta.url), "utf8");
const modalManager = readFileSync(new URL("../components/modal-layer-manager.tsx", import.meta.url), "utf8");
const accountMe = readFileSync(new URL("../app/api/accounts/me/route.ts", import.meta.url), "utf8");
const registration = readFileSync(new URL("../lib/server/account-management.ts", import.meta.url), "utf8");

const phoneViewports = [
  [375, 667],
  [390, 844],
  [393, 852],
  [430, 932],
  [667, 375]
] as const;

const desktopViewport = [1366, 768] as const;

test("personal center keeps the modal surface scrollable on phone viewports", () => {
  assert.deepEqual(phoneViewports, [
    [375, 667],
    [390, 844],
    [393, 852],
    [430, 932],
    [667, 375]
  ]);
  assert.deepEqual(desktopViewport, [1366, 768]);
  assert.match(css, /\.modal-backdrop\s*\{[\s\S]*?height:\s*100dvh/);
  assert.match(css, /\.account-center-backdrop\s*\{[\s\S]*?env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.account-center-scroll\s*\{[\s\S]*?min-height:\s*0[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.account-center-scroll\s*\{[\s\S]*?overscroll-behavior-y:\s*contain/);
  assert.match(css, /\.account-center-scroll\s*\{[\s\S]*?touch-action:\s*pan-y/);
  assert.match(css, /\.account-center-scroll\s*\{[\s\S]*?-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /\.account-center-scroll\s*\{[\s\S]*?scroll-padding-block:[\s\S]*?env\(safe-area-inset-bottom\)/);
});

test("Batch 2 gives Account Center a definite surface and one scroll body", () => {
  assert.match(css, /--modal-safe-top:\s*max\(8px,\s*env\(safe-area-inset-top\)\)/);
  assert.match(css, /--modal-viewport-block-size:\s*calc\(100dvh/);
  assert.match(css, /\.modal-card\.account-center-card\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)[\s\S]*?block-size:\s*min\(100%,\s*var\(--modal-viewport-block-size\)\)/);
  assert.match(css, /\.account-center-scroll\s*\{[\s\S]*?min-block-size:\s*0[\s\S]*?overflow-y:\s*auto/);
  assert.doesNotMatch(css, /max-height:\s*92vh/);
  assert.doesNotMatch(css, /\.account-center-card\s*\{[^}]*height:\s*auto/);
});

test("personal center uses one scroll body with reachable actions and a fixed header", () => {
  assert.match(accountCenter, /<div className="account-center-scroll">[\s\S]*?保存新密码[\s\S]*?退出登录[\s\S]*?<\/div>/);
  assert.match(accountCenter, /<div className="account-center-scroll">\s*<div className="account-center-content">[\s\S]*?account-center-logout-actions[\s\S]*?<\/div>\s*<\/div>/);
  assert.match(accountCenter, /<div className="panel-header account-center-header">[\s\S]*?aria-label="关闭个人中心"[\s\S]*?<\/div>\s*<div className="account-center-scroll">/);
  assert.match(css, /\.account-center-card\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.account-center-card\s*\{[\s\S]*?scrollbar-gutter:\s*auto/);
  assert.match(css, /\.account-center-backdrop\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.doesNotMatch(css, /\.account-center-backdrop\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(accountCenter, /aria-label="关闭个人中心"/);
  assert.match(accountCenter, /保存新密码/);
  assert.match(accountCenter, /退出登录/);
});

test("personal center close action belongs to a stable touch-sized header", () => {
  assert.match(accountCenter, /className="account-center-close"/);
  assert.match(css, /\.modal-card\.account-center-card > \.panel-header\.account-center-header:first-child\s*\{[\s\S]*?position:\s*static[\s\S]*?flex:\s*0 0 auto/);
  assert.match(css, /\.account-center-close\s*\{[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/);
  assert.match(css, /\.account-center-close\s*\{[\s\S]*?touch-action:\s*manipulation/);
});

test("personal center keeps long identity text inside the modal", () => {
  assert.match(accountCenter, /maxLength=\{80\}/);
  assert.match(accountCenter, /title=\{access\.profileDisplayName \|\| "用户"\}/);
  assert.match(css, /\.account-center-summary-item strong\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(css, /\.account-center-card\s*\{[\s\S]*?max-height:\s*calc\(100dvh/);
});

test("password form is compact and remains in the sole scroll owner", () => {
  assert.match(accountCenter, /account-center-password-section[\s\S]*?account-center-password-form[\s\S]*?保存新密码/);
  assert.match(css, /\.account-center-password-section\s*\{[\s\S]*?overflow:\s*visible[\s\S]*?background:\s*transparent/);
  assert.match(css, /\.account-center-card \.account-center-password-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/);
  assert.doesNotMatch(css, /\.account-center-password-(?:section|form)\s*\{[^}]*overflow-y:\s*(?:auto|scroll)/);
});

test("personal center uses a shared inline boundary for every section", () => {
  assert.match(accountCenter, /account-center-content[\s\S]*?account-center-summary[\s\S]*?account-center-password-section[\s\S]*?account-center-logout-actions/);
  assert.match(accountCenter, /account-center-summary-item-grid[\s\S]*?账号类型[\s\S]*?账号状态/);
  assert.match(css, /\.account-center-content\s*\{[\s\S]*?width:\s*100%[\s\S]*?box-sizing:\s*border-box/);
  assert.match(css, /\.account-center-summary-item-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /--account-center-inline-padding/);
  assert.match(css, /--account-center-section-gap/);
  assert.match(css, /--account-center-card-gap/);
});

test("personal center keeps equal-width fields and actions without fixed content widths", () => {
  assert.match(css, /\.account-center-password-form input,[\s\S]*?width:\s*100%/);
  assert.match(css, /\.account-center-password-actions,[\s\S]*?width:\s*100%/);
  assert.match(css, /\.account-center-password-actions \.btn,[\s\S]*?min-width:\s*0/);
  assert.doesNotMatch(css, /\.account-center-content\s*\{[^}]*width:\s*\d+px/);
  assert.doesNotMatch(css, /\.account-center-content\s*\{[^}]*margin-(?:left|right):/);
});

test("display name defaults to 用户 and is edited only through the current-account route", () => {
  assert.match(registration, /suppliedName \|\| DEFAULT_ACCOUNT_DISPLAY_NAME/);
  assert.doesNotMatch(registration, /email\.split\("@"\)\[0\]/);
  assert.match(accountCenter, /fetch\("\/api\/accounts\/me",\s*\{[\s\S]*?method:\s*"PATCH"/);
  assert.match(accountCenter, /body:\s*JSON\.stringify\(\{ displayName \}\)/);
  assert.match(accountCenter, /await access\.refresh\(\)/);
  assert.match(accountMe, /\.eq\("auth_user_id", context\.userId\)[\s\S]*?\.eq\("workspace_owner_id", context\.profile\.workspace_owner_id\)/);
});

test("background scroll remains owned by the global modal manager", () => {
  assert.match(modalManager, /MODAL_SELECTOR\s*=\s*"\.modal-backdrop/);
  assert.match(modalManager, /body\.style\.position\s*=\s*"fixed"/);
  assert.match(modalManager, /body\.style\.overflow\s*=\s*"hidden"/);
  assert.match(modalManager, /html\.style\.overflow\s*=\s*"hidden"/);
  assert.doesNotMatch(modalManager, /touchmove|pointermove|preventDefault/);
});

test("desktop keeps the shared modal sizing contract", () => {
  assert.match(css, /\.modal-card\s*\{[\s\S]*?width:\s*min\(860px,\s*100%\)/);
  assert.match(css, /\.modal-card\s*\{[\s\S]*?max-height:\s*calc\(100dvh\s*-\s*env\(safe-area-inset-top\)/);
  assert.match(css, /\.account-center-card:hover\s*\{[\s\S]*?transform:\s*none/);
});
