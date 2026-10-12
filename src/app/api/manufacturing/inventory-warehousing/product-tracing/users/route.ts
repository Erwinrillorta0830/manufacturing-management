import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname&sort=user_fname`, {
            headers,
            cache: "no-store"
        });

        if (!res.ok) {
            return NextResponse.json([]);
        }

        const json = await res.json();
        const raw = json.data || [];
        const users = raw.map((u: Record<string, unknown>) => {
            const id = Number(u.user_id || u.id);
            const fname = (u.user_fname || u.firstName || "") as string;
            const lname = (u.user_lname || u.lastName || "") as string;
            const fullName = `${fname} ${lname}`.trim() || `User #${id}`;
            return {
                id,
                name: fullName,
                firstName: fname,
                lastName: lname
            };
        });

        return NextResponse.json(users);
    } catch (err) {
        console.error("[ProductTracing BFF] Error fetching users lookup:", err);
        return NextResponse.json([]);
    }
}
