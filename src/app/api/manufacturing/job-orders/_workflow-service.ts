import { createHash } from "node:crypto";
import { DIRECTUS_URL, headers, formatPhtDateTime } from "@/app/api/manufacturing/directus-api";
import {
    CANCELLABLE_JOB_ORDER_STATUSES,
    normalizeJobOrderStatus,
    JOB_ORDER_STATUS,
    type CanonicalJobOrderStatus
} from "@/modules/manufacturing-management/job-order-status";
import {
    cancelJobOrderAndReturnMaterials,
    fetchJobOrder
} from "../production/_material-return";
import { buildQAYieldAssessments } from "../production/_qa-accepted-output";
import {
    JOB_ORDER_WORKFLOW_ACTIONS,
    type JobOrderWorkflowAction
} from "@/modules/manufacturing-management/job-order-workflow";

const QUANTITY_EPSILON = 0.000001;

export class JobOrderWorkflowError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 401 | 404 | 409 | 422 | 502 = 409,
        readonly code = "JOB_ORDER_WORKFLOW_ERROR",
        readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "JobOrderWorkflowError";
    }
}

export interface JobOrderWorkflowCommand {
    action: JobOrderWorkflowAction;
    actorUserId: number | null;
    idempotencyKey: string;
    remarks?: string;
    resolutionRemarks?: string;
    workCenterId?: number | null;
    overrideReason?: string;
    force?: boolean;
}

export interface JobOrderWorkflowResult {
    jobOrderId: number;
    jobOrderNo: string;
    jobOrder: DirectusRecord;
    action: JobOrderWorkflowAction;
    previousStatus: CanonicalJobOrderStatus;
    status: CanonicalJobOrderStatus;
    newStatus: CanonicalJobOrderStatus;
    changed: boolean;
    idempotent: boolean;
    historyId?: number | null;
}

type DirectusRecord = Record<string, unknown>;

export interface JobOrderClosureBlocker {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export interface JobOrderClosureReadiness {
    ready: boolean;
    blockers: JobOrderClosureBlocker[];
}

function numberValue(value: unknown): number {
    let rawValue = value;
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        rawValue = record.id
            ?? record.job_order_id
            ?? record.unit_id
            ?? record.product_id
            ?? record.branch_id
            ?? record.lot_id
            ?? record.mm_lot_id
            ?? record.inventory_lot_id
            ?? value;
    }
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
}

function positiveInteger(value: unknown): number | null {
    const parsed = numberValue(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function text(value: unknown): string {
    return String(value ?? "").trim();
}

function workflowRequestHash(command: JobOrderWorkflowCommand): string {
    return createHash("sha256").update(JSON.stringify({
        action: command.action,
        remarks: text(command.remarks),
        resolutionRemarks: text(command.resolutionRemarks),
        workCenterId: command.workCenterId ?? null,
        overrideReason: text(command.overrideReason),
        force: command.force === true
    })).digest("hex");
}

async function directusRequest<T>(
    path: string,
    operation: string,
    init: RequestInit = {}
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${path}`, {
            ...init,
            headers: { ...headers, ...(init.headers || {}) },
            cache: "no-store"
        });
    } catch (error) {
        throw new JobOrderWorkflowError(
            `${operation} could not reach Manufacturing Directus.`,
            502,
            "DIRECTUS_UNAVAILABLE",
            { cause: error instanceof Error ? error.message : String(error) }
        );
    }

    const responseText = await response.text();
    let payload: unknown = null;
    try {
        payload = responseText ? JSON.parse(responseText) : null;
    } catch {
        payload = null;
    }
    if (!response.ok) {
        throw new JobOrderWorkflowError(
            `${operation} failed in Manufacturing Directus (${response.status}).`,
            502,
            "DIRECTUS_REQUEST_FAILED",
            { upstreamStatus: response.status, response: responseText.slice(0, 1000) }
        );
    }
    if (payload && typeof payload === "object" && "data" in payload) {
        return (payload as { data?: unknown }).data as T;
    }
    return payload as T;
}

async function directusRows(path: string, operation: string): Promise<DirectusRecord[]> {
    const data = await directusRequest<unknown>(path, operation);
    if (!Array.isArray(data)) {
        throw new JobOrderWorkflowError(`${operation} returned an invalid collection response.`, 502, "DIRECTUS_INVALID_RESPONSE");
    }
    return data;
}

function jobOrderIdFromPath(value: string | number): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new JobOrderWorkflowError("A valid Job Order ID is required.", 400, "JOB_ORDER_ID_REQUIRED");
    }
    return id;
}

function allowedStatuses(action: JobOrderWorkflowAction): CanonicalJobOrderStatus[] {
    switch (action) {
        case "initialize": return [JOB_ORDER_STATUS.DRAFT];
        case "complete-staging": return [JOB_ORDER_STATUS.FOR_PICKING];
        case "start-production": return [JOB_ORDER_STATUS.PICKED];
        case "place-on-hold": return [JOB_ORDER_STATUS.IN_PRODUCTION];
        case "resume-production": return [JOB_ORDER_STATUS.ON_HOLD];
        case "complete-production": return [JOB_ORDER_STATUS.IN_PRODUCTION];
        case "terminate-production": return [JOB_ORDER_STATUS.IN_PRODUCTION, JOB_ORDER_STATUS.ON_HOLD];
        case "begin-qa-reconciliation": return [JOB_ORDER_STATUS.PRODUCTION_COMPLETED];
        case "close": return [JOB_ORDER_STATUS.FOR_QA_RECONCILIATION];
        case "cancel": return CANCELLABLE_JOB_ORDER_STATUSES;
    }
}

function actionTarget(action: JobOrderWorkflowAction): CanonicalJobOrderStatus {
    switch (action) {
        case "initialize": return JOB_ORDER_STATUS.FOR_PICKING;
        case "complete-staging": return JOB_ORDER_STATUS.PICKED;
        case "start-production": return JOB_ORDER_STATUS.IN_PRODUCTION;
        case "place-on-hold": return JOB_ORDER_STATUS.ON_HOLD;
        case "resume-production": return JOB_ORDER_STATUS.IN_PRODUCTION;
        case "complete-production": return JOB_ORDER_STATUS.FOR_QA_RECONCILIATION;
        case "terminate-production": return JOB_ORDER_STATUS.PRODUCTION_COMPLETED;
        case "begin-qa-reconciliation": return JOB_ORDER_STATUS.FOR_QA_RECONCILIATION;
        case "close": return JOB_ORDER_STATUS.CLOSED;
        case "cancel": return JOB_ORDER_STATUS.CANCELLED;
    }
}

async function loadJobOrder(id: number): Promise<DirectusRecord> {
    const rows = await directusRows(
        `/items/manufacturing_job_orders?filter[job_order_id][_eq]=${id}&fields=*&limit=1`,
        "Load Job Order"
    );
    const row = rows[0];
    if (!row) throw new JobOrderWorkflowError(`Job Order ${id} was not found.`, 404, "JOB_ORDER_NOT_FOUND");
    return row;
}

async function findIdempotentHistory(jobOrderId: number, idempotencyKey: string): Promise<DirectusRecord | null> {
    const encodedKey = encodeURIComponent(idempotencyKey);
    try {
        const rows = await directusRows(
            `/items/manufacturing_job_order_status_history?filter[job_order_id][_eq]=${jobOrderId}&filter[event_key][_eq]=${encodedKey}&fields=history_id,old_status,new_status,changed_at,event_key,workflow_action,workflow_request_hash&limit=1`,
            "Check Job Order workflow idempotency"
        );
        return rows[0] || null;
    } catch (error) {
        // The schema migration adds event_key. A missing field must not make a
        // normal transition look successful, so surface all other failures.
        if (error instanceof JobOrderWorkflowError && error.details?.upstreamStatus === 400
            && /event_key|field|invalid/i.test(String(error.details.response || ""))) {
            throw new JobOrderWorkflowError(
                "Job Order workflow idempotency is not configured in Manufacturing Directus.",
                502,
                "WORKFLOW_SCHEMA_REQUIRED"
            );
        }
        throw error;
    }
}

async function loadMaterials(jobOrderId: number): Promise<DirectusRecord[]> {
    return directusRows(
        `/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${jobOrderId}&fields=*&limit=-1`,
        "Load Job Order material requirements"
    );
}

async function loadReservations(materialIds: number[]): Promise<DirectusRecord[]> {
    if (materialIds.length === 0) return [];
    return directusRows(
        `/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_in]=${materialIds.join(",")}&fields=*&limit=-1`,
        "Load Job Order material reservations"
    );
}

function materialId(row: DirectusRecord): number {
    return numberValue(row.jo_material_id ?? row.id);
}

function materialProductId(row: DirectusRecord): number {
    return numberValue(row.product_id);
}

function materialQuantity(row: DirectusRecord): number {
    const value = Number(row.allocated_quantity ?? row.required_quantity ?? row.quantity_required ?? 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function reservationMaterialId(row: DirectusRecord): number {
    return numberValue(row.jo_material_id ?? row.jo_materials_id);
}

function reservationQuantity(row: DirectusRecord, key: string): number {
    const value = Number(row[key] ?? 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function isLiveReservation(row: DirectusRecord): boolean {
    const status = text(row.reservation_status).toUpperCase();
    return !status || ["SOFT", "HARD", "PARTIAL", "WIP"].includes(status);
}

async function assertInitializationPrerequisites(jobOrder: DirectusRecord): Promise<void> {
    const requiredFields: Array<[string, unknown]> = [
        ["finished product", jobOrder.product_id],
        ["product version/formula", jobOrder.version_id],
        ["target quantity", jobOrder.target_quantity],
        ["branch", jobOrder.branch_id],
        ["planned production date", jobOrder.start_date],
        ["target UOM", jobOrder.uom_id]
    ];
    const missing = requiredFields.filter(([label, value]) => {
        if (label === "planned production date") return !text(value);
        return numberValue(value) <= 0;
    }).map(([label]) => label);
    if (missing.length > 0) {
        throw new JobOrderWorkflowError(
            `Job Order cannot be initialized. Missing: ${missing.join(", ")}.`,
            422,
            "INITIALIZATION_PREREQUISITES_MISSING",
            { missing }
        );
    }

    const priority = Number(jobOrder.priority);
    if (!Number.isFinite(priority) || priority < 0) {
        throw new JobOrderWorkflowError(
            "Job Order cannot be initialized without a valid priority.",
            422,
            "INITIALIZATION_PRIORITY_REQUIRED"
        );
    }

    const materials = await loadMaterials(numberValue(jobOrder.job_order_id));
    if (materials.length === 0) {
        throw new JobOrderWorkflowError(
            "Job Order cannot be initialized until its BOM material requirements are expanded.",
            422,
            "MATERIAL_REQUIREMENTS_MISSING"
        );
    }
}

async function assertMaterialReservations(jobOrderId: number): Promise<void> {
    const materials = await loadMaterials(jobOrderId);
    const reservations = await loadReservations(materials.map(materialId).filter((id) => id > 0));
    const reservedByMaterial = new Map<number, number>();
    for (const reservation of reservations) {
        if (!isLiveReservation(reservation)) continue;
        const id = reservationMaterialId(reservation);
        reservedByMaterial.set(id, (reservedByMaterial.get(id) || 0) + reservationQuantity(reservation, "reserved_quantity"));
    }
    const incomplete = materials.map((material) => ({
        materialId: materialId(material),
        productId: materialProductId(material),
        required: materialQuantity(material),
        reserved: reservedByMaterial.get(materialId(material)) || 0
    })).filter((item) => item.required > 0 && item.reserved + QUANTITY_EPSILON < item.required);
    if (incomplete.length > 0) {
        console.warn(`[JobOrderWorkflow] Warning: Job Order ${jobOrderId} initialized with material shortfalls:`, incomplete);
    }
}

async function assertFullStaging(jobOrderId: number): Promise<void> {
    const jobOrder = await loadJobOrder(jobOrderId);
    const branchId = numberValue(jobOrder.branch_id);
    if (!branchId) {
        throw new JobOrderWorkflowError(
            "The Job Order cannot start production without a branch assigned.",
            422,
            "JOB_ORDER_BRANCH_REQUIRED"
        );
    }

    const materials = await loadMaterials(jobOrderId);
    if (materials.length === 0) {
        throw new JobOrderWorkflowError("Job Order has no material requirements to stage.", 422, "MATERIAL_REQUIREMENTS_MISSING");
    }
    const reservations = await loadReservations(materials.map(materialId).filter((id) => id > 0));
    const materialById = new Map(materials.map((material) => [materialId(material), material]));
    const stagedByMaterial = new Map<number, number>();
    const invalidReservations: Array<Record<string, unknown>> = [];
    for (const reservation of reservations) {
        if (!isLiveReservation(reservation)) continue;
        const id = reservationMaterialId(reservation);
        const material = materialById.get(id);
        stagedByMaterial.set(id, (stagedByMaterial.get(id) || 0) + reservationQuantity(reservation, "staged_quantity"));
        if (reservationQuantity(reservation, "staged_quantity") <= QUANTITY_EPSILON) continue;

        const expectedProductId = material ? materialProductId(material) : 0;
        const expectedUomId = material ? numberValue(material.uom_id) : 0;
        const reservationProductId = numberValue(reservation.product_id);
        const reservationBranchId = numberValue(reservation.branch_id);
        const reservationUomId = numberValue(reservation.uom_id);
        const reservationMmLotId = numberValue(reservation.mm_lot_id);
        const reservationInventoryLotId = numberValue(reservation.inventory_lot_id);
        const reservationBatchNo = text(reservation.batch_no);
        const identityErrors = [
            !material ? "material" : "",
            !expectedProductId || reservationProductId !== expectedProductId ? "product" : "",
            reservationBranchId !== branchId ? "branch" : "",
            !expectedUomId || !reservationUomId || reservationUomId !== expectedUomId ? "uom" : "",
            !reservationMmLotId ? "mm_lot" : "",
            !reservationInventoryLotId ? "inventory_lot" : "",
            !reservationBatchNo ? "batch" : ""
        ].filter(Boolean);
        if (identityErrors.length > 0) {
            invalidReservations.push({
                reservationId: numberValue(reservation.jo_materials_reservation_id ?? reservation.id),
                joMaterialId: id,
                errors: identityErrors,
                stagedQuantity: reservationQuantity(reservation, "staged_quantity")
            });
        }
    }
    if (invalidReservations.length > 0) {
        throw new JobOrderWorkflowError(
            "The Job Order has staged material reservations with incomplete or mismatched branch, product, UOM, lot, inventory-lot, or batch identity.",
            422,
            "MATERIAL_STAGING_IDENTITY_MISMATCH",
            { reservations: invalidReservations }
        );
    }
    const incomplete = materials.map((material) => {
        const required = materialQuantity(material);
        const staged = stagedByMaterial.get(materialId(material)) || 0;
        return { materialId: materialId(material), productId: materialProductId(material), required, staged };
    }).filter((item) => item.required > 0 && item.staged + QUANTITY_EPSILON < item.required);
    if (incomplete.length > 0) {
        throw new JobOrderWorkflowError(
            "The Job Order is only partially staged. Complete every material requirement before marking it Picked.",
            422,
            "MATERIAL_STAGING_INCOMPLETE",
            { incomplete }
        );
    }
}

async function markReservationsWip(jobOrderId: number, actorUserId: number | null, now: string): Promise<void> {
    const materials = await loadMaterials(jobOrderId);
    const reservations = await loadReservations(materials.map(materialId).filter((id) => id > 0));
    for (const reservation of reservations) {
        if (!isLiveReservation(reservation)) continue;
        const id = numberValue(reservation.jo_materials_reservation_id ?? reservation.id);
        if (!id) continue;
        const staged = reservationQuantity(reservation, "staged_quantity");
        const consumed = reservationQuantity(reservation, "actual_used_quantity");
        const returned = reservationQuantity(reservation, "returned_quantity");
        const remaining = Math.max(0, staged - consumed - returned);
        if (staged <= QUANTITY_EPSILON) continue;
        const payload: Record<string, unknown> = {
            reservation_status: "WIP",
            issued_to_wip_quantity: staged,
            remaining_wip_quantity: remaining,
            wip_started_at: now,
            wip_started_by: actorUserId
        };
        await directusRequest(
            `/items/manufacturing_job_order_materials_reservations/${id}`,
            `Mark material reservation ${id} as WIP`,
            { method: "PATCH", body: JSON.stringify(payload) }
        );
    }
}

function isCommitted(value: unknown): boolean {
    const status = text(value).toUpperCase();
    return !status || status === "COMMITTED";
}

function isApplied(value: unknown): boolean {
    return value === undefined || value === null
        || value === true
        || value === 1
        || value === "1"
        || text(value).toLowerCase() === "true";
}

async function loadCommittedProductionRecords(jobOrderId: number): Promise<DirectusRecord[]> {
    const ledgers = await directusRows(
        `/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${jobOrderId}&fields=ledger_id,yield_quantity,rejected_quantity,scrap_quantity,commit_status,session_key,source_event_key&limit=-1`,
        `Load production sessions for Job Order ${jobOrderId}`
    );
    const pendingLedgers = ledgers.filter((ledger) => !isCommitted(ledger.commit_status));
    if (pendingLedgers.length > 0) {
        throw new JobOrderWorkflowError(
            "Production cannot be completed while a production session is still pending commitment.",
            409,
            "PRODUCTION_SESSION_PENDING",
            { ledgerIds: pendingLedgers.map((row) => numberValue(row.ledger_id ?? row.id)) }
        );
    }
    if (ledgers.length === 0) return [];

    const ledgerIds = ledgers.map((row) => numberValue(row.ledger_id ?? row.id)).filter((id) => id > 0);
    const consumptions = ledgerIds.length > 0
        ? await directusRows(
            `/items/manufacturing_job_order_yield_ledger_bom_consumage?filter[ledger_id][_in]=${ledgerIds.join(",")}&fields=consumage_id,ledger_id,source_event_key,reservation_applied,material_aggregate_applied&limit=-1`,
            `Load production consumption records for Job Order ${jobOrderId}`
        )
        : [];
    const missingConsumption = ledgers.filter((ledger) => {
        const ledgerId = numberValue(ledger.ledger_id ?? ledger.id);
        const rows = consumptions.filter((row) => numberValue(row.ledger_id) === ledgerId);
        return rows.length === 0 || rows.some((row) => !isApplied(row.reservation_applied) || !isApplied(row.material_aggregate_applied));
    });
    if (missingConsumption.length > 0) {
        throw new JobOrderWorkflowError(
            "Production cannot be completed until every committed session has committed exact material consumption.",
            422,
            "PRODUCTION_CONSUMPTION_INCOMPLETE",
            { ledgerIds: missingConsumption.map((row) => numberValue(row.ledger_id ?? row.id)) }
        );
    }
    return ledgers;
}

async function assertProductionCanComplete(jobOrder: DirectusRecord): Promise<void> {
    const jobOrderId = numberValue(jobOrder.job_order_id);
    const routes = await directusRows(
        `/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderId}&fields=jo_route_id,status&limit=-1`,
        "Load Job Order routing operations"
    );
    if (routes.length === 0) {
        throw new JobOrderWorkflowError(
            "Production cannot be completed until routing operations are configured.",
            422,
            "PRODUCTION_OPERATIONS_MISSING"
        );
    }
    const incompleteRoutes = routes.filter((route) => {
        const status = text(route.status).toLowerCase();
        return !["completed", "done", "closed"].includes(status);
    });
    if (incompleteRoutes.length > 0) {
        throw new JobOrderWorkflowError(
            "Production cannot be completed while routing operations remain open.",
            422,
            "PRODUCTION_OPERATIONS_INCOMPLETE",
            { routeIds: incompleteRoutes.map((route) => numberValue(route.jo_route_id ?? route.id)) }
        );
    }

    const ledgers = await loadCommittedProductionRecords(jobOrderId);
    const target = Number(jobOrder.target_quantity || 0);
    if (!Number.isFinite(target) || target <= QUANTITY_EPSILON) {
        throw new JobOrderWorkflowError(
            "Production cannot be completed without a positive Job Order target quantity.",
            422,
            "PRODUCTION_TARGET_REQUIRED"
        );
    }
    const completionOutput = ledgers.reduce((sum, ledger) => sum
        + Math.max(0, Number(ledger.yield_quantity || 0))
        + Math.max(0, Number(ledger.rejected_quantity || 0)), 0);
    if (completionOutput <= QUANTITY_EPSILON) {
        throw new JobOrderWorkflowError(
            "Production cannot be completed until output quantities are recorded.",
            422,
            "PRODUCTION_OUTPUT_REQUIRED"
        );
    }
    if (completionOutput + QUANTITY_EPSILON < target) {
        throw new JobOrderWorkflowError(
            "Production cannot be completed until good and rejected output reaches the Job Order target.",
            422,
            "PRODUCTION_OUTPUT_INCOMPLETE",
            {
                targetQuantity: target,
                completionQuantity: completionOutput,
                shortfall: Math.max(0, target - completionOutput)
            }
        );
    }
}

export async function getJobOrderClosureReadiness(jobOrderId: number): Promise<JobOrderClosureReadiness> {
    const [yields, inspections, routes, dispositions] = await Promise.all([
        directusRows(
            `/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${jobOrderId}&fields=ledger_id,job_order_id,yield_quantity,rejected_quantity,scrap_quantity&limit=-1`,
            `Load daily yields for Job Order ${jobOrderId}`
        ),
        directusRows(
            `/items/manufacturing_daily_qa_inspections?filter[job_order_id][_eq]=${jobOrderId}&fields=*&limit=-1`,
            `Load daily QA outcomes for Job Order ${jobOrderId}`
        ),
        directusRows(
            `/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderId}&fields=jo_route_id,job_order_id&limit=-1`,
            `Load QA routes for Job Order ${jobOrderId}`
        ),
        directusRows(
            `/items/manufacturing_qa_dispositions?filter[job_order_id][_eq]=${jobOrderId}&fields=id,disposition_status&limit=-1`,
            `Load QA dispositions for Job Order ${jobOrderId}`
        )
    ]);

    const blockers: JobOrderClosureBlocker[] = [];
    const assessments = buildQAYieldAssessments(yields, inspections, routes);
    const assessmentsByLedger = new Map(assessments.map((assessment) => [assessment.ledgerId, assessment] as const));
    const yieldLedgerIds = yields
        .map((yieldRow) => numberValue(yieldRow.ledger_id ?? yieldRow.id))
        .filter((id) => id > 0);
    const incompleteAssessments = yields
        .map((yieldRow) => {
            const ledgerId = numberValue(yieldRow.ledger_id ?? yieldRow.id);
            const assessment = assessmentsByLedger.get(ledgerId);
            return {
                ledgerId,
                status: assessment?.qaStatus || "Pending",
                isComplete: assessment?.outcome.isComplete === true
            };
        })
        .filter((assessment) => !assessment.ledgerId || !assessment.isComplete || assessment.status !== "Passed");

    if (yieldLedgerIds.length === 0) {
        blockers.push({
            code: "QA_YIELD_REQUIRED",
            message: "Every daily yield must have a completed QA outcome before the Job Order can be closed.",
            details: { ledgerIds: [] }
        });
    } else if (incompleteAssessments.length > 0) {
        blockers.push({
            code: "QA_OUTCOME_INCOMPLETE",
            message: "Every daily yield must have a completed Passed QA outcome before the Job Order can be closed.",
            details: {
                ledgerIds: incompleteAssessments.map((assessment) => assessment.ledgerId).filter(Boolean),
                statuses: incompleteAssessments.map((assessment) => ({
                    ledgerId: assessment.ledgerId || null,
                    status: assessment.status
                }))
            }
        });
    }

    const unresolvedDispositions = dispositions.filter((disposition) =>
        text(disposition.disposition_status).toLowerCase() !== "resolved"
    );
    if (unresolvedDispositions.length > 0) {
        blockers.push({
            code: "QA_DISPOSITIONS_UNRESOLVED",
            message: "Resolve all QA dispositions before closing the Job Order.",
            details: {
                dispositionIds: unresolvedDispositions.map((disposition) => disposition.id),
                statuses: unresolvedDispositions.map((disposition) => text(disposition.disposition_status) || "Unknown")
            }
        });
    }

    const materials = await loadMaterials(jobOrderId);
    const reservations = await loadReservations(materials.map(materialId).filter((id) => id > 0));
    const unresolvedWip = reservations.filter((reservation) => {
        if (!isLiveReservation(reservation)) return false;
        const issued = reservationQuantity(reservation, "issued_to_wip_quantity");
        const consumed = reservationQuantity(reservation, "actual_used_quantity");
        const returned = reservationQuantity(reservation, "returned_quantity");
        const remaining = reservationQuantity(reservation, "remaining_wip_quantity");
        return Math.abs(issued - (consumed + returned + remaining)) > QUANTITY_EPSILON
            || remaining > QUANTITY_EPSILON;
    });
    if (unresolvedWip.length > 0) {
        blockers.push({
            code: "MATERIAL_WIP_UNRESOLVED",
            message: "Job Order cannot be closed while raw-material WIP remains unresolved.",
            details: {
                reservationIds: unresolvedWip.map((row) => numberValue(row.jo_materials_reservation_id ?? row.id))
            }
        });
    }

    return { ready: blockers.length === 0, blockers };
}

async function assertClosurePrerequisites(jobOrderId: number): Promise<void> {
    const readiness = await getJobOrderClosureReadiness(jobOrderId);
    if (readiness.ready) return;

    const firstBlocker = readiness.blockers[0];
    throw new JobOrderWorkflowError(
        firstBlocker.message,
        422,
        firstBlocker.code,
        { blockers: readiness.blockers }
    );
}

async function writeTransition(
    jobOrder: DirectusRecord,
    command: JobOrderWorkflowCommand,
    previousStatus: CanonicalJobOrderStatus,
    nextStatus: CanonicalJobOrderStatus
): Promise<JobOrderWorkflowResult> {
    const jobOrderId = numberValue(jobOrder.job_order_id);
    const jobOrderNo = text(jobOrder.job_order_no) || `JO-${jobOrderId}`;
    const now = formatPhtDateTime();
    const suppliedRemarks = command.remarks?.trim() || "";
    const transitionRemarks = command.action === "start-production" && suppliedRemarks
        ? suppliedRemarks
        : [
            `Workflow action: ${command.action}`,
            suppliedRemarks,
            command.resolutionRemarks?.trim() ? `Resolution: ${command.resolutionRemarks.trim()}` : "",
            command.overrideReason?.trim() ? `Override reason: ${command.overrideReason.trim()}` : ""
        ].filter(Boolean).join(" | ");

    const lifecycleFields: Record<string, unknown> = {};
    if (command.action === "initialize") {
        lifecycleFields.initialized_at = now;
        lifecycleFields.initialized_by = command.actorUserId;
    } else if (command.action === "complete-staging") {
        lifecycleFields.picked_at = now;
        lifecycleFields.picked_by = command.actorUserId;
    } else if (command.action === "start-production") {
        lifecycleFields.production_started_at = now;
        lifecycleFields.production_started_by = command.actorUserId;
    } else if (command.action === "complete-production" || command.action === "terminate-production") {
        lifecycleFields.production_completed_at = now;
        lifecycleFields.production_completed_by = command.actorUserId;
    } else if (command.action === "begin-qa-reconciliation") {
        lifecycleFields.qa_started_at = now;
        lifecycleFields.qa_started_by = command.actorUserId;
    } else if (command.action === "close") {
        lifecycleFields.closed_at = now;
        lifecycleFields.closed_by = command.actorUserId;
    }

    await directusRequest(
        `/items/manufacturing_job_orders/${jobOrderId}`,
        `Update Job Order ${jobOrderNo} status`,
        {
            method: "PATCH",
            body: JSON.stringify({
                status: nextStatus,
                modified_at: jobOrder.modified_at ?? null,
                ...lifecycleFields,
                ...(command.action === "start-production" && command.workCenterId ? { primary_work_center_id: command.workCenterId } : {}),
                ...(command.action === "place-on-hold" || command.action === "resume-production" || command.action === "terminate-production" ? { remarks: transitionRemarks } : {})
            })
        }
    );

    try {
        const history = await directusRequest<DirectusRecord>(
            "/items/manufacturing_job_order_status_history",
            "Record Job Order workflow history",
            {
                method: "POST",
                body: JSON.stringify({
                    job_order_id: jobOrderId,
                    old_status: previousStatus,
                    new_status: nextStatus,
                    event_key: command.idempotencyKey,
                    workflow_action: command.action,
                    workflow_request_hash: workflowRequestHash(command),
                    changed_by: command.actorUserId,
                    changed_at: now,
                    remarks: transitionRemarks || `Workflow action: ${command.action}`,
                    ...(command.workCenterId ? { work_center_id: command.workCenterId } : {})
                })
            }
        );
        return {
            jobOrderId,
            jobOrderNo,
            jobOrder: { ...jobOrder, status: nextStatus },
            action: command.action,
            previousStatus,
            status: nextStatus,
            newStatus: nextStatus,
            changed: true,
            idempotent: false,
            historyId: positiveInteger(history?.history_id ?? history?.id)
        };
    } catch (error) {
        // Keep status and history atomic from the application's perspective.
        // Directus has no cross-collection transaction here, so compensate the
        // header fields if the audit record cannot be persisted.
        const rollbackFields: Record<string, unknown> = {
            status: previousStatus,
            ...(command.action === "start-production" ? {
                primary_work_center_id: jobOrder.primary_work_center_id ?? null
            } : {}),
            ...(command.action === "place-on-hold" || command.action === "resume-production" || command.action === "terminate-production" ? {
                remarks: jobOrder.remarks ?? null
            } : {})
        };
        const lifecycleFieldByAction: Partial<Record<JobOrderWorkflowAction, string>> = {
            initialize: "initialized",
            "complete-staging": "picked",
            "start-production": "production_started",
            "complete-production": "production_completed",
            "terminate-production": "production_completed",
            "begin-qa-reconciliation": "qa_started",
            close: "closed"
        };
        const lifecyclePrefix = lifecycleFieldByAction[command.action];
        if (lifecyclePrefix) {
            rollbackFields[`${lifecyclePrefix}_at`] = jobOrder[`${lifecyclePrefix}_at`] ?? null;
            rollbackFields[`${lifecyclePrefix}_by`] = jobOrder[`${lifecyclePrefix}_by`] ?? null;
        }
        await directusRequest(
            `/items/manufacturing_job_orders/${jobOrderId}`,
            `Rollback Job Order ${jobOrderNo} status`,
            { method: "PATCH", body: JSON.stringify(rollbackFields) }
        ).catch((rollbackError) => {
            console.error("Job Order workflow status rollback failed:", rollbackError);
        });
        throw error;
    }
}

export async function executeJobOrderWorkflow(
    jobOrderIdValue: string | number,
    command: JobOrderWorkflowCommand
): Promise<JobOrderWorkflowResult> {
    if (!JOB_ORDER_WORKFLOW_ACTIONS.includes(command.action)) {
        throw new JobOrderWorkflowError("Unsupported Job Order workflow action.", 400, "WORKFLOW_ACTION_INVALID");
    }
    if (!Number.isSafeInteger(command.actorUserId) || Number(command.actorUserId) <= 0) {
        throw new JobOrderWorkflowError(
            "An authenticated user is required for Job Order workflow actions.",
            401,
            "AUTHENTICATION_REQUIRED"
        );
    }
    const idempotencyKey = text(command.idempotencyKey);
    if (!idempotencyKey || idempotencyKey.length > 128) {
        throw new JobOrderWorkflowError("A 1–128 character idempotency key is required.", 400, "WORKFLOW_IDEMPOTENCY_KEY_REQUIRED");
    }
    const jobOrderId = jobOrderIdFromPath(jobOrderIdValue);
    const existing = await findIdempotentHistory(jobOrderId, idempotencyKey);
    const jobOrder = await loadJobOrder(jobOrderId);
    const previousStatus = normalizeJobOrderStatus(jobOrder.status);
    if (!previousStatus) {
        throw new JobOrderWorkflowError("The Job Order has an unknown status and cannot transition safely.", 409, "JOB_ORDER_STATUS_UNKNOWN");
    }

    if (existing) {
        const existingAction = text(existing.workflow_action);
        if (existingAction && existingAction !== command.action) {
            throw new JobOrderWorkflowError(
                "The idempotency key was already used for a different Job Order workflow action.",
                409,
                "WORKFLOW_IDEMPOTENCY_CONFLICT",
                { idempotencyKey, existingAction, requestedAction: command.action }
            );
        }
        const existingRequestHash = text(existing.workflow_request_hash);
        if (existingRequestHash && existingRequestHash !== workflowRequestHash(command)) {
            throw new JobOrderWorkflowError(
                "The idempotency key was already used with a different workflow payload.",
                409,
                "WORKFLOW_IDEMPOTENCY_CONFLICT",
                { idempotencyKey }
            );
        }
        const existingStatus = normalizeJobOrderStatus(existing.new_status) || previousStatus;
        return {
            jobOrderId,
            jobOrderNo: text(jobOrder.job_order_no) || `JO-${jobOrderId}`,
            jobOrder: { ...jobOrder, status: existingStatus },
            action: command.action,
            previousStatus: normalizeJobOrderStatus(existing.old_status) || previousStatus,
            status: existingStatus,
            newStatus: existingStatus,
            changed: false,
            idempotent: true,
            historyId: positiveInteger(existing.history_id ?? existing.id)
        };
    }

    const allowed = allowedStatuses(command.action);
    if (!allowed.includes(previousStatus)) {
        throw new JobOrderWorkflowError(
            `Job Order ${text(jobOrder.job_order_no) || jobOrderId} cannot perform ${command.action} from status "${previousStatus}".`,
            409,
            "JOB_ORDER_INVALID_TRANSITION",
            { currentStatus: previousStatus, allowedStatuses: allowed }
        );
    }

    if (["place-on-hold", "cancel", "terminate-production"].includes(command.action) && !text(command.remarks)) {
        throw new JobOrderWorkflowError("A reason is required for this workflow action.", 400, "WORKFLOW_REASON_REQUIRED");
    }
    if (command.action === "resume-production" && !text(command.resolutionRemarks)) {
        throw new JobOrderWorkflowError("A resolution remark is required before resuming production.", 400, "WORKFLOW_RESOLUTION_REQUIRED");
    }

    if (command.force && !text(command.overrideReason)) {
        throw new JobOrderWorkflowError("An override reason is required for a forced workflow transition.", 400, "WORKFLOW_OVERRIDE_REASON_REQUIRED");
    }
    if (command.action === "initialize") {
        await assertInitializationPrerequisites(jobOrder);
        if (!command.force) await assertMaterialReservations(jobOrderId);
    }
    if (command.action === "complete-staging") await assertFullStaging(jobOrderId);
    if (command.action === "start-production") {
        const workCenterId = positiveInteger(command.workCenterId);
        if (!workCenterId) throw new JobOrderWorkflowError("A valid work center is required to start production.", 400, "WORK_CENTER_REQUIRED");
        await assertFullStaging(jobOrderId);
    }
    if (command.action === "complete-production") await assertProductionCanComplete(jobOrder);
    if (command.action === "terminate-production") await loadCommittedProductionRecords(jobOrderId);
    if (command.action === "close") await assertClosurePrerequisites(jobOrderId);

    if (command.action === "cancel") {
        const cancellation = await cancelJobOrderAndReturnMaterials({
            joId: jobOrderId,
            reason: text(command.remarks),
            actorUserId: command.actorUserId,
            eventKey: idempotencyKey
        });
        return {
            jobOrderId,
            jobOrderNo: cancellation.response.jobOrderNo,
            jobOrder: { ...jobOrder, status: JOB_ORDER_STATUS.CANCELLED },
            action: command.action,
            previousStatus,
            status: JOB_ORDER_STATUS.CANCELLED,
            newStatus: JOB_ORDER_STATUS.CANCELLED,
            changed: true,
            idempotent: false,
            historyId: null
        };
    }

    if (command.action === "start-production") {
        await markReservationsWip(jobOrderId, command.actorUserId, new Date().toISOString());
    }

    return writeTransition(jobOrder, command, previousStatus, actionTarget(command.action));
}

export async function loadWorkflowJobOrder(joId: string | number) {
    return fetchJobOrder(joId);
}
