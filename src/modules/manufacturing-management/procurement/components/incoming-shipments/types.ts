import React from "react";
import { IncomingShipment, ShipmentLineItem, Supplier, RawMaterial, LinkedProduct } from "../../types";

export interface ManifestLineFormItem {
    product_id: string;
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
    discount_percent?: string;
    vat_percent?: string;
    withholding_percent?: string;
}

export interface ShipmentFormState {
    reference_number: string;
    supplier_id: string;
    exchange_rate: string;
    total_foreign_currency: string;
    total_php_value: string;
    status: "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "En Route" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected";
    date_received: string;
    branch_id: number | null;
    payment_type: number | null;
    price_type: string | null;
    currency_code?: "PHP" | "USD";
    workflow_revision?: number;
}

export interface IncomingShipmentsProps {
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
    onUpdateShipmentStatus: (shipmentId: number, status: "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "En Route" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected") => void;
    loading?: boolean;
    listLoading?: boolean;
    serverList?: {
        total: number;
        totalPages: number;
        onQueryChange: (query: { page: number; limit: number; search: string; status?: string }) => void;
    };
    canonicalDrafting?: boolean;
    jobOrders?: Array<{ job_order_id: number; job_order_no?: string }>;
}
