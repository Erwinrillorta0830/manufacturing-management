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
        const { lot_name, max_batch_capacity, branch_id } = body;

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
            updated_at: utcIsoString,
            updated_by: userId ? Number(userId) : 24
        };

        if (lot_name !== undefined) {
            if (typeof lot_name !== "string" || !lot_name.trim()) {
                return NextResponse.json(
                    { error: "lot_name must be a non-empty string" },
                    { status: 400 }
                );
            }

            // Check for duplicate lot name in mm_lots (case-insensitive, excluding current lot)
            const duplicateCheckRes = await fetch(
                `${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=lot_id,lot_name,branch_id`,
                { headers, cache: "no-store" }
            );
            if (duplicateCheckRes.ok) {
                const duplicateJson = await duplicateCheckRes.json();
                const existingLots = duplicateJson.data || [];
                const targetBranchId = branch_id !== undefined ? (branch_id ? Number(branch_id) : null) : null;
                const isDuplicate = existingLots.some(
                    (l: { lot_id: number; lot_name?: string; branch_id?: number | { id: number } }) => {
                        if (Number(l.lot_id) === Number(id)) return false;
                        const existingBranchId = typeof l.branch_id === "object" && l.branch_id !== null
                            ? l.branch_id.id
                            : l.branch_id;
                        const isSameBranch = !targetBranchId || !existingBranchId || Number(existingBranchId) === Number(targetBranchId);
                        return isSameBranch && l.lot_name?.trim().toLowerCase() === lot_name.trim().toLowerCase();
                    }
                );
                if (isDuplicate) {
                    return NextResponse.json(
                        { error: `A lot with the name "${lot_name.trim()}" already exists in this branch` },
                        { status: 409 }
                    );
                }
            }

            updatePayload.lot_name = lot_name.trim();
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

        if (branch_id !== undefined) {
            updatePayload.branch_id = branch_id === null || branch_id === "" ? null : Number(branch_id);
        }

        const rawUnitId = body.unit_id !== undefined ? body.unit_id : body.uom_id;
        if (rawUnitId !== undefined) {
            updatePayload.unit_id = rawUnitId === null || rawUnitId === "" ? null : Number(rawUnitId);
        }

        const res = await fetch(`${DIRECTUS_URL}/items/mm_lots/${id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload)
        });

        if (!res.ok) {
            const errTxt = await res.text();
            let errMsg = `Directus mm_lots update failed: ${res.status}`;
            try {
                const errJson = JSON.parse(errTxt);
                if (errJson.errors && errJson.errors.length > 0) {
                    errMsg = errJson.errors[0].message || errMsg;
                }
            } catch {}
            return NextResponse.json({ error: errMsg }, { status: res.status });
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

        const res = await fetch(`${DIRECTUS_URL}/items/mm_lots/${id}`, {
            method: "DELETE",
            headers
        });

        if (!res.ok) {
            const errTxt = await res.text();
            let errMsg = `Directus mm_lots delete failed: ${res.status}`;
            try {
                const errJson = JSON.parse(errTxt);
                if (errJson.errors && errJson.errors.length > 0) {
                    errMsg = errJson.errors[0].message || errMsg;
                }
            } catch {}
            return NextResponse.json({ error: errMsg }, { status: res.status });
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
