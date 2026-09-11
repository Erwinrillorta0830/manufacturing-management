import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../../directus-api";
import { getSessionUserId, requireSessionUserId } from "../../lot-transfers/_session";
import {
    JOB_ORDER_STATUS,
    isJobOrderStatus,
    normalizeJobOrderStatus
} from "@/modules/manufacturing-management/job-order-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobOrderRow = {
    job_order_id?: number | string;
    job_order_no?: string | null;
    branch_id?: number | string | null;
    status?: string | null;
};

type BranchRow = {
    id?: number | string;
    branch_name?: string | null;
    branch_code?: string | null;
    isActive?: number | boolean | string | null;
};

function positiveId(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function asActive(value: unknown): boolean {
    return value === true || value === 1 || value === "1";
}

async function readJson<T>(response: Response): Promise<T | null> {
    return response.json().catch(() => null) as Promise<T | null>;
}

async function loadJobOrder(identifier: unknown): Promise<JobOrderRow | null> {
    const rawIdentifier = String(identifier ?? "").trim();
    if (!rawIdentifier) return null;

    const numericIdentifier = positiveId(rawIdentifier);
    const url = numericIdentifier > 0
        ? `${DIRECTUS_URL}/items/manufacturing_job_orders/${encodeURIComponent(rawIdentifier)}?fields=job_order_id,job_order_no,branch_id,status`
        : `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(rawIdentifier)}&limit=1&fields=job_order_id,job_order_no,branch_id,status`;
    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) return null;
    const payload = await readJson<{ data?: JobOrderRow | JobOrderRow[] }>(response);
    const data = payload?.data;
    return Array.isArray(data) ? data[0] || null : data || null;
}

async function hasPostedJobOrderMovement(jobOrderId: number, jobOrderNo: string): Promise<boolean> {
    const filters = [
        `filter[source_document_id][_eq]=${encodeURIComponent(String(jobOrderId))}`,
        `filter[source_document_no][_eq]=${encodeURIComponent(jobOrderNo)}`
    ];
    for (const filter of filters) {
        const response = await fetch(
            `${DIRECTUS_URL}/items/inventory_movements?${filter}&filter[transaction_type_id][_in]=1,2&limit=1&fields=movement_id`,
            { headers, cache: "no-store" }
        );
        if (!response.ok) {
            throw new Error(`Unable to verify Job Order inventory movements (HTTP ${response.status}).`);
        }
        const payload = await readJson<{ data?: unknown[] }>(response);
        if (Array.isArray(payload?.data) && payload.data.length > 0) return true;
    }
    return false;
}

export async function POST(request: Request) {
    try {
        requireSessionUserId(await getSessionUserId(), "assign a Job Order branch");

        const body = await request.json().catch(() => null) as {
            jobOrderId?: unknown;
            joId?: unknown;
            branchId?: unknown;
        } | null;
        const jobOrderIdentifier = body?.jobOrderId ?? body?.joId;
        const requestedBranchId = positiveId(body?.branchId);
        if (!jobOrderIdentifier || requestedBranchId <= 0) {
            return NextResponse.json({ error: "A Job Order identifier and a valid branchId are required." }, { status: 400 });
        }

        const [jobOrder, branchResponse] = await Promise.all([
            loadJobOrder(jobOrderIdentifier),
            fetch(`${DIRECTUS_URL}/items/branches/${requestedBranchId}?fields=id,branch_name,branch_code,isActive`, { headers, cache: "no-store" })
        ]);
        if (!jobOrder) return NextResponse.json({ error: "Job Order was not found." }, { status: 404 });
        if (!branchResponse.ok) return NextResponse.json({ error: "The selected branch was not found or could not be loaded." }, { status: 404 });

        const branchPayload = await readJson<{ data?: BranchRow }>(branchResponse);
        const branch = branchPayload?.data;
        if (!branch || positiveId(branch.id) !== requestedBranchId || !asActive(branch.isActive)) {
            return NextResponse.json({ error: "The selected branch is not active." }, { status: 409 });
        }

        const jobOrderId = positiveId(jobOrder.job_order_id);
        if (jobOrderId <= 0) return NextResponse.json({ error: "The Job Order has no valid persisted ID." }, { status: 409 });
        const currentBranchId = positiveId(jobOrder.branch_id);
        if (currentBranchId === requestedBranchId) {
            return NextResponse.json({
                success: true,
                data: { jobOrderId, branchId: requestedBranchId, branchName: branch.branch_name || null }
            });
        }

        const status = normalizeJobOrderStatus(jobOrder.status);
        const canReassign = status !== null && isJobOrderStatus(
            status,
            JOB_ORDER_STATUS.DRAFT,
            JOB_ORDER_STATUS.PLANNED,
            JOB_ORDER_STATUS.PLANNING,
            JOB_ORDER_STATUS.RELEASED,
            JOB_ORDER_STATUS.PROCEED,
            JOB_ORDER_STATUS.SHORTAGE,
            JOB_ORDER_STATUS.RESERVED
        );
        if (!canReassign) {
            return NextResponse.json({ error: "The Job Order branch cannot be changed after production has started or the Job Order is closed." }, { status: 409 });
        }

        if (await hasPostedJobOrderMovement(jobOrderId, String(jobOrder.job_order_no || "").trim())) {
            return NextResponse.json({ error: "The Job Order branch cannot be changed after inventory movement has been posted." }, { status: 409 });
        }

        const updateResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ branch_id: requestedBranchId })
        });
        const updatePayload = await readJson<{ data?: JobOrderRow }>(updateResponse);
        if (!updateResponse.ok) {
            return NextResponse.json({ error: "The Job Order branch could not be updated.", details: updatePayload }, { status: updateResponse.status >= 400 && updateResponse.status < 500 ? updateResponse.status : 502 });
        }

        return NextResponse.json({
            success: true,
            data: {
                jobOrderId,
                branchId: requestedBranchId,
                branchName: branch.branch_name || null,
                jobOrder: updatePayload?.data || null
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to assign the Job Order branch.";
        const status = message.startsWith("An authenticated user") ? 401 : 502;
        console.error("job-order-branch POST error:", error);
        return NextResponse.json({ error: message }, { status });
    }
}
