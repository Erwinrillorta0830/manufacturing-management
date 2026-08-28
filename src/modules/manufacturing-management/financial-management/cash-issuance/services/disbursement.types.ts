export type DirectusList<T> = {
    data?: T[];
    meta?: {
        filter_count?: number;
    };
};

export type RelationValue = number | string | null | {
    id?: unknown;
    division_id?: unknown;
    department_id?: unknown;
    coa_id?: unknown;
    user_id?: unknown;
    supplier_name?: unknown;
    division_name?: unknown;
    department_name?: unknown;
    account_title?: unknown;
};

export type DisbursementRow = {
    id?: unknown;
    doc_no?: unknown;
    transaction_type?: unknown;
    payee?: RelationValue;
    remarks?: unknown;
    total_amount?: unknown;
    paid_amount?: unknown;
    encoder_id?: RelationValue;
    submitted_by?: RelationValue;
    approver_id?: RelationValue;
    released_date?: string | null;
    posted_by?: RelationValue;
    isPosted?: unknown;
    transaction_date?: unknown;
    date_created?: unknown;
    date_submitted?: unknown;
    date_approved?: unknown;
    date_released?: unknown;
    date_posted?: unknown;
    division_id?: RelationValue;
    department_id?: RelationValue;
    fund_source_id?: unknown;
    status?: unknown;
    supporting_documents_url?: unknown;
};

export type DisbursementDraftDocRow = {
    doc_no?: unknown;
};

export type DisbursementPaymentState =
    | "UNPAID"
    | "ALLOCATED"
    | "PARTIALLY_RELEASED"
    | "RELEASED";

export type PayableRow = {
    id?: unknown;
    disbursement_id?: unknown;
    division_id?: RelationValue;
    reference_no?: unknown;
    date?: unknown;
    coa_id?: RelationValue;
    amount?: unknown;
    remarks?: unknown;
};

export type PaymentRow = {
    id?: unknown;
    disbursement_id?: unknown;
    coa_id?: RelationValue;
    bank_id?: unknown;
    check_no?: unknown;
    date?: unknown;
    amount?: unknown;
    remarks?: unknown;
    released_date?: unknown;
};

export type SupplierRow = {
    id?: unknown;
};

export interface PayableInput {
    id?: number;
    divisionId?: number;
    referenceNo?: string;
    date?: string;
    coaId?: number;
    amount?: number;
    remarks?: string;
}

export interface PaymentInput {
    id?: number;
    coaId?: number;
    bankId?: number;
    checkNo?: string;
    date?: string;
    amount?: number;
    remarks?: string;
    releasedDate?: string;
    releasedBy?: string;
}

export type ComparableLine = {
    divisionId: number | null;
    referenceNo?: string | null;
    date?: string | null;
    coaId: number | null;
    bankId?: number | null;
    checkNo?: string | null;
    amount: number;
    remarks?: string | null;
};

export type ComparableDisbursement = {
    transactionTypeId: number | null;
    payeeId: number | null;
    remarks: string | null;
    totalAmount: number;
    transactionDate: string | null;
    departmentId: number | null;
    fundSourceId: number | null;
    supportingDocumentsUrl: string | null;
    payables: ComparableLine[];
    payments: ComparableLine[];
};

export interface NormalizedPayable {
    id: number | undefined;
    divisionId: number | undefined;
    divisionName: string;
    referenceNo: string;
    date: string;
    coaId: number | undefined;
    accountTitle: string;
    amount: number;
    remarks: string;
}

export interface NormalizedPayment {
    id: number | undefined;
    coaId: number | undefined;
    accountTitle: string;
    bankId: number | undefined;
    bankName: string | undefined;
    bankAccountNumber: string | undefined;
    checkNo: string;
    date: string;
    amount: number;
    remarks: string;
    releasedDate: string;
    releasedBy: string | undefined;
}

export interface NormalizedDisbursement {
    id: number;
    docNo: string;
    payeeId: number | undefined;
    transactionTypeId: 1 | 2 | undefined;
    transactionTypeName: string;
    payeeName: string;
    remarks: string;
    totalAmount: number;
    paidAmount: number;
    paymentState: DisbursementPaymentState;
    totalDebit: number;
    totalCredit: number;
    balance: number;
    encoderName: string;
    submittedByName: string;
    approverName: string;
    releasedByName: string;
    postedByName: string;
    encoderId: number | undefined;
    submittedById: number | undefined;
    approverId: number | undefined;
    releasedById: number | undefined;
    postedById: number | undefined;
    isPosted: number;
    transactionDate: string;
    dateCreated: string;
    dateSubmitted: string;
    dateApproved: string;
    dateReleased: string;
    datePosted: string;
    divisionId: number | undefined;
    departmentId: number | undefined;
    divisionName: string;
    departmentName: string;
    fundSourceId: number | undefined;
    status: string;
    supportingDocumentsUrl: string;
    payables: NormalizedPayable[];
    payments: NormalizedPayment[];
}
