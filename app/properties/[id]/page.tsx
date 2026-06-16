"use client";

import { AppLayout } from "@/components/app-layout";
import { MoneyInput } from "@/components/money-input";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessContract,
  BusinessDeposit,
  BusinessExpense,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  contractKey,
  depositKey,
  expenseKey,
  getInitialContracts,
  getInitialDeposits,
  getInitialExpenses,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  getInitialTenants,
  loadBusinessData,
  propertyKey,
  rentPaymentKey,
  roomKey,
  saveBusinessData,
  tenantKey
} from "@/lib/business-data";
import { noteSummary } from "@/lib/format";
import { Edit3, Plus, Trash2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Tab = "overview" | "rooms" | "tenants" | "contracts" | "payments" | "deposits" | "expenses" | "notes";
type Editor = "room" | "tenant" | "contract" | "payment" | "deposit" | "expense" | null;

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "概览" },
  { id: "rooms", label: "房间" },
  { id: "tenants", label: "租客" },
  { id: "contracts", label: "合同" },
  { id: "payments", label: "收租" },
  { id: "deposits", label: "押金" },
  { id: "expenses", label: "支出" },
  { id: "notes", label: "备注" }
];

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [editor, setEditor] = useState<Editor>(null);
  const [roomForm, setRoomForm] = useState<BusinessRoom>(emptyRoom(propertyId));
  const [tenantForm, setTenantForm] = useState<BusinessTenant>(emptyTenant(propertyId));
  const [contractForm, setContractForm] = useState<BusinessContract>(emptyContract(propertyId));
  const [paymentForm, setPaymentForm] = useState<BusinessRentPayment>(emptyPayment(propertyId));
  const [depositForm, setDepositForm] = useState<BusinessDeposit>(emptyDeposit(propertyId));
  const [expenseForm, setExpenseForm] = useState<BusinessExpense>(emptyExpense(propertyId));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms));
      const loadedContracts = await loadBusinessData<BusinessContract>(contractKey, getInitialContracts(loadedProperties, loadedRooms, loadedTenants));
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(loadedProperties, loadedRooms, loadedTenants));
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits(loadedProperties, loadedRooms, loadedTenants));
      const loadedExpenses = await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties));
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setPayments(loadedPayments);
      setDeposits(loadedDeposits);
      setExpenses(loadedExpenses);
      setLoaded(true);
    }
    load().catch(console.error);
  }, []);

  const property = properties.find((item) => item.id === propertyId);
  const scopedRooms = rooms.filter((item) => item.propertyId === propertyId);
  const scopedTenants = tenants.filter((item) => item.propertyId === propertyId);
  const scopedContracts = contracts.filter((item) => item.propertyId === propertyId);
  const scopedPayments = payments.filter((item) => item.propertyId === propertyId);
  const scopedDeposits = deposits.filter((item) => item.propertyId === propertyId);
  const scopedExpenses = expenses.filter((item) => item.propertyId === propertyId);
  const currentTenantCount = scopedTenants.filter((item) => item.status === "在租").length;
  const monthlyIncome = scopedPayments.reduce((sum, item) => sum + item.amountPaid, 0);
  const hasOverdue = scopedPayments.some((item) => item.isOverdue);

  const roomOptions = scopedRooms.map((room) => ({
    value: room.id,
    label: room.name,
    description: `编号 ${room.roomNumber} · ${room.status}`,
    keywords: room.roomNumber
  }));
  const tenantOptions = scopedTenants
    .filter((tenant) => !tenantForm.roomId || tenant.roomId === tenantForm.roomId)
    .map((tenant) => ({
      value: tenant.id,
      label: tenant.name,
      description: `${tenant.phone} · ${tenant.wechat || "无微信"}`,
      keywords: `${tenant.phone} ${tenant.wechat}`
    }));

  function remove<T extends { id: string }>(id: string, setter: (updater: (current: T[]) => T[]) => void) {
    window.alert("为避免误删真实业务数据，请到对应管理页面使用归档、退租、作废或永久删除。");
  }

  function closeEditor() {
    setEditor(null);
    setRoomForm(emptyRoom(propertyId));
    setTenantForm(emptyTenant(propertyId));
    setContractForm(emptyContract(propertyId));
    setPaymentForm(emptyPayment(propertyId));
    setDepositForm(emptyDeposit(propertyId));
    setExpenseForm(emptyExpense(propertyId));
  }

  function savePropertyNotes(notes: string) {
    const next = properties.map((item) => (item.id === propertyId ? { ...item, notes } : item));
    setProperties(next);
    saveBusinessData(propertyKey, next).catch(console.error);
  }

  useEffect(() => { if (loaded) saveBusinessData(roomKey, rooms).catch(console.error); }, [loaded, rooms]);
  useEffect(() => { if (loaded) saveBusinessData(tenantKey, tenants).catch(console.error); }, [loaded, tenants]);
  useEffect(() => { if (loaded) saveBusinessData(contractKey, contracts).catch(console.error); }, [contracts, loaded]);
  useEffect(() => { if (loaded) saveBusinessData(rentPaymentKey, payments).catch(console.error); }, [loaded, payments]);
  useEffect(() => { if (loaded) saveBusinessData(depositKey, deposits).catch(console.error); }, [deposits, loaded]);
  useEffect(() => { if (loaded) saveBusinessData(expenseKey, expenses).catch(console.error); }, [expenses, loaded]);

  if (!property) {
    return (
      <AppLayout title="房源详情" description="未找到该房源。">
        <section className="card panel">房源不存在或已被删除。</section>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={property.name} description="集中管理这套房子的房间、租客、合同、收租、押金和支出。">
      <section className="grid metrics">
        <Summary label="城市" value={property.city || "-"} />
        <Summary label="地址" value={property.address || "-"} />
        <Summary label="房东" value={property.landlordName || "-"} />
        <Summary label="房间数量" value={`${scopedRooms.length} 间`} />
        <Summary label="当前租客数" value={`${currentTenantCount} 人`} />
        <Summary label="本月收入" value={`€${monthlyIncome}`} />
        <Summary label="是否有欠费" value={hasOverdue ? "有欠费" : "无欠费"} tone={hasOverdue ? "red" : "green"} />
      </section>

      <div className="tabs">
        {tabs.map((item) => (
          <button className={`tab-button ${tab === item.id ? "active" : ""}`} key={item.id} onClick={() => setTab(item.id)} type="button">
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <section className="card panel">
          <h2 className="panel-title">概览</h2>
          <div className="list" style={{ marginTop: 14 }}>
            <div className="list-item"><span>房间</span><strong>{scopedRooms.length} 间</strong></div>
            <div className="list-item"><span>在租租客</span><strong>{currentTenantCount} 人</strong></div>
            <div className="list-item"><span>合同</span><strong>{scopedContracts.length} 份</strong></div>
            <div className="list-item"><span>本月收款</span><strong>€{monthlyIncome}</strong></div>
          </div>
        </section>
      ) : null}

      {tab === "rooms" ? (
        <ScopedTable title="房间" action="新增房间" onAdd={() => { setRoomForm(emptyRoom(propertyId)); setEditor("room"); }}>
          <thead><tr><th>房间</th><th>编号</th><th>月租</th><th>押金</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
          <tbody>{scopedRooms.map((room) => <tr key={room.id}><td>{room.name}</td><td>{room.roomNumber}</td><td>€{room.monthlyRent}</td><td>€{room.depositAmount}</td><td><StatusBadge tone={room.status === "已租" ? "green" : room.status === "空置" ? "blue" : "amber"}>{room.status}</StatusBadge></td><td title={room.notes || ""}>{noteSummary(room.notes)}</td><td><RowActions onEdit={() => { setRoomForm(room); setEditor("room"); }} onDelete={() => remove<BusinessRoom>(room.id, setRooms)} /></td></tr>)}</tbody>
        </ScopedTable>
      ) : null}

      {tab === "tenants" ? (
        <ScopedTable title="租客" action="新增租客" onAdd={() => { setTenantForm(emptyTenant(propertyId)); setEditor("tenant"); }}>
          <thead><tr><th>姓名</th><th>电话</th><th>微信</th><th>房间</th><th>月租</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
          <tbody>{scopedTenants.map((tenant) => <tr key={tenant.id}><td>{tenant.name}</td><td>{tenant.phone}</td><td>{tenant.wechat || "-"}</td><td>{scopedRooms.find((room) => room.id === tenant.roomId)?.name || "-"}</td><td>€{tenant.monthlyRent}</td><td><StatusBadge tone={tenant.status === "在租" ? "green" : "amber"}>{tenant.status}</StatusBadge></td><td title={tenant.notes || ""}>{noteSummary(tenant.notes)}</td><td><RowActions onEdit={() => { setTenantForm(tenant); setEditor("tenant"); }} onDelete={() => remove<BusinessTenant>(tenant.id, setTenants)} /></td></tr>)}</tbody>
        </ScopedTable>
      ) : null}

      {tab === "contracts" ? (
        <ScopedTable title="合同" action="新增合同" onAdd={() => { setContractForm(emptyContract(propertyId)); setEditor("contract"); }}>
          <thead><tr><th>房间</th><th>租客</th><th>开始</th><th>结束</th><th>月租</th><th>押金</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
          <tbody>{scopedContracts.map((contract) => <tr key={contract.id}><td>{scopedRooms.find((room) => room.id === contract.roomId)?.name || "-"}</td><td>{scopedTenants.find((tenant) => tenant.id === contract.tenantId)?.name || "-"}</td><td>{contract.startDate}</td><td>{contract.endDate}</td><td>€{contract.monthlyRent}</td><td>€{contract.depositAmount}</td><td><StatusBadge tone={contract.status === "有效" ? "green" : contract.status === "即将到期" ? "amber" : "red"}>{contract.status}</StatusBadge></td><td title={contract.notes || ""}>{noteSummary(contract.notes)}</td><td><RowActions onEdit={() => { setContractForm(contract); setEditor("contract"); }} onDelete={() => remove<BusinessContract>(contract.id, setContracts)} /></td></tr>)}</tbody>
        </ScopedTable>
      ) : null}

      {tab === "payments" ? (
        <ScopedTable title="收租" action="登记收款" onAdd={() => { setPaymentForm(emptyPayment(propertyId)); setEditor("payment"); }}>
          <thead><tr><th>月份</th><th>房间</th><th>租客</th><th>应收</th><th>已收</th><th>未收</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
          <tbody>{scopedPayments.map((payment) => <tr key={payment.id}><td>{payment.rentMonth}</td><td>{scopedRooms.find((room) => room.id === payment.roomId)?.name || "-"}</td><td>{scopedTenants.find((tenant) => tenant.id === payment.tenantId)?.name || "-"}</td><td>€{payment.amountDue}</td><td>€{payment.amountPaid}</td><td>€{payment.amountUnpaid}</td><td><StatusBadge tone={payment.isOverdue ? "red" : "green"}>{payment.isOverdue ? "欠费" : "已结清"}</StatusBadge></td><td title={payment.notes || ""}>{noteSummary(payment.notes)}</td><td><RowActions onEdit={() => { setPaymentForm(payment); setEditor("payment"); }} onDelete={() => remove<BusinessRentPayment>(payment.id, setPayments)} /></td></tr>)}</tbody>
        </ScopedTable>
      ) : null}

      {tab === "deposits" ? (
        <ScopedTable title="押金" action="新增押金记录" onAdd={() => { setDepositForm(emptyDeposit(propertyId)); setEditor("deposit"); }}>
          <thead><tr><th>日期</th><th>房间</th><th>租客</th><th>类型</th><th>金额</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
          <tbody>{scopedDeposits.map((deposit) => <tr key={deposit.id}><td>{deposit.transactionDate}</td><td>{scopedRooms.find((room) => room.id === deposit.roomId)?.name || "-"}</td><td>{scopedTenants.find((tenant) => tenant.id === deposit.tenantId)?.name || "-"}</td><td>{deposit.type}</td><td>€{deposit.amount}</td><td><StatusBadge tone={deposit.status === "已收" ? "green" : deposit.status === "待退" ? "amber" : "blue"}>{deposit.status}</StatusBadge></td><td title={deposit.notes || ""}>{noteSummary(deposit.notes)}</td><td><RowActions onEdit={() => { setDepositForm(deposit); setEditor("deposit"); }} onDelete={() => remove<BusinessDeposit>(deposit.id, setDeposits)} /></td></tr>)}</tbody>
        </ScopedTable>
      ) : null}

      {tab === "expenses" ? (
        <ScopedTable title="支出" action="新增支出" onAdd={() => { setExpenseForm(emptyExpense(propertyId)); setEditor("expense"); }}>
          <thead><tr><th>月份</th><th>类别</th><th>金额</th><th>付款日期</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
          <tbody>{scopedExpenses.map((expense) => <tr key={expense.id}><td>{expense.expenseMonth}</td><td>{expense.category}</td><td>€{expense.amount}</td><td>{expense.paymentDate || "-"}</td><td><StatusBadge tone={expense.isPaid ? "green" : "red"}>{expense.isPaid ? "已支付" : "未支付"}</StatusBadge></td><td title={expense.notes || ""}>{noteSummary(expense.notes)}</td><td><RowActions onEdit={() => { setExpenseForm(expense); setEditor("expense"); }} onDelete={() => remove<BusinessExpense>(expense.id, setExpenses)} /></td></tr>)}</tbody>
        </ScopedTable>
      ) : null}

      {tab === "notes" ? (
        <section className="card panel">
          <h2 className="panel-title">房源备注</h2>
          <textarea className="notes-editor" value={property.notes || ""} onChange={(event) => savePropertyNotes(event.target.value)} placeholder="记录这套房子的特殊情况、房东沟通、维修注意事项等。" />
        </section>
      ) : null}

      {editor ? (
        <PropertyEditor
          editor={editor}
          roomForm={roomForm}
          setRoomForm={setRoomForm}
          tenantForm={tenantForm}
          setTenantForm={setTenantForm}
          contractForm={contractForm}
          setContractForm={setContractForm}
          paymentForm={paymentForm}
          setPaymentForm={setPaymentForm}
          depositForm={depositForm}
          setDepositForm={setDepositForm}
          expenseForm={expenseForm}
          setExpenseForm={setExpenseForm}
          rooms={scopedRooms}
          tenants={scopedTenants}
          onClose={closeEditor}
          onSave={() => {
            if (editor === "room") upsert(roomForm, setRooms);
            if (editor === "tenant") upsert(tenantForm, setTenants);
            if (editor === "contract") upsert(contractForm, setContracts);
            if (editor === "payment") upsert(paymentForm, setPayments);
            if (editor === "deposit") upsert(depositForm, setDeposits);
            if (editor === "expense") upsert(expenseForm, setExpenses);
            closeEditor();
          }}
        />
      ) : null}
    </AppLayout>
  );
}

function PropertyEditor(props: any) {
  const activeRoomId =
    props.editor === "tenant"
      ? props.tenantForm.roomId
      : props.editor === "contract"
        ? props.contractForm.roomId
        : props.editor === "payment"
          ? props.paymentForm.roomId
          : props.editor === "deposit"
            ? props.depositForm.roomId
            : "";
  const tenantOptions = props.tenants
    .filter((tenant: BusinessTenant) => !activeRoomId || tenant.roomId === activeRoomId)
    .map((tenant: BusinessTenant) => ({ value: tenant.id, label: tenant.name, description: `${tenant.phone} · ${tenant.wechat || "无微信"}`, keywords: `${tenant.phone} ${tenant.wechat}` }));
  const roomOptions = props.rooms.map((room: BusinessRoom) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }));
  const editorTitles: Record<string, string> = { room: "房间", tenant: "租客", contract: "合同", payment: "收租", deposit: "押金", expense: "支出" };

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onSave();
  }

  return (
    <div className="modal-backdrop" onMouseDown={props.onClose}>
      <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h2 className="panel-title">编辑{editorTitles[props.editor]}</h2>
          <button className="btn" onClick={props.onClose} type="button"><X size={17} /> 关闭</button>
        </div>
        <form className="form-grid" onSubmit={save}>
          {props.editor === "room" ? <RoomFields form={props.roomForm} setForm={props.setRoomForm} /> : null}
          {props.editor === "tenant" ? <TenantFields form={props.tenantForm} setForm={props.setTenantForm} roomOptions={roomOptions} /> : null}
          {props.editor === "contract" ? <ContractFields form={props.contractForm} setForm={props.setContractForm} roomOptions={roomOptions} tenantOptions={tenantOptions} /> : null}
          {props.editor === "payment" ? <PaymentFields form={props.paymentForm} setForm={props.setPaymentForm} roomOptions={roomOptions} tenantOptions={tenantOptions} tenants={props.tenants} /> : null}
          {props.editor === "deposit" ? <DepositFields form={props.depositForm} setForm={props.setDepositForm} roomOptions={roomOptions} tenantOptions={tenantOptions} tenants={props.tenants} /> : null}
          {props.editor === "expense" ? <ExpenseFields form={props.expenseForm} setForm={props.setExpenseForm} /> : null}
          <div className="modal-actions"><button className="btn" onClick={props.onClose} type="button">取消</button><button className="btn primary" type="submit">保存</button></div>
        </form>
      </section>
    </div>
  );
}

function RoomFields({ form, setForm }: { form: BusinessRoom; setForm: (updater: (current: BusinessRoom) => BusinessRoom) => void }) {
  return <><Text label="房间名称" value={form.name} onChange={(name) => setForm((c) => ({ ...c, name }))} /><Text label="房间编号" value={form.roomNumber} onChange={(roomNumber) => setForm((c) => ({ ...c, roomNumber }))} /><NumberInput label="月租" value={form.monthlyRent} onChange={(monthlyRent) => setForm((c) => ({ ...c, monthlyRent }))} /><NumberInput label="押金" value={form.depositAmount} onChange={(depositAmount) => setForm((c) => ({ ...c, depositAmount }))} /><SearchableSelect label="状态" value={form.status} options={["空置", "已租", "预订中", "即将退租", "维修中", "暂停出租"].map((v) => ({ value: v, label: v }))} onChange={(status) => setForm((c) => ({ ...c, status: status as BusinessRoom["status"] }))} /><Note value={form.notes} onChange={(notes) => setForm((c) => ({ ...c, notes }))} /></>;
}

function TenantFields({ form, setForm, roomOptions }: any) {
  return <><SearchableSelect label="房间" value={form.roomId} options={roomOptions} onChange={(roomId) => setForm((c: BusinessTenant) => ({ ...c, roomId }))} /><Text label="姓名" value={form.name} onChange={(name) => setForm((c: BusinessTenant) => ({ ...c, name }))} /><Text label="电话" value={form.phone} onChange={(phone) => setForm((c: BusinessTenant) => ({ ...c, phone }))} /><Text label="微信" value={form.wechat} onChange={(wechat) => setForm((c: BusinessTenant) => ({ ...c, wechat }))} /><SearchableSelect label="状态" value={form.status} options={["在租", "预定入住", "已退房"].map((v) => ({ value: v, label: v }))} onChange={(status) => setForm((c: BusinessTenant) => ({ ...c, status: status as BusinessTenant["status"] }))} /><NumberInput label="月租" value={form.monthlyRent} onChange={(monthlyRent) => setForm((c: BusinessTenant) => ({ ...c, monthlyRent }))} /><NumberInput label="押金" value={form.depositAmount} onChange={(depositAmount) => setForm((c: BusinessTenant) => ({ ...c, depositAmount }))} /><Note value={form.notes} onChange={(notes) => setForm((c: BusinessTenant) => ({ ...c, notes }))} /></>;
}

function ContractFields({ form, setForm, roomOptions, tenantOptions }: any) {
  return <><SearchableSelect label="房间" value={form.roomId} options={roomOptions} onChange={(roomId) => setForm((c: BusinessContract) => ({ ...c, roomId, tenantId: "" }))} /><SearchableSelect label="租客" value={form.tenantId} options={tenantOptions} onChange={(tenantId) => setForm((c: BusinessContract) => ({ ...c, tenantId }))} /><Text label="开始日期" type="date" value={form.startDate} onChange={(startDate) => setForm((c: BusinessContract) => ({ ...c, startDate }))} /><Text label="结束日期" type="date" value={form.endDate} onChange={(endDate) => setForm((c: BusinessContract) => ({ ...c, endDate }))} /><NumberInput label="月租" value={form.monthlyRent} onChange={(monthlyRent) => setForm((c: BusinessContract) => ({ ...c, monthlyRent }))} /><NumberInput label="押金" value={form.depositAmount} onChange={(depositAmount) => setForm((c: BusinessContract) => ({ ...c, depositAmount }))} /><SearchableSelect label="状态" value={form.status} options={["有效", "即将到期", "已结束"].map((v) => ({ value: v, label: v }))} onChange={(status) => setForm((c: BusinessContract) => ({ ...c, status: status as BusinessContract["status"] }))} /><Note value={form.notes} onChange={(notes) => setForm((c: BusinessContract) => ({ ...c, notes }))} /></>;
}

function PaymentFields({ form, setForm, roomOptions, tenantOptions, tenants }: any) {
  function updateMoney(patch: Partial<BusinessRentPayment>) {
    setForm((current: BusinessRentPayment) => {
      const next = { ...current, ...patch };
      const amountUnpaid = Math.max(Number(next.amountDue || 0) - Number(next.amountPaid || 0), 0);
      return { ...next, amountUnpaid, isOverdue: amountUnpaid > 0 };
    });
  }
  return <><SearchableSelect label="房间" value={form.roomId} options={roomOptions} onChange={(roomId) => setForm((c: BusinessRentPayment) => ({ ...c, roomId, tenantId: "" }))} /><SearchableSelect label="租客" value={form.tenantId} options={tenantOptions} onChange={(tenantId) => { const tenant = tenants.find((t: BusinessTenant) => t.id === tenantId); updateMoney({ tenantId, amountDue: tenant?.monthlyRent || form.amountDue, amountPaid: 0 }); }} /><Text label="月份" value={form.rentMonth} onChange={(rentMonth) => setForm((c: BusinessRentPayment) => ({ ...c, rentMonth }))} /><NumberInput label="应收金额" value={form.amountDue} onChange={(amountDue) => updateMoney({ amountDue })} /><NumberInput label="已收金额" value={form.amountPaid} onChange={(amountPaid) => updateMoney({ amountPaid })} /><Text label="未收金额" value={String(form.amountUnpaid)} readOnly onChange={() => {}} /><SearchableSelect label="付款方式" value={form.paymentMethod} options={["现金", "转账", "Bizum", "其他"].map((v) => ({ value: v, label: v }))} onChange={(paymentMethod) => setForm((c: BusinessRentPayment) => ({ ...c, paymentMethod: paymentMethod as BusinessRentPayment["paymentMethod"] }))} /><Note value={form.notes} onChange={(notes) => setForm((c: BusinessRentPayment) => ({ ...c, notes }))} /></>;
}

function DepositFields({ form, setForm, roomOptions, tenantOptions, tenants }: any) {
  return <><SearchableSelect label="房间" value={form.roomId} options={roomOptions} onChange={(roomId) => setForm((c: BusinessDeposit) => ({ ...c, roomId, tenantId: "" }))} /><SearchableSelect label="租客" value={form.tenantId} options={tenantOptions} onChange={(tenantId) => { const tenant = tenants.find((t: BusinessTenant) => t.id === tenantId); setForm((c: BusinessDeposit) => ({ ...c, tenantId, amount: tenant?.depositAmount || c.amount })); }} /><SearchableSelect label="类型" value={form.type} options={["收取", "退还", "扣除"].map((v) => ({ value: v, label: v }))} onChange={(type) => setForm((c: BusinessDeposit) => ({ ...c, type: type as BusinessDeposit["type"] }))} /><NumberInput label="金额" value={form.amount} onChange={(amount) => setForm((c: BusinessDeposit) => ({ ...c, amount }))} /><SearchableSelect label="状态" value={form.status} options={["已收", "待退", "已退", "部分扣除"].map((v) => ({ value: v, label: v }))} onChange={(status) => setForm((c: BusinessDeposit) => ({ ...c, status: status as BusinessDeposit["status"] }))} /><Text label="日期" type="date" value={form.transactionDate} onChange={(transactionDate) => setForm((c: BusinessDeposit) => ({ ...c, transactionDate }))} /><Note value={form.notes} onChange={(notes) => setForm((c: BusinessDeposit) => ({ ...c, notes }))} /></>;
}

function ExpenseFields({ form, setForm }: any) {
  return <><Text label="月份" value={form.expenseMonth} onChange={(expenseMonth) => setForm((c: BusinessExpense) => ({ ...c, expenseMonth }))} /><SearchableSelect label="类别" value={form.category} options={["房东租金", "维修", "清洁", "家具", "日用品", "税费", "杂费", "其他"].map((v) => ({ value: v, label: v }))} onChange={(category) => setForm((c: BusinessExpense) => ({ ...c, category }))} /><NumberInput label="金额" value={form.amount} onChange={(amount) => setForm((c: BusinessExpense) => ({ ...c, amount }))} /><Text label="付款日期" type="date" value={form.paymentDate} onChange={(paymentDate) => setForm((c: BusinessExpense) => ({ ...c, paymentDate }))} /><SearchableSelect label="状态" value={form.isPaid ? "已支付" : "未支付"} options={["已支付", "未支付"].map((v) => ({ value: v, label: v }))} onChange={(status) => setForm((c: BusinessExpense) => ({ ...c, isPaid: status === "已支付" }))} /><Note value={form.notes} onChange={(notes) => setForm((c: BusinessExpense) => ({ ...c, notes }))} /></>;
}

function ScopedTable({ title, action, onAdd, children }: { title: string; action: string; onAdd: () => void; children: React.ReactNode }) {
  return <section className="card panel"><div className="panel-header"><h2 className="panel-title">{title}</h2><button className="btn primary" onClick={onAdd} type="button"><Plus size={17} /> {action}</button></div><div className="table-wrap"><table>{children}</table></div></section>;
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return <div className="top-actions"><button className="btn" onClick={onEdit} type="button"><Edit3 size={15} /> 编辑</button><button className="btn danger" onClick={onDelete} type="button"><Trash2 size={15} /> 删除</button></div>;
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <section className="card metric-card"><div className="metric-label">{label}</div><div className={`metric-value ${tone === "red" ? "danger-text" : tone === "green" ? "profit" : ""}`}>{value}</div></section>;
}

function Text({ label, value, onChange, type = "text", readOnly }: { label: string; value: string; onChange: (value: string) => void; type?: string; readOnly?: boolean }) {
  return <div className="field"><label>{label}</label><input readOnly={readOnly} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <MoneyInput label={label} value={value} onChange={onChange} />;
}

function Note({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  return <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={value || ""} onChange={(event) => onChange(event.target.value)} /></div>;
}

function upsert<T extends { id: string }>(record: T, setter: (updater: (current: T[]) => T[]) => void) {
  setter((current) => record.id ? current.map((item) => item.id === record.id ? record : item) : [{ ...record, id: crypto.randomUUID() }, ...current]);
}

function emptyRoom(propertyId: string): BusinessRoom { return { id: "", propertyId, name: "", roomNumber: "", monthlyRent: 0, depositAmount: 0, status: "空置", notes: "" }; }
function emptyTenant(propertyId: string): BusinessTenant { return { id: "", propertyId, roomId: "", name: "", phone: "", wechat: "", source: "其他", monthlyRent: 0, depositAmount: 0, status: "在租", notes: "" }; }
function emptyContract(propertyId: string): BusinessContract { return { id: "", propertyId, roomId: "", tenantId: "", startDate: "", endDate: "", monthlyRent: 0, depositAmount: 0, status: "有效", notes: "" }; }
function emptyPayment(propertyId: string): BusinessRentPayment { return { id: "", propertyId, roomId: "", tenantId: "", rentMonth: "2026-06", amountDue: 0, amountPaid: 0, amountUnpaid: 0, paymentMethod: "转账", isOverdue: false, notes: "" }; }
function emptyDeposit(propertyId: string): BusinessDeposit { return { id: "", propertyId, roomId: "", tenantId: "", type: "收取", amount: 0, status: "已收", transactionDate: "", notes: "" }; }
function emptyExpense(propertyId: string): BusinessExpense { return { id: "", propertyId, expenseMonth: "2026-06", category: "房东租金", amount: 0, paymentDate: "", isPaid: true, notes: "" }; }
