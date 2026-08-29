import { NextResponse } from "next/server";
import { RECEIVING_QUEUE_INVENTORY_STATUS_IDS } from "../../procurement/_domain";
import { procurementDirectusFetch } from "../../procurement/_directus";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import { fetchProductQaSpecifications, PurchaseQaConfigurationError } from "../../qa/_purchase-specifications";
import { evaluateQaChecklist } from "../../qa/_purchase-specification-domain";
import {
    applyQaDecision,
    deriveReceivingDisposition,
    evaluateOverDelivery,
    ReceivingQuantityError
} from "../../qa/_receiving-evaluation";
import {
    buildMrpAllocationDrafts,
    buildReceivingRoutes,
    type ReceivingMrpAllocationDraft,
    type ReceivingPreviewLineResult,
    type ReceivingRouteBranch,
    type ReceivingRouteTransactionType
} from "../_preview-domain";
import type { ReceivingLotAllocation } from "../_lot-allocation";
import { RECEIVING_POSTING_ENABLED, receivingPreviewRequestSchema } from "../_commit-contract";
import {
    normalizeReceivingLotAllocations,
    normalizeRejectedLotAllocations,
    receivingLotAllocationError,
    rejectedLotAllocationError
} from "../_lot-allocation";
import { summarizeReceivingHistory } from "../_receiving-history";
import { evaluateReceivingStatus, quantityStatusFromReceivingStatus } from "../_receiving-status";
import { sumMovementQuantitiesByStorageLot } from "../_movement-stock";
import {
    legacyToMmLotMap,
    loadMmLotMappings,
    loadMmLots,
    loadMovementRowsForLotRefs,
    MmLotCompatibilityError,
} from "../_mm-lot-compat";
import { QuarantineDispositionError, validateReplacementContext, type QuarantineDisposition } from "../_quarantine-disposition";
import { ProductCategoryTypeValidationError, resolveProductCategoryTypes, type PurchaseOrderCategoryType } from "../../procurement/_category-type";
import { forceReceivedIntakeMessage } from "../_force-received";
import { resolvePurchaseOrderBranchId } from "../_purchase-order-branch";
import { ReceivingDocumentTypeError, validateReceivingDocumentType } from "../_supplier-document-type";
import {
    allocationCapacityKey,
    evaluateLotCapacities,
    normalizeLotCapacity,
    type LotCapacityAllocationInput,
    type LotCapacityAllocationAudit
} from "../_lot-capacity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class ReceivingPreviewError extends Error {
    constructor(message: string, readonly status = 422) {
        super(message);
    }
}

interface DirectusBranch {
    id?: unknown;
    branch_name?: unknown;
    branch_code?: unknown;
    isActive?: unknown;
    isBadStock?: unknown;
    bad_stock_branch_id?: unknown;
}

interface DirectusMovementType {
    transaction_type_id?: unknown;
    type_name?: unknown;
    direction?: unknown;
    origin_table?: unknown;
}

interface DirectusJobOrder {
    job_order_id?: unknown;
    job_order_no?: unknown;
}

interface DirectusJobOrderMaterial {
    jo_material_id?: unknown;
    job_order_id?: unknown;
    product_id?: unknown;
    allocated_quantity?: unknown;
    reserved_quantity?: unknown;
}

interface DirectusProductAllocationMetadata {
    product_id?: unknown;
    product_type?: unknown;
    unit_of_measurement?: unknown;
}

function rows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray(body.data)
        ? body.data as Record<string, unknown>[]
        : [];
}

function positiveInteger(value: unknown, relationKey?: string): number | null {
    const raw = relationKey && value && typeof value === "object"
        ? (value as Record<string, unknown>)[relationKey]
        : value;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function relationId(value: unknown, keys: string[]): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const nested = relationId(record[key], keys);
            if (nested !== null) return nested;
        }
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function enabled(value: unknown): boolean {
    return value === true || Number(value) === 1;
}

function materialRequirement(material: DirectusJobOrderMaterial) {
    const jobOrderMaterialId = positiveInteger(material.jo_material_id);
    const allocatedQuantity = Number(material.allocated_quantity || 0);
    const reservedQuantity = Number(material.reserved_quantity || 0);
    if (!jobOrderMaterialId || !Number.isFinite(allocatedQuantity) || allocatedQuantity < 0 || !Number.isFinite(reservedQuantity) || reservedQuantity < 0) {
        throw new ReceivingPreviewError("A linked job-order material has invalid allocation quantities.", 503);
    }
    return {
        jobOrderMaterialId,
        remainingQuantity: Math.max(0, allocatedQuantity - reservedQuantity)
    };
}

function mapBranch(branch: DirectusBranch): ReceivingRouteBranch {
    const id = positiveInteger(branch.id);
    if (!id) throw new ReceivingPreviewError("Receiving branch configuration is invalid.", 503);
    return {
        id,
        name: String(branch.branch_name || "Unknown branch"),
        code: String(branch.branch_code || "N/A")
    };
}

function movementType(
    movementTypes: DirectusMovementType[],
    typeName: string
): ReceivingRouteTransactionType {
    const matches = movementTypes.filter(type =>
        type.type_name === typeName
        && type.direction === "IN"
        && type.origin_table === "purchase_order_receiving"
    );
    if (matches.length !== 1) {
        throw new ReceivingPreviewError(`Inventory movement type "${typeName}" is not configured uniquely.`, 503);
    }
    const id = positiveInteger(matches[0].transaction_type_id);
    if (!id) throw new ReceivingPreviewError(`Inventory movement type "${typeName}" has an invalid ID.`, 503);
    return { id, name: typeName };
}

async function loadBranch(branchId: number): Promise<DirectusBranch> {
    const params = new URLSearchParams({
        fields: "id,branch_name,branch_code,isActive,isBadStock,bad_stock_branch_id"
    });
    const response = await procurementDirectusFetch(`/items/branches/${branchId}?${params.toString()}`);
    if (response.status === 404) throw new ReceivingPreviewError("The selected receiving branch does not exist.");
    if (!response.ok) throw new ReceivingPreviewError("Unable to verify receiving branch configuration.", 503);
    const body = await response.json();
    if (!body?.data || typeof body.data !== "object") {
        throw new ReceivingPreviewError("The selected receiving branch does not exist.");
    }
    return body.data as DirectusBranch;
}

async function loadConfiguredBadStockBranch(source: DirectusBranch): Promise<DirectusBranch | null> {
    if (!source.bad_stock_branch_id) return null;
    if (typeof source.bad_stock_branch_id === "object") return source.bad_stock_branch_id as DirectusBranch;
    const id = positiveInteger(source.bad_stock_branch_id);
    return id ? loadBranch(id) : null;
}

export async function POST(request: Request) {
    try {
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        const parsed = receivingPreviewRequestSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid receiving preview request.", details: parsed.error.flatten() }, { status: 400 });
        }

        const { shipmentId, replacementDispositionId, receiptNumber, receiptDate, supplierDocumentTypeId, processOverDelivery, destinationBranchId, lines } = parsed.data;
        const replacementContext: { disposition: QuarantineDisposition; targetLineId: number } | null = replacementDispositionId
            ? await validateReplacementContext({
                dispositionId: replacementDispositionId,
                shipmentId,
                lines: lines.map(line => ({
                    lineId: line.lineId,
                    productId: line.productId,
                    receivedQuantity: line.receivedQuantity,
                    acceptedQuantity: line.acceptedQuantity
                }))
            })
            : null;
        const replacementFlow = Boolean(replacementContext);
        const supplierDocumentType = await validateReceivingDocumentType(supplierDocumentTypeId, replacementFlow);
        const previewSourceDocumentNo = receiptNumber;
        const lineIds = lines.map(line => line.lineId);
        if (new Set(lineIds).size !== lineIds.length) {
            throw new ReceivingPreviewError("Duplicate purchase-order lines are not allowed.");
        }
        if (!lines.some(line => line.receivedQuantity > 0)) {
            throw new ReceivingPreviewError("At least one line must have a positive received quantity.");
        }

        for (const line of lines) {
            const disposition = deriveReceivingDisposition(line);
            if (disposition === "Not Received") continue;
            const allocationError = receivingLotAllocationError(
                line.acceptedQuantity,
                line.acceptedLotAllocations
            );
            if (allocationError) throw new ReceivingPreviewError(`Line ${line.lineId}: ${allocationError}`);
            const rejectedAllocationError = rejectedLotAllocationError(
                line.rejectedQuantity,
                line.rejectedLotAllocations
            );
            if (rejectedAllocationError) throw new ReceivingPreviewError(`Line ${line.lineId}: ${rejectedAllocationError}`);
        }

        const requestedLotIds = [...new Set(lines
            .filter(line => line.receivedQuantity > 0)
            .flatMap(line => [
                ...normalizeReceivingLotAllocations(line.acceptedQuantity, line.acceptedLotAllocations)
                    .map(allocation => allocation.storageLotId),
                ...normalizeRejectedLotAllocations(line.rejectedQuantity, line.rejectedLotAllocations)
                    .map(allocation => allocation.storageLotId)
            ]))];
        const requestedProductIds = [...new Set(lines.map(line => line.productId))];
        const [headerResponse, lineResponse, receivingResponseWithLine, movementTypeResponse, productResponse] = await Promise.all([
            procurementDirectusFetch(`/items/purchase_order/${shipmentId}?fields=purchase_order_id,branch_id,inventory_status,workflow_revision,force_received_at`),
            procurementDirectusFetch(`/items/purchase_order_products?filter[purchase_order_id][_eq]=${shipmentId}&fields=purchase_order_product_id,purchase_order_id,product_id,purchase_intent,job_order_id,ordered_quantity&limit=-1`),
            procurementDirectusFetch(`/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,purchase_order_line_id,product_id,received_quantity,quantity_rejected,is_replacement&limit=-1`),
            procurementDirectusFetch("/items/inventory_transaction_types?fields=transaction_type_id,type_name,direction,origin_table&limit=-1"),
            procurementDirectusFetch(`/items/products?filter[product_id][_in]=${requestedProductIds.join(",")}&fields=product_id,product_type,unit_of_measurement.unit_id&limit=-1`)
        ]);
        let receivingResponse = receivingResponseWithLine;
        if (!receivingResponse.ok) {
            receivingResponse = await procurementDirectusFetch(`/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,product_id,received_quantity,quantity_rejected,is_replacement&limit=-1`);
        }
        if (headerResponse.status === 404) throw new ReceivingPreviewError("Purchase order not found.", 404);
        if (!headerResponse.ok || !lineResponse.ok || !receivingResponse.ok || !movementTypeResponse.ok || !productResponse.ok) {
            throw new ReceivingPreviewError("Unable to validate receiving preview reference data.", 503);
        }

        const header = (await headerResponse.json()).data as Record<string, unknown>;
        const purchaseOrderBranchId = resolvePurchaseOrderBranchId(header);
        if (!purchaseOrderBranchId) {
            throw new ReceivingPreviewError("The Purchase Order does not have a valid receiving branch.", 409);
        }
        if (purchaseOrderBranchId !== destinationBranchId) {
            throw new ReceivingPreviewError("Receiving Branch must match the Purchase Order branch.", 409);
        }
        const destinationBranch = await loadBranch(purchaseOrderBranchId);
        const forceClosedMessage = forceReceivedIntakeMessage(header.force_received_at);
        if (forceClosedMessage) throw new ReceivingPreviewError(forceClosedMessage, 409);
        const statusId = positiveInteger(header.inventory_status, "transaction_status_id") || Number(header.inventory_status);
        if (!replacementFlow && !RECEIVING_QUEUE_INVENTORY_STATUS_IDS.some(eligible => eligible === statusId)) {
            throw new ReceivingPreviewError("The purchase order must be moved to QA (Receiving) before it can be received.", 409);
        }
        if (!enabled(destinationBranch.isActive) || enabled(destinationBranch.isBadStock)) {
            throw new ReceivingPreviewError("Select an active standard branch as the receiving destination.");
        }

        const requestedAcceptedLotIds = [...new Set(lines
            .filter(line => line.receivedQuantity > 0)
            .flatMap(line => normalizeReceivingLotAllocations(line.acceptedQuantity, line.acceptedLotAllocations).map(allocation => allocation.storageLotId)))];
        const requestedRejectedLotIds = [...new Set(lines
            .filter(line => line.receivedQuantity > 0)
            .flatMap(line => normalizeRejectedLotAllocations(line.rejectedQuantity, line.rejectedLotAllocations).map(allocation => allocation.storageLotId)))];
        const badStockBranch = requestedRejectedLotIds.length > 0
            ? await loadConfiguredBadStockBranch(destinationBranch)
            : null;
        if (requestedRejectedLotIds.length > 0 && (!badStockBranch || !enabled(badStockBranch.isActive) || !enabled(badStockBranch.isBadStock))) {
            throw new ReceivingPreviewError("The selected destination has no active Bad Order branch configured for rejected inventory.");
        }
        const [acceptedStorageLots, rejectedStorageLots] = await Promise.all([
            requestedAcceptedLotIds.length > 0
                ? loadMmLots({ branchId: purchaseOrderBranchId, ids: requestedAcceptedLotIds, onlyActive: true })
                : Promise.resolve([]),
            requestedRejectedLotIds.length > 0 && badStockBranch
                ? loadMmLots({ branchId: positiveInteger(badStockBranch.id) as number, ids: requestedRejectedLotIds, onlyActive: true })
                : Promise.resolve([])
        ]);
        const storageLots = [...acceptedStorageLots, ...rejectedStorageLots];
        const lotBranchById = new Map<number, number>([
            ...acceptedStorageLots.map(lot => [Number(lot.lot_id), purchaseOrderBranchId] as const),
            ...rejectedStorageLots.map(lot => [Number(lot.lot_id), Number(badStockBranch?.id)] as const)
        ]);
        const storageLotIds = storageLots
            .map(lot => Number(lot.lot_id))
            .filter((id): id is number => Number.isSafeInteger(id) && id > 0);
        const [acceptedMappings, rejectedMappings] = await Promise.all([
            acceptedStorageLots.length > 0 ? loadMmLotMappings(acceptedStorageLots.map(lot => Number(lot.lot_id)), purchaseOrderBranchId) : Promise.resolve([]),
            rejectedStorageLots.length > 0 && badStockBranch
                ? loadMmLotMappings(rejectedStorageLots.map(lot => Number(lot.lot_id)), Number(badStockBranch.id))
                : Promise.resolve([])
        ]);
        const mappings = [...acceptedMappings, ...rejectedMappings];
        const mappingByMmLot = new Map(mappings.map(mapping => [mapping.mm_lot_id, mapping]));
        const missingMappings = storageLotIds.filter(id => !mappingByMmLot.has(id));
        if (missingMappings.length > 0) {
            throw new ReceivingPreviewError(`Storage lot mapping is not configured for MM lot(s): ${missingMappings.join(", ")}.`, 409);
        }
        if (storageLotIds.length !== requestedLotIds.length) {
            throw new ReceivingPreviewError("One or more selected storage lots do not exist, are inactive, or belong to another branch.", 409);
        }
        const movementRows = await loadMovementRowsForLotRefs(
            storageLotIds,
            mappings.map(mapping => mapping.legacy_lot_id),
            "movement_id,product_id,mm_lot_id,lot_id,quantity,batch_no,manufacturing_date,expiry_date"
        );

        const poLines = rows(await lineResponse.json());
        if (poLines.length === 0) throw new ReceivingPreviewError("This purchase order has no purchase-order lines.");
        const poLineIds = poLines
            .map(line => positiveInteger(line.purchase_order_product_id))
            .filter((lineId): lineId is number => lineId !== null);
        const submittedLineIds = new Set(lineIds);
        const poLineIdSet = new Set(poLineIds);
        const missingLineIds = poLineIds.filter(lineId => !submittedLineIds.has(lineId));
        const unknownLineIds = lineIds.filter(lineId => !poLineIdSet.has(lineId));
        if (poLineIds.length !== poLines.length || (!replacementFlow && missingLineIds.length > 0) || unknownLineIds.length > 0) {
            const missing = missingLineIds.length > 0 ? ` Missing line(s): ${missingLineIds.join(", ")}.` : "";
            const unknown = unknownLineIds.length > 0 ? ` Unknown line(s): ${unknownLineIds.join(", ")}.` : "";
            throw new ReceivingPreviewError(`${replacementFlow ? "The replacement receiving submission contains an invalid line." : "Every purchase-order line must be included in the receiving submission."}${missing}${unknown}`);
        }
        const receivingHistory = summarizeReceivingHistory(rows(await receivingResponse.json()), poLines);
        if (receivingHistory.unresolvedRows.length > 0) {
            throw new ReceivingPreviewError("Existing receiving records could not be matched to a purchase-order line. Reconciliation is required before receiving can continue.", 409);
        }
        const previouslyReceivedByLine = receivingHistory.byLine;
        const poLineById = new Map(poLines.map(line => [positiveInteger(line.purchase_order_product_id), line]));
        const categoryTypes = await resolveProductCategoryTypes(poLines
            .map(line => positiveInteger(line.product_id, "product_id"))
            .filter((productId): productId is number => productId !== null));
        const productMetadata = new Map<number, DirectusProductAllocationMetadata>();
        for (const product of rows(await productResponse.json())) {
            const productId = relationId(product.product_id, ["product_id", "id"]);
            if (productId) productMetadata.set(productId, product);
        }
        const productAllocationMetadata = new Map<number, { productTypeId: number; uomId: number; categoryType: PurchaseOrderCategoryType }>();
        for (const [productId, product] of productMetadata) {
            const productTypeId = relationId(product.product_type, ["product_type_id", "type_id", "id"]);
            const uomId = relationId(product.unit_of_measurement, ["unit_id", "id"]);
            const categoryType = categoryTypes.get(productId);
            if (productTypeId && uomId && categoryType) productAllocationMetadata.set(productId, { productTypeId, uomId, categoryType });
        }
        const remainingByLine = new Map<number, number>();
        const remainingAcceptedByLine = new Map<number, number>();
        for (const line of lines) {
            const stored = poLineById.get(line.lineId);
            if (!stored || positiveInteger(stored.purchase_order_id, "purchase_order_id") !== shipmentId) {
                throw new ReceivingPreviewError(`Line ${line.lineId} does not belong to this purchase order.`);
            }
            if (positiveInteger(stored.product_id, "product_id") !== line.productId) {
                throw new ReceivingPreviewError(`Product mismatch for line ${line.lineId}.`);
            }
            const categoryType = categoryTypes.get(line.productId);
            if (!categoryType) {
                throw new ReceivingPreviewError(`Product ${line.productId} has no valid RAW_MATERIAL, PACKAGING, or FINISHED_GOODS Category_Type.`);
            }
            if (line.isPackaging !== (categoryType === "PACKAGING")) {
                throw new ReceivingPreviewError(`Line ${line.lineId} Category_Type does not match the product master classification.`);
            }
            const productAllocation = productAllocationMetadata.get(line.productId);
            if (!productAllocation) {
                throw new ReceivingPreviewError(`Product ${line.productId} must have a Product Type and UOM before inventory allocation.`);
            }
            const intent = String(stored.purchase_intent || "Buffer_Stock");
            const jobOrderId = positiveInteger(stored.job_order_id, "job_order_id");
            if (intent === "MRP_Demand" && !jobOrderId) {
                throw new ReceivingPreviewError(`MRP-demand line ${line.lineId} has no valid job order.`);
            }
            if (intent !== "MRP_Demand" && intent !== "Buffer_Stock") {
                throw new ReceivingPreviewError(`Line ${line.lineId} has an invalid purchase intent.`);
            }
            const orderedQuantity = Number(stored.ordered_quantity || 0);
            const previous = previouslyReceivedByLine.get(line.lineId) || { received: 0, rejected: 0, accepted: 0 };
            const remainingQuantity = replacementContext?.targetLineId === line.lineId
                ? replacementContext.disposition.remainingQuantity
                : Math.max(0, orderedQuantity - previous.received);
            const remainingAcceptedQuantity = replacementContext?.targetLineId === line.lineId
                ? replacementContext.disposition.remainingQuantity
                : Math.max(0, orderedQuantity - previous.accepted);
            if (!Number.isFinite(orderedQuantity) || orderedQuantity <= 0) {
                throw new ReceivingPreviewError(`Line ${line.lineId} has an invalid ordered quantity.`);
            }
            remainingByLine.set(line.lineId, remainingQuantity);
            remainingAcceptedByLine.set(line.lineId, remainingAcceptedQuantity);
        }

        const overDeliveryLines = lines.map(line => ({
            lineId: line.lineId,
            ...evaluateOverDelivery(line.receivedQuantity, remainingByLine.get(line.lineId) || 0)
        }));
        const confirmedOverDeliveryLines = overDeliveryLines.filter(line => line.isOverReceived);
        if (!replacementFlow && confirmedOverDeliveryLines.length > 0 && !processOverDelivery) {
            const summary = confirmedOverDeliveryLines
                .map(line => `line ${line.lineId}: excess ${line.overDeliveryQuantity}`)
                .join(", ");
            throw new ReceivingPreviewError(`Over-delivery processing must be explicitly confirmed (${summary}).`);
        }

        const storageLotById = new Map(storageLots.map(lot => [positiveInteger(lot.lot_id), lot]));
        const validLotIds = new Set(storageLotById.keys());
        if (requestedLotIds.some(id => !validLotIds.has(id))) {
            throw new ReceivingPreviewError("One or more storage lots do not exist.");
        }
        const occupiedByLot = sumMovementQuantitiesByStorageLot(movementRows, legacyToMmLotMap(mappings));
        const productTypesByLot = new Map<number, Set<number>>();
        const lotCapacityInputs: LotCapacityAllocationInput[] = [];
        const normalizedAllocationsByLine = new Map<number, { accepted: ReceivingLotAllocation[]; rejected: ReceivingLotAllocation[] }>();
        for (const line of lines) {
            const accepted = normalizeReceivingLotAllocations(line.acceptedQuantity, line.acceptedLotAllocations);
            const rejected = normalizeRejectedLotAllocations(line.rejectedQuantity, line.rejectedLotAllocations);
            normalizedAllocationsByLine.set(line.lineId, { accepted, rejected });
            const productAllocation = productAllocationMetadata.get(line.productId);
            if (!productAllocation) throw new ReceivingPreviewError(`Product ${line.productId} must have a Product Type and UOM before inventory allocation.`);
            accepted.forEach((allocation, index) => {
                lotCapacityInputs.push({
                    key: allocationCapacityKey(line.lineId, "Passed", index),
                    lotId: allocation.storageLotId,
                    quantity: allocation.quantity
                });
            });
            rejected.forEach((allocation, index) => {
                lotCapacityInputs.push({
                    key: allocationCapacityKey(line.lineId, "Rejected", index),
                    lotId: allocation.storageLotId,
                    quantity: allocation.quantity
                });
            });
            const allocationEntries = [
                ...accepted.map(allocation => ({ allocation, expectedBranchId: purchaseOrderBranchId })),
                ...rejected.map(allocation => ({ allocation, expectedBranchId: Number(badStockBranch?.id) }))
            ];
            for (const { allocation, expectedBranchId } of allocationEntries) {
                if (!allocation.batchNumber.trim()) {
                    throw new ReceivingPreviewError(`Every allocation for product ${line.productId} must include a batch number.`);
                }
                if (productAllocation.categoryType !== "PACKAGING" && (!allocation.manufacturingDate || !allocation.expirationDate)) {
                    throw new ReceivingPreviewError(`Every allocation for raw material or finished goods product ${line.productId} must include manufacturing and expiry dates.`);
                }
                if (allocation.manufacturingDate && allocation.expirationDate && allocation.manufacturingDate > allocation.expirationDate) {
                    throw new ReceivingPreviewError(`Manufacturing Date cannot be later than Expiry Date for product ${line.productId}.`);
                }
                const lot = storageLotById.get(allocation.storageLotId);
                if (!lot) throw new ReceivingPreviewError(`Storage lot ${allocation.storageLotId} does not exist.`);
                if (lotBranchById.get(allocation.storageLotId) !== expectedBranchId) {
                    throw new ReceivingPreviewError(`Storage lot ${String(lot.lot_name || allocation.storageLotId)} is not assigned to the required receiving branch.`, 409);
                }
                if (!mappingByMmLot.has(allocation.storageLotId)) {
                    throw new ReceivingPreviewError(`Storage lot ${allocation.storageLotId} has no approved legacy mapping.`, 409);
                }
                const lotUomId = relationId(lot.unit_id, ["unit_id", "id"]);
                const capacity = normalizeLotCapacity(lot.max_batch_capacity);
                if (!lotUomId || lotUomId !== productAllocation.uomId) {
                    throw new ReceivingPreviewError(`Storage lot ${String(lot.lot_name || allocation.storageLotId)} UOM does not match product ${line.productId}.`);
                }
                if (capacity === null || !Number.isFinite(capacity) || capacity <= 0) {
                    throw new ReceivingPreviewError(`Storage lot ${String(lot.lot_name || allocation.storageLotId)} has no valid maximum capacity.`);
                }
                const typeSet = productTypesByLot.get(allocation.storageLotId) || new Set<number>();
                typeSet.add(productAllocation.productTypeId);
                productTypesByLot.set(allocation.storageLotId, typeSet);
            }
        }
        for (const [lotId, typeSet] of productTypesByLot) {
            if (typeSet.size > 1) {
                throw new ReceivingPreviewError(`Storage lot ${lotId} cannot be assigned to multiple Product Types in one receiving submission.`);
            }
        }
        const capacityByLot = new Map<number, number | null>();
        for (const lot of storageLots) {
            const lotId = positiveInteger(lot.lot_id);
            if (lotId) capacityByLot.set(lotId, normalizeLotCapacity(lot.max_batch_capacity));
        }
        const capacityEvaluations = evaluateLotCapacities(capacityByLot, occupiedByLot, lotCapacityInputs);
        const capacityAuditsByAllocationKey = new Map<string, LotCapacityAllocationAudit>();
        for (const evaluation of capacityEvaluations.values()) {
            for (const audit of evaluation.allocations) capacityAuditsByAllocationKey.set(audit.key, audit);
        }

        const movementTypes = rows(await movementTypeResponse.json()) as DirectusMovementType[];
        const needsAcceptedRoute = lines.some(line => line.acceptedQuantity > 0);
        const needsRejectedRouteBeforeQa = lines.some(line => line.rejectedQuantity > 0);
        const passedType = needsAcceptedRoute
            ? movementType(movementTypes, "Purchase Receiving QA")
            : null;

        const includedProductIds = [...new Set(lines
            .filter(line => line.receivedQuantity > 0)
            .map(line => line.productId))];
        const specificationEntries = await Promise.all(includedProductIds.map(async productId => [
            productId,
            await fetchProductQaSpecifications(productId)
        ] as const));
        const specificationsByProduct = new Map(specificationEntries);

        const evaluated = lines.map(line => {
            const enteredDisposition = deriveReceivingDisposition(line);
            if (enteredDisposition === "Not Received") {
                if (line.readings.length > 0) {
                    throw new ReceivingPreviewError(`Line ${line.lineId} cannot include QA readings when it is not received.`);
                }
                return {
                    line,
                    result: {
                        lineId: line.lineId,
                        disposition: enteredDisposition,
                        receivedQuantity: 0,
                        acceptedQuantity: 0,
                        rejectedQuantity: 0,
                        forceRejected: false,
                        rejectionReason: null,
                        evaluations: []
                    }
                };
            }

            const specifications = specificationsByProduct.get(line.productId) || [];
            const readingBySpecId = new Map<number, string>();
            for (const reading of line.readings) {
                if (readingBySpecId.has(reading.specId)) {
                    throw new ReceivingPreviewError(`Line ${line.lineId} contains duplicate QA readings.`);
                }
                readingBySpecId.set(reading.specId, reading.actualReading);
            }
            const configuredIds = new Set(specifications.map(specification => specification.specId));
            if (line.readings.some(reading => !configuredIds.has(reading.specId)) || readingBySpecId.size !== configuredIds.size) {
                throw new ReceivingPreviewError(`Line ${line.lineId} QA readings do not match the current product specifications.`);
            }
            const decision = evaluateQaChecklist(specifications.map(specification => ({
                specification,
                reading: readingBySpecId.get(specification.specId)
            })));
            if (!decision.complete) throw new ReceivingPreviewError(`Complete all QA readings for line ${line.lineId}.`);
            return {
                line,
                result: {
                    lineId: line.lineId,
                    ...applyQaDecision(line, decision),
                    evaluations: decision.evaluations
                }
            };
        });

        const receivingStatus = evaluateReceivingStatus(poLines.map(stored => {
            const lineId = positiveInteger(stored.purchase_order_product_id) as number;
            const previous = previouslyReceivedByLine.get(lineId) || { received: 0, rejected: 0, accepted: 0 };
            const current = evaluated.find(entry => entry.line.lineId === lineId)?.result;
            return {
                orderedQuantity: Number(stored.ordered_quantity || 0),
                receivedQuantity: previous.received + (current?.receivedQuantity || 0),
                rejectedQuantity: previous.rejected + (current?.rejectedQuantity || 0)
            };
        }));
        const receivedMrpEntries = replacementFlow ? [] : evaluated.filter(({ line, result }) => {
            const stored = poLineById.get(line.lineId)!;
            return result.receivedQuantity > 0 && stored.purchase_intent === "MRP_Demand";
        });
        const acceptedMrpEntries = receivedMrpEntries.filter(entry => entry.result.acceptedQuantity > 0);
        const mrpJobOrderIds = [...new Set(receivedMrpEntries.map(({ line }) =>
            positiveInteger(poLineById.get(line.lineId)!.job_order_id, "job_order_id") as number
        ))];
        const mrpProductIds = [...new Set(acceptedMrpEntries.map(({ line }) => line.productId))];
        const [jobOrderResponse, materialResponse] = await Promise.all([
            mrpJobOrderIds.length > 0
                ? procurementDirectusFetch(`/items/manufacturing_job_orders?filter[job_order_id][_in]=${mrpJobOrderIds.join(",")}&fields=job_order_id,job_order_no&limit=${mrpJobOrderIds.length}`)
                : null,
            mrpJobOrderIds.length > 0 && mrpProductIds.length > 0
                ? procurementDirectusFetch(`/items/manufacturing_job_order_materials?filter[job_order_id][_in]=${mrpJobOrderIds.join(",")}&filter[product_id][_in]=${mrpProductIds.join(",")}&fields=jo_material_id,job_order_id,product_id,allocated_quantity,reserved_quantity&limit=-1`)
                : null
        ]);
        if ((jobOrderResponse && !jobOrderResponse.ok) || (materialResponse && !materialResponse.ok)) {
            throw new ReceivingPreviewError("Unable to validate MRP allocation targets.", 503);
        }
        const jobOrders = jobOrderResponse ? rows(await jobOrderResponse.json()) as DirectusJobOrder[] : [];
        const jobOrderById = new Map(jobOrders.map(jobOrder => [positiveInteger(jobOrder.job_order_id), jobOrder]));
        if (mrpJobOrderIds.some(id => !jobOrderById.has(id))) {
            throw new ReceivingPreviewError("One or more MRP-demand job orders no longer exist.");
        }
        const jobOrderMaterials = materialResponse
            ? rows(await materialResponse.json()) as DirectusJobOrderMaterial[]
            : [];
        for (const { line } of acceptedMrpEntries) {
            const jobOrderId = positiveInteger(poLineById.get(line.lineId)!.job_order_id, "job_order_id") as number;
            const matchingMaterials = jobOrderMaterials.filter(material =>
                positiveInteger(material.job_order_id, "job_order_id") === jobOrderId
                && positiveInteger(material.product_id, "product_id") === line.productId
            );
            if (matchingMaterials.length === 0) {
                throw new ReceivingPreviewError(`MRP-demand line ${line.lineId} is not a material requirement of its linked job order.`);
            }
        }

        const needsRejectedRoute = needsRejectedRouteBeforeQa || evaluated.some(entry => entry.result.rejectedQuantity > 0);
        if (needsRejectedRoute && (!badStockBranch || !enabled(badStockBranch.isActive) || !enabled(badStockBranch.isBadStock))) {
            throw new ReceivingPreviewError("The selected destination has no active Bad Order branch configured for rejected inventory.");
        }
        const rejectedType = needsRejectedRoute
            ? movementType(movementTypes, "QA Reject / Bad Order Receipt")
            : null;
        const passedBranch = mapBranch(destinationBranch);
        const rejectedBranch = badStockBranch ? mapBranch(badStockBranch) : null;

        const data: ReceivingPreviewLineResult[] = evaluated.map(({ line, result }) => {
            const stored = poLineById.get(line.lineId)!;
            const normalized = normalizedAllocationsByLine.get(line.lineId) || { accepted: [], rejected: [] };
            const acceptedLotAllocations = result.acceptedQuantity > 0 ? normalized.accepted : [];
            const rejectedLotAllocations = result.rejectedQuantity > 0 ? normalized.rejected : [];
            const storageLotNames = Object.fromEntries([
                ...acceptedLotAllocations,
                ...rejectedLotAllocations
            ].map(allocation => [
                allocation.storageLotId,
                String(storageLotById.get(allocation.storageLotId)?.lot_name || "Unknown storage lot")
            ]));
            let allocationDrafts: ReceivingMrpAllocationDraft[] = [];
            let unallocatedQuantity = 0;
            if (result.acceptedQuantity > 0 && stored.purchase_intent === "MRP_Demand") {
                const jobOrderId = positiveInteger(stored.job_order_id, "job_order_id") as number;
                const jobOrder = jobOrderById.get(jobOrderId)!;
                const requirements = jobOrderMaterials
                    .filter(material =>
                        positiveInteger(material.job_order_id, "job_order_id") === jobOrderId
                        && positiveInteger(material.product_id, "product_id") === line.productId
                    )
                    .map(materialRequirement);
                const allocation = buildMrpAllocationDrafts(result.acceptedQuantity, {
                    id: jobOrderId,
                    number: String(jobOrder.job_order_no || "Unknown job order")
                }, requirements);
                allocationDrafts = allocation.allocationDrafts;
                unallocatedQuantity = allocation.unallocatedQuantity;
            }
            return {
                ...result,
                previouslyReceivedQuantity: previouslyReceivedByLine.get(line.lineId)?.received || 0,
                previouslyAcceptedQuantity: previouslyReceivedByLine.get(line.lineId)?.accepted || 0,
                ...evaluateOverDelivery(result.receivedQuantity, remainingByLine.get(line.lineId) || 0),
                remainingAcceptedQuantity: remainingAcceptedByLine.get(line.lineId) || 0,
                routes: result.receivedQuantity === 0
                    ? []
                    : buildReceivingRoutes({
                    lineId: line.lineId,
                    acceptedQuantity: result.acceptedQuantity,
                    acceptedLotAllocations,
                    rejectedQuantity: result.rejectedQuantity,
                    rejectedLotAllocations,
                    createdBy: actor.userId,
                    sourceDocumentNo: previewSourceDocumentNo,
                    storageLotNames,
                    remarks: line.remarks?.trim() || null,
                    rejectionReason: result.rejectionReason,
                    allocationDrafts,
                    unallocatedQuantity,
                    capacityAuditsByAllocationKey
                }, passedBranch, rejectedBranch, passedType, rejectedType)
            };
        });

        return NextResponse.json({
            data: {
                shipmentId,
                receivingTicketNumber: receiptNumber,
                receiptDate,
                supplierDocumentTypeId: supplierDocumentType?.id || null,
                supplierDocumentType,
                quantityStatus: quantityStatusFromReceivingStatus(receivingStatus.status),
                processOverDelivery,
                replacementDispositionId: replacementDispositionId || null,
                workflowRevision: Number(header.workflow_revision || 0),
                postingEnabled: RECEIVING_POSTING_ENABLED,
                destinationBranch: passedBranch,
                inspectorName: actor.displayName,
                lines: data
            }
        });
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError || error instanceof PurchaseQaConfigurationError || error instanceof ProductCategoryTypeValidationError
            ? error.status
            : error instanceof MmLotCompatibilityError
                ? error.status
            : error instanceof QuarantineDispositionError
                ? error.statusCode
            : error instanceof ReceivingDocumentTypeError
                ? error.statusCode
            : error instanceof ReceivingPreviewError
                ? error.status
                : error instanceof ReceivingQuantityError
                    ? 422
                    : 500;
        return NextResponse.json({ error: (error as Error).message || "Failed to generate receiving preview." }, { status });
    }
}
