export interface Branch {
    id: number;
    branch_name: string;
    branch_code: string;
    isActive?: boolean | number;
    isBadStock?: boolean | number;
    bad_stock_branch_id?: number | Branch | null;
}

export interface StorageLot {
    lot_id: number;
    lot_name: string;
    lot_code?: string;
    inventory_type_id?: number | null;
    max_batch_capacity: number;
    occupiedQuantity?: number;
    availableQuantity?: number | null;
}

export interface ReceivingLotAllocationInput {
    storageLotId: string;
    quantity: number | string;
}

export interface Shipment {
    shipment_id: number;
    reference_number: string;
    status: string;
    total_php_value: string;
    created_at: string;
    inventory_status?: number | null;
    supplier_id: unknown;
    date_received: string;
    branch_id?: number | null;
    workflow_revision?: number;
}

export interface Product {
    product_id: number;
    product_name: string;
    product_code: string;
    description: string;
    unit_of_measurement?: {
        unit_id: number;
        unit_shortcut: string;
        unit_name: string;
    } | null;
    unit_of_measurement_count?: number | null;
    parent_id?: number | null;
    product_image?: string | null;
}

export interface ShipmentLineItem {
    line_id: number;
    shipment_id: unknown;
    product_id: Product; // Can be object when queried with fields relation
    quantity_ordered: number;
    quantity_received: number;
    quantity_rejected: number;
    previously_received_quantity?: number;
    previously_rejected_quantity?: number;
    remaining_quantity?: number;
    latest_receipt?: {
        receipt_number: string;
        received_quantity: number;
        accepted_quantity: number;
        rejected_quantity: number;
        supplier_batch_number: string;
        storage_lot_id: number | null;
        accepted_lot_allocations: Array<{ storage_lot_id: number; quantity: number }>;
        rejected_lot_allocations: Array<{ storage_lot_id: number; quantity: number }>;
        manufacturing_date: string | null;
        expiration_date: string | null;
        rejection_reason: string;
        qa_status: string;
        branch_id: number | null;
    } | null;
    base_unit_cost_php: number;
    lot_number?: string;
    batch_no?: string;
    lot_id?: number | null;
    manufacturing_date?: string | null;
    expiration_date?: string;
    branch_id?: number;
    rejection_reason?: string;
    qa_status?: string;
    purchase_intent?: "MRP_Demand" | "Buffer_Stock";
    job_order_id?: number | null;
}

export interface InspectionRow {
    receivedQty: number | string;
    acceptedQty: number | string;
    rejectedQty: number | string;
    batchNumber: string;
    lotId: string;
    manufacturingDate: string;
    expirationDate: string;
    rejectionReason: string;
    isPackaging: boolean;
    acceptedLotAllocations: ReceivingLotAllocationInput[];
    rejectedLotAllocations: ReceivingLotAllocationInput[];
}

export type QaSpecification = import("@/app/api/manufacturing/qa/_purchase-specification-domain").ProductQaSpecification;
export type QaSpecificationLoadStatus = "loading" | "loaded" | "error";

export interface QaSpecificationLoadState {
    status: QaSpecificationLoadStatus;
    specifications: QaSpecification[];
    error: string | null;
}

export type QaSpecificationReadings = Record<number, Record<number, string>>;

export type ReceivingDisposition = import("@/app/api/manufacturing/qa/_receiving-evaluation").ReceivingDisposition;
export type QaChecklistItemEvaluation = import("@/app/api/manufacturing/qa/_purchase-specification-domain").QaChecklistItemEvaluation;

export interface ReceivingQaEvaluation {
    lineId: number;
    disposition: ReceivingDisposition;
    receivedQuantity: number;
    acceptedQuantity: number;
    rejectedQuantity: number;
    forceRejected: boolean;
    rejectionReason: string | null;
    evaluations: QaChecklistItemEvaluation[];
    routes: ReceivingMovementRoute[];
}

export interface ReceivingPreview {
    shipmentId: number;
    receiptNumber: string;
    workflowRevision: number;
    postingEnabled: boolean;
    destinationBranch: { id: number; name: string; code: string };
    inspectorName: string;
    receiptMode: "full" | "partial";
    lines: ReceivingQaEvaluation[];
}

export interface ReceivingCommitPayload {
    contractVersion: "v1";
    workflowRevision: number;
    shipmentId: number;
    receiptNumber: string;
    receiptMode: "full" | "partial";
    destinationBranchId: number;
    lines: Array<{
        lineId: number;
        productId: number;
        receivedQuantity: number;
        acceptedQuantity: number;
        rejectedQuantity: number;
        storageLotId: number | null;
        acceptedLotAllocations: Array<{ storageLotId: number; quantity: number }>;
        rejectedLotAllocations: Array<{ storageLotId: number; quantity: number }>;
        supplierBatchNumber: string;
        manufacturingDate: string | null;
        expiryDate: string | null;
        remarks: string | null;
        isPackaging: boolean;
        readings: Array<{ specId: number; actualReading: string }>;
    }>;
}

export interface ReceivingCommitResult {
    mode: "compatibility";
    commitReference: string;
    shipmentId: number;
    status: "Partially Received" | "Received" | "Rejected";
    workflowRevision: number;
    idempotentReplay: boolean;
    receivingRecordIds: number[];
    inventoryLotIds: number[];
    allocationIds: number[];
    receiptNumbers: string[];
    receivingRecords: FinalReceivingRecord[];
    movements: FinalReceivingMovement[];
    allocations: FinalReceivingAllocation[];
}

export interface FinalReceivingRecord {
    receivingRecordId: number;
    lineId: number;
    shipmentId: number;
    productId: number;
    receiptNumber: string;
    branchId: number;
    storageLotId: number;
    batchNumber: string;
    receivedQuantity: number;
    rejectedQuantity: number;
    unitPrice: number;
    finalLandedUnitCost: number;
    qaStatus: string;
    expirationDate: string | null;
    receivedDate: string | null;
    inventoryLotIds: number[];
    qaResultIds: number[];
    allocationIds: number[];
}

export interface FinalReceivingMovement {
    movementId: number;
    lineId: number;
    kind: "Passed" | "Rejected";
    receivingLineId: number;
    inventoryLotId: number;
    productId: number;
    storageLotId: number;
    branchId: number;
    transactionTypeId: number;
    sourceDocumentNo: string;
    quantity: number;
}

export interface FinalReceivingAllocation {
    allocationId: number;
    lineId: number;
    receivingLineId: number;
    purchaseOrderReceivingId: number;
    jobOrderId: number;
    jobOrderMaterialId: number;
    productId: number;
    quantity: number;
    inventoryLotIds: number[];
}

export interface ReceivingMrpAllocationDraft {
    allocationId: null;
    receivingLineId: null;
    inventoryLotId: null;
    jobOrder: { id: number; number: string };
    jobOrderMaterialId: number;
    quantity: number;
}

export interface ReceivingMovementRoute {
    movementId: null;
    kind: "Passed" | "Rejected";
    qaStatus: "Passed" | "Rejected";
    quantity: number;
    branch: { id: number; name: string; code: string };
    transactionType: { id: number; name: string };
    receivingLineId: null;
    inventoryLotId: null;
    createdBy: number;
    sourceDocumentNo: string;
    storageLotId: number;
    storageLotName: string;
    supplierBatchNumber: string;
    manufacturingDate: string | null;
    expiryDate: string | null;
    remarks: string | null;
    allocationDrafts: ReceivingMrpAllocationDraft[];
    unallocatedQuantity: number;
}

export interface FIFOBatch {
    lot_number: string;
    expiration_date?: string;
    reception_date: string;
    received_qty: number;
    shipment_ref: string;
}

export interface FIFOInventoryItem {
    product: {
        product_id: number;
        product_name: string;
        product_code: string;
    };
    isPackaging: boolean;
    totalQty: number;
    batches: FIFOBatch[];
}
