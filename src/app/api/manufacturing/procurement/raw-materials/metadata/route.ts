import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../../_directus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readCollection(path: string, label: string, optional = false): Promise<unknown[]> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, { headers, cache: "no-store" });
    if (optional && (response.status === 403 || response.status === 404)) return [];
    if (!response.ok) throw new Error(`Directus failed to fetch ${label}: ${response.status}`);
    const body = await response.json();
    return Array.isArray(body?.data) ? body.data : [];
}

export async function GET() {
    try {
        const [itemGroups, taxRates, priceTypes, productTypes] = await Promise.all([
            readCollection(
                "/items/item_groups?filter[is_active][_eq]=1&fields=item_group_id,group_code,group_name&sort=group_name&limit=-1",
                "item groups",
                true
            ),
            readCollection(
                "/items/tax_rates?fields=TaxID,VATRate,WithholdingRate&limit=-1",
                "tax rates"
            ),
            readCollection(
                "/items/price_types?fields=price_type_id,price_type_name&limit=-1",
                "price controls"
            ),
            readCollection(
                "/items/product_type?fields=id,name,default_purchase_price_type_id,default_purchase_price_type_id.price_type_id,default_purchase_price_type_id.price_type_name&sort=name&limit=-1",
                "product-type price mappings"
            )
        ]);

        const priceTypeNames = new Map(priceTypes.map((item) => {
            const row = item as Record<string, unknown>;
            return [Number(row.price_type_id), String(row.price_type_name || "")] as const;
        }));

        return NextResponse.json({
            itemGroups: itemGroups.map((item) => {
                const row = item as Record<string, unknown>;
                return {
                    id: Number(row.item_group_id),
                    code: String(row.group_code || ""),
                    name: String(row.group_name || row.group_code || "")
                };
            }).filter((item) => Number.isInteger(item.id) && item.id > 0 && item.name),
            taxRates: taxRates.map((item) => {
                const row = item as Record<string, unknown>;
                return {
                    id: Number(row.TaxID),
                    vatRate: Number(row.VATRate || 0),
                    withholdingRate: Number(row.WithholdingRate || 0)
                };
            }).filter((item) => Number.isInteger(item.id) && item.id > 0),
            priceControls: priceTypes.map((item) => {
                const row = item as Record<string, unknown>;
                return {
                    id: Number(row.price_type_id),
                    name: String(row.price_type_name || "")
                };
            }).filter((item) => Number.isInteger(item.id) && item.id > 0 && item.name),
            priceTypeRules: productTypes.map((item) => {
                const row = item as Record<string, unknown>;
                const rawPriceType = row.default_purchase_price_type_id;
                const priceType = rawPriceType && typeof rawPriceType === "object"
                    ? rawPriceType as Record<string, unknown>
                    : null;
                const priceTypeId = priceType
                    ? Number(priceType.price_type_id || priceType.id)
                    : Number(rawPriceType);
                return {
                    productTypeId: Number(row.id),
                    productTypeName: String(row.name || ""),
                    priceTypeId: Number.isInteger(priceTypeId) && priceTypeId > 0 ? priceTypeId : null,
                    priceTypeName: priceType?.price_type_name
                        ? String(priceType.price_type_name)
                        : priceTypeId ? priceTypeNames.get(priceTypeId) || null : null
                };
            }).filter((item) => Number.isInteger(item.productTypeId) && item.productTypeId > 0)
        });
    } catch (error) {
        console.error("API Error fetching raw-material metadata:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch raw-material metadata" }, { status: 500 });
    }
}
