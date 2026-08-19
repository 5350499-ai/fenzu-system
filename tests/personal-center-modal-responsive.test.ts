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
  [375, 560]
] as const;

test("personal center keeps the modal surface scrollable on phone viewports", () => {
  assert.deepEqual(phoneViewports, [
    [375, 667],
    [390, 844],
    [393, 852],
    [430, 932],
    [375, 560]
  ]);
  assert.match(css, /\.account-center-backdrop\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.account-center-backdrop\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(css, /\.account-center-backdrop\s*\{[\s\S]*?overscroll-behavior:\s*contain/);
  assert.match(css, /\.account-center-backdrop\s*\{[\s\S]*?touch-action:\s*pan-y/);
  assert.match(css, /\.account-center-backdrop\s*\{[\s\S]*?-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /\.modal-card\s*\{[\s\S]*?max-height:\s*calc\(100dvh[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.modal-card\s*>\s*\.panel-header:first-child\s*\{[\s\S]*?position:\s*sticky/);
  assert.match(css, /\.account-center-backdrop\s*\{[\s\S]*?env\(safe-area-inset-bottom\)/);
});

test("personal center actions and close control remain part of the scrollable modal", () => {
  assert.match(accountCenter, /aria-label="关闭"/);
  assert.match(accountCenter, /保存新密码/);
  assert.match(accountCenter, /退出登录/);
  assert.match(accountCenter, /className="card modal-card account-center-card"/);
});

test("background scroll remains owned by the global modal manager", () => {
  assert.match(modalManager, /MODAL_SELECTOR\s*=\s*"\.modal-backdrop/);
  assert.match(modalManager, /body\.style\.position\s*=\s*"fixed"/);
  assert.match(modalManager, /body\.style\.overflow\s*=\s*"hidden"/);
  assert.match(modalManager, /html\.style\.overflow\s*=\s*"hidden"/);
});

test("desktop keeps the shared modal sizing contract", () => {
  assert.match(css, /\.modal-card\s*\{[\s\S]*?width:\s*min\(860px,\s*100%\)/);
  assert.match(css, /\.modal-card\s*\{[\s\S]*?max-height:\s*calc\(100dvh\s*-\s*env\(safe-area-inset-top\)/);
});
