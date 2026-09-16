import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const res = await fetch(
            `${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code&sort=branch_name`,
            { headers: directusHeaders, cache: "no-store" }
        );

        if (!res.ok) {
            return NextResponse.json(
                { success: false, message: `Failed to fetch branches: HTTP ${res.status}` },
                { status: res.status }
            );
        }

        const data = await res.json();
        const branches = (data.data || []).map((b: { id: number; branch_name: string; branch_code: string }) => ({
            id: Number(b.id),
            branch_name: b.branch_name || `Branch #${b.id}`,
            branch_code: b.branch_code || "",
        }));

        return NextResponse.json({ success: true, data: branches });
    } catch (error) {
        console.error("[Sales Order Fulfillment] Error fetching branches:", error);
        return NextResponse.json(
            { success: false, message: (error as Error).message || "Internal server error" },
            { status: 500 }
        );
    }
}
