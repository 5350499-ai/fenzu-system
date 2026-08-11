import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { buildTenantMoveOutPlan, createMoveOutSubmissionGuard } from "../lib/tenant-move-out.ts";

const tenant: { id: string; roomId: string; status: string; actualMoveOutDate?: string } = { id: "tenant-1", roomId: "room-1", status: "在租" };
const base = {
  tenant,
  tenants: [tenant],
  rooms: [{ id: "room-1", status: "已租" }],
  contracts: [{ tenantId: "tenant-1", status: "有效" }],
  deposits: [{ tenantId: "tenant-1", status: "已收" }],
  actualMoveOutDate: "2026-08-11",
  actualMoveOutDateEnabled: true,
  isCurrentRelationship: (item: typeof tenant) => item.status === "在租" || item.status === "即将退租",
  isVoidedDeposit: () => false
};

test("normal move-out ends relationship, contract and room occupancy", () => {
  const plan = buildTenantMoveOutPlan({ ...base, depositStatus: "待退" as const });
  assert.equal(plan.tenants[0].status, "已退租");
  assert.equal(plan.tenants[0].actualMoveOutDate, "2026-08-11");
  assert.equal(plan.rooms[0].status, "空置");
  assert.equal(plan.contracts[0].status, "已结束");
  assert.equal(plan.deposits[0].status, "待退");
});

test("processed deposit is persisted without creating a refund expense", () => {
  const plan = buildTenantMoveOutPlan({ ...base, depositStatus: "已退" as const });
  assert.equal(plan.deposits[0].status, "已退");
  assert.deepEqual(Object.keys(plan).sort(), ["contracts", "deposits", "rooms", "tenants"]);
});

test("another current tenant keeps the room occupied", () => {
  const other = { id: "tenant-2", roomId: "room-1", status: "即将退租" };
  const plan = buildTenantMoveOutPlan({ ...base, tenants: [tenant, other], depositStatus: "待退" as const });
  assert.equal(plan.rooms[0].status, "已租");
});

test("validation rejects a stale or already-ended tenant", () => {
  assert.throws(() => buildTenantMoveOutPlan({
    ...base,
    tenant: { ...tenant, status: "已退租" },
    tenants: [{ ...tenant, status: "已退租" }],
    depositStatus: "待退" as const
  }), /已不是当前租赁关系/);
});

test("duplicate move-out submission is rejected while the first request is active", async () => {
  const guard = createMoveOutSubmissionGuard();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const first = guard.run(async () => { await pending; return "saved"; });
  const second = await guard.run(async () => "duplicate");
  assert.equal(second.started, false);
  release();
  assert.deepEqual(await first, { started: true, value: "saved" });
});

test("submission guard releases after a server failure", async () => {
  const guard = createMoveOutSubmissionGuard();
  await assert.rejects(guard.run(async () => { throw new Error("server failure"); }), /server failure/);
  assert.deepEqual(await guard.run(async () => "retry"), { started: true, value: "retry" });
});
