import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function evaluateActionReachability({
  scrollOwnerClientHeight,
  scrollOwnerScrollHeight,
  scrollTop,
  scrollOwnerViewportBottom,
  lastActionViewportBottom,
  bottomOcclusion = 0,
  safeGap = 0
}: {
  scrollOwnerClientHeight: number;
  scrollOwnerScrollHeight: number;
  scrollTop: number;
  scrollOwnerViewportBottom: number;
  lastActionViewportBottom: number;
  bottomOcclusion?: number;
  safeGap?: number;
}) {
  const maxScrollTop = Math.max(0, scrollOwnerScrollHeight - scrollOwnerClientHeight);
  const remainingScroll = Math.max(0, maxScrollTop - Math.max(0, scrollTop));
  const lastActionBottomAtMaxScroll = lastActionViewportBottom - remainingScroll;
  const effectiveVisibleBottom = scrollOwnerViewportBottom - Math.max(0, bottomOcclusion) - Math.max(0, safeGap);
  const requiredExtraScroll = Math.max(0, lastActionBottomAtMaxScroll - effectiveVisibleBottom);
  return { maxScrollTop, lastActionBottomAtMaxScroll, effectiveVisibleBottom, requiredExtraScroll, reachable: requiredExtraScroll === 0 };
}

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const modalPortal = readFileSync(new URL("../components/modal-portal.tsx", import.meta.url), "utf8");
const contentRegionPortal = readFileSync(new URL("../components/content-region-portal.tsx", import.meta.url), "utf8");
const accountCenter = readFileSync(new URL("../components/account-center.tsx", import.meta.url), "utf8");

const appLevelFormPages = [
  "../app/deposits/page.tsx",
  "../app/rent-payments/page.tsx",
  "../app/expenses/page.tsx",
  "../app/properties/page.tsx",
  "../app/properties/[id]/page.tsx",
  "../app/accounts/page.tsx",
  "../app/viewing-appointments/page.tsx",
  "../app/admin/attachments/page.tsx",
  "../app/admin/google-attachment-migration/page.tsx",
  "../components/tasks-server-manager.tsx"
] as const;

test("app-level forms use the shared viewport portal instead of the main content scroll tree", () => {
  assert.match(modalPortal, /document\.getElementById\("app-overlay-root"\)/);
  for (const pagePath of appLevelFormPages) {
    const page = readFileSync(new URL(pagePath, import.meta.url), "utf8");
    assert.match(page, /import \{ ModalPortal \} from "@\/components\/modal-portal"/);
    assert.match(page, /<ModalPortal>[\s\S]*?className="(?:modal-backdrop|attachment-modal-backdrop)"/);
    assert.match(page, /className="(?:modal-backdrop|attachment-modal-backdrop)"[\s\S]*?<\/div><\/ModalPortal>/);
  }
});

test("modal actions use one viewport-owned scroll surface with a normal end gap", () => {
  assert.match(css, /--modal-action-safe-gap:\s*var\(--ui-space-3\)/);
  assert.match(css, /\.modal-card\s*\{[\s\S]*?overflow-y:\s*auto[\s\S]*?scroll-padding-block-end:\s*var\(--modal-action-safe-gap\)/);
  assert.match(css, /\.modal-backdrop\s*\{[\s\S]*?position:\s*fixed[\s\S]*?block-size:\s*100dvh[\s\S]*?padding:\s*var\(--modal-safe-top\)/);
  assert.match(css, /\.modal-card\s*\{[\s\S]*?max-block-size:\s*var\(--modal-viewport-block-size\)/);
  assert.doesNotMatch(css, /\.modal-card\s*\{[^}]*padding-bottom:\s*(?:80|96|100)px/);
});

test("content-region Account Center stays bounded by main while app modals cover the navigation layer", () => {
  assert.match(contentRegionPortal, /document\.getElementById\("app-content-overlay-root"\)/);
  assert.match(accountCenter, /open \? <ContentRegionPortal>[\s\S]*?account-center-backdrop/);
  assert.doesNotMatch(accountCenter, /open \? <ModalPortal>/);
  assert.match(css, /#app-content-overlay-root \.account-center-backdrop\s*\{[\s\S]*?position:\s*absolute[\s\S]*?block-size:\s*100%/);
  assert.match(css, /#app-overlay-root\s*\{[\s\S]*?position:\s*fixed[\s\S]*?z-index:\s*var\(--z-app-modal\)/);
});

test("action geometry contract rejects rubber-band-only actions across iPhone-like heights", () => {
  for (const height of [568, 667, 711, 812, 844]) {
    const usableHeight = height - 24;
    const result = evaluateActionReachability({
      scrollOwnerClientHeight: usableHeight,
      scrollOwnerScrollHeight: usableHeight + 420,
      scrollTop: 0,
      scrollOwnerViewportBottom: usableHeight,
      lastActionViewportBottom: usableHeight + 400,
      safeGap: 20
    });
    assert.equal(result.maxScrollTop, 420);
    assert.equal(result.lastActionBottomAtMaxScroll, usableHeight - 20);
    assert.equal(result.reachable, true);
  }

  const occludedByNavigation = evaluateActionReachability({
    scrollOwnerClientHeight: 645,
    scrollOwnerScrollHeight: 1045,
    scrollTop: 0,
    scrollOwnerViewportBottom: 711,
    lastActionViewportBottom: 1096,
    bottomOcclusion: 66,
    safeGap: 20
  });
  assert.equal(occludedByNavigation.reachable, false);
  assert.ok(occludedByNavigation.requiredExtraScroll > 0);
});
