"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { MoneyInput } from "@/components/money-input";
import { OwnershipField } from "@/components/ownership-field";
import { SearchableSelect } from "@/components/searchable-select";
import {
  BusinessContract,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  contractKey,
  getInitialContracts,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  getInitialTenants,
  loadBusinessData,
  rentPaymentKey,
  roomKey,
  tenantKey
} from "@/lib/business-data";
import { formatFileSize, uploadContractFile } from "@/lib/contract-files";
import { uploadRentPaymentFile } from "@/lib/rent-payment-files";
import { isCoverageExpired, monthEnd, monthStart } from "@/lib/rent-coverage";
import { getValidSupabaseSession } from "@/lib/supabase";
import { FileUp, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const maxAttachmentSize = 5 * 1024 * 1024;

function createInitialForm() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    propertyId: "",
    roomId: "",
    tenantName: "",
    phone: "",
    documentNumber: "",
    contractEndDate: "",
    amountPaid: 0,
    paymentDate: today,
    coverageStartDate: today,
    coverageEndDate: "",
    depositAmount: 0,
    paymentDay: 20 as number | undefined,
    depositStatus: "已收",
    paymentStatus: "已收",
    paymentMethod: "转账",
    notes: ""
  };
}

export default function CheckInPage() {
  const router = useRouter();
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [saving, setSaving] = useState(false);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [paymentAttachment, setPaymentAttachment] = useState<File | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [ownershipMode, setOwnershipMode] = useState<"A" | "B" | "自定义">("A");
  const [customReceivedBy, setCustomReceivedBy] = useState("");
  const requestIdRef = useRef<string | null>(null);
  const submitLockRef = useRef(false);
  const [form, setForm] = useState(createInitialForm);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>("business-properties", getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms));
      const loadedContracts = await loadBusinessData<BusinessContract>(contractKey, getInitialContracts());
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments());
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setPayments(loadedPayments);
    }
    load().catch((error) => window.alert(`加载入住数据失败：${error.message || error}`));
  }, []);

  useEffect(() => {
    if (!completionMessage) return;
    const returnTimer = window.setTimeout(() => router.replace("/tenants"), 900);
    return () => window.clearTimeout(returnTimer);
  }, [completionMessage, router]);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId && room.status !== "已归档");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || submitLockRef.current || completionMessage) return;
    if (!form.propertyId || !form.roomId || !form.tenantName.trim()) {
      window.alert("请先选择房源、房间，并填写租客姓名。");
      return;
    }
    if (ownershipMode === "自定义" && !customReceivedBy.trim()) {
      window.alert("请填写自定义归属名称。");
      return;
    }
    if (form.paymentDay != null && (!Number.isInteger(form.paymentDay) || form.paymentDay < 1 || form.paymentDay > 31)) {
      window.alert("每月缴费日请输入1到31，或留空表示不设置。");
      return;
    }
    submitLockRef.current = true;
    setSaving(true);
    try {
      const clientRequestId = requestIdRef.current || crypto.randomUUID();
      requestIdRef.current = clientRequestId;
      const finalReceivedBy = ownershipMode === "自定义" ? customReceivedBy.trim() : ownershipMode;
      const session = await getValidSupabaseSession();
      if (!session) throw new Error("登录状态已失效，请重新登录。");
      const response = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          clientRequestId,
          propertyId: form.propertyId,
          roomId: form.roomId,
          tenantName: form.tenantName,
          phone: form.phone,
          documentNumber: form.documentNumber,
          rentAmount: form.amountPaid,
          depositAmount: form.depositAmount,
          paymentDay: form.paymentDay ?? 20,
          paymentDate: form.paymentDate,
          coverageStartDate: form.coverageStartDate,
          coverageEndDate: form.coverageEndDate,
          contractEndDate: form.contractEndDate,
          depositStatus: form.depositStatus,
          paymentStatus: form.paymentStatus,
          paymentMethod: form.paymentMethod,
          receivedBy: finalReceivedBy,
          notes: form.notes
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "保存入住失败，本次没有产生任何记录。");
      const result = payload?.result as {
        tenantId: string;
        contractId: string;
        rentPaymentId: string;
        depositId?: string | null;
        monthlyRent: number;
      };
      const tenantId = result.tenantId;
      const contractId = result.contractId;
      const paymentId = result.rentPaymentId;
      const effectiveMonthlyRent = Number(result.monthlyRent ?? form.amountPaid ?? 0);
      const nextTenant: BusinessTenant = {
        id: tenantId,
        propertyId: form.propertyId,
        roomId: form.roomId,
        name: form.tenantName.trim(),
        phone: form.phone,
        wechat: "",
        source: "其他",
        monthlyRent: effectiveMonthlyRent,
        depositAmount: form.depositAmount,
        paymentDay: form.paymentDay,
        status: "在租",
        notes: [form.documentNumber ? `证件号：${form.documentNumber}` : "", form.notes].filter(Boolean).join("\n")
      };
      const nextTenants = [nextTenant, ...tenants.filter((tenant) => tenant.id !== tenantId)];
      const nextRooms = rooms.map((room) => {
        if (room.id !== form.roomId) return room;
        return {
          ...room,
          status: "已租"
        };
      });
      const nextContract: BusinessContract = {
        id: contractId,
        propertyId: form.propertyId,
        roomId: form.roomId,
        tenantId,
        startDate: form.coverageStartDate || form.paymentDate,
        endDate: form.contractEndDate,
        monthlyRent: effectiveMonthlyRent,
        depositAmount: form.depositAmount,
        status: "有效",
        notes: form.notes
      };
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

      let attachmentFailed = false;
      try {
        if (attachment) await uploadContractFile(contractId, attachment);
        if (paymentAttachment) await uploadRentPaymentFile(paymentId, paymentAttachment);
      } catch {
        attachmentFailed = true;
      }
      setTenants(nextTenants);
      setRooms(nextRooms);
      setContracts([nextContract, ...contracts.filter((contract) => contract.id !== contractId)]);
      setPayments([nextPayment, ...payments.filter((payment) => payment.id !== paymentId)]);
      setAttachment(null);
      setPaymentAttachment(null);
      setAdvancedOpen(false);
      setAttachmentsOpen(false);
      setForm(createInitialForm());
      setCompletionMessage(attachmentFailed ? "入住已保存，但附件上传失败，正在返回租客管理。" : "入住保存成功，正在返回租客管理。");
    } catch (error: any) {
      window.alert(error.message || "一键入住保存失败，请稍后重试。");
      submitLockRef.current = false;
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
          <SearchableSelect label="房间" value={form.roomId} disabled={!form.propertyId} openOnTouchWithoutKeyboard options={availableRooms.map((room) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }))} onChange={(roomId) => setForm((current) => ({ ...current, roomId }))} />
          <TextField label="租客姓名" required value={form.tenantName} onChange={(tenantName) => setForm((current) => ({ ...current, tenantName }))} />
          <TextField label="电话" value={form.phone} onChange={(phone) => setForm((current) => ({ ...current, phone }))} />
          <TextField label="证件号（可选）" value={form.documentNumber} onChange={(documentNumber) => setForm((current) => ({ ...current, documentNumber }))} />
          <MoneyInput label="本次房租金额" value={form.amountPaid} onChange={(amountPaid) => setForm((current) => ({ ...current, amountPaid }))} />
          <MoneyInput label="押金金额" value={form.depositAmount} onChange={(depositAmount) => setForm((current) => ({ ...current, depositAmount }))} />
          <div className="field"><label>本次合计收入</label><input readOnly value={`€${(Number(form.amountPaid || 0) + (form.depositStatus === "已收" ? Number(form.depositAmount || 0) : 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} /></div>
          <div className="field"><label>每月缴费日（可选）</label><input inputMode="numeric" max="31" min="1" placeholder="不设置可留空" type="number" value={form.paymentDay ?? ""} onChange={(event) => setForm((current) => ({ ...current, paymentDay: event.target.value === "" ? undefined : Number(event.target.value) }))} /></div>
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
          {access.can("attachments", "create") && access.canSensitive("canUploadFiles") ? <div className="field collapsible-attachments" style={{ gridColumn: "1 / -1" }}>
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
          </div> : null}
          {access.can("check_in", "create") ? <div className="modal-actions">
            {completionMessage ? <p className="form-status success" role="status">{completionMessage}</p> : null}
            <button className="btn primary" disabled={saving || Boolean(completionMessage)} type="submit"><Save size={17} /> {saving ? "正在保存..." : "保存入住"}</button>
          </div> : null}
        </form>
      </section>
    </AppLayout>
  );
}

function TextField({ label, value, onChange, required }: { label: string; value?: string; onChange: (value: string) => void; required?: boolean }) {
  return <div className="field"><label>{label}</label><input required={required} value={value || ""} onChange={(event) => onChange(event.target.value)} /></div>;
}
