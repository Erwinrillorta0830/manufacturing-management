// src/app/api/product-pricing/lookups/route.ts
import { NextRequest, NextResponse } from "next/server";

import {
    chunkArray,
    fetchAllPages,
    getChildProductIdsForParents,
    getSupplierProductIdsForSuppliers,
} from "../_directusPaging";
import { collectCascadeSets } from "../_lookupCascade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

const CATEGORIES = "categories";
const BRAND = "brand";
const UNITS = "units";
const SUPPLIERS = "suppliers";

const PRODUCTS = "products";

type DirectusCategory = {
    category_id?: number | string | null;
    category_name?: string | null;
};

type DirectusBrand = {
    brand_id?: number | string | null;
    brand_name?: string | null;
};

type DirectusUnit = {
    unit_id?: number | string | null;
    unit_name?: string | null;
    unit_shortcut?: string | null;
    order?: number | string | null;
};

type DirectusSupplier = {
    id?: number | string | null;
    supplier_name?: string | null;
    supplier_shortcut?: string | null;
    isActive?: number | string | boolean | null;
    nonBuy?: number | string | boolean | null;
};

type DirectusProductLookupRow = {
    product_id?: number | string | null;
    product_category?: DirectusCategory | null;
    product_brand?: DirectusBrand | null;
    unit_of_measurement?: DirectusUnit | null;
};

type JwtPayload = {
    sub?: string | number | null;
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

function safeCsvIds(v: string | null) {
    const s = String(v ?? "").trim();
    if (!s) return [];

    return s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .filter((x) => /^\d+$/.test(x));
}

function parseFieldsParam(v: string | null): Set<string> | null {
    const s = String(v ?? "").trim();
    if (!s) return null;

    return new Set(
        s
            .split(",")
            .map((x) => x.trim().toLowerCase())
            .filter(Boolean),
    );
}

async function fetchSuppliers() {
    return fetchAllPages<DirectusSupplier>(SUPPLIERS, () => {
        const params = new URLSearchParams();
        params.set("fields", "id,supplier_name,supplier_shortcut,isActive,nonBuy");
        params.set("sort", "supplier_name");
        params.set("filter[isActive][_eq]", "1");
        params.set("filter[nonBuy][_eq]", "0");
        params.set("filter[supplier_type][_eq]", "TRADE");
        return params;
    });
}

function safeInt(v: string | null) {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : 0;
}

async function collectSetsFromProducts(args: {
    productIds?: number[];
    categoryId?: number;
    brandId?: number;
}) {
    const { productIds, categoryId = 0, brandId = 0 } = args;

    const catSet = new Set<string>();
    const brandSet = new Set<string>();
    const unitSet = new Set<string>();

    const fields = [
        "product_id",
        "product_category.category_id",
        "product_category.category_name",
        "product_brand.brand_id",
        "product_brand.brand_name",
        "unit_of_measurement.unit_id",
        "unit_of_measurement.unit_name",
        "unit_of_measurement.unit_shortcut",
        "unit_of_measurement.order",
    ].join(",");

    const buildParams = (batch?: number[]) => {
        const params = new URLSearchParams();
        params.set("fields", fields);

        if (categoryId > 0) {
            params.set("filter[product_category][category_id][_eq]", String(categoryId));
        }
        if (brandId > 0) {
            params.set("filter[product_brand][brand_id][_eq]", String(brandId));
        }
        if (batch && batch.length > 0) {
            params.set("filter[product_id][_in]", batch.join(","));
        }

        return params;
    };

    const absorbProducts = (prods: DirectusProductLookupRow[]) => {
        for (const p of prods) {
            const c = p.product_category;
            const b = p.product_brand;
            const u = p.unit_of_measurement;

            if (c?.category_id != null) catSet.add(String(c.category_id));
            if (b?.brand_id != null) brandSet.add(String(b.brand_id));
            if (u?.unit_id != null) unitSet.add(String(u.unit_id));
        }
    };

    if (Array.isArray(productIds) && productIds.length > 0) {
        for (const batch of chunkArray(productIds, 300)) {
            const prods = await fetchAllPages<DirectusProductLookupRow>(PRODUCTS, () => buildParams(batch));
            absorbProducts(prods);
        }

        return { catSet, brandSet, unitSet };
    }

    const prods = await fetchAllPages<DirectusProductLookupRow>(PRODUCTS, () => buildParams());
    absorbProducts(prods);

    return { catSet, brandSet, unitSet };
}

export async function GET(req: NextRequest) {
    try {
        if (!DIRECTUS_URL) {
            return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE_URL is not set" }, { status: 500 });
        }

        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);

        const fieldsParam = parseFieldsParam(searchParams.get("fields"));
        const suppliersOnly =
            fieldsParam !== null &&
            fieldsParam.size === 1 &&
            fieldsParam.has("suppliers");

        if (suppliersOnly) {
            const suppliers = await fetchSuppliers();
            return NextResponse.json({
                data: { categories: [], brands: [], units: [], suppliers },
            });
        }

        const supplierIds = safeCsvIds(searchParams.get("supplier_ids"));
        const supplierScope = (searchParams.get("supplier_scope") || "ALL").toUpperCase();
        const categoryId = safeInt(searchParams.get("category_id"));
        const brandId = safeInt(searchParams.get("brand_id"));

        const [categoriesInitial, brandsInitial, unitsInitial, suppliers] = await Promise.all([
            fetchAllPages<DirectusCategory>(CATEGORIES, () => {
                const params = new URLSearchParams();
                params.set("fields", "category_id,category_name");
                params.set("sort", "category_name");
                return params;
            }),
            fetchAllPages<DirectusBrand>(BRAND, () => {
                const params = new URLSearchParams();
                params.set("fields", "brand_id,brand_name");
                params.set("sort", "brand_name");
                return params;
            }),
            fetchAllPages<DirectusUnit>(UNITS, () => {
                const params = new URLSearchParams();
                params.set("fields", "unit_id,unit_name,unit_shortcut,order");
                params.set("sort", "order,unit_name");
                return params;
            }),
            fetchSuppliers(),
        ]);

        let categories: DirectusCategory[] = categoriesInitial;
        let brands: DirectusBrand[] = brandsInitial;
        let units: DirectusUnit[] = unitsInitial;

        const shouldScopeBySupplier = supplierIds.length > 0 && supplierScope !== "ALL";

        let universeProductIds: number[] | null = null;

        if (shouldScopeBySupplier) {
            const directIds = await getSupplierProductIdsForSuppliers(supplierIds);

            if (directIds.length === 0) {
                return NextResponse.json({
                    data: { categories: [], brands: [], units: [], suppliers },
                });
            }

            const childIds = await getChildProductIdsForParents(directIds);
            universeProductIds = Array.from(new Set([...directIds, ...childIds]));
        }

        const needsCascade =
            (universeProductIds && universeProductIds.length > 0) || categoryId > 0 || brandId > 0;

        if (needsCascade) {
            const { catsResult, brandsResult, unitsResult } = await collectCascadeSets({
                productIds: universeProductIds ?? undefined,
                categoryId,
                brandId,
                runScan: (filter) =>
                    collectSetsFromProducts({
                        productIds: universeProductIds ?? undefined,
                        categoryId: filter.categoryId,
                        brandId: filter.brandId,
                    }),
            });

            categories = categories.filter((c) => catsResult.catSet.has(String(c.category_id)));
            brands = brands.filter((b) => brandsResult.brandSet.has(String(b.brand_id)));
            units = units.filter((u) => unitsResult.unitSet.has(String(u.unit_id)));
        }

        return NextResponse.json({
            data: { categories, brands, units, suppliers },
        });
    } catch (error: unknown) {
        return NextResponse.json(
            {
                error: "Unexpected error",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}
