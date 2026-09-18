import { JobOrder, RouteOperatorRecord, RoutingTask, User } from "./types";

export type OperatorAssignmentMap = Record<string, number[]>;

function positiveId(value: unknown): number | null {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function normalizeOperatorAssignmentMap(value: unknown): OperatorAssignmentMap {
    let parsed = value;
    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return {};
        }
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const normalized: OperatorAssignmentMap = {};
    for (const [rawSequence, rawOperators] of Object.entries(parsed as Record<string, unknown>)) {
        const sequence = positiveId(rawSequence);
        if (!sequence || !Array.isArray(rawOperators)) continue;

        normalized[String(sequence)] = [...new Set(
            rawOperators
                .map((operator) => positiveId(operator))
                .filter((operatorId): operatorId is number => operatorId !== null)
        )].sort((left, right) => left - right);
    }
    return normalized;
}

export function getJobOrderOperatorAssignments(jobOrder: JobOrder | null | undefined): OperatorAssignmentMap {
    if (!jobOrder) return {};
    const rawAssignments = jobOrder.assigned_personnel !== undefined
        ? jobOrder.assigned_personnel
        : jobOrder.assignedPersonnel;
    return normalizeOperatorAssignmentMap(rawAssignments);
}

function userName(users: User[], userId: number): string {
    const user = users.find((candidate) => positiveId(candidate.user_id ?? candidate.id) === userId);
    if (!user) return `Operator #${userId}`;
    const firstName = user.user_fname || user.first_name || "";
    const lastName = user.user_lname || user.last_name || "";
    return `${firstName} ${lastName}`.trim() || `Operator #${userId}`;
}

function userPosition(users: User[], userId: number): string {
    const user = users.find((candidate) => positiveId(candidate.user_id ?? candidate.id) === userId);
    return user?.user_position || user?.position || "Operator";
}

function userRate(users: User[], userId: number): number {
    const user = users.find((candidate) => positiveId(candidate.user_id ?? candidate.id) === userId);
    const rate = Number(user?.hourly_rate ?? user?.rate ?? 150);
    return Number.isFinite(rate) && rate >= 0 ? rate : 150;
}

function isActive(record: RouteOperatorRecord): boolean {
    return record.is_active !== false;
}

function createDisplayPlaceholder(task: RoutingTask, userId: number, users: User[]): RouteOperatorRecord {
    return {
        // Placeholder IDs are never sent back to the API. A negative user ID
        // keeps them separate from persisted Directus records while remaining
        // stable for the route-level grouping logic.
        id: -userId,
        jo_id: task.jo_id,
        routing_id: Number(task.routing_id || 0),
        task_id: task.id,
        user_id: userId,
        started_at: null,
        stopped_at: null,
        actual_hours: 0,
        hourly_rate: userRate(users, userId),
        labor_cost: 0,
        is_active: true,
        is_placeholder: true,
        user_name: userName(users, userId),
        user_position: userPosition(users, userId)
    };
}

export function buildDisplayRouteOperatorRecords(
    task: RoutingTask,
    records: RouteOperatorRecord[],
    assignments: OperatorAssignmentMap,
    users: User[]
): RouteOperatorRecord[] {
    const activeRecords = records.filter(isActive);
    const sequenceKey = String(task.sequence_order);

    // A missing sequence key is retained as a legacy fallback. An explicit
    // empty array is authoritative and must not resurrect stale operators.
    if (!Object.prototype.hasOwnProperty.call(assignments, sequenceKey)) {
        return activeRecords;
    }

    const assignedIds = assignments[sequenceKey] || [];
    const assignedIdSet = new Set(assignedIds);
    const matchingRecords = activeRecords.filter((record) => assignedIdSet.has(Number(record.user_id)));
    const persistedIds = new Set(matchingRecords.map((record) => Number(record.user_id)));
    const placeholders = assignedIds
        .filter((userId) => !persistedIds.has(userId))
        .map((userId) => createDisplayPlaceholder(task, userId, users));

    return [...matchingRecords, ...placeholders];
}
