import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { DirectusUnit, UnitOfMeasure } from "@/modules/manufacturing-management/lot-management/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const res = await fetch(
            `${DIRECTUS_URL}/items/units?limit=-1&sort=order,unit_name&fields=unit_id,unit_name,unit_shortcut,order,sku_code`,
            { headers, cache: "no-store" }
        );

        if (!res.ok) {
            throw new Error(`Directus failed to fetch units: ${res.status}`);
        }

        const json = await res.json();
        const data: DirectusUnit[] = json.data || [];

        const mapped: UnitOfMeasure[] = data.map((item) => ({
            unitId: item.unit_id,
            unitName: item.unit_name,
            unitShortcut: item.unit_shortcut || item.unit_name,
            order: item.order ?? null,
            skuCode: item.sku_code ?? null
        }));

        return NextResponse.json(mapped);
    } catch (e) {
        console.error("API Error fetching UOM lookup for lots:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to fetch UOM lookup" },
            { status: 500 }
        );
    }
}
