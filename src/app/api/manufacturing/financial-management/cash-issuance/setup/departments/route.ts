import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

interface DirectusDepartment {
    department_id: number;
    department_name: string;
    parent_division?: number | null;
}

export async function GET() {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const directusBase = process.env.NEXT_PUBLIC_API_BASE_URL;
    const directusToken = process.env.DIRECTUS_STATIC_TOKEN;

    if (!directusBase || !directusToken) {
        return NextResponse.json({ message: "Directus configuration is missing" }, { status: 500 });
    }

    try {
        const params = new URLSearchParams({
            fields: "department_id,department_name,parent_division",
            sort: "department_name",
            limit: "-1",
        });
        const directusRes = await fetch(`${directusBase.replace(/\/+$/, "")}/items/department?${params.toString()}`, {
            headers: {
                Authorization: `Bearer ${directusToken}`,
                "Content-Type": "application/json",
            },
            cache: "no-store",
        });

        if (!directusRes.ok) throw new Error(await directusRes.text());

        const json = await directusRes.json();
        const data = (json.data || []) as DirectusDepartment[];
        const mapped = data.map((row) => ({
            departmentId: row.department_id,
            departmentName: row.department_name,
            parentDivision: row.parent_division ?? null,
        }));

        return NextResponse.json(mapped);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error occurred";
        return NextResponse.json({ message }, { status: 502 });
    }
}
