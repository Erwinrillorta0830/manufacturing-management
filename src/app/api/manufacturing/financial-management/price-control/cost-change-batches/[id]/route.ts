import { NextRequest, NextResponse } from "next/server";

import {
    CostDetailRow,
    approveCostBatch,
    decodeUserIdFromJwtCookie,
    directusErrorResponse,
    getCostDetails,
    getCostHeader,
    getSupplierNamesByProductId,
    fetchUserNamesById,
    isRecord,
    normalizeCostHeaderId,
    normalizeCostProductId,
    normalizeEffectiveAt,
    pickId,
    rejectCostBatch,
    resolveBatchDecisionUserNames,
    resolveUserDisplayName,
} from "../_batch";
import {
    approveUnifiedBatch,
    isUnifiedBatchDetectionError,
    rejectUnifiedBatch,
    resolveUnifiedBatchKind,
} from "../../_unifiedBatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ id: string }>;
};

function productLabel(value: unknown) {
    if (!isRecord(value)) return "";
    return String(value.product_name ?? value.product_code ?? "").trim();
}

function productCode(value: unknown) {
    return isRecord(value) ? String(value.product_code ?? "").trim() : "";
}

function userIdOf(value: unknown): number | string | null {
    if (isRecord(value)) {
        return pickId(value.user_id) ?? pickId(value.id);
    }
    return pickId(value);
}

function userNameOf(value: unknown): string | null {
    if (!isRecord(value)) return null;

    const fullName = [value.user_fname, value.user_mname, value.user_lname]
        .map((part) => String(part ?? "").trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

    if (fullName) return fullName;

    const email = String(value.user_email ?? "").trim();
    return email || null;
}

function productUomLabel(value: unknown): string {
    if (!isRecord(value)) return "";
    const uom = value.unit_of_measurement;
    if (!isRecord(uom)) return "";
    return String(uom.unit_shortcut ?? uom.unit_name ?? "").trim();
}

function mapDetail(line: CostDetailRow) {
    const current = line.current_cost === null || line.current_cost === undefined ? null : Number(line.current_cost);
    const proposed = Number(line.proposed_cost);
    const delta = Number.isFinite(proposed) && current !== null && Number.isFinite(current) ? proposed - current : null;
    const percentChange = delta !== null && current !== null && current !== 0 ? (delta / current) * 100 : null;

    return {
        request_id: pickId(line.request_id),
        product_id: normalizeCostProductId(line),
        product_name: productLabel(line.product_id),
        product_code: productCode(line.product_id),
        current_cost: Number.isFinite(current) ? current : null,
        proposed_cost: Number.isFinite(proposed) ? proposed : null,
        delta,
        percent_change: percentChange,
        unit_name: productUomLabel(line.product_id),
        status: line.status ?? "PENDING",
    };
}

export async function GET(req: NextRequest, context: RouteContext) {
    try {
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await context.params;
        const headerId = Number(id);
        if (!Number.isFinite(headerId) || headerId <= 0) {
            return NextResponse.json({ error: "Invalid cost batch id" }, { status: 400 });
        }

        const header = await getCostHeader(headerId);
        if (!header) return NextResponse.json({ error: "Cost batch not found" }, { status: 404 });

        const details = await getCostDetails(headerId);

        const detailProductIds = details
            .map((line) => normalizeCostProductId(line))
            .filter((id) => id > 0);
        const supplierByProductId = await getSupplierNamesByProductId(detailProductIds);
        const { approved_by_name, rejected_by_name } = await resolveBatchDecisionUserNames(header);
        const detailRequester = details.find((line) => userIdOf(line.requested_by) !== null)?.requested_by ?? null;
        const requestedBy = header.requested_by ?? detailRequester;
        const requestedById = userIdOf(requestedBy);
        const requesterNamesById = await fetchUserNamesById([requestedById]);
        const requested_by_name = userNameOf(requestedBy) ?? resolveUserDisplayName(requestedById, requesterNamesById);

        return NextResponse.json({
            data: {
                id: normalizeCostHeaderId(header),
                header_id: normalizeCostHeaderId(header),
                reference_no: header.reference_no ?? "",
                remarks: header.remarks ?? "",
                status: header.status ?? "PENDING",
                requested_by: requestedById,
                requested_by_name,
                requested_at: header.requested_at ?? null,
                approved_by: header.approved_by ?? null,
                approved_at: header.approved_at ?? null,
                approved_by_name,
                rejected_by: header.rejected_by ?? null,
                rejected_at: header.rejected_at ?? null,
                rejected_by_name,
                reject_reason: header.reject_reason ?? null,
                effective_at: header.effective_at ?? null,
                application_status: header.application_status ?? null,
                applied_at: header.applied_at ?? null,
                applied_by: header.applied_by ?? null,
                details: details.map((line) => {
                    const pid = normalizeCostProductId(line);
                    return {
                        ...mapDetail(line),
                        supplier_name: supplierByProductId.get(pid) ?? null,
                        effective_at: line.effective_at ?? null,
                        application_status: line.application_status ?? null,
                        applied_at: line.applied_at ?? null,
                        applied_by: line.applied_by ?? null,
                    };
                }),
            },
        });
    } catch (error: unknown) {
        return directusErrorResponse(error);
    }
}

export async function POST(req: NextRequest, context: RouteContext) {
    try {
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await context.params;
        const headerId = Number(id);
        if (!Number.isFinite(headerId) || headerId <= 0) {
            return NextResponse.json({ error: "Invalid cost batch id" }, { status: 400 });
        }

        const body = (await req.json().catch(() => ({}))) as Partial<{
            action: string;
            reject_reason: string;
            effective_at: string | null;
        }>;
        const action = String(body.action ?? "").trim().toLowerCase();

        if (action === "approve" || action === "reject") {
            const batchKind = await resolveUnifiedBatchKind(headerId);
            if (batchKind === "mixed") {
                if (action === "approve") {
                    const result = await approveUnifiedBatch(headerId, userId, normalizeEffectiveAt(body.effective_at));
                    if ("status" in result) return NextResponse.json({ error: result.error }, { status: result.status });
                    return NextResponse.json(result, { status: result.failed > 0 || result.retryable ? 202 : 200 });
                }

                if (action === "reject") {
                    const rejectReason = String(body.reject_reason ?? "").trim();
                    if (!rejectReason) {
                        return NextResponse.json({ error: "reject_reason is required" }, { status: 400 });
                    }
                    const result = await rejectUnifiedBatch(headerId, userId, rejectReason);
                    if ("status" in result) return NextResponse.json({ error: result.error }, { status: result.status });
                    return NextResponse.json(result);
                }
            }
        }

        if (action === "approve") {
            return approveCostBatch(headerId, userId, normalizeEffectiveAt(body.effective_at));
        }

        if (action === "reject") {
            const rejectReason = String(body.reject_reason ?? "").trim();
            if (!rejectReason) {
                return NextResponse.json({ error: "reject_reason is required" }, { status: 400 });
            }
            return rejectCostBatch(headerId, userId, rejectReason);
        }

        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    } catch (error: unknown) {
        if (isUnifiedBatchDetectionError(error)) {
            console.error("[costChangeBatch] Mixed-batch detection failed", error.originalError);
            return NextResponse.json(
                { error: error.message, code: error.code, retryable: error.retryable },
                { status: error.status },
            );
        }
        return directusErrorResponse(error);
    }
}
