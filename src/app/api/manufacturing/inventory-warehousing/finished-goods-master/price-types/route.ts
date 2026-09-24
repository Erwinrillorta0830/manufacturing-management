import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const priceTypeId = searchParams.get("priceTypeId");

        if (priceTypeId) {
            // Fetch product prices for this specific price type
            const url = `${DIRECTUS_URL}/items/product_per_price_type?filter[price_type_id][_eq]=${priceTypeId}&limit=-1&fields=product_id,price`;
            const res = await fetch(url, {
                headers,
                cache: "no-store"
            });
            if (!res.ok) throw new Error(`Failed to fetch product price rules: ${res.status}`);
            const json = await res.json();
            return NextResponse.json(json.data || []);
        } else {
            // Fetch all price types
            const url = `${DIRECTUS_URL}/items/price_types?filter[is_active][_eq]=1&limit=-1&sort=sort&fields=price_type_id,price_type_name,sort,is_active`;
            const res = await fetch(url, {
                headers,
                cache: "no-store"
            });
            if (!res.ok) throw new Error(`Failed to fetch price types: ${res.status}`);
            const json = await res.json();
            return NextResponse.json(json.data || []);
        }
    } catch (e) {
        console.error("API Error fetching price types:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch price types data" }, { status: 500 });
    }
}


