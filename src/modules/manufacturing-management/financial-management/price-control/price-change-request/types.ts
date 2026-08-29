export type PCRStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type PriceChangeApplicationStatus = "SCHEDULED" | "APPLYING" | "APPLIED" | "FAILED" | "CANCELLED";
export type PCRDisplayStatus = PCRStatus | "SCHEDULED" | "APPLYING" | "FAILED";

export type PCRStatusFilter = PCRDisplayStatus | "ALL";

export type ApprovalKind = "price_batch" | "cost_batch" | "mixed_batch" | "price_type" | "list_price";

export type ApprovalTypeFilter = "all" | "price" | "cost";

export type PriceTypeRef = {
    price_type_id: number;
    price_type_name?: string;
};

export type UomRef = {
    unit_id?: number | string | null;
    unit_name?: string | null;
    unit_shortcut?: string | null;
};

export type ProductRef = {
    product_id: number;
    product_code?: string;
    product_name?: string;
    unit_of_measurement?: UomRef | number | string | null;
    list_price?: number | string | null;
    priceA?: number | string | null;
    priceB?: number | string | null;
    priceC?: number | string | null;
    priceD?: number | string | null;
    priceE?: number | string | null;
    cost_per_unit?: number | string | null;
    version_id?: number | string | null;
    version_name?: string | null;
};

export type PriceChangeRequestRow = {
    request_id: number;
    product_id: number | ProductRef;
    price_type_id: number | PriceTypeRef;
    proposed_price: number;
    status: PCRStatus;

    requested_by: number;
    requested_by_name?: string | null;
    requested_at: string;

    approved_by?: number | string | null;
    approved_at?: string | null;
    approved_by_name?: string | null;
    rejected_by?: number | string | null;
    rejected_at?: string | null;
    rejected_by_name?: string | null;
    reject_reason?: string | null;
    effective_at?: string | null;
    application_status?: PriceChangeApplicationStatus | string | null;
    applied_at?: string | null;
    applied_by?: number | string | null;
    applied_by_name?: string | null;

    header_id?:
        | number
        | {
              header_id?: number;
              id?: number;
              remarks?: string | null;
              reference_no?: string | null;
              status?: string | null;
          }
        | null;
    batch_header_id?: number | null;
    remarks?: string | null;
    reference_no?: string | null;
    current_price?: number | null;
    version_id?: number | null;
};

export type PriceChangeBatchStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type PriceChangeBatchLine = {
    request_id: number | null;
    product_id: number;
    product_name: string;
    product_code?: string;
    version_name?: string | null;
    price_type_id: number;
    price_type_name: string;
    current_price: number | null;
    proposed_price: number | null;
    delta: number | null;
    percent_change: number | null;
    status: PriceChangeBatchStatus | PCRStatus | string;
    supplier_name?: string | null;
    unit_name?: string | null;
    product_type_id?: number | null;
    product_type_name?: string | null;
    effective_at?: string | null;
    application_status?: PriceChangeApplicationStatus | string | null;
    applied_at?: string | null;
    applied_by?: number | string | null;
};

export type PriceChangeBatchHeader = {
    id: number;
    header_id: number;
    supplier_id: number | null;
    supplier_name?: string;
    reference_no?: string;
    remarks?: string;
    status: PriceChangeBatchStatus;
    requested_by?: number | string | null;
    requested_by_name?: string | null;
    requested_at?: string | null;
    approved_by?: number | string | null;
    approved_at?: string | null;
    approved_by_name?: string | null;
    rejected_by?: number | string | null;
    rejected_at?: string | null;
    rejected_by_name?: string | null;
    reject_reason?: string | null;
    effective_at?: string | null;
    application_status?: PriceChangeApplicationStatus | string | null;
    applied_at?: string | null;
    applied_by?: number | string | null;
    applied_by_name?: string | null;
    line_count?: number;
    product_types?: Array<{ id: number; name: string }>;
};

export type PriceChangeBatchDetail = PriceChangeBatchHeader & {
    details: PriceChangeBatchLine[];
};

export type CostChangeRequestRow = {
    request_id: number;
    product_id: number | ProductRef;
    current_cost?: number | null;
    proposed_cost: number;
    status: PCRStatus;

    requested_by: number;
    requested_by_name?: string | null;
    requested_at: string;

    approved_by?: number | string | null;
    approved_at?: string | null;
    approved_by_name?: string | null;

    rejected_by?: number | string | null;
    rejected_at?: string | null;
    rejected_by_name?: string | null;
    reject_reason?: string | null;
    effective_at?: string | null;
    application_status?: PriceChangeApplicationStatus | string | null;
    applied_at?: string | null;
    applied_by?: number | string | null;
    applied_by_name?: string | null;
    version_id?: number | null;
};

export type ListCostBatchStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type ListCostBatchLine = {
    request_id: number | null;
    product_id: number;
    product_name: string;
    product_code?: string;
    version_name?: string | null;
    current_cost: number | null;
    proposed_cost: number | null;
    delta: number | null;
    percent_change: number | null;
    status: ListCostBatchStatus | PCRStatus | string;
    supplier_name?: string | null;
    unit_name?: string | null;
    product_type_id?: number | null;
    product_type_name?: string | null;
    effective_at?: string | null;
    application_status?: PriceChangeApplicationStatus | string | null;
    applied_at?: string | null;
    applied_by?: number | string | null;
};

export type ListCostBatchHeader = {
    id: number;
    header_id: number;
    reference_no?: string;
    remarks?: string;
    status: ListCostBatchStatus;
    requested_by?: number | string | null;
    requested_by_name?: string | null;
    requested_at?: string | null;
    approved_by?: number | string | null;
    approved_at?: string | null;
    approved_by_name?: string | null;
    rejected_by?: number | string | null;
    rejected_at?: string | null;
    rejected_by_name?: string | null;
    reject_reason?: string | null;
    effective_at?: string | null;
    application_status?: PriceChangeApplicationStatus | string | null;
    applied_at?: string | null;
    applied_by?: number | string | null;
    applied_by_name?: string | null;
    line_count?: number;
    product_types?: Array<{ id: number; name: string }>;
};

export type ListCostBatchDetail = ListCostBatchHeader & {
    details: ListCostBatchLine[];
};

export type UnifiedBatchLine = {
    request_id: number | null;
    kind: "price_type" | "list_cost";
    product_id: number;
    product_name: string;
    product_code?: string;
    version_name?: string | null;
    unit_name?: string;
    price_type_id?: number;
    price_type_name?: string;
    product_type_id?: number | null;
    product_type_name?: string | null;
    current_price?: number | null;
    proposed_price?: number | null;
    current_cost?: number | null;
    proposed_cost?: number | null;
    delta: number | null;
    percent_change: number | null;
    status: string;
    effective_at?: string | null;
    application_status?: string | null;
    application_attempts?: number;
    application_error?: string | null;
    applied_at?: string | null;
    applied_by?: number | string | null;
};

export type UnifiedBatchDetail = {
    id: number;
    header_id: number;
    supplier_id: number | null;
    supplier_name: string;
    reference_no: string;
    remarks: string;
    status: string;
    requested_by: number | null;
    requested_by_name?: string | null;
    requested_at: string | null;
    approved_by?: number | string | null;
    approved_by_name?: string | null;
    approved_at?: string | null;
    rejected_by?: number | string | null;
    rejected_by_name?: string | null;
    rejected_at?: string | null;
    reject_reason?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
    application_attempts?: number;
    application_error?: string | null;
    retryable?: boolean;
    applied_at?: string | null;
    applied_by?: number | string | null;
    batch_types: Array<"PRICE_TYPE" | "LIST_COST">;
    price_details: UnifiedBatchLine[];
    cost_details: UnifiedBatchLine[];
    product_types?: Array<{ id: number; name: string }>;
};

export type PriceTypeUnifiedApprovalRow = PriceChangeRequestRow & {
    row_key: string;
    kind: "price_type";
    record_label: string;
    title: string;
    subtitle?: string;
    batch_header_id?: number | null;
    supplier_id?: number | null;
    supplier_name?: string | null;
    supplier_names?: string[];
};

export type ListPriceUnifiedApprovalRow = CostChangeRequestRow & {
    row_key: string;
    kind: "list_price";
    record_label: string;
    title: string;
    subtitle?: string;
    supplier_id?: number | null;
    supplier_name?: string | null;
    supplier_names?: string[];
};

export type ItemUnifiedApprovalRow = PriceTypeUnifiedApprovalRow | ListPriceUnifiedApprovalRow;

export type UnifiedBatchSummary = {
    line_count: number;
    total_products: number;
    proposed_min: number | null;
    proposed_max: number | null;
};

export type UnifiedApprovalRow =
    | {
          row_key: string;
          kind: "price_batch";
          record_label: string;
          title: string;
          subtitle?: string;
          status: PCRStatus;
          requested_at: string | null;
          requested_by?: number | string | null;
          requested_by_name?: string | null;
          line_count?: number;
          total_products?: number;
          proposed_min?: number | null;
          proposed_max?: number | null;
          proposed_price?: number | null;
          batch_id?: number;
          request_id?: number;
          supplier_id?: number | null;
          supplier_name?: string | null;
          supplier_names?: string[];
          effective_at?: string | null;
          application_status?: PriceChangeApplicationStatus | string | null;
          applied_at?: string | null;
      }
    | {
          row_key: string;
          kind: "mixed_batch";
          record_label: string;
          title: string;
          subtitle?: string;
          status: PCRStatus;
          requested_at: string | null;
          requested_by?: number | string | null;
          requested_by_name?: string | null;
          line_count?: number;
          total_products?: number;
          proposed_min?: number | null;
          proposed_max?: number | null;
          proposed_price?: number | null;
          proposed_cost?: number | null;
          batch_id?: number;
          request_id?: number;
          remarks?: string | null;
          reference_no?: string | null;
          supplier_id?: number | null;
          supplier_name?: string | null;
          supplier_names?: string[];
          batch_types?: Array<"PRICE_TYPE" | "LIST_COST">;
          price_line_count?: number;
          cost_line_count?: number;
          price_proposed_min?: number | null;
          price_proposed_max?: number | null;
          cost_proposed_min?: number | null;
          cost_proposed_max?: number | null;
          price_summary?: UnifiedBatchSummary | null;
          cost_summary?: UnifiedBatchSummary | null;
          effective_at?: string | null;
          application_status?: PriceChangeApplicationStatus | string | null;
          applied_at?: string | null;
      }
    | {
          row_key: string;
          kind: "cost_batch";
          record_label: string;
          title: string;
          subtitle?: string;
          status: PCRStatus;
          requested_at: string | null;
          requested_by?: number | string | null;
          requested_by_name?: string | null;
          line_count?: number;
          total_products?: number;
          proposed_min?: number | null;
          proposed_max?: number | null;
          proposed_cost?: number | null;
          batch_id?: number;
          request_id?: number;
          remarks?: string | null;
          reference_no?: string | null;
          supplier_id?: number | null;
          supplier_name?: string | null;
          supplier_names?: string[];
          effective_at?: string | null;
          application_status?: PriceChangeApplicationStatus | string | null;
          applied_at?: string | null;
      }
    | ItemUnifiedApprovalRow;

export type ApprovalRecordRow = PriceChangeRequestRow | CostChangeRequestRow | UnifiedApprovalRow;

export type ListMeta = {
    total_count?: number;
    actual_total_count?: number;
    result_window?: number;
    total_count_capped?: boolean;
};

export type ListQuery = {
    status?: PCRStatusFilter;
    q?: string;
    product_id?: number | "";
    supplier_ids?: number[];
    product_type_ids?: number[];
    price_type_id?: number | "";
    requested_by?: number | "";
    date_from?: string | "";
    date_to?: string | "";
    page?: number;
    page_size?: number;
};

export type CreatePriceChangeBatchPayload = {
    supplier_id: number;
    reference_no?: string;
    remarks: string;
    lines: Array<{
        product_id: number;
        price_type_id: number;
        current_price?: number | null;
        proposed_price: number;
    }>;
};

export type BatchImportProductCatalogRow = {
    product_id: number;
    product_name: string;
    parent_id?: number | null;
    product_code?: string | null;
    barcode?: string | null;
    __group_id?: number | null;
    unit_of_measurement?: number | null;
    price_per_unit?: number | null;
    priceA?: number | null;
    priceB?: number | null;
    priceC?: number | null;
    priceD?: number | null;
    priceE?: number | null;
};

export type BatchImportPrefill = {
    supplierId: number;
    supplierName: string;
    remarks: string;
    productCatalog: Map<number, BatchImportProductCatalogRow>;
    tierPriceMap: Map<string, number | null>;
    draftPrices: Map<string, string>;
    draftCosts: Map<number, string>;
    currentCostMap: Map<number, number | null>;
    importedProductIds: number[];
};

export type ListCostImportLine = {
    product_id: number;
    product_code: string | null;
    barcode: string | null;
    product_name: string;
    current_cost: number | null;
    proposed_cost: number;
};

export type ListCostImportPrefill = {
    supplierId: number;
    supplierName: string;
    remarks: string;
    lines: ListCostImportLine[];
};

export type CreateCCRPayload = {
    product_id: number;
    proposed_cost: number;
    current_cost?: number | null;
};

export type ActionPayload =
    | { action: "approve"; request_id: number; effective_at?: string | null }
    | { action: "cancel"; request_id: number }
    | { action: "reject"; request_id: number; reject_reason: string };

export type PriceActionPayload =
    | { action: "approve"; request_id: number; effective_at?: string | null }
    | { action: "cancel"; request_id: number }
    | { action: "reject"; request_id: number; reject_reason: string };

export type BulkCostActionPayload =
    | { action: "approve"; request_ids: number[]; effective_at?: string | null }
    | { action: "reject"; request_ids: number[]; reject_reason: string };

export type BulkCostActionResponse = Pick<
    BulkActionResult,
    "action" | "successIds" | "failedIds" | "failures"
>;

export type BulkActionFailure = {
    request_id: number;
    message: string;
};

export type BulkActionResult = {
    action: "approve" | "reject";
    successIds: number[];
    failedIds: number[];
    failures: BulkActionFailure[];
    unauthorized?: boolean;
};

/** @deprecated Use BulkActionResult */
export type ApproveManyResult = Pick<BulkActionResult, "successIds" | "failedIds">;

export type ListCostSelectionSnapshot = {
    request_id: number;
    record_label: string;
    product_label: string;
    current_cost: number | null;
    proposed_cost: number;
};

export type PriceTypeSelectionSnapshot = {
    request_id: number;
    record_label: string;
    product_label: string;
    price_type_label: string;
    batch_header_id: number;
    batch_label: string;
    current_price: number | null;
    proposed_price: number;
};
