import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getLotTransferProductTypeLabel } from "@/modules/manufacturing-management/lot-transfer/product-type-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchProductTypeNames() {
    try {
        const response = await fetch(
            `${DIRECTUS_URL}/items/product_type?limit=-1&sort=id&fields=id,name`,
            { headers, cache: "no-store" }
        );
        if (!response.ok) return new Map<number, string>();
        const payload = (await response.json()) as { data?: unknown };
        const rows = Array.isArray(payload.data) ? payload.data : [];
        return new Map(
            rows.flatMap((row) => {
                if (!row || typeof row !== "object") return [];
                const record = row as Record<string, unknown>;
                const id = Number(record.id);
                const name = typeof record.name === "string" ? record.name.trim() : "";
                return Number.isSafeInteger(id) && id > 0 && name ? [[id, name] as const] : [];
            })
        );
    } catch (error) {
        console.warn("[ProductTracing BFF] Warning loading product type names:", error);
        return new Map<number, string>();
    }
}

/**
 * Returns ONLY parent products representing the smallest/base unit of measurement.
 * Child packaging units (boxes, cases, cartons, packs with uom_count > 1 or non-empty parent_id)
 * are strictly excluded.
 */
export async function GET() {
    try {
        const fields = [
            "product_id",
            "description",
            "product_name",
            "product_code",
            "barcode",
            "cost_per_unit",
            "price_per_unit",
            "estimated_unit_cost",
            "parent_id",
            "parent_id.product_id",
            "parent_id.id",
            "product_type",
            "product_type.*",
            "product_category.category_name",
            "unit_of_measurement.unit_id",
            "unit_of_measurement.unit_name",
            "unit_of_measurement.unit_shortcut",
            "unit_of_measurement_count"
        ].join(",");

        const url = `${DIRECTUS_URL}/items/products?limit=-1&fields=${fields}&filter[isActive][_eq]=1&sort=product_name&_t=${Date.now()}`;
        const res = await fetch(url, { headers, cache: "no-store" });

        if (!res.ok) {
            return NextResponse.json({ error: "Failed to fetch products" }, { status: res.status });
        }

        const json = await res.json();
        const rawList = json.data || [];
        const productTypeNames = await fetchProductTypeNames();

        const data = rawList
            .filter((p: Record<string, unknown>) => {
                const productId = Number(p.product_id ?? p.id ?? 0);
                if (!Number.isSafeInteger(productId) || productId <= 0) return false;

                // Parent product check: parent_id must be null, empty, 0, or equal to the product itself
                const rawParent = p.parent_id;
                const parentId = Number(
                    rawParent && typeof rawParent === "object"
                        ? (rawParent as Record<string, unknown>).product_id ?? (rawParent as Record<string, unknown>).id
                        : rawParent
                );

                if (Number.isSafeInteger(parentId) && parentId > 0 && parentId !== productId) {
                    return false;
                }

                // Smallest unit check: unit_of_measurement_count must be 1 (or empty/base)
                // Child packaging variants (e.g. Box with count 20, Carton with count 40) are excluded
                const uomCount = Number(p.unit_of_measurement_count ?? 1);
                if (Number.isFinite(uomCount) && uomCount > 1) {
                    return false;
                }

                return true;
            })
            .map((p: Record<string, unknown>) => {
                const productId = Number(p.product_id ?? p.id ?? 0);
                const desc = String(p.description || "").trim();
                const pName = String(p.product_name || p.name || p.title || "").trim();
                const productName = desc || pName || `Product #${productId}`;
                const skuCode = String(p.product_code || p.barcode || "").trim();

                const rawCost = p.cost_per_unit ?? p.price_per_unit ?? p.estimated_unit_cost;
                const unitCost =
                    rawCost !== null && rawCost !== undefined && !isNaN(Number(rawCost))
                        ? Number(rawCost)
                        : 0;

                const rawUom = p.unit_of_measurement;
                const uom =
                    typeof rawUom === "object" && rawUom !== null
                        ? (rawUom as { unit_id?: unknown; id?: unknown; unit_name?: unknown; unit_shortcut?: unknown })
                        : null;
                const uomIdValue = Number(uom?.unit_id ?? uom?.id ?? rawUom ?? 0);

                const rawProductType = p.product_type ?? p.productType;
                const productType =
                    typeof rawProductType === "object" && rawProductType !== null
                        ? (rawProductType as { id?: unknown; product_type_id?: unknown; name?: unknown; type_name?: unknown; description?: unknown })
                        : null;
                const productTypeIdValue = Number(productType?.id ?? productType?.product_type_id ?? rawProductType ?? 0);
                const productTypeId =
                    Number.isSafeInteger(productTypeIdValue) && productTypeIdValue > 0
                        ? productTypeIdValue
                        : null;

                const rawProductTypeName = String(
                    productType?.name ??
                        productType?.type_name ??
                        productType?.description ??
                        (typeof rawProductType === "string" && Number.isNaN(Number(rawProductType))
                            ? rawProductType
                            : "")
                ).trim();
                const productTypeName = getLotTransferProductTypeLabel(
                    productTypeId,
                    rawProductTypeName || productTypeNames.get(productTypeId || 0)
                );

                const categoryName =
                    typeof p.product_category === "object" && p.product_category !== null
                        ? (p.product_category as { category_name?: string }).category_name
                        : undefined;

                return {
                    productId,
                    productName,
                    description: desc || pName || productName,
                    productCode: skuCode,
                    skuCode,
                    unitCost,
                    cost_per_unit: unitCost,
                    price_per_unit: p.price_per_unit != null ? Number(p.price_per_unit) : unitCost,
                    uomId: Number.isSafeInteger(uomIdValue) && uomIdValue > 0 ? uomIdValue : null,
                    unitName: uom?.unit_name != null ? String(uom.unit_name).trim() : "",
                    unitShortcut: uom?.unit_shortcut != null ? String(uom.unit_shortcut).trim() : "",
                    productTypeId,
                    productTypeName,
                    category_name: categoryName,
                    is_parent: true
                };
            });

        data.sort((a: { productName: string }, b: { productName: string }) =>
            a.productName.localeCompare(b.productName)
        );

        return NextResponse.json(data);
    } catch (e) {
        console.error("[ProductTracing BFF] Error fetching parent products:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
