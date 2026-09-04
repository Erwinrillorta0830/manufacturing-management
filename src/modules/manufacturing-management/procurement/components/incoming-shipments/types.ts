import React from "react";
import { IncomingShipment, ShipmentLineItem, Supplier, RawMaterial, LinkedProduct, PurchaseOrderPaymentMode, PurchaseOrderPriceTypeRule } from "../../types";
import { normalizeProductRelationId } from "../../product-relation";

export type PurchaseOrderMaterialType = "raw_material" | "packaging" | "finished_goods";
export type PurchaseOrderCategoryType = "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOODS";

export type FxRateStatus = "idle" | "loading" | "ready" | "error";

export const PURCHASE_ORDER_MATERIAL_TYPE_OPTIONS: Array<{
    value: PurchaseOrderMaterialType;
    label: string;
    productTypeId: number;
}> = [
    { value: "raw_material", label: "Raw Material", productTypeId: 389 },
    { value: "packaging", label: "Packaging Item", productTypeId: 390 },
    { value: "finished_goods", label: "Finished Goods", productTypeId: 388 }
];

export function purchaseOrderMaterialTypeFromProductType(
    productType: number | string | null | undefined
): PurchaseOrderMaterialType | "" {
    const normalizedProductType = Number(productType);
    return PURCHASE_ORDER_MATERIAL_TYPE_OPTIONS.find(option => option.productTypeId === normalizedProductType)?.value || "";
}

export function purchaseOrderCategoryTypeFromMaterialType(
    materialType: PurchaseOrderMaterialType | "" | undefined
): PurchaseOrderCategoryType | "" {
    if (materialType === "raw_material") return "RAW_MATERIAL";
    if (materialType === "packaging") return "PACKAGING";
    if (materialType === "finished_goods") return "FINISHED_GOODS";
    return "";
}

export function purchaseOrderMaterialTypeFromCategoryType(
    categoryType: PurchaseOrderCategoryType | null | undefined
): PurchaseOrderMaterialType | "" {
    if (categoryType === "RAW_MATERIAL") return "raw_material";
    if (categoryType === "PACKAGING") return "packaging";
    if (categoryType === "FINISHED_GOODS") return "finished_goods";
    return "";
}

export function purchaseOrderMaterialTypeFromProduct(
    product: RawMaterial | null | undefined,
    rawMaterials: RawMaterial[]
): PurchaseOrderMaterialType | "" {
    const ownType = purchaseOrderMaterialTypeFromProductType(product?.product_type);
    if (ownType) return ownType;
    const parentId = normalizeProductRelationId(product?.parent_id);
    const parent = parentId === null
        ? undefined
        : rawMaterials.find(material => normalizeProductRelationId(material.product_id) === parentId);
    return purchaseOrderMaterialTypeFromProductType(parent?.product_type);
}

export interface ManifestLineFormItem {
    product_id: string;
    material_type?: PurchaseOrderMaterialType | "";
    category_type?: PurchaseOrderCategoryType | "";
    quantity_ordered: string;
    base_unit_cost_php: string;
    parent_product_id: string;
    product_name?: string;
    product_code?: string;
    selected_uom?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    uom_options?: any[];
    purchase_intent?: "MRP_Demand" | "Buffer_Stock";
    job_order_id?: string;
    discount_type_id?: string | number;
    discount_mode?: "Percentage" | "Fixed Amount";
    discount_amount?: string;
    discount_percent?: string;
    vat_percent?: string;
    withholding_percent?: string;
}

export interface ShipmentFormState {
    reference_number: string;
    remark?: string;
    supplier_id: string;
    exchange_rate: string;
    total_foreign_currency: string;
    total_php_value: string;
    status: "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected";
    date_received: string;
    branch_id: number | null;
    payment_type: number | null;
    payment_mode: number | null;
    payment_terms?: number | null;
    delivery_terms: string;
    price_type: string | null;
    currency_code?: "PHP" | "USD";
    workflow_revision?: number;
}

export interface IncomingShipmentsProps {
    displayMode?: "split" | "queue" | "detail" | "create";
    backHref?: string;
    onExitCreate?: () => void;
    shipments: IncomingShipment[];
    suppliers: Supplier[];
    rawMaterials: RawMaterial[];
    supplierLinkedProducts: LinkedProduct[];
    selectedShipment: IncomingShipment | null;
    setSelectedShipment: (s: IncomingShipment | null) => void;
    lines: ShipmentLineItem[];
    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
    shipmentForm: ShipmentFormState;
    setShipmentForm: React.Dispatch<React.SetStateAction<ShipmentFormState>>;
    linesForm: ManifestLineFormItem[];
    setLinesForm: React.Dispatch<React.SetStateAction<ManifestLineFormItem[]>>;
    onCreateShipment: (e: React.FormEvent) => void;
    onTriggerAllocation: (s: IncomingShipment) => void;
    onEditShipment: (shipmentId: number, shipmentData: ShipmentFormState, lineItems: ManifestLineFormItem[]) => void | Promise<boolean | void>;
    onCancelRejectedPurchaseOrder?: (shipmentId: number, workflowRevision: number, remarks?: string) => void | Promise<boolean>;
    onUpdateShipmentStatus: (shipmentId: number, status: "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected") => void;
    loading?: boolean;
    listLoading?: boolean;
    detailLoading?: boolean;
    listError?: string | null;
    detailError?: string | null;
    referenceError?: string | null;
    onRetryList?: () => void;
    onRetryDetail?: () => void;
    serverList?: {
        total: number;
        totalPages: number;
        onQueryChange: (query: { page: number; limit: number; search: string; status?: string }) => void;
    };
    canonicalDrafting?: boolean;
    jobOrders?: Array<{ job_order_id: number; job_order_no?: string }>;
    paymentTerms?: Array<{
        id: number;
        payment_name: string;
        payment_days?: number | null;
        payment_description?: string | null;
    }>;
    paymentModes?: PurchaseOrderPaymentMode[];
    priceTypeRules?: PurchaseOrderPriceTypeRule[];
}
