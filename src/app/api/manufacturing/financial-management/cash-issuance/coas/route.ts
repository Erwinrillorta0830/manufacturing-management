import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const forPayable = searchParams.get("forPayable") === "true";
        
        // Build filter for payable COAs if requested
        let filter = "";
        if (forPayable) {
            filter = "&filter[account_type][_in]=3,4,7,8,9,10";
        }
        
        const url = `${DIRECTUS_URL}/items/chart_of_accounts?limit=-1&sort=gl_code${filter}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        
        if (!res.ok) {
            return NextResponse.json({ error: "Failed to fetch COAs" }, { status: res.status });
        }
        
        const data = (await res.json()).data || [];
        
        // Map to COADto
        const mapped = data.map((item: any) => ({
            coaId: Number(item.coa_id),
            glCode: item.gl_code || "",
            accountTitle: item.account_title || "",
            accountType: item.account_type ? Number(item.account_type) : null,
            isPayment: item.isPayment || item.is_payment || false
        }));
        
        return NextResponse.json(mapped);
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
