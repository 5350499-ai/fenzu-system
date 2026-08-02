import assert from "node:assert/strict";
import { buildMoveOutPlan, validateMoveOutInput } from "@/lib/tenant-move-out";

const tenant = { id: "t1", propertyId: "p1", roomId: "r1", name: "T", phone: "", wechat: "", source: "", monthlyRent: 300, depositAmount: 300, moveInDate: "2026-07-01", status: "在租", notes: "原备注" };
const rooms = [{ id: "r1", propertyId: "p1", name: "501", roomNumber: "501", monthlyRent: 300, depositAmount: 300, status: "已租" }];
const contracts = [{ id: "c1", propertyId: "p1", roomId: "r1", tenantId: "t1", startDate: "2026-07-01", endDate: "", monthlyRent: 300, depositAmount: 300, status: "有效" }];
const deposits = [{ id: "d1", propertyId: "p1", roomId: "r1", tenantId: "t1", type: "收取", amount: 300, status: "已收", transactionDate: "2026-07-01" }];
const before = JSON.stringify({ tenant, rooms, contracts, deposits });

assert.match(validateMoveOutInput({ tenant, tenants: [tenant], rooms, contracts, deposits, actualMoveOutDate: "2026-06-30", depositHandled: true, note: "" }) || "", /不能早于入住/);
const plan = buildMoveOutPlan({ tenant, tenants: [tenant], rooms, contracts, deposits, actualMoveOutDate: "2026-08-02", depositHandled: true, note: "押金已退，部分情况见备注" });
assert.equal(plan.tenants[0].status, "已退租");
assert.equal(plan.tenants[0].actualMoveOutDate, "2026-08-02");
assert.equal(plan.rooms[0].status, "空置");
assert.equal(plan.contracts[0].status, "已结束");
assert.equal(plan.deposits[0].status, "已退");
assert.match(plan.deposits[0].notes || "", /退租押金处理:已退/);
assert.match(plan.tenants[0].notes || "", /押金已退/);
assert.equal(JSON.stringify({ tenant, rooms, contracts, deposits }), before, "planning must not mutate source records");
assert.throws(() => buildMoveOutPlan({ tenant: { ...tenant, status: "已退租" }, tenants: [{ ...tenant, status: "已退租" }], rooms, contracts, deposits, actualMoveOutDate: "2026-08-02", depositHandled: false, note: "" }), /不能重复/);
console.log("tenant move-out tests passed");
