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

export type RentPaymentReceiptProjection = {
  rentAmount: number;
  depositAmount: number;
  totalReceived: number;
  legacyMixedDeposit: boolean;
};

/**
 * Canonical read projection for a rent receipt and its linked deposit.
 * Current receipts keep rent and deposit separate; historical mixed receipts
 * stored both components in amountPaid.
 */
export function projectRentPaymentReceipt(payment: RentPaymentLike, linkedDepositAmount?: number): RentPaymentReceiptProjection {
  const paid = moneyAmount(payment.amountPaid);
  const due = moneyAmount(payment.amountDue);
  const isRent = !payment.incomeType || payment.incomeType === "房租收入" || payment.incomeType === "续交房租";
  if (!isRent) {
    return {
      rentAmount: 0,
      depositAmount: payment.incomeType === "押金收入" ? paid : 0,
      totalReceived: paid,
      legacyMixedDeposit: false
    };
  }

  if (linkedDepositAmount === undefined) {
    const embeddedDeposit = Math.max(roundMoney(paid - due), 0);
    return {
      rentAmount: roundMoney(paid - embeddedDeposit),
      depositAmount: embeddedDeposit,
      totalReceived: paid,
      legacyMixedDeposit: embeddedDeposit > 0
    };
  }

  const deposit = moneyAmount(linkedDepositAmount);
  const legacyMixedDeposit = deposit > 0 && (
    sameMoney(paid, due + deposit)
    || (payment.paymentStatus === "未收" && sameMoney(paid, deposit))
  );
  const rentAmount = legacyMixedDeposit ? Math.max(roundMoney(paid - deposit), 0) : paid;
  return {
    rentAmount,
    depositAmount: deposit,
    totalReceived: legacyMixedDeposit ? paid : roundMoney(paid + deposit),
    legacyMixedDeposit
  };
}

/** Adds only deposit income not already represented by a ledger payment. */
export function projectDepositIncomePayments<TPayment extends RentPaymentLike>(deposits: DepositLike[], payments: TPayment[]) {
  const ledgerDepositIds = new Set(payments.map((payment) => payment.sourceDepositId).filter(Boolean));
  const paymentsById = new Map(payments.map((payment) => [payment.id, payment]));
  return deposits
    .filter((deposit) => {
      if (deposit.type !== "收取" || isVoided(deposit.notes) || ledgerDepositIds.has(deposit.id)) return false;
      const linkedPaymentId = linkedRentPaymentId(deposit);
      if (!linkedPaymentId) return true;
      const linkedPayment = paymentsById.get(linkedPaymentId);
      if (!linkedPayment) return true;
      return !projectRentPaymentReceipt(linkedPayment, deposit.amount).legacyMixedDeposit;
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
