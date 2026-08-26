import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturing/physical-inventory-manufacturing/master-data
 * Returns active branches, products, and UOM units for Physical Inventory dropdowns.
 */
export async function GET() {
    try {
        const [branchesRes, productsRes, unitsRes, productTypesRes, priceTypesRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/branches?limit=-1&sort=branch_name`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&sort=product_name&fields=product_id,product_code,product_name,product_type,product_type.*,product_shelf_life,cost_per_unit,unit_of_measurement.*,isActive`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/product_type?limit=-1&sort=id`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/price_types?limit=-1&sort=price_type_name`, { headers, cache: "no-store" }).catch(() => null),
        ]);

        let branches: Array<{ id: number; branch_name: string; branchName: string; branch_code?: string; branchCode?: string; isActive?: boolean | number }> = [];
        if (branchesRes && branchesRes.ok) {
            const json = await branchesRes.json();
            const raw = json.data || [];
            branches = raw.map((b: { id: number; branch_name?: string; branchName?: string; branch_code?: string; branchCode?: string; isActive?: boolean | number }) => ({
                id: b.id,
                branch_name: b.branch_name || b.branchName || `Branch #${b.id}`,
                branchName: b.branchName || b.branch_name || `Branch #${b.id}`,
                branch_code: b.branch_code || b.branchCode || "",
                branchCode: b.branchCode || b.branch_code || "",
                isActive: b.isActive,
            }));
        }

        let products: Array<unknown> = [];
        if (productsRes && productsRes.ok) {
            const json = await productsRes.json();
            products = json.data || [];
        }

        let units: Array<{ unit_id: number; unitId: number; unit_name: string; unitName: string; unit_shortcut: string; unitShortcut: string }> = [];
        if (unitsRes && unitsRes.ok) {
            const json = await unitsRes.json();
            const raw = json.data || [];
            units = raw.map((u: { unit_id?: number; id?: number; unit_name?: string; unitName?: string; unit_shortcut?: string; unitShortcut?: string }) => {
                const uid = u.unit_id || u.id || 0;
                const uname = u.unit_name || u.unitName || `Unit #${uid}`;
                const ushortcut = u.unit_shortcut || u.unitShortcut || uname;
                return {
                    unit_id: uid,
                    unitId: uid,
                    unit_name: uname,
                    unitName: uname,
                    unit_shortcut: ushortcut,
                    unitShortcut: ushortcut,
                };
            });
        }

        let product_types: Array<{ id: number; name: string; type_name?: string; default_purchase_price_type_id?: number | null }> = [];
        if (productTypesRes && productTypesRes.ok) {
            const json = await productTypesRes.json();
            const raw = json.data || [];
            product_types = raw.map((pt: { id: number; name?: string; type_name?: string; default_purchase_price_type_id?: number | null }) => ({
                id: pt.id,
                name: pt.name || pt.type_name || `Product Type #${pt.id}`,
                type_name: pt.type_name || pt.name || "",
                default_purchase_price_type_id: pt.default_purchase_price_type_id ?? null,
            }));
        }

        if (product_types.length === 0) {
            product_types = [
                { id: 388, name: "Finished Goods", type_name: "Finished Goods" },
                { id: 389, name: "Raw Materials", type_name: "Raw Materials" },
                { id: 390, name: "Packaging Items", type_name: "Packaging Items" },
            ];
        }

        let price_types: Array<{ price_type_id: number; price_type_name: string; sort?: number | null }> = [];
        if (priceTypesRes && priceTypesRes.ok) {
            const json = await priceTypesRes.json();
            const raw = json.data || [];
            price_types = raw
                .map((pt: Record<string, unknown>) => ({
                    price_type_id: Number(pt.price_type_id || pt.id || 0),
                    price_type_name: String(pt.price_type_name || pt.name || `Price Type #${pt.price_type_id || pt.id}`),
                    sort: pt.sort ? Number(pt.sort) : null,
                }))
                .filter((pt: { price_type_id: number }) => pt.price_type_id > 0);
        }

        return NextResponse.json({
            success: true,
            data: {
                branches,
                products,
                units,
                product_types,
                price_types,
            },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
