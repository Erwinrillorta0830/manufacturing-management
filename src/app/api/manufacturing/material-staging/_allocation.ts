import { createHash } from "node:crypto";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    fetchMmInventoryMovements,
    type NormalizedMmInventoryMovement
} from "../services/mm-inventory-movements.service";
import {
    loadMmInventoryLots,
    loadMmLots,
    mmInventoryLotId,
    mmLotId,
    unitId,
    type MmLotRecord
} from "../services/mm-lots.service";
import { normalizeBatchNo, normalizeDirectusStagingMovement, type MaterialStagingStockMovement } from "./_stock";
import type {
    AllocationCandidate,
    AllocationLine,
    AllocationMode,
    AllocationPreview,
    AllocationPreviewPayload,
    BatchStageMaterialResult,
    StagingCommitResponse
} from "@/modules/manufacturing-management/material-staging/types";

const QUANTITY_EPSILON = 0.000001;
const PREVIEW_TOKEN_VERSION = 1;
const SOURCE_BIN = "MAIN-STORE";

type DirectusRecord = Record<string, unknown>;

export class MaterialStagingAllocationError extends Error {
    constructor(
        message: string,
        readonly status = 409,
        readonly code = "MATERIAL_STAGING_ALLOCATION_INVALID",
        readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "MaterialStagingAllocationError";
    }
}

interface MaterialContext {
    id: number;
    productId: number;
    productName: string;
    productCode: string;
    uom: string;
    productUnitId: number | null;
    requiredQuantity: number;
    stagedQuantity: number;
}

interface ReservationContext {
    id: number;
    materialId: number;
    productId: number;
    branchId: number;
    mmLotId: number;
    inventoryLotId: number;
    batchNo: string;
    reservedQuantity: number;
    stagedQuantity: number;
    actualUsedQuantity: number;
    row: DirectusRecord;
}

interface AllocationContext {
    jobOrder: DirectusRecord;
    jobOrderId: number;
    jobOrderNo: string;
    branchId: number;
    workCenterId: number;
    targetBin: string;
    materials: MaterialContext[];
    reservations: ReservationContext[];
    candidatesByMaterial: Map<number, AllocationCandidate[]>;
}

export interface PreparedAllocationPreview {
    preview: AllocationPreview;
    fingerprint: string;
    context: AllocationContext;
}

interface PreviewTokenPayload {
    v: number;
    fingerprint: string;
    job_order_id: number;
    work_center_id: number;
    mode: AllocationMode;
    material_ids: number[];
    lines: AllocationLine[];
    issued_at: string;
}

interface MutationState {
    createdMovementIds: number[];
    createdReservationIds: number[];
    patchedReservations: Array<{ id: number; snapshot: DirectusRecord }>;
    previousJobOrderStatus: unknown;
    jobOrderId: number;
    jobOrderPatched: boolean;
}

const operationClaims = new Map<string, string>();

function numericId(value: unknown, keys: string[] = []): number {
    if (value && typeof value === "object") {
        const record = value as DirectusRecord;
        for (const key of keys) {
            const nested = numericId(record[key], keys);
            if (nested > 0) return nested;
        }
        return numericId(record.id, []);
    }
    const parsed = Number(value ?? 0);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function quantity(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function roundQuantity(value: number): number {
    return Number(Math.max(0, value).toFixed(6));
}

function text(value: unknown): string {
    return String(value ?? "").trim();
}

function recordId(row: DirectusRecord): number {
    return numericId(row.jo_materials_reservation_id ?? row.inventory_lot_id ?? row.movement_id ?? row.id);
}

function directusMessage(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== "object") return fallback;
    const record = payload as DirectusRecord;
    const errors = record.errors;
    if (Array.isArray(errors) && errors[0] && typeof errors[0] === "object") {
        const message = text((errors[0] as DirectusRecord).message);
        if (message) return message;
    }
    return text(record.message) || fallback;
}

async function directusRequest<T>(
    path: string,
    init: RequestInit,
    action: string,
    requireData = false
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${path}`, init);
    } catch {
        throw new MaterialStagingAllocationError(`${action} could not reach Directus.`, 503, "DIRECTUS_UNAVAILABLE");
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new MaterialStagingAllocationError(
            `${action} failed: ${directusMessage(payload, `Directus returned HTTP ${response.status}`)}`,
            response.status === 409 ? 409 : response.status >= 400 && response.status < 500 ? response.status : 503,
            "DIRECTUS_REQUEST_FAILED",
            { upstream_status: response.status }
        );
    }
    if (requireData && (!payload || typeof payload !== "object" || !("data" in payload))) {
        throw new MaterialStagingAllocationError(`${action} returned no data from Directus.`, 503, "DIRECTUS_INVALID_RESPONSE");
    }
    return (payload as DirectusRecord).data as T;
}

async function directusRows(path: string, action: string): Promise<DirectusRecord[]> {
    const data = await directusRequest<unknown>(path, { headers, cache: "no-store" }, action, true);
    return Array.isArray(data) ? data as DirectusRecord[] : [];
}

function relationId(value: unknown, keys: string[]): number {
    return numericId(value, keys);
}

function canonicalTypeName(value: unknown): string {
    return text(value)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function movementQuantity(movement: NormalizedMmInventoryMovement | MaterialStagingStockMovement): number {
    return quantity((movement as NormalizedMmInventoryMovement).quantity ?? (movement as MaterialStagingStockMovement).quantity);
}

function movementProductId(movement: NormalizedMmInventoryMovement | MaterialStagingStockMovement): number {
    return numericId((movement as NormalizedMmInventoryMovement).product_id ?? (movement as MaterialStagingStockMovement).product_id);
}

function movementLotId(movement: NormalizedMmInventoryMovement | MaterialStagingStockMovement): number {
    return numericId((movement as NormalizedMmInventoryMovement).mm_lot_id ?? (movement as MaterialStagingStockMovement).mm_lot_id);
}

function movementInventoryLotId(movement: NormalizedMmInventoryMovement | MaterialStagingStockMovement): number {
    return numericId((movement as NormalizedMmInventoryMovement).inventory_lot_id ?? (movement as MaterialStagingStockMovement).inventory_lot_id);
}

function movementBranchId(movement: NormalizedMmInventoryMovement | MaterialStagingStockMovement): number {
    return numericId((movement as NormalizedMmInventoryMovement).branch_id ?? (movement as MaterialStagingStockMovement).branch_id);
}

function movementSourceId(movement: NormalizedMmInventoryMovement | MaterialStagingStockMovement): number {
    return numericId((movement as NormalizedMmInventoryMovement).source_document_id ?? (movement as MaterialStagingStockMovement).source_document_id);
}

function movementBatch(movement: NormalizedMmInventoryMovement | MaterialStagingStockMovement): string {
    return text((movement as NormalizedMmInventoryMovement).batch_no ?? (movement as MaterialStagingStockMovement).batch_no);
}

function movementRemarks(movement: NormalizedMmInventoryMovement | MaterialStagingStockMovement): string {
    return text((movement as NormalizedMmInventoryMovement).remarks ?? (movement as MaterialStagingStockMovement).remarks);
}

function movementKey(productId: number, mmLotIdValue: number, batchNo: unknown): string {
    return `${productId}:${mmLotIdValue}:${normalizeBatchNo(batchNo)}`;
}

function materialRequiredQuantity(row: DirectusRecord): number {
    return Math.max(0, quantity(
        row.allocated_quantity ?? row.required_quantity ?? row.quantity_required ?? row.quantity ?? 0
    ));
}

function reservationId(row: DirectusRecord): number {
    return numericId(row.jo_materials_reservation_id ?? row.id);
}

function reservationMatches(
    reservation: ReservationContext,
    materialId: number,
    candidate: Pick<AllocationCandidate, "product_id" | "mm_lot_id" | "inventory_lot_id" | "batch_no">
): boolean {
    return reservation.materialId === materialId
        && reservation.productId === candidate.product_id
        && reservation.mmLotId === candidate.mm_lot_id
        && reservation.inventoryLotId === candidate.inventory_lot_id
        && normalizeBatchNo(reservation.batchNo) === normalizeBatchNo(candidate.batch_no);
}

function isValidQaStatus(value: unknown): boolean {
    const status = canonicalTypeName(value || "GOOD");
    return !["FAILED", "REJECTED", "QUARANTINED", "QUARANTINE", "BAD", "HOLD"].includes(status);
}

function isExpired(value: unknown): boolean {
    const raw = text(value);
    if (!raw) return false;
    const expiry = new Date(raw);
    if (Number.isNaN(expiry.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiry.getTime() < today.getTime();
}

function candidateSort(left: AllocationCandidate, right: AllocationCandidate): number {
    const leftExpiry = left.expiry_date ? Date.parse(left.expiry_date) : Number.MAX_SAFE_INTEGER;
    const rightExpiry = right.expiry_date ? Date.parse(right.expiry_date) : Number.MAX_SAFE_INTEGER;
    const safeLeftExpiry = Number.isFinite(leftExpiry) ? leftExpiry : Number.MAX_SAFE_INTEGER;
    const safeRightExpiry = Number.isFinite(rightExpiry) ? rightExpiry : Number.MAX_SAFE_INTEGER;
    if (safeLeftExpiry !== safeRightExpiry) return safeLeftExpiry - safeRightExpiry;
    const leftMfg = left.manufacturing_date ? Date.parse(left.manufacturing_date) : Number.MAX_SAFE_INTEGER;
    const rightMfg = right.manufacturing_date ? Date.parse(right.manufacturing_date) : Number.MAX_SAFE_INTEGER;
    const safeLeftMfg = Number.isFinite(leftMfg) ? leftMfg : Number.MAX_SAFE_INTEGER;
    const safeRightMfg = Number.isFinite(rightMfg) ? rightMfg : Number.MAX_SAFE_INTEGER;
    if (safeLeftMfg !== safeRightMfg) return safeLeftMfg - safeRightMfg;
    return left.inventory_lot_id - right.inventory_lot_id;
}

function normalizeLine(line: AllocationLine): AllocationLine {
    return {
        allocation_line_id: text(line.allocation_line_id),
        jo_material_id: numericId(line.jo_material_id),
        product_id: numericId(line.product_id),
        mm_lot_id: numericId(line.mm_lot_id),
        inventory_lot_id: numericId(line.inventory_lot_id),
        lot_name: text(line.lot_name),
        batch_no: text(line.batch_no),
        quantity: roundQuantity(quantity(line.quantity)),
        available_quantity: line.available_quantity == null ? undefined : roundQuantity(quantity(line.available_quantity)),
        override_negative: Boolean(line.override_negative)
    };
}

function normalizedLines(payload: AllocationPreviewPayload): AllocationLine[] {
    return (payload.lines || []).map(normalizeLine).sort((left, right) =>
        left.allocation_line_id.localeCompare(right.allocation_line_id)
    );
}

function fingerprintInput(
    payload: AllocationPreviewPayload,
    context: AllocationContext,
    proposedAllocations: AllocationLine[]
): string {
    const materialIds = [...new Set((payload.material_ids || context.materials.map(material => material.id)).map(Number))].sort((a, b) => a - b);
    const candidateSnapshot = context.materials.map(material => ({
        material_id: material.id,
        required: material.requiredQuantity,
        staged: material.stagedQuantity,
        candidates: (context.candidatesByMaterial.get(material.id) || []).map(candidate => ({
            inventory_lot_id: candidate.inventory_lot_id,
            mm_lot_id: candidate.mm_lot_id,
            batch_no: normalizeBatchNo(candidate.batch_no),
            available_quantity: candidate.available_quantity,
            on_hand_quantity: candidate.on_hand_quantity
        }))
    }));
    return createHash("sha256")
        .update(JSON.stringify({
            job_order_id: context.jobOrderId,
            branch_id: context.branchId,
            work_center_id: context.workCenterId,
            mode: payload.mode,
            material_ids: materialIds,
            proposed_allocations: proposedAllocations,
            candidate_snapshot: candidateSnapshot
        }))
        .digest("hex");
}

function previewSecret(): string {
    return process.env.MATERIAL_STAGING_PREVIEW_SECRET || process.env.JWT_SECRET || "material-staging-preview-secret";
}

function encodeBase64Url(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
}

function signTokenBody(body: string): string {
    return createHash("sha256").update(`${previewSecret()}.${body}`).digest("base64url");
}

function createPreviewToken(payload: PreviewTokenPayload): string {
    const body = encodeBase64Url(JSON.stringify(payload));
    return `${body}.${signTokenBody(body)}`;
}

export function verifyPreviewToken(token: string): PreviewTokenPayload {
    const [body, signature] = text(token).split(".");
    if (!body || !signature || signTokenBody(body) !== signature) {
        throw new MaterialStagingAllocationError("The allocation preview token is invalid. Generate a new preview before posting.", 409, "PREVIEW_TOKEN_INVALID");
    }
    try {
        const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewTokenPayload;
        if (payload.v !== PREVIEW_TOKEN_VERSION || !payload.fingerprint || !payload.job_order_id || !payload.work_center_id) {
            throw new Error("invalid preview token payload");
        }
        return payload;
    } catch {
        throw new MaterialStagingAllocationError("The allocation preview token is invalid. Generate a new preview before posting.", 409, "PREVIEW_TOKEN_INVALID");
    }
}

async function loadAllocationContext(payload: AllocationPreviewPayload): Promise<AllocationContext> {
    if (!Number.isSafeInteger(payload.job_order_id) || payload.job_order_id <= 0) {
        throw new MaterialStagingAllocationError("A valid Job Order is required.", 400, "JOB_ORDER_REQUIRED");
    }
    if (!Number.isSafeInteger(payload.work_center_id) || payload.work_center_id <= 0) {
        throw new MaterialStagingAllocationError("A valid work center is required.", 400, "WORK_CENTER_REQUIRED");
    }

    const jobOrder = await directusRequest<DirectusRecord>(
        `/items/manufacturing_job_orders/${payload.job_order_id}?fields=*`,
        { headers, cache: "no-store" },
        "Load Job Order",
        true
    );
    const jobOrderId = numericId(jobOrder.job_order_id ?? jobOrder.id);
    const jobOrderNo = text(jobOrder.job_order_no ?? jobOrder.jo_id);
    const branchId = relationId(jobOrder.branch_id, ["branch_id", "id"]);
    if (jobOrderId !== payload.job_order_id || !jobOrderNo || !branchId) {
        throw new MaterialStagingAllocationError("The Job Order has incomplete identity or branch data.", 409, "JOB_ORDER_INVALID");
    }
    const status = canonicalTypeName(jobOrder.status);
    if (["CANCELLED", "FINISHED", "COMPLETED", "CLOSED"].includes(status)) {
        throw new MaterialStagingAllocationError("This Job Order cannot accept staged material in its current status.", 409, "JOB_ORDER_NOT_STAGEABLE");
    }

    const workCenters = await directusRows(
        `/items/manufacturing_work_centers?filter[work_center_id][_eq]=${payload.work_center_id}&fields=*&limit=1`,
        "Load target work center"
    );
    const workCenter = workCenters[0];
    if (!workCenter || ["0", "FALSE", "INACTIVE"].includes(canonicalTypeName(workCenter.is_active))) {
        throw new MaterialStagingAllocationError("The selected work center is not active.", 409, "WORK_CENTER_NOT_ACTIVE");
    }

    const materialRows = await directusRows(
        `/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${payload.job_order_id}&fields=*&limit=-1`,
        "Load Job Order materials"
    );
    const materialIds = materialRows
        .map(row => numericId(row.jo_material_id ?? row.id))
        .filter(id => id > 0);
    if (materialIds.length === 0) {
        throw new MaterialStagingAllocationError("The Job Order has no material requirements to stage.", 409, "NO_MATERIALS");
    }
    const requestedMaterialIds = payload.material_ids?.length
        ? [...new Set(payload.material_ids.map(Number))]
        : materialIds;
    if (requestedMaterialIds.some(id => !materialIds.includes(id))) {
        throw new MaterialStagingAllocationError("The allocation request contains a material that does not belong to this Job Order.", 400, "MATERIAL_NOT_IN_JOB_ORDER");
    }

    const productIds = [...new Set(materialRows.map(row => relationId(row.product_id, ["product_id", "id"])).filter(id => id > 0))];
    const products = productIds.length > 0
        ? await directusRows(`/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,product_code,unit_of_measurement,unit_of_measurement.unit_id,unit_of_measurement.unit_shortcut&limit=-1`, "Load material products")
        : [];
    const productMap = new Map<number, DirectusRecord>(products.map(product => [numericId(product.product_id ?? product.id), product]));
    const reservations = await directusRows(
        `/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_in]=${materialIds.join(",")}&fields=*&limit=-1`,
        "Load material reservations"
    );
    const reservationContexts = reservations.map(row => ({
        id: reservationId(row),
        materialId: relationId(row.jo_material_id, ["jo_material_id", "id"]),
        productId: relationId(row.product_id, ["product_id", "id"]),
        branchId: relationId(row.branch_id, ["branch_id", "id"]),
        mmLotId: relationId(row.mm_lot_id, ["lot_id", "id"]),
        inventoryLotId: relationId(row.inventory_lot_id, ["inventory_lot_id", "id"]),
        batchNo: text(row.batch_no),
        reservedQuantity: Math.max(0, quantity(row.reserved_quantity)),
        stagedQuantity: Math.max(0, quantity(row.staged_quantity)),
        actualUsedQuantity: Math.max(0, quantity(row.actual_used_quantity)),
        row
    })).filter(row => row.id > 0);

    const [mmLots, inventoryLots, springMovements] = await Promise.all([
        loadMmLots({ branchId, onlyActive: true }),
        loadMmInventoryLots({ branchId, onlyActive: true }),
        fetchMmInventoryMovements({ branch: branchId })
    ]);
    const directusMovementFilter = encodeURIComponent(JSON.stringify({
        branch_id: { _eq: branchId }
    }));
    const directusMovementRows = await directusRows(
        `/items/inventory_movements?filter=${directusMovementFilter}&fields=*&limit=-1`,
        "Load inventory movements"
    );
    const directusMovements = directusMovementRows.map(normalizeDirectusStagingMovement);
    const springMovementIds = new Set(springMovements.map(movement => Number(movement.movement_id || 0)).filter(id => id > 0));
    const movements: Array<NormalizedMmInventoryMovement | MaterialStagingStockMovement> = [
        ...springMovements,
        ...directusMovements.filter(movement => !movement.movement_id || !springMovementIds.has(Number(movement.movement_id)))
    ];

    const stockByLotBatch = new Map<string, number>();
    const stockByInventoryLotBatch = new Map<string, number>();
    const stagedByMaterialLotBatch = new Map<string, number>();
    movements.forEach(movement => {
        const movementBranch = movementBranchId(movement);
        const productId = movementProductId(movement);
        const lotId = movementLotId(movement);
        const inventoryLotId = movementInventoryLotId(movement);
        const batchNo = movementBatch(movement);
        if (movementBranch !== branchId || !productId || !lotId || !batchNo) return;
        const key = movementKey(productId, lotId, batchNo);
        stockByLotBatch.set(key, (stockByLotBatch.get(key) || 0) + movementQuantity(movement));
        if (inventoryLotId > 0) {
            const inventoryKey = `${productId}:${lotId}:${inventoryLotId}:${normalizeBatchNo(batchNo)}`;
            stockByInventoryLotBatch.set(inventoryKey, (stockByInventoryLotBatch.get(inventoryKey) || 0) + movementQuantity(movement));
        }

        const remarks = movementRemarks(movement);
        if (movementSourceId(movement) === jobOrderId && remarks.includes("[MM-MATERIAL-STAGING]") && !remarks.includes("[MM-MATERIAL-STAGING-RETURN]")) {
            const materialMatch = remarks.match(/jo_material_id=(\d+)/i);
            if (materialMatch) {
                const stagingQuantity = movementQuantity(movement);
                const issueQuantity = stagingQuantity < 0 ? Math.abs(stagingQuantity) : stagingQuantity;
                const materialKey = `${Number(materialMatch[1])}:${key}`;
                stagedByMaterialLotBatch.set(materialKey, (stagedByMaterialLotBatch.get(materialKey) || 0) + issueQuantity);
            }
        }
    });

    const mmLotMap = new Map<number, MmLotRecord>(mmLots.map(lot => [mmLotId(lot.lot_id) || 0, lot]));
    const productMaterials = materialRows.map(row => {
        const id = numericId(row.jo_material_id ?? row.id);
        const productId = relationId(row.product_id, ["product_id", "id"]);
        const product = productMap.get(productId) || {};
        const unitRelation = product.unit_of_measurement && typeof product.unit_of_measurement === "object"
            ? product.unit_of_measurement as DirectusRecord
            : {};
        const productUnitId = relationId(unitRelation.unit_id ?? unitRelation, ["unit_id", "id"])
            || relationId(row.uom_id, ["unit_id", "id"])
            || 0;
        if (!productUnitId) {
            throw new MaterialStagingAllocationError(
                `Product ${productId} has no explicit Unit of Measure and cannot be staged safely.`,
                422,
                "PRODUCT_UOM_REQUIRED"
            );
        }
        return {
            id,
            productId,
            productName: text(product.product_name) || `Product #${productId}`,
            productCode: text(product.product_code) || `SKU-${productId}`,
            uom: text(unitRelation.unit_shortcut ?? row.uom ?? row.unit) || "units",
            productUnitId,
            requiredQuantity: materialRequiredQuantity(row),
            stagedQuantity: 0
        } satisfies MaterialContext;
    }).filter(material => material.id > 0 && material.productId > 0);

    const materials = productMaterials.map(material => {
        const currentStagedFromReservations = reservationContexts
            .filter(reservation => reservation.materialId === material.id)
            .reduce((total, reservation) => total + reservation.stagedQuantity, 0);
        const currentStagedFromMovements = [...stockByLotBatch.keys()]
            .filter(key => key.startsWith(`${material.productId}:`))
            .reduce((total, key) => total + [...stagedByMaterialLotBatch.entries()]
                .filter(([stagedKey]) => stagedKey.endsWith(`:${key}`) && stagedKey.startsWith(`${material.id}:`))
                .reduce((sum, [, value]) => sum + value, 0), 0);
        return { ...material, stagedQuantity: roundQuantity(Math.max(currentStagedFromReservations, currentStagedFromMovements)) };
    });

    const candidatesByMaterial = new Map<number, AllocationCandidate[]>();
    for (const material of materials) {
        const candidates: AllocationCandidate[] = [];
        for (const inventoryLot of inventoryLots) {
            const inventoryId = mmInventoryLotId(inventoryLot.inventory_lot_id) || 0;
            const inventoryMmLotId = relationId(inventoryLot.lot_id, ["lot_id", "id"]);
            const inventoryProductId = relationId(inventoryLot.product_id, ["product_id", "id"]);
            const inventoryBranchId = relationId(inventoryLot.branch_id, ["branch_id", "id"]);
            const lot = mmLotMap.get(inventoryMmLotId);
            if (!inventoryId || !inventoryMmLotId || inventoryProductId !== material.productId || inventoryBranchId !== branchId || !lot) continue;
            if (!material.productUnitId || unitId(lot.unit_id) !== material.productUnitId) continue;
            if (!isValidQaStatus(inventoryLot.qa_status) || isExpired(inventoryLot.expiry_date)) continue;
            const batchNo = text(inventoryLot.batch_no);
            if (!batchNo) continue;
            // Inventory is allocated at the exact inventory-lot identity. Do
            // not fall back to an aggregate MM-lot/batch balance because a
            // different inventory lot may share the same batch label.
            const onHand = roundQuantity(
                stockByInventoryLotBatch.get(`${material.productId}:${inventoryMmLotId}:${inventoryId}:${normalizeBatchNo(batchNo)}`)
                ?? 0
            );
            const reservedElsewhere = reservationContexts
                .filter(reservation => reservation.materialId !== material.id
                    && reservation.productId === material.productId
                    && reservation.branchId === branchId
                    && reservation.mmLotId === inventoryMmLotId
                    && reservation.inventoryLotId === inventoryId
                    && normalizeBatchNo(reservation.batchNo) === normalizeBatchNo(batchNo))
                .reduce((total, reservation) => total + Math.max(0, reservation.reservedQuantity - reservation.actualUsedQuantity - reservation.stagedQuantity), 0);
            candidates.push({
                allocation_line_id: `candidate-${material.id}-${inventoryId}`,
                product_id: material.productId,
                product_name: material.productName,
                product_code: material.productCode,
                mm_lot_id: inventoryMmLotId,
                inventory_lot_id: inventoryId,
                lot_name: text(lot.lot_name) || `Lot #${inventoryMmLotId}`,
                batch_no: batchNo,
                manufacturing_date: text(inventoryLot.manufacturing_date) || null,
                expiry_date: text(inventoryLot.expiry_date) || null,
                qa_status: text(inventoryLot.qa_status) || "GOOD",
                on_hand_quantity: onHand,
                available_quantity: roundQuantity(Math.max(0, onHand - reservedElsewhere))
            });
        }
        candidates.sort(candidateSort);
        candidatesByMaterial.set(material.id, candidates);
    }

    return {
        jobOrder,
        jobOrderId,
        jobOrderNo,
        branchId,
        workCenterId: payload.work_center_id,
        targetBin: `FLOOR-STAGING-${payload.work_center_id}`,
        materials,
        reservations: reservationContexts,
        candidatesByMaterial
    };
}

function candidateToLine(candidate: AllocationCandidate, materialId: number, allocationLineId: string, requestedQuantity: number): AllocationLine {
    return {
        allocation_line_id: allocationLineId,
        jo_material_id: materialId,
        product_id: candidate.product_id,
        mm_lot_id: candidate.mm_lot_id,
        inventory_lot_id: candidate.inventory_lot_id,
        lot_name: candidate.lot_name,
        batch_no: candidate.batch_no,
        quantity: roundQuantity(requestedQuantity),
        available_quantity: candidate.available_quantity,
        override_negative: false
    };
}

function buildAutoLines(material: MaterialContext, candidates: AllocationCandidate[]): AllocationLine[] {
    let remaining = roundQuantity(material.requiredQuantity - material.stagedQuantity);
    const lines: AllocationLine[] = [];
    for (const candidate of candidates) {
        if (remaining <= QUANTITY_EPSILON) break;
        const requested = roundQuantity(Math.min(remaining, candidate.available_quantity));
        if (requested <= QUANTITY_EPSILON) continue;
        lines.push(candidateToLine(candidate, material.id, `auto-${material.id}-${candidate.inventory_lot_id}`, requested));
        remaining = roundQuantity(remaining - requested);
    }
    return lines;
}

function validateManualLines(
    material: MaterialContext,
    candidates: AllocationCandidate[],
    lines: AllocationLine[],
    allowOverride: boolean
): AllocationLine[] {
    const candidateMap = new Map(candidates.map(candidate => [
        `${candidate.mm_lot_id}:${candidate.inventory_lot_id}:${normalizeBatchNo(candidate.batch_no)}`,
        candidate
    ]));
    const seen = new Set<string>();
    return lines.map(line => {
        if (line.jo_material_id !== material.id || line.product_id !== material.productId) {
            throw new MaterialStagingAllocationError("Each allocation line must match its Job Order material.", 400, "ALLOCATION_LINE_MISMATCH");
        }
        if (!line.allocation_line_id || line.mm_lot_id <= 0 || line.inventory_lot_id <= 0 || !line.batch_no || line.quantity <= QUANTITY_EPSILON) {
            throw new MaterialStagingAllocationError("Every allocation line requires a lot, inventory lot, batch, and positive quantity.", 400, "ALLOCATION_LINE_INCOMPLETE");
        }
        const key = `${line.mm_lot_id}:${line.inventory_lot_id}:${normalizeBatchNo(line.batch_no)}`;
        if (seen.has(key)) throw new MaterialStagingAllocationError("The same lot and batch cannot be submitted twice for one material.", 409, "DUPLICATE_ALLOCATION_LINE");
        seen.add(key);
        const candidate = candidateMap.get(key);
        if (!candidate) throw new MaterialStagingAllocationError(`The selected lot/batch for ${material.productName} is no longer eligible. Refresh the allocation preview.`, 409, "ALLOCATION_CANDIDATE_STALE");
        if (!allowOverride && line.quantity > candidate.available_quantity + QUANTITY_EPSILON) {
            throw new MaterialStagingAllocationError(`The selected batch has only ${candidate.available_quantity} ${material.uom} available.`, 409, "INSUFFICIENT_LOT_STOCK");
        }
        return {
            ...candidateToLine(candidate, material.id, line.allocation_line_id, line.quantity),
            override_negative: Boolean(line.override_negative)
        };
    });
}

export async function prepareAllocationPreview(payload: AllocationPreviewPayload): Promise<PreparedAllocationPreview> {
    const context = await loadAllocationContext(payload);
    const selectedMaterials = context.materials.filter(material => (payload.material_ids || context.materials.map(item => item.id)).includes(material.id));
    const selectedMaterialIds = new Set(selectedMaterials.map(material => material.id));
    const requestedManualLines = payload.mode === "manual" ? (payload.lines || []).map(normalizeLine) : [];
    const overrideRequested = Boolean(
        payload.override_negative
        || requestedManualLines.some(line => line.override_negative)
    );
    if (overrideRequested && !text(payload.override_remarks)) {
        throw new MaterialStagingAllocationError(
            "A reason is required when using a negative-stock override.",
            400,
            "NEGATIVE_OVERRIDE_REMARKS_REQUIRED"
        );
    }
    if (requestedManualLines.some(line => !selectedMaterialIds.has(line.jo_material_id))) {
        throw new MaterialStagingAllocationError(
            "Each manual allocation line must belong to a selected Job Order material.",
            400,
            "ALLOCATION_LINE_MISMATCH"
        );
    }
    const proposedAllocations: AllocationLine[] = [];
    const materialPreviews = selectedMaterials.map(material => {
        const candidates = context.candidatesByMaterial.get(material.id) || [];
        const requestedLines = payload.mode === "manual"
            ? requestedManualLines.filter(line => line.jo_material_id === material.id)
            : [];
        const proposed = payload.mode === "auto"
            ? buildAutoLines(material, candidates)
            : validateManualLines(material, candidates, requestedLines, overrideRequested);
        proposedAllocations.push(...proposed);
        const remainingQuantity = roundQuantity(material.requiredQuantity - material.stagedQuantity);
        const proposedQuantity = roundQuantity(proposed.reduce((total, line) => total + line.quantity, 0));
        if (payload.mode === "manual" && proposedQuantity > remainingQuantity + QUANTITY_EPSILON) {
            throw new MaterialStagingAllocationError(
                `Manual allocation for ${material.productName} exceeds the remaining ${material.uom} requirement.`,
                400,
                "MANUAL_ALLOCATION_EXCEEDS_REQUIRED"
            );
        }
        const availableQuantity = roundQuantity(candidates.reduce((total, candidate) => total + candidate.available_quantity, 0));
        return {
            jo_material_id: material.id,
            product_id: material.productId,
            product_name: material.productName,
            product_code: material.productCode,
            uom: material.uom,
            required_quantity: material.requiredQuantity,
            staged_quantity: material.stagedQuantity,
            remaining_quantity: remainingQuantity,
            candidates,
            proposed_allocations: proposed,
            shortage_quantity: roundQuantity(Math.max(0, remainingQuantity - proposedQuantity)),
            message: availableQuantity < remainingQuantity
                ? `Only ${availableQuantity} ${material.uom} is currently available after protected allocations.`
                : undefined
        };
    });
    const allocationLineIds = new Set<string>();
    for (const line of proposedAllocations) {
        if (allocationLineIds.has(line.allocation_line_id)) {
            throw new MaterialStagingAllocationError(
                "Allocation line identifiers must be unique within one staging operation.",
                409,
                "DUPLICATE_ALLOCATION_LINE"
            );
        }
        allocationLineIds.add(line.allocation_line_id);
    }
    const shortages = materialPreviews
        .filter(material => material.shortage_quantity > QUANTITY_EPSILON)
        .map(material => ({
            jo_material_id: material.jo_material_id,
            product_id: material.product_id,
            product_name: material.product_name,
            required_quantity: material.required_quantity,
            remaining_quantity: material.remaining_quantity,
            available_quantity: material.candidates.reduce((total, candidate) => total + candidate.available_quantity, 0),
            shortage_quantity: material.shortage_quantity
        }));
    const fingerprint = fingerprintInput(payload, context, proposedAllocations);
    const token = createPreviewToken({
        v: PREVIEW_TOKEN_VERSION,
        fingerprint,
        job_order_id: context.jobOrderId,
        work_center_id: context.workCenterId,
        mode: payload.mode,
        material_ids: selectedMaterials.map(material => material.id).sort((a, b) => a - b),
        lines: proposedAllocations,
        issued_at: new Date().toISOString()
    });
    return {
        context,
        fingerprint,
        preview: {
            success: shortages.length === 0,
            job_order_id: context.jobOrderId,
            job_order_no: context.jobOrderNo,
            work_center_id: context.workCenterId,
            target_bin: context.targetBin,
            mode: payload.mode,
            preview_token: token,
            materials: materialPreviews,
            proposed_allocations: proposedAllocations,
            shortages
        }
    };
}

async function resolveTransactionTypeId(typeName: string): Promise<number> {
    const rows = await directusRows(
        `/items/inventory_transaction_types?fields=transaction_type_id,type_name,direction,origin_table&limit=-1`,
        "Load inventory transaction types"
    );
    const wanted = canonicalTypeName(typeName);
    const found = rows.find(row => canonicalTypeName(row.type_name ?? row.name ?? row.code) === wanted);
    const foundId = numericId(found?.transaction_type_id ?? found?.id);
    if (foundId) return foundId;

    const created = await directusRequest<DirectusRecord>(
        "/items/inventory_transaction_types",
        {
            method: "POST",
            headers,
            body: JSON.stringify({ type_name: typeName, direction: "OUT", origin_table: "inventory_movements" })
        },
        `Create ${typeName} transaction type`,
        true
    );
    const createdId = numericId(created.transaction_type_id ?? created.id);
    if (!createdId) throw new MaterialStagingAllocationError(`The ${typeName} transaction type could not be resolved.`, 503, "TRANSACTION_TYPE_UNAVAILABLE");
    return createdId;
}

function reservationSnapshot(row: DirectusRecord): DirectusRecord {
    const fields = [
        "reserved_quantity",
        "staged_quantity",
        "staging_bin",
        "staging_operation_id",
        "staging_allocation_line_id",
        "reservation_status",
        "actual_used_quantity",
        "product_id",
        "branch_id",
        "jo_material_id",
        "created_by",
        "mm_lot_id",
        "inventory_lot_id",
        "batch_no"
    ];
    return fields.reduce<DirectusRecord>((snapshot, field) => {
        snapshot[field] = row[field] ?? null;
        return snapshot;
    }, {});
}

async function rollbackMutations(state: MutationState): Promise<string[]> {
    const failures: string[] = [];
    for (const movementId of [...state.createdMovementIds].reverse()) {
        try {
            await directusRequest(`/items/inventory_movements/${movementId}`, { method: "DELETE", headers }, `Rollback staging movement ${movementId}`);
        } catch (error) {
            failures.push(error instanceof Error ? error.message : `Rollback staging movement ${movementId} failed.`);
        }
    }
    for (const reservationId of [...state.createdReservationIds].reverse()) {
        try {
            await directusRequest(`/items/manufacturing_job_order_materials_reservations/${reservationId}`, { method: "DELETE", headers }, `Rollback staging reservation ${reservationId}`);
        } catch (error) {
            failures.push(error instanceof Error ? error.message : `Rollback staging reservation ${reservationId} failed.`);
        }
    }
    for (const patched of [...state.patchedReservations].reverse()) {
        try {
            await directusRequest(`/items/manufacturing_job_order_materials_reservations/${patched.id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(patched.snapshot)
            }, `Rollback staging reservation ${patched.id}`);
        } catch (error) {
            failures.push(error instanceof Error ? error.message : `Rollback staging reservation ${patched.id} failed.`);
        }
    }
    if (state.jobOrderPatched && state.jobOrderId > 0) {
        try {
            await directusRequest(`/items/manufacturing_job_orders/${state.jobOrderId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ status: state.previousJobOrderStatus })
            }, `Rollback Job Order staging status ${state.jobOrderId}`);
        } catch (error) {
            failures.push(error instanceof Error ? error.message : `Rollback Job Order staging status ${state.jobOrderId} failed.`);
        }
    }
    return failures;
}

async function existingOperation(operationId: string, expectedFingerprint: string): Promise<StagingCommitResponse | null> {
    const rows = await directusRows(
        `/items/inventory_movements?filter[staging_operation_id][_eq]=${encodeURIComponent(operationId)}&fields=movement_id,source_document_id,source_document_no,product_id,mm_lot_id,inventory_lot_id,batch_no,quantity,remarks,staging_allocation_line_id&limit=-1`,
        "Check staging operation idempotency"
    );
    if (rows.length === 0) return null;
    const first = rows[0];
    const persistedFingerprint = text(first.remarks).match(/preview_fingerprint=([^;|]+)/i)?.[1]?.trim();
    if (!persistedFingerprint) {
        throw new MaterialStagingAllocationError(
            "The staging operation has movement data without a verifiable preview fingerprint. Reconciliation is required before retrying.",
            503,
            "STAGING_RECONCILIATION_REQUIRED"
        );
    }
    if (persistedFingerprint !== expectedFingerprint) {
        throw new MaterialStagingAllocationError("This operation ID is already committed with a different allocation payload.", 409, "OPERATION_ID_CONFLICT");
    }
    const reservationRows = await directusRows(
        `/items/manufacturing_job_order_materials_reservations?filter[staging_operation_id][_eq]=${encodeURIComponent(operationId)}&fields=jo_materials_reservation_id,staging_allocation_line_id&limit=-1`,
        "Check staging reservation idempotency"
    );
    const reservationByLine = new Map(
        reservationRows
            .map(row => [
                text(row.staging_allocation_line_id),
                numericId(row.jo_materials_reservation_id ?? row.id)
            ] as const)
            .filter(([lineId, reservationId]) => Boolean(lineId) && reservationId > 0)
    );
    const lines = rows.map(row => ({
        allocation_line_id: text(row.staging_allocation_line_id) || `movement-${numericId(row.movement_id ?? row.id)}`,
        jo_material_id: Number(text(row.remarks).match(/jo_material_id=(\d+)/i)?.[1] || 0),
        product_id: numericId(row.product_id, ["product_id", "id"]),
        mm_lot_id: numericId(row.mm_lot_id, ["lot_id", "id"]),
        inventory_lot_id: numericId(row.inventory_lot_id, ["inventory_lot_id", "id"]),
        lot_name: "",
        batch_no: text(row.batch_no),
        quantity: Math.abs(quantity(row.quantity))
    }));
    const movementLineIds = lines.map(line => line.allocation_line_id);
    const missingReservationLines = movementLineIds.filter(lineId => !reservationByLine.has(lineId));
    const duplicateMovementLines = movementLineIds.filter((lineId, index) => movementLineIds.indexOf(lineId) !== index);
    if (missingReservationLines.length > 0 || duplicateMovementLines.length > 0) {
        throw new MaterialStagingAllocationError(
            "The staging operation does not have a complete one-to-one reservation and movement record. Reconciliation is required before retrying.",
            503,
            "STAGING_RECONCILIATION_REQUIRED",
            { operation_id: operationId, missing_reservation_lines: missingReservationLines, duplicate_movement_lines: duplicateMovementLines }
        );
    }
    return {
        success: true,
        idempotent: true,
        message: "This material staging operation was already committed.",
        data: {
            job_order_id: numericId(first.source_document_id),
            job_order_no: text(first.source_document_no),
            target_bin: text(first.remarks).match(/target_bin=([^;|]+)/i)?.[1]?.trim() || "",
            operation_id: operationId,
            lines,
            movement_ids: rows.map(row => numericId(row.movement_id ?? row.id)).filter(id => id > 0),
            reservation_ids: lines.map(line => reservationByLine.get(line.allocation_line_id)!).filter(id => id > 0),
            material_results: []
        }
    };
}

export async function commitAllocation(
    payload: AllocationPreviewPayload & { operation_id: string; preview_token: string; remarks?: string },
    actorUserId: number
): Promise<StagingCommitResponse> {
    const operationId = text(payload.operation_id);
    if (!operationId) throw new MaterialStagingAllocationError("An operation ID is required for staging.", 400, "OPERATION_ID_REQUIRED");
    if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0) {
        throw new MaterialStagingAllocationError("An authenticated user is required to stage material.", 401, "AUTHENTICATION_REQUIRED");
    }
    const token = verifyPreviewToken(payload.preview_token);
    if (token.job_order_id !== payload.job_order_id || token.work_center_id !== payload.work_center_id || token.mode !== payload.mode) {
        throw new MaterialStagingAllocationError("The allocation preview does not match this commit request.", 409, "PREVIEW_TOKEN_MISMATCH");
    }
    const existing = await existingOperation(operationId, token.fingerprint);
    if (existing) return existing;

    const previewPromiseFingerprint = `${token.fingerprint}:${JSON.stringify(normalizedLines(payload))}`;
    const claim = operationClaims.get(operationId);
    if (claim && claim !== previewPromiseFingerprint) {
        throw new MaterialStagingAllocationError("This operation ID is already being used for a different allocation payload.", 409, "OPERATION_ID_CONFLICT");
    }
    if (claim) throw new MaterialStagingAllocationError("This staging operation is already being processed. Refresh before retrying.", 409, "OPERATION_IN_PROGRESS");
    operationClaims.set(operationId, previewPromiseFingerprint);

    const state: MutationState = {
        createdMovementIds: [],
        createdReservationIds: [],
        patchedReservations: [],
        previousJobOrderStatus: null,
        jobOrderId: 0,
        jobOrderPatched: false
    };
    try {
        const prepared = await prepareAllocationPreview(payload);
        if (prepared.fingerprint !== token.fingerprint) {
            throw new MaterialStagingAllocationError("Inventory or reservation data changed after the preview. Generate a new preview before posting.", 409, "PREVIEW_STALE");
        }
        if (prepared.preview.shortages.length > 0) {
            throw new MaterialStagingAllocationError("The selected allocations do not fully cover every required material.", 409, "ALLOCATION_INCOMPLETE", { shortages: prepared.preview.shortages });
        }

        const transactionTypeId = await resolveTransactionTypeId("MATERIAL_STAGING_ISSUE");
        const reservationIds: number[] = [];
        const movementIds: number[] = [];
        for (const line of prepared.preview.proposed_allocations) {
            const material = prepared.context.materials.find(item => item.id === line.jo_material_id);
            if (!material) throw new MaterialStagingAllocationError("The allocation material could not be revalidated.", 409, "MATERIAL_REVALIDATION_FAILED");
            const candidate = (prepared.context.candidatesByMaterial.get(material.id) || []).find(item =>
                item.mm_lot_id === line.mm_lot_id
                && item.inventory_lot_id === line.inventory_lot_id
                && normalizeBatchNo(item.batch_no) === normalizeBatchNo(line.batch_no)
            );
            if (!candidate) throw new MaterialStagingAllocationError("A selected lot/batch is no longer eligible. Generate a new preview.", 409, "ALLOCATION_CANDIDATE_STALE");

            const existingReservation = prepared.context.reservations.find(reservation =>
                reservationMatches(reservation, material.id, candidate)
                && !text(reservation.row.staging_operation_id)
            );
            const nextStagedQuantity = roundQuantity((existingReservation?.stagedQuantity || 0) + line.quantity);
            const nextReservedQuantity = Math.max(existingReservation?.reservedQuantity || 0, nextStagedQuantity);
            const reservationBody = {
                product_id: material.productId,
                branch_id: prepared.context.branchId,
                mm_lot_id: candidate.mm_lot_id,
                inventory_lot_id: candidate.inventory_lot_id,
                batch_no: candidate.batch_no,
                jo_material_id: material.id,
                reserved_quantity: nextReservedQuantity,
                staged_quantity: nextStagedQuantity,
                staging_bin: prepared.context.targetBin,
                staging_operation_id: operationId,
                staging_allocation_line_id: line.allocation_line_id,
                reservation_status: nextStagedQuantity + QUANTITY_EPSILON >= nextReservedQuantity ? "HARD" : "PARTIAL",
                created_by: actorUserId
            };
            let reservationId: number;
            if (existingReservation) {
                state.patchedReservations.push({ id: existingReservation.id, snapshot: reservationSnapshot(existingReservation.row) });
                await directusRequest(
                    `/items/manufacturing_job_order_materials_reservations/${existingReservation.id}`,
                    { method: "PATCH", headers, body: JSON.stringify(reservationBody) },
                    "Update staged reservation",
                    false
                );
                reservationId = existingReservation.id;
            } else {
                const createdReservation = await directusRequest<DirectusRecord>(
                    "/items/manufacturing_job_order_materials_reservations",
                    { method: "POST", headers, body: JSON.stringify(reservationBody) },
                    "Create staged reservation",
                    true
                );
                reservationId = recordId(createdReservation);
                if (!reservationId) throw new MaterialStagingAllocationError("The staged reservation did not return an ID.", 503, "RESERVATION_WRITE_FAILED");
                state.createdReservationIds.push(reservationId);
            }
            reservationIds.push(reservationId);

            const overrideRemark = line.override_negative ? `[NEGATIVE OVERRIDE] ${text(payload.override_remarks)}; ` : "";
            const remarks = `[MM-MATERIAL-STAGING] operation_id=${operationId};preview_fingerprint=${prepared.fingerprint};staging_allocation_line_id=${line.allocation_line_id};target_bin=${prepared.context.targetBin};work_center_id=${prepared.context.workCenterId};jo_material_id=${material.id}; source_bin=${SOURCE_BIN}; JO #${prepared.context.jobOrderNo}. ${overrideRemark}${text(payload.remarks) || "Canonical material staging issue"}`;
            const movement = await directusRequest<DirectusRecord>(
                "/items/inventory_movements",
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        product_id: material.productId,
                        mm_lot_id: candidate.mm_lot_id,
                        inventory_lot_id: candidate.inventory_lot_id,
                        branch_id: prepared.context.branchId,
                        transaction_type_id: transactionTypeId,
                        source_document_id: prepared.context.jobOrderId,
                        source_document_no: prepared.context.jobOrderNo,
                        batch_no: candidate.batch_no,
                        quantity: -line.quantity,
                        created_by: actorUserId,
                        staging_operation_id: operationId,
                        staging_allocation_line_id: line.allocation_line_id,
                        remarks
                    })
                },
                "Create material staging movement",
                true
            );
            const movementId = numericId(movement.movement_id ?? movement.id);
            if (!movementId) throw new MaterialStagingAllocationError("The material staging movement did not return an ID.", 503, "MOVEMENT_WRITE_FAILED");
            state.createdMovementIds.push(movementId);
            movementIds.push(movementId);
        }

        const allMaterialsStaged = prepared.context.materials.every(material => {
            const previewMaterial = prepared.preview.materials.find(item => item.jo_material_id === material.id);
            if (previewMaterial) return previewMaterial.shortage_quantity <= QUANTITY_EPSILON;
            return material.requiredQuantity - material.stagedQuantity <= QUANTITY_EPSILON;
        });
        if (allMaterialsStaged && canonicalTypeName(prepared.context.jobOrder.status) !== "RESERVED") {
            state.previousJobOrderStatus = prepared.context.jobOrder.status ?? null;
            state.jobOrderId = prepared.context.jobOrderId;
            state.jobOrderPatched = true;
            await directusRequest(
                `/items/manufacturing_job_orders/${prepared.context.jobOrderId}`,
                { method: "PATCH", headers, body: JSON.stringify({ status: "Reserved" }) },
                "Update Job Order staging status"
            );
        }

        const materialResults: BatchStageMaterialResult[] = prepared.preview.materials.map(material => ({
            jo_material_id: material.jo_material_id,
            product_id: material.product_id,
            product_name: material.product_name,
            uom: material.uom,
            requested_quantity: material.remaining_quantity,
            staged_quantity: material.proposed_allocations.reduce((total, line) => total + line.quantity, 0),
            remaining_quantity: material.shortage_quantity,
            status: material.shortage_quantity <= QUANTITY_EPSILON ? "STAGED" : "PARTIAL",
            message: material.shortage_quantity <= QUANTITY_EPSILON ? "Material staged successfully." : "Material remains unstaged.",
            lot_results: material.proposed_allocations.map(line => ({
                allocation_id: undefined,
                lot_id: line.mm_lot_id,
                batch_no: line.batch_no,
                requested_quantity: line.quantity,
                staged_quantity: line.quantity,
                available_quantity: line.available_quantity,
                shortage_quantity: 0,
                status: "STAGED",
                message: "Material staging issue posted."
            }))
        }));
        return {
            success: true,
            idempotent: false,
            message: "Material allocation was staged successfully.",
            data: {
                job_order_id: prepared.context.jobOrderId,
                job_order_no: prepared.context.jobOrderNo,
                target_bin: prepared.context.targetBin,
                operation_id: operationId,
                lines: prepared.preview.proposed_allocations,
                movement_ids: movementIds,
                reservation_ids: reservationIds,
                material_results: materialResults
            }
        };
    } catch (error) {
        const rollbackFailures = await rollbackMutations(state);
        if (rollbackFailures.length > 0 && state.jobOrderPatched) {
            rollbackFailures.push("Job Order status rollback requires reconciliation.");
        }
        if (rollbackFailures.length > 0) {
            throw new MaterialStagingAllocationError(
                `${error instanceof Error ? error.message : "Material staging failed."} Reconciliation is required because rollback was incomplete.`,
                502,
                "STAGING_RECONCILIATION_REQUIRED",
                { rollback_failures: rollbackFailures, operation_id: operationId }
            );
        }
        throw error;
    } finally {
        operationClaims.delete(operationId);
    }
}
