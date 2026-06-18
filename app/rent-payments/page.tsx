"use client";

import { AppLayout } from "@/components/app-layout";
import { MoneyInput } from "@/components/money-input";
import { OwnershipField } from "@/components/ownership-field";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessProperty,
  BusinessDeposit,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  depositKey,
  getInitialDeposits,
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
import { euro } from "@/lib/format";
import { partnerClass, partnerLabel } from "@/lib/partner-settings";
import {
  deleteRentPaymentFile,
  downloadRentPaymentFile,
  formatFileSize,
  loadRentPaymentFiles,
  openRentPaymentFile,
  RentPaymentFile,
  uploadRentPaymentFile
} from "@/lib/rent-payment-files";
import { isCoverageExpired, latestCoverageForTenant, monthEnd, monthStart, paymentCoverageEnd, paymentCoverageStart, todayString } from "@/lib/rent-coverage";
import { Ban, Download, Edit3, Eye, FileUp, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const emptyPayment: BusinessRentPayment = {
  id: "",
  propertyId: "",
  roomId: "",
  tenantId: "",
  incomeType: "房租收入",
  incomeItem: "",
  rentMonth: new Date().toISOString().slice(0, 7),
  paymentDate: new Date().toISOString().slice(0, 10),
  amountDue: 0,
  amountPaid: 0,
  amountUnpaid: 0,
  coverageStartDate: monthStart(new Date().toISOString().slice(0, 7)),
  coverageEndDate: monthEnd(new Date().toISOString().slice(0, 7)),
  paymentMethod: "转账",
  receivedBy: "A",
  paymentStatus: "已收",
  isOverdue: false,
  notes: ""
};

const paymentMethods = ["现金", "转账", "Bizum", "其他"];
const paymentStatusOptions = ["已收", "未收"];
const incomeTypes: NonNullable<BusinessRentPayment["incomeType"]>[] = ["房租收入", "押金收入", "赔偿收入", "其他收入"];
const maxAttachmentSize = 5 * 1024 * 1024;

export default function RentPaymentsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [depositAmount, setDepositAmount] = useState(0);
  const [files, setFiles] = useState<RentPaymentFile[]>([]);
  const [form, setForm] = useState<BusinessRentPayment>(emptyPayment);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [detailPaymentId, setDetailPaymentId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [customReceivedBy, setCustomReceivedBy] = useState("");
  const [ownershipMode, setOwnershipMode] = useState<"A" | "B" | "自定义">("A");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMonthFilter(params.get("month") || "");
    setOverdueOnly(params.get("overdue") === "1");
  }, []);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms));
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(loadedProperties, loadedRooms, loadedTenants));
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits());
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setPayments(loadedPayments);
      setDeposits(loadedDeposits);
      try {
        setFiles(await loadRentPaymentFiles(loadedPayments.map((payment) => payment.id)));
        setStorageWarning("");
      } catch {
        setFiles([]);
        setStorageWarning("收款附件功能未初始化，请先执行 rent-payment-files SQL。普通收款记录仍可保存。");
      }
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载收租记录失败：${error.message || error}`));
  }, []);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const availableTenants = tenants.filter((tenant) => tenant.propertyId === form.propertyId && tenant.roomId === form.roomId);
  const filesByPayment = useMemo(() => files.reduce<Record<string, RentPaymentFile[]>>((map, file) => {
    map[file.rentPaymentId] = [...(map[file.rentPaymentId] || []), file];
    return map;
  }, {}), [files]);
  const filteredPayments = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return payments.filter((payment) => {
      const property = properties.find((item) => item.id === payment.propertyId);
      const room = rooms.find((item) => item.id === payment.roomId);
      const tenant = tenants.find((item) => item.id === payment.tenantId);
      const text = `${property?.name || ""} ${room?.name || ""} ${tenant?.name || ""} ${tenant?.phone || ""} ${tenant?.wechat || ""} ${payment.incomeType || "房租收入"} ${payment.incomeItem || ""} ${payment.rentMonth} ${payment.notes || ""}`.toLowerCase();
      return (!keyword || text.includes(keyword)) &&
        (!monthFilter || payment.rentMonth.includes(monthFilter)) &&
        (!overdueOnly || isLatestExpiredPayment(payment, payments));
    });
  }, [monthFilter, overdueOnly, payments, properties, query, rooms, tenants]);
  const visiblePayments = pageRows(filteredPayments, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyPayment);
    setDepositAmount(0);
    setCustomReceivedBy("");
    setOwnershipMode("A");
    setPendingFile(null);
  }

  async function persist(next: BusinessRentPayment[]) {
    setSaving(true);
    try {
      await saveBusinessData(rentPaymentKey, next);
      setPayments(next);
    } catch (error: any) {
      window.alert(error.message || "保存收租记录失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  function updateMoney(patch: Partial<BusinessRentPayment>) {
    setForm((current) => {
      const next = { ...current, ...patch };
      const amountUnpaid = Math.max(Number(next.amountDue || 0) - Number(next.amountPaid || 0), 0);
      return { ...next, amountUnpaid, isOverdue: isCoverageExpired(next) };
    });
  }

  function chooseTenant(tenantId: string) {
    const tenant = tenants.find((item) => item.id === tenantId);
    const latest = latestCoverageForTenant(tenantId, payments);
    const nextStart = latest?.coverageEndDate ? addOneDay(latest.coverageEndDate) : todayString();
    updateMoney({
      tenantId,
      amountDue: tenant?.monthlyRent || 0,
      coverageStartDate: nextStart,
      coverageEndDate: ""
    });
  }

  function autoFill() {
    const tenant = tenants.find((item) => item.id === form.tenantId);
    if (!tenant) return;
    const latest = latestCoverageForTenant(tenant.id, payments.filter((payment) => payment.id !== form.id));
    setForm((current) => ({
      ...current,
      amountDue: tenant.monthlyRent || 0,
      paymentDate: current.paymentDate || todayString(),
      rentMonth: (current.paymentDate || todayString()).slice(0, 7),
      coverageStartDate: latest?.coverageEndDate ? addOneDay(latest.coverageEndDate) : todayString(),
      paymentMethod: current.paymentMethod || "转账"
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded) return;
    if (ownershipMode === "自定义" && !customReceivedBy.trim()) {
      window.alert("请填写自定义归属名称。");
      return;
    }
    const incomeType = form.incomeType || "房租收入";
    const isRent = incomeType === "房租收入";
    const requiresBusinessLink = isRent || incomeType === "押金收入";
    if (requiresBusinessLink && (!form.propertyId || !form.roomId || !form.tenantId)) {
      window.alert(incomeType === "押金收入" ? "押金收入需要选择房源、房间和租客。" : "房租收入需要选择房源、房间和租客。");
      return;
    }
    if (isRent && (!form.coverageStartDate || !form.coverageEndDate)) {
      window.alert("请填写租金覆盖开始日期和结束日期。");
      return;
    }
    if ((incomeType === "赔偿收入" || incomeType === "其他收入") && !form.incomeItem?.trim()) {
      window.alert(incomeType === "赔偿收入" ? "请填写赔偿项目或说明。" : "请填写收入项目或说明。");
      return;
    }
    setSaving(true);
    const paymentId = form.id || crypto.randomUUID();
    const amountDue = isRent ? Number(form.amountDue || 0) : 0;
    const amountPaid = form.paymentStatus === "未收" ? 0 : Number(form.amountPaid || 0);
    const amountUnpaid = isRent ? Math.max(amountDue - amountPaid, 0) : 0;
    const paymentDate = form.paymentDate || todayString();
    const rentMonth = paymentDate.slice(0, 7);
    const nextPayment = {
      ...form,
      id: paymentId,
      paymentDate,
      rentMonth,
      incomeType,
      incomeItem: isRent || incomeType === "押金收入" ? "" : form.incomeItem?.trim() || "",
      amountDue,
      amountPaid,
      amountUnpaid,
      coverageStartDate: isRent ? form.coverageStartDate : "",
      coverageEndDate: isRent ? form.coverageEndDate : "",
      receivedBy: ownershipMode === "自定义" ? customReceivedBy.trim() : ownershipMode,
      paymentStatus: isRent ? form.paymentStatus || (amountPaid > 0 ? "已收" : "未收") : "已收",
      isOverdue: false
    };
    nextPayment.isOverdue = isCoverageExpired(nextPayment);
    const next = form.id
      ? payments.map((payment) => (payment.id === form.id ? nextPayment : payment))
      : [nextPayment, ...payments];
    try {
      await saveBusinessData(rentPaymentKey, next);
      const marker = depositPaymentMarker(paymentId);
      const existingDeposit = deposits.find((deposit) => deposit.notes?.includes(marker));
      const depositIncomeAmount = incomeType === "押金收入" ? amountPaid : isRent ? depositAmount : 0;
      const nextDeposits = depositIncomeAmount > 0
        ? existingDeposit
          ? deposits.map((deposit) => deposit.id === existingDeposit.id ? {
              ...deposit,
              propertyId: form.propertyId,
              roomId: form.roomId,
              tenantId: form.tenantId,
              amount: depositIncomeAmount,
              transactionDate: paymentDate,
              receivedBy: nextPayment.receivedBy || "A"
            } : deposit)
          : [{
              id: crypto.randomUUID(),
              propertyId: form.propertyId,
              roomId: form.roomId,
              tenantId: form.tenantId,
              type: "收取",
              amount: depositIncomeAmount,
              status: "已收",
              transactionDate: paymentDate,
              receivedBy: nextPayment.receivedBy || "A",
              paidBy: "A",
              notes: marker
            }, ...deposits]
        : existingDeposit ? deposits.filter((deposit) => deposit.id !== existingDeposit.id) : deposits;
      if (nextDeposits !== deposits) {
        await saveBusinessData(depositKey, nextDeposits);
        setDeposits(nextDeposits);
      }
      if (pendingFile) {
        try {
          if (form.id) {
            const existing = filesByPayment[paymentId] || [];
            for (const file of existing) await deleteRentPaymentFile(file);
            setFiles((current) => current.filter((file) => file.rentPaymentId !== paymentId));
          }
          const uploaded = await uploadRentPaymentFile(paymentId, pendingFile);
          setFiles((current) => [uploaded, ...current]);
          setStorageWarning("");
        } catch (error: any) {
          setStorageWarning("收款附件功能未初始化，请先执行 rent-payment-files SQL。普通收款记录已保存。");
          window.alert(error.message || "收款已保存，但附件上传失败。请执行 rent-payment-files SQL 后再上传附件。");
        }
      }
      setPayments(next);
      close();
    } catch (error: any) {
      window.alert(error.message || "保存收租记录失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function voidPayment(payment: BusinessRentPayment) {
    if (!window.confirm("确认作废这条收租记录吗？作废后金额会变为 0，但历史记录仍保留。")) return;
    await persist(payments.map((item) => (item.id === payment.id ? { ...item, amountDue: 0, amountPaid: 0, amountUnpaid: 0, isOverdue: false, notes: markVoided(item.notes) } : item)));
  }

  async function permanentlyDelete(payment: BusinessRentPayment) {
    if (!window.confirm("确定要永久删除这条收租记录吗？\n真实发生过的财务记录建议使用“作废”，删除后不可恢复。")) return;
    const relatedFiles = filesByPayment[payment.id] || [];
    for (const file of relatedFiles) await deleteRentPaymentFile(file);
    await persist(payments.filter((item) => item.id !== payment.id));
    setFiles((current) => current.filter((file) => file.rentPaymentId !== payment.id));
    setDetailPaymentId("");
  }

  function chooseFile(file?: File) {
    if (!file) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      window.alert("只支持 PDF、JPG、PNG 文件。");
      return;
    }
    if (file.size > maxAttachmentSize) {
      window.alert("收款附件不能超过 5MB。");
      return;
    }
    setPendingFile(file);
  }

  async function removeFile(file: RentPaymentFile) {
    if (!window.confirm("确定要删除这个收款附件吗？")) return;
    await deleteRentPaymentFile(file);
    setFiles((current) => current.filter((item) => item.id !== file.id));
  }

  function resetFilters() {
    setQuery("");
    setMonthFilter("");
    setOverdueOnly(false);
    setPage(1);
  }

  return (
    <AppLayout title="收款管理" description="登记房租、押金、赔偿和其他收入，点击一条记录查看完整信息。">
      <section className="card panel">
        <div className="panel-header">
          <div><h2 className="panel-title">收款记录</h2><p className="muted">默认显示日期、归属、项目、金额和状态。</p></div>
          <button className="btn primary" disabled={!loaded || saving} onClick={() => { setForm({ ...emptyPayment, paymentDate: todayString(), rentMonth: todayString().slice(0, 7), coverageStartDate: todayString(), coverageEndDate: "" }); setDepositAmount(0); setCustomReceivedBy(""); setOwnershipMode("A"); setOpen(true); }} type="button"><Plus size={17} /> 登记收款</button>
        </div>
        {storageWarning ? <div className="notice warning">{storageWarning}</div> : null}
        <div className="list-controls">
          <label className="search-box"><input placeholder="搜索房源、房间、租客、电话、微信、月份" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label className="search-box"><input placeholder="筛选月份，例如 2026-06" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label>
          <button className={`btn ${overdueOnly ? "primary" : ""}`} onClick={() => setOverdueOnly((current) => !current)} type="button">只看欠费</button>
          {(query || monthFilter || overdueOnly) ? <button className="btn" onClick={resetFilters} type="button">清除筛选</button> : null}
        </div>

        <div className="finance-list">
          {visiblePayments.map((payment) => {
            const property = properties.find((item) => item.id === payment.propertyId);
            const room = rooms.find((item) => item.id === payment.roomId);
            const tenant = tenants.find((item) => item.id === payment.tenantId);
            const linkedDeposit = deposits.find((deposit) => deposit.notes?.includes(depositPaymentMarker(payment.id)));
            const expanded = detailPaymentId === payment.id;
            return (
              <article className="finance-list-item" key={payment.id}>
                <button className="finance-line rent-finance-line" onClick={() => setDetailPaymentId(expanded ? "" : payment.id)} type="button">
                  <span>{isRentPayment(payment) ? paymentCoverageEnd(payment) || payment.rentMonth : payment.paymentDate || payment.rentMonth}</span>
                  <span className={`partner-tag ${partnerClass(payment.receivedBy)}`}>{partnerLabel(payment.receivedBy)}</span>
                  <span>{paymentItemLabel(payment, room?.name || "-", Boolean(linkedDeposit?.amount))}</span>
                  <strong>{euro(payment.amountPaid)}</strong>
                  <StatusBadge tone={isVoided(payment.notes) ? "red" : isLatestExpiredPayment(payment, payments) ? "red" : "green"}>{isVoided(payment.notes) ? "已作废" : isRentPayment(payment) ? isLatestExpiredPayment(payment, payments) ? "已过期" : "已覆盖" : "已收"}</StatusBadge>
                </button>
                {expanded ? (
                  <PaymentDetail
                    payment={payment}
                    propertyName={property?.name || "-"}
                    roomName={room?.name || "-"}
                    tenantName={tenant?.name || "-"}
                    depositAmount={deposits.find((deposit) => deposit.notes?.includes(depositPaymentMarker(payment.id)))?.amount || 0}
                    files={filesByPayment[payment.id] || []}
                    onEdit={() => { const mode = ownershipChoice(payment.receivedBy); setForm(payment); setOwnershipMode(mode); setCustomReceivedBy(mode === "自定义" ? customOwnershipName(payment.receivedBy) : ""); setDepositAmount(deposits.find((deposit) => deposit.notes?.includes(depositPaymentMarker(payment.id)))?.amount || 0); setOpen(true); }}
                    onVoid={() => voidPayment(payment)}
                    onDelete={() => permanentlyDelete(payment)}
                    onFileDelete={removeFile}
                    saving={saving}
                  />
                ) : null}
              </article>
            );
          })}
          {!visiblePayments.length ? <p className="muted">暂无收租记录。</p> : null}
        </div>

        <PaginationControls page={page} pageSize={pageSize} total={filteredPayments.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑收款" : "登记收款"}</h2><button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button></div>
            <form className="form-grid" onSubmit={submit}>
              <SearchableSelect label="收款类型" value={form.incomeType || "房租收入"} options={incomeTypes.map((type) => ({ value: type, label: type }))} onChange={(incomeType) => {
                const nextType = incomeType as BusinessRentPayment["incomeType"];
                setForm((current) => ({ ...current, incomeType: nextType, incomeItem: "", amountDue: nextType === "房租收入" ? current.amountDue : 0, amountUnpaid: 0, coverageStartDate: nextType === "房租收入" ? current.coverageStartDate : "", coverageEndDate: nextType === "房租收入" ? current.coverageEndDate : "", paymentStatus: "已收" }));
                if (nextType !== "房租收入") setDepositAmount(0);
              }} />
              <SearchableSelect label={isRentPayment(form) || form.incomeType === "押金收入" ? "房源" : "房源（可选）"} value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId, roomId: "", tenantId: "" }))} placeholder={isRentPayment(form) || form.incomeType === "押金收入" ? "搜索房源名称、地址、城市" : "可直接留空"} />
              <SearchableSelect label={isRentPayment(form) || form.incomeType === "押金收入" ? "房间" : "房间（可选）"} value={form.roomId} disabled={!form.propertyId} options={availableRooms.map((room) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }))} onChange={(roomId) => setForm((current) => ({ ...current, roomId, tenantId: "" }))} placeholder={form.propertyId ? "搜索房间名称、编号" : "可直接留空"} />
              <SearchableSelect label={isRentPayment(form) || form.incomeType === "押金收入" ? "租客" : "租客（可选）"} value={form.tenantId} disabled={!form.roomId} options={availableTenants.map((tenant) => ({ value: tenant.id, label: tenant.name, description: `${tenant.phone} · ${tenant.wechat || "无微信"}`, keywords: `${tenant.phone} ${tenant.wechat}` }))} onChange={chooseTenant} placeholder={form.roomId ? "搜索租客姓名、电话、微信" : "可直接留空"} />
              {isRentPayment(form) ? <div className="field auto-fill-field"><label>自动填充</label><button className="btn" disabled={!form.tenantId} onClick={autoFill} type="button">带出月租和未覆盖日期</button></div> : null}
              {isRentPayment(form) ? <MoneyInput label="月租金额（参考）" value={form.amountDue} onChange={(amountDue) => updateMoney({ amountDue })} /> : null}
              <MoneyInput label={isRentPayment(form) ? "实收金额" : "金额"} value={form.amountPaid} onChange={(amountPaid) => updateMoney({ amountPaid })} />
              {isRentPayment(form) ? <MoneyInput label="押金金额" value={depositAmount} onChange={setDepositAmount} /> : null}
              {form.incomeType === "赔偿收入" || form.incomeType === "其他收入" ? <div className="field"><label>{form.incomeType === "赔偿收入" ? "赔偿项目/说明" : "收入项目/说明"}</label><input maxLength={100} placeholder={form.incomeType === "赔偿收入" ? "例如：床架损坏赔偿" : "请输入收入项目"} required value={form.incomeItem || ""} onChange={(event) => setForm((current) => ({ ...current, incomeItem: event.target.value }))} /></div> : null}
              {isRentPayment(form) ? <div className="field"><label>租金覆盖开始日期</label><input required type="date" value={form.coverageStartDate || ""} onChange={(event) => setForm((current) => ({ ...current, coverageStartDate: event.target.value }))} /></div> : null}
              {isRentPayment(form) ? <div className="field"><label>租金覆盖结束日期</label><input required type="date" value={form.coverageEndDate || ""} onChange={(event) => setForm((current) => ({ ...current, coverageEndDate: event.target.value }))} /></div> : null}
              <SearchableSelect label="付款方式" value={form.paymentMethod} options={paymentMethods.map((method) => ({ value: method, label: method }))} onChange={(paymentMethod) => setForm((current) => ({ ...current, paymentMethod }))} />
              <OwnershipField mode={ownershipMode} customName={customReceivedBy} onModeChange={(mode) => {
                setOwnershipMode(mode);
                if (mode !== "自定义") setCustomReceivedBy("");
              }} onCustomNameChange={setCustomReceivedBy} />
              {isRentPayment(form) ? <SearchableSelect label="收款状态" value={form.paymentStatus || "已收"} options={paymentStatusOptions.map((status) => ({ value: status, label: status }))} onChange={(paymentStatus) => updateMoney({ paymentStatus, amountPaid: paymentStatus === "未收" ? 0 : form.amountPaid })} /> : null}
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>收款附件 PDF/JPG/PNG</label>
                <input accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" type="file" onChange={(event) => chooseFile(event.target.files?.[0])} />
                {pendingFile ? <div className="attachment-preview"><FileUp size={16} /><span>{pendingFile.name} · {formatFileSize(pendingFile.size)}</span><button className="btn danger" type="button" onClick={() => setPendingFile(null)}>移除</button></div> : <p className="muted">{form.id ? "选择新文件并保存后，会替换当前收款附件。" : "可上传付款截图、票据或 PDF，单个附件最大 5MB。"}</p>}
                {form.id && (filesByPayment[form.id] || []).length ? <RentPaymentAttachmentActions files={filesByPayment[form.id] || []} onDelete={removeFile} /> : null}
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={cleanVoidNote(form.notes)} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" disabled={saving} type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function PaymentDetail({
  payment,
  propertyName,
  roomName,
  tenantName,
  depositAmount,
  files,
  onEdit,
  onVoid,
  onDelete,
  onFileDelete,
  saving
}: {
  payment: BusinessRentPayment;
  propertyName: string;
  roomName: string;
  tenantName: string;
  depositAmount: number;
  files: RentPaymentFile[];
  onEdit: () => void;
  onVoid: () => void;
  onDelete: () => void;
  onFileDelete: (file: RentPaymentFile) => void;
  saving: boolean;
}) {
  return (
    <div className="record-detail-panel">
      <div className="detail-grid">
        <DetailField label="房源" value={propertyName} />
        <DetailField label="房间" value={roomName} />
        <DetailField label="租客" value={tenantName} />
        <DetailField label="收款类型" value={payment.incomeType || "房租收入"} />
        {payment.incomeItem ? <DetailField label="项目/说明" value={payment.incomeItem} /> : null}
        <DetailField label="收款日期" value={payment.paymentDate || "-"} />
        {isRentPayment(payment) ? <DetailField label="月租参考" value={euro(payment.amountDue)} /> : null}
        <DetailField label="实收金额" value={euro(payment.amountPaid)} />
        {isRentPayment(payment) && depositAmount > 0 ? <DetailField label="押金金额" value={euro(depositAmount)} /> : null}
        {isRentPayment(payment) ? <DetailField label="覆盖开始" value={paymentCoverageStart(payment) || "-"} /> : null}
        {isRentPayment(payment) ? <DetailField label="覆盖结束" value={paymentCoverageEnd(payment) || "-"} /> : null}
        {isRentPayment(payment) ? <DetailField label="收款状态" value={payment.paymentStatus || "-"} /> : null}
        <DetailField label="付款方式" value={payment.paymentMethod || "-"} />
        <DetailField label="收款归属" value={payment.receivedBy || "A"} />
        <DetailField label="备注" value={cleanVoidNote(payment.notes) || "-"} />
      </div>
      <div>
        <div className="detail-section-title">收款附件</div>
        <RentPaymentAttachmentActions files={files} onDelete={onFileDelete} />
      </div>
      <div className="top-actions detail-actions">
        <button className="btn" type="button" onClick={onEdit}><Edit3 size={15} /> 编辑/替换附件</button>
        <button className="btn" disabled={saving} type="button" onClick={onVoid}><Ban size={15} /> 作废</button>
        <button className="btn danger" type="button" onClick={onDelete}><Trash2 size={15} /> 永久删除</button>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="detail-field"><span>{label}</span><strong>{value}</strong></div>;
}

function RentPaymentAttachmentActions({ files, onDelete }: { files: RentPaymentFile[]; onDelete: (file: RentPaymentFile) => void }) {
  if (!files.length) return <span className="muted">暂无附件</span>;
  return (
    <div className="attachment-list">
      {files.map((file) => (
        <div className="attachment-preview" key={file.id}>
          <FileUp size={16} />
          <span>{file.fileName} · {formatFileSize(file.fileSize)}</span>
          <button className="btn" type="button" onClick={() => openRentPaymentFile(file)}><Eye size={15} /> 查看</button>
          <button className="btn" type="button" onClick={() => downloadRentPaymentFile(file)}><Download size={15} /> 下载</button>
          <button className="btn danger" type="button" onClick={() => onDelete(file)}><Trash2 size={15} /> 删除</button>
        </div>
      ))}
    </div>
  );
}

function markVoided(notes?: string) {
  const clean = cleanVoidNote(notes);
  return clean ? `[已作废] ${clean}` : "[已作废]";
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.includes("[宸蹭綔搴焆"));
}

function cleanVoidNote(notes?: string) {
  return (notes || "").replace("[已作废]", "").replace("[宸蹭綔搴焆", "").trim();
}

function isLatestExpiredPayment(payment: BusinessRentPayment, payments: BusinessRentPayment[]) {
  const latest = latestCoverageForTenant(payment.tenantId, payments);
  return latest?.id === payment.id && isCoverageExpired(latest);
}

function isRentPayment(payment: BusinessRentPayment) {
  return !payment.incomeType || payment.incomeType === "房租收入";
}

function paymentItemLabel(payment: BusinessRentPayment, roomName: string, hasLinkedDeposit: boolean) {
  if (isRentPayment(payment)) return `${roomName}房租${hasLinkedDeposit ? "+押金" : ""}`;
  if (payment.incomeType === "押金收入") return `${roomName}押金收入`;
  return payment.incomeItem || payment.incomeType || "其他收入";
}

function addOneDay(value: string) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function depositPaymentMarker(paymentId: string) {
  return `[收租押金:${paymentId}]`;
}

function ownershipChoice(value?: string) {
  const normalized = (value || "A").trim().toUpperCase();
  return normalized === "A" || normalized === "B" ? normalized : "自定义";
}

function customOwnershipName(value?: string) {
  const name = (value || "").trim();
  return name === "自定义" ? "" : name;
}
