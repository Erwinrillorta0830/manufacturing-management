import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const transferPayloadSchema = z.object({
    job_order_id: z.number().int().positive(),
    job_order_no: z.string().min(1),
    jo_material_id: z.number().int().nonnegative().optional(),
    product_id: z.number().int().positive(),
    lot_id: z.number().int().nonnegative().default(1),
    batch_no: z.string().min(1),
    transfer_quantity: z.number().positive("Transfer quantity must be greater than 0"),
    source_bin: z.string().default("MAIN-STORE"),
    target_bin: z.string().min(1),
    work_center_id: z.number().int().positive(),
    override_negative: z.boolean().default(false),
    remarks: z.string().optional()
});

async function getUserIdFromSession(): Promise<number> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (token) {
            const parts = token.split(".");
            if (parts.length >= 2) {
                let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                while (base64.length % 4) base64 += "=";
                const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                const payload = JSON.parse(jsonPayload);
                const rawId = payload?.id || payload?.user_id || payload?.sub;
                if (rawId && !isNaN(Number(rawId))) return Number(rawId);
            }
        }
    } catch (e) {
        console.error("[Material Staging Transfer] Session resolution error:", e);
    }
    return 1; // Fallback admin
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const parseResult = transferPayloadSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json(
                { success: false, error: "Invalid transfer parameters", details: parseResult.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const data = parseResult.data;
        const userId = await getUserIdFromSession();

        // 1. Check physical on-hand stock for the product in MAIN-STORE from inventory_movements
        const movFilter = encodeURIComponent(JSON.stringify({
            product_id: { _eq: data.product_id }
        }));
        const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?filter=${movFilter}&limit=-1`, {
            headers,
            cache: "no-store"
        });

        const movements: Array<{ quantity?: number; batch_no?: string }> = movRes.ok ? (await movRes.json()).data || [] : [];
        
        let onHandStock = 0;
        let batchStock = 0;

        movements.forEach((m) => {
            const qty = Number(m.quantity || 0);
            onHandStock += qty;
            if ((m.batch_no || "").trim().toLowerCase() === data.batch_no.trim().toLowerCase()) {
                batchStock += qty;
            }
        });

        // If specific batch has no dedicated records, consider general onHandStock
        const availableStock = batchStock > 0 ? batchStock : onHandStock;

        // 2. Shortage Check: If insufficient stock and override_negative is FALSE, return shortage warning
        if (availableStock < data.transfer_quantity && !data.override_negative) {
            const shortageQty = Math.max(0, data.transfer_quantity - availableStock);
            return NextResponse.json(
                {
                    success: false,
                    shortage: true,
                    message: `Insufficient stock in ${data.source_bin}. Available: ${availableStock.toFixed(2)}, Required: ${data.transfer_quantity.toFixed(2)}, Shortage: ${shortageQty.toFixed(2)}`,
                    product_id: data.product_id,
                    batch_no: data.batch_no,
                    available_quantity: availableStock,
                    required_quantity: data.transfer_quantity,
                    shortage_quantity: shortageQty,
                    source_bin: data.source_bin,
                    target_bin: data.target_bin
                },
                { status: 409 }
            );
        }

        // 3. Post Inventory Transfer Movements
        const transferRemarks = data.override_negative
            ? `[NEGATIVE OVERRIDE] Bin Transfer ${data.source_bin} -> ${data.target_bin} for JO #${data.job_order_no}. Note: ${data.remarks || 'Authorized floor hold override'}`
            : `Bin Transfer ${data.source_bin} -> ${data.target_bin} for JO #${data.job_order_no}. Note: ${data.remarks || 'Standard staging'}`;

        const movementsPayload = [
            // Outbound from MAIN-STORE
            {
                product_id: data.product_id,
                lot_id: data.lot_id || 1,
                branch_id: 1,
                transaction_type_id: 3, // Transfer Out / WIP Staging
                source_document_no: data.job_order_no,
                batch_no: data.batch_no,
                quantity: -data.transfer_quantity,
                created_by: userId,
                remarks: transferRemarks
            },
            // Inbound to Staging Bin
            {
                product_id: data.product_id,
                lot_id: data.lot_id || 1,
                branch_id: 1,
                transaction_type_id: 4, // Transfer In / Floor Staging Hold
                source_document_no: data.job_order_no,
                batch_no: data.batch_no,
                quantity: data.transfer_quantity,
                created_by: userId,
                remarks: transferRemarks
            }
        ];

        const postMovRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
            method: "POST",
            headers,
            body: JSON.stringify(movementsPayload)
        });

        if (!postMovRes.ok) {
            console.error("[Material Staging Transfer] Failed to post movements:", await postMovRes.text());
        }

        // 4. Update / Insert allocations & reservations in Directus
        // Check if allocation row already exists
        const allocFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { job_order_id: { _eq: data.job_order_id } },
                { product_id: { _eq: data.product_id } }
            ]
        }));

        try {
            const checkAllocRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter=${allocFilter}&limit=1`, {
                headers,
                cache: "no-store"
            });
            const existingAllocs = checkAllocRes.ok ? (await checkAllocRes.json()).data || [] : [];

            if (existingAllocs.length > 0) {
                const allocId = existingAllocs[0].allocation_id || existingAllocs[0].id;
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations/${allocId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        staging_bin: data.target_bin,
                        reservation_status: "HARD",
                        allocated_quantity: data.transfer_quantity,
                        batch_no: data.batch_no,
                        override_negative: data.override_negative
                    })
                });
            } else {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        job_order_id: data.job_order_id,
                        jo_material_id: data.jo_material_id || null,
                        product_id: data.product_id,
                        lot_id: data.lot_id || 1,
                        batch_no: data.batch_no,
                        allocated_quantity: data.transfer_quantity,
                        staging_bin: data.target_bin,
                        reservation_status: "HARD",
                        override_negative: data.override_negative,
                        created_at: new Date().toISOString()
                    })
                });
            }
        } catch (allocErr) {
            console.error("[Material Staging Transfer] Allocations update error:", allocErr);
        }

        // 5. Update manufacturing_job_order_materials reservation status to HARD
        if (data.jo_material_id) {
            try {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${data.jo_material_id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        reserved_quantity: data.transfer_quantity,
                        reservation_status: "HARD",
                        staging_bin: data.target_bin
                    })
                });
            } catch (matErr) {
                console.error("[Material Staging Transfer] Material status update error:", matErr);
            }
        }

        // 6. Check if all materials for this Job Order are now HARD reserved
        // If so, update Job Order status to "RESERVED" (or "RESERVED / READY")
        try {
            const allMatsRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${data.job_order_id}&limit=-1`, {
                headers,
                cache: "no-store"
            });
            if (allMatsRes.ok) {
                const mats = (await allMatsRes.json()).data || [];
                const allHard = mats.length > 0 && mats.every((m: { reservation_status?: string; staging_bin?: string }) =>
                    m.reservation_status === "HARD" || (m.staging_bin && m.staging_bin.startsWith("FLOOR-STAGING"))
                );

                if (allHard) {
                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${data.job_order_id}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({
                            status: "RESERVED"
                        })
                    });
                }
            }
        } catch (joErr) {
            console.error("[Material Staging Transfer] Job Order status update check error:", joErr);
        }

        return NextResponse.json({
            success: true,
            message: `Material successfully staged to ${data.target_bin}. Allocation status updated to HARD (RESERVED / READY).`,
            data: {
                job_order_id: data.job_order_id,
                product_id: data.product_id,
                batch_no: data.batch_no,
                target_bin: data.target_bin,
                transfer_quantity: data.transfer_quantity,
                reservation_status: "HARD",
                override_negative: data.override_negative
            }
        });

    } catch (e) {
        console.error("[Material Staging Transfer API] Fatal Error:", e);
        return NextResponse.json(
            { success: false, error: (e as Error).message || "Failed to execute bin transfer" },
            { status: 500 }
        );
    }
}
