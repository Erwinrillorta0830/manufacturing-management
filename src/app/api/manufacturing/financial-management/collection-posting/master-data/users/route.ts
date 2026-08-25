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
        let url = `${DIRECTUS_URL}/items/user?limit=-1`;
        let res = await fetch(url, { headers, cache: "no-store" });
        
        // Fallback to system users if custom table throws 403
        if (res.status === 403 || res.status === 404) {
            url = `${DIRECTUS_URL}/users?limit=-1`;
            res = await fetch(url, { headers, cache: "no-store" });
        }
        
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const items = data.data || [];
        
        const mappedUsers = items.map((u: Record<string, unknown>) => ({
            id: u.user_id || u.id,
            firstName: u.user_fname || u.first_name,
            lastName: u.user_lname || u.last_name,
            name: `${u.user_fname || u.first_name || ""} ${u.user_lname || u.last_name || ""}`.trim(),
            ...u
        }));
        
        return NextResponse.json(mappedUsers);
    } catch (e) {
        console.error("API Error fetching users:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch users" }, { status: 500 });
    }
}
