import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { isAllowedPublicOrigin, recoveryRedirectUrl } from "../lib/auth-redirect.ts";

test("preview recovery redirects use the deployment hostname", () => {
  const previousEnv = { VERCEL_ENV: process.env.VERCEL_ENV, VERCEL_URL: process.env.VERCEL_URL };
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_URL = "fenzu-system-preview-123.vercel.app";
  assert.equal(recoveryRedirectUrl(new Request("https://fenzu-system-preview-123.vercel.app/api/auth/forgot-password")), "https://fenzu-system-preview-123.vercel.app/reset-password");
  if (previousEnv.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previousEnv.VERCEL_ENV;
  if (previousEnv.VERCEL_URL === undefined) delete process.env.VERCEL_URL; else process.env.VERCEL_URL = previousEnv.VERCEL_URL;
});

test("production recovery redirects use the canonical domain", () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  assert.equal(recoveryRedirectUrl(new Request("https://fenzu-system.vercel.app/api/auth/forgot-password")), "https://fenzu-system.vercel.app/reset-password");
  if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous;
});

test("only approved origins are accepted", () => {
  assert.equal(isAllowedPublicOrigin("https://fenzu-system.vercel.app"), true);
  assert.equal(isAllowedPublicOrigin("https://fenzu-system-preview-123.vercel.app"), true);
  assert.equal(isAllowedPublicOrigin("https://evil.example.com"), false);
  assert.equal(isAllowedPublicOrigin("http://localhost:3000", true), true);
  assert.equal(isAllowedPublicOrigin("http://localhost:3000", false), false);
});
