import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../../directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ProductTypeRecord {
    id: number | string;
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
            // Fallback default product types if table is inaccessible
            return NextResponse.json([
                { id: 388, name: "Finished Goods", type_name: "Finished Goods" },
                { id: 389, name: "Raw Materials", type_name: "Raw Materials" },
                { id: 390, name: "Packaging Items", type_name: "Packaging Items" }
            ]);
        }

        const json = await res.json();
        const rawList = json.data || [];

        const list: ProductTypeRecord[] = rawList.map((item: Record<string, unknown>) => ({
            id: item.id as number | string,
            name: (item.name || item.type_name || `Type #${item.id}`) as string,
            type_name: (item.type_name || item.name || "") as string,
            description: (item.description || "") as string
        }));

        // If list is empty, return default standard product types
        if (list.length === 0) {
            return NextResponse.json([
                { id: 388, name: "Finished Goods", type_name: "Finished Goods" },
                { id: 389, name: "Raw Materials", type_name: "Raw Materials" },
                { id: 390, name: "Packaging Items", type_name: "Packaging Items" }
            ]);
        }

        return NextResponse.json(list);
    } catch (err) {
        console.error("Error fetching product types in physical inventory:", err);
        return NextResponse.json([
            { id: 388, name: "Finished Goods", type_name: "Finished Goods" },
            { id: 389, name: "Raw Materials", type_name: "Raw Materials" },
            { id: 390, name: "Packaging", type_name: "Packaging Materials" }
        ]);
    }
}
