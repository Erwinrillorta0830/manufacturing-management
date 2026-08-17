/* eslint-disable */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");
        const batchNo = searchParams.get("batchNo");

        if (!joId && !batchNo) {
            return NextResponse.json({ error: "Missing joId or batchNo query parameter" }, { status: 400 });
        }

        // Fetch genealogy records
        let genUrl = `${DIRECTUS_URL}/items/jo_material_genealogy?limit=-1&sort=-created_at`;
        if (joId) {
            genUrl += `&filter[job_order_id][_eq]=${joId}`;
        }
        if (batchNo) {
            genUrl += `&filter[finished_batch_no][_eq]=${encodeURIComponent(batchNo)}`;
        }

        const [genRes, prodsRes, usersRes, movRes] = await Promise.all([
            fetch(genUrl, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,unit_of_measurement.unit_shortcut`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/inventory_movements?filter[source_document_id][_eq]=${joId}&limit=-1&sort=-created_on`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        const rawGen = genRes && genRes.ok ? (await genRes.json()).data || [] : [];
        const prods = prodsRes && prodsRes.ok ? (await prodsRes.json()).data || [] : [];
        const users = usersRes && usersRes.ok ? (await usersRes.json()).data || [] : [];
        const movements = movRes && movRes.ok ? (await movRes.json()).data || [] : [];

        const prodMap = new Map<number, { name: string; uom: string }>();
        prods.forEach((p: any) => {
            prodMap.set(Number(p.product_id), {
                name: p.product_name,
                uom: p.unit_of_measurement?.unit_shortcut || "units"
            });
        });

        const userMap = new Map<number, string>();
        users.forEach((u: any) => {
            const name = [u.user_fname, u.user_lname].filter(Boolean).join(" ") || `User #${u.user_id}`;
            userMap.set(Number(u.user_id), name);
        });

        const enrichedGenealogy = rawGen.map((g: any) => {
            const prodInfo = prodMap.get(Number(g.raw_product_id));
            return {
                ...g,
                raw_product_name: prodInfo?.name || `Product #${g.raw_product_id}`,
                unit_shortcut: prodInfo?.uom || "units",
                created_by_name: userMap.get(Number(g.created_by)) || (g.created_by ? `User #${g.created_by}` : "Operator")
            };
        });

        // Also enrich backflushed inventory movements
        const enrichedMovements = movements.map((m: any) => {
            const prodInfo = prodMap.get(Number(m.product_id?.product_id || m.product_id));
            return {
                ...m,
                product_name: prodInfo?.name || `Product #${m.product_id}`,
                unit_shortcut: prodInfo?.uom || "units",
                created_by_name: userMap.get(Number(m.created_by)) || (m.created_by ? `User #${m.created_by}` : "Operator")
            };
        });

        return NextResponse.json({
            success: true,
            genealogy: enrichedGenealogy,
            movements: enrichedMovements
        });
    } catch (e: any) {
        console.error("Error in genealogy GET API:", e);
        return NextResponse.json({ error: e.message || "Failed to load genealogy records" }, { status: 500 });
    }
}
