export interface Branch {
    id: number;
    branch_name: string;
    branch_code: string;
}

export interface SalesOrderListItem {
    order_id: number;
    order_no: string;
    po_no: string;
    customer_code: string;
    customer_name: string;
    branch_id: number;
    branch_name: string;
    branch_code?: string;
    order_date: string;
    delivery_date: string | null;
    order_status: string;
    total_amount: number;
    item_count: number;
    total_ordered_quantity: number;
    total_allocated_quantity: number;
    linked_job_orders_count: number;
    readiness_status?: "Ready" | "Pending";
    remarks: string;
    created_date: string | null;
}

export interface JobOrderAllocationInfo {
    allocation_id: number;
    job_order_id: number;
    job_order_no: string;
    status: string;
    target_quantity: number;
    actual_quantity_produced: number;
    completed_quantity: number;
    allocated_quantity: number;
    effective_produced_for_order: number;
    start_date: string | null;
    end_date: string | null;
}

export interface SalesOrderDetailLine {
    detail_id: number;
    order_id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    description: string;
    unit_name: string;
    bom_version_id: number | null;
    bom_version_name: string | null;
    ordered_quantity: number;
    allocated_quantity: number;
    unit_price: number;
    gross_amount: number;
    net_amount: number;
    remarks: string;
    live_onhand_quantity: number;
    onhand_error: string | null;
    total_produced_quantity: number;
    meets_by_onhand: boolean;
    meets_by_production: boolean;
    is_ready: boolean;
    shortage_quantity: number;
    job_orders: JobOrderAllocationInfo[];
}

export interface OrderReadiness {
    can_proceed_to_consolidation: boolean;
    readiness_summary: string;
    total_items_count: number;
    ready_items_count: number;
    blockers: string[];
}

export interface SalesOrderDetailData {
    header: SalesOrderListItem;
    lines: SalesOrderDetailLine[];
    readiness: OrderReadiness;
}

export interface ProceedResponse {
    success: boolean;
    message: string;
    order_id?: number;
    order_status?: string;
    for_consolidation_at?: string;
    unfulfilledItems?: string[];
}

export interface FetchSalesOrdersParams {
    branchId?: number | null;
    search?: string;
    page?: number;
    pageSize?: number;
}

export interface PaginatedSalesOrdersResponse {
    data: SalesOrderListItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

