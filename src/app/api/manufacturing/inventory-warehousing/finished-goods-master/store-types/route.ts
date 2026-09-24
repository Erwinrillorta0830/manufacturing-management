import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchStoreTypes, createStoreType } from "./store-types-helper";

export async function GET() {
    try {
        const storeTypes = await fetchStoreTypes();
        return NextResponse.json(storeTypes);
    } catch (e) {
        console.error("API Error fetching store types:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch store types" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        if (!body.store_type || !body.store_type.trim()) {
            return NextResponse.json({ error: "Store Type name is required" }, { status: 400 });
        }

        // Retrieve logged-in user ID from JWT token
        let encoderId: number | null = null;
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
                    const rawId = payload?.id || payload?.user_id || payload?.sub;
                    if (rawId) {
                        const parsed = Number(rawId);
                        if (!isNaN(parsed)) {
                            encoderId = parsed;
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Error decoding user token in store type creation:", err);
        }

        if (!encoderId) {
            return NextResponse.json({ error: "Unauthorized: A valid encoder session could not be established." }, { status: 401 });
        }

        const newStoreType = await createStoreType(body.store_type.trim(), encoderId);
        return NextResponse.json(newStoreType);
    } catch (e) {
        console.error("API Error creating store type:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to create store type" }, { status: 500 });
    }
}
