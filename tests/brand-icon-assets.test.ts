import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath));

test("brand icon manifest uses dedicated any and maskable assets", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest").toString("utf8"));
  assert.equal(manifest.theme_color, "#001644");
  assert.deepEqual(
    manifest.icons.map((icon: { src: string; sizes: string; purpose: string }) => [icon.src, icon.sizes, icon.purpose]),
    [
      ["/icons/icon-192.png", "192x192", "any"],
      ["/icons/icon-512.png", "512x512", "any"],
      ["/icons/icon-1024.png", "1024x1024", "any"],
      ["/icons/icon-maskable-192.png", "192x192", "maskable"],
      ["/icons/icon-maskable-512.png", "512x512", "maskable"]
    ]
  );
});

test("brand icon sources are vector paths and every public output exists", () => {
  const master = read("brand/icon/bee-rental-icon-master.svg").toString("utf8");
  assert.match(master, /<path/);
  assert.doesNotMatch(master, /<image|data:image/);

  for (const asset of [
    "public/favicon.ico",
    "public/icons/icon-1024.png",
    "public/icons/icon-512.png",
    "public/icons/icon-192.png",
    "public/icons/icon-maskable-192.png",
    "public/icons/icon-maskable-512.png",
    "public/icons/apple-touch-icon.png"
  ]) {
    assert.equal(existsSync(path.join(root, asset)), true, asset);
  }
});

test("favicon contains 16px, 32px and 48px PNG entries", () => {
  const icon = read("public/favicon.ico");
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  assert.equal(icon.readUInt16LE(4), 3);
  assert.deepEqual([icon[6], icon[22], icon[38]], [16, 32, 48]);
});
