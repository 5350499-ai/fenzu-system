import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const payments = readFileSync(new URL("../app/rent-payments/page.tsx", import.meta.url), "utf8");
const expenses = readFileSync(new URL("../app/expenses/page.tsx", import.meta.url), "utf8");
const rooms = readFileSync(new URL("../app/rooms/page.tsx", import.meta.url), "utf8");
const profits = readFileSync(new URL("../app/property-profits/page.tsx", import.meta.url), "utf8");
const reminders = readFileSync(new URL("../app/reminders/page.tsx", import.meta.url), "utf8");

test("Batch 3 finance rows keep a shared content-driven single-line owner", () => {
  assert.match(payments, /finance-line rent-finance-line/);
  assert.match(expenses, /finance-line expense-finance-line/);
  assert.match(css, /\.rent-finance-line,[\s\S]*?\.expense-finance-line\s*\{[\s\S]*?grid-template-columns:\s*max-content max-content minmax\(0, 1fr\) max-content max-content/);
  assert.doesNotMatch(css, /"date description amount"|"partner description status"/);
  assert.doesNotMatch(css, /\.rent-finance-line\s*\{[^}]*108px 72px|\.expense-finance-line\s*\{[^}]*108px 72px/);
});

test("Batch 3 amounts and status values remain intact inside shrinkable rows", () => {
  assert.match(css, /\.rent-finance-line strong,[\s\S]*?font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /\.rent-finance-line > :nth-child\(4\),[\s\S]*?min-width:\s*max-content[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.rent-finance-line > :nth-child\(5\),[\s\S]*?min-width:\s*max-content[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.rent-finance-line > \*,[\s\S]*?min-width:\s*0/);
});

test("Batch 3 room rows use proportional tracks without changing room business fields", () => {
  assert.match(rooms, /finance-line room-finance-line/);
  assert.match(rooms, /room-current-tenant/);
  assert.match(css, /\.room-finance-line\s*\{[\s\S]*?minmax\(0, 1\.6fr\)[\s\S]*?minmax\(0, 1\.4fr\)/);
  assert.match(css, /\.room-current-tenant\s*\{[\s\S]*?minmax\(0, 1\.25fr\)[\s\S]*?repeat\(4, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /\.room-current-tenant\s*\{[^}]*minmax\(110px, 1\.2fr\)/);
});

test("Batch 3 preserves the verified monthly profit and reminder owners", () => {
  assert.match(profits, /global-monthly-row unified-monthly-row/);
  assert.match(css, /\.unified-monthly-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.1fr\) max-content minmax\(0, 1\.35fr\)/);
  assert.match(css, /\.unified-monthly-amount\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?word-break:\s*keep-all/);
  assert.match(css, /\.unified-monthly-metric,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content/);
  assert.match(reminders, /reminders\.map\(\(item\)/);
  assert.doesNotMatch(css, /\.reminder-page-list-single \.reminder-row-full:last-child\s*\{[^}]*border-bottom\s*:\s*0/);
});
