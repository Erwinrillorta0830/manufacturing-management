"use client";

// --- AUTH & USER ---
export interface CurrentUser {
    id: string;
    name: string;
    email: string;
}

// 🚀 NEW: Simplified UserDto for the UI
export interface UserDto {
    id: number | string;
    firstName: string;
    lastName: string;
    email?: string;
    position?: string;
    department?: number;
    name?: string; // Optional: Combines first & last for easy dropdown rendering
}

// --- MASTER DATA ---
export interface Bank {
    id: number;
    bankName: string;
}

export interface COA {
    id?: number;
    coaId?: number;
    glCode: string;
    accountTitle: string;
    isPayment?: boolean | number;
    isPaymentDuplicate?: boolean;
}

export interface Salesman {
    id: number | string;
    salesmanCode: string;
    salesmanName: string;
}

export interface Denomination {
    id: number;
    amount: number; // Face value (1000, 500, etc.)
}

export interface PaymentMethod {
    methodId: number | string;
    methodName: string;
    coaId?: number | string;
}

export interface Customer {
    id: number | string;
    customerCode?: string;
    code?: string;
    customerName?: string;
    name?: string;
}

// --- CASHIERING / POUCH MODULE ---
export interface CollectionSummary {
    id: number;
    docNo: string;
    date: string;
    encodedDate: string;
    collectedBy?: unknown;
    salesmanCode: string;
    salesmanName: string;
    amount: number;
    appliedAmount: number;
    status: string;
    isPosted?: boolean | number;
    isCancelled?: boolean | number;
    crNo?: string;
    remarks?: string;
}

export interface PaginatedCollectionResponse {
    content: CollectionSummary[];
    totalElements: number;
    totalPages: number;
    currentPage: number;
}

export interface CheckDetail {
    tempId: string;
    coaId: string;
    bankId: string;
    checkNo: string;
    amount: string;
    chequeDate: string;
    paymentMethodId?: string;
    customerId?: string;
    invoiceId?: string;
}

export interface CashBucketDto {
    amount?: number;
    paymentMethod?: string;
    balanceTypeId?: number;
    referenceNo?: string;
    bankName?: string;
    checkNo?: string;
    checkDate?: string;
    tempId?: string;
    denominationId?: number;
    quantity?: number;
    coaId?: number;
    paymentMethodId?: number;
    bankId?: number;
    customerCode?: string | null;
    invoiceId?: number | null;
    chequeDate?: string | null;
}

export interface CashieringRequestDto {
    id?: number;
    salesmanId: number | string;
    collectedBy?: number | string; // 🚀 Added
    crNo?: string;                 // 🚀 Added
    collectionDate: string;
    remarks: string;
    cashBuckets: CashBucketDto[];
    allocations: SettlementAllocation[];
}

// --- AR SETTLEMENT & FORENSICS ---
export interface PaymentHistory {
    date: string;
    type: string;
    reference: string;
    amount: number;
}

export interface UnpaidInvoice {
    id: number;
    invoiceId?: number; // Added for backwards compatibility in UI
    invoiceNo: string;
    customerCode?: string;
    customerName: string;
    transactionDate: string;
    dueDate: string;
    agingDays: number;

    // FORENSIC TOTALS
    originalAmount: number;
    totalPayments: number;
    totalMemos: number;
    totalReturns: number;
    remainingBalance: number;
    maxSettleableAmount?: number;

    // AUDIT TRAIL
    history?: PaymentHistory[];

    matchSource?: "invoice" | "customer" | "collection_check";
    matchedCheckNo?: string;
    matchedCheckAmount?: number;
    matchedCollectionDetailId?: number;
    matchedCollectionCustomerName?: string;
}

export interface UnpaidInvoiceSearchResponse {
    items: UnpaidInvoice[];
    hasMore: boolean;
    nextCursor: number | null;
}

export interface SettlementAllocation {
    invoiceId: number;
    invoiceNo: string;
    customerCode?: string;
    customerName: string;
    transactionDate: string;
    dueDate: string;
    agingDays: number;

    // FORENSIC DATA
    originalAmount: number;
    totalPayments: number;
    totalMemos: number;
    totalReturns: number;
    remainingBalance: number;
    maxSettleableAmount?: number;

    // HISTORY POPUP
    history?: PaymentHistory[];

    // CURRENT SESSION DATA
    amountApplied: number;
    allocationType: string;
    sourceTempId: string;
}

// --- STATE & PAYLOADS ---
export interface CashieringState {
    isSheetOpen: boolean;
    setIsSheetOpen: (open: boolean) => void;
    isLoading: boolean;
    isLookupsLoading: boolean;
    isSheetLoading: boolean;
    isSubmitting: boolean;
    submissionError: string | null;
    listError: string | null;
    editingId: number | null;
    masterList: CollectionSummary[];
    totalElements: number;
    totalPages: number;
    currentPage: number;
    salesmen: Salesman[];
    users: UserDto[];                // 🚀 Added: List of users for the dropdown
    banks: Bank[];
    coas: COA[];
    paymentMethods: PaymentMethod[];
    customers: Customer[];
    customerInvoices: Record<string, UnpaidInvoice[]>;
    routeInvoices: UnpaidInvoice[];

    salesmanId: string;
    setSalesmanId: (id: string) => void;

    collectedBy: string;             // 🚀 Added
    setCollectedBy: (id: string) => void; // 🚀 Added

    crNo: string;                    // 🚀 Added
    setCrNo: (val: string) => void;  // 🚀 Added

    collectionDate: string;
    setCollectionDate: (date: string) => void;
    remarks: string;
    setRemarks: (remarks: string) => void;
    denominations: Record<number, number>;
    handleDenomChange: (id: number, qty: string) => void;
    denominationMaster: Denomination[];
    checks: CheckDetail[];
    addCheck: () => void;
    updateCheck: (index: number, field: keyof CheckDetail, value: string) => void;
    removeCheck: (index: number) => void;
    handlePaymentMethodSelect: (index: number, methodId: string) => void;
    handleCustomerSelect: (index: number, customerId: string) => void;
    handleInvoiceSelect: (index: number, invoiceId: string) => void;
    totalCash: number;
    totalChecks: number;
    grandTotal: number;
    handleSubmit: () => Promise<void>;
    loadPouchForEdit: (id: number) => Promise<void>;
    resetForm: () => void;
    refreshList: () => Promise<void>;
    loadModalLookups: () => Promise<void>;
}

export interface NewAdjustmentDto {
    findingId?: number;
    amount: number;
    balanceTypeId: number;
    remarks: string;
    invoiceId: number | null;
    tempId: string;
}

export interface NewEwtDto {
    amount: number;
    referenceNo: string;
    tempId: string;
}

export interface SettlementPayload {
    newAdjustments: NewAdjustmentDto[];
    newEwts: NewEwtDto[];
    allocations: SettlementAllocation[];
}
