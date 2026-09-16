import { NextResponse } from "next/server";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.DIRECTUS_URL || "").replace(/\/+$/, "");
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

interface UserRow {
    user_id?: number;
    id?: number;
    user_fname?: string;
    first_name?: string;
    user_lname?: string;
    last_name?: string;
    [key: string]: unknown;
}

export async function GET() {
    try {
        let url = `${DIRECTUS_URL}/items/user?limit=-1`;
        let res = await fetch(url, { headers, cache: "no-store" });

        if (res.status === 403 || res.status === 404) {
            url = `${DIRECTUS_URL}/users?limit=-1`;
            res = await fetch(url, { headers, cache: "no-store" });
        }

        if (!res.ok) {
            console.warn("Directus users endpoint returned status:", res.status);
            return NextResponse.json([]);
        }

        const data = await res.json();
        const items: UserRow[] = data.data || [];

        const mappedUsers = items
            .map((u) => {
                const id = Number(u.user_id || u.id);
                const firstName = (u.user_fname || u.first_name || "").toString().trim();
                const lastName = (u.user_lname || u.last_name || "").toString().trim();
                const name = `${firstName} ${lastName}`.trim() || `User #${id}`;
                return {
                    id,
                    firstName,
                    lastName,
                    name,
                    ...u
                };
            })
            .filter((u) => typeof u.id === "number" && !Number.isNaN(u.id));

        return NextResponse.json(mappedUsers);
    } catch (e) {
        console.error("API Error fetching cash-issuance users:", e);
        return NextResponse.json([]);
    }
}
