export interface SalesOrder {
    order_id: number;
    order_no: string;
    po_no?: string;
    quotation_id?: number;
    customer_code: string;
    customer_name?: string;
    order_date: string;
    order_status: string;
    total_amount: number;
    net_amount: number;
    remarks: string;
    created_date: string;
    discount_amount?: number;
    delivery_date?: string;
    due_date?: string;
    payment_terms?: number;
    payment_term_name?: string;
    payment_term_days?: number;
    salesman_id?: number;
    branch_id?: number;
}

export interface SalesOrderDetail {
    detail_id: number;
    order_id: number;
    product_id: {
        product_id: number;
        product_name: string;
        product_code: string;
        uom: string;
        uom_count: number;
        brand: string;
        category: string;
    };
    unit_price: number;
    ordered_quantity: number;
    gross_amount?: number;
    discount_amount?: number;
    discount_type?: number | null;
    net_amount: number;
    bom_version_id?: number | null;
    bom_version_name?: string | null;
}

export interface DirectOrderItemPayload {
    parent_product_id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
    discount_type?: number | null;
    discount_amount?: number;
    bom_version_id?: number | null;
}

export interface CreateSalesOrderPayload {
    customerId: number;
    poNo: string;
    branchId: number;
    paymentTerms: number;
    deliveryDate: string;
    dueDate: string;
    salesmanId?: number;
    quotationId?: number;
    remarks?: string;
    items: DirectOrderItemPayload[];
    submitForApproval?: boolean;
}

export interface QuotationHeader {
    id: number;
    quote_number: string;
    customer_id: {
        customer_name: string;
        customer_code: string;
    } | null;
    total_selling_price: number;
    total_simulated_cost: number;
    quote_date: string;
    status: string;
    remarks: string;
}

