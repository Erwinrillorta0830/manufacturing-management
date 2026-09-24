/* eslint-disable */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

// GET /api/manufacturing/finished-goods/customer-product-version?customerId=<id>
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const customerId = searchParams.get("customerId");

        if (!customerId) {
            return NextResponse.json({ error: "Missing customerId parameter" }, { status: 400 });
        }

        const filter = encodeURIComponent(JSON.stringify({
            customer_id: { _eq: Number(customerId) }
        }));

        const url = `${DIRECTUS_URL}/items/customer_product_version?filter=${filter}&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });

        if (!res.ok) {
            throw new Error(`Directus error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        return NextResponse.json(data.data || []);
    } catch (e) {
        console.error("API Error fetching customer product versions:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch overrides" }, { status: 500 });
    }
}

// POST /api/manufacturing/finished-goods/customer-product-version
// Body: { customerId: number, productId: number, versionId: number | null }
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { customerId, productId, versionId } = body;

        if (!customerId || !productId) {
            return NextResponse.json({ error: "customerId and productId are required fields" }, { status: 400 });
        }

        // Retrieve logged-in user ID from JWT token for audit tracking
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
                    const rawId = payload?.id || payload?.user_id || payload?.sub;
                    if (rawId) {
                        const parsed = Number(rawId);
                        if (!isNaN(parsed)) userId = parsed;
                    }
                }
            }
        } catch (err) {
            console.error("Error decoding user token in customer-product-version:", err);
        }

        // 1. Check if an override record already exists for this customer-product pair
        const filter = encodeURIComponent(JSON.stringify({
            _and: [
                { customer_id: { _eq: Number(customerId) } },
                { product_id: { _eq: Number(productId) } }
            ]
        }));
        
        const checkUrl = `${DIRECTUS_URL}/items/customer_product_version?filter=${filter}&limit=1`;
        const checkRes = await fetch(checkUrl, { headers, cache: "no-store" });
        if (!checkRes.ok) {
            throw new Error("Failed to check existing override records");
        }
        const checkData = await checkRes.json();
        const existingRecord = checkData.data?.[0];

        // Case A: Clear/Remove setting (versionId is null or empty)
        if (versionId === null || versionId === undefined || versionId === "") {
            if (existingRecord) {
                // Delete existing record
                const deleteUrl = `${DIRECTUS_URL}/items/customer_product_version/${existingRecord.id}`;
                const deleteRes = await fetch(deleteUrl, { method: "DELETE", headers });
                if (!deleteRes.ok) {
                    throw new Error("Failed to delete existing override record");
                }
                return NextResponse.json({ success: true, action: "deleted" });
            }
            return NextResponse.json({ success: true, action: "noop" });
        }

        // Case B: Create or Update override
        const payload: any = {
            customer_id: Number(customerId),
            product_id: Number(productId),
            version_id: Number(versionId),
            created_at: new Date().toISOString()
        };
        if (userId) {
            payload.created_by = userId;
        }

        if (existingRecord) {
            // Update/Patch record
            const patchUrl = `${DIRECTUS_URL}/items/customer_product_version/${existingRecord.id}`;
            const patchRes = await fetch(patchUrl, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    version_id: Number(versionId),
                    created_by: userId || existingRecord.created_by,
                    created_at: new Date().toISOString()
                })
            });
            if (!patchRes.ok) {
                throw new Error("Failed to update override record");
            }
            const updated = await patchRes.json();
            return NextResponse.json({ success: true, action: "updated", record: updated.data });
        } else {
            // Insert/Create record
            const createUrl = `${DIRECTUS_URL}/items/customer_product_version`;
            const createRes = await fetch(createUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });
            if (!createRes.ok) {
                throw new Error("Failed to create override record");
            }
            const created = await createRes.json();
            return NextResponse.json({ success: true, action: "created", record: created.data });
        }
    } catch (e) {
        console.error("API Error updating customer product version override:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to save override" }, { status: 500 });
    }
}
