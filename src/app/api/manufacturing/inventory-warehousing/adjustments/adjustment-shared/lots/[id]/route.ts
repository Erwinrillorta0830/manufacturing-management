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
        const { lot_name, max_batch_capacity, branch_id, description, status } = body;

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

        const updatePayload: Record<string, unknown> = {
            updated_by: userId ? Number(userId) : 1
        };

        if (lot_name !== undefined) {
            if (typeof lot_name !== "string" || !lot_name.trim()) {
                return NextResponse.json(
                    { error: "lot_name must be a non-empty string" },
                    { status: 400 }
                );
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

        if (branch_id !== undefined) updatePayload.branch_id = Number(branch_id);
        if (description !== undefined) updatePayload.description = description ? String(description).trim() : null;
        if (status !== undefined) updatePayload.status = String(status).toUpperCase();

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
        return NextResponse.json({ success: true, data: resJson.data });
    } catch (e) {
        console.error("API Error updating lot:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to update lot" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    _request: Request,
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
