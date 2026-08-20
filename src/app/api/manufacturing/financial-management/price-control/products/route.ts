import { NextRequest, NextResponse } from "next/server";

import { parseProductCatalogQuery, parseProductIdsList } from "../_productCatalogQuery";
import {
    fetchPaginatedProductGroups,
    fetchProductsByIds,
    resolveSupplierScopedProductIds,
    type ProductRow,
} from "../_productGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type JwtPayload = {
    sub?: string | number | null;
};

type DirectusErrorShape = {
    message?: string;
    status?: number;
    url?: string;
    body?: string;
};

type ProductsMeta = {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    totalVariants: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
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
    const s = (v ?? "").trim();
    if (!s || s === "undefined" || s === "null") return "";
    return s;
}

function parseErrorMessage(message: string): DirectusErrorShape | null {
    try {
        const parsed: unknown = JSON.parse(message);
        return isRecord(parsed) ? (parsed as DirectusErrorShape) : null;
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    try {
        if (!DIRECTUS_URL) {
            return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE_URL is not set" }, { status: 500 });
        }

        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);

        const rawPageSize = norm(searchParams.get("page_size"));
        const requestedPageSize = rawPageSize ? Number(rawPageSize) : 50;
        if (Number.isFinite(requestedPageSize) && requestedPageSize > 500) {
            return NextResponse.json({ error: `page_size cannot exceed 500. Requested: ${requestedPageSize}` }, { status: 400 });
        }

        const activeOnly = norm(searchParams.get("active_only") || "1") === "1";
        const productIdsParam = parseProductIdsList(norm(searchParams.get("product_ids")));

        if (productIdsParam.length > 0) {
            const rows = await fetchProductsByIds(productIdsParam, activeOnly);
            return NextResponse.json({ data: rows, meta: { total: rows.length } });
        }

        const { filters, page, pageSize, supplierScope, supplierIdsRaw } =
            parseProductCatalogQuery(searchParams);

        const supplierProductIds = await resolveSupplierScopedProductIds({
            supplierScope,
            supplierIdsRaw,
        });

        if (supplierProductIds && supplierProductIds.length === 0) {
            const emptyMeta: ProductsMeta = {
                page,
                pageSize,
                total: 0,
                totalPages: 0,
                totalVariants: 0,
            };

            return NextResponse.json({ data: [], meta: emptyMeta });
        }

        const { pageGroups, totalGroups, totalVariants, safePage } = await fetchPaginatedProductGroups({
            page,
            pageSize,
            supplierProductIds,
            filters,
        });

        const totalPages = totalGroups > 0 ? Math.ceil(totalGroups / pageSize) : 0;

        const pageVariants: ProductRow[] = [];
        for (const group of pageGroups) {
            for (const variant of group.variants) {
                pageVariants.push({ ...variant, __group_id: group.group_id });
            }
        }

        const meta: ProductsMeta = {
            page: safePage,
            pageSize,
            total: totalGroups,
            totalPages,
            totalVariants,
        };

        return NextResponse.json({
            data: pageVariants,
            meta,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const parsed = parseErrorMessage(message);

        if (parsed) {
            return NextResponse.json(
                {
                    error: parsed.message ?? "Directus request failed",
                    directus_status: parsed.status,
                    directus_url: parsed.url,
                    directus_body: parsed.body,
                },
                { status: 500 },
            );
        }

        return NextResponse.json({ error: "Unexpected error", details: message }, { status: 500 });
    }
}
