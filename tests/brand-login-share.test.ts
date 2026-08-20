import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const root = process.cwd();

test("Auth pages use the frozen V8 brand asset through one shared brand component", () => {
  const brand = read(`${root}/components/auth-brand.tsx`);
  assert.match(brand, /brand\/icon\/bee-rental-icon-master\.svg/);
  assert.match(brand, /\/icons\/icon-192\.png/);
  for (const page of ["login", "register", "forgot-password", "reset-password"]) {
    const source = read(`${root}/app/${page}/page.tsx`);
    assert.match(source, /AuthBrand/);
    assert.doesNotMatch(source, /Building2/);
  }
  assert.match(read(`${root}/app/auth/confirmed/page.tsx`), /AuthBrand/);
});

test("Product sharing is canonical and cannot include private session context", () => {
  const source = read(`${root}/lib/share-bee-rental.ts`);
  assert.match(source, /https:\/\/fenzu-system\.vercel\.app/);
  assert.match(source, /navigator\.share/);
  assert.match(source, /navigator\.clipboard/);
  assert.doesNotMatch(source, /workspace|userId|token|session|email/i);
});

test("Personal Center exposes the share action inside the existing responsive grid", () => {
  const component = read(`${root}/components/account-center.tsx`);
  const css = read(`${root}/app/globals.css`);
  assert.match(component, /shareBeeRental/);
  assert.match(component, /分享给朋友/);
  assert.match(component, /BEE_RENTAL_SHARE_URL/);
  assert.match(component, /account-center-name-share-grid/);
  assert.match(css, /@media \(max-width: 359px\)[\s\S]*account-center-summary-item-grid/);
});
