import { NextRequest, NextResponse } from "next/server";

import { parseApprovalSearchQuery } from "../_approvalSearch";
import { toInclusiveDateToEnd } from "../_dateFilters";
import { appendBatchSuppliersFilter, resolveBatchSuppliersFilter, resolveSupplierIds } from "../_supplierFilters";
import {
    BatchDetailRow,
    BatchHeaderRow,
    BatchCreateLineInput,
    DETAILS,
    HEADERS,
    createPendingPriceBatch,
    decodeUserIdFromJwtCookie,
    directusErrorResponse,
    directusHeaders,
    fetchDirectus,
    mapBatchHeaderResponse,
    mustBase,
    normalizeBatchCreateLines,
    normalizeHeaderId,
} from "./_batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectusList<T> = { data?: T[]; meta?: { total_count?: number } | null };

function norm(value: string | null) {
    const text = String(value ?? "").trim();
    if (!text || text === "undefined" || text === "null") return "";
    return text;
}

async function countLines(headerId: number) {
    const params = new URLSearchParams();
    params.set("limit", "1");
    params.set("meta", "total_count");
    params.set("fields", "request_id");
    params.set("filter[header_id][_eq]", String(headerId));

    const url = `${mustBase()}/items/${DETAILS}?${params.toString()}`;
    const json = await fetchDirectus<DirectusList<BatchDetailRow>>(url, { headers: directusHeaders() });
    return Number(json.meta?.total_count ?? 0);
}

export async function GET(req: NextRequest) {
    try {
        mustBase();
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const status = norm(searchParams.get("status"));
        const supplierIds = resolveSupplierIds(searchParams);
        const q = norm(searchParams.get("q"));
        const dateFrom = norm(searchParams.get("date_from"));
        const dateTo = norm(searchParams.get("date_to"));
        const page = Math.max(1, Number(searchParams.get("page") ?? 1));
        const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("page_size") ?? 50)));
        const offset = (page - 1) * pageSize;

        const params = new URLSearchParams();
        params.set("limit", String(pageSize));
        params.set("offset", String(offset));
        params.set("meta", "total_count");
        params.set("sort", "-requested_at");
        params.set(
            "fields",
            [
                "header_id",
                "supplier_id",
                "supplier_id.id",
                "supplier_id.supplier_name",
                "supplier_id.supplier_shortcut",
                "supplier_id.isActive",
                "supplier_id.nonBuy",
                "reference_no",
                "remarks",
                "status",
                "requested_by",
                "requested_at",
                "approved_by",
                "approved_at",
                "rejected_by",
                "rejected_at",
                "reject_reason",
            ].join(","),
        );

        let andIdx = 0;
        const addAnd = (suffix: string, value: string) => {
            params.set(`filter[_and][${andIdx}]${suffix}`, value);
            andIdx += 1;
        };

        if (status) addAnd("[status][_eq]", status);
        if (supplierIds.length > 0) {
            const { headerIdsFromProducts } = await resolveBatchSuppliersFilter(supplierIds);
            andIdx = appendBatchSuppliersFilter(params, andIdx, supplierIds, headerIdsFromProducts);
        }
        if (dateFrom) addAnd("[requested_at][_gte]", dateFrom);
        if (dateTo) addAnd("[requested_at][_lte]", toInclusiveDateToEnd(dateTo));
        if (q) {
            const parsed = parseApprovalSearchQuery(q);
            const headerId = parsed.batchHeaderId ?? parsed.numericId;

            if (headerId != null) {
                addAnd("[header_id][_eq]", String(headerId));
            } else if (parsed.textContains) {
                addAnd("[_or][0][reference_no][_contains]", parsed.textContains);
                params.set(`filter[_and][${andIdx - 1}][_or][1][remarks][_contains]`, parsed.textContains);
            }
        }

        const url = `${mustBase()}/items/${HEADERS}?${params.toString()}`;
        const json = await fetchDirectus<DirectusList<BatchHeaderRow>>(url, { headers: directusHeaders() });

        const rows = await Promise.all(
            (json.data ?? []).map(async (row) => {
                const headerId = normalizeHeaderId(row);
                return mapBatchHeaderResponse(row, headerId ? await countLines(headerId) : 0);
            }),
        );

        return NextResponse.json({ data: rows, meta: json.meta ?? null });
    } catch (error: unknown) {
        return directusErrorResponse(error);
    }
}

export async function POST(req: NextRequest) {
    try {
        mustBase();
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await req.json()) as Partial<{
            reference_no: string;
            remarks: string;
            lines: BatchCreateLineInput[];
        }>;

        const lines = Array.isArray(body.lines) ? body.lines : [];
        const remarks = String(body.remarks ?? "").trim();
        const referenceNo = String(body.reference_no ?? "").trim();

        if (!remarks) {
            return NextResponse.json({ error: "remarks is required" }, { status: 400 });
        }
        if (lines.length === 0) {
            return NextResponse.json({ error: "lines must be a non-empty array" }, { status: 400 });
        }

        const plan = await normalizeBatchCreateLines(lines);

        if (plan.linesToCreate.length === 0) {
            return NextResponse.json(
                {
                    created: 0,
                    skipped_duplicates: plan.skippedDuplicates,
                    skipped_existing_pending: plan.skippedExistingPending,
                },
                { status: 200 },
            );
        }

        const result = await createPendingPriceBatch({
            userId,
            referenceNo,
            remarks,
            linesToCreate: plan.linesToCreate,
        });

        return NextResponse.json(
            {
                data: mapBatchHeaderResponse(result.headerRow, result.created),
                created: result.created,
                skipped_duplicates: plan.skippedDuplicates,
                skipped_existing_pending: plan.skippedExistingPending,
            },
            { status: 201 },
        );
    } catch (error: unknown) {
        return directusErrorResponse(error);
    }
}
