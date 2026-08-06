import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const supplierId = searchParams.get("supplierId");
        const productId = searchParams.get("productId");

        const filters: string[] = [];
        if (supplierId) filters.push(`filter[supplier_id][_eq]=${supplierId}`);
        if (productId) filters.push(`filter[product_id][_eq]=${productId}`);

        const filterQuery = filters.length > 0 ? filters.join("&") + "&" : "";
        const url = `${DIRECTUS_URL}/items/product_per_supplier?${filterQuery}fields=id,supplier_id,product_id,discount_type.*&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to fetch product_per_supplier: ${res.status}`);
        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("[Product Per Supplier API] Error:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch product per supplier data" }, { status: 500 });
    }
}
