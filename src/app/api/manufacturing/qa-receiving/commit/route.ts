import { NextResponse } from "next/server";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import { procurementDirectusFetch } from "../../procurement/_directus";
import { INVENTORY_STATUS, PAYMENT_STATUS } from "../../procurement/_domain";
import { handleQaReceivingPost } from "../../procurement/qa-receiving/_receiving-service";
import {
    RECEIVING_POSTING_ENABLED,
    receivingCommitRequestSchema,
    type FinalReceivingMovement,
    type FinalReceivingAllocation,
    type FinalReceivingRecord,
    type ReceivingCommitRequest,
    type ReceivingCommitResult,
    receiptNumberForLine
} from "../_commit-contract";
import type { ReceivingPreviewResult } from "../_preview-domain";
import { POST as previewReceiving } from "../preview/route";
import { normalizeReceivingLotAllocations, normalizeRejectedLotAllocations } from "../_lot-allocation";
import { fetchQaResults, qaResultsMatch, type QaResultExpectation } from "../../procurement/qa-receiving/_qa-results";
import {
    completeReplacementDisposition,
    fetchQuarantineDisposition,
    QuarantineDispositionError
} from "../_quarantine-disposition";
import {
    allocateReceivingTicket,
    fetchReceivingTicketByIdempotencyKey,
    markReceivingTicketFailed,
    markReceivingTicketPosted,
    ReceivingTicketError
} from "../_receiving-ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class CommitError extends Error {
    constructor(readonly statusCode: number, message: string) { super(message); }
}

function rows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray(body.data)
        ? body.data as Record<string, unknown>[]
        : [];
}

function relationId(value: unknown, key: string): number {
    return Number(value && typeof value === "object" ? (value as Record<string, unknown>)[key] : value);
}

async function directusRows(path: string, message: string) {
    const response = await procurementDirectusFetch(path);
    if (!response.ok) throw new CommitError(503, message);
    return rows(await response.json());
}

async function assertReceivingStatusOpen(shipmentId: number, replacementDispositionId?: number | null) {
    const headerRows = await directusRows(
        `/items/purchase_order?filter[purchase_order_id][_eq]=${shipmentId}&fields=purchase_order_id,inventory_status&limit=1`,
        "Unable to verify the current purchase-order status."
    );
    const status = Number(headerRows[0]?.inventory_status);
    if (replacementDispositionId) return;
    if (status === INVENTORY_STATUS.RECEIVED) return;
    if (status !== INVENTORY_STATUS.FOR_PICKUP && status !== INVENTORY_STATUS.PARTIALLY_RECEIVED) {
        throw new CommitError(409, "The purchase order must be in Receiving (QA) before it can be received.");
    }
}

async function inventoryRowsForMovements(shipmentId: number, movementRows: Record<string, unknown>[]) {
    if (movementRows.length === 0) return [];

    const storageLotIds = [...new Set(movementRows
        .map(row => relationId(row.lot_id, "lot_id"))
        .filter(id => Number.isSafeInteger(id) && id > 0))];

    if (storageLotIds.length === 0) return [];

    const lotParams = new URLSearchParams({
        "filter[lot_id][_in]": storageLotIds.join(","),
        fields: "lot_id,lot_name",
        limit: "-1"
    });
    return directusRows(
        `/items/lots?${lotParams.toString()}`,
        `Unable to verify the created inventory records for purchase order ${shipmentId}.`
    );
}

async function movementRowsForCommit(
    receivingIds: number[],
    receiptNumbers: string[],
    expectedMovementCount: number
) {
    if (expectedMovementCount === 0) return [];

    const movementFields = "movement_id,product_id,lot_id,branch_id,transaction_type_id,source_document_id,source_document_no,batch_no,quantity,version_id";
    const sourceIdParams = new URLSearchParams({
        "filter[source_document_id][_in]": receivingIds.join(","),
        fields: movementFields,
        limit: "-1"
    });
    let sourceIdRows: Record<string, unknown>[] = [];
    try {
        sourceIdRows = await directusRows(
            `/items/inventory_movements?${sourceIdParams.toString()}`,
            "Unable to verify the created inventory movements."
        );
    } catch {
        sourceIdRows = [];
    }
    if (sourceIdRows.length === expectedMovementCount) return sourceIdRows;

    const sourceNumberParams = new URLSearchParams({
        "filter[source_document_no][_in]": receiptNumbers.join(","),
        fields: movementFields,
        limit: "-1"
    });
    const sourceNumberRows = await directusRows(
        `/items/inventory_movements?${sourceNumberParams.toString()}`,
        "Unable to verify the created inventory movements."
    );
    return sourceNumberRows.length > 0 ? sourceNumberRows : sourceIdRows;
}

async function allocationRowsForReceiving(receivingIds: number[]) {
    if (receivingIds.length === 0) return [];
    try {
        const params = new URLSearchParams({
            "filter[purchase_order_receiving_id][_in]": receivingIds.join(","),
            fields: "id,jo_material_reservation_id,product_id,jo_material_id,purchase_order_receiving_id,reserved_quantity",
            limit: "-1"
        });
        return await directusRows(
            `/items/manufacturing_job_order_materials_reservations?${params.toString()}`,
            "Unable to verify the created MRP allocations."
        );
    } catch {
        return [];
    }
}

function statusLabel(status: number): "Partially Received" | "Received" | "Rejected" {
    if (status === INVENTORY_STATUS.PARTIALLY_RECEIVED) return "Partially Received";
    if (status === INVENTORY_STATUS.REJECTED) return "Rejected";
    if (status === INVENTORY_STATUS.RECEIVED) return "Received";
    throw new CommitError(500, "Receiving records were posted but the purchase order did not reach a terminal receiving status.");
}

async function persistedResult(
    input: ReceivingCommitRequest,
    receivingTicketNumber: string,
    idempotentReplay: boolean,
    expectedAllocationLineIds: Set<number> = new Set()
): Promise<ReceivingCommitResult | null> {
    const receiptNumbers = input.lines.map(line => receiptNumberForLine(receivingTicketNumber, line.lineId));
    const receiptParams = new URLSearchParams({
        "filter[receipt_no][_in]": receiptNumbers.join(","),
        fields: "purchase_order_product_id,purchase_order_id,receipt_no,product_id,branch_id,lot_id,batch_no,received_quantity,quantity_rejected,is_over_received,over_delivery_quantity,unit_price,final_landed_unit_cost,qa_status,expiry_date,received_date,is_replacement,quarantine_disposition_id",
        limit: "-1"
    });
    const [headerRows, receivingRows] = await Promise.all([
        directusRows(
            `/items/purchase_order?filter[purchase_order_id][_eq]=${input.shipmentId}&fields=purchase_order_id,inventory_status,payment_status,workflow_revision&limit=1`,
            "Unable to verify the final purchase-order status."
        ),
        directusRows(`/items/purchase_order_receiving?${receiptParams}`, "Unable to verify the created receiving records.")
    ]);
    const header = headerRows[0];
    if (!header) throw new CommitError(404, "Purchase order not found.");
    const status = Number(header.inventory_status);
    const receivingPosted = status === INVENTORY_STATUS.PARTIALLY_RECEIVED
        || status === INVENTORY_STATUS.RECEIVED
        || status === INVENTORY_STATUS.REJECTED;
    if (!receivingPosted) return null;
    if (status === INVENTORY_STATUS.RECEIVED && Number(header.payment_status) !== PAYMENT_STATUS.AWAITING_PAYMENT) {
        throw new CommitError(409, "The purchase order was received but payment status is not Awaiting Payment. Reconciliation is required.");
    }
    if (
        receivingRows.length !== receiptNumbers.length
        || new Set(receivingRows.map(row => String(row.receipt_no))).size !== receiptNumbers.length
    ) {
        throw new CommitError(409, "The purchase order status changed but its receiving records are incomplete. Reconciliation is required.");
    }
    if (input.replacementDispositionId && receivingRows.some(row =>
        !(row.is_replacement === true || Number(row.is_replacement) === 1)
        || relationId(row.quarantine_disposition_id, "id") !== input.replacementDispositionId
    )) {
        throw new CommitError(409, "The replacement receiving record is not linked to its quarantine disposition. Reconciliation is required.");
    }
    const receivingIds = receivingRows.map(row => Number(row.purchase_order_product_id));
    if (receivingIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
        throw new CommitError(409, "The purchase order status changed but its receiving record IDs are invalid. Reconciliation is required.");
    }
    const qaRows = await fetchQaResults(receivingIds);
    const qaRowsByReceivingId = new Map<number, typeof qaRows>();
    for (const row of qaRows) {
        const existing = qaRowsByReceivingId.get(row.receiving_line_id) || [];
        existing.push(row);
        qaRowsByReceivingId.set(row.receiving_line_id, existing);
    }
    for (const line of input.lines) {
        const receiptNo = receiptNumberForLine(receivingTicketNumber, line.lineId);
        const receiving = receivingRows.find(row => String(row.receipt_no) === receiptNo);
        if (!receiving) {
            throw new CommitError(409, `Receiving record for line ${line.lineId} could not be correlated.`);
        }
        const receivingLineId = Number(receiving.purchase_order_product_id);
        if (!receivingLineId) {
            throw new CommitError(409, `Receiving record for line ${line.lineId} could not be correlated.`);
        }
        const isOverReceived = receiving.is_over_received === true || Number(receiving.is_over_received) === 1;
        if (isOverReceived && !input.processOverDelivery) {
            throw new CommitError(422, `Over-delivery for line ${line.lineId} requires explicit processing confirmation.`);
        }
        const expectedQa: QaResultExpectation[] = line.readings.map(reading => ({
            spec_id: reading.specId,
            actual_reading: reading.actualReading.trim()
        }));
        if (!qaResultsMatch(expectedQa, qaRowsByReceivingId.get(receivingLineId) || [])) {
            throw new CommitError(409, `The purchase order status changed but QA results for line ${line.lineId} are incomplete. Reconciliation is required.`);
        }
    }
    const expectedMovementCount = input.lines.reduce((count, line) =>
        count + normalizeReceivingLotAllocations(line.acceptedQuantity, line.acceptedLotAllocations, line.storageLotId).length
        + normalizeRejectedLotAllocations(line.rejectedQuantity, line.rejectedLotAllocations, line.storageLotId).length, 0);
    const movementRows = await movementRowsForCommit(receivingIds, receiptNumbers, expectedMovementCount);
    if (movementRows.length !== expectedMovementCount) {
        throw new CommitError(409, `The purchase order status changed but its inventory movements are incomplete (expected ${expectedMovementCount}, found ${movementRows.length}). Reconciliation is required.`);
    }
    const inventoryRows = await inventoryRowsForMovements(input.shipmentId, movementRows);
    const allocationRows = await allocationRowsForReceiving(receivingIds);
    const allocationMaterialIds = [...new Set(allocationRows
        .map(row => relationId(row.jo_material_id, "jo_material_id"))
        .filter(id => Number.isSafeInteger(id) && id > 0))];
    const allocationMaterialRows = allocationMaterialIds.length > 0
        ? await directusRows(
            `/items/manufacturing_job_order_materials?filter[jo_material_id][_in]=${allocationMaterialIds.join(",")}&fields=jo_material_id,job_order_id,product_id,allocated_quantity,reserved_quantity&limit=-1`,
            "Unable to verify the Job Order materials for the created MRP allocations."
        )
        : [];
    const materialById = new Map(allocationMaterialRows.map(row => [relationId(row.jo_material_id, "jo_material_id"), row]));
    let allMaterialAllocationRows: Record<string, unknown>[] = [];
    try {
        allMaterialAllocationRows = allocationMaterialIds.length > 0
            ? await directusRows(
                `/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_in]=${allocationMaterialIds.join(",")}&fields=jo_material_id,reserved_quantity&limit=-1`,
                "Unable to verify the Job Order reservation totals for the created MRP allocations."
            )
            : [];
    } catch {
        allMaterialAllocationRows = [];
    }
    const reservationTotalsByMaterial = new Map<number, number>();
    for (const row of allMaterialAllocationRows) {
        const materialId = relationId(row.jo_material_id, "jo_material_id");
        const quantity = Number(row.reserved_quantity || 0);
        if (Number.isSafeInteger(materialId) && materialId > 0 && Number.isFinite(quantity)) {
            reservationTotalsByMaterial.set(materialId, (reservationTotalsByMaterial.get(materialId) || 0) + quantity);
        }
    }
    for (const materialId of allocationMaterialIds) {
        const material = materialById.get(materialId);
        const allocatedQuantity = Number(material?.allocated_quantity || 0);
        const reservedQuantity = Number(material?.reserved_quantity || 0);
        const persistedReservationTotal = reservationTotalsByMaterial.get(materialId) || 0;
        if (!material
            || !Number.isFinite(allocatedQuantity)
            || !Number.isFinite(reservedQuantity)
            || !Number.isFinite(persistedReservationTotal)
            || reservedQuantity < -1e-9
            || reservedQuantity > allocatedQuantity + 1e-9
            || Math.abs(reservedQuantity - persistedReservationTotal) > 1e-9) {
            throw new CommitError(409, `Job-order material ${materialId} reservation totals are inconsistent. Reconciliation is required.`);
        }
    }
    const finalMovements: FinalReceivingMovement[] = [];
    const finalAllocations: FinalReceivingAllocation[] = [];
    const receivingRecords: FinalReceivingRecord[] = [];
    for (const line of input.lines) {
        const acceptedLotAllocations = normalizeReceivingLotAllocations(line.acceptedQuantity, line.acceptedLotAllocations, line.storageLotId);
        const rejectedLotAllocations = normalizeRejectedLotAllocations(line.rejectedQuantity, line.rejectedLotAllocations, line.storageLotId);
        const receiptNo = receiptNumberForLine(receivingTicketNumber, line.lineId);
        const receiving = receivingRows.find(row => row.receipt_no === receiptNo);
        const receivingLineId = Number(receiving?.purchase_order_product_id);
        if (!receiving || !receivingLineId) {
            throw new CommitError(409, `Receiving record for line ${line.lineId} could not be correlated.`);
        }
        const isOverReceived = receiving.is_over_received === true || Number(receiving.is_over_received) === 1;
        const candidates = movementRows.filter(row =>
            relationId(row.source_document_id, "purchase_order_product_id") === receivingLineId
            || String(row.source_document_no || "") === receiptNo
        );
        const routeInputs = [
            ...acceptedLotAllocations.map(allocation => ({
                kind: "Passed" as const,
                quantity: allocation.quantity,
                storageLotId: allocation.storageLotId,
                passed: true
            })),
            ...rejectedLotAllocations.map(allocation => ({
                kind: "Rejected" as const,
                quantity: allocation.quantity,
                storageLotId: allocation.storageLotId,
                passed: false
            }))
        ];

        for (const route of routeInputs) {
            const matches = candidates.filter(row => {
                const branchId = relationId(row.branch_id, "id");
                return (route.passed ? branchId === input.destinationBranchId : branchId !== input.destinationBranchId)
                    && Number(row.quantity) === route.quantity
                    && relationId(row.lot_id, "lot_id") === route.storageLotId
                    && String(row.source_document_no || "") === receiptNo;
            });
            if (matches.length !== 1) {
                throw new CommitError(409, `${route.kind} movement for line ${line.lineId} could not be correlated uniquely.`);
            }
            const movement = matches[0];
            if (movement.version_id !== null) {
                throw new CommitError(409, `${route.kind} movement for line ${line.lineId} has an unexpected BOM version. Reconciliation is required.`);
            }
            const branchId = relationId(movement.branch_id, "id");
            const productId = relationId(movement.product_id, "product_id");
            const storageLotId = relationId(movement.lot_id, "lot_id");
            const inventoryMatches = inventoryRows.filter(row =>
                relationId(row.lot_id || row.id, "lot_id") === storageLotId
            );
            if (inventoryMatches.length !== 1) {
                throw new CommitError(409, `${route.kind} inventory lot for line ${line.lineId} could not be correlated uniquely.`);
            }
            finalMovements.push({
                movementId: Number(movement.movement_id),
                lineId: line.lineId,
                kind: route.kind,
                receivingLineId,
                inventoryLotId: Number(inventoryMatches[0].lot_id || inventoryMatches[0].id),
                productId,
                storageLotId,
                branchId,
                transactionTypeId: relationId(movement.transaction_type_id, "transaction_type_id"),
                sourceDocumentNo: receiptNo,
                quantity: route.quantity
            });
        }

        const lineAllocations = allocationRows.filter(row => relationId(row.purchase_order_receiving_id, "purchase_order_product_id") === receivingLineId);
        if (expectedAllocationLineIds.has(line.lineId) && lineAllocations.length === 0) {
            throw new CommitError(409, `MRP allocations for line ${line.lineId} are incomplete. Reconciliation is required.`);
        }
        for (const allocation of lineAllocations) {
            const allocationId = Number(allocation.jo_materials_reservation_id || allocation.id);
            const materialId = relationId(allocation.jo_material_id, "jo_material_id");
            const material = materialById.get(materialId);
            const allocationProductId = relationId(allocation.product_id, "product_id") || relationId(material?.product_id, "product_id");
            const allocationJobOrderId = relationId(material?.job_order_id, "job_order_id");
            const quantity = Number(allocation.reserved_quantity || 0);
            if (!Number.isSafeInteger(allocationId) || allocationId <= 0 || !material || !Number.isSafeInteger(materialId) || materialId <= 0 || !Number.isSafeInteger(allocationJobOrderId) || allocationJobOrderId <= 0 || !Number.isSafeInteger(allocationProductId) || allocationProductId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
                throw new CommitError(409, `MRP allocation for line ${line.lineId} is invalid. Reconciliation is required.`);
            }
            finalAllocations.push({
                allocationId,
                lineId: line.lineId,
                receivingLineId,
                purchaseOrderReceivingId: receivingLineId,
                jobOrderId: allocationJobOrderId,
                jobOrderMaterialId: materialId,
                productId: allocationProductId,
                quantity,
                inventoryLotIds: [...new Set(finalMovements
                    .filter(movement => movement.receivingLineId === receivingLineId && movement.kind === "Passed")
                    .map(movement => movement.inventoryLotId))]
            });
        }

        receivingRecords.push({
            receivingRecordId: receivingLineId,
            lineId: line.lineId,
            shipmentId: relationId(receiving.purchase_order_id, "purchase_order_id") || input.shipmentId,
            productId: relationId(receiving.product_id, "product_id"),
            receiptNumber: String(receiving.receipt_no),
            branchId: relationId(receiving.branch_id, "id"),
            storageLotId: relationId(receiving.lot_id, "lot_id"),
            batchNumber: String(receiving.batch_no || line.supplierBatchNumber),
            receivedQuantity: Number(receiving.received_quantity || 0),
            rejectedQuantity: Number(receiving.quantity_rejected || 0),
            isOverReceived,
            overDeliveryQuantity: Number(receiving.over_delivery_quantity || 0),
            unitPrice: Number(receiving.unit_price || 0),
            finalLandedUnitCost: Number(receiving.final_landed_unit_cost || 0),
            qaStatus: String(receiving.qa_status || ""),
            expirationDate: receiving.expiry_date ? String(receiving.expiry_date) : null,
            receivedDate: receiving.received_date ? String(receiving.received_date) : null,
            inventoryLotIds: [...new Set(finalMovements
                .filter(movement => movement.receivingLineId === receivingLineId)
                .map(movement => movement.inventoryLotId))],
            qaResultIds: (qaRowsByReceivingId.get(receivingLineId) || []).map(row => row.result_id),
            allocationIds: lineAllocations.map(row => Number(row.jo_materials_reservation_id || row.id)).filter(id => Number.isSafeInteger(id) && id > 0)
        });
    }
    return {
        contractVersion: "v1",
        mode: "compatibility",
        commitReference: receivingTicketNumber,
        receivingTicketNumber,
        idempotentReplay,
        shipmentId: input.shipmentId,
        status: statusLabel(status),
        paymentStatus: Number.isFinite(Number(header.payment_status)) ? Number(header.payment_status) : null,
        workflowRevision: Number(header.workflow_revision || input.workflowRevision),
        receivingRecordIds: receivingIds,
        inventoryLotIds: [...new Set(finalMovements.map(movement => movement.inventoryLotId))],
        allocationIds: finalAllocations.map(allocation => allocation.allocationId),
        receiptNumbers: [...new Set(receiptNumbers)],
        receivingRecords,
        movements: finalMovements,
        allocations: finalAllocations
    };
}

async function settleReplacementAfterReceiving(
    dispositionId: number | null | undefined,
    result: ReceivingCommitResult,
    actorUserId: number,
    operationKey: string
) {
    if (!dispositionId) return null;
    const disposition = await fetchQuarantineDisposition(dispositionId);
    const receiving = result.receivingRecords.find(record => record.lineId === disposition.purchaseOrderLineId);
    if (!receiving) throw new CommitError(409, "The replacement receipt could not be linked to its quarantine line.");
    return completeReplacementDisposition({
        dispositionId,
        acceptedQuantity: Math.max(0, receiving.receivedQuantity - receiving.rejectedQuantity),
        replacementReceivingId: receiving.receivingRecordId,
        operationKey,
        actorUserId
    });
}

export async function POST(request: Request) {
    let allocatedTicketId: number | null = null;
    let ticketPosted = false;
    try {
        if (!RECEIVING_POSTING_ENABLED) throw new CommitError(503, "Receiving posting is not enabled.");
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || "";
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
            throw new CommitError(400, "A valid UUID Idempotency-Key header is required.");
        }
        const parsed = receivingCommitRequestSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid receiving commit request.", details: parsed.error.flatten() }, { status: 400 });
        }
        await assertReceivingStatusOpen(parsed.data.shipmentId, parsed.data.replacementDispositionId);
        const existingTicket = await fetchReceivingTicketByIdempotencyKey(idempotencyKey);
        if (existingTicket?.posting_status === "Posted" && existingTicket.receiving_ticket_no) {
            const completed = await persistedResult(parsed.data, existingTicket.receiving_ticket_no, true);
            if (completed) {
                await settleReplacementAfterReceiving(parsed.data.replacementDispositionId, completed, actor.userId, idempotencyKey);
                return NextResponse.json({ data: completed });
            }
        }
        if (existingTicket?.posting_status === "Reserved") {
            throw new CommitError(409, "A receiving commit with this idempotency key is already in progress.");
        }
        if (existingTicket?.posting_status === "Failed") {
            throw new CommitError(409, "The previous receiving attempt failed. Generate a new preview before posting.");
        }

        const previewResponse = await previewReceiving(new Request(request.url.replace(/\/commit$/, "/preview"), {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" },
            body: JSON.stringify({
                shipmentId: parsed.data.shipmentId,
                receiptMode: parsed.data.receiptMode,
                processOverDelivery: parsed.data.processOverDelivery,
                replacementDispositionId: parsed.data.replacementDispositionId || null,
                destinationBranchId: parsed.data.destinationBranchId,
                lines: parsed.data.lines
            })
        }));
        const previewBody = await previewResponse.json();
        if (!previewResponse.ok) throw new CommitError(previewResponse.status, previewBody.error || "Receiving validation failed.");
        const preview = previewBody.data as ReceivingPreviewResult;
        if (preview.workflowRevision !== parsed.data.workflowRevision) {
            throw new CommitError(409, "The purchase order changed after preview. Generate a new preview before posting.");
        }

        const poLineParams = new URLSearchParams({
            "filter[purchase_order_id][_eq]": String(parsed.data.shipmentId),
            fields: "purchase_order_product_id,ordered_quantity",
            limit: "-1"
        });
        const poLines = await directusRows(
            `/items/purchase_order_products?${poLineParams}`,
            "Unable to verify complete purchase-order quantities."
        );
        const previewByLine = new Map(preview.lines.map(line => [line.lineId, line]));
        if (poLines.length === 0 || (!parsed.data.replacementDispositionId && poLines.length !== preview.lines.length)) {
            throw new CommitError(422, "Every purchase-order line must be included before final receiving can be posted.");
        }
        for (const poLine of poLines) {
            const lineId = Number(poLine.purchase_order_product_id);
            const ordered = Number(poLine.ordered_quantity || 0);
            const previewLine = previewByLine.get(lineId);
            if (!Number.isFinite(ordered) || ordered <= 0 || !previewLine) {
                throw new CommitError(422, `Line ${lineId} is invalid for receiving.`);
            }
        }

        const requestLineById = new Map(parsed.data.lines.map(line => [line.lineId, line]));
        const mrpAllocationDrafts = parsed.data.replacementDispositionId
            ? []
            : preview.lines.flatMap(result => {
            const line = requestLineById.get(result.lineId);
            if (!line) return [];
            return result.routes.flatMap(route => route.allocationDrafts.map(allocation => ({
                line_id: result.lineId,
                product_id: line.productId,
                job_order_id: allocation.jobOrder.id,
                job_order_material_id: allocation.jobOrderMaterialId,
                quantity: allocation.quantity
                })));
            });
        const receivingTicket = await allocateReceivingTicket({
            purchaseOrderId: parsed.data.shipmentId,
            branchId: parsed.data.destinationBranchId,
            receiptMode: parsed.data.receiptMode,
            workflowRevision: parsed.data.workflowRevision,
            idempotencyKey,
            createdBy: actor.userId
        });
        allocatedTicketId = receivingTicket.id;
        if (!receivingTicket.receiving_ticket_no) {
            throw new CommitError(503, "The receiving ticket number was not generated.");
        }
        if (receivingTicket.posting_status === "Posted") {
            ticketPosted = true;
            const completed = await persistedResult(parsed.data, receivingTicket.receiving_ticket_no, true, new Set(mrpAllocationDrafts.map(draft => draft.line_id)));
            if (completed) {
                await settleReplacementAfterReceiving(parsed.data.replacementDispositionId, completed, actor.userId, idempotencyKey);
                return NextResponse.json({ data: completed });
            }
            throw new CommitError(409, "The existing receiving ticket could not be reconciled with its persisted records.");
        }
        const legacyResponse = await handleQaReceivingPost(new Request(request.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shipmentId: parsed.data.shipmentId,
                replacementDispositionId: parsed.data.replacementDispositionId || null,
                referenceNumber: receivingTicket.receiving_ticket_no,
                receiptMode: parsed.data.receiptMode,
                processOverDelivery: parsed.data.processOverDelivery,
                branchId: parsed.data.destinationBranchId,
                branchName: preview.destinationBranch.name,
                mrp_allocation_drafts: mrpAllocationDrafts,
                lineItemUpdates: preview.lines.map(result => {
                    const line = requestLineById.get(result.lineId)!;
                    return {
                        line_id: result.lineId,
                        product_id: line.productId,
                        quantity_received: result.receivedQuantity,
                        quantity_accepted: result.acceptedQuantity,
                        quantity_rejected: result.rejectedQuantity,
                        batch_no: line.supplierBatchNumber,
                        lot_id: line.storageLotId || line.acceptedLotAllocations[0]?.storageLotId || line.rejectedLotAllocations[0]?.storageLotId,
                        accepted_lot_allocations: line.acceptedLotAllocations.map(allocation => ({
                            storage_lot_id: allocation.storageLotId,
                            quantity: allocation.quantity
                        })),
                        rejected_lot_allocations: line.rejectedLotAllocations.map(allocation => ({
                            storage_lot_id: allocation.storageLotId,
                            quantity: allocation.quantity
                        })),
                        qa_results: result.evaluations.map(evaluation => ({
                            spec_id: evaluation.specId,
                            actual_reading: line.readings.find(reading => reading.specId === evaluation.specId)?.actualReading || "",
                            is_passed: evaluation.status === "passed"
                        })),
                        manufacturing_date: line.manufacturingDate,
                        expiration_date: line.expiryDate,
                        rejection_reason: result.rejectionReason || line.remarks,
                        qa_status: result.acceptedQuantity === 0
                            ? "Rejected"
                            : result.rejectedQuantity > 0
                                ? "Partially Accepted"
                                : "Passed"
                    };
                })
            })
        }), { actorUserId: actor.userId, receivingHeaderId: receivingTicket.id, replacementDispositionId: parsed.data.replacementDispositionId });
        const legacyBody = await legacyResponse.json();
        if (!legacyResponse.ok) {
            throw new CommitError(legacyResponse.status, legacyBody.error || "Failed to post receiving records.");
        }

        const committed = await persistedResult(
            parsed.data,
            receivingTicket.receiving_ticket_no,
            legacyBody.idempotent === true,
            new Set(mrpAllocationDrafts.map(draft => draft.line_id))
        );
        if (!committed) {
            throw new CommitError(500, "Receiving completed but persisted records could not be fully verified. Reconciliation is required.");
        }
        await settleReplacementAfterReceiving(parsed.data.replacementDispositionId, committed, actor.userId, idempotencyKey);
        await markReceivingTicketPosted(receivingTicket.id);
        ticketPosted = true;
        return NextResponse.json({ data: committed }, { status: legacyBody.idempotent ? 200 : 201 });
    } catch (error) {
        if (allocatedTicketId && !ticketPosted) {
            await markReceivingTicketFailed(allocatedTicketId).catch(() => false);
        }
        const status = error instanceof PurchaseOrderAuthorizationError
            ? error.status
            : error instanceof QuarantineDispositionError
                ? error.statusCode
            : error instanceof CommitError
                ? error.statusCode
                : error instanceof ReceivingTicketError
                    ? error.statusCode
                : 500;
        return NextResponse.json({ error: (error as Error).message || "Failed to post receiving." }, { status });
    }
}
