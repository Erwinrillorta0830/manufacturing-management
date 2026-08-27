export interface Branch {
    id: number;
    branch_name: string;
    branch_code: string;
    isActive?: boolean | number;
    isBadStock?: boolean | number;
    bad_stock_branch_id?: number | Branch | null;
}

export type ReceivingQuantityStatus = "FULL" | "PARTIAL" | "REJECTED";

export type SupplierDocumentTypeCode = "SI" | "OR" | "DR";

export interface SupplierDocumentType {
    id: number;
    code: SupplierDocumentTypeCode;
    label: string;
}

export interface StorageLot {
    lot_id: number;
    lot_name: string;
    lot_code?: string;
    inventory_type_id?: number | null;
    product_type_id?: number | null;
    product_category_type?: "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOODS";
    unit_id?: number | null;
    max_batch_capacity: number | null;
    occupiedQuantity?: number;
    availableQuantity?: number | null;
    remainingCapacity?: number | null;
}

export interface StorageLotBatch {
    batchNumber: string;
    manufacturingDate: string | null;
    expirationDate: string | null;
}

export interface ReceivingLotAllocationInput {
    /** Client-only identity used to keep allocation rows stable while editing. */
    clientId: string;
    storageLotId: string;
    batchNumber: string;
    manufacturingDate: string;
    expirationDate: string;
    quantity: number | string;
}

export interface Shipment {
    shipment_id: number;
    reference_number: string;
    status: string;
    total_php_value: string;
    created_at: string;
    inventory_status?: number | null;
    payment_status?: number | null;
    supplier_id: unknown;
    date_received: string;
    branch_id?: number | null;
    workflow_revision?: number;
    isForceReceived?: boolean;
    forceReceivedAt?: string | null;
    forceReceivedBy?: number | null;
    forceReceivedByName?: string | null;
    forceReceivedReason?: string | null;
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
    category_type?: "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOODS";
}

export interface ShipmentLineItem {
    line_id: number;
    shipment_id: unknown;
    product_id: Product; // Can be object when queried with fields relation
    category_type?: "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOODS";
    quantity_ordered: number;
    quantity_received: number;
    quantity_rejected: number;
    previously_received_quantity?: number;
    previously_rejected_quantity?: number;
    previously_accepted_quantity?: number;
    remaining_quantity?: number;
    remaining_accepted_quantity?: number;
    is_over_received?: boolean;
    over_delivery_quantity?: number;
    latest_receipt?: {
        receipt_number: string;
        receipt_date?: string | null;
        received_quantity: number;
        accepted_quantity: number;
        rejected_quantity: number;
        supplier_batch_number: string;
        storage_lot_id: number | null;
        accepted_lot_allocations: Array<{
            storage_lot_id: number;
            batch_number?: string;
            manufacturing_date?: string | null;
            expiration_date?: string | null;
            quantity: number;
        }>;
        rejected_lot_allocations: Array<{
            storage_lot_id: number;
            batch_number?: string;
            manufacturing_date?: string | null;
            expiration_date?: string | null;
            quantity: number;
        }>;
        manufacturing_date: string | null;
        expiration_date: string | null;
        rejection_reason: string;
        qa_status: string;
        branch_id: number | null;
        is_over_received: boolean;
        over_delivery_quantity: number;
        supplier_document_type_id: number | null;
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
    rejectedQty: number;
    rejectionReason: string;
    isPackaging: boolean;
    acceptedLotAllocations: ReceivingLotAllocationInput[];
    rejectedLotAllocations: ReceivingLotAllocationInput[];
}

export interface OverDeliveryLine {
    lineId: number;
    productName: string;
    receivedQuantity: number;
    remainingQuantity: number;
    overDeliveryQuantity: number;
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
export type QuarantineDisposition = import("@/app/api/manufacturing/qa-receiving/_quarantine-disposition").QuarantineDisposition;
export type QuarantineStock = import("@/app/api/manufacturing/qa-receiving/_quarantine-disposition").QuarantineStock;

export interface ReceivingQaEvaluation {
    lineId: number;
    previouslyReceivedQuantity: number;
    previouslyAcceptedQuantity: number;
    remainingQuantity: number;
    remainingAcceptedQuantity: number;
    overDeliveryQuantity: number;
    isOverReceived: boolean;
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
    replacementDispositionId?: number | null;
    receivingTicketNumber: string | null;
    receiptDate: string;
    supplierDocumentTypeId: number | null;
    supplierDocumentType: SupplierDocumentType | null;
    quantityStatus: ReceivingQuantityStatus;
    processOverDelivery: boolean;
    workflowRevision: number;
    postingEnabled: boolean;
    destinationBranch: { id: number; name: string; code: string };
    inspectorName: string;
    lines: ReceivingQaEvaluation[];
}

export interface ReceivingCommitPayload {
    contractVersion: "v1";
    workflowRevision: number;
    shipmentId: number;
    replacementDispositionId?: number | null;
    receiptNumber: string;
    receiptDate: string;
    supplierDocumentTypeId: number | null;
    processOverDelivery: boolean;
    destinationBranchId: number;
    lines: Array<{
        lineId: number;
        productId: number;
        receivedQuantity: number;
        acceptedQuantity: number;
        rejectedQuantity: number;
        acceptedLotAllocations: Array<{
            storageLotId: number;
            batchNumber: string;
            manufacturingDate: string | null;
            expirationDate: string | null;
            quantity: number;
        }>;
        rejectedLotAllocations: Array<{
            storageLotId: number;
            batchNumber: string;
            manufacturingDate: string | null;
            expirationDate: string | null;
            quantity: number;
        }>;
        remarks: string | null;
        isPackaging: boolean;
        readings: Array<{ specId: number; actualReading: string }>;
    }>;
}

export interface ReceivingCommitResult {
    mode: "compatibility";
    commitReference: string;
    receivingTicketNumber: string;
    receiptDate: string;
    shipmentId: number;
    status: "Partially Received" | "Received" | "Rejected";
    quantityStatus: ReceivingQuantityStatus;
    supplierDocumentTypeId: number | null;
    paymentStatus?: number | null;
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
    isOverReceived: boolean;
    overDeliveryQuantity: number;
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
    batchNumber?: string;
    manufacturingDate?: string | null;
    expirationDate?: string | null;
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

export interface ForceReceivedLineResult {
    lineId: number;
    orderedQuantity: number;
    receivedQuantity: number;
    acceptedQuantity: number;
    remainingQuantity: number;
    remainingAcceptedQuantity: number;
}

export interface ForceReceivedResult {
    shipmentId: number;
    status: "Received";
    inventoryStatus: number;
    paymentStatus: number;
    workflowRevision: number;
    isForceReceived: true;
    forceReceivedAt: string | null;
    forceReceivedBy: number;
    forceReceivedByName: string;
    forceReceivedReason: string | null;
    idempotent: boolean;
    lines: ForceReceivedLineResult[];
}
