import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { InventoryType } from "@/modules/manufacturing-management/lot-management/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusProductTypeRaw {
    id: number;
    name: string;
}

export async function GET() {
    try {
        const res = await fetch(
            `${DIRECTUS_URL}/items/product_type?limit=-1&sort=id`,
            { headers, cache: "no-store" }
        );

        if (!res.ok) {
            throw new Error(`Directus failed to fetch inventory types: ${res.status}`);
        }

        const json = await res.json();
        const data: DirectusProductTypeRaw[] = json.data || [];

        const mapped: InventoryType[] = data.map((item) => ({
            inventoryTypeId: item.id,
            typeName: item.name
        }));

        return NextResponse.json(mapped);
    } catch (e) {
        console.error("API Error fetching inventory types lookup:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to fetch inventory types lookup" },
            { status: 500 }
        );
    }
}
