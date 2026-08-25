import type { QaChecklistItemEvaluation } from "../qa/_purchase-specification-domain";
import type { ReceivingDisposition } from "../qa/_receiving-evaluation";
import type { ReceivingLotAllocation } from "./_lot-allocation";

export type ReceivingRouteKind = "Passed" | "Rejected";

export interface ReceivingRouteBranch {
    id: number;
    name: string;
    code: string;
}

export interface ReceivingRouteTransactionType {
    id: number;
    name: string;
}

export interface ReceivingMrpAllocationDraft {
    allocationId: null;
    receivingLineId: null;
    inventoryLotId: null;
    jobOrder: { id: number; number: string };
    jobOrderMaterialId: number;
    quantity: number;
}

export interface ReceivingMrpMaterialRequirement {
    jobOrderMaterialId: number;
    remainingQuantity: number;
}

export interface ReceivingMovementRoute {
    movementId: null;
    kind: ReceivingRouteKind;
    qaStatus: ReceivingRouteKind;
    quantity: number;
    storageLotId: number;
    storageLotName: string;
    supplierBatchNumber: string;
    manufacturingDate: string | null;
    expiryDate: string | null;
    branch: ReceivingRouteBranch;
    transactionType: ReceivingRouteTransactionType;
    receivingLineId: null;
    inventoryLotId: null;
    createdBy: number;
    sourceDocumentNo: string;
    remarks: string | null;
    allocationDrafts: ReceivingMrpAllocationDraft[];
    unallocatedQuantity: number;
}

export interface ReceivingPreviewLineResult {
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

export interface ReceivingPreviewResult {
    shipmentId: number;
    receivingTicketNumber: string | null;
    receiptDate: string;
    receiptType: "full" | "partial";
    processOverDelivery: boolean;
    workflowRevision: number;
    postingEnabled: boolean;
    destinationBranch: ReceivingRouteBranch;
    inspectorName: string;
    lines: ReceivingPreviewLineResult[];
}

interface RouteInput {
    acceptedQuantity: number;
    acceptedLotAllocations: ReceivingLotAllocation[];
    rejectedLotAllocations?: ReceivingLotAllocation[];
    storageLotNames: Record<number, string>;
    rejectedQuantity: number;
    createdBy: number;
    sourceDocumentNo: string;
    remarks: string | null;
    rejectionReason: string | null;
    allocationDrafts: ReceivingMrpAllocationDraft[];
    unallocatedQuantity: number;
}

export function buildMrpAllocationDrafts(
    acceptedQuantity: number,
    jobOrder: { id: number; number: string },
    requirements: ReceivingMrpMaterialRequirement[]
): { allocationDrafts: ReceivingMrpAllocationDraft[]; unallocatedQuantity: number } {
    let remainingAccepted = acceptedQuantity;
    const allocationDrafts: ReceivingMrpAllocationDraft[] = [];

    for (const requirement of [...requirements].sort((a, b) => a.jobOrderMaterialId - b.jobOrderMaterialId)) {
        const allocatable = Math.max(0, Number(requirement.remainingQuantity));
        const quantity = Math.min(remainingAccepted, allocatable);
        if (quantity <= 0) continue;
        allocationDrafts.push({
            allocationId: null,
            receivingLineId: null,
            inventoryLotId: null,
            jobOrder,
            jobOrderMaterialId: requirement.jobOrderMaterialId,
            quantity
        });
        remainingAccepted -= quantity;
        if (remainingAccepted <= 0) break;
    }

    return { allocationDrafts, unallocatedQuantity: remainingAccepted };
}

export function buildReceivingRoutes(
    input: RouteInput,
    passedBranch: ReceivingRouteBranch,
    rejectedBranch: ReceivingRouteBranch | null,
    passedTransactionType: ReceivingRouteTransactionType | null,
    rejectedTransactionType: ReceivingRouteTransactionType | null
): ReceivingMovementRoute[] {
    const shared = {
        movementId: null,
        receivingLineId: null,
        inventoryLotId: null,
        createdBy: input.createdBy,
        sourceDocumentNo: input.sourceDocumentNo
    } as const;
    const routes: ReceivingMovementRoute[] = [];

    if (input.acceptedQuantity > 0) {
        if (!passedTransactionType) throw new Error("Passed inventory routing is not configured.");
        input.acceptedLotAllocations.forEach((allocation, index) => {
            routes.push({
                ...shared,
                kind: "Passed",
                qaStatus: "Passed",
                quantity: allocation.quantity,
                branch: passedBranch,
                transactionType: passedTransactionType,
                storageLotId: allocation.storageLotId,
                storageLotName: input.storageLotNames[allocation.storageLotId] || "Unknown storage lot",
                supplierBatchNumber: allocation.batchNumber,
                manufacturingDate: allocation.manufacturingDate,
                expiryDate: allocation.expirationDate,
                remarks: input.remarks,
                allocationDrafts: index === 0 ? input.allocationDrafts : [],
                unallocatedQuantity: index === 0 ? input.unallocatedQuantity : 0
            });
        });
    }
    if (input.rejectedQuantity > 0) {
        if (!rejectedBranch || !rejectedTransactionType) {
            throw new Error("Rejected inventory routing is not configured.");
        }
        const rejectedLotAllocations = input.rejectedLotAllocations?.length
            ? input.rejectedLotAllocations
            : [];
        rejectedLotAllocations.forEach(allocation => {
            routes.push({
                ...shared,
                kind: "Rejected",
                qaStatus: "Rejected",
                quantity: allocation.quantity,
                branch: rejectedBranch,
                transactionType: rejectedTransactionType,
                storageLotId: allocation.storageLotId,
                storageLotName: input.storageLotNames[allocation.storageLotId] || "Unknown storage lot",
                supplierBatchNumber: allocation.batchNumber,
                manufacturingDate: allocation.manufacturingDate,
                expiryDate: allocation.expirationDate,
                remarks: input.rejectionReason || input.remarks,
                allocationDrafts: [],
                unallocatedQuantity: 0
            });
        });
    }
    return routes;
}
