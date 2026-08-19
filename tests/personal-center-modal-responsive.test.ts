import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const accountCenter = readFileSync(new URL("../components/account-center.tsx", import.meta.url), "utf8");
const modalManager = readFileSync(new URL("../components/modal-layer-manager.tsx", import.meta.url), "utf8");

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

test("personal center uses one scroll body with reachable actions and a fixed header", () => {
  assert.match(accountCenter, /<div className="account-center-scroll">[\s\S]*?保存新密码[\s\S]*?退出登录[\s\S]*?<\/div>/);
  assert.match(accountCenter, /<div className="panel-header">[\s\S]*?aria-label="关闭"[\s\S]*?<\/div>\s*<div className="account-center-scroll">/);
  assert.match(css, /\.account-center-card\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.account-center-backdrop\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.doesNotMatch(css, /\.account-center-backdrop\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(accountCenter, /aria-label="关闭"/);
  assert.match(accountCenter, /保存新密码/);
  assert.match(accountCenter, /退出登录/);
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
