import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../_directus";
import { evaluateShelfLife, INVENTORY_STATUS, todayInManila } from "../_domain";
import { receivingSubmissionSchema } from "../_schemas";
import { validateReceivingQuantities } from "../../qa/_receiving-evaluation";
import {
    normalizeReceivingLotAllocations,
    normalizeRejectedLotAllocations,
    receivingLotAllocationError,
    rejectedLotAllocationError
} from "../../qa-receiving/_lot-allocation";
import { calculateLandedCostAllocations, fetchShipmentExpenses, normalizeAllocationMethod } from "../expenses/expenses-helper";
import { receiptNumberForLine, type FinalReceivingAllocation } from "../../qa-receiving/_commit-contract";
import { summarizeReceivingHistory } from "../../qa-receiving/_receiving-history";
import { sumMovementQuantitiesByLot } from "../../qa-receiving/_movement-stock";
import { ensureQaResults, QaResultPersistenceError } from "./_qa-results";

class ReceivingError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

interface ReceivingPostOptions {
    actorUserId: number;
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
    branchId: number;
    transactionTypeId: number;
    sourceDocumentNo: string;
    quantity: number;
}

interface PendingMovement extends Omit<FinalReceivingMovement, "movementId"> {
    payload: Record<string, unknown>;
}

const activeShipments = new Set<number>();

function relationId(value: unknown, key: string): number {
    return Number(value && typeof value === "object" ? (value as Record<string, unknown>)[key] : value);
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
}): string {
    return `${row.receivingLineId}:${row.branchId}:${row.transactionTypeId}:${row.storageLotId}:${row.quantity}`;
}

async function loadMovementRows(receivingLineIds: number[]) {
    if (receivingLineIds.length === 0) return [];
    const params = new URLSearchParams({
        "filter[source_document_id][_in]": receivingLineIds.join(","),
        fields: "movement_id,source_document_id,branch_id,transaction_type_id,lot_id,quantity,version_id",
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
    const movementByKey = new Map<string, number>();
    for (const row of rows) {
        if (row.version_id !== null) return null;
        const movementId = Number(row.movement_id);
        const key = movementKey({
            receivingLineId: relationId(row.source_document_id, "purchase_order_product_id"),
            branchId: relationId(row.branch_id, "id"),
            transactionTypeId: relationId(row.transaction_type_id, "transaction_type_id"),
            storageLotId: relationId(row.lot_id, "lot_id"),
            quantity: Number(row.quantity)
        });
        if (!Number.isSafeInteger(movementId) || movementId <= 0 || movementByKey.has(key)) return null;
        movementByKey.set(key, movementId);
    }
    const finalized = pending.map(draft => {
        const movementId = movementByKey.get(movementKey(draft));
        return movementId ? { ...draft, movementId } : null;
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

        const { shipmentId, referenceNumber, receiptMode, branchId, lineItemUpdates } = parsed.data;
        lockedShipmentId = shipmentId;
        if (activeShipments.has(shipmentId)) throw new ReceivingError("This shipment is already being received.", 409);
        activeShipments.add(shipmentId);

        const lineIds = lineItemUpdates.map(item => item.line_id);
        if (new Set(lineIds).size !== lineIds.length) throw new ReceivingError("Duplicate purchase-order lines are not allowed.", 400);
        const requestedLotIds = [...new Set(lineItemUpdates.flatMap(item => [
            item.lot_id,
            ...item.accepted_lot_allocations.map(allocation => allocation.storage_lot_id),
            ...item.rejected_lot_allocations.map(allocation => allocation.storage_lot_id)
        ]))];

        const [headerRes, linesRes, lotsRes, lotInventoryRes, branchesRes, movementTypesRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/purchase_order/${shipmentId}?fields=purchase_order_id,inventory_status,date_received`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/purchase_order_products?filter[purchase_order_id][_eq]=${shipmentId}&fields=*&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/lots?filter[lot_id][_in]=${requestedLotIds.join(",")}&fields=lot_id,max_batch_capacity&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/inventory_movements?filter[lot_id][_in]=${requestedLotIds.join(",")}&fields=lot_id,quantity&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/branches?limit=200&fields=id,branch_name,branch_code`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/inventory_transaction_types?fields=transaction_type_id,type_name,direction,origin_table&limit=-1`, { headers, cache: "no-store" })
        ]);
        if (!headerRes.ok) throw new ReceivingError("Purchase order not found.", 404);
        if (!linesRes.ok || !lotsRes.ok || !lotInventoryRes.ok || !branchesRes.ok || !movementTypesRes.ok) throw new Error("Failed to validate receiving reference data.");

        const shipment = (await headerRes.json()).data as Record<string, unknown>;
        const poLines = ((await linesRes.json()).data || []) as Record<string, unknown>[];
        const lotRows = ((await lotsRes.json()).data || []) as Array<Record<string, unknown>>;
        const validLotIds = new Set(lotRows.map(lot => Number(lot.lot_id)));
        const occupiedByLot = sumMovementQuantitiesByLot(
            (((await lotInventoryRes.json()).data || []) as Array<Record<string, unknown>>)
        );
        const branches = ((await branchesRes.json()).data || []) as Array<{ id: number; branch_name: string; branch_code: string }>;
        const movementTypes = ((await movementTypesRes.json()).data || []) as DirectusMovementType[];
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
        if (receiptMode === "full" && missingLineIds.length > 0) {
            throw new ReceivingError(`Full receipt requires every purchase-order line to be included. Missing line(s): ${missingLineIds.join(", ")}.`, 400);
        }
        if (lineItemUpdates.some(item => item.lot_id && !validLotIds.has(item.lot_id))) throw new ReceivingError("One or more storage lots do not exist.", 400);
        if (lineItemUpdates.some(item => item.accepted_lot_allocations.some(allocation => !validLotIds.has(allocation.storage_lot_id)))) {
            throw new ReceivingError("One or more accepted inventory storage lots do not exist.", 400);
        }
        if (lineItemUpdates.some(item => item.rejected_lot_allocations.some(allocation => !validLotIds.has(allocation.storage_lot_id)))) {
            throw new ReceivingError("One or more rejected inventory storage lots do not exist.", 400);
        }
        const capacityByLot = new Map(lotRows.map(lot => [
            Number(lot.lot_id),
            lot.max_batch_capacity === null || lot.max_batch_capacity === undefined || lot.max_batch_capacity === ""
                ? null
                : Number(lot.max_batch_capacity)
        ]));
        const incomingByLot = new Map<number, number>();
        for (const item of lineItemUpdates) {
            for (const allocation of normalizeReceivingLotAllocations(
                Number(item.quantity_accepted),
                item.accepted_lot_allocations.map(value => ({ storageLotId: value.storage_lot_id, quantity: value.quantity })),
                item.lot_id
            )) {
                incomingByLot.set(allocation.storageLotId, (incomingByLot.get(allocation.storageLotId) || 0) + allocation.quantity);
            }
            for (const allocation of normalizeRejectedLotAllocations(
                Number(item.quantity_rejected || 0),
                item.rejected_lot_allocations.map(value => ({ storageLotId: value.storage_lot_id, quantity: value.quantity })),
                item.lot_id
            )) {
                incomingByLot.set(allocation.storageLotId, (incomingByLot.get(allocation.storageLotId) || 0) + allocation.quantity);
            }
        }
        for (const [lotId, incomingQuantity] of incomingByLot) {
            const capacity = capacityByLot.get(lotId);
            if (capacity !== undefined && capacity !== null && Number.isFinite(capacity) && (occupiedByLot.get(lotId) || 0) + incomingQuantity > capacity + 1e-9) {
                throw new ReceivingError(`Storage lot ${lotId} does not have enough remaining capacity.`, 409);
            }
        }
        if (!branches.some(branch => Number(branch.id) === branchId)) throw new ReceivingError("The selected receiving branch does not exist.", 400);

        const receiptNumbers = lineItemUpdates.map(item => receiptNumberForLine(referenceNumber, item.line_id));
        let receiptsRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,purchase_order_line_id,product_id,receipt_no,received_quantity,quantity_rejected&limit=-1`, { headers, cache: "no-store" });
        if (!receiptsRes.ok) {
            receiptsRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,product_id,receipt_no,received_quantity,quantity_rejected&limit=-1`, { headers, cache: "no-store" });
        }
        if (!receiptsRes.ok) throw new Error("Failed to validate previous receiving attempts.");
        const allExistingReceipts = (await receiptsRes.json()).data || [];
        const existingReceipts = allExistingReceipts.filter((row: Record<string, unknown>) => receiptNumbers.includes(String(row.receipt_no)));
        if (Number(shipment.inventory_status) === INVENTORY_STATUS.REJECTED) {
            throw new ReceivingError("Rejected purchase orders cannot continue to receiving.", 409);
        }
        if (Number(shipment.inventory_status) === INVENTORY_STATUS.PARTIALLY_RECEIVED) {
            throw new ReceivingError("Partially received purchase orders are view-only and cannot be received again.", 409);
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
        const receivableStatuses: number[] = [INVENTORY_STATUS.FOR_PICKUP];
        if (existingReceipts.length > 0) {
            throw new ReceivingError("This purchase order has a partial previous receiving attempt and requires reconciliation.", 409);
        }
        if (!receivableStatuses.includes(Number(shipment.inventory_status))) {
            throw new ReceivingError("The purchase order must be moved to QA (Receiving) before it can be received.", 409);
        }

        const receivingHistory = summarizeReceivingHistory(allExistingReceipts as Array<Record<string, unknown>>, poLines);
        if (receivingHistory.unresolvedRows.length > 0) {
            throw new ReceivingError("Existing receiving records could not be matched to a purchase-order line. Reconciliation is required before receiving can continue.", 409);
        }
        const previouslyReceivedByLine = receivingHistory.byLine;

        const poLineMap = new Map(poLines.map(line => [Number(line.purchase_order_product_id), line]));
        const productIds = [...new Set(poLines.map(line => relationId(line.product_id, "product_id")))];
        const productsRes = await fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_type,product_shelf_life,weight,product_weight,cbm_height,cbm_width,cbm_length,cost_per_unit,estimated_unit_cost&limit=-1`, { headers, cache: "no-store" });
        if (!productsRes.ok) throw new Error("Failed to validate received products.");
        const products = ((await productsRes.json()).data || []) as Record<string, unknown>[];
        const productMap = new Map(products.map(product => [Number(product.product_id), product]));

        const prepared = lineItemUpdates.map(item => {
            const poLine = poLineMap.get(item.line_id);
            if (!poLine || relationId(poLine.purchase_order_id, "purchase_order_id") !== shipmentId) {
                throw new ReceivingError(`Line ${item.line_id} does not belong to this purchase order.`, 400);
            }
            const productId = relationId(poLine.product_id, "product_id");
            if (productId !== item.product_id) throw new ReceivingError(`Product mismatch for line ${item.line_id}.`, 400);
            const product = productMap.get(productId);
            if (!product) throw new ReceivingError(`Product ${productId} does not exist.`, 400);

            const received = Number(item.quantity_received);
            const declaredAccepted = Number(item.quantity_accepted);
            const rejected = Number(item.quantity_rejected);
            const ordered = Number(poLine.ordered_quantity || 0);
            const previous = previouslyReceivedByLine.get(item.line_id) || { received: 0, rejected: 0 };
            const remaining = Math.max(0, ordered - previous.received);
            const quantityError = validateReceivingQuantities({
                receivedQuantity: received,
                acceptedQuantity: declaredAccepted,
                rejectedQuantity: rejected
            });
            if (quantityError) throw new ReceivingError(`${quantityError} Product ${productId}.`, 400);
            if (!Number.isFinite(ordered) || ordered <= 0 || received > remaining + 1e-9) {
                throw new ReceivingError(`Received quantity for product ${productId} exceeds its remaining quantity of ${remaining}.`, 400);
            }
            if ((received !== remaining || declaredAccepted > received || rejected > 0) && !item.rejection_reason?.trim()) {
                throw new ReceivingError(`Remarks are required for the quantity discrepancy on product ${productId}.`, 400);
            }
            if (declaredAccepted > 0 && relationId(product.product_type, "id") !== 390 && !item.expiration_date) {
                throw new ReceivingError(`Expiration date is required for product ${productId}.`, 400);
            }
            if (item.expiration_date && !evaluateShelfLife(todayInManila(), item.expiration_date, Number(product.product_shelf_life || 0)).valid) {
                throw new ReceivingError(`Expiry date must be after the receipt date for product ${productId}.`, 400);
            }

            // unit_price is the stored PHP base cost. Taxes, discounts, and
            // withholding are line totals and must not be converted back into
            // a unit cost for receiving or landed-cost allocation.
            const baseUnitCost = Number(poLine.unit_price || 0);
            const accepted = received - rejected;
            const acceptedLotAllocations = normalizeReceivingLotAllocations(
                accepted,
                item.accepted_lot_allocations.map(allocation => ({
                    storageLotId: allocation.storage_lot_id,
                    quantity: allocation.quantity
                })),
                item.lot_id
            );
            const allocationError = receivingLotAllocationError(accepted, acceptedLotAllocations, item.lot_id);
            if (allocationError) throw new ReceivingError(`${allocationError} Product ${productId}.`, 400);
            const rejectedLotAllocations = normalizeRejectedLotAllocations(
                rejected,
                item.rejected_lot_allocations.map(allocation => ({
                    storageLotId: allocation.storage_lot_id,
                    quantity: allocation.quantity
                })),
                item.lot_id
            );
            const rejectedAllocationError = rejectedLotAllocationError(rejected, rejectedLotAllocations, item.lot_id);
            if (rejectedAllocationError) throw new ReceivingError(`${rejectedAllocationError} Product ${productId}.`, 400);
            const primaryLotId = item.lot_id || acceptedLotAllocations[0]?.storageLotId || rejectedLotAllocations[0]?.storageLotId;
            if (!primaryLotId) throw new ReceivingError(`A storage lot is required for product ${productId}.`, 400);
            return { item, poLine, product, productId, received, accepted, rejected, baseUnitCost, acceptedLotAllocations, rejectedLotAllocations, primaryLotId };
        });

        const preparedByLine = new Map(prepared.map(line => [line.item.line_id, line]));
        const incompleteFullLines = poLines.filter(poLine => {
            const lineId = Number(poLine.purchase_order_product_id);
            const previous = previouslyReceivedByLine.get(lineId)?.received || 0;
            const current = preparedByLine.get(lineId)?.received || 0;
            return previous + current < Number(poLine.ordered_quantity || 0) - 1e-9;
        });
        const allLinesAccounted = incompleteFullLines.length === 0;
        if (receiptMode === "full" && !allLinesAccounted) {
            const details = incompleteFullLines.map(poLine => {
                const lineId = Number(poLine.purchase_order_product_id);
                const previous = previouslyReceivedByLine.get(lineId)?.received || 0;
                const current = preparedByLine.get(lineId)?.received || 0;
                const remaining = Math.max(0, Number(poLine.ordered_quantity || 0) - previous);
                return `${lineId} (remaining ${remaining}, received ${current})`;
            });
            throw new ReceivingError(`Full receipt requires every purchase-order line to account for its remaining quantity. Incomplete line(s): ${details.join(", ")}.`, 400);
        }
        if (receiptMode === "partial" && allLinesAccounted) {
            throw new ReceivingError("This receipt completes the purchase order. Select Full Receipt instead.", 400);
        }

        const expenses = await fetchShipmentExpenses(shipmentId);
        const allocationMethod = normalizeAllocationMethod(String(expenses[0]?.allocation_method || "Value"));
        const allocations = calculateLandedCostAllocations(prepared.map(line => ({
            key: line.item.line_id,
            quantity: line.accepted,
            baseUnitCost: line.baseUnitCost,
            weight: Number(line.product.weight || line.product.product_weight || 0),
            volume: Number(line.product.cbm_height || 0) * Number(line.product.cbm_width || 0) * Number(line.product.cbm_length || 0)
        })), expenses.reduce((sum, expense) => sum + Number(expense.amount_php || 0), 0), allocationMethod);

        const receivingBranch = branches.find(branch => Number(branch.id) === branchId)!;
        const badKeywords = ["bad", "quarantine", "holding", "damaged"];
        const badBranches = branches.filter(branch => badKeywords.some(keyword => `${branch.branch_name} ${branch.branch_code}`.toLowerCase().includes(keyword)));
        const prefix = receivingBranch.branch_name.toLowerCase().replace(/\b(branch|hub|warehouse|plant|store)\b.*/i, "").trim();
        const badBranch = badBranches.find(branch => branch.branch_code.toUpperCase() === `${receivingBranch.branch_code.toUpperCase()}-BAD`)
            || badBranches.find(branch => prefix && branch.branch_name.toLowerCase().startsWith(prefix))
            || badBranches[0];
        if (prepared.some(line => line.rejected > 0) && !badBranch) throw new ReceivingError("No quarantine branch is configured for rejected stock.", 400);

        const receiptIds: number[] = [];
        const pendingMovements: PendingMovement[] = [];
        const allocationChanges: AllocationChange[] = [];
        let finalMovements: FinalReceivingMovement[] = [];
        let finalAllocations: FinalReceivingAllocation[] = [];
        let movementWriteAttempted = false;
        let commitPhase: "receiving" | "inventory" | "movements" | "allocations" | "status" = "receiving";
        const lineChanges: Array<{ id: number; received: unknown }> = [];
        const productChanges = new Map<number, { cost_per_unit: unknown; estimated_unit_cost: unknown }>();

        const rollback = async () => {
            for (const [productId, previous] of [...productChanges.entries()].reverse()) {
                const response = await mutate("products", productId, "PATCH", previous);
                if (!response.ok) return false;
            }
            const headerRestore = await mutate("purchase_order", shipmentId, "PATCH", {
                inventory_status: shipment.inventory_status,
                date_received: shipment.date_received
            });
            if (!headerRestore.ok) return false;
            for (const change of [...lineChanges].reverse()) await mutate("purchase_order_products", change.id, "PATCH", { received: change.received });
            for (const id of [...receiptIds].reverse()) await mutate("purchase_order_receiving", id, "DELETE");
            return true;
        };

        try {
            commitPhase = "receiving";
            for (const line of prepared) {
                const allocation = allocations.get(line.item.line_id)!;
                const receiptRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving`, { method: "POST", headers, body: JSON.stringify({
                    purchase_order_id: shipmentId, purchase_order_line_id: line.item.line_id, product_id: line.productId, batch_no: line.item.batch_no, lot_id: line.primaryLotId,
                    expiry_date: line.item.expiration_date, received_quantity: line.received, unit_price: line.baseUnitCost,
                    discounted_amount: Number(line.poLine.discounted_amount || 0), discount_type: line.poLine.discount_type || null,
                    total_amount: Number(line.poLine.net_amount ?? line.poLine.total_amount ?? 0), allocated_expense_php: allocation.allocatedExpense,
                    final_landed_unit_cost: allocation.finalLandedUnitCost, branch_id: branchId,
                    receipt_no: receiptNumberForLine(referenceNumber, line.item.line_id), received_date: new Date().toISOString(),
                    isPosted: 1, qa_status: line.item.qa_status, quantity_rejected: line.rejected, rejection_reason: line.item.rejection_reason
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
                    remarks: string | null
                ) => {
                    if (!inventoryLotId || quantity <= 0) return;
                    pendingMovements.push({
                        lineId: line.item.line_id,
                        kind,
                        receivingLineId: receiptId,
                        inventoryLotId,
                        productId: line.productId,
                        storageLotId,
                        branchId: targetBranchId,
                        transactionTypeId,
                        sourceDocumentNo: receiptNo,
                        quantity,
                        payload: {
                            product_id: line.productId,
                            lot_id: storageLotId,
                            branch_id: targetBranchId,
                            transaction_type_id: transactionTypeId,
                            source_document_id: receiptId,
                            source_document_no: receiptNo,
                            batch_no: line.item.batch_no,
                            expiry_date: line.item.expiration_date,
                            manufacturing_date: line.item.manufacturing_date || null,
                            version_id: null,
                            quantity,
                            created_by: options.actorUserId,
                            remarks
                        }
                    });
                };
                for (const acceptedAllocation of line.acceptedLotAllocations) {
                    const inventoryLotId = await saveInventory(branchId, acceptedAllocation.storageLotId, acceptedAllocation.quantity, "Passed", null);
                    addPendingMovement("Passed", inventoryLotId, branchId, acceptedAllocation.storageLotId, passedMovementTypeId, acceptedAllocation.quantity, line.item.rejection_reason);
                }
                if (rejectedMovementTypeId) {
                    for (const rejectedAllocation of line.rejectedLotAllocations) {
                        const inventoryLotId = await saveInventory(Number(badBranch?.id), rejectedAllocation.storageLotId, rejectedAllocation.quantity, "Rejected", line.item.rejection_reason);
                        addPendingMovement("Rejected", inventoryLotId, Number(badBranch?.id), rejectedAllocation.storageLotId, rejectedMovementTypeId, rejectedAllocation.quantity, line.item.rejection_reason);
                    }
                }
                const cumulativeReceived = (previouslyReceivedByLine.get(line.item.line_id)?.received || 0) + line.received;
                lineChanges.push({ id: line.item.line_id, received: line.poLine.received });
                const lineUpdateRes = await mutate("purchase_order_products", line.item.line_id, "PATCH", { received: cumulativeReceived >= Number(line.poLine.ordered_quantity || 0) ? 1 : 0 });
                if (!lineUpdateRes.ok) throw new Error(`Failed to mark line ${line.item.line_id} as received.`);
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
            const movementRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?fields=movement_id,product_id,lot_id,branch_id,transaction_type_id,source_document_id,source_document_no,batch_no,quantity,version_id`, {
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

            const totalAccepted = poLines.reduce((sum, poLine) => {
                const previous = previouslyReceivedByLine.get(Number(poLine.purchase_order_product_id));
                const current = prepared.find(line => line.item.line_id === Number(poLine.purchase_order_product_id));
                return sum + Math.max(0, (previous?.received || 0) - (previous?.rejected || 0)) + (current?.accepted || 0);
            }, 0);
            const allRejected = allLinesAccounted && totalAccepted <= 1e-9;
            commitPhase = "status";
            const statusRes = await mutate("purchase_order", shipmentId, "PATCH", {
                inventory_status: !allLinesAccounted
                    ? INVENTORY_STATUS.PARTIALLY_RECEIVED
                    : allRejected
                        ? INVENTORY_STATUS.REJECTED
                        : INVENTORY_STATUS.RECEIVED,
                ...(allLinesAccounted ? { date_received: todayInManila() } : {})
            });
            if (!statusRes.ok) throw new Error(`Failed to update purchase-order status (${statusRes.status}).`);
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
                : error instanceof QaResultPersistenceError
                    ? error.status
                    : 500
        });
    } finally {
        if (lockedShipmentId !== null) activeShipments.delete(lockedShipmentId);
    }
}
