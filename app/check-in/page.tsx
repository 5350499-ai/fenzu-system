"use client";

import { AppLayout } from "@/components/app-layout";
import { MoneyInput } from "@/components/money-input";
import { OwnershipField } from "@/components/ownership-field";
import { SearchableSelect } from "@/components/searchable-select";
import {
  BusinessContract,
  BusinessDeposit,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  contractKey,
  depositKey,
  getInitialContracts,
  getInitialDeposits,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  getInitialTenants,
  loadBusinessData,
  rentPaymentKey,
  roomKey,
  saveBusinessData,
  tenantKey
} from "@/lib/business-data";
import { formatFileSize, uploadContractFile } from "@/lib/contract-files";
import { uploadRentPaymentFile } from "@/lib/rent-payment-files";
import { isCoverageExpired, monthEnd, monthStart } from "@/lib/rent-coverage";
import { FileUp, Save } from "lucide-react";
import { useEffect, useState } from "react";

const maxAttachmentSize = 5 * 1024 * 1024;

export default function CheckInPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [saving, setSaving] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [paymentAttachment, setPaymentAttachment] = useState<File | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [ownershipMode, setOwnershipMode] = useState<"A" | "B" | "自定义">("A");
  const [customReceivedBy, setCustomReceivedBy] = useState("");
  const [form, setForm] = useState({
    propertyId: "",
    roomId: "",
    tenantName: "",
    phone: "",
    documentNumber: "",
    contractEndDate: "",
    monthlyRent: 0,
    amountPaid: 0,
    paymentDate: new Date().toISOString().slice(0, 10),
    coverageStartDate: new Date().toISOString().slice(0, 10),
    coverageEndDate: "",
    depositAmount: 0,
    paymentDay: 20,
    depositStatus: "已收",
    paymentStatus: "已收",
    paymentMethod: "转账",
    notes: ""
  });

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>("business-properties", getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms));
      const loadedContracts = await loadBusinessData<BusinessContract>(contractKey, getInitialContracts());
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments());
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits());
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setPayments(loadedPayments);
      setDeposits(loadedDeposits);
    }
    load().catch((error) => window.alert(`加载入住数据失败：${error.message || error}`));
  }, []);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId && room.status !== "已归档");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.propertyId || !form.roomId || !form.tenantName.trim()) {
      window.alert("请先选择房源、房间，并填写租客姓名。");
      return;
    }
    if (ownershipMode === "自定义" && !customReceivedBy.trim()) {
      window.alert("请填写自定义归属名称。");
      return;
    }
    setSaving(true);
    try {
      const tenantId = crypto.randomUUID();
      const contractId = crypto.randomUUID();
      const paymentId = crypto.randomUUID();
      const finalReceivedBy = ownershipMode === "自定义" ? customReceivedBy.trim() : ownershipMode;
      const nextTenant: BusinessTenant = {
        id: tenantId,
        propertyId: form.propertyId,
        roomId: form.roomId,
        name: form.tenantName.trim(),
        phone: form.phone,
        wechat: "",
        source: "其他",
        monthlyRent: form.monthlyRent,
        depositAmount: form.depositAmount,
        paymentDay: form.paymentDay,
        status: "在租",
        notes: [form.documentNumber ? `证件号：${form.documentNumber}` : "", form.notes].filter(Boolean).join("\n")
      };
      const nextTenants = [nextTenant, ...tenants];
      const nextRooms = rooms.map((room) => {
        if (room.id !== form.roomId) return room;
        return {
          ...room,
          status: "已租",
          monthlyRent: form.monthlyRent || room.monthlyRent,
          depositAmount: form.depositAmount || room.depositAmount
        };
      });
      const nextContract: BusinessContract = {
        id: contractId,
        propertyId: form.propertyId,
        roomId: form.roomId,
        tenantId,
        startDate: form.coverageStartDate || form.paymentDate,
        endDate: form.contractEndDate,
        monthlyRent: form.monthlyRent,
        depositAmount: form.depositAmount,
        status: "有效",
        notes: form.notes
      };
      const nextDeposit: BusinessDeposit | null = form.depositAmount
        ? {
            id: crypto.randomUUID(),
            propertyId: form.propertyId,
            roomId: form.roomId,
            tenantId,
            type: "收取",
            amount: form.depositAmount,
            status: form.depositStatus === "已收" ? "已收" : "待退",
            transactionDate: form.paymentDate,
            receivedBy: finalReceivedBy,
            paidBy: "A",
            notes: [form.notes, `[收租押金:${paymentId}]`].filter(Boolean).join("\n")
          }
        : null;
      const rentMonth = (form.coverageStartDate || form.paymentDate || new Date().toISOString().slice(0, 10)).slice(0, 7);
      const rentAmount = Number(form.amountPaid || 0);
      const collectedDeposit = form.depositStatus === "已收" ? Number(form.depositAmount || 0) : 0;
      const actualPaid = form.paymentStatus === "未收" ? collectedDeposit : rentAmount + collectedDeposit;
      const amountUnpaid = form.paymentStatus === "未收" ? rentAmount : 0;
      const nextPayment: BusinessRentPayment = {
        id: paymentId,
        propertyId: form.propertyId,
        roomId: form.roomId,
        tenantId,
        incomeType: "房租收入",
        incomeItem: "",
        rentMonth,
        paymentDate: form.paymentDate,
        amountDue: rentAmount,
        amountPaid: actualPaid,
        amountUnpaid,
        coverageStartDate: form.coverageStartDate || monthStart(rentMonth),
        coverageEndDate: form.coverageEndDate || monthEnd(rentMonth),
        paymentMethod: form.paymentMethod,
        receivedBy: finalReceivedBy,
        paymentStatus: form.paymentStatus,
        isOverdue: false,
        notes: form.notes
      };
      nextPayment.isOverdue = isCoverageExpired(nextPayment);

      await saveBusinessData(tenantKey, nextTenants);
      await saveBusinessData(roomKey, nextRooms);
      await saveBusinessData(contractKey, [nextContract, ...contracts]);
      if (attachment) await uploadContractFile(contractId, attachment);
      await saveBusinessData(depositKey, nextDeposit ? [nextDeposit, ...deposits] : deposits);
      await saveBusinessData(rentPaymentKey, [nextPayment, ...payments]);
      if (paymentAttachment) await uploadRentPaymentFile(nextPayment.id, paymentAttachment);
      setTenants(nextTenants);
      setRooms(nextRooms);
      setContracts([nextContract, ...contracts]);
      if (nextDeposit) setDeposits([nextDeposit, ...deposits]);
      setPayments([nextPayment, ...payments]);
      setAttachment(null);
      setPaymentAttachment(null);
      setAdvancedOpen(false);
      setAttachmentsOpen(false);
      window.alert("一键入住已保存，首页统计会同步更新。");
    } catch (error: any) {
      window.alert(error.message || "一键入住保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  function chooseFile(file?: File) {
    if (!file) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      window.alert("只支持 PDF、JPG、PNG 文件。");
      return;
    }
    if (file.size > maxAttachmentSize) {
      window.alert("合同附件不能超过 5MB。");
      return;
    }
    setAttachment(file);
  }

  function choosePaymentFile(file?: File) {
    if (!file) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      window.alert("只支持 PDF、JPG、PNG 文件。");
      return;
    }
    if (file.size > maxAttachmentSize) {
      window.alert("收款附件不能超过 5MB。");
      return;
    }
    setPaymentAttachment(file);
  }

  return (
    <AppLayout title="一键入住" description="一次录入租客、合同、押金和本月租金，减少重复操作。">
      <section className="card panel">
        <form className="form-grid" onSubmit={submit}>
          <SearchableSelect label="房源" value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId, roomId: "" }))} />
          <SearchableSelect label="房间" value={form.roomId} disabled={!form.propertyId} options={availableRooms.map((room) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }))} onChange={(roomId) => {
            const room = rooms.find((item) => item.id === roomId);
            setForm((current) => ({ ...current, roomId, monthlyRent: room?.monthlyRent || current.monthlyRent, depositAmount: room?.depositAmount || current.depositAmount }));
          }} />
          <TextField label="租客姓名" required value={form.tenantName} onChange={(tenantName) => setForm((current) => ({ ...current, tenantName }))} />
          <TextField label="电话" value={form.phone} onChange={(phone) => setForm((current) => ({ ...current, phone }))} />
          <TextField label="证件号（可选）" value={form.documentNumber} onChange={(documentNumber) => setForm((current) => ({ ...current, documentNumber }))} />
          <div className="field"><label>房间月租（只读）</label><input readOnly value={`€${Number(form.monthlyRent || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} /></div>
          <MoneyInput label="本次房租金额" value={form.amountPaid} onChange={(amountPaid) => setForm((current) => ({ ...current, amountPaid }))} />
          <MoneyInput label="押金金额" value={form.depositAmount} onChange={(depositAmount) => setForm((current) => ({ ...current, depositAmount }))} />
          <div className="field"><label>本次合计收入</label><input readOnly value={`€${(Number(form.amountPaid || 0) + (form.depositStatus === "已收" ? Number(form.depositAmount || 0) : 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} /></div>
          <div className="field"><label>每月缴费日</label><input max="28" min="1" required type="number" value={form.paymentDay} onChange={(event) => setForm((current) => ({ ...current, paymentDay: Math.min(28, Math.max(1, Number(event.target.value || 20))) }))} /></div>
          <div className="field"><label>租金覆盖开始日期</label><input required type="date" value={form.coverageStartDate} onChange={(event) => setForm((current) => ({ ...current, coverageStartDate: event.target.value }))} /></div>
          <div className="field"><label>租金覆盖结束日期</label><input required type="date" value={form.coverageEndDate} onChange={(event) => setForm((current) => ({ ...current, coverageEndDate: event.target.value }))} /></div>
          <OwnershipField mode={ownershipMode} customName={customReceivedBy} onModeChange={(mode) => {
            setOwnershipMode(mode);
            if (mode !== "自定义") setCustomReceivedBy("");
          }} onCustomNameChange={setCustomReceivedBy} />
          <SearchableSelect label="收款状态" value={form.paymentStatus} options={["已收", "未收"].map((status) => ({ value: status, label: status }))} onChange={(paymentStatus) => setForm((current) => ({ ...current, paymentStatus }))} />
          <SearchableSelect label="付款方式" value={form.paymentMethod} options={["现金", "转账", "Bizum", "其他"].map((method) => ({ value: method, label: method }))} onChange={(paymentMethod) => setForm((current) => ({ ...current, paymentMethod }))} />
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          <div className="field collapsible-attachments" style={{ gridColumn: "1 / -1" }}>
            <button className="btn soft attachment-toggle" type="button" onClick={() => setAdvancedOpen((current) => !current)}>
              <span>高级选项</span>
              <span className="muted">{advancedOpen ? "收起" : "展开"}</span>
            </button>
            {advancedOpen ? (
              <div className="attachment-sections">
                <div className="field compact-field">
                  <label>收款日期</label>
                  <input required type="date" value={form.paymentDate} onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))} />
                </div>
                <div className="field compact-field">
                  <label>合同结束日期（可选）</label>
                  <input type="date" value={form.contractEndDate} onChange={(event) => setForm((current) => ({ ...current, contractEndDate: event.target.value }))} />
                </div>
                <SearchableSelect label="押金状态" value={form.depositStatus} options={["已收", "未收"].map((status) => ({ value: status, label: status }))} onChange={(depositStatus) => setForm((current) => ({ ...current, depositStatus }))} />
              </div>
            ) : <p className="muted">收款日期默认今天，押金默认已收；需要修改时再展开。</p>}
          </div>
          <div className="field collapsible-attachments" style={{ gridColumn: "1 / -1" }}>
            <button className="btn soft attachment-toggle" type="button" onClick={() => setAttachmentsOpen((current) => !current)}>
              <span><FileUp size={16} /> 附件管理</span>
              <span className="muted">{attachmentsOpen ? "收起" : "展开"}</span>
            </button>
            {attachmentsOpen ? (
              <div className="attachment-sections">
                <div className="attachment-subsection">
                  <label>收款附件 PDF/JPG/PNG</label>
                  <input accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" type="file" onChange={(event) => choosePaymentFile(event.target.files?.[0])} />
                  {paymentAttachment ? <div className="attachment-preview"><FileUp size={16} /><span>{paymentAttachment.name} · {formatFileSize(paymentAttachment.size)}</span><button className="btn danger" type="button" onClick={() => setPaymentAttachment(null)}>移除</button></div> : <p className="muted">可上传付款截图或收款凭证，附件会绑定到本次收款记录。</p>}
                </div>
                <div className="attachment-subsection">
                  <label>合同附件 PDF/JPG/PNG</label>
                  <input accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" type="file" onChange={(event) => chooseFile(event.target.files?.[0])} />
                  {attachment ? <div className="attachment-preview"><FileUp size={16} /><span>{attachment.name} · {formatFileSize(attachment.size)}</span><button className="btn danger" type="button" onClick={() => setAttachment(null)}>移除</button></div> : <p className="muted">手机浏览器可选择拍照、相册或文件上传，附件会保存到 Supabase Storage。</p>}
                </div>
              </div>
            ) : <p className="muted">合同和收款凭证默认隐藏，需要时再展开上传。</p>}
          </div>
          <div className="modal-actions"><button className="btn primary" disabled={saving} type="submit"><Save size={17} /> 保存入住</button></div>
        </form>
      </section>
    </AppLayout>
  );
}

function TextField({ label, value, onChange, required }: { label: string; value?: string; onChange: (value: string) => void; required?: boolean }) {
  return <div className="field"><label>{label}</label><input required={required} value={value || ""} onChange={(event) => onChange(event.target.value)} /></div>;
}
