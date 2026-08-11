import { NextRequest, NextResponse } from "next/server";

import { parseGroupIdsParam, parsePrintCatalogQuery } from "../../_printCatalog";
import { buildSupplierProductGroups, fetchCompleteVariantsForGroups } from "../../_productGroups";
import {
    PRINT_MATRIX_MAX_GROUP_IDS,
    assemblePrintMatrixRows,
    fetchPricesForProductIds,
    fetchServerPriceTypes,
    pivotPricesForAssembly,
} from "../../_printMatrix";

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

function parseErrorMessage(message: string): DirectusErrorShape | null {
    try {
        const parsed: unknown = JSON.parse(message);
        return isRecord(parsed) ? (parsed as DirectusErrorShape) : null;
    } catch {
        return null;
    }
}

function pickId(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest) {
    try {
        if (!DIRECTUS_URL) {
            return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE_URL is not set" }, { status: 500 });
        }

        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const step = (searchParams.get("step") ?? "meta").trim().toLowerCase();
        const catalog = parsePrintCatalogQuery(searchParams);

        if (step === "meta") {
            const { groups, totalVariants } = await buildSupplierProductGroups({
                supplierScope: catalog.supplierScope,
                supplierIdsRaw: catalog.supplierIdsRaw,
                filters: {
                    q: catalog.q,
                    categoryIds: catalog.categoryIds,
                    brandIds: catalog.brandIds,
                    unitIds: catalog.unitIds,
                    activeOnly: catalog.activeOnly,
                    missingTier: catalog.missingTier,
                },
            });

            const groupIds = groups.map((group) => group.group_id);

            return NextResponse.json({
                meta: {
                    totalGroups: groupIds.length,
                    totalVariants,
                },
                groupIds,
            });
        }

        if (step === "page") {
            const groupIds = parseGroupIdsParam(searchParams.get("group_ids"));
            if (groupIds.length === 0) {
                return NextResponse.json({ data: [], usedUnitIds: [] });
            }

            if (groupIds.length > PRINT_MATRIX_MAX_GROUP_IDS) {
                return NextResponse.json(
                    {
                        error: `Too many group_ids in one request (max ${PRINT_MATRIX_MAX_GROUP_IDS})`,
                    },
                    { status: 400 },
                );
            }

            const variantsByGroup = await fetchCompleteVariantsForGroups({
                groupIds,
                activeOnly: catalog.activeOnly ?? true,
                unitIds: catalog.unitIds,
            });

            const productIds: number[] = [];
            for (const variants of variantsByGroup.values()) {
                for (const variant of variants) {
                    const id = pickId(variant.product_id);
                    if (id) productIds.push(id);
                }
            }

            const uniqueProductIds = Array.from(new Set(productIds));
            const [priceTypes, priceRows] = await Promise.all([
                fetchServerPriceTypes(),
                fetchPricesForProductIds(uniqueProductIds),
            ]);

            const priceMap = pivotPricesForAssembly(priceTypes, priceRows);
            const { rows, usedUnitIds } = assemblePrintMatrixRows({
                groupIds,
                variantsByGroup,
                priceMap,
                priceTypes,
            });

            return NextResponse.json({
                data: rows,
                usedUnitIds,
            });
        }

        return NextResponse.json({ error: "Invalid step parameter" }, { status: 400 });
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
