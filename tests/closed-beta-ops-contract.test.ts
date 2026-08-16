import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const support = readFileSync("CLOSED_BETA_SUPPORT_RUNBOOK.md", "utf8");
const inventory = readFileSync("CLOSED_BETA_DATA_INVENTORY.md", "utf8");
const release = readFileSync("CLOSED_BETA_RELEASE_RUNBOOK.md", "utf8");
const checklist = readFileSync("CLOSED_BETA_HUMAN_VALIDATION_CHECKLIST.md", "utf8");
const resilience = readFileSync("DATA_RESILIENCE_PRODUCTION_CONTRACT.md", "utf8");

test("Closed Beta support runbook covers incident, recovery and safety boundaries", () => {
  for (const marker of ["登录不了", "恢复失败", "两个账号数据串了", "Support may not", "Severity contract", "Emergency account disable", "Monitoring map", "User feedback template"]) assert.match(support, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(support, /password|access token|JWT/i);
  assert.doesNotMatch(support, /eyJ[A-Za-z0-9_-]{20,}/);
});

test("data inventory records sensitive fields and minimization status", () => {
  for (const marker of ["Passport / NIE", "Phone / email", "Tenant notes", "Recovery metadata", "Optional, not required", "no values in logs"]) assert.match(inventory, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("release and recovery contracts keep staged safety gates", () => {
  for (const marker of ["DATA_RESILIENCE_SCHEDULED_BACKUP_ENABLED=false", "Do not drop migration history", "object missing", "BeforeRestore", "No Restore"]) {
    assert.match(`${release}\n${resilience}`, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("human checklist captures operational evidence", () => {
  for (const marker of ["时间（含时区）", "HTTP/API 错误时间", "弱网/离线", "PWA 重新打开"]) assert.match(checklist, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
