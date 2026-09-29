export interface ProductInfo {
    product_id: number;
    product_name: string;
    description?: string;
    product_code: string;
    uom: string;
    uom_count: number;
    brand: string;
    category: string;
}

export interface SalesInvoiceDetail {
    id: number;
    order_id: number;
    product: ProductInfo;
    quantity: number;
    unit_price: number;
    gross_amount: number;
    discount_type?: string | number | null;
    discount_amount: number;
    tax_amount?: number;
    net_amount: number;
}

export interface PaymentRecord {
    amount: number;
    method: string;
    reference: string;
    date: string;
}

export interface SalesmanOption {
    id: number;
    salesman_code: string;
    salesman_name: string;
}

export interface SalesInvoiceHeader {
    order_id: number;
    invoice_id: number;
    invoice_no: string;
    document_no: string;
    created_date?: string;
    date?: string;
    invoice_date: string;
    due_date?: string;
    document_type: "invoice" | "return";
    customer_id: string;
    customer_name: string;
    customer_code: string;
    customer_address: string;
    customer_tin: string;
    salesman_id?: number | null;
    salesman_code?: string;
    salesman_name?: string;
    sales_order_id?: number | null;
    sales_order_no?: string;
    branch_id?: number | null;
    branch_name?: string;
    branch_code?: string;
    payment_terms?: number | string | null;
    payment_term_name?: string;
    transaction_status?: string;
    gross_amount: number;
    discount_amount: number;
    vat_amount: number;
    net_amount: number;
    paid_amount: number;
    balance: number;
    status: "Unpaid" | "Paid" | "Partially Paid" | "Overdue" | "Cancelled";
    payment_history: PaymentRecord[];
    collection_posting_ref?: string | null;
    remarks: string;
}

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface FMInvoiceMetrics {
    totalBilled: number;
    totalCollected: number;
    accountsReceivable: number;
    totalVat: number;
}

export interface InvoiceFilterState {
    search: string;
    status: string;
    salesmanId: string;
    startDate: string;
    endDate: string;
}

export interface SalesInvoicePdf {
    id: number;
    sales_invoice_id: number;
    receipt_numbers?: string | null;
    pdf_file?: string | null;
    page?: number | null;
    width_mm?: number | null;
    height_mm?: number | null;
    created_at?: string | null;
    created_by?: number | null;
    updated_at?: string | null;
    updated_by?: number | null;
}

