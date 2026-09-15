import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export type ApplicableWorkCenterSource = "VERSION_ROUTING" | "JO_ROUTES" | "NONE";

export interface ApplicableWorkCenterResult {
    workCenterIds: number[];
    source: ApplicableWorkCenterSource;
}

function distinctPositiveIds(rows: Array<Record<string, unknown>>): number[] {
    return [...new Set(rows
        .map((row) => Number(row.work_center_id))
        .filter((id) => Number.isSafeInteger(id) && id > 0))];
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
 * Resolves the work stations that may run a Job Order. The product version's
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
