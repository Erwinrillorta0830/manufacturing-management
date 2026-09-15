import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
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

function numberValue(value: unknown): number {
    let rawValue = value;
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        rawValue = record.id ?? record.job_order_id ?? record.unit_id ?? value;
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
        case "complete-production": return JOB_ORDER_STATUS.PRODUCTION_COMPLETED;
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
            `/items/manufacturing_job_order_status_history?filter[job_order_id][_eq]=${jobOrderId}&filter[event_key][_eq]=${encodedKey}&fields=history_id,old_status,new_status,changed_at,event_key&limit=1`,
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
        throw new JobOrderWorkflowError(
            "Job Order cannot be initialized while required material reservations are short.",
            422,
            "MATERIAL_SHORTAGE",
            { incomplete }
        );
    }
}

async function assertFullStaging(jobOrderId: number): Promise<void> {
    const materials = await loadMaterials(jobOrderId);
    if (materials.length === 0) {
        throw new JobOrderWorkflowError("Job Order has no material requirements to stage.", 422, "MATERIAL_REQUIREMENTS_MISSING");
    }
    const reservations = await loadReservations(materials.map(materialId).filter((id) => id > 0));
    const stagedByMaterial = new Map<number, number>();
    for (const reservation of reservations) {
        if (!isLiveReservation(reservation)) continue;
        const id = reservationMaterialId(reservation);
        stagedByMaterial.set(id, (stagedByMaterial.get(id) || 0) + reservationQuantity(reservation, "staged_quantity"));
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

async function assertProductionCanComplete(jobOrder: DirectusRecord): Promise<void> {
    const jobOrderId = numberValue(jobOrder.job_order_id);
    const routes = await directusRows(
        `/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderId}&fields=jo_route_id,status&limit=-1`,
        "Load Job Order routing operations"
    );
    const incompleteRoutes = routes.filter((route) => {
        const status = text(route.status).toLowerCase();
        return status && !["completed", "done", "closed"].includes(status);
    });
    if (incompleteRoutes.length > 0) {
        throw new JobOrderWorkflowError(
            "Production cannot be completed while routing operations remain open.",
            422,
            "PRODUCTION_OPERATIONS_INCOMPLETE",
            { routeIds: incompleteRoutes.map((route) => numberValue(route.jo_route_id ?? route.id)) }
        );
    }
    const target = Number(jobOrder.target_quantity || 0);
    const produced = Math.max(
        Number(jobOrder.completed_quantity || 0),
        Number(jobOrder.actual_quantity_produced || 0)
    );
    if (target > 0 && produced <= QUANTITY_EPSILON) {
        throw new JobOrderWorkflowError(
            "Production cannot be completed until at least one output quantity is recorded.",
            422,
            "PRODUCTION_OUTPUT_REQUIRED"
        );
    }
}

async function assertClosurePrerequisites(jobOrderId: number): Promise<void> {
    const materials = await loadMaterials(jobOrderId);
    const reservations = await loadReservations(materials.map(materialId).filter((id) => id > 0));
    const unresolvedWip = reservations.filter((reservation) => {
        if (!isLiveReservation(reservation)) return false;
        const issued = reservationQuantity(reservation, "issued_to_wip_quantity");
        const consumed = reservationQuantity(reservation, "actual_used_quantity");
        const returned = reservationQuantity(reservation, "returned_quantity");
        const remaining = reservationQuantity(reservation, "remaining_wip_quantity");
        return issued - (consumed + returned + remaining) > QUANTITY_EPSILON || remaining > QUANTITY_EPSILON;
    });
    if (unresolvedWip.length > 0) {
        throw new JobOrderWorkflowError(
            "Job Order cannot be closed while raw-material WIP remains unresolved.",
            422,
            "MATERIAL_WIP_UNRESOLVED",
            { reservationIds: unresolvedWip.map((row) => numberValue(row.jo_materials_reservation_id ?? row.id)) }
        );
    }
}

async function writeTransition(
    jobOrder: DirectusRecord,
    command: JobOrderWorkflowCommand,
    previousStatus: CanonicalJobOrderStatus,
    nextStatus: CanonicalJobOrderStatus
): Promise<JobOrderWorkflowResult> {
    const jobOrderId = numberValue(jobOrder.job_order_id);
    const jobOrderNo = text(jobOrder.job_order_no) || `JO-${jobOrderId}`;
    const now = new Date().toISOString();
    const suppliedRemarks = command.remarks?.trim() || "";
    const transitionRemarks = command.action === "start-production" && suppliedRemarks
        ? suppliedRemarks
        : [
            `Workflow action: ${command.action}`,
            suppliedRemarks,
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
    } else if (command.action === "complete-production") {
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
                ...lifecycleFields,
                ...(command.action === "start-production" && command.workCenterId ? { primary_work_center_id: command.workCenterId } : {}),
                ...(command.action === "place-on-hold" || command.action === "resume-production" ? { remarks: transitionRemarks } : {})
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
            ...(command.action === "place-on-hold" || command.action === "resume-production" ? {
                remarks: jobOrder.remarks ?? null
            } : {})
        };
        const lifecycleFieldByAction: Partial<Record<JobOrderWorkflowAction, string>> = {
            initialize: "initialized",
            "complete-staging": "picked",
            "start-production": "production_started",
            "complete-production": "production_completed",
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

    if (["place-on-hold", "resume-production", "cancel"].includes(command.action) && !text(command.remarks)) {
        throw new JobOrderWorkflowError("A reason is required for this workflow action.", 400, "WORKFLOW_REASON_REQUIRED");
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
