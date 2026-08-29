import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const res = await fetch(
            `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&sort=branch_name&fields=id,branch_name,branch_code,isBadStock,bad_stock_branch_id`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!res.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${res.status})` }, { status: res.status });
        }
        const json = await res.json();
        const data = (json.data || []).map((b: { id: number; branch_name: string; branch_code: string; isBadStock?: number | boolean | string | null; bad_stock_branch_id?: number | null }) => ({
            id: b.id,
            branchName: b.branch_name,
            branchCode: b.branch_code,
            isBadStock: Number(b.isBadStock) === 1 || b.isBadStock === true || b.isBadStock === "1",
            badStockBranchId: b.bad_stock_branch_id || null,
        }));
        return NextResponse.json(data);
    } catch (e) {
        console.error("branches GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
