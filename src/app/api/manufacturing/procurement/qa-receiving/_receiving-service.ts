import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers, procurementDirectusFetch } from "../_directus";
import { evaluateShelfLife, INVENTORY_STATUS, PAYMENT_STATUS, paymentStatusAllowsReceivingHandoff, receiptDateAtManilaMidnight } from "../_domain";
import { forceReceivedIntakeMessage } from "../../qa-receiving/_force-received";
import { receivingSubmissionSchema } from "../_schemas";
import {
    deriveRejectedQuantity,
    evaluateOverDelivery,
    validateReceivingQuantities
} from "../../qa/_receiving-evaluation";
import {
    normalizeReceivingLotAllocations,
    normalizeRejectedLotAllocations,
    receivingLotAllocationError,
    rejectedLotAllocationError
} from "../../qa-receiving/_lot-allocation";
import { calculateLandedCostAllocations, fetchShipmentExpenses, normalizeAllocationMethod } from "../expenses/expenses-helper";
import {
    ProductWeightValidationError,
    resolveProductWeightBreakdown
} from "@/modules/manufacturing-management/procurement/packaging-weight";
import { receiptNumberForLine, type FinalReceivingAllocation } from "../../qa-receiving/_commit-contract";
import { summarizeReceivingHistory } from "../../qa-receiving/_receiving-history";
import { evaluateReceivingStatus, RECEIVING_STATUS_EPSILON } from "../../qa-receiving/_receiving-status";
import { sumMovementQuantitiesByStorageLot } from "../../qa-receiving/_movement-stock";
import {
    legacyToMmLotMap,
    loadMmLotMappings,
    loadMmLots,
    loadMovementRowsForLotRefs,
    MmLotCompatibilityError
} from "../../qa-receiving/_mm-lot-compat";
import { QuarantineDispositionError, validateReplacementContext } from "../../qa-receiving/_quarantine-disposition";
import { resolvePurchaseOrderBranchId } from "../../qa-receiving/_purchase-order-branch";
import { ensureQaResults, QaResultPersistenceError } from "./_qa-results";
import { resolveProductCategoryTypes, type PurchaseOrderCategoryType } from "../_category-type";
import { ReceivingDocumentTypeError, validateReceivingDocumentType } from "../../qa-receiving/_supplier-document-type";
import { resolveBaseUnitCostPhp, resolveLandedCostCurrency } from "../landed-cost/_domain";
import {
    allocationCapacityKey,
    capacityAuditsEqual,
    evaluateLotCapacities,
    normalizeLotCapacity,
    readLotCapacityAudit,
    type LotCapacityAllocationAudit,
    type LotCapacityAllocationInput,
    type LotCapacityAudit
} from "../../qa-receiving/_lot-capacity";

class ReceivingError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

interface ReceivingPostOptions {
    actorUserId: number;
    receivingHeaderId?: number;
    replacementDispositionId?: number | null;
}

interface MrpAllocationDraft {
    line_id: number;
    product_id: number;
    job_order_id: number;
    job_order_material_id: number;
    quantity: number;
}

interface AllocationChange {
    allocationId: number;
    materialId: number;
    previousReservedQuantity: number;
    parentUpdated: boolean;
    created: boolean;
}

interface DirectusMovementType {
    transaction_type_id?: unknown;
    type_name?: unknown;
    direction?: unknown;
    origin_table?: unknown;
}

interface FinalReceivingMovement {
    movementId: number;
    lineId: number;
    kind: "Passed" | "Rejected";
    receivingLineId: number;
    inventoryLotId: number;
    productId: number;
    storageLotId: number;
    mmLotId: number | null;
    legacyLotId: number | null;
    branchId: number;
    transactionTypeId: number;
    sourceDocumentNo: string;
    quantity: number;
    batchNumber: string;
    manufacturingDate: string | null;
    expirationDate: string | null;
    capacityOverride: boolean;
    capacityAvailableBeforeReceipt: number | null;
    capacityOverrideQuantity: number;
}

interface PendingMovement extends Omit<FinalReceivingMovement, "movementId"> {
    payload: Record<string, unknown>;
}

const activeShipments = new Set<number>();

function relationId(value: unknown, key: string): number {
    return Number(value && typeof value === "object" ? (value as Record<string, unknown>)[key] : value);
}

function relationValueId(value: unknown, keys: string[]): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const nested = relationValueId(record[key], keys);
            if (nested !== null) return nested;
        }
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function movementTypeId(movementTypes: DirectusMovementType[], typeName: string): number {
    const matches = movementTypes.filter(type =>
        type.type_name === typeName
        && type.direction === "IN"
        && type.origin_table === "purchase_order_receiving"
    );
    const id = matches.length === 1 ? Number(matches[0].transaction_type_id) : 0;
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new ReceivingError(`Inventory movement type "${typeName}" is not configured uniquely.`, 503);
    }
    return id;
}

function movementKey(row: {
    receivingLineId: number;
    branchId: number;
    transactionTypeId: number;
    storageLotId: number;
    quantity: number;
    batchNumber: string;
}): string {
    return `${row.receivingLineId}:${row.branchId}:${row.transactionTypeId}:${row.storageLotId}:${row.batchNumber.trim().toLowerCase()}:${row.quantity}`;
}

async function loadMovementRows(receivingLineIds: number[]) {
    if (receivingLineIds.length === 0) return [];
    const params = new URLSearchParams({
        "filter[source_document_id][_in]": receivingLineIds.join(","),
        fields: "movement_id,source_document_id,branch_id,transaction_type_id,mm_lot_id,lot_id,batch_no,manufacturing_date,expiry_date,quantity,version_id,is_capacity_override,capacity_available_before_receipt,capacity_override_quantity",
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/inventory_movements?${params.toString()}`, {
        headers,
        cache: "no-store"
    });
    if (!response.ok) throw new Error("Failed to reconcile inventory movements.");
    return ((await response.json()).data || []) as Record<string, unknown>[];
}

function finalizeMovements(pending: PendingMovement[], rows: Record<string, unknown>[]): FinalReceivingMovement[] | null {
    if (rows.length !== pending.length) return null;
    const movementByKey = new Map<string, { movementId: number; audit: LotCapacityAudit }>();
    for (const row of rows) {
        if (row.version_id !== null) return null;
        const movementId = Number(row.movement_id);
        const key = movementKey({
            receivingLineId: relationId(row.source_document_id, "purchase_order_product_id"),
            branchId: relationId(row.branch_id, "id"),
            transactionTypeId: relationId(row.transaction_type_id, "transaction_type_id"),
            storageLotId: relationValueId(row.mm_lot_id, ["lot_id", "id"]) || relationId(row.lot_id, "lot_id"),
            quantity: Number(row.quantity),
            batchNumber: String(row.batch_no || "")
        });
        const audit = readLotCapacityAudit(row);
        if (!Number.isSafeInteger(movementId) || movementId <= 0 || movementByKey.has(key) || !audit) return null;
        movementByKey.set(key, { movementId, audit });
    }
    const finalized = pending.map(draft => {
        const persisted = movementByKey.get(movementKey(draft));
        return persisted && capacityAuditsEqual(draft, persisted.audit)
            ? { ...draft, movementId: persisted.movementId }
            : null;
    });
    return finalized.every((movement): movement is PendingMovement & { movementId: number } => Boolean(movement))
        ? finalized.map(({ payload, ...movement }) => {
            void payload;
            return movement;
        })
        : null;
}

async function mutate(collection: string, id: number, method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    return fetch(`${DIRECTUS_URL}/items/${collection}/${id}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
}

async function directusFailure(response: Response): Promise<string> {
    const body = await response.text();
    const detail = body.trim();
    return detail ? ` (${response.status}): ${detail.slice(0, 500)}` : ` (${response.status})`;
}

async function rollbackAllocations(changes: AllocationChange[]) {
    for (const change of [...changes].reverse()) {
        if (change.parentUpdated) {
            const materialRestore = await mutate("manufacturing_job_order_materials", change.materialId, "PATCH", {
                reserved_quantity: change.previousReservedQuantity
            });
            if (!materialRestore.ok) return false;
        }
        if (change.created) {
            const allocationDelete = await mutate(
                "manufacturing_job_order_materials_reservations",
                change.allocationId,
                "DELETE"
            );
            if (!allocationDelete.ok) return false;
        }
    }
    return true;
}

async function persistMrpAllocations(
    drafts: MrpAllocationDraft[],
    receivingByLine: Map<number, number>,
    inventoryLotIdsByLine: Map<number, number[]>,
    actorUserId: number,
    changes: AllocationChange[]
): Promise<FinalReceivingAllocation[]> {
    const persisted: FinalReceivingAllocation[] = [];

    for (const draft of drafts) {
        if (draft.quantity <= 0) continue;
        const receivingLineId = receivingByLine.get(draft.line_id);
        if (!receivingLineId) {
            throw new ReceivingError(`Receiving record for MRP line ${draft.line_id} could not be correlated.`, 409);
        }

        const existingParams = new URLSearchParams({
            "filter[purchase_order_receiving_id][_eq]": String(receivingLineId),
            "filter[jo_material_id][_eq]": String(draft.job_order_material_id),
            fields: "jo_materials_reservation_id,product_id,jo_material_id,purchase_order_receiving_id,reserved_quantity,actual_used_quantity",
            limit: "-1"
        });
        const existingResponse = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?${existingParams.toString()}`,
            { headers, cache: "no-store" }
        );
        if (!existingResponse.ok) throw new Error("Failed to verify existing MRP allocations.");
        const existingRows = ((await existingResponse.json()).data || []) as Record<string, unknown>[];
        if (existingRows.length > 1) {
            throw new ReceivingError(`Multiple MRP allocations already exist for receiving line ${receivingLineId} and material ${draft.job_order_material_id}. Reconciliation is required.`, 409);
        }

        const existing = existingRows[0];
        if (existing) {
            const allocationId = Number(existing.jo_materials_reservation_id || existing.id);
            const existingQuantity = Number(existing.reserved_quantity || 0);
            if (!Number.isSafeInteger(allocationId) || allocationId <= 0 || Number(existing.product_id) !== draft.product_id || Math.abs(existingQuantity - draft.quantity) > 1e-9) {
                throw new ReceivingError(`The existing MRP allocation for receiving line ${receivingLineId} does not match the preview. Reconciliation is required.`, 409);
            }
            persisted.push({
                allocationId,
                lineId: draft.line_id,
                receivingLineId,
                purchaseOrderReceivingId: receivingLineId,
                jobOrderId: draft.job_order_id,
                jobOrderMaterialId: draft.job_order_material_id,
                productId: draft.product_id,
                quantity: existingQuantity,
                inventoryLotIds: inventoryLotIdsByLine.get(draft.line_id) || []
            });
            continue;
        }

        const materialResponse = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_job_order_materials/${draft.job_order_material_id}?fields=jo_material_id,job_order_id,product_id,allocated_quantity,reserved_quantity`,
            { headers, cache: "no-store" }
        );
        if (!materialResponse.ok) throw new ReceivingError(`Job-order material ${draft.job_order_material_id} no longer exists.`, 409);
        const material = (await materialResponse.json()).data as Record<string, unknown>;
        const allocatedQuantity = Number(material.allocated_quantity || 0);
        const currentReservedQuantity = Number(material.reserved_quantity || 0);
        if (Number(material.job_order_id) !== draft.job_order_id || Number(material.product_id) !== draft.product_id || !Number.isFinite(allocatedQuantity) || !Number.isFinite(currentReservedQuantity) || currentReservedQuantity + draft.quantity > allocatedQuantity + 1e-9) {
            throw new ReceivingError(`The MRP requirement for material ${draft.job_order_material_id} changed after preview. Generate a new preview before receiving.`, 409);
        }

        const allocationCreate = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                product_id: draft.product_id,
                jo_material_id: draft.job_order_material_id,
                purchase_order_receiving_id: receivingLineId,
                reserved_quantity: draft.quantity,
                actual_used_quantity: 0,
                created_by: actorUserId
            })
        });
        if (!allocationCreate.ok) {
            throw new Error(`Failed to create MRP allocation for material ${draft.job_order_material_id}${await directusFailure(allocationCreate)}`);
        }
        const allocationRow = (await allocationCreate.json()).data as Record<string, unknown>;
        const allocationId = Number(allocationRow.jo_materials_reservation_id || allocationRow.id);
        if (!Number.isSafeInteger(allocationId) || allocationId <= 0) throw new Error("Directus did not return the created MRP allocation ID.");

        const change: AllocationChange = {
            allocationId,
            materialId: draft.job_order_material_id,
            previousReservedQuantity: currentReservedQuantity,
            parentUpdated: false,
            created: true
        };
        changes.push(change);
        const materialUpdate = await mutate("manufacturing_job_order_materials", draft.job_order_material_id, "PATCH", {
            reserved_quantity: currentReservedQuantity + draft.quantity
        });
        if (!materialUpdate.ok) throw new Error(`Failed to update reserved quantity for material ${draft.job_order_material_id}.`);
        change.parentUpdated = true;

        persisted.push({
            allocationId,
            lineId: draft.line_id,
            receivingLineId,
            purchaseOrderReceivingId: receivingLineId,
            jobOrderId: draft.job_order_id,
            jobOrderMaterialId: draft.job_order_material_id,
            productId: draft.product_id,
            quantity: draft.quantity,
            inventoryLotIds: inventoryLotIdsByLine.get(draft.line_id) || []
        });
    }

    return persisted;
}

export async function handleQaReceivingPost(request: Request, options: ReceivingPostOptions) {
    let lockedShipmentId: number | null = null;
    try {
        const parsed = receivingSubmissionSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid receiving submission.", details: parsed.error.flatten() }, { status: 400 });
        }
        if (!Number.isSafeInteger(options.actorUserId) || options.actorUserId <= 0) {
            throw new ReceivingError("The receiving user could not be verified.", 401);
        }

        const {
            shipmentId,
            replacementDispositionId: submittedReplacementDispositionId,
            referenceNumber,
            receiptDate,
            supplierDocumentTypeId: submittedSupplierDocumentTypeId,
            processOverDelivery,
            branchId: submittedBranchId,
            lineItemUpdates: submittedLineItemUpdates
        } = parsed.data;
        const replacementDispositionId = submittedReplacementDispositionId ?? options.replacementDispositionId ?? null;
        const supplierDocumentTypeId = submittedSupplierDocumentTypeId ?? null;
        try {
            await validateReceivingDocumentType(supplierDocumentTypeId, Boolean(replacementDispositionId));
        } catch (error) {
            if (error instanceof ReceivingDocumentTypeError) throw new ReceivingError(error.message, error.statusCode);
            throw error;
        }
        if (submittedReplacementDispositionId && options.replacementDispositionId && submittedReplacementDispositionId !== options.replacementDispositionId) {
            throw new ReceivingError("The replacement disposition context does not match the receiving request.", 409);
        }
        const replacementContext = replacementDispositionId
            ? await validateReplacementContext({
                dispositionId: replacementDispositionId,
                shipmentId,
                lines: submittedLineItemUpdates.map(item => ({
                    lineId: item.line_id,
                    productId: item.product_id,
                    receivedQuantity: Number(item.quantity_received),
                    acceptedQuantity: Number(item.quantity_accepted)
                }))
            })
            : null;
        const lineItemUpdates = submittedLineItemUpdates.map(item => ({
            ...item,
            quantity_rejected: deriveRejectedQuantity(item.quantity_received, item.quantity_accepted)
        }));
        lockedShipmentId = shipmentId;
        if (activeShipments.has(shipmentId)) throw new ReceivingError("This shipment is already being received.", 409);
        activeShipments.add(shipmentId);

        const lineIds = lineItemUpdates.map(item => item.line_id);
        if (new Set(lineIds).size !== lineIds.length) throw new ReceivingError("Duplicate purchase-order lines are not allowed.", 400);
        const requestedLotIds = [...new Set(lineItemUpdates.flatMap(item => [
            ...item.accepted_lot_allocations.map(allocation => allocation.storage_lot_id),
            ...item.rejected_lot_allocations.map(allocation => allocation.storage_lot_id)
        ]))];

        const [headerRes, linesRes, branchesRes, movementTypesRes] = await Promise.all([
            procurementDirectusFetch(`/items/purchase_order/${shipmentId}?fields=purchase_order_id,branch_id,inventory_status,payment_status,date_received,force_received_at,currency_code,is_import,exchange_rate`),
            fetch(`${DIRECTUS_URL}/items/purchase_order_products?filter[purchase_order_id][_eq]=${shipmentId}&fields=*&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/branches?limit=200&fields=id,branch_name,branch_code,isActive,isBadStock,bad_stock_branch_id`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/inventory_transaction_types?fields=transaction_type_id,type_name,direction,origin_table&limit=-1`, { headers, cache: "no-store" })
        ]);
        if (!headerRes.ok) throw new ReceivingError("Purchase order not found.", 404);
        if (!linesRes.ok || !branchesRes.ok || !movementTypesRes.ok) throw new Error("Failed to validate receiving reference data.");

        const shipment = (await headerRes.json()).data as Record<string, unknown>;
        const currency = resolveLandedCostCurrency(shipment);
        const branchId = resolvePurchaseOrderBranchId(shipment);
        if (!branchId) throw new ReceivingError("The Purchase Order does not have a valid receiving branch.", 409);
        if (branchId !== submittedBranchId) throw new ReceivingError("Receiving Branch must match the Purchase Order branch.", 409);
        const forceClosedMessage = forceReceivedIntakeMessage(shipment.force_received_at);
        if (forceClosedMessage) throw new ReceivingError(forceClosedMessage, 409);
        const poLines = ((await linesRes.json()).data || []) as Record<string, unknown>[];
        const branches = ((await branchesRes.json()).data || []) as Array<{
            id: number;
            branch_name: string;
            branch_code: string;
            isActive?: unknown;
            isBadStock?: unknown;
            bad_stock_branch_id?: unknown;
        }>;
        const movementTypes = ((await movementTypesRes.json()).data || []) as DirectusMovementType[];
        const receivingBranch = branches.find(branch => Number(branch.id) === branchId);
        if (!receivingBranch) throw new ReceivingError("The selected receiving branch does not exist.", 400);
        const badBranchId = relationValueId(receivingBranch.bad_stock_branch_id, ["id", "branch_id"]);
        const badBranch = badBranchId
            ? branches.find(branch => Number(branch.id) === badBranchId)
            : undefined;
        if (lineItemUpdates.some(item => Number(item.quantity_rejected) > 0)
            && (!badBranch || Number(badBranch.isActive) !== 1 || Number(badBranch.isBadStock) !== 1)) {
            throw new ReceivingError("The selected destination has no active Bad Order branch configured for rejected inventory.", 409);
        }
        const requestedAcceptedLotIds = [...new Set(lineItemUpdates.flatMap(item =>
            item.accepted_lot_allocations.map(allocation => allocation.storage_lot_id)
        ))];
        const requestedRejectedLotIds = [...new Set(lineItemUpdates.flatMap(item =>
            item.rejected_lot_allocations.map(allocation => allocation.storage_lot_id)
        ))];
        const overlappingLotIds = requestedAcceptedLotIds.filter(id => requestedRejectedLotIds.includes(id));
        if (overlappingLotIds.length > 0) {
            throw new ReceivingError(`A storage lot cannot be used for both accepted and rejected inventory: ${overlappingLotIds.join(", ")}.`, 409);
        }
        const [acceptedLotRows, rejectedLotRows] = await Promise.all([
            requestedAcceptedLotIds.length > 0
                ? loadMmLots({ ids: requestedAcceptedLotIds, branchId, onlyActive: true })
                : Promise.resolve([]),
            requestedRejectedLotIds.length > 0 && badBranch
                ? loadMmLots({ ids: requestedRejectedLotIds, branchId: Number(badBranch.id), onlyActive: true })
                : Promise.resolve([])
        ]);
        const lotRows = [...acceptedLotRows, ...rejectedLotRows];
        const lotBranchById = new Map<number, number>([
            ...acceptedLotRows.map(lot => [Number(lot.lot_id), branchId] as const),
            ...rejectedLotRows.map(lot => [Number(lot.lot_id), Number(badBranch?.id)] as const)
        ]);
        const mmLotIds = lotRows.map(lot => Number(lot.lot_id)).filter((id): id is number => Number.isSafeInteger(id) && id > 0);
        const [acceptedMappings, rejectedMappings] = await Promise.all([
            acceptedLotRows.length > 0 ? loadMmLotMappings(acceptedLotRows.map(lot => Number(lot.lot_id)), branchId) : Promise.resolve([]),
            rejectedLotRows.length > 0 && badBranch
                ? loadMmLotMappings(rejectedLotRows.map(lot => Number(lot.lot_id)), Number(badBranch.id))
                : Promise.resolve([])
        ]);
        const lotMappings = [...acceptedMappings, ...rejectedMappings];
        const mappingByMmLot = new Map(lotMappings.map(mapping => [mapping.mm_lot_id, mapping]));
        const validLotIds = new Set(mmLotIds);
        if (mmLotIds.length !== requestedLotIds.length) {
            throw new ReceivingError("One or more selected storage lots do not exist, are inactive, or belong to another branch.", 409);
        }
        const missingMappings = requestedLotIds.filter(lotId => !mappingByMmLot.has(lotId));
        if (missingMappings.length > 0) {
            throw new ReceivingError(`Storage lot mapping is not configured for MM lot(s): ${missingMappings.join(", ")}.`, 409);
        }
        const passedMovementTypeId = movementTypeId(movementTypes, "Purchase Receiving QA");
        const rejectedMovementTypeId = lineItemUpdates.some(item => Number(item.quantity_rejected) > 0)
            ? movementTypeId(movementTypes, "QA Reject / Bad Order Receipt")
            : null;
        const poLineIds = poLines
            .map(line => Number(line.purchase_order_product_id))
            .filter(lineId => Number.isSafeInteger(lineId) && lineId > 0);
        const submittedLineIds = new Set(lineIds);
        const poLineIdSet = new Set(poLineIds);
        const missingLineIds = poLineIds.filter(lineId => !submittedLineIds.has(lineId));
        const unknownLineIds = lineIds.filter(lineId => !poLineIdSet.has(lineId));
        if (poLineIds.length !== poLines.length || unknownLineIds.length > 0) {
            throw new ReceivingError("One or more purchase-order lines do not exist.", 400);
        }
        if (!replacementDispositionId && missingLineIds.length > 0) {
            throw new ReceivingError(`Every purchase-order line must be included. Missing line(s): ${missingLineIds.join(", ")}.`, 400);
        }
        if (lineItemUpdates.some(item => item.accepted_lot_allocations.some(allocation => !validLotIds.has(allocation.storage_lot_id)))) {
            throw new ReceivingError("One or more accepted inventory storage lots do not exist.", 400);
        }
        if (lineItemUpdates.some(item => item.rejected_lot_allocations.some(allocation => !validLotIds.has(allocation.storage_lot_id)))) {
            throw new ReceivingError("One or more rejected inventory storage lots do not exist.", 400);
        }
        if (!branches.some(branch => Number(branch.id) === branchId)) throw new ReceivingError("The selected receiving branch does not exist.", 400);

        const receiptNumbers = lineItemUpdates.map(item => receiptNumberForLine(referenceNumber, item.line_id));
        let receiptsRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,purchase_order_line_id,product_id,receipt_no,received_quantity,quantity_rejected,is_replacement&limit=-1`, { headers, cache: "no-store" });
        if (!receiptsRes.ok) {
            receiptsRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,product_id,receipt_no,received_quantity,quantity_rejected,is_replacement&limit=-1`, { headers, cache: "no-store" });
        }
        if (!receiptsRes.ok) throw new Error("Failed to validate previous receiving attempts.");
        const allExistingReceipts = (await receiptsRes.json()).data || [];
        const existingReceipts = allExistingReceipts.filter((row: Record<string, unknown>) => receiptNumbers.includes(String(row.receipt_no)));
        if (!replacementDispositionId && Number(shipment.inventory_status) === INVENTORY_STATUS.REJECTED) {
            throw new ReceivingError("Rejected purchase orders cannot continue to receiving.", 409);
        }
        if (existingReceipts.length === receiptNumbers.length) {
            for (const item of lineItemUpdates) {
                const existingReceipt = existingReceipts.find((row: Record<string, unknown>) => String(row.receipt_no) === receiptNumberForLine(referenceNumber, item.line_id));
                const receivingLineId = Number(existingReceipt?.purchase_order_product_id);
                if (!receivingLineId) throw new ReceivingError(`Receiving record for line ${item.line_id} could not be correlated.`, 409);
                await ensureQaResults({
                    receivingLineId,
                    productId: item.product_id,
                    results: item.qa_results
                });
            }
            const receivingByLine = new Map<number, number>(existingReceipts.map((row: Record<string, unknown>) => [
                lineItemUpdates.find(item => receiptNumberForLine(referenceNumber, item.line_id) === String(row.receipt_no))?.line_id || 0,
                Number(row.purchase_order_product_id)
            ]));
            const allocationChanges: AllocationChange[] = [];
            try {
                const allocations = await persistMrpAllocations(
                    parsed.data.mrp_allocation_drafts as MrpAllocationDraft[],
                    receivingByLine,
                    new Map<number, number[]>(),
                    options.actorUserId,
                    allocationChanges
                );
                return NextResponse.json({ success: true, idempotent: true, status: shipment.inventory_status, allocations });
            } catch (error) {
                if (!await rollbackAllocations(allocationChanges)) {
                    throw new Error(`MRP allocation reconciliation failed and created allocation rows could not be restored. Original error: ${(error as Error).message}`);
                }
                throw error;
            }
        }
        const receivableStatuses: number[] = [INVENTORY_STATUS.FOR_PICKUP, INVENTORY_STATUS.PARTIALLY_RECEIVED];
        if (existingReceipts.length > 0) {
            throw new ReceivingError("This purchase order has a partial previous receiving attempt and requires reconciliation.", 409);
        }
        if (!replacementDispositionId && !receivableStatuses.includes(Number(shipment.inventory_status))) {
            throw new ReceivingError("The purchase order must be in Receiving (QA) before it can be received.", 409);
        }

        const receivingHistory = summarizeReceivingHistory(allExistingReceipts as Array<Record<string, unknown>>, poLines);
        if (receivingHistory.unresolvedRows.length > 0) {
            throw new ReceivingError("Existing receiving records could not be matched to a purchase-order line. Reconciliation is required before receiving can continue.", 409);
        }
        const previouslyReceivedByLine = receivingHistory.byLine;

        const poLineMap = new Map(poLines.map(line => [Number(line.purchase_order_product_id), line]));
        const productIds = [...new Set(poLines
            .map(line => relationId(line.product_id, "product_id"))
            .filter((id): id is number => id !== null))];
        const productsRes = await fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_type,unit_of_measurement.unit_id,product_shelf_life,weight,product_weight,net_weight,outer_carton_weight,pallet_weight,weight_unit_id.*,cbm_height,cbm_width,cbm_length,cost_per_unit,estimated_unit_cost&limit=-1`, { headers, cache: "no-store" });
        if (!productsRes.ok) throw new Error("Failed to validate received products.");
        const products = ((await productsRes.json()).data || []) as Record<string, unknown>[];
        const productMap = new Map(products.map(product => [Number(product.product_id), product]));
        const categoryTypes = await resolveProductCategoryTypes(productIds);
        const productTypesByLot = new Map<number, Set<number>>();
        const uomByLot = new Map<number, number>();

        const prepared = lineItemUpdates.map(item => {
            const poLine = poLineMap.get(item.line_id);
            if (!poLine || relationId(poLine.purchase_order_id, "purchase_order_id") !== shipmentId) {
                throw new ReceivingError(`Line ${item.line_id} does not belong to this purchase order.`, 400);
            }
            const productId = relationId(poLine.product_id, "product_id");
            if (productId !== item.product_id) throw new ReceivingError(`Product mismatch for line ${item.line_id}.`, 400);
            const product = productMap.get(productId);
            if (!product) throw new ReceivingError(`Product ${productId} does not exist.`, 400);
            const categoryType = categoryTypes.get(productId);
            if (!categoryType) throw new ReceivingError(`Product ${productId} has no valid RAW_MATERIAL, PACKAGING, or FINISHED_GOODS Category_Type.`, 400);
            const productTypeId = relationValueId(product.product_type, ["product_type_id", "type_id", "id"]);
            const productUomId = relationValueId(product.unit_of_measurement, ["unit_id", "id"]);
            if (!productTypeId || !productUomId) throw new ReceivingError(`Product ${productId} must have a Product Type and UOM before inventory allocation.`, 409);
            let weightBreakdown;
            try {
                weightBreakdown = resolveProductWeightBreakdown(product, {
                    requireComplete: categoryType === "PACKAGING"
                });
            } catch (error) {
                if (error instanceof ProductWeightValidationError) {
                    throw new ReceivingError(`Product ${productId}: ${error.message}`, 400);
                }
                throw error;
            }

            const received = Number(item.quantity_received);
            const declaredAccepted = Number(item.quantity_accepted);
            const rejected = deriveRejectedQuantity(received, declaredAccepted);
            const ordered = Number(poLine.ordered_quantity || 0);
            const previous = previouslyReceivedByLine.get(item.line_id) || { received: 0, rejected: 0, accepted: 0 };
            const remaining = replacementContext?.targetLineId === item.line_id
                ? replacementContext.disposition.remainingQuantity
                : Math.max(0, ordered - previous.received);
            const overDelivery = evaluateOverDelivery(received, remaining);
            const quantityError = validateReceivingQuantities({
                receivedQuantity: received,
                acceptedQuantity: declaredAccepted,
                rejectedQuantity: rejected
            });
            if (quantityError) throw new ReceivingError(`${quantityError} Product ${productId}.`, 400);
            if (!Number.isFinite(ordered) || ordered <= 0) {
                throw new ReceivingError(`Invalid ordered quantity for product ${productId}.`, 400);
            }
            if (overDelivery.isOverReceived && !processOverDelivery && !replacementDispositionId) {
                throw new ReceivingError(`Over-delivery of ${overDelivery.overDeliveryQuantity} unit(s) for product ${productId} requires explicit processing confirmation.`, 422);
            }
            if ((received < remaining || rejected > 0) && !item.rejection_reason?.trim()) {
                throw new ReceivingError(`Remarks are required for the quantity discrepancy on product ${productId}.`, 400);
            }
            // unit_price is the stored PHP base cost. Taxes, discounts, and
            // withholding are line totals and must not be converted back into
            // a unit cost for receiving or landed-cost allocation.
            const baseUnitCostPhp = resolveBaseUnitCostPhp({
                purchase_order_product_id: Number(poLine.purchase_order_product_id),
                unit_price: poLine.unit_price as number | string | null | undefined,
                unit_price_foreign: poLine.unit_price_foreign as number | string | null | undefined
            }, currency);
            const accepted = received - rejected;
            const acceptedAllocationDrafts = item.accepted_lot_allocations.map(allocation => ({
                storageLotId: allocation.storage_lot_id,
                quantity: allocation.quantity,
                batchNumber: allocation.batch_no,
                manufacturingDate: allocation.manufacturing_date,
                expirationDate: allocation.expiration_date
            }));
            const acceptedLotAllocations = normalizeReceivingLotAllocations(
                accepted,
                acceptedAllocationDrafts
            );
            const allocationError = receivingLotAllocationError(accepted, acceptedAllocationDrafts);
            if (allocationError) throw new ReceivingError(`${allocationError} Product ${productId}.`, 400);
            const rejectedAllocationDrafts = item.rejected_lot_allocations.map(allocation => ({
                storageLotId: allocation.storage_lot_id,
                quantity: allocation.quantity,
                batchNumber: allocation.batch_no,
                manufacturingDate: allocation.manufacturing_date,
                expirationDate: allocation.expiration_date
            }));
            const rejectedLotAllocations = normalizeRejectedLotAllocations(
                rejected,
                rejectedAllocationDrafts
            );
            const rejectedAllocationError = rejectedLotAllocationError(rejected, rejectedAllocationDrafts);
            if (rejectedAllocationError) throw new ReceivingError(`${rejectedAllocationError} Product ${productId}.`, 400);
            for (const allocation of [...acceptedLotAllocations, ...rejectedLotAllocations]) {
                if (!allocation.batchNumber.trim()) {
                    throw new ReceivingError(`Every allocation for product ${productId} must include a batch number.`, 400);
                }
                if (categoryType !== "PACKAGING" && (!allocation.manufacturingDate || !allocation.expirationDate)) {
                    throw new ReceivingError(`Every allocation for raw material or finished goods product ${productId} must include manufacturing and expiry dates.`, 400);
                }
                if (allocation.manufacturingDate && allocation.expirationDate && allocation.manufacturingDate > allocation.expirationDate) {
                    throw new ReceivingError(`Manufacturing Date cannot be later than Expiry Date for product ${productId}.`, 400);
                }
                if (allocation.expirationDate && !evaluateShelfLife(receiptDate, allocation.expirationDate, Number(product.product_shelf_life || 0)).valid) {
                    throw new ReceivingError(`Expiry date must be after the receipt date for product ${productId}.`, 400);
                }
                const lot = lotRows.find(row => Number(row.lot_id) === allocation.storageLotId);
                if (!lot) throw new ReceivingError(`Storage lot ${allocation.storageLotId} does not exist.`, 400);
                const expectedBranchId = acceptedLotAllocations.includes(allocation)
                    ? branchId
                    : Number(badBranch?.id);
                if (lotBranchById.get(allocation.storageLotId) !== expectedBranchId) {
                    throw new ReceivingError(`Storage lot ${String(lot.lot_name || allocation.storageLotId)} is not assigned to the required inventory branch.`, 409);
                }
                if (!mappingByMmLot.has(allocation.storageLotId)) {
                    throw new ReceivingError(`Storage lot ${allocation.storageLotId} has no approved legacy mapping.`, 409);
                }
                const lotUomId = relationValueId(lot.unit_id, ["unit_id", "id"]);
                if (lotUomId !== productUomId) {
                    throw new ReceivingError(`Storage lot ${String(lot.lot_name || allocation.storageLotId)} UOM does not match product ${productId}.`, 409);
                }
                if (normalizeLotCapacity(lot.max_batch_capacity) === null) {
                    throw new ReceivingError(`Storage lot ${String(lot.lot_name || allocation.storageLotId)} has no valid maximum capacity.`, 409);
                }
                const typeSet = productTypesByLot.get(allocation.storageLotId) || new Set<number>();
                typeSet.add(productTypeId);
                productTypesByLot.set(allocation.storageLotId, typeSet);
                const existingUomId = uomByLot.get(allocation.storageLotId);
                if (existingUomId !== undefined && existingUomId !== productUomId) {
                    throw new ReceivingError(`Storage lot ${allocation.storageLotId} cannot receive allocations with different UOMs.`, 409);
                }
                uomByLot.set(allocation.storageLotId, productUomId);
            }
            const primaryAllocation = acceptedLotAllocations[0] || rejectedLotAllocations[0];
            if (!primaryAllocation) throw new ReceivingError(`A storage lot is required for product ${productId}.`, 400);
            return {
                item,
                poLine,
                product,
                productId,
                received,
                accepted,
                rejected,
                baseUnitCostPhp,
                acceptedLotAllocations,
                rejectedLotAllocations,
                categoryType,
                weightBreakdown,
                remainingQuantity: overDelivery.remainingQuantity,
                overDeliveryQuantity: overDelivery.overDeliveryQuantity,
                isOverReceived: overDelivery.isOverReceived
            };
        });

        for (const [lotId, productTypeIds] of productTypesByLot) {
            if (productTypeIds.size > 1) {
                throw new ReceivingError(`Storage lot ${lotId} cannot be assigned to multiple Product Types in one receiving submission.`, 409);
            }
        }

        const preparedByLine = new Map(prepared.map(line => [line.item.line_id, line]));
        const receivingStatus = evaluateReceivingStatus(poLines.map(poLine => {
            const lineId = Number(poLine.purchase_order_product_id);
            const previous = previouslyReceivedByLine.get(lineId) || { received: 0, rejected: 0, accepted: 0 };
            const current = preparedByLine.get(lineId);
            return {
                orderedQuantity: Number(poLine.ordered_quantity || 0),
                receivedQuantity: previous.received + (current?.received || 0),
                rejectedQuantity: previous.rejected + (current?.rejected || 0)
            };
        }));
        if (!replacementDispositionId && receivingStatus.status === "Received" && !paymentStatusAllowsReceivingHandoff(shipment.payment_status)) {
            throw new ReceivingError("This purchase order already has an active or completed payment status and cannot be received again.", 409);
        }


        const expenses = await fetchShipmentExpenses(shipmentId);
        const allocationMethod = normalizeAllocationMethod(String(expenses[0]?.allocation_method || "Value"));
        const allocations = calculateLandedCostAllocations(prepared.map(line => {
            return {
                key: line.item.line_id,
                quantity: line.accepted,
                baseUnitCostPhp: line.baseUnitCostPhp,
                weight: line.weightBreakdown.grossWeightKg,
                lineGrossWeightKg: line.weightBreakdown.grossWeightKg * line.accepted,
                volume: Number(line.product.cbm_height || 0) * Number(line.product.cbm_width || 0) * Number(line.product.cbm_length || 0),
                category_type: line.categoryType as PurchaseOrderCategoryType,
                weightUnit: line.weightBreakdown.weightUnitCode
            };
        }), expenses.reduce((sum, expense) => sum + Number(expense.amount_php || 0), 0), allocationMethod);

        const receiptIds: number[] = [];
        const pendingMovements: PendingMovement[] = [];
        const allocationChanges: AllocationChange[] = [];
        let finalMovements: FinalReceivingMovement[] = [];
        let finalAllocations: FinalReceivingAllocation[] = [];
        let movementWriteAttempted = false;
        let commitPhase: "receiving" | "inventory" | "movements" | "allocations" | "status" = "receiving";
        const lineChanges: Array<{ id: number; received: unknown }> = [];
        const productChanges = new Map<number, { cost_per_unit: unknown; estimated_unit_cost: unknown }>();
        let capacityAuditsByAllocationKey = new Map<string, LotCapacityAllocationAudit>();

        const rollback = async () => {
            for (const [productId, previous] of [...productChanges.entries()].reverse()) {
                const response = await mutate("products", productId, "PATCH", previous);
                if (!response.ok) return false;
            }
            const headerRestore = await mutate("purchase_order", shipmentId, "PATCH", {
                inventory_status: shipment.inventory_status,
                payment_status: shipment.payment_status ?? null,
                date_received: shipment.date_received
            });
            if (!headerRestore.ok) return false;
            for (const change of [...lineChanges].reverse()) await mutate("purchase_order_products", change.id, "PATCH", { received: change.received });
            for (const id of [...receiptIds].reverse()) await mutate("purchase_order_receiving", id, "DELETE");
            return true;
        };

        try {
        // Re-read lot affinity and occupancy immediately before persistence so
        // a concurrent receiving operation cannot repurpose a lot and the
        // capacity override is calculated from the current ledger state.
        const allocationLotIds = [...productTypesByLot.keys()];
        if (allocationLotIds.length > 0) {
            const freshAcceptedLotIds = allocationLotIds.filter(lotId => lotBranchById.get(lotId) === branchId);
            const freshRejectedLotIds = allocationLotIds.filter(lotId => lotBranchById.get(lotId) === Number(badBranch?.id));
            const [freshAcceptedLots, freshRejectedLots] = await Promise.all([
                freshAcceptedLotIds.length > 0
                    ? loadMmLots({ ids: freshAcceptedLotIds, branchId, onlyActive: true })
                    : Promise.resolve([]),
                freshRejectedLotIds.length > 0 && badBranch
                    ? loadMmLots({ ids: freshRejectedLotIds, branchId: Number(badBranch.id), onlyActive: true })
                    : Promise.resolve([])
            ]);
            const freshLots = [...freshAcceptedLots, ...freshRejectedLots];
            const [freshAcceptedMappings, freshRejectedMappings] = await Promise.all([
                freshAcceptedLotIds.length > 0 ? loadMmLotMappings(freshAcceptedLotIds, branchId) : Promise.resolve([]),
                freshRejectedLotIds.length > 0 && badBranch
                    ? loadMmLotMappings(freshRejectedLotIds, Number(badBranch.id))
                    : Promise.resolve([])
            ]);
            const freshMappings = [...freshAcceptedMappings, ...freshRejectedMappings];
            const freshMappingByMmLot = new Map(freshMappings.map(mapping => [mapping.mm_lot_id, mapping]));
            if (freshLots.length !== allocationLotIds.length || allocationLotIds.some(lotId => !freshMappingByMmLot.has(lotId))) {
                throw new ReceivingError("A selected storage lot was removed, deactivated, moved, or unmapped while receiving was being prepared.", 409);
            }
            const freshMovementRows = await loadMovementRowsForLotRefs(
                allocationLotIds,
                freshMappings.map(mapping => mapping.legacy_lot_id),
                "movement_id,mm_lot_id,lot_id,quantity"
            );
            const freshOccupied = sumMovementQuantitiesByStorageLot(freshMovementRows, legacyToMmLotMap(freshMappings));
            const freshCapacityByLot = new Map<number, number | null>();
            for (const lotId of allocationLotIds) {
                const lot = freshLots.find(row => Number(row.lot_id) === lotId);
                if (!lot) throw new ReceivingError(`Storage lot ${lotId} no longer exists.`, 409);
                if (relationValueId(lot.unit_id, ["unit_id", "id"]) !== uomByLot.get(lotId)) {
                    throw new ReceivingError(`Storage lot ${lotId} UOM changed while receiving was being prepared.`, 409);
                }
                const normalizedCapacity = normalizeLotCapacity(lot.max_batch_capacity);
                if (normalizedCapacity === null) {
                    throw new ReceivingError(`Storage lot ${lotId} has no valid maximum capacity.`, 409);
                }
                freshCapacityByLot.set(lotId, normalizedCapacity);
            }
            const capacityInputs: LotCapacityAllocationInput[] = prepared.flatMap(line => [
                ...line.acceptedLotAllocations.map((allocation, index) => ({
                    key: allocationCapacityKey(line.item.line_id, "Passed", index),
                    lotId: allocation.storageLotId,
                    quantity: allocation.quantity
                })),
                ...line.rejectedLotAllocations.map((allocation, index) => ({
                    key: allocationCapacityKey(line.item.line_id, "Rejected", index),
                    lotId: allocation.storageLotId,
                    quantity: allocation.quantity
                }))
            ]);
            const capacityEvaluations = evaluateLotCapacities(freshCapacityByLot, freshOccupied, capacityInputs);
            capacityAuditsByAllocationKey = new Map(
                [...capacityEvaluations.values()].flatMap(evaluation => evaluation.allocations.map(audit => [audit.key, audit] as const))
            );
        }

            commitPhase = "receiving";
            for (const line of prepared) {
                const allocation = allocations.get(line.item.line_id)!;
                const primaryAllocation = line.acceptedLotAllocations[0] || line.rejectedLotAllocations[0];
                if (!primaryAllocation) throw new ReceivingError(`A storage lot is required for product ${line.productId}.`, 400);
                const primaryLotMapping = mappingByMmLot.get(primaryAllocation.storageLotId);
                if (!primaryLotMapping) throw new ReceivingError(`Storage lot ${primaryAllocation.storageLotId} has no approved legacy mapping.`, 409);
                const receiptRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving`, { method: "POST", headers, body: JSON.stringify({
                    purchase_order_id: shipmentId, purchase_order_line_id: line.item.line_id, receiving_header_id: options.receivingHeaderId || null, product_id: line.productId, batch_no: primaryAllocation.batchNumber, mm_lot_id: primaryAllocation.storageLotId, lot_id: primaryLotMapping.legacy_lot_id,
                    expiry_date: primaryAllocation.expirationDate, received_quantity: line.received, unit_price: line.baseUnitCostPhp,
                    discounted_amount: Number(line.poLine.discounted_amount || 0), discount_type: line.poLine.discount_type || null,
                    total_amount: Number(line.poLine.net_amount ?? line.poLine.total_amount ?? 0), allocated_expense_php: allocation.allocatedExpense,
                    final_landed_unit_cost: allocation.finalLandedUnitCost, branch_id: branchId,
                    receipt_no: receiptNumberForLine(referenceNumber, line.item.line_id), received_date: receiptDateAtManilaMidnight(receiptDate),
                    isPosted: 1, qa_status: line.item.qa_status, quantity_rejected: line.rejected, rejection_reason: line.item.rejection_reason,
                    receipt_type: supplierDocumentTypeId,
                    quarantine_disposition_id: replacementDispositionId || null,
                    is_replacement: Boolean(replacementDispositionId),
                    is_over_received: line.isOverReceived,
                    over_delivery_quantity: line.overDeliveryQuantity
                }) });
                if (!receiptRes.ok) throw new Error(`Failed to create receiving record for product ${line.productId}: ${await receiptRes.text()}`);
                const receiptId = Number((await receiptRes.json()).data.purchase_order_product_id);
                if (!receiptId) throw new Error("Directus did not return the created receiving-record ID.");
                receiptIds.push(receiptId);
                await ensureQaResults({
                    receivingLineId: receiptId,
                    productId: line.productId,
                    results: line.item.qa_results
                });

                commitPhase = "inventory";
                const saveInventory = async (targetBranchId: number, storageLotId: number, quantity: number, qaStatus: string, reason: string | null): Promise<number | null> => {
                    void targetBranchId;
                    void qaStatus;
                    void reason;
                    if (quantity <= 0) return null;
                    return storageLotId;
                };

                const receiptNo = receiptNumberForLine(referenceNumber, line.item.line_id);
                const addPendingMovement = (
                    kind: "Passed" | "Rejected",
                    inventoryLotId: number | null,
                    targetBranchId: number,
                    storageLotId: number,
                    transactionTypeId: number,
                    quantity: number,
                    batchNumber: string,
                    manufacturingDate: string | null,
                    expirationDate: string | null,
                    remarks: string | null,
                    capacityAudit: LotCapacityAllocationAudit
                ) => {
                    if (!inventoryLotId || quantity <= 0) return;
                    const lotMapping = mappingByMmLot.get(storageLotId);
                    if (!lotMapping) throw new ReceivingError(`Storage lot ${storageLotId} has no approved legacy mapping.`, 409);
                    pendingMovements.push({
                        lineId: line.item.line_id,
                        kind,
                        receivingLineId: receiptId,
                        inventoryLotId,
                        productId: line.productId,
                        storageLotId,
                        mmLotId: storageLotId,
                        legacyLotId: lotMapping.legacy_lot_id,
                        branchId: targetBranchId,
                        transactionTypeId,
                        sourceDocumentNo: receiptNo,
                        quantity,
                        batchNumber,
                        manufacturingDate,
                        expirationDate,
                        capacityOverride: capacityAudit.capacityOverride,
                        capacityAvailableBeforeReceipt: capacityAudit.capacityAvailableBeforeReceipt,
                        capacityOverrideQuantity: capacityAudit.capacityOverrideQuantity,
                        payload: {
                            product_id: line.productId,
                            mm_lot_id: storageLotId,
                            lot_id: lotMapping.legacy_lot_id,
                            branch_id: targetBranchId,
                            transaction_type_id: transactionTypeId,
                            source_document_id: receiptId,
                            source_document_no: receiptNo,
                            batch_no: batchNumber,
                            expiry_date: expirationDate,
                            manufacturing_date: manufacturingDate,
                            version_id: null,
                            quantity,
                            created_by: options.actorUserId,
                            remarks,
                            is_capacity_override: capacityAudit.capacityOverride,
                            capacity_available_before_receipt: capacityAudit.capacityAvailableBeforeReceipt,
                            capacity_override_quantity: capacityAudit.capacityOverrideQuantity
                        }
                    });
                };
                const capacityAuditFor = (kind: "Passed" | "Rejected", index: number) => {
                    const audit = capacityAuditsByAllocationKey.get(allocationCapacityKey(line.item.line_id, kind, index));
                    if (!audit) throw new ReceivingError(`Unable to calculate capacity audit for line ${line.item.line_id}.`, 503);
                    return audit;
                };
                for (const [index, acceptedAllocation] of line.acceptedLotAllocations.entries()) {
                    const inventoryLotId = await saveInventory(branchId, acceptedAllocation.storageLotId, acceptedAllocation.quantity, "Passed", null);
                    addPendingMovement("Passed", inventoryLotId, branchId, acceptedAllocation.storageLotId, passedMovementTypeId, acceptedAllocation.quantity, acceptedAllocation.batchNumber, acceptedAllocation.manufacturingDate, acceptedAllocation.expirationDate, line.item.rejection_reason, capacityAuditFor("Passed", index));
                }
                if (rejectedMovementTypeId) {
                    for (const [index, rejectedAllocation] of line.rejectedLotAllocations.entries()) {
                        const inventoryLotId = await saveInventory(Number(badBranch?.id), rejectedAllocation.storageLotId, rejectedAllocation.quantity, "Rejected", line.item.rejection_reason);
                        addPendingMovement("Rejected", inventoryLotId, Number(badBranch?.id), rejectedAllocation.storageLotId, rejectedMovementTypeId, rejectedAllocation.quantity, rejectedAllocation.batchNumber, rejectedAllocation.manufacturingDate, rejectedAllocation.expirationDate, line.item.rejection_reason, capacityAuditFor("Rejected", index));
                    }
                }
                if (!replacementDispositionId) {
                    const previous = previouslyReceivedByLine.get(line.item.line_id) || { received: 0, rejected: 0, accepted: 0 };
                    const cumulativeAccepted = previous.accepted + line.accepted;
                    lineChanges.push({ id: line.item.line_id, received: line.poLine.received });
                    const lineUpdateRes = await mutate("purchase_order_products", line.item.line_id, "PATCH", { received: cumulativeAccepted >= Number(line.poLine.ordered_quantity || 0) - RECEIVING_STATUS_EPSILON ? 1 : 0 });
                    if (!lineUpdateRes.ok) throw new Error(`Failed to mark line ${line.item.line_id} as received.`);
                }
            }

            for (const productId of productIds) {
                const productLines = prepared.filter(line => line.productId === productId && line.accepted > 0);
                if (productLines.length === 0) continue;
                const totalAccepted = productLines.reduce((sum, line) => sum + line.accepted, 0);
                const weightedCost = productLines.reduce((sum, line) => sum + allocations.get(line.item.line_id)!.finalLandedUnitCost * line.accepted, 0) / totalAccepted;
                const product = productMap.get(productId)!;
                productChanges.set(productId, {
                    cost_per_unit: product.cost_per_unit,
                    estimated_unit_cost: product.estimated_unit_cost
                });
                const productUpdateRes = await mutate("products", productId, "PATCH", {
                    cost_per_unit: weightedCost,
                    estimated_unit_cost: weightedCost
                });
                if (!productUpdateRes.ok) throw new Error(`Failed to update landed cost for product ${productId}.`);
            }

            commitPhase = "movements";
            movementWriteAttempted = true;
            const movementRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?fields=movement_id,product_id,mm_lot_id,lot_id,branch_id,transaction_type_id,source_document_id,source_document_no,batch_no,quantity,manufacturing_date,expiry_date,version_id,is_capacity_override,capacity_available_before_receipt,capacity_override_quantity`, {
                method: "POST",
                headers,
                body: JSON.stringify(pendingMovements.map(movement => movement.payload))
            });
            if (!movementRes.ok) throw new Error(`Failed to create inventory movements: ${await movementRes.text()}`);
            const movementData = (await movementRes.json()).data;
            const movementRows = (Array.isArray(movementData) ? movementData : movementData ? [movementData] : []) as Record<string, unknown>[];
            const createdMovements = finalizeMovements(pendingMovements, movementRows);
            if (!createdMovements) throw new Error(`Directus did not return the complete created movement IDs. Response rows: ${JSON.stringify(movementRows).slice(0, 500)}`);
            finalMovements = createdMovements;

            const receivingByLine = new Map<number, number>(receiptIds.map((receivingId, index) => [prepared[index].item.line_id, receivingId]));
            const inventoryLotIdsByLine = new Map<number, number[]>();
            for (const movement of finalMovements) {
                const ids = inventoryLotIdsByLine.get(movement.lineId) || [];
                if (!ids.includes(movement.inventoryLotId)) ids.push(movement.inventoryLotId);
                inventoryLotIdsByLine.set(movement.lineId, ids);
            }
            commitPhase = "allocations";
            finalAllocations = await persistMrpAllocations(
                parsed.data.mrp_allocation_drafts as MrpAllocationDraft[],
                receivingByLine,
                inventoryLotIdsByLine,
                options.actorUserId,
                allocationChanges
            );

            if (!replacementDispositionId) {
                commitPhase = "status";
                const nextInventoryStatus = receivingStatus.status === "Partially Received"
                    ? INVENTORY_STATUS.PARTIALLY_RECEIVED
                    : receivingStatus.status === "Rejected"
                        ? INVENTORY_STATUS.REJECTED
                        : INVENTORY_STATUS.RECEIVED;
                const statusRes = await mutate("purchase_order", shipmentId, "PATCH", {
                    inventory_status: nextInventoryStatus,
                    ...(nextInventoryStatus === INVENTORY_STATUS.RECEIVED
                        ? { payment_status: PAYMENT_STATUS.AWAITING_PAYMENT }
                        : {}),
                    ...(receivingStatus.status !== "Partially Received" ? { date_received: receiptDate } : {})
                });
                if (!statusRes.ok) throw new Error(`Failed to update purchase-order status (${statusRes.status}).`);
            }
        } catch (error) {
            let persistedMovementIds: number[] = finalMovements.map(movement => movement.movementId);
            if (movementWriteAttempted && pendingMovements.length > 0 && persistedMovementIds.length !== pendingMovements.length) {
                let persistedRows: Record<string, unknown>[];
                try {
                    persistedRows = await loadMovementRows(receiptIds);
                } catch {
                    throw new Error(`Receiving movement persistence could not be reconciled, so receiving and inventory records were retained. Original error: ${(error as Error).message}`);
                }
                const recoveredMovements = finalizeMovements(pendingMovements, persistedRows);
                if (!recoveredMovements && persistedRows.length > 0) {
                    throw new Error(`Receiving movements were only partially reconciled, so receiving and inventory records were retained. Original error: ${(error as Error).message}`);
                }
                if (recoveredMovements) persistedMovementIds = recoveredMovements.map(movement => movement.movementId);
            }
            if (!await rollbackAllocations(allocationChanges) || !await rollback()) {
                throw new Error(`Receiving failed during ${commitPhase}; stock and audit records were retained for reconciliation. Original error: ${(error as Error).message}`);
            }
            for (const movementId of [...persistedMovementIds].reverse()) {
                const movementDelete = await mutate("inventory_movements", movementId, "DELETE");
                if (!movementDelete.ok) {
                    throw new Error(`Receiving failed during ${commitPhase}; movement ${movementId} could not be removed after compensation. Reconciliation is required. Original error: ${(error as Error).message}`);
                }
            }
            throw error;
        }

        return NextResponse.json({ success: true, idempotent: false, movements: finalMovements, allocations: finalAllocations });
    } catch (error) {
        console.error("API Error submitting QA Receiving:", error);
        return NextResponse.json({ error: (error as Error).message || "Failed to process QA receiving" }, {
            status: error instanceof ReceivingError
                ? error.status
                : error instanceof QuarantineDispositionError
                    ? error.statusCode
            : error instanceof MmLotCompatibilityError
                ? error.status
                : error instanceof QaResultPersistenceError
                    ? error.status
                    : 500
        });
    } finally {
        if (lockedShipmentId !== null) activeShipments.delete(lockedShipmentId);
    }
}
