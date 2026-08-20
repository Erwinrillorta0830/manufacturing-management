import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { lot_name, inventory_type_id, max_batch_capacity } = body;

        // Get logged in user ID from secure access token cookie
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
            console.error("Error parsing user token in PATCH lot route:", err);
        }

        const utcIsoString = new Date().toISOString();

        const updatePayload: Record<string, unknown> = {
            updated_at: utcIsoString
        };
        if (userId) {
            updatePayload.updated_by = Number(userId);
        }
        if (lot_name !== undefined) {
            if (typeof lot_name !== "string" || !lot_name.trim()) {
                return NextResponse.json(
                    { error: "lot_name must be a non-empty string" },
                    { status: 400 }
                );
            }

            // Check for duplicate lot name (case-insensitive, excluding current lot)
            const duplicateCheckRes = await fetch(
                `${DIRECTUS_URL}/items/lots?limit=-1&fields=lot_id,lot_name`,
                { headers, cache: "no-store" }
            );
            if (duplicateCheckRes.ok) {
                const duplicateJson = await duplicateCheckRes.json();
                const existingLots = duplicateJson.data || [];
                const isDuplicate = existingLots.some(
                    (l: { lot_id: number; lot_name?: string }) =>
                        Number(l.lot_id) !== Number(id) &&
                        l.lot_name?.trim().toLowerCase() === lot_name.trim().toLowerCase()
                );
                if (isDuplicate) {
                    return NextResponse.json(
                        { error: `A lot with the name "${lot_name.trim()}" already exists` },
                        { status: 409 }
                    );
                }
            }

            updatePayload.lot_name = lot_name.trim();
        }

        if (inventory_type_id !== undefined) {
            if (typeof inventory_type_id !== "number") {
                return NextResponse.json(
                    { error: "inventory_type_id must be a number" },
                    { status: 400 }
                );
            }
            updatePayload.inventory_type_id = inventory_type_id;
        }

        if (max_batch_capacity !== undefined) {
            if (typeof max_batch_capacity !== "number" || max_batch_capacity <= 0) {
                return NextResponse.json(
                    { error: "max_batch_capacity must be a positive number greater than 0" },
                    { status: 400 }
                );
            }
            updatePayload.max_batch_capacity = max_batch_capacity;
        }

        const rawUnitId = body.unit_id !== undefined ? body.unit_id : body.uom_id;
        if (rawUnitId !== undefined) {
            updatePayload.unit_id = rawUnitId === null || rawUnitId === "" ? null : Number(rawUnitId);
        }

        let res = await fetch(`${DIRECTUS_URL}/items/lots/${id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload)
        });

        // If Directus fails because unit_id is named uom_id in schema, retry with uom_id
        if (!res.ok && updatePayload.unit_id !== undefined) {
            const errTxt = await res.text();
            if (errTxt.includes("unit_id")) {
                updatePayload.uom_id = updatePayload.unit_id;
                delete updatePayload.unit_id;
                res = await fetch(`${DIRECTUS_URL}/items/lots/${id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(updatePayload)
                });
            }
            if (!res.ok) {
                throw new Error(`Directus failed to update lot ${id}: ${res.status} - ${errTxt}`);
            }
        } else if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(`Directus failed to update lot ${id}: ${res.status} - ${errTxt}`);
        }

        const resJson = await res.json();
        return NextResponse.json(resJson.data);
    } catch (e) {
        console.error("API Error updating lot:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to update lot" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const res = await fetch(`${DIRECTUS_URL}/items/lots/${id}`, {
            method: "DELETE",
            headers
        });

        if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(`Directus failed to delete lot ${id}: ${res.status} - ${errTxt}`);
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("API Error deleting lot:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to delete lot" },
            { status: 500 }
        );
    }
}
