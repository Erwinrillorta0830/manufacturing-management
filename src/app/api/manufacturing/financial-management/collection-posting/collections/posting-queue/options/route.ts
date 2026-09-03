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
        const url = `${DIRECTUS_URL}/items/collection?limit=1000&fields=*.*`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const items = data.data || [];
        
        const salesmen = new Set<string>();
        const encoderIds = new Set<number>();
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items.forEach((item: any) => {
            if (item.salesman_id?.salesman_name) {
                salesmen.add(item.salesman_id.salesman_name);
            }
            if (item.encoder_id && typeof item.encoder_id === "number") {
                encoderIds.add(item.encoder_id);
            }
        });
        
        const cashiers = new Set<string>();
        
        if (encoderIds.size > 0) {
            const userUrl = `${DIRECTUS_URL}/items/user?filter[user_id][_in]=${Array.from(encoderIds).join(",")}`;
            const userRes = await fetch(userUrl, { headers, cache: "no-store" });
            if (userRes.ok) {
                const userData = await userRes.json();
                const users = userData.data || [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                users.forEach((u: any) => {
                    const name = `${u.user_fname || u.first_name || ""} ${u.user_lname || u.last_name || ""}`.trim();
                    if (name) cashiers.add(name);
                });
            }
        }
        
        return NextResponse.json({
            operations: [],
            salesmen: Array.from(salesmen).sort(),
            cashiers: Array.from(cashiers).sort()
        });
    } catch (e) {
        console.error("API Error fetching posting queue options:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
