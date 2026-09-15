/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
    DIRECTUS_URL,
    headers,
    formatPhtDateTime,
    getISOStringInConfiguredTimezone
} from "@/app/api/manufacturing/directus-api";
import {
    isCancelledJobOrderStatus,
    JOB_ORDER_STATUS,
    normalizeJobOrderStatus
} from "@/modules/manufacturing-management/job-order-status";
import { loadEligibleFinishedGoodsLot, MmLotError } from "../services/mm-lots.service";

const EPSILON = 0.000001;

class ProductionSessionError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "ProductionSessionError";
    }
}

class DirectusSessionPersistenceError extends Error {
    constructor(message: string, readonly status = 502) {
        super(message);
        this.name = "DirectusSessionPersistenceError";
    }
}

interface MaterialLine {
    joMaterialId: number;
    reservationId: number;
    productId: number;
    mmLotId: number;
    inventoryLotId: number;
    batchNo: string;
    uomId: number;
    actualQty: number;
}

interface SessionInput {
    sessionKey: string;
    taskId: number;
    joId: number;
    workCenterId: number | null;
    shiftName: string;
    productionDate: string;
    goodQty: number;
    rejectedQty: number;
    scrapQty: number;
    batchNo: string;
    manufacturingDate: string | null;
    expiryDate: string | null;
    targetLotId: number | null;
    remarks: string | null;
    materials: MaterialLine[];
}

interface MaterialPlan {
    line: MaterialLine;
    material: any;
    reservation: any;
    sourceEventKey: string;
    theoreticalQuantity: number;
    reservationActualBefore: number;
    reservationActualAfter: number;
    remainingWipBefore: number;
    remainingWipAfter: number;
    materialActualBefore: number;
    materialActualAfter: number;
    materialReservedBefore: number;
    materialReservedAfter: number;
    existingConsumption?: any | null;
}

function numberId(value: unknown, keys: string[] = ["id"]): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const nested = Number(record[key]);
            if (Number.isSafeInteger(nested) && nested > 0) return nested;
        }
        return 0;
    }

    const numeric = Number(value ?? 0);
    return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : 0;
}

function finiteNumber(value: unknown): number {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function sameNumber(left: unknown, right: unknown): boolean {
    return Math.abs(finiteNumber(left) - finiteNumber(right)) <= EPSILON;
}

function textValue(value: unknown): string {
    return value === undefined || value === null ? "" : String(value).trim();
}

function isTrue(value: unknown): boolean {
    return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

function roundedQuantity(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
}

function requiredInteger(value: unknown, label: string): number {
    const numeric = numberId(value);
    if (!numeric) {
        throw new ProductionSessionError(422, "INVALID_FIELD", `${label} must be a positive integer.`, { field: label });
    }
    return numeric;
}

function requiredNonNegative(value: unknown, label: string): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        throw new ProductionSessionError(422, "INVALID_QUANTITY", `${label} must be a non-negative number.`, { field: label });
    }
    return roundedQuantity(numeric);
}

function parseDate(value: unknown, label: string, required: boolean): string | null {
    const text = textValue(value);
    if (!text) {
        if (required) {
            throw new ProductionSessionError(422, "DATE_REQUIRED", `${label} is required.`, { field: label });
        }
        return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new ProductionSessionError(422, "INVALID_DATE", `${label} must use YYYY-MM-DD format.`, { field: label });
    }

    const parsed = new Date(`${text}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
        throw new ProductionSessionError(422, "INVALID_DATE", `${label} is not a valid calendar date.`, { field: label });
    }
    return text;
}

function normalizeSessionInput(body: any): SessionInput {
    const rawMaterials = body && Array.isArray(body.materialsConsumed) ? body.materialsConsumed : null;
    if (!rawMaterials) {
        throw new ProductionSessionError(422, "MATERIAL_RESERVATIONS_REQUIRED", "Explicit WIP reservation consumption lines are required.");
    }

    const sessionKey = textValue(body?.sessionKey);
    if (!sessionKey || sessionKey.length > 128) {
        throw new ProductionSessionError(422, "SESSION_KEY_REQUIRED", "A production session key is required and must be at most 128 characters.");
    }

    const shiftName = textValue(body?.shiftName);
    if (!shiftName || shiftName.length > 128) {
        throw new ProductionSessionError(422, "SHIFT_REQUIRED", "A shift name is required and must be at most 128 characters.");
    }

    const goodQty = requiredNonNegative(body?.yieldQty ?? body?.goodQty, "Good output quantity");
    const rejectedQty = requiredNonNegative(body?.rejectedQty ?? body?.rejectQty ?? 0, "Rejected output quantity");
    const scrapQty = requiredNonNegative(body?.scrapQty ?? 0, "Scrap output quantity");
    const totalOutput = goodQty + rejectedQty + scrapQty;
    if (totalOutput <= EPSILON) {
        throw new ProductionSessionError(422, "OUTPUT_REQUIRED", "At least one good, rejected, or scrap unit must be recorded.");
    }

    const batchNo = textValue(body?.batchNo);
    if (!batchNo || batchNo.length > 100) {
        throw new ProductionSessionError(422, "OUTPUT_BATCH_REQUIRED", "A finished-good batch or lot number is required.");
    }

    const manufacturingDate = parseDate(body?.manufacturingDate, "Manufacturing date", goodQty > EPSILON);
    const expiryDate = parseDate(body?.expiryDate, "Expiration date", false);
    if (manufacturingDate && expiryDate && expiryDate < manufacturingDate) {
        throw new ProductionSessionError(422, "INVALID_DATE_RANGE", "Expiration date cannot be earlier than the manufacturing date.");
    }

    const targetLotId = body?.targetLotId === undefined || body?.targetLotId === null || body?.targetLotId === ""
        ? null
        : requiredInteger(body.targetLotId, "Finished-good storage lot");
    if (goodQty > EPSILON && !targetLotId) {
        throw new ProductionSessionError(422, "OUTPUT_LOT_REQUIRED", "Select an existing finished-good storage lot for positive output.");
    }

    const materials: MaterialLine[] = rawMaterials
        .map((raw: any) => {
            const actualQty = requiredNonNegative(raw?.actualQty ?? raw?.actual_qty ?? 0, "Actual material quantity");
            if (actualQty <= EPSILON) return null;
            return {
                joMaterialId: requiredInteger(raw?.joMaterialId ?? raw?.jo_material_id, "JO material ID"),
                reservationId: requiredInteger(raw?.reservationId ?? raw?.reservation_id, "WIP reservation ID"),
                productId: requiredInteger(raw?.productId ?? raw?.product_id, "Material product ID"),
                mmLotId: requiredInteger(raw?.mmLotId ?? raw?.mm_lot_id, "Material MM lot ID"),
                inventoryLotId: requiredInteger(raw?.inventoryLotId ?? raw?.inventory_lot_id, "Material inventory lot ID"),
                batchNo: textValue(raw?.batchNo ?? raw?.batch_no),
                uomId: requiredInteger(raw?.uomId ?? raw?.uom_id, "Material UOM ID"),
                actualQty
            } satisfies MaterialLine;
        })
        .filter((line: MaterialLine | null): line is MaterialLine => Boolean(line));

    const reservationIds = new Set<number>();
    for (const line of materials) {
        if (!line.batchNo || line.batchNo.length > 100) {
            throw new ProductionSessionError(422, "MATERIAL_BATCH_REQUIRED", "Every consumed reservation must include its material batch number.");
        }
        if (reservationIds.has(line.reservationId)) {
            throw new ProductionSessionError(422, "MATERIAL_DUPLICATE_RESERVATION", `Reservation ${line.reservationId} was submitted more than once.`);
        }
        reservationIds.add(line.reservationId);
    }

    const remarksParts = [textValue(body?.remarks), textValue(body?.rejectionRemarks)];
    const rejectionReasonId = textValue(body?.rejectionReasonId);
    if (rejectionReasonId) remarksParts.push(`Rejection reason ID: ${rejectionReasonId}`);
    const remarks = remarksParts.filter(Boolean).join(" | ").slice(0, 5000) || null;

    return {
        sessionKey,
        taskId: requiredInteger(body?.taskId, "Routing task ID"),
        joId: requiredInteger(body?.joId, "Job Order ID"),
        workCenterId: body?.workCenterId === undefined || body?.workCenterId === null || body?.workCenterId === ""
            ? null
            : requiredInteger(body.workCenterId, "Work center ID"),
        shiftName,
        productionDate: parseDate(body?.productionDate, "Production date", true) as string,
        goodQty,
        rejectedQty,
        scrapQty,
        batchNo,
        manufacturingDate,
        expiryDate,
        targetLotId,
        remarks,
        materials
    };
}

function sessionSourceKey(input: SessionInput): string {
    return `production-session:${input.joId}:${input.sessionKey}`;
}

function lineSourceKey(input: SessionInput, reservationId: number): string {
    return `${sessionSourceKey(input)}:reservation:${reservationId}`;
}

function requestHash(input: SessionInput): string {
    const canonical = {
        sessionKey: input.sessionKey,
        taskId: input.taskId,
        joId: input.joId,
        workCenterId: input.workCenterId,
        shiftName: input.shiftName,
        productionDate: input.productionDate,
        goodQty: input.goodQty,
        rejectedQty: input.rejectedQty,
        scrapQty: input.scrapQty,
        batchNo: input.batchNo,
        manufacturingDate: input.manufacturingDate,
        expiryDate: input.expiryDate,
        targetLotId: input.targetLotId,
        remarks: input.remarks,
        materials: [...input.materials]
            .sort((left, right) => left.reservationId - right.reservationId)
            .map((line) => ({ ...line }))
    };
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

async function directusRequest<T = any>(pathname: string, label: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${pathname}`, {
            ...init,
            headers: { ...headers, ...(init.headers || {}) },
            cache: "no-store"
        });
    } catch (error) {
        throw new DirectusSessionPersistenceError(`${label} could not reach Manufacturing Directus: ${(error as Error).message}`);
    }

    const responseText = await response.text();
    let payload: any = null;
    try { payload = responseText ? JSON.parse(responseText) : null; } catch { payload = null; }
    if (!response.ok) {
        throw new DirectusSessionPersistenceError(`${label} failed with HTTP ${response.status}: ${responseText || "No response body"}`, response.status >= 400 && response.status < 500 ? response.status : 502);
    }
    if (payload?.data === undefined || payload?.data === null) {
        throw new DirectusSessionPersistenceError(`${label} returned no data from Manufacturing Directus.`);
    }
    return payload.data as T;
}

async function directusRows<T = any>(pathname: string, label: string): Promise<T[]> {
    const rows = await directusRequest<unknown>(pathname, label);
    if (!Array.isArray(rows)) throw new DirectusSessionPersistenceError(`${label} returned an invalid collection response.`);
    return rows as T[];
}

async function getSessionActorId(): Promise<number> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (token) {
            const parts = token.split(".");
            if (parts.length >= 2) {
                let encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                while (encoded.length % 4) encoded += "=";
                const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
                const actorId = numberId(payload?.id ?? payload?.user_id ?? payload?.sub);
                if (actorId) return actorId;
            }
        }
    } catch (error) {
        console.warn("Unable to resolve the authenticated production operator:", error);
    }

    // Keep the existing Manufacturing service actor as a local-development
    // fallback. The client cannot choose or override this value.
    return 24;
}

function reservationSnapshot(row: any) {
    const issued = Math.max(0, finiteNumber(row.issued_to_wip_quantity));
    const staged = Math.max(0, finiteNumber(row.staged_quantity));
    const actual = Math.max(0, finiteNumber(row.actual_used_quantity));
    const returned = Math.max(0, finiteNumber(row.returned_quantity));
    const availableBasis = issued > EPSILON ? issued : staged;
    const remaining = Math.max(0, availableBasis - actual - returned);
    return { issued, actual, returned, remaining };
}

function materialSnapshot(row: any) {
    return {
        actual: Math.max(0, finiteNumber(row.actual_consumed_quantity)),
        reserved: Math.max(0, finiteNumber(row.reserved_quantity ?? row.allocated_quantity))
    };
}

function assertExactReservation(input: SessionInput, line: MaterialLine, material: any, reservation: any, branchId: number) {
    const reservationId = numberId(reservation.jo_materials_reservation_id ?? reservation.id);
    if (!reservationId || reservationId !== line.reservationId) {
        throw new ProductionSessionError(422, "MATERIAL_RESERVATION_MISMATCH", `Reservation ${line.reservationId} could not be found for this Job Order.`);
    }

    const materialId = numberId(reservation.jo_material_id);
    const materialProductId = numberId(material.product_id);
    const reservationProductId = numberId(reservation.product_id);
    if (materialId !== line.joMaterialId || materialId !== numberId(material.jo_material_id ?? material.id)) {
        throw new ProductionSessionError(422, "MATERIAL_RESERVATION_MISMATCH", `Reservation ${line.reservationId} is not attached to the selected JO material.`);
    }
    if (reservationProductId !== line.productId || materialProductId !== line.productId) {
        throw new ProductionSessionError(422, "MATERIAL_PRODUCT_MISMATCH", `Reservation ${line.reservationId} does not match the selected material product.`);
    }
    if (numberId(reservation.branch_id) !== branchId) {
        throw new ProductionSessionError(422, "MATERIAL_BRANCH_MISMATCH", `Reservation ${line.reservationId} belongs to another branch.`);
    }

    const status = textValue(reservation.reservation_status).toUpperCase();
    if (status !== "WIP") {
        throw new ProductionSessionError(422, "MATERIAL_WIP_REQUIRED", `Reservation ${line.reservationId} is ${status || "not staged"}; only WIP reservations can be consumed.`);
    }

    const reservationMmLotId = numberId(reservation.mm_lot_id, ["lot_id", "mm_lot_id", "id"]);
    const reservationInventoryLotId = numberId(reservation.inventory_lot_id, ["inventory_lot_id", "id"]);
    const reservationUomId = numberId(reservation.uom_id, ["unit_id", "uom_id", "id"]);
    const reservationBatchNo = textValue(reservation.batch_no);
    if (!reservationMmLotId || reservationMmLotId !== line.mmLotId) {
        throw new ProductionSessionError(422, "MATERIAL_LOT_MISMATCH", `Reservation ${line.reservationId} does not match the selected MM lot.`);
    }
    if (!reservationInventoryLotId || reservationInventoryLotId !== line.inventoryLotId) {
        throw new ProductionSessionError(422, "MATERIAL_INVENTORY_LOT_MISMATCH", `Reservation ${line.reservationId} does not match the selected inventory lot.`);
    }
    if (!reservationBatchNo || reservationBatchNo !== line.batchNo) {
        throw new ProductionSessionError(422, "MATERIAL_BATCH_MISMATCH", `Reservation ${line.reservationId} does not match the selected material batch.`);
    }
    if (!reservationUomId || reservationUomId !== line.uomId) {
        throw new ProductionSessionError(422, "MATERIAL_UOM_MISMATCH", `Reservation ${line.reservationId} does not match the selected UOM.`);
    }

    const materialUomId = numberId(material.uom_id, ["unit_id", "uom_id", "id"]);
    if (materialUomId && materialUomId !== line.uomId) {
        throw new ProductionSessionError(422, "MATERIAL_UOM_MISMATCH", `Reservation ${line.reservationId} does not match the JO material UOM.`);
    }

    const snapshot = reservationSnapshot(reservation);
    if (snapshot.issued <= EPSILON) {
        throw new ProductionSessionError(422, "MATERIAL_WIP_REQUIRED", `Reservation ${line.reservationId} has no quantity issued to WIP.`);
    }
    if (line.actualQty > snapshot.remaining + EPSILON) {
        throw new ProductionSessionError(409, "MATERIAL_WIP_SHORTAGE", `Reservation ${line.reservationId} has only ${snapshot.remaining.toLocaleString()} units of remaining WIP; ${line.actualQty.toLocaleString()} were requested.`, {
            reservationId: line.reservationId,
            remainingWip: snapshot.remaining,
            requestedQuantity: line.actualQty
        });
    }

    return snapshot;
}

function assertExistingConsumptionMatches(row: any, line: MaterialLine) {
    const checks: Array<[string, unknown, unknown]> = [
        ["JO material", row.jo_material_id, line.joMaterialId],
        ["reservation", row.reservation_id, line.reservationId],
        ["product", row.product_id, line.productId],
        ["MM lot", row.mm_lot_id, line.mmLotId],
        ["inventory lot", row.inventory_lot_id, line.inventoryLotId],
        ["UOM", row.uom_id, line.uomId],
        ["batch", textValue(row.batch_no), line.batchNo]
    ];
    for (const [label, actual, expected] of checks) {
        const matches = typeof actual === "string" || typeof expected === "string"
            ? textValue(actual) === textValue(expected)
            : numberId(actual) === numberId(expected);
        if (!matches) {
            throw new ProductionSessionError(409, "SESSION_CONFLICT", `The existing production session has a different ${label} selection.`);
        }
    }
    if (!sameNumber(row.quantity_consumed, line.actualQty)) {
        throw new ProductionSessionError(409, "SESSION_CONFLICT", "The existing production session has a different material quantity.");
    }
}

async function loadSessionChildren(ledgerId: number, joId: number) {
    const [consumptionRows, genealogyRows] = await Promise.all([
        directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger_bom_consumage?filter[ledger_id][_eq]=${encodeURIComponent(String(ledgerId))}&limit=-1`,
            `Load consumption rows for production ledger ${ledgerId}`
        ),
        directusRows<any>(
            `${DIRECTUS_URL}/items/jo_material_genealogy?filter[job_order_id][_eq]=${encodeURIComponent(String(joId))}&limit=-1`,
            `Load genealogy rows for Job Order ${joId}`
        )
    ]);
    return { consumptionRows, genealogyRows };
}

async function applyReservationUpdate(plan: MaterialPlan, consumptionRow: any) {
    if (isTrue(consumptionRow.reservation_applied)) return;

    const reservationId = plan.line.reservationId;
    const current = await directusRequest<any>(
        `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations/${encodeURIComponent(String(reservationId))}?fields=jo_materials_reservation_id,jo_material_id,product_id,branch_id,batch_no,mm_lot_id,inventory_lot_id,uom_id,reservation_status,staged_quantity,issued_to_wip_quantity,actual_used_quantity,returned_quantity,remaining_wip_quantity`,
        `Reload WIP reservation ${reservationId}`
    );
    const currentSnapshot = reservationSnapshot(current);
    const alreadyApplied = sameNumber(currentSnapshot.actual, plan.reservationActualAfter)
        && sameNumber(currentSnapshot.remaining, plan.remainingWipAfter);
    const stillAtBaseline = sameNumber(currentSnapshot.actual, plan.reservationActualBefore)
        && sameNumber(currentSnapshot.remaining, plan.remainingWipBefore);

    if (!alreadyApplied && !stillAtBaseline) {
        throw new ProductionSessionError(409, "MATERIAL_RESERVATION_CHANGED", `Reservation ${reservationId} changed while this production session was being recorded. Reconcile the WIP balance before retrying.`);
    }

    if (stillAtBaseline) {
        await directusRequest(
            `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations/${encodeURIComponent(String(reservationId))}`,
            `Apply consumption to WIP reservation ${reservationId}`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    actual_used_quantity: plan.reservationActualAfter,
                    remaining_wip_quantity: plan.remainingWipAfter
                })
            }
        );
    }

    const consumptionId = numberId(consumptionRow.consumage_id ?? consumptionRow.id);
    if (!consumptionId) throw new DirectusSessionPersistenceError("Consumption row returned no identifier.");
    await directusRequest(
        `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger_bom_consumage/${encodeURIComponent(String(consumptionId))}`,
        `Mark consumption ${consumptionId} as applied`,
        { method: "PATCH", body: JSON.stringify({ reservation_applied: true }) }
    );
}

async function applyMaterialAggregate(plan: MaterialPlan, consumptionRow: any) {
    if (isTrue(consumptionRow.material_aggregate_applied)) return;

    const materialId = numberId(plan.material.jo_material_id ?? plan.material.id);
    const current = await directusRequest<any>(
        `${DIRECTUS_URL}/items/manufacturing_job_order_materials/${encodeURIComponent(String(materialId))}?fields=jo_material_id,actual_consumed_quantity,reserved_quantity,allocated_quantity`,
        `Reload JO material ${materialId}`
    );
    const currentSnapshot = materialSnapshot(current);
    const alreadyApplied = sameNumber(currentSnapshot.actual, plan.materialActualAfter)
        && sameNumber(currentSnapshot.reserved, plan.materialReservedAfter);
    const stillAtBaseline = sameNumber(currentSnapshot.actual, plan.materialActualBefore)
        && sameNumber(currentSnapshot.reserved, plan.materialReservedBefore);

    if (!alreadyApplied && !stillAtBaseline) {
        throw new ProductionSessionError(409, "MATERIAL_AGGREGATE_CHANGED", `JO material ${materialId} changed while this production session was being recorded. Retry after reconciling the material balance.`);
    }

    if (stillAtBaseline) {
        await directusRequest(
            `${DIRECTUS_URL}/items/manufacturing_job_order_materials/${encodeURIComponent(String(materialId))}`,
            `Apply consumption aggregate to JO material ${materialId}`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    actual_consumed_quantity: plan.materialActualAfter,
                    reserved_quantity: plan.materialReservedAfter
                })
            }
        );
    }

    const consumptionId = numberId(consumptionRow.consumage_id ?? consumptionRow.id);
    await directusRequest(
        `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger_bom_consumage/${encodeURIComponent(String(consumptionId))}`,
        `Mark material aggregate ${consumptionId} as applied`,
        { method: "PATCH", body: JSON.stringify({ material_aggregate_applied: true }) }
    );
}

async function ensureConsumptionAndGenealogy(
    input: SessionInput,
    plan: MaterialPlan,
    existingConsumptionRows: any[],
    existingGenealogyRows: any[],
    ledgerId: number,
    createdAt: string
) {
    const consumptionKey = plan.sourceEventKey;
    let consumptionRow = existingConsumptionRows.find((row) => textValue(row.source_event_key) === consumptionKey);
    if (consumptionRow) {
        assertExistingConsumptionMatches(consumptionRow, plan.line);
    } else {
        consumptionRow = await directusRequest<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger_bom_consumage`,
            `Create exact consumption for reservation ${plan.line.reservationId}`,
            {
                method: "POST",
                body: JSON.stringify({
                    ledger_id: ledgerId,
                    jo_material_id: plan.line.joMaterialId,
                    reservation_id: plan.line.reservationId,
                    product_id: plan.line.productId,
                    mm_lot_id: plan.line.mmLotId,
                    inventory_lot_id: plan.line.inventoryLotId,
                    batch_no: plan.line.batchNo,
                    uom_id: plan.line.uomId,
                    quantity_consumed: plan.line.actualQty,
                    theoretical_quantity: plan.theoreticalQuantity,
                    session_key: input.sessionKey,
                    source_event_key: consumptionKey,
                    reservation_actual_before: plan.reservationActualBefore,
                    reservation_actual_after: plan.reservationActualAfter,
                    remaining_wip_before: plan.remainingWipBefore,
                    remaining_wip_after: plan.remainingWipAfter,
                    reservation_applied: false,
                    material_actual_before: plan.materialActualBefore,
                    material_actual_after: plan.materialActualAfter,
                    material_reserved_before: plan.materialReservedBefore,
                    material_reserved_after: plan.materialReservedAfter,
                    material_aggregate_applied: false
                })
            }
        );
        existingConsumptionRows.push(consumptionRow);
    }

    await applyReservationUpdate(plan, consumptionRow);
    await applyMaterialAggregate(plan, consumptionRow);

    const genealogyKey = plan.sourceEventKey;
    const existingGenealogy = existingGenealogyRows.find((row) => textValue(row.source_event_key) === genealogyKey);
    if (existingGenealogy) {
        if (!sameNumber(existingGenealogy.consumed_quantity, plan.line.actualQty)
            || numberId(existingGenealogy.reservation_id) !== plan.line.reservationId
            || numberId(existingGenealogy.component_inventory_lot_id) !== plan.line.inventoryLotId
            || textValue(existingGenealogy.component_batch_no) !== plan.line.batchNo) {
            throw new ProductionSessionError(409, "SESSION_CONFLICT", `The existing genealogy record for reservation ${plan.line.reservationId} does not match the submitted session.`);
        }
    } else {
        const genealogy = await directusRequest<any>(
            `${DIRECTUS_URL}/items/jo_material_genealogy`,
            `Create genealogy for reservation ${plan.line.reservationId}`,
            {
                method: "POST",
                body: JSON.stringify({
                    job_order_id: input.joId,
                    batch_no: input.batchNo,
                    component_product_id: plan.line.productId,
                    component_mm_lot_id: plan.line.mmLotId,
                    component_lot_id: null,
                    component_inventory_lot_id: plan.line.inventoryLotId,
                    component_batch_no: plan.line.batchNo,
                    consumed_quantity: plan.line.actualQty,
                    jo_material_id: plan.line.joMaterialId,
                    reservation_id: plan.line.reservationId,
                    uom_id: plan.line.uomId,
                    session_key: input.sessionKey,
                    source_event_key: genealogyKey,
                    created_at: createdAt
                })
            }
        );
        existingGenealogyRows.push(genealogy);
    }
}

async function updateJobOrderAggregates(joId: number, ledgerId: number, actorId: number, now: string) {
    const [jobOrder, yieldRows] = await Promise.all([
        directusRequest<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_orders/${encodeURIComponent(String(joId))}?fields=job_order_id,completed_quantity,rejected_quantity,status`,
            `Reload Job Order ${joId} before aggregate update`
        ),
        directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${encodeURIComponent(String(joId))}&fields=yield_quantity,rejected_quantity,scrap_quantity&limit=-1`,
            `Reload yield ledger for Job Order ${joId}`
        )
    ]);

    const completedQuantity = roundedQuantity(yieldRows.reduce((sum, row) => sum + Math.max(0, finiteNumber(row.yield_quantity)), 0));
    const rejectedQuantity = roundedQuantity(yieldRows.reduce((sum, row) => sum + Math.max(0, finiteNumber(row.rejected_quantity)) + Math.max(0, finiteNumber(row.scrap_quantity)), 0));
    const currentCompleted = Math.max(0, finiteNumber(jobOrder.completed_quantity));
    const currentRejected = Math.max(0, finiteNumber(jobOrder.rejected_quantity));

    const patch: Record<string, unknown> = {
        modified_by: actorId,
        modified_at: now
    };
    if (!sameNumber(currentCompleted, completedQuantity)) patch.completed_quantity = completedQuantity;
    if (!sameNumber(currentRejected, rejectedQuantity)) patch.rejected_quantity = rejectedQuantity;
    if (Object.keys(patch).length > 2) {
        await directusRequest(
            `${DIRECTUS_URL}/items/manufacturing_job_orders/${encodeURIComponent(String(joId))}`,
            `Update production aggregates for Job Order ${joId}`,
            { method: "PATCH", body: JSON.stringify(patch) }
        );
    }

    await directusRequest(
        `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}`,
        `Mark production ledger ${ledgerId} as aggregate-updated`,
        { method: "PATCH", body: JSON.stringify({ job_order_updated: true }) }
    );
}

function responsePayload(input: SessionInput, ledger: any, consumptionRows: any[], genealogyRows: any[], actorId: number, workCenterId: number, idempotent: boolean) {
    return {
        success: true,
        idempotent,
        ledgerId: numberId(ledger.ledger_id ?? ledger.id),
        sessionKey: input.sessionKey,
        sourceEventKey: textValue(ledger.source_event_key) || sessionSourceKey(input),
        jobOrderId: input.joId,
        shiftName: input.shiftName,
        operatorId: numberId(ledger.logged_by) || actorId,
        workCenterId,
        productionDate: input.productionDate,
        goodQuantity: input.goodQty,
        rejectedQuantity: input.rejectedQty,
        scrapQuantity: input.scrapQty,
        batchNo: input.batchNo,
        mmLotId: numberId(ledger.mm_lot_id, ["lot_id", "mm_lot_id", "id"]) || null,
        manufacturingDate: input.manufacturingDate,
        expiryDate: input.expiryDate,
        remarks: input.remarks,
        qaStatus: "Pending",
        materials: consumptionRows.map((row) => ({
            consumageId: numberId(row.consumage_id ?? row.id),
            joMaterialId: numberId(row.jo_material_id),
            reservationId: numberId(row.reservation_id),
            productId: numberId(row.product_id),
            mmLotId: numberId(row.mm_lot_id),
            inventoryLotId: numberId(row.inventory_lot_id),
            batchNo: textValue(row.batch_no),
            uomId: numberId(row.uom_id),
            theoreticalQuantity: finiteNumber(row.theoretical_quantity),
            actualQuantity: finiteNumber(row.quantity_consumed),
            reservationApplied: isTrue(row.reservation_applied),
            materialAggregateApplied: isTrue(row.material_aggregate_applied)
        })),
        genealogyRecords: genealogyRows.filter((row) => textValue(row.session_key) === input.sessionKey).map((row) => ({
            genealogyId: numberId(row.genealogy_id ?? row.id),
            reservationId: numberId(row.reservation_id),
            inventoryLotId: numberId(row.component_inventory_lot_id),
            batchNo: textValue(row.component_batch_no),
            quantityConsumed: finiteNumber(row.consumed_quantity)
        }))
    };
}

export async function recordShiftRunSession(request: Request): Promise<NextResponse> {
    try {
        const body = await request.json();
        const input = normalizeSessionInput(body);
        const actorId = await getSessionActorId();
        const now = await getISOStringInConfiguredTimezone();
        const createdAt = formatPhtDateTime();
        const sourceEventKey = sessionSourceKey(input);
        const hash = requestHash(input);

        const jobOrder = await directusRequest<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_orders/${encodeURIComponent(String(input.joId))}?fields=*`,
            `Load Job Order ${input.joId}`
        );
        const status = normalizeJobOrderStatus(jobOrder.status || JOB_ORDER_STATUS.DRAFT);
        if (!status) {
            throw new ProductionSessionError(409, "JOB_ORDER_STATUS_UNKNOWN", `Job Order ${input.joId} has an unknown status and cannot accept a production session.`);
        }
        if (isCancelledJobOrderStatus(status)) {
            throw new ProductionSessionError(409, "JOB_ORDER_CANCELLED", `Job Order ${input.joId} is cancelled and cannot accept a production session.`);
        }
        if (status !== JOB_ORDER_STATUS.IN_PRODUCTION) {
            throw new ProductionSessionError(409, "JOB_ORDER_NOT_IN_PRODUCTION", `Job Order ${input.joId} must be In Production before a session can be recorded.`);
        }

        const branchId = numberId(jobOrder.branch_id);
        const producedProductId = numberId(jobOrder.product_id);
        if (!branchId || !producedProductId) {
            throw new ProductionSessionError(422, "JOB_ORDER_CONTEXT_MISSING", "The Job Order must have a branch and finished-good product before production can be recorded.");
        }

        const route = await directusRequest<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_routes/${encodeURIComponent(String(input.taskId))}?fields=jo_route_id,job_order_id,work_center_id,status`,
            `Load routing task ${input.taskId}`
        );
        if (numberId(route.job_order_id) !== input.joId) {
            throw new ProductionSessionError(422, "ROUTING_TASK_MISMATCH", `Routing task ${input.taskId} does not belong to Job Order ${input.joId}.`);
        }
        const routeWorkCenterId = numberId(route.work_center_id);
        const workCenterId = routeWorkCenterId || numberId(jobOrder.primary_work_center_id);
        if (!workCenterId) {
            throw new ProductionSessionError(422, "STATION_REQUIRED", "A production station/work center must be assigned before recording a session.");
        }
        if (input.workCenterId && input.workCenterId !== workCenterId) {
            throw new ProductionSessionError(422, "STATION_MISMATCH", `The submitted station ${input.workCenterId} does not match routing task ${input.taskId}.`);
        }

        let resolvedOutputLotId: number | null = null;
        if (input.goodQty > EPSILON) {
            if (!input.targetLotId) {
                throw new ProductionSessionError(422, "OUTPUT_LOT_REQUIRED", "Select an existing finished-good storage lot for positive output.");
            }
            try {
                const eligibleLot = await loadEligibleFinishedGoodsLot({
                    mmLotId: input.targetLotId,
                    branchId,
                    productId: producedProductId
                });
                resolvedOutputLotId = numberId(eligibleLot.lot_id, ["lot_id", "mm_lot_id", "id"]);
            } catch (error) {
                if (error instanceof MmLotError) {
                    throw new ProductionSessionError(error.status, error.code, error.message);
                }
                throw error;
            }
        }

        const existingLedgerRows = await directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${encodeURIComponent(String(input.joId))}&filter[session_key][_eq]=${encodeURIComponent(input.sessionKey)}&limit=1`,
            `Look up production session ${input.sessionKey}`
        );
        const existingLedger = existingLedgerRows[0] || null;
        if (existingLedger && textValue(existingLedger.request_hash) && textValue(existingLedger.request_hash) !== hash) {
            throw new ProductionSessionError(409, "SESSION_CONFLICT", `Production session ${input.sessionKey} already exists with a different payload.`);
        }

        const targetQuantity = Math.max(0, finiteNumber(jobOrder.target_quantity ?? jobOrder.quantity));
        const existingYieldRows = await directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${encodeURIComponent(String(input.joId))}&fields=ledger_id,yield_quantity,session_key&limit=-1`,
            `Load existing production output for Job Order ${input.joId}`
        );
        const existingGoodQuantity = existingYieldRows
            .filter((row) => !existingLedger || numberId(row.ledger_id) !== numberId(existingLedger.ledger_id))
            .reduce((sum, row) => sum + Math.max(0, finiteNumber(row.yield_quantity)), 0);
        if (!existingLedger && targetQuantity > EPSILON && existingGoodQuantity + input.goodQty > targetQuantity * 1.05 + EPSILON) {
            throw new ProductionSessionError(422, "OUTPUT_OVER_TARGET", "This production session would exceed the Job Order target by more than the configured tolerance.");
        }

        const materials = await directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${encodeURIComponent(String(input.joId))}&limit=-1`,
            `Load required materials for Job Order ${input.joId}`
        );
        const materialById = new Map<number, any>(materials.map((row) => [numberId(row.jo_material_id ?? row.id), row]));
        const materialIds = [...materialById.keys()].filter(Boolean);
        const reservations = materialIds.length > 0
            ? await directusRows<any>(
                `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_in]=${materialIds.join(",")}&fields=jo_materials_reservation_id,jo_material_id,product_id,branch_id,batch_no,mm_lot_id,inventory_lot_id,uom_id,reservation_status,reserved_quantity,staged_quantity,issued_to_wip_quantity,actual_used_quantity,returned_quantity,remaining_wip_quantity&limit=-1`,
                `Load WIP reservations for Job Order ${input.joId}`
            )
            : [];
        const reservationById = new Map<number, any>(reservations.map((row) => [numberId(row.jo_materials_reservation_id ?? row.id), row]));

        const positiveByMaterial = new Map<number, number>();
        for (const line of input.materials) positiveByMaterial.set(line.joMaterialId, (positiveByMaterial.get(line.joMaterialId) || 0) + line.actualQty);
        for (const material of materials) {
            const materialId = numberId(material.jo_material_id ?? material.id);
            const requiredQuantity = Math.max(0, finiteNumber(material.allocated_quantity ?? material.required_quantity ?? 0));
            if (requiredQuantity > EPSILON && (positiveByMaterial.get(materialId) || 0) <= EPSILON) {
                throw new ProductionSessionError(422, "MATERIAL_RESERVATION_REQUIRED", `Provide an actual quantity from an exact WIP reservation for material ${materialId}.`, { joMaterialId: materialId });
            }
        }

        const existingChildren = existingLedger
            ? await loadSessionChildren(numberId(existingLedger.ledger_id ?? existingLedger.id), input.joId)
            : { consumptionRows: [], genealogyRows: [] };
        const cursorByMaterial = new Map<number, { actual: number; reserved: number }>();
        for (const material of materials) {
            const materialId = numberId(material.jo_material_id ?? material.id);
            const snapshot = materialSnapshot(material);
            cursorByMaterial.set(materialId, { actual: snapshot.actual, reserved: snapshot.reserved });
        }

        const plans: MaterialPlan[] = [];
        for (const line of input.materials) {
            const material = materialById.get(line.joMaterialId);
            if (!material) {
                throw new ProductionSessionError(422, "MATERIAL_RESERVATION_MISMATCH", `JO material ${line.joMaterialId} does not belong to Job Order ${input.joId}.`);
            }
            const sourceKey = lineSourceKey(input, line.reservationId);
            const existingConsumption = existingChildren.consumptionRows.find((row) => textValue(row.source_event_key) === sourceKey) || null;
            if (existingConsumption) {
                assertExistingConsumptionMatches(existingConsumption, line);
                plans.push({
                    line,
                    material,
                    reservation: reservationById.get(line.reservationId) || {},
                    sourceEventKey: sourceKey,
                    theoreticalQuantity: finiteNumber(existingConsumption.theoretical_quantity),
                    reservationActualBefore: finiteNumber(existingConsumption.reservation_actual_before),
                    reservationActualAfter: finiteNumber(existingConsumption.reservation_actual_after),
                    remainingWipBefore: finiteNumber(existingConsumption.remaining_wip_before),
                    remainingWipAfter: finiteNumber(existingConsumption.remaining_wip_after),
                    materialActualBefore: finiteNumber(existingConsumption.material_actual_before),
                    materialActualAfter: finiteNumber(existingConsumption.material_actual_after),
                    materialReservedBefore: finiteNumber(existingConsumption.material_reserved_before),
                    materialReservedAfter: finiteNumber(existingConsumption.material_reserved_after),
                    existingConsumption
                });
                const cursor = cursorByMaterial.get(line.joMaterialId);
                if (cursor) {
                    cursor.actual = plans[plans.length - 1].materialActualAfter;
                    cursor.reserved = plans[plans.length - 1].materialReservedAfter;
                }
                continue;
            }

            const reservation = reservationById.get(line.reservationId);
            if (!reservation) {
                throw new ProductionSessionError(422, "MATERIAL_RESERVATION_MISMATCH", `WIP reservation ${line.reservationId} does not belong to Job Order ${input.joId}.`);
            }
            const reservationState = assertExactReservation(input, line, material, reservation, branchId);
            const cursor = cursorByMaterial.get(line.joMaterialId) || { actual: 0, reserved: 0 };
            const materialActualBefore = cursor.actual;
            const materialReservedBefore = cursor.reserved;
            const materialActualAfter = roundedQuantity(materialActualBefore + line.actualQty);
            const materialReservedAfter = roundedQuantity(Math.max(0, materialReservedBefore - line.actualQty));
            const baseQuantity = Math.max(0, finiteNumber(material.allocated_quantity ?? material.required_quantity ?? 0));
            const theoreticalQuantity = targetQuantity > EPSILON
                ? roundedQuantity((baseQuantity / targetQuantity) * input.goodQty)
                : 0;
            const plan: MaterialPlan = {
                line,
                material,
                reservation,
                sourceEventKey: sourceKey,
                theoreticalQuantity,
                reservationActualBefore: reservationState.actual,
                reservationActualAfter: roundedQuantity(reservationState.actual + line.actualQty),
                remainingWipBefore: reservationState.remaining,
                remainingWipAfter: roundedQuantity(reservationState.remaining - line.actualQty),
                materialActualBefore,
                materialActualAfter,
                materialReservedBefore,
                materialReservedAfter,
                existingConsumption: null
            };
            plans.push(plan);
            cursor.actual = materialActualAfter;
            cursor.reserved = materialReservedAfter;
        }

        const ledger = existingLedger || await directusRequest<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger`,
            `Create production session for Job Order ${input.joId}`,
            {
                method: "POST",
                body: JSON.stringify({
                    job_order_id: input.joId,
                    shift_name: input.shiftName,
                    yield_quantity: input.goodQty,
                    rejected_quantity: input.rejectedQty,
                    scrap_quantity: input.scrapQty,
                    lot_number: input.batchNo,
                    mm_lot_id: resolvedOutputLotId,
                    qa_status: "Pending",
                    logged_at: createdAt,
                    logged_by: actorId,
                    session_key: input.sessionKey,
                    source_event_key: sourceEventKey,
                    request_hash: hash,
                    commit_status: "PENDING",
                    job_order_updated: false,
                    jo_route_id: input.taskId,
                    work_center_id: workCenterId,
                    production_date: input.productionDate,
                    manufacturing_date: input.manufacturingDate,
                    expiry_date: input.expiryDate,
                    remarks: input.remarks
                })
            }
        );
        const ledgerId = numberId(ledger.ledger_id ?? ledger.id);
        if (!ledgerId) throw new DirectusSessionPersistenceError("Production session insert returned no ledger identifier.");

        if (!textValue(ledger.request_hash)) {
            await directusRequest(
                `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}`,
                `Complete production session ${ledgerId} metadata`,
                { method: "PATCH", body: JSON.stringify({ request_hash: hash, source_event_key: sourceEventKey }) }
            );
        }

        for (const plan of plans) {
            await ensureConsumptionAndGenealogy(
                input,
                plan,
                existingChildren.consumptionRows,
                existingChildren.genealogyRows,
                ledgerId,
                createdAt
            );
        }

        await updateJobOrderAggregates(input.joId, ledgerId, actorId, now);
        await directusRequest(
            `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}`,
            `Commit production session ${ledgerId}`,
            { method: "PATCH", body: JSON.stringify({ commit_status: "COMMITTED", job_order_updated: true, qa_status: "Pending" }) }
        );

        const finalChildren = await loadSessionChildren(ledgerId, input.joId);
        return NextResponse.json(responsePayload(
            input,
            { ...ledger, mm_lot_id: resolvedOutputLotId, logged_by: actorId, source_event_key: sourceEventKey },
            finalChildren.consumptionRows,
            finalChildren.genealogyRows,
            actorId,
            workCenterId,
            Boolean(existingLedger)
        ));
    } catch (error) {
        console.error("Error in production shift-run session:", error);
        if (error instanceof ProductionSessionError) {
            return NextResponse.json({ success: false, error: error.message, code: error.code, details: error.details }, { status: error.status });
        }
        if (error instanceof DirectusSessionPersistenceError) {
            return NextResponse.json({ success: false, error: error.message, code: "PRODUCTION_SESSION_PERSISTENCE_FAILED" }, { status: error.status });
        }
        return NextResponse.json({ success: false, error: (error as Error)?.message || "Failed to record production session.", code: "PRODUCTION_SESSION_FAILED" }, { status: 500 });
    }
}
