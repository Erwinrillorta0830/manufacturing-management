import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET() {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1`, {
            headers,
            cache: "no-store",
        });

        if (!res.ok) {
            throw new Error(`Directus failed to fetch work centers: ${res.status}`);
        }

        const json = await res.json();
        const items = (json.data || []).map((wc: Record<string, unknown>) => ({
            work_center_id: Number(wc.work_center_id),
            work_center_name: String(wc.work_center_name || ""),
            overhead_cost_per_hour: Number(wc.overhead_cost_per_hour || 0),
            capacity_per_hour: Number(wc.capacity_per_hour || 0),
            is_active: wc.is_active !== false,
            asset_id: wc.asset_id ?? null,
            department_id: wc.department_id ?? null,
        }));

        return NextResponse.json(items);
    } catch (e) {
        console.error("API Error fetching finished-goods work centers:", e);
        return NextResponse.json(
            { error: (e as Error).message || "Failed to fetch work centers" },
            { status: 500 }
        );
    }
}
