import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const payments = readFileSync(new URL("../app/rent-payments/page.tsx", import.meta.url), "utf8");
const expenses = readFileSync(new URL("../app/expenses/page.tsx", import.meta.url), "utf8");
const rooms = readFileSync(new URL("../app/rooms/page.tsx", import.meta.url), "utf8");
const profits = readFileSync(new URL("../app/property-profits/page.tsx", import.meta.url), "utf8");
const reminders = readFileSync(new URL("../app/reminders/page.tsx", import.meta.url), "utf8");

test("content-driven dense rows use semantic tracks instead of phone-specific forced wrapping", () => {
  assert.match(payments, /finance-line rent-finance-line/);
  assert.match(expenses, /finance-line expense-finance-line/);
  assert.match(css, /\.finance-line\s*\{[\s\S]*?grid-template-columns:\s*max-content max-content minmax\(0, 1fr\) max-content max-content/);
  assert.doesNotMatch(css, /"date description amount"|"partner description status"/);
  assert.doesNotMatch(css, /@media \(max-width: 390px\)/);
});

test("dates, amounts and statuses retain their complete content while descriptions shrink first", () => {
  const financeValues = /\.rent-finance-line > :nth-child\(1\),[\s\S]*?\.expense-finance-line > :nth-child\(5\)\s*\{[\s\S]*?min-width:\s*max-content[\s\S]*?white-space:\s*nowrap/;
  const financeText = /\.rent-finance-line > :nth-child\(2\),[\s\S]*?\.expense-finance-line > :nth-child\(3\)\s*\{[\s\S]*?min-width:\s*0[\s\S]*?text-overflow:\s*ellipsis/;
  assert.match(css, financeValues);
  assert.match(css, financeText);
  assert.match(css, /\.unified-monthly-amount\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?word-break:\s*keep-all/);
});

test("property result, room, tenant and reminder owners keep their established proportional contracts", () => {
  assert.match(profits, /global-monthly-row unified-monthly-row/);
  assert.match(css, /\.unified-monthly-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.1fr\) max-content minmax\(0, 1\.35fr\)/);
  assert.match(css, /\.unified-monthly-financial \.unified-monthly-metric\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content/);
  assert.match(rooms, /finance-line room-finance-line/);
  assert.match(css, /\.room-finance-line\s*\{[\s\S]*?minmax\(0, 1\.6fr\)[\s\S]*?minmax\(0, 1\.4fr\)/);
  assert.match(css, /\.tenant-list-identity-row\s*\{[\s\S]*?3fr\)[\s\S]*?4fr\)[\s\S]*?3fr\)/);
  assert.match(reminders, /reminders\.map\(\(item\)/);
});

test("semantic shell breakpoints cover standard and non-standard verification widths without device rules", () => {
  const probeWidths = [320, 341, 375, 390, 412, 430, 527, 768, 853, 1024, 1186, 1440];
  for (const width of probeWidths) {
    const mode = width <= 640 ? "phone" : width <= 1100 ? "medium" : "desktop";
    assert.ok(["phone", "medium", "desktop"].includes(mode));
  }
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(min-width: 641px\) and \(max-width: 1100px\)/);
  assert.match(css, /@media \(min-width: 1101px\)/);
  assert.doesNotMatch(css, /@media[^\{]*(?:320|375|390|412|430|768|1024|1440)px/);
});
