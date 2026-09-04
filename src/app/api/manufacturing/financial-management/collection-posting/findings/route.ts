import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function GET() {
    try {
        const url = `${DIRECTUS_URL}/items/general_findings?fields=id,finding_name,coa_id.coa_id,coa_id.account_title,coa_id.balance_type&limit=-1&sort=finding_name`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        const data = await res.json();
        
        const mappedData = (data.data || []).map((item: any) => ({
            id: item.id,
            findingName: item.finding_name,
            chartOfAccount: item.coa_id ? {
                coaId: item.coa_id.coa_id,
                accountTitle: item.coa_id.account_title,
                balanceType: item.coa_id.balance_type
            } : undefined
        }));

        return NextResponse.json(mappedData);
    } catch (e) {
        console.error("API Error fetching general findings:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
