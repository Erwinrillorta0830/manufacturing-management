import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
    fetchAllOverheadTypes,
    createOverheadType
} from "./overhead-types-helper";

export async function GET() {
    try {
        const types = await fetchAllOverheadTypes();
        return NextResponse.json(types);
    } catch (e) {
        console.error("API Error fetching overhead types:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch overhead types" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { name, coa_id, description } = await request.json();
        if (!name) {
            return NextResponse.json({ error: "Overhead type name is required." }, { status: 400 });
        }

        let userId: number | null = null;
        try {
            const cookieStore = await cookies();
            const token = cookieStore.get("vos_access_token")?.value;
            if (token) {
                const parts = token.split(".");
                if (parts.length >= 2) {
                    const base64Url = parts[1];
                    let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                    while (base64.length % 4) base64 += "=";
                    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                    const payload = JSON.parse(jsonPayload);
                    userId = payload?.id || payload?.user_id || payload?.sub || null;
                }
            }
        } catch (err) {
            console.error("Error parsing user token in POST overhead-types route:", err);
        }

        const numericCoa = coa_id ? Number(coa_id) : null;
        const newType = await createOverheadType({
            name,
            coa_id: numericCoa && numericCoa > 0 ? numericCoa : null,
            description,
            created_by: userId ? Number(userId) : null
        });
        if (!newType) throw new Error("Failed to create overhead type in Directus");
        return NextResponse.json({ success: true, type: newType });
    } catch (e) {
        console.error("API Error creating overhead type:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to create overhead type" }, { status: 500 });
    }
}
