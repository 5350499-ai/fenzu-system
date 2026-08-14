import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("app/check-in/page.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

test("BUG-01 keeps deposit status on the shared SearchableSelect path", () => {
  assert.match(page, /<SearchableSelect label="收款状态"/);
  assert.match(page, /<SearchableSelect label="付款方式"/);
  assert.match(page, /<SearchableSelect label="押金状态"/);
  assert.equal((page.match(/<SearchableSelect label="押金状态"/g) || []).length, 1);
  assert.match(page, /label="押金状态"[\s\S]*options=\{\["已收", "未收"\]/);
});

test("BUG-01 advanced check-in field does not clip the shared dropdown", () => {
  assert.match(
    css,
    /\.check-in-form-grid > \.collapsible-attachments\s*\{\s*overflow:\s*visible;\s*\}/
  );
  assert.match(css, /\.combobox-menu\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*70;/);
});
