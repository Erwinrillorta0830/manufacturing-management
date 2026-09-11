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
        const batchId = Number(id);
        if (isNaN(batchId)) {
            return NextResponse.json({ error: "Invalid batch ID" }, { status: 400 });
        }

        const body = await request.json();
        const {
            batch_no,
            batch_number,
            lot_id,
            branch_id,
            product_id,
            manufacturing_date,
            expiry_date,
            expiration_date,
            unit_cost,
            qa_status,
            status,
            source_type,
            source_reference,
            remarks
        } = body;

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
            console.error("Error parsing token in PATCH batch:", err);
        }

        const updateBody: Record<string, unknown> = {
            updated_by: userId ? Number(userId) : 1
        };

        const finalNo = (batch_no || batch_number || "").trim();
        if (finalNo) updateBody.batch_no = finalNo;
        if (lot_id) updateBody.lot_id = Number(lot_id);
        if (branch_id) updateBody.branch_id = Number(branch_id);
        if (product_id) updateBody.product_id = Number(product_id);
        if (manufacturing_date !== undefined) updateBody.manufacturing_date = manufacturing_date || null;
        if (expiry_date !== undefined || expiration_date !== undefined) {
            updateBody.expiry_date = expiry_date || expiration_date || null;
        }
        if (unit_cost !== undefined) updateBody.unit_cost = Number(unit_cost);
        if (qa_status !== undefined) updateBody.qa_status = String(qa_status).toUpperCase();
        if (status !== undefined) updateBody.status = String(status).toUpperCase();
        if (source_type !== undefined) updateBody.source_type = source_type ? String(source_type).trim() : null;
        if (source_reference !== undefined) updateBody.source_reference = source_reference ? String(source_reference).trim() : null;
        if (remarks !== undefined) updateBody.remarks = remarks ? String(remarks).trim() : null;

        const res = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots/${batchId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updateBody)
        });

        if (!res.ok) {
            const errTxt = await res.text();
            let errMsg = `Directus mm_inventory_lots update failed: ${res.status}`;
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
        console.error("API Error updating batch:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to update batch" },
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
        const batchId = Number(id);
        if (isNaN(batchId)) {
            return NextResponse.json({ error: "Invalid batch ID" }, { status: 400 });
        }

        const res = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots/${batchId}`, {
            method: "DELETE",
            headers
        });

        if (!res.ok) {
            const errTxt = await res.text();
            let errMsg = `Directus mm_inventory_lots delete failed: ${res.status}`;
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
        console.error("API Error deleting batch:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to delete batch" },
            { status: 500 }
        );
    }
}
