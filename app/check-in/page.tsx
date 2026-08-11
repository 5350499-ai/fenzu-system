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
  depositKey,
  getInitialContracts,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  getInitialTenants,
  invalidateBusinessData,
  loadBusinessData,
  rentPaymentKey,
  roomKey,
  tenantKey
} from "@/lib/business-data";
import { formatFileSize, uploadContractFile } from "@/lib/contract-files";
import { ATTACHMENT_FILE_ACCEPT, prepareAttachmentFile } from "@/lib/attachment-file-limits";
import { uploadRentPaymentFile } from "@/lib/rent-payment-files";
import { isCoverageExpired, monthEnd, monthStart } from "@/lib/rent-coverage";
import { buildActivePartnerOptions, getPartners } from "@/lib/partners";
import { paymentMethodOptions } from "@/lib/payment-method-presets";
import { getValidSupabaseSession } from "@/lib/supabase";
import { FileUp, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function createInitialForm() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    propertyId: "",
    roomId: "",
    tenantName: "",
    phone: "",
    wechat: "",
    documentNumber: "",
    contractEndDate: "",
    amountPaid: 0,
    paymentDate: today,
    coverageStartDate: today,
    coverageEndDate: "",
    depositAmount: 0,
    occupantCount: 1,
    paymentDay: 20 as number | undefined,
    depositStatus: "已收",
    paymentStatus: "已收",
    paymentMethod: "转账",
    notes: ""
  };
}

type CheckInAttachment = { file: File; target: "payment" | "contract" };

export default function CheckInPage() {
  const router = useRouter();
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [partnerOptions, setPartnerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [checkInAttachments, setCheckInAttachments] = useState<CheckInAttachment[]>([]);
  const [preparingAttachment, setPreparingAttachment] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [ownershipMode, setOwnershipMode] = useState<string>("");
  const requestIdRef = useRef<string | null>(null);
  const submitLockRef = useRef(false);
  const [form, setForm] = useState(createInitialForm);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("fromViewing") !== "1") return;
    setForm((current) => ({
      ...current,
      propertyId: params.get("propertyId") || current.propertyId,
      roomId: params.get("roomId") || current.roomId,
      tenantName: params.get("tenantName") || current.tenantName,
      phone: params.get("phone") || current.phone,
      notes: params.get("notes") || current.notes
    }));
  }, []);

  useEffect(() => {
    async function load() {
      const partnerData = await getPartners();
      const nextPartnerOptions = partnerData ? buildActivePartnerOptions(partnerData) : [];
      setPartnerOptions(nextPartnerOptions);
      setPartnersLoading(false);
      setOwnershipMode(nextPartnerOptions[0]?.value || "");
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
    load().catch((error) => {
      setPartnersLoading(false);
      window.alert(`加载入住数据失败：${error.message || error}`);
    });
  }, [access.isFreeSingle]);

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
    if (!ownershipMode) {
      window.alert("请选择收款归属。");
      return;
    }
    if (form.paymentDay != null && (!Number.isInteger(form.paymentDay) || form.paymentDay < 1 || form.paymentDay > 31)) {
      window.alert("每月缴费日请输入1到31，或留空表示不设置。");
      return;
    }
    if (!Number.isInteger(form.occupantCount) || form.occupantCount < 1) {
      window.alert("入住人数请输入1或更大的正整数。");
      return;
    }
    submitLockRef.current = true;
    setSaving(true);
    try {
      const clientRequestId = requestIdRef.current || crypto.randomUUID();
      requestIdRef.current = clientRequestId;
      const finalReceivedBy = ownershipMode;
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
          wechat: form.wechat,
          documentNumber: form.documentNumber,
          rentAmount: form.amountPaid,
          depositAmount: form.depositAmount,
          occupantCount: form.occupantCount,
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
      const contactSaveWarning = String(payload?.contactSaveWarning || "");
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
        wechat: form.wechat,
        source: "其他",
        monthlyRent: effectiveMonthlyRent,
        depositAmount: form.depositAmount,
        occupantCount: form.occupantCount,
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
        for (const item of checkInAttachments) {
          if (item.target === "contract") await uploadContractFile(tenantId, contractId, item.file);
          else await uploadRentPaymentFile(paymentId, item.file);
        }
      } catch {
        attachmentFailed = true;
      }
      setTenants(nextTenants);
      setRooms(nextRooms);
      setContracts([nextContract, ...contracts.filter((contract) => contract.id !== contractId)]);
      setPayments([nextPayment, ...payments.filter((payment) => payment.id !== paymentId)]);
      await invalidateBusinessData([tenantKey, roomKey, contractKey, rentPaymentKey, depositKey]);
      setCheckInAttachments([]);
      setAdvancedOpen(false);
      setAttachmentsOpen(false);
      setForm(createInitialForm());
      setCompletionMessage(contactSaveWarning || (attachmentFailed ? "入住已保存，但附件上传失败，正在返回租客管理。" : "入住保存成功，正在返回租客管理。"));
    } catch (error: any) {
      window.alert(error.message || "一键入住保存失败，请稍后重试。");
      submitLockRef.current = false;
    } finally {
      setSaving(false);
    }
  }

  async function chooseAttachments(selection: FileList | null) {
    if (!selection) return;
    setPreparingAttachment(true);
    try {
      const accepted: CheckInAttachment[] = [];
      const notices: string[] = [];
      const rejected: string[] = [];
      for (const file of Array.from(selection)) {
        try {
          const prepared = await prepareAttachmentFile(file);
          accepted.push({ file: prepared.file, target: "payment" });
          if (prepared.notice) notices.push(prepared.notice);
        } catch (error: any) {
          rejected.push(`${file.name}：${error?.message || "无法处理该文件"}`);
        }
      }
      setCheckInAttachments((current) => [...current, ...accepted]);
      if (notices.length) window.alert(notices.join("\n"));
      if (rejected.length) window.alert(`以下文件未加入上传队列：\n${rejected.join("\n")}`);
    } catch (error: any) {
      window.alert(error?.message || "无法处理附件。");
    } finally {
      setPreparingAttachment(false);
    }
  }

  return (
    <AppLayout title="一键入住" description="一次录入租客、合同、押金和本月租金，减少重复操作。">
      <section className="card panel">
        <form className="form-grid check-in-form-grid" onSubmit={submit}>
          <SearchableSelect className="check-in-wide" label="房源" value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId, roomId: "" }))} />
          <SearchableSelect className="check-in-wide" label="房间" value={form.roomId} disabled={!form.propertyId} openOnTouchWithoutKeyboard options={availableRooms.map((room) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }))} onChange={(roomId) => setForm((current) => ({ ...current, roomId }))} />
          <TextField label="租客姓名" required value={form.tenantName} onChange={(tenantName) => setForm((current) => ({ ...current, tenantName }))} />
          <div className="field"><label>入住人数</label><input inputMode="numeric" min="1" step="1" type="number" value={form.occupantCount || ""} onChange={(event) => setForm((current) => ({ ...current, occupantCount: Number(event.target.value) }))} /></div>
          <TextField label="电话" value={form.phone} onChange={(phone) => setForm((current) => ({ ...current, phone }))} />
          <TextField label="WhatsApp / 其他" value={form.wechat} onChange={(wechat) => setForm((current) => ({ ...current, wechat }))} />
          <TextField label="证件号" value={form.documentNumber} onChange={(documentNumber) => setForm((current) => ({ ...current, documentNumber }))} />
          <MoneyInput label="本次房租金额" value={form.amountPaid} onChange={(amountPaid) => setForm((current) => ({ ...current, amountPaid }))} />
          <MoneyInput label="本次押金" value={form.depositAmount} onChange={(depositAmount) => setForm((current) => ({ ...current, depositAmount }))} />
          <div className="field"><label>每月缴费日</label><input inputMode="numeric" max="31" min="1" placeholder="不设置可留空" type="number" value={form.paymentDay ?? ""} onChange={(event) => setForm((current) => ({ ...current, paymentDay: event.target.value === "" ? undefined : Number(event.target.value) }))} /></div>
          <div className="field"><label>本次合计收入</label><input readOnly value={`€${(Number(form.amountPaid || 0) + (form.depositStatus === "已收" ? Number(form.depositAmount || 0) : 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} /></div>
          <div className="field"><label>租金覆盖开始日期</label><input required type="date" value={form.coverageStartDate} onChange={(event) => setForm((current) => ({ ...current, coverageStartDate: event.target.value }))} /></div>
          <div className="field"><label>租金覆盖结束日期</label><input required type="date" value={form.coverageEndDate} onChange={(event) => setForm((current) => ({ ...current, coverageEndDate: event.target.value }))} /></div>
          <OwnershipField className="check-in-ownership" options={partnerOptions} optionsLoading={partnersLoading} mode={ownershipMode} onModeChange={setOwnershipMode} />
          <SearchableSelect label="收款状态" value={form.paymentStatus} options={["已收", "未收"].map((status) => ({ value: status, label: status }))} onChange={(paymentStatus) => setForm((current) => ({ ...current, paymentStatus }))} />
          <SearchableSelect label="付款方式" value={form.paymentMethod} options={paymentMethodOptions(form.paymentMethod)} onChange={(paymentMethod) => setForm((current) => ({ ...current, paymentMethod }))} />
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
                  <label>合同结束日期</label>
                  <input type="date" value={form.contractEndDate} onChange={(event) => setForm((current) => ({ ...current, contractEndDate: event.target.value }))} />
                </div>
                <SearchableSelect label="押金状态" value={form.depositStatus} options={["已收", "未收"].map((status) => ({ value: status, label: status }))} onChange={(depositStatus) => setForm((current) => ({ ...current, depositStatus }))} />
              </div>
            ) : <p className="muted">收款日期默认今天，押金默认已收；需要修改时再展开。</p>}
          </div>
          {access.can("attachments", "create") && access.canSensitive("canUploadFiles") ? <div className="field collapsible-attachments" style={{ gridColumn: "1 / -1" }}>
            <button className="btn soft attachment-toggle" type="button" onClick={() => setAttachmentsOpen((current) => !current)}>
              <span><FileUp size={16} /> 附件（可选）</span>
              <span className="muted">{attachmentsOpen ? "收起" : "展开"}</span>
            </button>
            {attachmentsOpen ? (
              <div className="attachment-sections">
                <div className="attachment-subsection check-in-attachments">
                  <label>附件（可选）</label>
                  <input accept={ATTACHMENT_FILE_ACCEPT} multiple type="file" onChange={(event) => { void chooseAttachments(event.target.files); event.currentTarget.value = ""; }} />
                  <p className="muted">可一次选择多个文件；每个文件可指定保存到本次收款或租客合同。</p>
                  {checkInAttachments.map((item, index) => (
                    <div className="attachment-preview check-in-attachment-item" key={`${item.file.name}-${item.file.size}-${index}`}>
                      <FileUp size={16} />
                      <span>{item.file.name} · {formatFileSize(item.file.size)}</span>
                      <select aria-label={`${item.file.name} 保存位置`} value={item.target} onChange={(event) => setCheckInAttachments((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, target: event.target.value as CheckInAttachment["target"] } : entry))}>
                        <option value="payment">收入附件</option>
                        <option value="contract">租客附件</option>
                      </select>
                      <button className="btn danger" type="button" onClick={() => setCheckInAttachments((current) => current.filter((_, entryIndex) => entryIndex !== index))}>移除</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="muted">附件默认隐藏，需要时展开后一次选择并分类保存。</p>}
          </div> : null}
          {access.can("check_in", "create") ? <div className="modal-actions">
            {completionMessage ? <p className="form-status success" role="status">{completionMessage}</p> : null}
            <button className="btn primary" disabled={saving || preparingAttachment || Boolean(completionMessage)} type="submit"><Save size={17} /> {saving ? "正在保存..." : preparingAttachment ? "正在处理附件..." : "保存入住"}</button>
          </div> : null}
        </form>
      </section>
    </AppLayout>
  );
}

function TextField({ label, value, onChange, required }: { label: string; value?: string; onChange: (value: string) => void; required?: boolean }) {
  return <div className="field"><label>{label}</label><input required={required} value={value || ""} onChange={(event) => onChange(event.target.value)} /></div>;
}
