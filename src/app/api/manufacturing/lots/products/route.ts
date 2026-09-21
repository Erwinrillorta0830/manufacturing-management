import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        let res = await fetch(
            `${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,description,product_name,product_code,barcode,cost_per_unit,price_per_unit,estimated_unit_cost,product_type,product_type.*,product_category.category_name,unit_of_measurement.unit_id,unit_of_measurement.unit_name,unit_of_measurement.unit_shortcut&_t=${Date.now()}`,
            { headers, cache: "no-store" }
        ).catch(() => null);

        if (!res || !res.ok) {
            res = await fetch(
                `${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,description,product_name,product_code,barcode,cost_per_unit,price_per_unit,estimated_unit_cost,product_type,product_type.*,product_category.category_name,unit_of_measurement.unit_id,unit_of_measurement.unit_name,unit_of_measurement.unit_shortcut`,
                { headers, cache: "no-store" }
            );
        }

        if (!res.ok) {
            return NextResponse.json({ error: "Failed to fetch products" }, { status: res.status });
        }

        const json = await res.json();
        const rawList = json.data || [];

        const data = rawList.map((p: Record<string, unknown>) => {
            const productId = Number(p.product_id ?? p.id ?? 0);
            const desc = String(p.description || "").trim();
            const pName = String(p.product_name || p.name || p.title || "").trim();
            const productName = desc || pName || `Product #${productId}`;
            const skuCode = String(p.product_code || p.barcode || "").trim();
            
            const rawCost = p.cost_per_unit ?? p.price_per_unit ?? p.estimated_unit_cost;
            const unitCost = rawCost !== null && rawCost !== undefined && !isNaN(Number(rawCost))
                ? Number(rawCost)
                : 0;
            const rawUom = p.unit_of_measurement;
            const uom = typeof rawUom === "object" && rawUom !== null
                ? rawUom as { unit_id?: unknown; id?: unknown; unit_name?: unknown; unit_shortcut?: unknown }
                : null;
            const uomIdValue = Number(uom?.unit_id ?? uom?.id ?? rawUom ?? 0);

            const categoryName = typeof p.product_category === "object" && p.product_category !== null
                ? (p.product_category as { category_name?: string }).category_name
                : undefined;

            return {
                productId,
                productName,
                description: desc || pName || productName,
                skuCode,
                unitCost,
                cost_per_unit: unitCost,
                price_per_unit: p.price_per_unit != null ? Number(p.price_per_unit) : unitCost,
                estimated_unit_cost: p.estimated_unit_cost != null ? Number(p.estimated_unit_cost) : undefined,
                uomId: Number.isSafeInteger(uomIdValue) && uomIdValue > 0 ? uomIdValue : null,
                uomName: uom?.unit_name != null ? String(uom.unit_name).trim() : "",
                uomShortcut: uom?.unit_shortcut != null ? String(uom.unit_shortcut).trim() : "",
                product_type: p.product_type,
                productType: p.product_type,
                category_name: categoryName,
                productCategory: categoryName
            };
        }).filter((p: { productId: number }) => p.productId > 0);

        data.sort((a: { productName: string }, b: { productName: string }) => a.productName.localeCompare(b.productName));

        return NextResponse.json(data);
    } catch (e) {
        console.error("API error fetching products lookup:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
