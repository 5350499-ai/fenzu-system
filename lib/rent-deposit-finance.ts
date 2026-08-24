type RentPaymentLike = {
  id: string;
  sourceDepositId?: string;
  propertyId: string;
  roomId: string;
  tenantId: string;
  incomeType?: string;
  incomeItem?: string;
  rentMonth: string;
  paymentDate?: string;
  amountDue: number;
  amountPaid: number;
  amountUnpaid: number;
  coverageStartDate?: string;
  coverageEndDate?: string;
  paymentMethod: string;
  receivedBy?: string;
  paymentStatus?: string;
  isOverdue: boolean;
  notes?: string;
};

type DepositLike = {
  id: string;
  propertyId: string;
  roomId: string;
  tenantId: string;
  type: string;
  amount: number;
  transactionDate: string;
  receivedBy?: string;
  notes?: string;
};

export type CheckInReceiptLink = {
  paymentId: string;
  depositId: string;
};

export type RentDepositFinanceClassification =
  | "LEGACY_MIXED_CHECKIN"
  | "NEW_SEPARATED_CHECKIN"
  | "LEGACY_MIXED_RENEWAL"
  | "NEW_SEPARATED_RENEWAL"
  | "DEPOSIT_ONLY"
  | "RENT_ONLY";

export type RentPaymentReceiptProjection = {
  rentAmount: number;
  depositAmount: number;
  totalReceived: number;
  legacyMixedDeposit: boolean;
  classification: RentDepositFinanceClassification;
};

/**
 * Canonical read projection for a rent receipt and its linked deposit.
 * Current receipts keep rent and deposit separate; historical mixed receipts
 * stored both components in amountPaid.
 */
export function classifyRentDepositFinance(
  payment: RentPaymentLike | undefined,
  deposit: DepositLike | undefined,
  checkInLinks: CheckInReceiptLink[] = []
): RentDepositFinanceClassification {
  if (!payment) return "DEPOSIT_ONLY";
  if (!deposit) return "RENT_ONLY";
  const checkInLink = checkInLinks.find((link) => link.paymentId === payment.id || link.depositId === deposit.id);
  if (checkInLink && (checkInLink.paymentId !== payment.id || checkInLink.depositId !== deposit.id)) {
    throw new Error("Ambiguous check-in receipt linkage");
  }
  const markerPaymentId = linkedRentPaymentId(deposit);
  if (markerPaymentId && markerPaymentId !== payment.id) throw new Error("Conflicting rent/deposit receipt linkage");
  const paid = moneyAmount(payment.amountPaid);
  const due = moneyAmount(payment.amountDue);
  const depositAmount = moneyAmount(deposit.amount);
  const legacyMixed = depositAmount > 0 && (
    sameMoney(paid, due + depositAmount)
    || (payment.paymentStatus === "未收" && sameMoney(paid, depositAmount))
  );
  if (checkInLink) return legacyMixed ? "LEGACY_MIXED_CHECKIN" : "NEW_SEPARATED_CHECKIN";
  if (markerPaymentId) return legacyMixed ? "LEGACY_MIXED_RENEWAL" : "NEW_SEPARATED_RENEWAL";
  return "RENT_ONLY";
}

export function projectRentPaymentReceipt(
  payment: RentPaymentLike,
  linkedDeposit?: DepositLike,
  checkInLinks: CheckInReceiptLink[] = []
): RentPaymentReceiptProjection {
  const paid = moneyAmount(payment.amountPaid);
  const due = moneyAmount(payment.amountDue);
  const isRent = !payment.incomeType || payment.incomeType === "房租收入" || payment.incomeType === "续交房租";
  if (!isRent) {
    return {
      rentAmount: 0,
      depositAmount: payment.incomeType === "押金收入" ? paid : 0,
      totalReceived: paid,
      legacyMixedDeposit: false,
      classification: "RENT_ONLY"
    };
  }

  if (!linkedDeposit) {
    const embeddedDeposit = Math.max(roundMoney(paid - due), 0);
    return {
      rentAmount: roundMoney(paid - embeddedDeposit),
      depositAmount: embeddedDeposit,
      totalReceived: paid,
      legacyMixedDeposit: embeddedDeposit > 0,
      classification: "RENT_ONLY"
    };
  }

  const deposit = moneyAmount(linkedDeposit.amount);
  const classification = classifyRentDepositFinance(payment, linkedDeposit, checkInLinks);
  const legacyMixedDeposit = classification === "LEGACY_MIXED_CHECKIN" || classification === "LEGACY_MIXED_RENEWAL";
  const rentAmount = legacyMixedDeposit ? Math.max(roundMoney(paid - deposit), 0) : paid;
  return {
    rentAmount,
    depositAmount: deposit,
    totalReceived: legacyMixedDeposit ? paid : roundMoney(paid + deposit),
    legacyMixedDeposit,
    classification
  };
}

/** Adds only deposit income not already represented by a ledger payment. */
export function projectDepositIncomePayments<TPayment extends RentPaymentLike>(deposits: DepositLike[], payments: TPayment[], checkInLinks: CheckInReceiptLink[] = []) {
  const ledgerDepositIds = new Set(payments.map((payment) => payment.sourceDepositId).filter(Boolean));
  const paymentsById = new Map(payments.map((payment) => [payment.id, payment]));
  return deposits
    .filter((deposit) => {
      if (deposit.type !== "收取" || isVoided(deposit.notes) || ledgerDepositIds.has(deposit.id)) return false;
      const linkedPaymentId = linkedRentPaymentIdForDeposit(deposit, checkInLinks);
      if (!linkedPaymentId) return true;
      const linkedPayment = paymentsById.get(linkedPaymentId);
      if (!linkedPayment) return true;
      return !projectRentPaymentReceipt(linkedPayment, deposit, checkInLinks).legacyMixedDeposit;
    })
    .map((deposit) => ({
      id: `deposit-income:${deposit.id}`,
      sourceDepositId: deposit.id,
      propertyId: deposit.propertyId,
      roomId: deposit.roomId,
      tenantId: deposit.tenantId,
      incomeType: "押金收入" as const,
      incomeItem: "押金收入",
      rentMonth: (deposit.transactionDate || "").slice(0, 7),
      paymentDate: deposit.transactionDate,
      amountDue: 0,
      amountPaid: Number(deposit.amount || 0),
      amountUnpaid: 0,
      coverageStartDate: "",
      coverageEndDate: "",
      paymentMethod: "",
      receivedBy: deposit.receivedBy,
      paymentStatus: "已收",
      isOverdue: false,
      notes: "[押金收入][历史投影]"
    }));
}

export function linkedRentPaymentId(deposit: Pick<DepositLike, "notes">) {
  return deposit.notes?.match(/\[收租押金:([^\]]+)\]/)?.[1] || "";
}

export function linkedRentPaymentIdForDeposit(deposit: Pick<DepositLike, "id" | "notes">, checkInLinks: CheckInReceiptLink[] = []) {
  const markerPaymentId = linkedRentPaymentId(deposit);
  const checkInPaymentId = checkInLinks.find((link) => link.depositId === deposit.id)?.paymentId || "";
  if (markerPaymentId && checkInPaymentId && markerPaymentId !== checkInPaymentId) {
    throw new Error("Conflicting rent/deposit receipt linkage");
  }
  return checkInPaymentId || markerPaymentId;
}

export function isLinkedRentDeposit(deposit: Pick<DepositLike, "notes">) {
  return Boolean(linkedRentPaymentId(deposit));
}

function moneyAmount(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? roundMoney(amount) : 0;
}

function sameMoney(left: number, right: number) {
  return Math.abs(roundMoney(left) - roundMoney(right)) < 0.005;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.includes("[宸蹭綔搴焆"));
}
