export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    computeJobOrderMaterialReturns,
    fetchJobOrder,
    resolveJobOrderProductName,
    JobOrderCancellationError
} from "@/app/api/manufacturing/production/_material-return";
import { isJobOrderStatus, isTerminalJobOrderStatus, JOB_ORDER_STATUS } from "@/modules/manufacturing-management/job-order-status";
import { materialReturnFingerprint, signMaterialReturnToken } from "./_token";

const CANDIDATE_LIMIT = 50;

type RawRecord = Record<string, unknown>;

function num(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

async function directusGet<T>(path: string, label: string): Promise<T> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, { headers, cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Failed to ${label}: HTTP ${response.status}`);
    }
    const payload = await response.json().catch(() => ({}));
    return (payload?.data ?? payload) as T;
}

async function loadProductNames(productIds: number[]): Promise<Map<number, string>> {
    if (productIds.length === 0) return new Map();
    const rows = await directusGet<RawRecord[]>(
        `/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,description&limit=-1`,
        "load return candidate products"
    ).catch(() => [] as RawRecord[]);
    return new Map(rows.map((row) => [num(row.product_id), String(row.description || row.product_name || `Product #${num(row.product_id)}`)]));
}

async function listPendingReturns() {
    const jobs = await directusGet<RawRecord[]>(
        `/items/manufacturing_job_orders?filter[status][_in]=${encodeURIComponent("On Hold,QA Hold,ON_HOLD,QA_HOLD")}&fields=job_order_id,job_order_no,product_id,status&limit=-1`,
        "load halted Job Orders"
    );
    const candidates = jobs
        .filter((job) => isJobOrderStatus(job.status, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD))
        .sort((a, b) => num(b.job_order_id) - num(a.job_order_id))
        .slice(0, CANDIDATE_LIMIT);
    const productNames = await loadProductNames([...new Set(candidates.map((job) => num(job.product_id)).filter(Boolean))]);

    const rows = [];
    for (const job of candidates) {
        const jobOrder = await fetchJobOrder(String(num(job.job_order_id)));
        const computed = await computeJobOrderMaterialReturns(jobOrder);
        rows.push({
            jobOrderId: jobOrder.jobOrderId,
            jobOrderNo: jobOrder.jobOrderNo,
            status: jobOrder.status,
            productId: jobOrder.productId,
            productName: productNames.get(jobOrder.productId) || `Product #${jobOrder.productId}`,
            returnableQuantity: computed.totals.returnableQuantity,
            reconciliationError: computed.reconciliationError,
            requiresDestination: computed.lines.some((line) => line.requiresLotSelection)
        });
    }
    return rows.filter((row) => row.returnableQuantity > 0 || row.reconciliationError);
}

async function listCompletedLeftovers() {
    const reservationFilter = encodeURIComponent(JSON.stringify({
        _and: [
            { staged_quantity: { _gt: 0 } },
            { _or: [
                { reservation_status: { _neq: "RELEASED" } },
                { reservation_status: { _null: true } }
            ] }
        ]
    }));
    const reservations = await directusGet<RawRecord[]>(
        `/items/manufacturing_job_order_materials_reservations?filter=${reservationFilter}&fields=jo_material_id&limit=-1`,
        "load staged reservations with leftovers"
    );
    const materialIds = [...new Set(reservations.map((row) => num(row.jo_material_id)).filter(Boolean))];
    if (materialIds.length === 0) return [];
    const materials = await directusGet<RawRecord[]>(
        `/items/manufacturing_job_order_materials?filter[jo_material_id][_in]=${materialIds.join(",")}&fields=jo_material_id,job_order_id&limit=-1`,
        "load leftover Job Order materials"
    );
    const jobOrderIds = [...new Set(materials.map((row) => num(row.job_order_id)).filter(Boolean))];
    if (jobOrderIds.length === 0) return [];
    const jobs = await directusGet<RawRecord[]>(
        `/items/manufacturing_job_orders?filter[job_order_id][_in]=${jobOrderIds.join(",")}&fields=job_order_id,job_order_no,product_id,status&limit=-1`,
        "load leftover Job Order statuses"
    );
    const terminalJobs = jobs
        .filter((job) => isTerminalJobOrderStatus(job.status))
        .sort((a, b) => num(b.job_order_id) - num(a.job_order_id))
        .slice(0, CANDIDATE_LIMIT);
    const productNames = await loadProductNames([...new Set(terminalJobs.map((job) => num(job.product_id)).filter(Boolean))]);

    return terminalJobs.map((job) => ({
        jobOrderId: num(job.job_order_id),
        jobOrderNo: String(job.job_order_no || `JO-${num(job.job_order_id)}`),
        status: String(job.status || ""),
        productId: num(job.product_id),
        productName: productNames.get(num(job.product_id)) || `Product #${num(job.product_id)}`,
        returnableQuantity: null,
        reconciliationError: null,
        requiresDestination: false
    }));
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = (searchParams.get("joId") || "").trim();
        const scope = (searchParams.get("scope") || "").trim().toLowerCase();

        if (joId) {
            const jobOrder = await fetchJobOrder(joId);
            const computed = await computeJobOrderMaterialReturns(jobOrder);
            const productName = await resolveJobOrderProductName(jobOrder.productId);
            const fingerprint = materialReturnFingerprint(jobOrder.jobOrderId, computed.lines);
            return NextResponse.json({
                success: true,
                data: {
                    jobOrderId: jobOrder.jobOrderId,
                    jobOrderNo: jobOrder.jobOrderNo,
                    productId: jobOrder.productId,
                    productName,
                    branchId: jobOrder.branchId,
                    status: jobOrder.status,
                    reconciliationError: computed.reconciliationError,
                    totals: computed.totals,
                    lines: computed.lines,
                    canReturn: computed.totals.returnableQuantity > 0 && !computed.reconciliationError,
                    requiresDestination: computed.lines.some((line) => line.requiresLotSelection),
                    previewToken: signMaterialReturnToken(jobOrder.jobOrderId, fingerprint)
                }
            });
        }

        if (scope === "pending") {
            return NextResponse.json({ success: true, data: await listPendingReturns() });
        }
        if (scope === "completed") {
            return NextResponse.json({ success: true, data: await listCompletedLeftovers() });
        }

        return NextResponse.json({ error: "Provide a joId or a scope of pending/completed." }, { status: 400 });
    } catch (error) {
        if (error instanceof JobOrderCancellationError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
        }
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load material returns." }, { status: 502 });
    }
}
