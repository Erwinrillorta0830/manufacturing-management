import { NextRequest, NextResponse } from "next/server";

import { parseApprovalSearchQuery } from "../_approvalSearch";
import { toInclusiveDateToEnd } from "../_dateFilters";
import { appendDisplayStatusFilter } from "../_approvalStatusPolicy";
import { fetchPendingPcrByProductIds } from "../_fetchPendingByProductIds";
import { appendProductIdInFilter, getSupplierScopedProductIdsForSuppliers, resolveSupplierIds } from "../_supplierFilters";
import { enrichPcrRows } from "../_pcrHeaderMeta";
import { fetchUserNamesById } from "../price-change-batches/_batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const PCR = "price_change_requests";
const DEPRECATED_PRICE_REQUEST_MESSAGE =
    "Item-level price change requests are deprecated. Use price change batches instead.";

type DirectusMeta = {
    total_count?: number;
};

type DirectusUomRef = {
    unit_id?: number | string | null;
    unit_name?: string | null;
    unit_shortcut?: string | null;
};

type DirectusPCRRow = {
    request_id?: number | string | null;
    header_id?:
        | number
        | string
        | {
        header_id?: number | string | null;
        id?: number | string | null;
        remarks?: string | null;
        reference_no?: string | null;
        status?: string | null;
    }
        | null;
    current_price?: number | string | null;
    product_id?:
        | number
        | string
        | {
        product_id?: number | string | null;
        product_code?: string | null;
        product_name?: string | null;
        unit_of_measurement?: DirectusUomRef | number | string | null;
    }
        | null;
    price_type_id?:
        | number
        | string
        | {
        price_type_id?: number | string | null;
        price_type_name?: string | null;
    }
        | null;
    proposed_price?: number | string | null;
    status?: string | null;
    requested_by?: number | string | null;
    requested_by_name?: string | null;
    requested_at?: string | null;
    approved_by?: number | string | null;
    approved_at?: string | null;
    rejected_by?: number | string | null;
    rejected_at?: string | null;
    reject_reason?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
    applied_at?: string | null;
    applied_by?: number | string | null;
};

type DirectusListPCRResponse = {
    data: DirectusPCRRow[];
    meta?: DirectusMeta;
};

type JwtPayload = {
    sub?: string | number | null;
};

type DirectusWrappedError = {
    message: string;
    status: number;
    url: string;
    body: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function mustBase() {
    if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set.");
    return DIRECTUS_URL;
}

function directusToken() {
    return process.env.DIRECTUS_STATIC_TOKEN || process.env.DIRECTUS_SERVICE_TOKEN || "";
}

function directusHeaders() {
    const token = directusToken();
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
}

async function fetchDirectus<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { cache: "no-store", ...init });
    const text = await res.text().catch(() => "");

    if (!res.ok) {
        throw new Error(
            JSON.stringify({
                message: "Directus request failed",
                status: res.status,
                url,
                body: text,
            } satisfies DirectusWrappedError),
        );
    }

    return text ? (JSON.parse(text) as T) : ({} as T);
}

function decodeUserIdFromJwtCookie(req: NextRequest, cookieName = "vos_access_token") {
    const token = req.cookies.get(cookieName)?.value;
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length < 2) return null;

    try {
        const payloadPart = parts[1];
        const pad = "=".repeat((4 - (payloadPart.length % 4)) % 4);
        const b64 = (payloadPart + pad).replace(/-/g, "+").replace(/_/g, "/");
        const jsonStr = Buffer.from(b64, "base64").toString("utf8");
        const payloadUnknown: unknown = JSON.parse(jsonStr);

        if (!isRecord(payloadUnknown)) return null;

        const payload = payloadUnknown as JwtPayload;
        const userId = Number(payload.sub);
        return Number.isFinite(userId) ? userId : null;
    } catch {
        return null;
    }
}

function norm(v: string | null) {
    const s = String(v ?? "").trim();
    if (!s || s === "undefined" || s === "null") return "";
    return s;
}

function unwrapErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function parseProductIdsParam(raw: string | null): number[] | null {
    if (raw === null) return null;
    const ids = raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    return ids;
}

function parseWrappedError(message: string): DirectusWrappedError | null {
    try {
        const parsed: unknown = JSON.parse(message);
        if (!isRecord(parsed)) return null;

        const status = Number(parsed.status);
        const url = typeof parsed.url === "string" ? parsed.url : "";
        const body = typeof parsed.body === "string" ? parsed.body : "";
        const parsedMessage = typeof parsed.message === "string" ? parsed.message : "Directus request failed";

        if (!Number.isFinite(status) || !url) return null;

        return {
            message: parsedMessage,
            status,
            url,
            body,
        };
    } catch {
        return null;
    }
}

async function addRequestedByNames(rows: DirectusPCRRow[]): Promise<DirectusPCRRow[]> {
    const namesById = await fetchUserNamesById(rows.map((row) => row.requested_by));

    return rows.map((row) => {
        const requestedBy = Number(row.requested_by);
        return {
            ...row,
            requested_by_name:
                Number.isFinite(requestedBy) && requestedBy > 0
                    ? namesById.get(requestedBy) ?? null
                    : null,
        };
    });
}

export async function GET(req: NextRequest) {
    try {
        mustBase();
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);

        const status = norm(searchParams.get("status"));
        const q = norm(searchParams.get("q"));
        const product_id = norm(searchParams.get("product_id"));
        const price_type_id = norm(searchParams.get("price_type_id"));
        const requested_by = norm(searchParams.get("requested_by"));
        const supplier_ids = resolveSupplierIds(searchParams);
        const date_from = norm(searchParams.get("date_from"));
        const date_to = norm(searchParams.get("date_to"));
        const productIds = parseProductIdsParam(searchParams.get("product_ids"));

        if (productIds !== null) {
            if (productIds.length === 0) {
                return NextResponse.json({ data: [] });
            }

            const data = await fetchPendingPcrByProductIds(productIds, status);
            return NextResponse.json({ data });
        }

        const limit = norm(searchParams.get("limit"));
        const useAllRows = limit === "-1";
        const page = Math.max(1, Number(searchParams.get("page") ?? 1));

        const params = new URLSearchParams();
        if (useAllRows) {
            params.set("limit", "-1");
            params.set("offset", "0");
        } else {
            const page_size = Math.min(100, Math.max(10, Number(searchParams.get("page_size") ?? 50)));
            const offset = (page - 1) * page_size;
            params.set("limit", String(page_size));
            params.set("offset", String(offset));
        }
        params.set("meta", "total_count");
        params.set("sort", "-requested_at");

        params.set(
            "fields",
            [
                "request_id",
                "product_id",
                "price_type_id",
                "proposed_price",
                "status",
                "requested_by",
                "requested_at",
                "approved_by",
                "approved_at",
                "rejected_by",
                "rejected_at",
                "reject_reason",
                "effective_at",
                "application_status",
                "applied_at",
                "applied_by",
                "header_id",
                "header_id.header_id",
                "header_id.remarks",
                "header_id.reference_no",
                "header_id.status",
                "current_price",
                "product_id.product_id",
                "product_id.product_code",
                "product_id.product_name",
                "product_id.barcode",
                "product_id.unit_of_measurement.unit_id",
                "product_id.unit_of_measurement.unit_name",
                "product_id.unit_of_measurement.unit_shortcut",
                "product_id.cost_per_unit",
                "price_type_id.price_type_id",
                "price_type_id.price_type_name",
            ].join(","),
        );

        let andIdx = 0;
        const addAnd = (suffix: string, value: string) => {
            params.set(`filter[_and][${andIdx}]${suffix}`, value);
            andIdx += 1;
        };

        andIdx = appendDisplayStatusFilter(params, andIdx, status);
        if (product_id) addAnd("[product_id][_eq]", product_id);
        if (price_type_id) addAnd("[price_type_id][_eq]", price_type_id);
        if (requested_by) addAnd("[requested_by][_eq]", requested_by);
        if (date_from) addAnd("[requested_at][_gte]", date_from);
        if (date_to) addAnd("[requested_at][_lte]", toInclusiveDateToEnd(date_to));

        if (supplier_ids.length > 0) {
            const supplierProductIds = await getSupplierScopedProductIdsForSuppliers(supplier_ids);
            if (supplierProductIds.length === 0) {
                return NextResponse.json({ data: [], meta: { total_count: 0 } });
            }
            andIdx = appendProductIdInFilter(params, andIdx, supplierProductIds);
        }

        if (q) {
            const parsed = parseApprovalSearchQuery(q);
            const prefixedRequestId = parsed.numericId == null ? parsed.priceRequestId : null;

            if (prefixedRequestId != null) {
                addAnd("[request_id][_eq]", String(prefixedRequestId));
            } else if (parsed.textContains) {
                const searchIdx = andIdx;
                if (parsed.numericId != null) {
                    addAnd("[_or][0][request_id][_eq]", String(parsed.numericId));
                    params.set(`filter[_and][${searchIdx}][_or][1][product_id][product_name][_contains]`, parsed.textContains);
                    params.set(`filter[_and][${searchIdx}][_or][2][product_id][product_code][_contains]`, parsed.textContains);
                    params.set(`filter[_and][${searchIdx}][_or][3][product_id][barcode][_contains]`, parsed.textContains);
                } else {
                    addAnd("[_or][0][product_id][product_name][_contains]", parsed.textContains);
                    params.set(`filter[_and][${searchIdx}][_or][1][product_id][product_code][_contains]`, parsed.textContains);
                    params.set(`filter[_and][${searchIdx}][_or][2][product_id][barcode][_contains]`, parsed.textContains);
                }
            }
        }

        const url = `${mustBase()}/items/${PCR}?${params.toString()}`;
        const json = await fetchDirectus<DirectusListPCRResponse>(url, {
            headers: directusHeaders(),
        });

        const data = await addRequestedByNames(await enrichPcrRows(json.data ?? []));

        return NextResponse.json({
            data,
            meta: json.meta ?? null,
        });
    } catch (error: unknown) {
        const message = unwrapErrorMessage(error);
        const wrapped = parseWrappedError(message);

        if (wrapped) {
            return NextResponse.json(
                {
                    error: "Directus request failed",
                    directus_status: wrapped.status,
                    directus_url: wrapped.url,
                    directus_body: wrapped.body,
                },
                { status: 500 },
            );
        }

        return NextResponse.json({ error: "Unexpected error", details: message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        return NextResponse.json({ error: DEPRECATED_PRICE_REQUEST_MESSAGE }, { status: 410 });
    } catch (error: unknown) {
        const message = unwrapErrorMessage(error);
        const wrapped = parseWrappedError(message);

        if (wrapped) {
            return NextResponse.json(
                {
                    error: "Directus request failed",
                    directus_status: wrapped.status,
                    directus_url: wrapped.url,
                    directus_body: wrapped.body,
                },
                { status: 500 },
            );
        }

        return NextResponse.json({ error: "Unexpected error", details: message }, { status: 500 });
    }
}
