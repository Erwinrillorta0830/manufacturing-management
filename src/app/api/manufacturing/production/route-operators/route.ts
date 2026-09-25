/* eslint-disable */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeJobOrderModuleAccess, JOB_ORDER_MODULE_PATHS } from "@/app/api/manufacturing/job-orders/_module-access";
import { isCancelledJobOrderStatus, isJobOrderStatus, JOB_ORDER_STATUS, normalizeJobOrderStatus } from "@/modules/manufacturing-management/job-order-status";
import { formatPhtDateTime, parsePhtDateTime } from "../../directus-api";
import { getSessionUserId } from "../../lot-transfers/_session";
import {
    findOperatorRosterAudit,
    JobOrderOperatorAssignmentError,
    normalizeOperatorAssignments,
    recordOperatorRosterAudit,
    removeJobOrderOperatorAssignment,
    swapJobOrderOperatorAssignment,
    updateJobOrderOperatorAssignment
} from "../../job-orders/_operator-assignment-service";

// Directus configuration
const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

const COLLECTION = "manufacturing_job_order_route_operators";
const ROUTE_OPERATOR_FIELDS = "jo_route_operator_id,jo_route_id,operator_id,logged_hours,hourly_rate,logged_at,started_at,stopped_at,is_active";
const OPERATOR_ROSTER_ACTIONS = new Set(["remove-operator", "swap-operator", "edit-hours", "edit-times"]);

interface RouteOperatorRecord {
    id: number;
    jo_id: string;
    routing_id: number;
    task_id: number;
    user_id: number;
    started_at: string | null;
    stopped_at: string | null;
    actual_hours: number;
    hourly_rate: number;
    labor_cost: number;
    is_active: boolean;
}

interface DirectusRouteOperator {
    jo_route_operator_id: number;
    jo_route_id: number;
    operator_id: number;
    logged_hours?: number | string | null;
    hourly_rate?: number | string | null;
    logged_at?: string | null;
    started_at?: string | null;
    stopped_at?: string | null;
    is_active?: boolean | number | string | null;
}

class DirectusRouteOperatorError extends Error {
    status: number;
    code?: string;

    constructor(status: number, message: string, code?: string) {
        super(message);
        this.name = "DirectusRouteOperatorError";
        this.status = status;
        this.code = code;
    }
}

function isRosterChangeAction(action: string): action is "remove-operator" | "swap-operator" | "edit-hours" | "edit-times" {
    return OPERATOR_ROSTER_ACTIONS.has(action);
}

function operatorAuditAction(action: "remove-operator" | "swap-operator" | "edit-hours" | "edit-times"): "operator-remove" | "operator-swap" | "operator-edit" {
    if (action === "remove-operator") return "operator-remove";
    if (action === "swap-operator") return "operator-swap";
    return "operator-edit";
}

function textValue(value: unknown): string {
    return value === undefined || value === null ? "" : String(value).trim();
}

function positiveInteger(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function rosterRequestHash(body: Record<string, any>, actorId: number): string {
    return createHash("sha256")
        .update(JSON.stringify({
            actorId,
            action: textValue(body.action),
            taskId: positiveInteger(body.taskId),
            userId: positiveInteger(body.userId),
            routeOperatorId: positiveInteger(body.routeOperatorId) || null,
            replacementUserId: positiveInteger(body.replacementUserId) || null,
            actualHours: body.actualHours ?? null,
            startedAt: textValue(body.startedAt),
            stoppedAt: textValue(body.stoppedAt),
            changeReason: textValue(body.changeReason)
        }))
        .digest("hex");
}

function rosterEventKey(body: Record<string, any>, requestHash: string): string {
    const suppliedRequestId = textValue(body.requestId);
    if (suppliedRequestId.length > 96) {
        throw new DirectusRouteOperatorError(400, "requestId must not exceed 96 characters.", "OPERATOR_REQUEST_ID_INVALID");
    }
    return `operator-roster:${suppliedRequestId || requestHash}`;
}

function changeReason(value: unknown): string {
    const reason = textValue(value);
    if (reason.length > 500) {
        throw new DirectusRouteOperatorError(400, "changeReason must not exceed 500 characters.", "OPERATOR_CHANGE_REASON_INVALID");
    }
    return reason;
}

function parseDirectusDateTime(value: string): number {
    return parsePhtDateTime(value) ?? Number.NaN;
}

function normalizePhtInput(value: unknown, label: string): { value: string; timestamp: number } {
    const raw = textValue(value);
    const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
    if (!match) {
        throw new DirectusRouteOperatorError(400, `${label} must use Philippine time in YYYY-MM-DDTHH:mm format.`, "OPERATOR_TIME_INVALID");
    }

    const normalized = `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6] || "00"}`;
    const timestamp = parsePhtDateTime(normalized);
    if (timestamp === null || formatPhtDateTime(new Date(timestamp)) !== normalized) {
        throw new DirectusRouteOperatorError(400, `${label} is not a valid Philippine timestamp.`, "OPERATOR_TIME_INVALID");
    }

    return { value: normalized, timestamp };
}

async function directusRequest<T>(resource: string, init: RequestInit = {}): Promise<T> {
    if (!DIRECTUS_URL) {
        throw new DirectusRouteOperatorError(503, "Manufacturing Directus is not configured.");
    }

    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${resource}`, {
            ...init,
            headers,
            cache: "no-store"
        });
    } catch (error) {
        throw new DirectusRouteOperatorError(503, `Manufacturing Directus is unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }

    const text = await response.text();
    let payload: any = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        const detail = payload?.errors?.[0]?.message || payload?.error || text || response.statusText;
        throw new DirectusRouteOperatorError(response.status, `Directus route-operator request failed: ${detail}`);
    }

    return payload as T;
}

function recordsUrl(taskId?: number, userId?: number, activeOnly = false): string {
    const params = new URLSearchParams({ limit: "-1", fields: ROUTE_OPERATOR_FIELDS });
    if (taskId !== undefined) params.set("filter[jo_route_id][_eq]", String(taskId));
    if (userId !== undefined) params.set("filter[operator_id][_eq]", String(userId));
    if (activeOnly) {
        params.set("filter[started_at][_nnull]", "true");
        params.set("filter[stopped_at][_null]", "true");
    }
    return `/items/${COLLECTION}?${params.toString()}`;
}

async function fetchDirectusRecords(taskId?: number, userId?: number, activeOnly = false): Promise<DirectusRouteOperator[]> {
    const payload = await directusRequest<{ data?: DirectusRouteOperator[] }>(recordsUrl(taskId, userId, activeOnly));
    return Array.isArray(payload?.data) ? payload.data : [];
}

async function findDirectusRecord(taskId: number, userId: number, activeOnly = false): Promise<DirectusRouteOperator | null> {
    const records = await fetchDirectusRecords(taskId, userId, activeOnly);
    if (activeOnly) return records.find((record) => isActiveValue(record.is_active)) || null;
    return records.find((record) => isActiveValue(record.is_active)) || records[0] || null;
}

async function findDirectusRecordById(routeOperatorId: number): Promise<DirectusRouteOperator | null> {
    const payload = await directusRequest<{ data?: DirectusRouteOperator }>(
        `/items/${COLLECTION}/${encodeURIComponent(String(routeOperatorId))}?fields=${ROUTE_OPERATOR_FIELDS}`
    );
    return payload?.data || null;
}

async function findLatestEditableRecord(taskId: number, userId: number): Promise<DirectusRouteOperator | null> {
    const records = await fetchDirectusRecords(taskId, userId);
    return records
        .filter((record) => isActiveValue(record.is_active) && record.started_at)
        .sort((left, right) => Number(right.jo_route_operator_id) - Number(left.jo_route_operator_id))[0] || null;
}

function isActiveValue(value: unknown): boolean {
    if (value === undefined || value === null || value === "") return true;
    if (value === true || value === 1) return true;
    return !["0", "false", "no", "inactive"].includes(String(value).trim().toLowerCase());
}

function mapDirectusRecord(record: DirectusRouteOperator, joId = ""): RouteOperatorRecord {
    const actualHours = Number(record.logged_hours || 0);
    const hourlyRate = Number(record.hourly_rate || 0);
    return {
        id: Number(record.jo_route_operator_id),
        jo_id: joId,
        routing_id: Number(record.jo_route_id),
        task_id: Number(record.jo_route_id),
        user_id: Number(record.operator_id),
        started_at: record.started_at || null,
        stopped_at: record.stopped_at || null,
        actual_hours: actualHours,
        hourly_rate: hourlyRate,
        labor_cost: Math.round(actualHours * hourlyRate * 100) / 100,
        is_active: isActiveValue(record.is_active)
    };
}

function responseRecord(payload: { data?: DirectusRouteOperator } | null, joId: string): RouteOperatorRecord {
    if (!payload?.data) {
        throw new DirectusRouteOperatorError(502, "Directus returned no route-operator record.");
    }
    return mapDirectusRecord(payload.data, joId);
}

function relationId(value: unknown): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return Number(record.job_order_id ?? record.id ?? 0);
    }
    return Number(value ?? 0);
}

interface RouteJobOrderContext {
    jobOrderId: number;
    jobOrderNo: string;
    sequenceOrder: number;
    status: string;
    assignedPersonnel: ReturnType<typeof normalizeOperatorAssignments>;
}

async function getRouteJobOrderContext(taskId: number): Promise<RouteJobOrderContext> {
    const routePayload = await directusRequest<{ data?: { job_order_id?: unknown; sequence_order?: unknown } }>(
        `/items/manufacturing_job_order_routes/${taskId}?fields=jo_route_id,job_order_id,sequence_order`,
    );
    const jobOrderId = relationId(routePayload?.data?.job_order_id);
    if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0) {
        throw new DirectusRouteOperatorError(404, "Routing task is not linked to a valid Job Order.", "JOB_ORDER_NOT_FOUND");
    }
    const sequenceOrder = Number(routePayload?.data?.sequence_order);
    if (!Number.isSafeInteger(sequenceOrder) || sequenceOrder <= 0) {
        throw new DirectusRouteOperatorError(409, "Routing task is missing a valid sequence assignment.", "ROUTE_SEQUENCE_MISSING");
    }

    const jobOrderPayload = await directusRequest<{ data?: { status?: unknown; job_order_no?: unknown; assigned_personnel?: unknown } }>(
        `/items/manufacturing_job_orders/${jobOrderId}?fields=job_order_id,job_order_no,status,assigned_personnel`,
    );
    const jobOrder = jobOrderPayload?.data;
    if (!jobOrder) {
        throw new DirectusRouteOperatorError(404, "Job Order was not found.", "JOB_ORDER_NOT_FOUND");
    }
    return {
        jobOrderId,
        jobOrderNo: String(jobOrder.job_order_no || `JO-${jobOrderId}`),
        sequenceOrder,
        status: String(jobOrder.status || ""),
        assignedPersonnel: normalizeOperatorAssignments(jobOrder.assigned_personnel)
    };
}

async function assertProductionMutationAllowed(taskId: number, action: string): Promise<RouteJobOrderContext> {
    const context = await getRouteJobOrderContext(taskId);
    const jobOrderId = context.jobOrderId;
    const jobOrderNo = context.jobOrderNo;
    const jobOrder = { status: context.status, job_order_no: jobOrderNo };
    const status = normalizeJobOrderStatus(jobOrder?.status);
    if (!status) {
        throw new DirectusRouteOperatorError(409, "The Job Order has an unknown status and cannot be changed.", "JOB_ORDER_STATUS_UNKNOWN");
    }
    if (action === "stop-timer") return context;
    if (isCancelledJobOrderStatus(status)) {
        throw new DirectusRouteOperatorError(409, `Job Order ${jobOrder?.job_order_no || jobOrderId} is cancelled and cannot be changed.`, "JOB_ORDER_CANCELLED");
    }
    if (isJobOrderStatus(status, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD)) {
        throw new DirectusRouteOperatorError(409, `Job Order ${jobOrder?.job_order_no || jobOrderId} is on hold; resume production before changing operator activity.`, "PRODUCTION_ON_HOLD");
    }
    if (isJobOrderStatus(status, JOB_ORDER_STATUS.PRODUCTION_COMPLETED, JOB_ORDER_STATUS.FOR_QA_RECONCILIATION, JOB_ORDER_STATUS.CLOSED)) {
        throw new DirectusRouteOperatorError(409, `Job Order ${jobOrder?.job_order_no || jobOrderId} has completed production and cannot be changed.`, "PRODUCTION_COMPLETED");
    }
    if (!isJobOrderStatus(status, JOB_ORDER_STATUS.IN_PRODUCTION)) {
        throw new DirectusRouteOperatorError(409, `Job Order ${jobOrder?.job_order_no || jobOrderId} must be In Production before operator activity can be changed.`, "JOB_ORDER_NOT_IN_PRODUCTION");
    }
    return context;
}

// Fetch all users to resolve their metadata (names, rates, positions)
async function fetchUsersMap(): Promise<Map<number, { name: string; position: string; rate: number }>> {
    const userMap = new Map<number, { name: string; position: string; rate: number }>();
    try {
        const url = `${DIRECTUS_URL}/items/user?limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (res.ok) {
            const data = await res.json();
            const users = data.data || [];
            users.forEach((u: any) => {
                const uId = Number(u.user_id || u.id);
                const fname = u.user_fname || u.first_name || "";
                const lname = u.user_lname || u.last_name || "";
                const fullName = `${fname} ${lname}`.trim() || `User #${uId}`;
                const position = u.user_position || u.position || "Operator";

                let rate = 150;
                if (u.hourly_rate !== undefined && u.hourly_rate !== null) {
                    rate = Number(u.hourly_rate);
                } else if (u.rate !== undefined && u.rate !== null) {
                    rate = Number(u.rate);
                } else {
                    const posLower = position.toLowerCase();
                    if (posLower.includes("manager") || posLower.includes("lead") || posLower.includes("supervisor")) {
                        rate = 250;
                    } else if (posLower.includes("qa") || posLower.includes("qc") || posLower.includes("inspector")) {
                        rate = 180;
                    }
                }

                userMap.set(uId, { name: fullName, position, rate });
            });
        }
    } catch (err) {
        console.error("Failed to fetch users for metadata mapping:", err);
    }
    return userMap;
}

async function enrichRecords(records: RouteOperatorRecord[]): Promise<RouteOperatorRecord[]> {
    const usersMap = await fetchUsersMap();
    return records.map(record => {
        const userMeta = usersMap.get(Number(record.user_id)) || {
            name: `Operator #${record.user_id}`,
            position: "Operator",
            rate: record.hourly_rate || 150
        };
        const rate = record.hourly_rate || userMeta.rate;
        const laborCost = record.actual_hours * rate;
        return {
            ...record,
            user_name: userMeta.name,
            user_position: userMeta.position,
            hourly_rate: rate,
            labor_cost: Math.round(laborCost * 100) / 100
        } as RouteOperatorRecord;
    });
}

function errorResponse(error: unknown, fallbackMessage: string) {
    if (error instanceof JobOrderOperatorAssignmentError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof DirectusRouteOperatorError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : fallbackMessage }, { status: 500 });
}

async function requireAuthenticatedActor(): Promise<number> {
    const actorId = await getSessionUserId();
    if (!actorId || actorId <= 0) {
        throw new DirectusRouteOperatorError(401, "An authenticated user is required for operator roster changes.", "AUTHENTICATION_REQUIRED");
    }
    return actorId;
}

function auditRemarks(
    action: "remove-operator" | "swap-operator" | "edit-hours" | "edit-times",
    context: RouteJobOrderContext,
    userId: number,
    replacementUserId: number | null,
    actualHours: number | null,
    reason: string,
    timeChange: { startedAt: string; stoppedAt: string | null } | null = null
): string {
    const detail = action === "swap-operator"
        ? `replacement operator ${replacementUserId}`
        : action === "edit-hours"
            ? `hours set to ${actualHours}`
            : action === "edit-times" && timeChange
                ? `Time In set to ${timeChange.startedAt}; Time Out ${timeChange.stoppedAt ? `set to ${timeChange.stoppedAt}` : "left running"}`
            : "removed from the active roster";
    const reasonDetail = reason ? ` Reason: ${reason}` : "";
    return `Operator ${userId} ${detail} on Route ${context.sequenceOrder} of ${context.jobOrderNo}.${reasonDetail}`;
}

// GET handler
export async function GET(request: Request) {
    const accessDenied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.production);
    if (accessDenied) return accessDenied;
    try {
        const { searchParams } = new URL(request.url);
        const taskIdParam = searchParams.get("taskId");
        const taskId = taskIdParam === null ? undefined : Number(taskIdParam);
        const joId = searchParams.get("joId") || "";
        const activeOnly = searchParams.get("activeOnly") === "true";

        if (taskId !== undefined && (!Number.isInteger(taskId) || taskId <= 0)) {
            return NextResponse.json({ error: "taskId must be a positive integer" }, { status: 400 });
        }

        const context = taskId === undefined ? null : await getRouteJobOrderContext(taskId);
        const directusRecords = await fetchDirectusRecords(taskId, undefined, activeOnly);
        const responseJoId = joId || context?.jobOrderNo || (context ? String(context.jobOrderId) : "");
        const records = directusRecords
            .filter((record) => !activeOnly || isActiveValue(record.is_active))
            .map(record => mapDirectusRecord(record, responseJoId));
        const enrichedRecords = await enrichRecords(records);
        const totalHours = enrichedRecords.reduce((sum, record) => sum + record.actual_hours, 0);
        const totalLaborCost = enrichedRecords.reduce((sum, record) => sum + record.labor_cost, 0);

        return NextResponse.json({
            data: enrichedRecords,
            assignedPersonnel: context?.assignedPersonnel || null,
            assignmentState: context
                ? {
                    jobOrderId: context.jobOrderId,
                    jobOrderNo: context.jobOrderNo,
                    assignedPersonnel: context.assignedPersonnel
                }
                : null,
            summary: {
                total_hours: Math.round(totalHours * 100) / 100,
                total_labor_cost: Math.round(totalLaborCost * 100) / 100
            }
        });
    } catch (error) {
        console.error("Error in route-operators GET API:", error);
        return errorResponse(error, "Failed to fetch route operators logs");
    }
}

// POST handler
export async function POST(request: Request) {
    const accessDenied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.production);
    if (accessDenied) return accessDenied;
    try {
        const body = await request.json().catch(() => null) as Record<string, any> | null;
        if (!body || typeof body !== "object") {
            return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
        }

        const action = String(body.action || "");
        if (!action) {
            return NextResponse.json({ error: "Missing required field 'action'" }, { status: 400 });
        }

        const taskId = Number(body.taskId);
        const userId = Number(body.userId);
        if (!Number.isInteger(taskId) || taskId <= 0 || !Number.isInteger(userId) || userId <= 0) {
            return NextResponse.json({ error: "taskId and userId must be positive integers" }, { status: 400 });
        }

        const joId = String(body.joId || "").trim();
        if (!joId) {
            return NextResponse.json({ error: "joId is required for route operator changes" }, { status: 400 });
        }

        const rosterAction = isRosterChangeAction(action);
        const actorId = rosterAction ? await requireAuthenticatedActor() : null;
        const requestHash = rosterAction ? rosterRequestHash(body, actorId as number) : null;
        const eventKey = rosterAction ? rosterEventKey(body, requestHash as string) : null;
        let context: RouteJobOrderContext;

        if (rosterAction) {
            context = await getRouteJobOrderContext(taskId);
        } else {
            context = await assertProductionMutationAllowed(taskId, action);
        }

        if (joId !== String(context.jobOrderId) && joId !== context.jobOrderNo) {
            return NextResponse.json({ error: "The route does not belong to the supplied Job Order." }, { status: 409 });
        }

        if (rosterAction) {
            const existingAudit = await findOperatorRosterAudit(eventKey as string, context.jobOrderId);
            const expectedAction = operatorAuditAction(action);
            if (existingAudit) {
                if (existingAudit.workflow_action && existingAudit.workflow_action !== expectedAction) {
                    throw new DirectusRouteOperatorError(409, "The request ID was already used for a different operator roster action.", "OPERATOR_REQUEST_ID_CONFLICT");
                }
                if (existingAudit.workflow_request_hash && existingAudit.workflow_request_hash !== requestHash) {
                    throw new DirectusRouteOperatorError(409, "The request ID was already used with a different operator roster change.", "OPERATOR_REQUEST_ID_CONFLICT");
                }
                return NextResponse.json({
                    success: true,
                    idempotent: true,
                    message: "The operator roster change was already applied.",
                    assignedPersonnel: context.assignedPersonnel,
                    auditId: positiveInteger(existingAudit.history_id ?? existingAudit.id) || null
                });
            }
            context = await assertProductionMutationAllowed(taskId, action);
        }

        const usersMap = await fetchUsersMap();
        const userMeta = usersMap.get(userId) || { name: `Operator #${userId}`, position: "Operator", rate: 150 };
        const requestedRate = Number(body.hourlyRate);
        const determinedRate = Number.isFinite(requestedRate) && requestedRate > 0 ? requestedRate : userMeta.rate;
        const reason = rosterAction ? changeReason(body.changeReason) : "";

        const recordRosterAudit = async (
            assignmentState: ReturnType<typeof normalizeOperatorAssignments> | null,
            actualHours: number | null = null,
            replacementUserId: number | null = null,
            timeChange: { startedAt: string; stoppedAt: string | null } | null = null
        ) => {
            const audit = await recordOperatorRosterAudit({
                jobOrderId: context.jobOrderId,
                oldStatus: normalizeJobOrderStatus(context.status) || context.status,
                newStatus: normalizeJobOrderStatus(context.status) || context.status,
                workflowAction: operatorAuditAction(action as "remove-operator" | "swap-operator" | "edit-hours" | "edit-times"),
                changedBy: actorId as number,
                eventKey: eventKey as string,
                workflowRequestHash: requestHash as string,
                remarks: auditRemarks(action as "remove-operator" | "swap-operator" | "edit-hours" | "edit-times", context, userId, replacementUserId, actualHours, reason, timeChange)
            });
            return {
                assignedPersonnel: assignmentState || context.assignedPersonnel,
                auditId: positiveInteger(audit.history_id ?? audit.id) || null
            };
        };

        let assignmentState: ReturnType<typeof normalizeOperatorAssignments> | null = null;
        if (action === "start-timer" || action === "log-hours") {
            assignmentState = (await updateJobOrderOperatorAssignment(
                context.jobOrderId,
                context.sequenceOrder,
                userId,
                true
            )).assignments;
        }

        if (action === "start-timer") {
            const activeRecord = await findDirectusRecord(taskId, userId, true);
            if (activeRecord) {
                return NextResponse.json({
                    success: true,
                    message: "Timer already running",
                    assignedPersonnel: context.assignedPersonnel,
                    data: {
                        ...mapDirectusRecord(activeRecord, joId),
                        user_name: userMeta.name,
                        user_position: userMeta.position,
                        hourly_rate: determinedRate,
                        is_active: true
                    }
                });
            }

            const now = formatPhtDateTime();
            const existingRecord = await findDirectusRecord(taskId, userId);
            const payload = {
                started_at: now,
                stopped_at: null,
                hourly_rate: determinedRate,
                logged_at: now
            };
            const saved = existingRecord
                ? await directusRequest<{ data?: DirectusRouteOperator }>(`/items/${COLLECTION}/${existingRecord.jo_route_operator_id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload)
                })
                : await directusRequest<{ data?: DirectusRouteOperator }>(`/items/${COLLECTION}`, {
                    method: "POST",
                    body: JSON.stringify({
                        jo_route_id: taskId,
                        operator_id: userId,
                        logged_hours: 0,
                        is_active: true,
                        ...payload
                    })
                });
            const mapped = responseRecord(saved, joId);
            return NextResponse.json({
                success: true,
                assignedPersonnel: assignmentState,
                data: {
                    ...mapped,
                    user_name: userMeta.name,
                    user_position: userMeta.position,
                    hourly_rate: determinedRate,
                    labor_cost: 0,
                    is_active: true
                }
            });
        }

        if (action === "stop-timer") {
            const activeRecord = await findDirectusRecord(taskId, userId, true);
            if (!activeRecord) {
                return NextResponse.json({ error: "No running timer found for this operator and task" }, { status: 400 });
            }

            const startedAt = activeRecord.started_at ? parseDirectusDateTime(activeRecord.started_at) : Number.NaN;
            if (!Number.isFinite(startedAt)) {
                return NextResponse.json({ error: "The active timer has no valid start time" }, { status: 409 });
            }

            const stoppedAt = formatPhtDateTime();
            const elapsedHours = Math.max(0.01, (Date.now() - startedAt) / (1000 * 60 * 60));
            const totalHours = Math.round((Number(activeRecord.logged_hours || 0) + elapsedHours) * 100) / 100;
            const hourlyRate = Number(activeRecord.hourly_rate || determinedRate);
            const saved = await directusRequest<{ data?: DirectusRouteOperator }>(`/items/${COLLECTION}/${activeRecord.jo_route_operator_id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    logged_hours: totalHours,
                    hourly_rate: hourlyRate,
                    stopped_at: stoppedAt,
                    logged_at: stoppedAt
                })
            });
            const mapped = responseRecord(saved, joId);
            return NextResponse.json({
                success: true,
                assignedPersonnel: context.assignedPersonnel,
                data: {
                    ...mapped,
                    user_name: userMeta.name,
                    user_position: userMeta.position,
                    is_active: true
                }
            });
        }

        if (action === "log-hours") {
            if (body.actualHours === undefined) {
                return NextResponse.json({ error: "Missing required field actualHours for log-hours" }, { status: 400 });
            }

            const totalHours = Math.round(Number(body.actualHours) * 100) / 100;
            if (!Number.isFinite(totalHours) || totalHours < 0) {
                return NextResponse.json({ error: "actualHours must be a non-negative number" }, { status: 400 });
            }

            const now = formatPhtDateTime();
            const existingRecord = await findDirectusRecord(taskId, userId);
            const saved = existingRecord
                ? await directusRequest<{ data?: DirectusRouteOperator }>(`/items/${COLLECTION}/${existingRecord.jo_route_operator_id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        logged_hours: totalHours,
                        hourly_rate: determinedRate,
                        logged_at: now
                    })
                })
                : await directusRequest<{ data?: DirectusRouteOperator }>(`/items/${COLLECTION}`, {
                    method: "POST",
                    body: JSON.stringify({
                        jo_route_id: taskId,
                        operator_id: userId,
                        logged_hours: totalHours,
                        hourly_rate: determinedRate,
                        logged_at: now,
                        started_at: null,
                        stopped_at: null,
                        is_active: true
                    })
                });
            const mapped = responseRecord(saved, joId);
            return NextResponse.json({
                success: true,
                assignedPersonnel: assignmentState,
                data: {
                    ...mapped,
                    user_name: userMeta.name,
                    user_position: userMeta.position,
                    is_active: true
                }
            });
        }

        if (action === "remove-operator") {
            assignmentState = (await removeJobOrderOperatorAssignment(
                context.jobOrderId,
                context.sequenceOrder,
                userId
            )).assignments;
            const audit = await recordRosterAudit(assignmentState);
            return NextResponse.json({
                success: true,
                removedFromActiveRoster: true,
                assignedPersonnel: audit.assignedPersonnel,
                auditId: audit.auditId
            });
        }

        if (action === "swap-operator") {
            const replacementUserId = positiveInteger(body.replacementUserId);
            if (!replacementUserId) {
                throw new DirectusRouteOperatorError(400, "replacementUserId must be a positive integer.", "OPERATOR_REPLACEMENT_INVALID");
            }
            if (!usersMap.has(replacementUserId)) {
                throw new DirectusRouteOperatorError(404, "The replacement operator was not found or is not eligible.", "OPERATOR_REPLACEMENT_INVALID");
            }
            assignmentState = (await swapJobOrderOperatorAssignment(
                context.jobOrderId,
                context.sequenceOrder,
                userId,
                replacementUserId
            )).assignments;
            const audit = await recordRosterAudit(assignmentState, null, replacementUserId);
            return NextResponse.json({
                success: true,
                swapped: true,
                assignedPersonnel: audit.assignedPersonnel,
                auditId: audit.auditId
            });
        }

        if (action === "edit-times") {
            const routeOperatorId = positiveInteger(body.routeOperatorId);
            if (!routeOperatorId) {
                throw new DirectusRouteOperatorError(400, "routeOperatorId is required for edit-times.", "OPERATOR_SESSION_REQUIRED");
            }

            const existingRecord = await findDirectusRecordById(routeOperatorId);
            if (!existingRecord
                || Number(existingRecord.jo_route_id) !== taskId
                || Number(existingRecord.operator_id) !== userId
                || !isActiveValue(existingRecord.is_active)) {
                throw new DirectusRouteOperatorError(409, "The selected operator session is not assigned to this route.", "OPERATOR_SESSION_NOT_FOUND");
            }
            if (!existingRecord.started_at) {
                throw new DirectusRouteOperatorError(409, "The selected operator session has no Time In and cannot be edited.", "OPERATOR_SESSION_INVALID");
            }

            const latestEditableRecord = await findLatestEditableRecord(taskId, userId);
            if (!latestEditableRecord || Number(latestEditableRecord.jo_route_operator_id) !== routeOperatorId) {
                throw new DirectusRouteOperatorError(409, "Only the latest active or completed operator session can be edited.", "OPERATOR_SESSION_NOT_LATEST");
            }

            const startedAt = normalizePhtInput(body.startedAt, "Time In");
            const stoppedAtInput = textValue(body.stoppedAt);
            const stoppedAt = stoppedAtInput ? normalizePhtInput(stoppedAtInput, "Time Out") : null;
            if (existingRecord.stopped_at && !stoppedAt) {
                throw new DirectusRouteOperatorError(400, "A completed session requires Time Out.", "OPERATOR_TIME_REQUIRED");
            }
            if (stoppedAt && stoppedAt.timestamp <= startedAt.timestamp) {
                throw new DirectusRouteOperatorError(400, "Time Out must be later than Time In.", "OPERATOR_TIME_ORDER_INVALID");
            }

            const elapsedHours = stoppedAt
                ? Math.max(
                    0.01,
                    Math.round(((stoppedAt.timestamp - startedAt.timestamp) / (1000 * 60 * 60)) * 100) / 100
                )
                : Number(existingRecord.logged_hours || 0);
            const loggedAt = formatPhtDateTime();
            const saved = await directusRequest<{ data?: DirectusRouteOperator }>(`/items/${COLLECTION}/${routeOperatorId}`, {
                method: "PATCH",
                body: JSON.stringify({
                    started_at: startedAt.value,
                    ...(stoppedAt ? { stopped_at: stoppedAt.value, logged_hours: elapsedHours } : { stopped_at: null }),
                    logged_at: loggedAt
                })
            });
            const mapped = responseRecord(saved, joId);
            const audit = await recordRosterAudit(
                null,
                elapsedHours,
                null,
                { startedAt: startedAt.value, stoppedAt: stoppedAt?.value || null }
            );
            return NextResponse.json({
                success: true,
                data: {
                    ...mapped,
                    user_name: userMeta.name,
                    user_position: userMeta.position,
                    is_active: true
                },
                assignedPersonnel: audit.assignedPersonnel,
                auditId: audit.auditId
            });
        }

        if (action === "edit-hours") {
            const totalHours = Number(body.actualHours);
            if (!Number.isFinite(totalHours) || totalHours < 0) {
                throw new DirectusRouteOperatorError(400, "actualHours must be a non-negative number.", "OPERATOR_HOURS_INVALID");
            }
            const existingRecord = await findDirectusRecord(taskId, userId);
            if (!existingRecord || !isActiveValue(existingRecord.is_active)) {
                throw new DirectusRouteOperatorError(409, "The operator is not assigned to this route.", "OPERATOR_ASSIGNMENT_NOT_FOUND");
            }
            const now = formatPhtDateTime();
            const saved = await directusRequest<{ data?: DirectusRouteOperator }>(`/items/${COLLECTION}/${existingRecord.jo_route_operator_id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    logged_hours: Math.round(totalHours * 100) / 100,
                    hourly_rate: determinedRate,
                    logged_at: now
                })
            });
            const mapped = responseRecord(saved, joId);
            const audit = await recordRosterAudit(null, Math.round(totalHours * 100) / 100);
            return NextResponse.json({
                success: true,
                data: {
                    ...mapped,
                    user_name: userMeta.name,
                    user_position: userMeta.position,
                    is_active: true
                },
                assignedPersonnel: audit.assignedPersonnel,
                auditId: audit.auditId
            });
        }

        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (error) {
        console.error("Error in route-operators POST API:", error);
        return errorResponse(error, "Failed to process request");
    }
}
