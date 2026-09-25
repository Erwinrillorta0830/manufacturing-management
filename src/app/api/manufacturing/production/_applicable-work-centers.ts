import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export type ApplicableWorkCenterSource = "VERSION_ROUTING" | "JO_ROUTES" | "NONE";

export interface ApplicableWorkCenterResult {
    workCenterIds: number[];
    source: ApplicableWorkCenterSource;
}

export type ApplicableRouteWorkCenterSource = "VERSION_ROUTING" | "JO_ROUTES" | "NONE";

export interface ApplicableRouteWorkCenter {
    joRouteId: number;
    sequenceOrder: number;
    operationId: number | null;
    status: string | null;
    currentWorkCenterId: number | null;
    workCenterIds: number[];
    source: ApplicableRouteWorkCenterSource;
}

function distinctPositiveIds(rows: Array<Record<string, unknown>>): number[] {
    return [...new Set(rows
        .map((row) => Number(row.work_center_id))
        .filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function positiveId(value: unknown, keys: string[] = []): number {
    if (value === null || value === undefined) return 0;
    if (typeof value !== "object") {
        const id = Number(value);
        return Number.isSafeInteger(id) && id > 0 ? id : 0;
    }

    const record = value as Record<string, unknown>;
    for (const key of [...keys, "id"]) {
        const id = Number(record[key]);
        if (Number.isSafeInteger(id) && id > 0) return id;
    }
    return 0;
}

async function fetchRows(path: string, label: string): Promise<Array<Record<string, unknown>>> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, { headers, cache: "no-store" });
    if (!response.ok) {
        throw new Error(`${label} failed (${response.status}).`);
    }
    const body = await response.json().catch(() => null);
    const rows = body?.data;
    return Array.isArray(rows) ? rows : [];
}

/**
 * Resolves the work centers that may run a Job Order. The product version's
 * routing is authoritative (it is what Finished Goods Master -> Version
 * Management edits); the Job Order route snapshot is only a fallback for
 * versions that have no configured routing rows.
 */
export async function resolveApplicableWorkCenterIds(jobOrder: {
    job_order_id?: unknown;
    version_id?: unknown;
}): Promise<ApplicableWorkCenterResult> {
    const versionId = Number(jobOrder?.version_id);
    if (Number.isSafeInteger(versionId) && versionId > 0) {
        const rows = await fetchRows(
            `/items/manufacturing_routes?filter[version_id][_eq]=${versionId}&fields=work_center_id&limit=-1`,
            "Job Order version routing lookup"
        );
        const workCenterIds = distinctPositiveIds(rows);
        if (workCenterIds.length > 0) {
            return { workCenterIds, source: "VERSION_ROUTING" };
        }
    }

    const jobOrderId = Number(jobOrder?.job_order_id);
    if (Number.isSafeInteger(jobOrderId) && jobOrderId > 0) {
        const rows = await fetchRows(
            `/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderId}&fields=work_center_id&limit=-1`,
            "Job Order route station lookup"
        );
        const workCenterIds = distinctPositiveIds(rows);
        if (workCenterIds.length > 0) {
            return { workCenterIds, source: "JO_ROUTES" };
        }
    }

    return { workCenterIds: [], source: "NONE" };
}

/**
 * Resolves the workstation choices for each persisted JO route. The product
 * version routing is authoritative; the persisted route workstation is used
 * only when the master route is unavailable for legacy Job Orders.
 */
export async function resolveApplicableRouteWorkCenters(jobOrder: {
    job_order_id?: unknown;
    version_id?: unknown;
}): Promise<ApplicableRouteWorkCenter[]> {
    const jobOrderId = positiveId(jobOrder?.job_order_id, ["job_order_id"]);
    if (!jobOrderId) return [];

    const jobOrderRoutes = await fetchRows(
        `/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderId}&fields=jo_route_id,job_order_id,sequence_order,operation_id,routing_id,work_center_id,status&sort=sequence_order&limit=-1`,
        "Job Order route workstation lookup"
    );

    const versionId = positiveId(jobOrder?.version_id, ["version_id"]);
    const masterRoutes = versionId
        ? await fetchRows(
            `/items/manufacturing_routes?filter[version_id][_eq]=${versionId}&fields=route_id,version_id,sequence_order,operation_id,work_center_id&limit=-1`,
            "Job Order version route workstation lookup"
        )
        : [];

    return jobOrderRoutes.map((route) => {
        const joRouteId = positiveId(route.jo_route_id, ["jo_route_id"])
            || positiveId(route.id);
        const routingId = positiveId(route.routing_id, ["routing_id", "route_id"]);
        const sequenceOrder = Number(route.sequence_order || 0);
        const operationId = positiveId(route.operation_id, ["operation_id"]);
        const currentWorkCenterId = positiveId(route.work_center_id, ["work_center_id"]) || null;
        const masterRoute = masterRoutes.find((candidate) => {
            const candidateId = positiveId(candidate.route_id, ["route_id", "routing_id"]);
            return (routingId > 0 && candidateId === routingId)
                || (
                    Number(candidate.sequence_order || 0) === sequenceOrder
                    && positiveId(candidate.operation_id, ["operation_id"]) === operationId
                );
        });
        const masterWorkCenterId = positiveId(masterRoute?.work_center_id, ["work_center_id"]);
        const source: ApplicableRouteWorkCenterSource = masterWorkCenterId > 0
            ? "VERSION_ROUTING"
            : currentWorkCenterId
                ? "JO_ROUTES"
                : "NONE";

        return {
            joRouteId,
            sequenceOrder,
            operationId: operationId || null,
            status: route.status === undefined || route.status === null ? null : String(route.status),
            currentWorkCenterId,
            workCenterIds: masterWorkCenterId > 0
                ? [masterWorkCenterId]
                : currentWorkCenterId
                    ? [currentWorkCenterId]
                    : [],
            source
        };
    }).filter((route) => route.joRouteId > 0);
}
