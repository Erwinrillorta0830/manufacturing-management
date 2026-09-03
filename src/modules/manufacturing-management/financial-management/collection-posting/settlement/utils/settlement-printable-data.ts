import type { PaymentHistory, SettlementAllocation } from "../../types";

export interface RawCashBucket {
    detailId?: number;
    findingId?: number;
    amount?: number;
    paymentMethodId?: number;
    coaId?: number;
    balanceTypeId?: number;
    referenceNo?: string;
    bankName?: string;
    checkNo?: string;
    checkDate?: string;
    tempId?: string;
    customerCode?: string;
    customerName?: string;
    invoiceId?: number;
}

export interface RawAllocation {
    amountApplied?: number;
    allocationType?: string;
    customerCode?: string;
    customerName?: string;
    invoiceNo?: string;
    invoiceId?: number;
    sourceTempId?: string;
    originalAmount?: number;
    remainingBalance?: number;
    maxSettleableAmount?: number;
    totalPayments?: number;
    totalMemos?: number;
    totalReturns?: number;
    transactionDate?: string;
    dueDate?: string;
    agingDays?: number;
    history?: PaymentHistory[];
}

export interface RawTreasuryPouch {
    id?: number;
    docNo?: string;
    isPosted?: boolean;
    collectedBy?: number;
    crNo?: string;
    collectionDate?: string;
    salesmanId?: number;
    cashBuckets?: RawCashBucket[];
    allocations?: RawAllocation[];
}

export interface SettlementPrintableWalletItem {
    id: string;
    type: "CASH" | "CHECK" | "MEMO" | "RETURN" | "ADJUSTMENT" | "EWT";
    label: string;
    originalAmount: number;
    dbId?: number;
    findingId?: number;
    customerName?: string;
    customerCode?: string;
    balanceTypeId?: number;
    isLocal?: boolean;
    invoiceId?: number;
}

export interface SettlementPrintableData {
    wallet: SettlementPrintableWalletItem[];
    allocations: SettlementAllocation[];
}

export function mapRawPouchToSettlementPrintableData(
    pouch: RawTreasuryPouch,
): SettlementPrintableData {
    let totalCash = 0;
    const wallet: SettlementPrintableWalletItem[] = [];

    pouch.cashBuckets?.forEach((bucket, index) => {
        const safeAmount = Math.abs(bucket.amount || 0);
        const tempId = String(bucket.tempId || "").toLowerCase();
        const referenceNo = String(bucket.referenceNo || "").toLowerCase();

        let type: SettlementPrintableWalletItem["type"] = "ADJUSTMENT";
        const isCash = Number(bucket.coaId) === 1
            || Number(bucket.paymentMethodId) === 1
            || tempId.startsWith("cash")
            || referenceNo.includes(" x ")
            || referenceNo === "cash_summary"
            || referenceNo === "physical cash";

        if (isCash) type = "CASH";
        else if (tempId.startsWith("chk") || bucket.paymentMethodId === 2) type = "CHECK";
        else if (tempId.startsWith("ewt") || bucket.paymentMethodId === 10 || bucket.coaId === 11) type = "EWT";
        else if (bucket.findingId != null || (bucket.paymentMethodId == null && bucket.coaId != null)) type = "ADJUSTMENT";
        else type = "CHECK";

        let id = bucket.tempId || `${type.toLowerCase()}-fallback-${index}`;
        if (wallet.some((item) => item.id === id)) {
            id = `${id}-dup-${index}`;
        }

        if (type === "CASH") {
            totalCash += safeAmount;
        } else if (type === "EWT") {
            wallet.push({
                id,
                type,
                label: bucket.referenceNo ? `Form 2307: ${bucket.referenceNo}` : "Form 2307",
                originalAmount: safeAmount,
                customerName: bucket.customerName || bucket.referenceNo,
                balanceTypeId: 2,
                dbId: bucket.detailId,
                invoiceId: bucket.invoiceId,
            });
        } else if (type === "ADJUSTMENT") {
            wallet.push({
                id,
                type,
                label: bucket.referenceNo || "Adjustment",
                originalAmount: safeAmount,
                customerName: bucket.customerName,
                balanceTypeId: bucket.balanceTypeId || 1,
                dbId: bucket.detailId,
                findingId: bucket.findingId,
                invoiceId: bucket.invoiceId,
            });
        } else {
            wallet.push({
                id,
                type: "CHECK",
                label: bucket.referenceNo ? `Check/Remittance: ${bucket.referenceNo}` : "No Ref",
                originalAmount: safeAmount,
                customerName: bucket.customerName || bucket.customerCode,
                balanceTypeId: 2,
                invoiceId: bucket.invoiceId,
                dbId: bucket.detailId,
            });
        }
    });

    if (totalCash > 0) {
        wallet.unshift({
            id: "CASH_SUMMARY",
            type: "CASH",
            label: "Physical Cash Pool",
            originalAmount: totalCash,
            balanceTypeId: 2,
        });
    }

    const allocations = (pouch.allocations || []).map((allocation): SettlementAllocation => ({
        invoiceId: allocation.invoiceId || 0,
        invoiceNo: allocation.invoiceNo || "",
        customerCode: allocation.customerCode,
        customerName: allocation.customerName || "",
        amountApplied: Math.abs(allocation.amountApplied || 0),
        allocationType: allocation.allocationType || "CASH",
        sourceTempId: allocation.sourceTempId || "CASH_SUMMARY",
        originalAmount: allocation.originalAmount || 0,
        remainingBalance: allocation.remainingBalance || 0,
        maxSettleableAmount: allocation.maxSettleableAmount,
        totalPayments: allocation.totalPayments || 0,
        totalMemos: allocation.totalMemos || 0,
        totalReturns: allocation.totalReturns || 0,
        transactionDate: allocation.transactionDate || "",
        dueDate: allocation.dueDate || "",
        agingDays: allocation.agingDays || 0,
        history: allocation.history || [],
    }));

    return { wallet, allocations };
}
