import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const contract = readFileSync("SECURITY_BOUNDARY_CONTRACT.md", "utf8");

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function routeFiles(directory: string): string[] {
  return files(directory).filter((file) => file.endsWith("route.ts"));
}

function routePath(file: string) {
  const rel = relative(join(process.cwd(), "app", "api"), file).replaceAll("\\", "/");
  return `/api/${rel.replace(/\/route\.ts$/, "")}`;
}

test("security contract exists and covers the API surface", () => {
  assert.ok(existsSync("SECURITY_BOUNDARY_CONTRACT.md"));
  const routes = routeFiles(join(process.cwd(), "app", "api")).map(routePath).sort();
  assert.equal(routes.length, 54);
  for (const route of routes) assert.ok(contract.includes(route), route);
  assert.match(contract, /SECURITY_7X_COMPLETE_WITH_DEFERRED_RISKS/);
});

test("authentication, authorization and ownership owners remain explicit", () => {
  for (const marker of [
    "SEC.AUTH.SERVER",
    "requireActiveAccount",
    "requireModulePermission",
    "requireSensitivePermission",
    "requirePropertyAccess",
    "SECURITY_BOUNDARY_REGISTRY",
    "OWNERSHIP_VERIFIED",
    "PARENT_OWNERSHIP_VERIFIED",
    "ADMIN_SERVER_GUARDED",
    "SERVER_ONLY_SECRET",
    "CLIENT_SESSION_VIEW"
  ]) assert.ok(contract.includes(marker), marker);
});

test("known security deferred risks and safe boundaries are not erased", () => {
  for (const marker of [
    "SEC.STORAGE.DIFF_BASELINE",
    "SEC.HEADER.HARDENING",
    "SEC.AUTH.CSRF_REVIEW",
    "business-data",
    "No P0 cross-account",
    "SECURITY_7X_COMPLETE_WITH_DEFERRED_RISKS"
  ]) assert.ok(contract.includes(marker), marker);
});

test("no direct client secret module or business Supabase write owner is introduced", () => {
  const sourceFiles = [...files("app"), ...files("components")]
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !file.includes(`${join("app", "api")}`) && !file.includes(`${join("lib", "server")}`));
  const offenders: string[] = [];
  for (const file of sourceFiles) {
    const source = readFileSync(file, "utf8");
    if (/SUPABASE_SERVICE_ROLE_KEY|GOOGLE_CLIENT_SECRET|GOOGLE_REFRESH_TOKEN/.test(source)
      || /import\s+(?!type\b)[^\n]*from\s+["'][^"']*(?:supabase-admin|@\/lib\/server\/)[^"']*["']/.test(source)
      || /\.from\(\s*["'](?:properties|rooms|tenants|contracts|rent_payments|expenses|deposits|tasks)["']\s*\)\s*\.(?:insert|update|delete|upsert)/.test(source)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});

test("API routes do not add destructive GET mutations", () => {
  const offenders: string[] = [];
  for (const file of routeFiles(join(process.cwd(), "app", "api"))) {
    const source = readFileSync(file, "utf8");
    const getBody = source.match(/export\s+async\s+function\s+GET[\s\S]*?(?=export\s+async\s+function\s+(?:POST|PATCH|PUT|DELETE)|$)/)?.[0] || "";
    if (/\.(?:insert|update|delete|upsert)\(|\.rpc\(/.test(getBody)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("redirect, XSS and secret-redaction contracts remain documented", () => {
  for (const marker of [
    "OPEN_REDIRECT",
    "dangerouslySetInnerHTML",
    "sanitizeAuditData",
    "CSRF_NOT_APPLICABLE",
    "RAW_SECRET_LOGGING",
    "HttpOnly",
    "SameSite=Lax"
  ]) assert.ok(contract.includes(marker), marker);
});
