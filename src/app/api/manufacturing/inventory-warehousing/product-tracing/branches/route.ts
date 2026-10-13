import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const res = await fetch(
            `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&sort=branch_name&fields=id,branch_name,branch_code,isActive`,
            { headers, cache: "no-store" }
        );
        if (!res.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${res.status})` }, { status: res.status });
        }
        const json = await res.json();
        const data = (json.data || []).map((b: { id: number; branch_name: string; branch_code: string }) => ({
            id: b.id,
            branchName: b.branch_name || `Branch #${b.id}`,
            branchCode: b.branch_code || "",
        }));
        return NextResponse.json(data);
    } catch (e) {
        console.error("[ProductTracing BFF] branches GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
