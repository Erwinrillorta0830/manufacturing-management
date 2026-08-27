// src/modules/financial-management/accounting/customers-memo/types.ts

export interface CompanyProfile {
    company_id: number;
    company_name?: string | null;
    company_type?: string | null;
    company_code?: string | null;
    company_address?: string | null;
    company_brgy?: string | null;
    company_city?: string | null;
    company_province?: string | null;
    company_zipCode?: string | null;
    company_registrationNumber?: string | null;
    company_tin?: string | null;
    company_dateAdmitted?: string | null;
    company_contact?: string | null;
    company_email?: string | null;
    company_logo?: string | null;
}

export interface Supplier {
    id: number;
    supplier_name: string;
    supplier_shortcut: string;
}

export interface Customer {
    id: number;
    customer_name: string;
    customer_code: string;
    store_name?: string;
    brgy?: string;
    city?: string;
    province?: string;
}

export interface Salesman {
    id: number;
    salesman_name: string;
    salesman_code: string;
}

export interface ChartOfAccount {
    coa_id: number;
    gl_code: string;
    account_title: string;
    balance_type: number;
}

export interface CollectionLookupRow {
    collectionId: number;
    collectionNo: string;
    invoiceNo: string;
    totalAmount: number; // Collection Total
    netAmount: number;   // Invoice Total
    invoiceDate: string;
    customerName: string;
    salesmanName: string;
    supplierName: string;
    collectionDetailId: number;
    isPosted: number;
}

export interface GroupedCollection {
    collectionId: number;
    collectionNo: string;
    totalAmount: number;
    isPosted: number;
    invoices: CollectionLookupRow[];
}

export interface MemoHeader {
    memo_number: string;
    supplier_id: number | null;
    customer_id: number | null;
    salesman_id: number | null;
    chart_of_account: number | null;
    amount: number;
    reason: string;
    status?: string;
    type: number;
}

export interface InvoiceAllocation {
    invoiceId: number;
    invoiceNo: string;
    appliedAmount: number;
}

export interface CollectionAllocation {
    collectionId: number;
    collectionNo: string;
    allocatedAmount: number;
    invoices: InvoiceAllocation[];
}

export interface MemoSavePayload {
    header: MemoHeader;
    history: {
        collectionId: number;
        amount: number; // total allocated to this collection
        invoices: {
            invoiceId: number;
            amount: number; // applied to this invoice
        }[];
    }[];
}
export interface MemoApprovalRow {
    id: number;
    memo_number: string;
    amount: number;
    applied_amount: number;
    reason: string;
    status: string;
    created_at: string;
    supplier_id: { id: number, supplier_name: string };
    customer_id: { id: number, customer_name: string, store_name?: string, brgy?: string, city?: string, province?: string };
    salesman_id: { id: number, salesman_code: string, salesman_name: string };
    chart_of_account: { coa_id: number, gl_code: string, account_title: string };
    encoder_id: { user_fname: string, user_lname: string } | null;
    type: number;
}

export interface DetailedMemoInvoice {
    amount: number;
    date_applied: string | null;
    invoice_id: {
        invoice_no: string;
        invoice_date: string | null;
        due_date: string | null;
        net_amount: number | null;
    } | null;
}

export interface DetailedMemoCollection {
    amount: number;
    collection_id: {
        id: number;
        docNo: string;
    };
}

export interface DetailedMemo {
    header: MemoApprovalRow;
    collections: DetailedMemoCollection[];
    invoices: DetailedMemoInvoice[];
}
