import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

const repo = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const sourceMigrations = path.join(repo, "supabase", "migrations");
const workdir = path.resolve(process.env.RESTORE_LAB_WORKDIR || path.join(process.env.TEMP || ".", "fenzu-restore-clean-bootstrap"));
const projectId = process.env.RESTORE_LAB_PROJECT_ID || "fenzu-restore-clean-bootstrap";

function run(args, cwd = repo) {
  return execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["supabase", ...args], { cwd, encoding: "utf8", stdio: "inherit", shell: process.platform === "win32" });
}

function copyMigrations() {
  const destination = path.join(workdir, "supabase", "migrations");
  fs.mkdirSync(destination, { recursive: true });
  for (const name of fs.readdirSync(sourceMigrations).filter((entry) => entry.endsWith(".sql"))) {
    let outputName = name;
    if (name.startsWith("202606160002_")) outputName = name.includes("contract_files")
      ? name.replace("202606160002_", "20260616000202_")
      : name.replace("202606160002_", "20260616000201_");
    if (name.startsWith("20260806080332_restore_schema_single_source")) outputName = name.replace("20260806080332_", "20260806130001_");
    fs.copyFileSync(path.join(sourceMigrations, name), path.join(destination, outputName));
  }

  // This is a visible, local-only normalization. It removes an empty-database
  // precondition that names a Production Auth identity; it never alters the
  // repository migration or seeds that identity locally.
  const ownerGate = path.join(destination, "20260713154204_accounts_permissions_stage1.sql");
  let source = fs.readFileSync(ownerGate, "utf8");
  const gate = /-- Abort before any DDL if the fixed owner email and Auth user id do not match\.[\s\S]*?end \$\$;/;
  if (!gate.test(source)) throw new Error("bootstrap gate not found: Production owner identity precondition");
  source = source.replace(gate, "-- Local bootstrap: Production owner identity precondition intentionally excluded; fixtures use isolated identities.\n");
  const fixedSeed = /-- Seed the fixed current account as the only owner\.[\s\S]*?updated_by = excluded\.updated_by/;
  if (!fixedSeed.test(source)) throw new Error("bootstrap seed gate not found: fixed Production user profile");
  source = source.replace(fixedSeed, "-- Local bootstrap: Production owner seed intentionally excluded; fixture seed runs after schema bootstrap.\n");
  const permissionSeed = /insert into public\.user_permissions \([\s\S]*?updated_at = now\(\)/;
  if (!permissionSeed.test(source)) throw new Error("bootstrap seed gate not found: fixed Production permissions");
  source = source.replace(permissionSeed, "-- Local bootstrap: Production owner permissions intentionally excluded; fixture seed runs after schema bootstrap.\n");
  const sensitiveSeed = /insert into public\.user_sensitive_permissions \([\s\S]*?updated_at = now\(\)/;
  if (!sensitiveSeed.test(source)) throw new Error("bootstrap seed gate not found: fixed Production sensitive permissions");
  source = source.replace(sensitiveSeed, "-- Local bootstrap: Production sensitive permissions intentionally excluded; fixture seed runs after schema bootstrap.\n");
  fs.writeFileSync(ownerGate, source);

  for (const name of fs.readdirSync(destination).filter((entry) => entry.endsWith(".sql"))) {
    const file = path.join(destination, name);
    let sql = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    sql = sql.replace(/do \$\$[\s\S]*?expected_owner_id[\s\S]*?end \$\$;/gi, "-- Local bootstrap: fixed Production owner guard omitted; isolated fixture identity is supplied after schema bootstrap.\n");
    sql = sql.replace(/insert into public\.account_auth_identities \([\s\S]*?is_internal_email = false,\s*updated_at = now\(\)/gi, "-- Local bootstrap: Production auth identity intentionally excluded; fixture seed runs after schema bootstrap.\n");
    if (["202607150001_account_permissions_stage3.sql", "20260730120000_add_actual_move_out_date.sql", "20260808000400_fix_authorized_tenants_occupant_count_return.sql"].includes(name)) {
      const replacement = name.includes("20260808000400")
        ? "    null::text, null::text, null::text, null::text, t.source, t.move_in_date, t.expected_move_out_date, t.actual_move_out_date,\n    t.monthly_rent, t.deposit_amount, t.key_count, t.status,\n    case when app_private.has_sensitive_permission('view_tenant_notes') then t.notes else null end,\n    t.created_at, t.updated_at, t.payment_day, t.occupant_count"
        : "    null::text, null::text, null::text, null::text, t.source, t.move_in_date, t.expected_move_out_date, t.actual_move_out_date,\n    t.monthly_rent, t.deposit_amount, t.key_count, t.status,\n    case when app_private.has_sensitive_permission('view_tenant_notes') then t.notes else null end,\n    t.created_at, t.updated_at, t.payment_day";
      const projection = /    t\.source, t\.monthly_rent, t\.deposit_amount, t\.status,[\s\S]*?t\.created_at, t\.updated_at, t\.payment_day(?:, t\.actual_move_out_date)?(?:,\s*\n    t\.occupant_count)?/;
      if (!projection.test(sql)) throw new Error(`bootstrap gate not found: ${name} tenant projection`);
      sql = sql.replace(projection, replacement);
    }
    if (name === "20260823180000_coverage_and_deposit_income.sql") {
      const roomMarker = "  v_marker := E'  update public.rooms\\n  set status = ''已租''';";
      const markerIndex = sql.indexOf(roomMarker);
      const guard = "  if position(v_marker in v_source) = 0 then\n    raise exception 'create_atomic_check_in room update marker not found';\n  end if;";
      const guardIndex = markerIndex < 0 ? -1 : sql.indexOf(guard, markerIndex);
      if (guardIndex < 0) throw new Error("bootstrap gate not found: CRLF room update marker");
      const fallback = "  if position(v_marker in v_source) > 0 then\n    v_source := replace(v_source, v_marker, v_replacement);\n  else\n    v_marker := E'  update public.rooms\\r\\n  set status = ''已租''';\n    if position(v_marker in v_source) = 0 then\n      raise exception 'create_atomic_check_in room update marker not found';\n    end if;\n    v_source := replace(v_source, v_marker, v_replacement);\n  end if;";
      sql = sql.slice(0, guardIndex) + fallback + sql.slice(guardIndex + guard.length);
    }
    fs.writeFileSync(file, sql);
  }
}

if (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.SUPABASE_DB_URL) {
  throw new Error("Refusing local bootstrap while Supabase URL/DB credentials are present in the environment");
}

if (!fs.existsSync(path.join(workdir, "supabase", "config.toml"))) {
  fs.mkdirSync(workdir, { recursive: true });
  run(["init", "--workdir", workdir, "--force"]);
}
let config = fs.readFileSync(path.join(workdir, "supabase", "config.toml"), "utf8");
config = config.replace(/^project_id\s*=.*$/m, `project_id = "${projectId}"`);
fs.writeFileSync(path.join(workdir, "supabase", "config.toml"), config);
copyMigrations();
console.log(JSON.stringify({ projectId, workdir, migrationSource: sourceMigrations, finalSchemaBootstrap: path.join(repo, "supabase", "bootstrap", "restore-production-equivalent.sql"), status: "prepared", next: "supabase start, then apply finalSchemaBootstrap with psql in this isolated workdir" }, null, 2));
