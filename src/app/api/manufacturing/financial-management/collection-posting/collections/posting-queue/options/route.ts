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
        const [colRes, userRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/collection?limit=1000&fields=*.*`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1`, { headers, cache: "no-store" })
        ]);

        if (!colRes.ok) throw new Error(`Directus returned status ${colRes.status}`);
        const data = await colRes.json();
        const items = data.data || [];

        const salesmen = new Set<string>();
        const cashiers = new Set<string>();
        const userMap = new Map<number | string, string>();

        if (userRes.ok) {
            const userData = await userRes.json();
            const users = userData.data || [];
            users.forEach((u: Record<string, unknown>) => {
                const fname = (u.user_fname || u.first_name || "") as string;
                const lname = (u.user_lname || u.last_name || "") as string;
                const fullName = `${fname} ${lname}`.trim();
                if (fullName) {
                    if (u.user_id != null) userMap.set(Number(u.user_id), fullName);
                    if (u.id != null) userMap.set(Number(u.id), fullName);
                    // Also populate cashiers with all available system users as option fallback
                    cashiers.add(fullName);
                }
            });
        }

        const getFullName = (uVal: unknown): string | null => {
            if (!uVal) return null;
            if (typeof uVal === "object") {
                const obj = uVal as Record<string, unknown>;
                const fname = (obj.user_fname || obj.first_name || "") as string;
                const lname = (obj.user_lname || obj.last_name || "") as string;
                const fullName = `${fname} ${lname}`.trim();
                return fullName || null;
            }
            return userMap.get(Number(uVal)) || userMap.get(String(uVal)) || null;
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items.forEach((item: any) => {
            if (item.salesman_id?.salesman_name) {
                salesmen.add(item.salesman_id.salesman_name);
            }

            [item.encoder_id, item.collected_by].forEach((uVal) => {
                const name = getFullName(uVal);
                if (name) cashiers.add(name);
            });
        });

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


