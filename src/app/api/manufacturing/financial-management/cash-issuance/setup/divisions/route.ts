import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

interface DirectusDivision {
    division_id: number;
    division_name: string;
}

export async function GET() {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
    const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

    try {
        const directusRes = await fetch(`${DIRECTUS_URL}/items/division?sort=division_name&limit=-1`, {
            headers: {
                Authorization: `Bearer ${DIRECTUS_TOKEN}`,
                "Content-Type": "application/json",
            },
            cache: "no-store",
        });
        if (!directusRes.ok) throw new Error(await directusRes.text());
        const json = await directusRes.json();
        const data = (json.data || []) as DirectusDivision[];

        const mapped = data.map((row: DirectusDivision) => ({
            divisionId: row.division_id,
            divisionName: row.division_name
        }));

        return NextResponse.json(mapped);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error occurred';
        return NextResponse.json({ message }, { status: 502 });
    }
}