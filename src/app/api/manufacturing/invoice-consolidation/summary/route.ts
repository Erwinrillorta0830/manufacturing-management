import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get("branchId");

        if (!branchId) {
            return NextResponse.json({ message: "branchId is required" }, { status: 400 });
        }

        const filter: Record<string, unknown> = {
            _and: [
                { is_delete: { _eq: 0 } },
                { branch_id: { _eq: Number(branchId) } },
            ],
        };

        const qs = new URLSearchParams();
        qs.set("filter", JSON.stringify(filter));
        qs.set("limit", "-1");
        qs.set("fields", "id,status");

        const res = await fetch(`${DIRECTUS_URL}/items/consolidator?${qs.toString()}`, {
            headers: directusHeaders,
            cache: "no-store",
        });
        if (!res.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${res.status})` }, { status: res.status });
        }

        const json = await res.json();
        const items: { status: string }[] = json.data || [];

        let Pending = 0, Picking = 0, Picked = 0, Audited = 0;

        for (const item of items) {
            const s = item.status || "Pending";
            if (s === "Audited") Audited++;
            else if (s === "Picked") Picked++;
            else if (s === "Picking") Picking++;
            else Pending++;
        }

        return NextResponse.json({ Pending, Picking, Picked, Audited, All: items.length });
    } catch (e) {
        console.error("invoice-consolidation summary GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
