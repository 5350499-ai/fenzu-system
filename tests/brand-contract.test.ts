import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

test("品牌主名称统一为蜜蜂分租", () => {
  assert.match(read("lib/brand.ts"), /PRODUCT_BRAND = "蜜蜂分租"/);
  for (const file of ["app/login/page.tsx", "app/register/page.tsx"]) {
    const source = read(file);
    assert.match(source, /import\s+\{\s*AuthBrand\s*\}\s+from\s+"@\/components\/auth-brand"/);
    assert.match(source, /<AuthBrand(?:\s+[^>]*)?\s*\/>/);
    assert.doesNotMatch(source, /PRODUCT_BRAND/);
  }
  const authBrand = read("components/auth-brand.tsx");
  assert.match(authBrand, /import\s+\{\s*PRODUCT_BRAND/);
  assert.match(authBrand, /<div className="brand-title">\{PRODUCT_BRAND\}<\/div>/);
  assert.match(read("components/app-layout.tsx"), /title: PRODUCT_BRAND/);
  assert.match(read("app/page.tsx"), /title=\{PRODUCT_BRAND\}/);
});

test("PWA 与页面 metadata 使用蜜蜂分租", () => {
  const manifest = read("public/manifest.webmanifest");
  assert.match(manifest, /"name": "蜜蜂分租"/);
  assert.match(manifest, /"short_name": "蜜蜂分租"/);
  const layout = read("app/layout.tsx");
  assert.match(layout, /title: PRODUCT_BRAND/);
  assert.match(layout, /apple-mobile-web-app-title\": PRODUCT_BRAND/);
});

test("旧的用户界面品牌文本不再作为主品牌出现", () => {
  for (const file of ["app/login/page.tsx", "app/register/page.tsx", "components/app-layout.tsx", "app/accounts/page.tsx", "app/data-center/page.tsx", "app/settings/page.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /分租房管理系统|西班牙分租房|V1 分租管理|分租管理系统|咱家分租/);
  }
});

test("技术标识与备份兼容字段保持不变", () => {
  assert.match(read("lib/data-export.ts"), /APPLICATION_NAME = "咱家分租"/);
  assert.match(read("lib/data-export.ts"), /APPLICATION_ID = "zanjia-rental"/);
  assert.match(read("lib/auth-redirect.ts"), /fenzu-system\.vercel\.app/);
});
