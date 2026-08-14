import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const contract = readFileSync("SERVER_BOUNDARY_CONTRACT.md", "utf8");

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

function routePath(file: string) {
  const rel = relative(join(process.cwd(), "app", "api"), file).replaceAll("\\", "/");
  return `/api/${rel.replace(/\/route\.ts$/, "")}`;
}

test("server boundary contract and complete API registry exist", () => {
  assert.ok(existsSync("SERVER_BOUNDARY_CONTRACT.md"));
  const routes = routeFiles(join(process.cwd(), "app", "api")).map(routePath).sort();
  assert.equal(routes.length, 45);
  for (const route of routes) assert.ok(contract.includes(`\`${route}\``), route);
  assert.match(contract, /LEGACY_CANONICAL_COMPATIBILITY_BOUNDARY/);
  assert.match(contract, /SERVER_BOUNDARY_6X_COMPLETE_WITH_DEFERRED_RISKS/);
});

test("shared server ownership and write boundaries remain explicit", () => {
  for (const marker of [
    "requireActiveAccount",
    "requireModulePermission",
    "requireSensitivePermission",
    "requirePropertyAccess",
    "create_atomic_check_in",
    "update_tenant_current_assignment",
    "confirm_partner_settlement",
    "reverse_partner_settlement",
    "restore_workspace_backup",
    "CANONICAL_SERVER_WRITE",
    "RPC_WRITE",
    "DIRECT_CLIENT_DB_WRITE",
    "CLIENT_ONLY_CRITICAL_VALIDATION",
    "OVERPOSTING_RISK",
    "ACCOUNT_SCOPE_BYPASS"
  ]) assert.ok(contract.includes(marker), marker);
});

test("known non-atomic actions cannot be relabeled as atomic", () => {
  assert.match(contract, /Move out[\s\S]*SERVER_IDEMPOTENCY_PENDING[\s\S]*NON_ATOMIC/);
  assert.match(contract, /Rent payment[\s\S]*SERVER_IDEMPOTENCY_PENDING[\s\S]*NON_ATOMIC/);
  assert.match(contract, /Settlement confirm[\s\S]*BATCH_IDEMPOTENCY_PENDING/);
  assert.match(contract, /NON_ATOMIC batch/);
});

test("client components do not become direct Supabase business write owners", () => {
  const offenders: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "api") continue;
        visit(path);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = readFileSync(path, "utf8");
        if (/\.from\(\s*["'](?:properties|rooms|tenants|contracts|rent_payments|expenses|deposits|tasks)["']\s*\)\s*\.(?:insert|update|delete|upsert)/.test(source)
          || /\.rpc\(\s*["'](?:create_atomic_check_in|update_tenant_current_assignment|confirm_partner_settlement|reverse_partner_settlement)["']/.test(source)) {
          offenders.push(path);
        }
      }
    }
  };
  for (const root of ["app", "components"]) visit(root);
  assert.deepEqual(offenders, []);
});

test("error, compatibility and deferred-risk policy is locked", () => {
  for (const marker of [
    "400",
    "401",
    "403",
    "404",
    "409",
    "5xx",
    "business-*",
    "v1-properties",
    "v1-tasks",
    "No P0 cross-account write was proven",
    "RPC signatures and semantics are frozen"
  ]) assert.ok(contract.includes(marker), marker);
});
