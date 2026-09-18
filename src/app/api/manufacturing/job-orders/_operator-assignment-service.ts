import { DIRECTUS_URL, headers, formatPhtDateTime } from "@/app/api/manufacturing/directus-api";

export type OperatorAssignmentMap = Record<string, number[]>;

interface DirectusRoute {
    jo_route_id?: number | string;
    id?: number | string;
    job_order_id?: number | string | Record<string, unknown>;
    sequence_order?: number | string | null;
}

export interface DirectusRouteOperator {
    jo_route_operator_id?: number | string;
    id?: number | string;
    jo_route_id?: number | string | null;
    operator_id?: number | string | null;
    logged_hours?: number | string | null;
    hourly_rate?: number | string | null;
    logged_at?: string | null;
    started_at?: string | null;
    stopped_at?: string | null;
    is_active?: boolean | number | string | null;
}

export class JobOrderOperatorAssignmentError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(
        message: string,
        status = 400,
        code = "JOB_ORDER_OPERATOR_ASSIGNMENT_INVALID"
    ) {
        super(message);
        this.name = "JobOrderOperatorAssignmentError";
        this.status = status;
        this.code = code;
    }
}

function positiveInteger(value: unknown): number {
    const candidate = value && typeof value === "object"
        ? (value as Record<string, unknown>).job_order_id
            ?? (value as Record<string, unknown>).jo_route_id
            ?? (value as Record<string, unknown>).operator_id
            ?? (value as Record<string, unknown>).id
        : value;
    const parsed = Number(candidate);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function isActiveValue(value: unknown): boolean {
    if (value === undefined || value === null || value === "") return true;
    if (value === true || value === 1) return true;
    return !["0", "false", "no", "inactive"].includes(String(value).trim().toLowerCase());
}

export function isActiveRouteOperator(record: Pick<DirectusRouteOperator, "is_active">): boolean {
    return isActiveValue(record.is_active);
}

function isRunning(record: Pick<DirectusRouteOperator, "started_at" | "stopped_at">): boolean {
    return Boolean(record.started_at && !record.stopped_at);
}

function loggedHours(record: Pick<DirectusRouteOperator, "logged_hours">): number {
    const value = Number(record.logged_hours ?? 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isRouteOperatorProtected(
    record: Pick<DirectusRouteOperator, "started_at" | "stopped_at" | "logged_hours">
): boolean {
    return isRunning(record) || loggedHours(record) > 0;
}

function routeId(route: DirectusRoute): number {
    return positiveInteger(route.jo_route_id ?? route.id);
}

function operatorId(record: DirectusRouteOperator): number {
    return positiveInteger(record.operator_id);
}

function operatorRecordId(record: DirectusRouteOperator): number {
    return positiveInteger(record.jo_route_operator_id ?? record.id);
}

function parseJsonValue(value: unknown): unknown {
    if (typeof value !== "string") return value;
    const text = value.trim();
    if (!text) return value;
    try {
        return JSON.parse(text);
    } catch {
        return value;
    }
}

export function normalizeOperatorAssignments(value: unknown): OperatorAssignmentMap {
    const parsed = parseJsonValue(value);
    if (parsed === undefined || parsed === null || parsed === "") return {};
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new JobOrderOperatorAssignmentError("assigned_personnel must be an object keyed by routing sequence.");
    }

    const normalized: OperatorAssignmentMap = {};
    for (const [rawSequence, rawOperators] of Object.entries(parsed as Record<string, unknown>)) {
        const sequence = positiveInteger(rawSequence);
        if (!sequence) {
            throw new JobOrderOperatorAssignmentError(`Routing sequence "${rawSequence}" is invalid.`);
        }
        if (!Array.isArray(rawOperators)) {
            throw new JobOrderOperatorAssignmentError(`Personnel for routing sequence ${sequence} must be an array.`);
        }

        const operatorIds = rawOperators.map((rawOperator) => positiveInteger(rawOperator));
        if (operatorIds.some((id) => id <= 0)) {
            throw new JobOrderOperatorAssignmentError(`Routing sequence ${sequence} contains an invalid operator ID.`);
        }
        normalized[String(sequence)] = [...new Set(operatorIds)].sort((left, right) => left - right);
    }
    return normalized;
}

export function mergeOperatorAssignments(...maps: OperatorAssignmentMap[]): OperatorAssignmentMap {
    const merged: OperatorAssignmentMap = {};
    for (const map of maps) {
        for (const [sequence, operatorIds] of Object.entries(map)) {
            merged[sequence] = [...new Set([...(merged[sequence] || []), ...operatorIds])].sort((left, right) => left - right);
        }
    }
    return merged;
}

async function directusRequest<T>(resource: string, init: RequestInit = {}): Promise<T> {
    if (!DIRECTUS_URL) throw new Error("Manufacturing Directus is not configured.");

    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${resource}`, {
            ...init,
            headers,
            cache: "no-store"
        });
    } catch (error) {
        throw new Error(`Manufacturing Directus is unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }

    const responseText = await response.text();
    let payload: unknown = null;
    try {
        payload = responseText ? JSON.parse(responseText) : null;
    } catch {
        payload = responseText;
    }
    if (!response.ok) {
        const detail = payload && typeof payload === "object"
            ? (payload as { errors?: Array<{ message?: string }>; error?: string }).errors?.[0]?.message
                || (payload as { error?: string }).error
            : String(payload || response.statusText);
        throw new Error(`Directus operator assignment request failed (${response.status}): ${detail || response.statusText}`);
    }
    return payload as T;
}

async function readRoutes(jobOrderId: number): Promise<DirectusRoute[]> {
    const params = new URLSearchParams({
        limit: "-1",
        sort: "sequence_order",
        fields: "jo_route_id,job_order_id,sequence_order"
    });
    params.set("filter[job_order_id][_eq]", String(jobOrderId));
    const payload = await directusRequest<{ data?: DirectusRoute[] }>(`/items/manufacturing_job_order_routes?${params.toString()}`);
    return Array.isArray(payload?.data) ? payload.data : [];
}

async function readRouteOperators(routeIds: number[]): Promise<DirectusRouteOperator[]> {
    if (routeIds.length === 0) return [];
    const params = new URLSearchParams({
        limit: "-1",
        fields: "jo_route_operator_id,jo_route_id,operator_id,logged_hours,hourly_rate,logged_at,started_at,stopped_at,is_active"
    });
    params.set("filter[jo_route_id][_in]", routeIds.join(","));
    const payload = await directusRequest<{ data?: DirectusRouteOperator[] }>(`/items/manufacturing_job_order_route_operators?${params.toString()}`);
    return Array.isArray(payload?.data) ? payload.data : [];
}

function assignmentsFromRows(routes: DirectusRoute[], rows: DirectusRouteOperator[]): OperatorAssignmentMap {
    const sequenceByRoute = new Map<number, number>();
    for (const route of routes) {
        const currentRouteId = routeId(route);
        const sequence = positiveInteger(route.sequence_order);
        if (currentRouteId > 0 && sequence > 0) sequenceByRoute.set(currentRouteId, sequence);
    }

    const assignments: OperatorAssignmentMap = {};
    for (const row of rows) {
        if (!isActiveRouteOperator(row)) continue;
        const sequence = sequenceByRoute.get(positiveInteger(row.jo_route_id));
        const currentOperatorId = operatorId(row);
        if (!sequence || !currentOperatorId) continue;
        assignments[String(sequence)] = [...new Set([...(assignments[String(sequence)] || []), currentOperatorId])].sort((left, right) => left - right);
    }
    return assignments;
}

export async function readJobOrderAssignedPersonnel(jobOrderId: number): Promise<OperatorAssignmentMap> {
    const payload = await directusRequest<{ data?: { assigned_personnel?: unknown } }>(
        `/items/manufacturing_job_orders/${jobOrderId}?fields=job_order_id,assigned_personnel`
    );
    return normalizeOperatorAssignments(payload?.data?.assigned_personnel);
}

export async function readProjectedOperatorAssignments(jobOrderId: number): Promise<OperatorAssignmentMap> {
    const routes = await readRoutes(jobOrderId);
    const rows = await readRouteOperators(routes.map(routeId).filter((id) => id > 0));
    return assignmentsFromRows(routes, rows);
}

async function readUserRate(userId: number): Promise<number> {
    try {
        const payload = await directusRequest<{ data?: { hourly_rate?: unknown; rate?: unknown } }>(
            `/items/user/${userId}?fields=hourly_rate,rate`
        );
        const rate = Number(payload?.data?.hourly_rate ?? payload?.data?.rate ?? 150);
        return Number.isFinite(rate) && rate >= 0 ? rate : 150;
    } catch {
        return 150;
    }
}

export interface OperatorAssignmentSyncOptions {
    persistMaster?: boolean;
    useExistingWhenMissing?: boolean;
    mergeExistingWhenMissing?: boolean;
}

export interface OperatorAssignmentSyncResult {
    assignments: OperatorAssignmentMap;
    created: number;
    activated: number;
    deactivated: number;
}

export async function synchronizeJobOrderOperatorAssignments(
    jobOrderId: number,
    rawAssignments: unknown,
    options: OperatorAssignmentSyncOptions = {}
): Promise<OperatorAssignmentSyncResult> {
    if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0) {
        throw new JobOrderOperatorAssignmentError("A valid Job Order ID is required for personnel synchronization.");
    }

    const routes = await readRoutes(jobOrderId);
    const validRoutes = routes.filter((route) => routeId(route) > 0 && positiveInteger(route.sequence_order) > 0);
    const routeBySequence = new Map<number, DirectusRoute[]>();
    for (const route of validRoutes) {
        const sequence = positiveInteger(route.sequence_order);
        routeBySequence.set(sequence, [...(routeBySequence.get(sequence) || []), route]);
    }

    const normalized = normalizeOperatorAssignments(rawAssignments);
    const routeIds = validRoutes.map(routeId);
    const existingRows = await readRouteOperators(routeIds);
    const projected = assignmentsFromRows(validRoutes, existingRows);
    const rawIsMissing = rawAssignments === undefined || rawAssignments === null || rawAssignments === "";
    const shouldUseExisting = Boolean(options.useExistingWhenMissing)
        && (rawIsMissing || Object.keys(normalized).length === 0);
    const desiredAssignments = shouldUseExisting
        ? mergeOperatorAssignments(
            options.mergeExistingWhenMissing ? projected : {},
            normalized
        )
        : normalized;

    for (const [sequence, operatorIds] of Object.entries(desiredAssignments)) {
        if (!routeBySequence.has(Number(sequence))) {
            throw new JobOrderOperatorAssignmentError(`Routing sequence ${sequence} does not belong to Job Order ${jobOrderId}.`);
        }
        for (const currentOperatorId of operatorIds) {
            if (!Number.isSafeInteger(currentOperatorId) || currentOperatorId <= 0) {
                throw new JobOrderOperatorAssignmentError(`Routing sequence ${sequence} contains an invalid operator ID.`);
            }
        }
    }

    const sequenceByRoute = new Map<number, number>();
    for (const route of validRoutes) sequenceByRoute.set(routeId(route), positiveInteger(route.sequence_order));
    const desiredKeys = new Set<string>();
    for (const [sequence, operatorIds] of Object.entries(desiredAssignments)) {
        for (const currentRoute of routeBySequence.get(Number(sequence)) || []) {
            const currentRouteId = routeId(currentRoute);
            for (const currentOperatorId of operatorIds) desiredKeys.add(`${currentRouteId}:${currentOperatorId}`);
        }
    }

    const rowsByKey = new Map<string, DirectusRouteOperator[]>();
    for (const row of existingRows) {
        const currentRouteId = positiveInteger(row.jo_route_id);
        const currentOperatorId = operatorId(row);
        if (!sequenceByRoute.has(currentRouteId) || !currentOperatorId) continue;
        const key = `${currentRouteId}:${currentOperatorId}`;
        rowsByKey.set(key, [...(rowsByKey.get(key) || []), row]);
    }

    let created = 0;
    let activated = 0;
    let deactivated = 0;

    const activeRemovals = existingRows.filter((row) => {
        const currentRouteId = positiveInteger(row.jo_route_id);
        const currentOperatorId = operatorId(row);
        return Boolean(currentRouteId && currentOperatorId)
            && !desiredKeys.has(`${currentRouteId}:${currentOperatorId}`)
            && isActiveRouteOperator(row);
    });
    const protectedRemoval = activeRemovals.find(isRouteOperatorProtected);
    if (protectedRemoval) {
        throw new JobOrderOperatorAssignmentError(
            `Operator ${operatorId(protectedRemoval)} cannot be removed because an active or logged timer record would be affected. Pause or complete the tracking session first.`,
            409,
            "OPERATOR_ROSTER_CHANGE_BLOCKED"
        );
    }

    for (const desiredKey of desiredKeys) {
        const rows = [...(rowsByKey.get(desiredKey) || [])].sort((left, right) => operatorRecordId(left) - operatorRecordId(right));
        const keeper = rows.find(isRunning) || rows.find(isActiveRouteOperator) || rows[0];
        if (!keeper) {
            const [currentRouteId, currentOperatorId] = desiredKey.split(":").map(Number);
            await directusRequest(`/items/manufacturing_job_order_route_operators`, {
                method: "POST",
                body: JSON.stringify({
                    jo_route_id: currentRouteId,
                    operator_id: currentOperatorId,
                    logged_hours: 0,
                    hourly_rate: await readUserRate(currentOperatorId),
                    logged_at: formatPhtDateTime(),
                    started_at: null,
                    stopped_at: null,
                    is_active: true
                })
            });
            created += 1;
        } else {
            if (!isActiveRouteOperator(keeper)) {
                await directusRequest(`/items/manufacturing_job_order_route_operators/${operatorRecordId(keeper)}`, {
                    method: "PATCH",
                    body: JSON.stringify({ is_active: true })
                });
                activated += 1;
            }
            for (const duplicate of rows) {
                if (duplicate === keeper) continue;
                if (isRouteOperatorProtected(duplicate)) {
                    throw new JobOrderOperatorAssignmentError(
                        `Operator ${operatorId(duplicate)} has an active or logged timer and cannot be de-duplicated. Pause or complete the tracking session first.`,
                        409,
                        "OPERATOR_ROSTER_CHANGE_BLOCKED"
                    );
                }
                if (isActiveRouteOperator(duplicate)) {
                    await directusRequest(`/items/manufacturing_job_order_route_operators/${operatorRecordId(duplicate)}`, {
                        method: "PATCH",
                        body: JSON.stringify({ is_active: false })
                    });
                    deactivated += 1;
                }
            }
        }
    }

    for (const row of existingRows) {
        const currentRouteId = positiveInteger(row.jo_route_id);
        const currentOperatorId = operatorId(row);
        if (!currentRouteId || !currentOperatorId || desiredKeys.has(`${currentRouteId}:${currentOperatorId}`)) continue;
        if (isActiveRouteOperator(row)) {
            await directusRequest(`/items/manufacturing_job_order_route_operators/${operatorRecordId(row)}`, {
                method: "PATCH",
                body: JSON.stringify({ is_active: false })
            });
            deactivated += 1;
        }
    }

    if (options.persistMaster !== false) {
        await directusRequest(`/items/manufacturing_job_orders/${jobOrderId}`, {
            method: "PATCH",
            body: JSON.stringify({
                assigned_personnel: desiredAssignments,
                modified_at: formatPhtDateTime()
            })
        });
    }

    return { assignments: desiredAssignments, created, activated, deactivated };
}

export async function updateJobOrderOperatorAssignment(
    jobOrderId: number,
    sequenceOrder: number,
    userId: number,
    active: boolean
): Promise<OperatorAssignmentSyncResult> {
    if (!Number.isSafeInteger(sequenceOrder) || sequenceOrder <= 0) {
        throw new JobOrderOperatorAssignmentError("A valid routing sequence is required for personnel assignment.");
    }
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new JobOrderOperatorAssignmentError("A valid operator ID is required for personnel assignment.");
    }

    const canonical = await readJobOrderAssignedPersonnel(jobOrderId);
    const projected = await readProjectedOperatorAssignments(jobOrderId);
    const next = Object.keys(canonical).length > 0 ? { ...canonical } : projected;
    const sequenceKey = String(sequenceOrder);
    const current = new Set(next[sequenceKey] || []);
    if (active) current.add(userId);
    else current.delete(userId);
    next[sequenceKey] = [...current].sort((left, right) => left - right);
    return synchronizeJobOrderOperatorAssignments(jobOrderId, next);
}

async function readCurrentOperatorAssignments(jobOrderId: number): Promise<OperatorAssignmentMap> {
    const canonical = await readJobOrderAssignedPersonnel(jobOrderId);
    if (Object.keys(canonical).length > 0) return canonical;
    return readProjectedOperatorAssignments(jobOrderId);
}

export async function removeJobOrderOperatorAssignment(
    jobOrderId: number,
    sequenceOrder: number,
    userId: number
): Promise<OperatorAssignmentSyncResult> {
    if (!Number.isSafeInteger(sequenceOrder) || sequenceOrder <= 0) {
        throw new JobOrderOperatorAssignmentError("A valid routing sequence is required for personnel removal.");
    }
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new JobOrderOperatorAssignmentError("A valid operator ID is required for personnel removal.");
    }

    const current = await readCurrentOperatorAssignments(jobOrderId);
    const sequenceKey = String(sequenceOrder);
    if (!(current[sequenceKey] || []).includes(userId)) {
        throw new JobOrderOperatorAssignmentError(
            `Operator ${userId} is not assigned to routing sequence ${sequenceOrder}.`,
            409,
            "OPERATOR_ASSIGNMENT_NOT_FOUND"
        );
    }

    const next = { ...current };
    next[sequenceKey] = (next[sequenceKey] || []).filter((id) => id !== userId);
    return synchronizeJobOrderOperatorAssignments(jobOrderId, next);
}

export async function swapJobOrderOperatorAssignment(
    jobOrderId: number,
    sequenceOrder: number,
    userId: number,
    replacementUserId: number
): Promise<OperatorAssignmentSyncResult> {
    if (!Number.isSafeInteger(sequenceOrder) || sequenceOrder <= 0) {
        throw new JobOrderOperatorAssignmentError("A valid routing sequence is required for personnel reassignment.");
    }
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(replacementUserId) || replacementUserId <= 0) {
        throw new JobOrderOperatorAssignmentError("Valid current and replacement operator IDs are required for personnel reassignment.");
    }
    if (userId === replacementUserId) {
        throw new JobOrderOperatorAssignmentError(
            "The replacement operator must be different from the current operator.",
            409,
            "OPERATOR_REPLACEMENT_INVALID"
        );
    }

    const current = await readCurrentOperatorAssignments(jobOrderId);
    const sequenceKey = String(sequenceOrder);
    const sequenceOperators = current[sequenceKey] || [];
    if (!sequenceOperators.includes(userId)) {
        throw new JobOrderOperatorAssignmentError(
            `Operator ${userId} is not assigned to routing sequence ${sequenceOrder}.`,
            409,
            "OPERATOR_ASSIGNMENT_NOT_FOUND"
        );
    }
    if (sequenceOperators.includes(replacementUserId)) {
        throw new JobOrderOperatorAssignmentError(
            `Operator ${replacementUserId} is already assigned to routing sequence ${sequenceOrder}.`,
            409,
            "OPERATOR_DUPLICATE_ASSIGNMENT"
        );
    }

    const next = { ...current };
    next[sequenceKey] = sequenceOperators
        .filter((id) => id !== userId)
        .concat(replacementUserId)
        .sort((left, right) => left - right);
    return synchronizeJobOrderOperatorAssignments(jobOrderId, next);
}

export interface OperatorRosterAuditInput {
    jobOrderId: number;
    oldStatus: string;
    newStatus: string;
    workflowAction: "operator-remove" | "operator-swap" | "operator-edit";
    changedBy: number;
    changedAt?: string;
    eventKey: string;
    workflowRequestHash: string;
    remarks: string;
}

export interface OperatorRosterAuditRecord {
    history_id?: number | string;
    id?: number | string;
    event_key?: string;
    workflow_action?: string;
    workflow_request_hash?: string;
    remarks?: string;
}

export async function findOperatorRosterAudit(eventKey: string, jobOrderId?: number): Promise<OperatorRosterAuditRecord | null> {
    const params = new URLSearchParams({
        "filter[event_key][_eq]": eventKey,
        fields: "history_id,event_key,workflow_action,workflow_request_hash,remarks",
        limit: "1"
    });
    if (jobOrderId) params.set("filter[job_order_id][_eq]", String(jobOrderId));
    const payload = await directusRequest<{ data?: OperatorRosterAuditRecord[] }>(
        `/items/manufacturing_job_order_status_history?${params.toString()}`
    );
    return Array.isArray(payload?.data) ? payload.data[0] || null : null;
}

export async function recordOperatorRosterAudit(
    input: OperatorRosterAuditInput
): Promise<OperatorRosterAuditRecord> {
    const existing = await findOperatorRosterAudit(input.eventKey, input.jobOrderId);
    if (existing) return existing;

    const payload = await directusRequest<{ data?: OperatorRosterAuditRecord }>(
        "/items/manufacturing_job_order_status_history",
        {
            method: "POST",
            body: JSON.stringify({
                job_order_id: input.jobOrderId,
                old_status: input.oldStatus,
                new_status: input.newStatus,
                workflow_action: input.workflowAction,
                changed_by: input.changedBy,
                changed_at: input.changedAt || formatPhtDateTime(),
                event_key: input.eventKey,
                workflow_request_hash: input.workflowRequestHash,
                remarks: input.remarks
            })
        }
    );
    if (!payload?.data) {
        throw new Error("Directus returned no operator roster audit record.");
    }
    return payload.data;
}
