import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        let res = await fetch(
            `${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,sku_code,product_code`,
            { headers, cache: "no-store" }
        ).catch(() => null);

        if (!res || !res.ok) {
            res = await fetch(
                `${DIRECTUS_URL}/items/products?limit=-1`,
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
            const productName = String(p.product_name || p.name || `Product #${productId}`);
            const skuCode = String(p.sku_code || p.product_code || p.code || "");
            return {
                productId,
                productName,
                skuCode
            };
        }).filter((p: { productId: number }) => p.productId > 0);

        data.sort((a: { productName: string }, b: { productName: string }) => a.productName.localeCompare(b.productName));

        return NextResponse.json(data);
    } catch (e) {
        console.error("API error fetching products lookup:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
