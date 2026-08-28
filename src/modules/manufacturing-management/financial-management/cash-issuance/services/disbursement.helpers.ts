import {
    DisbursementRow,
    PayableRow,
    PaymentRow,
    RelationValue,
    DisbursementPaymentState,
    PayableInput,
    ComparableLine,
    ComparableDisbursement,
    NormalizedDisbursement,
    NormalizedPayable,
    NormalizedPayment,
} from "./disbursement.types";

export function cleanSupportingDocsUrl(urlOrUuid: string | null | undefined): string | null {
    if (!urlOrUuid) return null;
    const trimmed = urlOrUuid.trim();
    if (trimmed.includes("/")) {
        const lastPart = trimmed.split("/").pop();
        if (lastPart) {
            return lastPart.split("?")[0];
        }
    }
    return trimmed;
}

export function normalizeDisbursementStatus(value: unknown) {
    switch (asString(value).trim().toUpperCase()) {
        case "DRAFT": return "Draft";
        case "SUBMITTED": return "Submitted";
        case "APPROVED": return "Approved";
        case "PARTIALLY RELEASED": return "Partially Released";
        case "RELEASED": return "Released";
        case "POSTED": return "Posted";
        case "RETURNED FOR REVISION": return "Returned for Revision";
        default: return asString(value).trim() || "Draft";
    }
}

export function resolveDisbursementPaymentState(input: {
    status: string;
    totalAmount: number;
    paidAmount: number;
    isPosted: number;
}): DisbursementPaymentState {
    const paidAmount = Math.max(0, input.paidAmount);
    const totalAmount = Math.max(0, input.totalAmount);
    const normalizedStatus = normalizeDisbursementStatus(input.status);

    if (paidAmount <= 0) return "UNPAID";
    if (input.isPosted === 1 || normalizedStatus === "Posted") {
        return totalAmount > 0 && paidAmount + 0.01 < totalAmount
            ? "PARTIALLY_RELEASED"
            : "RELEASED";
    }
    if (normalizedStatus === "Partially Released") return "PARTIALLY_RELEASED";
    if (normalizedStatus === "Released") return "RELEASED";

    return "ALLOCATED";
}

export function findMissingPayableDateError(lines: PayableInput[]) {
    const invalidRow = lines.findIndex((line) => typeof line.date !== "string" || line.date.trim() === "");
    return invalidRow >= 0 ? `Invoice Date is required on payable row ${invalidRow + 1}.` : null;
}

export function asString(value: unknown) {
    return value == null ? "" : String(value);
}

export function asNumber(value: unknown) {
    if (value == null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export function relationId(
    value: RelationValue | undefined,
    key: "id" | "division_id" | "department_id" | "coa_id" | "user_id" = "id",
) {
    if (value == null || typeof value !== "object") return asNumber(value);
    return asNumber((value as Record<string, unknown>)[key] ?? value.id);
}

export function relationLabel(
    value: RelationValue | undefined,
    key: "supplier_name" | "division_name" | "department_name" | "account_title",
) {
    if (value == null || typeof value !== "object") return "";
    return asString((value as Record<string, unknown>)[key]);
}

export function roundMoney(value: number) {
    return Math.round(value * 100) / 100;
}

function comparableNumber(value: unknown): number | null {
    const parsed = asNumber(value);
    return parsed == null ? null : parsed;
}

function comparableText(value: unknown): string | null {
    const text = asString(value).trim();
    return text || null;
}

function comparableDate(value: unknown): string | null {
    const text = comparableText(value);
    return text ? text.split("T")[0] : null;
}

function comparableLine(line: {
    divisionId?: unknown;
    referenceNo?: unknown;
    date?: unknown;
    coaId?: unknown;
    bankId?: unknown;
    checkNo?: unknown;
    amount?: unknown;
    remarks?: unknown;
}): ComparableLine {
    return {
        divisionId: comparableNumber(line.divisionId),
        referenceNo: comparableText(line.referenceNo),
        date: comparableDate(line.date),
        coaId: comparableNumber(line.coaId),
        bankId: comparableNumber(line.bankId),
        checkNo: comparableText(line.checkNo),
        amount: roundMoney(Number(line.amount) || 0),
        remarks: comparableText(line.remarks),
    };
}

export function canonicalizeDisbursementPayload(input: {
    transactionTypeId?: unknown;
    payeeId?: unknown;
    remarks?: unknown;
    totalAmount?: unknown;
    transactionDate?: unknown;
    departmentId?: unknown;
    fundSourceId?: unknown;
    supportingDocumentsUrl?: unknown;
    payables?: Array<{
        divisionId?: unknown;
        referenceNo?: unknown;
        date?: unknown;
        coaId?: unknown;
        amount?: unknown;
        remarks?: unknown;
    }>;
    payments?: Array<{
        coaId?: unknown;
        bankId?: unknown;
        checkNo?: unknown;
        date?: unknown;
        amount?: unknown;
        remarks?: unknown;
    }>;
}): string {
    const comparable: ComparableDisbursement = {
        transactionTypeId: comparableNumber(input.transactionTypeId),
        payeeId: comparableNumber(input.payeeId),
        remarks: comparableText(input.remarks),
        totalAmount: roundMoney(Number(input.totalAmount) || 0),
        transactionDate: comparableDate(input.transactionDate),
        departmentId: comparableNumber(input.departmentId),
        fundSourceId: comparableNumber(input.fundSourceId),
        supportingDocumentsUrl: cleanSupportingDocsUrl(asString(input.supportingDocumentsUrl)),
        payables: (input.payables || []).map((line) => comparableLine(line)),
        payments: (input.payments || []).map((line) => comparableLine(line)),
    };

    return JSON.stringify(comparable);
}

export function canonicalizePersistedDisbursement(row: DisbursementRow, payables: PayableRow[], payments: PaymentRow[]) {
    return canonicalizeDisbursementPayload({
        transactionTypeId: row.transaction_type,
        payeeId: relationId(row.payee),
        remarks: row.remarks,
        totalAmount: row.total_amount,
        transactionDate: row.transaction_date,
        departmentId: relationId(row.department_id, "department_id"),
        fundSourceId: relationId(row.fund_source_id as RelationValue),
        supportingDocumentsUrl: row.supporting_documents_url,
        payables: payables.map((line) => ({
            divisionId: relationId(line.division_id, "division_id"),
            referenceNo: line.reference_no,
            date: line.date,
            coaId: relationId(line.coa_id, "coa_id"),
            amount: line.amount,
            remarks: line.remarks,
        })),
        payments: payments.map((line) => ({
            coaId: relationId(line.coa_id, "coa_id"),
            bankId: relationId(line.bank_id as RelationValue),
            checkNo: line.check_no,
            date: line.date,
            amount: line.amount,
            remarks: line.remarks,
        })),
    });
}

export function resolveTransactionTypeId(type: unknown, docNo?: unknown): 1 | 2 | null {
    const normalizedType = asNumber(type);
    if (normalizedType === 1 || normalizedType === 2) return normalizedType;

    const normalizedDocNo = asString(docNo).trim().toUpperCase();
    if (normalizedDocNo.startsWith("TR-")) return 1;
    if (normalizedDocNo.startsWith("NT-")) return 2;
    return null;
}

export function transactionTypeName(type: unknown, docNo?: unknown) {
    const normalizedType = resolveTransactionTypeId(type, docNo);
    if (normalizedType === 1) return "Trade";
    if (normalizedType === 2) return "Non-Trade";
    return "Unknown";
}

export function normalizeDisbursement(
    row: DisbursementRow,
    payables: PayableRow[],
    payments: PaymentRow[],
    userMap: Map<string, string>,
    coaMap: Map<number, string>,
    divisionMap: Map<number, string>,
    bankMap: Map<number, { bankName: string; accountNumber: string }>
): NormalizedDisbursement {
    const totalAmount = asNumber(row.total_amount) || 0;
    const paidAmount = asNumber(row.paid_amount) || 0;
    const isPosted = asNumber(row.isPosted) || 0;
    const status = normalizeDisbursementStatus(row.status);
    
    let totalDebit = 0;
    let totalCredit = 0;
    
    const normalizedPayables = payables.map((p): NormalizedPayable => {
        const amount = asNumber(p.amount) || 0;
        if (amount > 0) totalDebit += amount;
        else totalCredit += Math.abs(amount);
        
        return {
            id: asNumber(p.id),
            divisionId: relationId(p.division_id, "division_id"),
            divisionName: relationLabel(p.division_id, "division_name") || (relationId(p.division_id, "division_id") ? divisionMap.get(relationId(p.division_id, "division_id") as number) || "" : ""),
            referenceNo: asString(p.reference_no),
            date: asString(p.date),
            coaId: relationId(p.coa_id, "coa_id"),
            accountTitle: relationLabel(p.coa_id, "account_title") || (relationId(p.coa_id, "coa_id") ? coaMap.get(relationId(p.coa_id, "coa_id") as number) || "" : ""),
            amount,
            remarks: asString(p.remarks),
        };
    });
    
    const normalizedPayments = payments.map((p): NormalizedPayment => {
        const amount = asNumber(p.amount) || 0;
        totalCredit += Math.abs(amount);
        
        const bankId = relationId(p.bank_id as RelationValue);
        const bankData = bankId ? bankMap.get(bankId) : undefined;
        
        return {
            id: asNumber(p.id),
            coaId: relationId(p.coa_id, "coa_id"),
            accountTitle: relationLabel(p.coa_id, "account_title") || (relationId(p.coa_id, "coa_id") ? coaMap.get(relationId(p.coa_id, "coa_id") as number) || "" : ""),
            bankId,
            bankName: bankData?.bankName,
            bankAccountNumber: bankData?.accountNumber,
            checkNo: asString(p.check_no),
            date: asString(p.date),
            amount,
            remarks: asString(p.remarks),
            releasedDate: asString(p.released_date),
            releasedBy: undefined,
        };
    });
    
    return {
        id: asNumber(row.id) || 0,
        docNo: asString(row.doc_no),
        payeeId: relationId(row.payee),
        transactionTypeId: resolveTransactionTypeId(row.transaction_type, row.doc_no) ?? undefined,
        transactionTypeName: transactionTypeName(row.transaction_type, row.doc_no),
        payeeName: relationLabel(row.payee, "supplier_name"),
        remarks: asString(row.remarks),
        totalAmount,
        paidAmount,
        paymentState: resolveDisbursementPaymentState({ status, totalAmount, paidAmount, isPosted }),
        totalDebit: roundMoney(totalDebit),
        totalCredit: roundMoney(totalCredit),
        balance: roundMoney(totalDebit - totalCredit),
        encoderName: userMap.get(String(relationId(row.encoder_id, "user_id"))) || "",
        submittedByName: userMap.get(String(relationId(row.submitted_by, "user_id"))) || "",
        approverName: userMap.get(String(relationId(row.approver_id, "user_id"))) || "",
        releasedByName: userMap.get(String(relationId(row.posted_by, "user_id"))) || "",
        postedByName: userMap.get(String(relationId(row.posted_by, "user_id"))) || "",
        encoderId: relationId(row.encoder_id, "user_id"),
        submittedById: relationId(row.submitted_by, "user_id"),
        approverId: relationId(row.approver_id, "user_id"),
        releasedById: relationId(row.posted_by, "user_id"),
        postedById: relationId(row.posted_by, "user_id"),
        isPosted,
        transactionDate: asString(row.transaction_date),
        dateCreated: asString(row.date_created),
        dateSubmitted: asString(row.date_submitted),
        dateApproved: asString(row.date_approved),
        dateReleased: asString(row.date_released),
        datePosted: asString(row.date_posted),
        divisionId: relationId(row.division_id, "division_id"),
        departmentId: relationId(row.department_id, "department_id"),
        divisionName: relationLabel(row.division_id, "division_name"),
        departmentName: relationLabel(row.department_id, "department_name"),
        fundSourceId: relationId(row.fund_source_id as RelationValue),
        status,
        supportingDocumentsUrl: cleanSupportingDocsUrl(asString(row.supporting_documents_url)) || "",
        payables: normalizedPayables,
        payments: normalizedPayments,
    };
}
