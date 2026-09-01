import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = searchParams.get("limit") || "-1";
        const fields = searchParams.get("fields") || "id,customer_name,customer_code,store_signage,tel_number,bank_details,price_type_id,price_type_id.price_type_name,price_type,otherDetails";

        const url = `${DIRECTUS_URL}/items/customer?limit=${limit}&fields=${fields}`;
        const res = await fetch(url, { headers, cache: "no-store" });

        if (!res.ok) {
            throw new Error(`Directus error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        return NextResponse.json(data.data || []);
    } catch (e) {
        console.error("API Error in manufacturing/customer GET:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch customers" }, { status: 500 });
    }
}
