import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getUserIdFromToken } from "@/app/api/manufacturing/invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    if (!(await getUserIdFromToken())) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const response = await fetch(`${DIRECTUS_URL}/items/sales_invoice_type?fields=id,type,isOfficial,max_length&sort=type&limit=-1`, { headers, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "Failed to load receipt types." }, { status: 503 });
    const rows = (await response.json()).data || [];
    return NextResponse.json(rows.map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        type: String(row.type || "Invoice"),
        isOfficial: row.isOfficial === true || row.isOfficial === 1 || row.isOfficial === "1",
        maxLength: Number(row.max_length || 0),
    })));
}
