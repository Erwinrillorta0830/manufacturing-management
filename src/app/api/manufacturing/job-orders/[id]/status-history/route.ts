export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { authorizeJobOrderModuleAccess, JOB_ORDER_MODULE_PATHS } from "@/app/api/manufacturing/job-orders/_module-access";

type DirectusRecord = Record<string, unknown>;

function isRecord(value: unknown): value is DirectusRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

const STATUS_HISTORY_FIELDS = [
    "history_id",
    "job_order_id",
    "old_status",
    "new_status",
    "changed_by",
    "changed_at",
    "remarks",
    "workflow_action",
    "work_center_id",
    "jo_route_id",
    "reported_yield_quantity",
    "evidence_image_id"
].join(",");

const LEGACY_STATUS_HISTORY_FIELDS = [
    "history_id",
    "job_order_id",
    "old_status",
    "new_status",
    "changed_by",
    "changed_at",
    "remarks"
].join(",");

class DirectusRequestError extends Error {
    constructor(public readonly status: number, public readonly responseBody: string) {
        super(`Job Order status-history lookup failed with HTTP ${status}`);
        this.name = "DirectusRequestError";
    }
}

function positiveId(value: unknown): number | null {
    const raw = isRecord(value)
        ? value.work_center_id ?? value.id
        : value;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseLegacyWorkCenterRemark(remarks: unknown): { workCenterId: number; workCenterName: string | null } | null {
    if (typeof remarks !== "string") return null;
    const match = remarks.match(/^\s*Station Start Scanner:\s*.*?Work Center\s+"([^"]+)"\s+\(ID:\s*(\d+)\)\s*$/i);
    const workCenterId = positiveId(match?.[2]);
    if (!match || !workCenterId) return null;
    return { workCenterId, workCenterName: match[1].trim() || null };
}

function historyUrl(fields: string, jobOrderId: number): string {
    const params = new URLSearchParams({
        limit: "-1",
        sort: "-changed_at",
        fields,
        "filter[job_order_id][_eq]": String(jobOrderId)
    });
    return `${DIRECTUS_URL}/items/manufacturing_job_order_status_history?${params.toString()}`;
}

async function directusRows(url: string): Promise<DirectusRecord[]> {
    const response = await fetch(url, { headers, cache: "no-store" });
    const responseBody = await response.text();
    let payload: unknown = null;
    try {
        payload = responseBody ? JSON.parse(responseBody) : null;
    } catch {
        payload = null;
    }
    const rows = isRecord(payload) ? payload.data : null;
    if (!response.ok || !Array.isArray(rows)) {
        throw new DirectusRequestError(response.status, responseBody);
    }
    return rows.filter(isRecord);
}

async function fetchHistoryRows(jobOrderId: number): Promise<DirectusRecord[]> {
    try {
        return await directusRows(historyUrl(STATUS_HISTORY_FIELDS, jobOrderId));
    } catch (error) {
        const canUseLegacyProjection = error instanceof DirectusRequestError
            && [400, 403].includes(error.status)
            && /work_center_id|field|permission|does not exist/i.test(error.responseBody);
        if (!canUseLegacyProjection) throw error;
        return directusRows(historyUrl(LEGACY_STATUS_HISTORY_FIELDS, jobOrderId));
    }
}

async function fetchOptionalRows(path: string): Promise<DirectusRecord[]> {
    try {
        const response = await fetch(`${DIRECTUS_URL}${path}`, { headers, cache: "no-store" });
        if (!response.ok) return [];
        const payload: unknown = await response.json().catch(() => null);
        const rows = isRecord(payload) ? payload.data : null;
        return Array.isArray(rows) ? rows.filter(isRecord) : [];
    } catch {
        return [];
    }
}

function enrichHistoryRecord(record: DirectusRecord, userMap: Map<number, string>, workCenterMap: Map<number, string>) {
    const persistedWorkCenterId = positiveId(record?.work_center_id);
    const legacyStation = persistedWorkCenterId ? null : parseLegacyWorkCenterRemark(record?.remarks);
    const workCenterId = persistedWorkCenterId || legacyStation?.workCenterId || null;
    const workCenterName = workCenterId
        ? workCenterMap.get(workCenterId) || legacyStation?.workCenterName || `Station #${workCenterId}`
        : "Unassigned";
    return {
        ...record,
        work_center_id: workCenterId,
        previous_status: record.previous_status ?? record.old_status ?? null,
        status: record.status ?? record.new_status ?? "",
        changed_by_name: userMap.get(Number(record.changed_by))
            || (record.changed_by ? `User #${record.changed_by}` : "System"),
        work_center_name: workCenterName
    };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    const accessDenied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.production);
    if (accessDenied) return accessDenied;

    const { id: rawId } = await context.params;
    const jobOrderId = positiveId(rawId);
    if (!jobOrderId) {
        return NextResponse.json({ success: false, error: "A valid Job Order ID is required." }, { status: 400 });
    }

    try {
        const [historyRows, users, workCenters] = await Promise.all([
            fetchHistoryRows(jobOrderId).catch((error) => {
                console.error("Error fetching Job Order status history:", error);
                return [];
            }),
            fetchOptionalRows("/items/user?limit=-1&fields=user_id,user_fname,user_lname"),
            fetchOptionalRows("/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name")
        ]);

        const userMap = new Map<number, string>();
        users.forEach((user) => {
            const name = [user.user_fname, user.user_lname].filter(Boolean).join(" ") || `User #${user.user_id}`;
            userMap.set(Number(user.user_id), name);
        });
        const workCenterMap = new Map<number, string>();
        workCenters.forEach((workCenter) => {
            workCenterMap.set(Number(workCenter.work_center_id), String(workCenter.work_center_name ?? ""));
        });

        const data = historyRows.map((row) => enrichHistoryRecord(row, userMap, workCenterMap));
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Error loading Job Order status history:", error);
        return NextResponse.json({ success: false, error: "Job Order status history is temporarily unavailable." }, { status: 502 });
    }
}
