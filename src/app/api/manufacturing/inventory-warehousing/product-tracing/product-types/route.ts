import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ProductTypeRecord {
    id: number;
    name: string;
    type_name?: string;
    description?: string;
}

export async function GET() {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/product_type?limit=-1&sort=id`, {
            headers,
            cache: "no-store"
        });

        if (!res.ok) {
            return NextResponse.json([
                { id: 388, name: "Finished Goods", type_name: "Finished Goods" },
                { id: 389, name: "Raw Materials", type_name: "Raw Materials" },
                { id: 390, name: "Packaging Items", type_name: "Packaging Items" }
            ]);
        }

        const json = await res.json();
        const rawList = json.data || [];

        const list: ProductTypeRecord[] = rawList.map((item: Record<string, unknown>) => ({
            id: Number(item.id),
            name: (item.name || item.type_name || `Type #${item.id}`) as string,
            type_name: (item.type_name || item.name || "") as string,
            description: (item.description || "") as string
        }));

        if (list.length === 0) {
            return NextResponse.json([
                { id: 388, name: "Finished Goods", type_name: "Finished Goods" },
                { id: 389, name: "Raw Materials", type_name: "Raw Materials" },
                { id: 390, name: "Packaging Items", type_name: "Packaging Items" }
            ]);
        }

        return NextResponse.json(list);
    } catch (err) {
        console.error("[ProductTracing BFF] Error fetching product types:", err);
        return NextResponse.json([
            { id: 388, name: "Finished Goods", type_name: "Finished Goods" },
            { id: 389, name: "Raw Materials", type_name: "Raw Materials" },
            { id: 390, name: "Packaging Items", type_name: "Packaging Items" }
        ]);
    }
}
