export type {
    IncomingShipment as PurchaseOrder,
    ShipmentLineItem as PurchaseOrderLine,
    Supplier,
    RawMaterial,
    LinkedProduct,
    PurchaseOrderPaymentMode,
    PurchaseOrderPriceTypeRule
} from "../procurement/types";
import type { PurchaseOrderPaymentMode, PurchaseOrderPriceTypeRule } from "../procurement/types";
import type { PurchaseOrderRevisionSnapshot } from "./revision-snapshot";

export type { PurchaseOrderRevisionSnapshot } from "./revision-snapshot";

export interface PurchaseOrderListMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface PurchaseOrderListResponse<T> {
    data: T[];
    meta: PurchaseOrderListMeta;
}

export interface PurchaseOrderListQuery {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    sort?: "date_encoded" | "purchase_order_no" | "reference" | "total_amount" | "inventory_status";
    direction?: "asc" | "desc";
    approvalStage?: PurchaseOrderDecisionStage;
}

export interface PurchaseOrderCatalog {
    suppliers: Array<{ id: number; supplier_name: string }>;
    branches: Array<{ id: number; branch_name: string; branch_code?: string }>;
    paymentTypes: Array<{ id: number; payment_name?: string; name?: string }>;
    paymentModes: PurchaseOrderPaymentMode[];
    paymentTerms: Array<{
        id: number;
        payment_name: string;
        payment_days?: number | null;
        payment_description?: string | null;
    }>;
    jobOrders: Array<{ job_order_id: number; job_order_no?: string }>;
    priceTypeRules: PurchaseOrderPriceTypeRule[];
}

export interface PurchaseOrderDraftPayload {
    externalReference?: string;
    remark?: string;
    supplierId: number;
    branchId: number;
    paymentArrangementId: number;
    paymentModeId: number;
    paymentTermsId: number;
    currencyCode: "PHP" | "USD";
    exchangeRate: number;
    expectedTotals: {
        grossPhp: number;
        discountPhp: number;
        vatPhp: number;
        withholdingPhp: number;
        netPhp: number;
        netForeign: number;
    };
    lines: Array<{
        productId: number;
        parentProductId?: number | null;
        purchaseIntent: "MRP_Demand" | "Buffer_Stock";
        jobOrderId: number | null;
        quantity: number;
        unitPrice: number;
        discountMode: "Percentage" | "Fixed Amount";
        discountPercent: number;
        discountAmount: number;
        vatPercent: number;
        withholdingPercent: number;
    }>;
}

export interface PurchaseOrderPriceControlWarning {
    code: "PRICE_MATRIX_NOT_CONFIGURED";
    priceTypeId: number;
    missingProductIds: number[];
    usingEnteredPrices: true;
}

export interface PurchaseOrderDraftResponse {
    success: true;
    purchaseOrderId: number;
    purchaseOrderNo: string;
    status: string;
    currencyCode: "PHP" | "USD";
    exchangeRate: number | string;
    priceType: string;
    priceTypeId: number;
    priceControlWarning: PurchaseOrderPriceControlWarning | null;
    totals: {
        grossPhp: number | string;
        discountPhp: number | string;
        vatPhp: number | string;
        withholdingPhp: number | string;
        netPhp: number | string;
        netForeign: number | string;
    };
}

export interface PurchaseOrderRevisionResponse {
    success: true;
    purchaseOrderId: number;
    status: string;
    workflowRevision: number;
    priceControlWarning: PurchaseOrderPriceControlWarning | null;
}

export type PurchaseOrderApprovalStage = "Finance" | "Complete" | "Rejected";
export type PurchaseOrderDecisionStage = "Finance";

export interface PurchaseOrderApprovalHistory {
    history_id: number;
    action: string;
    approval_stage: "Plant" | "Finance" | "System";
    actor_id: number;
    actor_name: string;
    actor_role_id?: number | null;
    remarks?: string | null;
    from_inventory_status?: number | null;
    to_inventory_status?: number | null;
    revision_before: number;
    revision_after: number;
    revision_snapshot?: PurchaseOrderRevisionSnapshot | null;
    created_at: string;
}

export interface PurchaseOrderApprovalDetail {
    order: {
        purchase_order_id: number;
        purchase_order_no?: string | null;
        reference?: string | null;
        supplier_name?: number | string | { id?: number | string } | null;
        branch_id?: number | null;
        payment_type?: number | null;
        payment_mode?: number | null;
        price_type?: string | null;
        remark?: string | null;
        inventory_status: number;
        payment_status?: number | null;
        payment_terms?: number | null;
        total_amount?: number | string | null;
        gross_amount?: number | string | null;
        currency_code?: string | null;
        exchange_rate?: number | string | null;
        total_foreign_currency?: number | string | null;
        workflow_revision?: number | null;
        lead_time_receiving?: string | null;
        approver_id?: number | null;
        finance_id?: number | null;
        date_approved?: string | null;
        date_financed?: string | null;
    };
    stage: PurchaseOrderApprovalStage;
    pendingStages?: PurchaseOrderDecisionStage[];
    matchedRule: {
        ruleId: number;
        ruleName: string;
        requiresFinance: boolean;
        allowSelfApproval: boolean;
        snapshot: boolean;
    };
    categoryIds: number[];
    history: PurchaseOrderApprovalHistory[];
}

export interface PurchaseOrderApprovalCommand {
    action: "approve" | "reject" | "cancel";
    workflowRevision: number;
    expectedRuleId?: number;
    remarks?: string;
}
