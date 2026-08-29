import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { MovementRow } from "../inventory-movements-client";
import { getUserIdFromToken } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TXN_TYPE_SALES_ISSUE = 4;

export interface LotAllocationDetail {
    productId: number;
    productName: string;
    lotId: number;
    lotName: string;
    batchNo: string;
    expiryDate: string | null;
    manufacturingDate: string | null;
    quantity: number;
}

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const batchId = searchParams.get("batchId");

        if (!batchId) {
            return NextResponse.json({ message: "batchId is required" }, { status: 400 });
        }

        const linksRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!linksRes.ok) {
            return NextResponse.json({ message: "Failed to load linked invoices" }, { status: 502 });
        }
        const invoiceIds: number[] = ((await linksRes.json()).data || [])
            .map((row: { invoice_id: number }) => Number(row.invoice_id))
            .filter(Boolean);

        if (invoiceIds.length > 0) {
            const detailsRes = await fetch(
                `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&fields=detail_id,product_id&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (!detailsRes.ok) {
                return NextResponse.json({ message: "Failed to load invoice details" }, { status: 502 });
            }
            const details: { detail_id: number; product_id: number }[] = (await detailsRes.json()).data || [];
            const detailIds = details.map((detail) => Number(detail.detail_id)).filter(Boolean);
            const productByDetail = new Map(details.map((detail) => [Number(detail.detail_id), Number(detail.product_id)]));

            if (detailIds.length > 0) {
                const reservationFilter = encodeURIComponent(JSON.stringify({
                    _and: [
                        { sales_invoice_detail_id: { _in: detailIds } },
                        { status: { _in: ["Reserved", "Consumed"] } },
                    ],
                }));
                const reservationRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_invoice_reservation?filter=${reservationFilter}`
                    + `&fields=sales_invoice_detail_id,inventory_lot_id.id,inventory_lot_id.lot_id.lot_id,inventory_lot_id.lot_id.lot_name,inventory_lot_id.lot_number,inventory_lot_id.batch_no,inventory_lot_id.expiry_date,inventory_lot_id.created_on,quantity,status&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (!reservationRes.ok) {
                    return NextResponse.json({ message: "Failed to load invoice reservations" }, { status: 502 });
                }

                type ReservationAllocation = {
                    sales_invoice_detail_id: number;
                    inventory_lot_id: {
                        id: number;
                        lot_id: { lot_id: number; lot_name: string | null } | number | null;
                        lot_number: string | null;
                        batch_no: string | null;
                        expiry_date: string | null;
                        created_on: string | null;
                    } | number;
                    quantity: number;
                };
                const reservations: ReservationAllocation[] = (await reservationRes.json()).data || [];
                if (reservations.length > 0) {
                    const productIds = [...new Set(details.map((detail) => Number(detail.product_id)).filter(Boolean))];
                    const productNameMap = new Map<number, string>();
                    const prodRes = await fetch(
                        `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (prodRes.ok) {
                        const products: { product_id: number; product_name: string }[] = (await prodRes.json()).data || [];
                        for (const product of products) productNameMap.set(Number(product.product_id), product.product_name);
                    }

                    const allocationMap = new Map<string, LotAllocationDetail>();
                    for (const reservation of reservations) {
                        const detailId = Number(reservation.sales_invoice_detail_id);
                        const productId = productByDetail.get(detailId) || 0;
                        const inventoryLot = typeof reservation.inventory_lot_id === "object" ? reservation.inventory_lot_id : null;
                        const physicalLot = inventoryLot && typeof inventoryLot.lot_id === "object" ? inventoryLot.lot_id : null;
                        if (!productId || !inventoryLot || !physicalLot) continue;
                        const key = `${productId}:${inventoryLot.id}`;
                        const existing = allocationMap.get(key);
                        if (existing) {
                            existing.quantity += Number(reservation.quantity || 0);
                        } else {
                            allocationMap.set(key, {
                                productId,
                                productName: productNameMap.get(productId) || `Product #${productId}`,
                                lotId: Number(physicalLot.lot_id),
                                lotName: physicalLot.lot_name || `Lot #${physicalLot.lot_id}`,
                                batchNo: inventoryLot.batch_no || inventoryLot.lot_number || "LOT-N/A",
                                expiryDate: inventoryLot.expiry_date,
                                manufacturingDate: inventoryLot.created_on?.slice(0, 10) || null,
                                quantity: Number(reservation.quantity || 0),
                            });
                        }
                    }
                    const allocations = [...allocationMap.values()].sort((a, b) =>
                        a.productName.localeCompare(b.productName)
                        || (a.expiryDate || "9999-12-31").localeCompare(b.expiryDate || "9999-12-31")
                        || a.lotId - b.lotId
                    );
                    if (allocations.length > 0) return NextResponse.json({ allocations });
                }
            }
        }

        // Legacy fallback for batches completed before reservation-backed picking.
        const movRes = await fetch(
            `${DIRECTUS_URL}/items/inventory_movements`
            + `?filter[source_document_id][_eq]=${batchId}`
            + `&filter[transaction_type_id][_eq]=${TXN_TYPE_SALES_ISSUE}`
            + `&limit=500`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!movRes.ok) {
            return NextResponse.json({ message: "Failed to load movements" }, { status: 502 });
        }

        const movements: MovementRow[] = (await movRes.json()).data || [];

        const netMap = new Map<string, { productId: number; lotId: number; batchNo: string; expiryDate: string | null; manufacturingDate: string | null; netQty: number }>();

        for (const m of movements) {
            const key = `${m.product_id}:${m.lot_id}:${m.batch_no}:${m.expiry_date || ""}:${m.manufacturing_date || ""}`;
            const existing = netMap.get(key);
            const qty = Number(m.quantity || 0);
            if (existing) {
                existing.netQty += qty;
            } else {
                netMap.set(key, {
                    productId: m.product_id,
                    lotId: m.lot_id,
                    batchNo: m.batch_no,
                    expiryDate: m.expiry_date,
                    manufacturingDate: m.manufacturing_date,
                    netQty: qty,
                });
            }
        }

        const netNegative: { productId: number; lotId: number; batchNo: string; expiryDate: string | null; manufacturingDate: string | null; netQty: number }[] = [];
        for (const entry of netMap.values()) {
            if (entry.netQty < 0) {
                netNegative.push({ ...entry, netQty: Math.abs(entry.netQty) });
            }
        }

        if (netNegative.length === 0) {
            return NextResponse.json({ allocations: [] });
        }

        const productIds = [...new Set(netNegative.map((a) => a.productId))];
        const prodRes = await fetch(
            `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        const productNameMap = new Map<number, string>();
        if (prodRes.ok) {
            const prodData: { product_id: number; product_name: string }[] = (await prodRes.json()).data || [];
            for (const p of prodData) productNameMap.set(p.product_id, p.product_name);
        }

        const lotIds = [...new Set(netNegative.map((a) => a.lotId))];
        const lotRes = await fetch(
            `${DIRECTUS_URL}/items/mm_lots?filter[lot_id][_in]=${lotIds.join(",")}&fields=lot_id,lot_name&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        const lotNameMap = new Map<number, string>();
        if (lotRes.ok) {
            const lotData: { lot_id: number; lot_name: string }[] = (await lotRes.json()).data || [];
            for (const l of lotData) lotNameMap.set(l.lot_id, l.lot_name);
        }

        const allocations: LotAllocationDetail[] = netNegative.map((a) => ({
            productId: a.productId,
            productName: productNameMap.get(a.productId) || `Product #${a.productId}`,
            lotId: a.lotId,
            lotName: lotNameMap.get(a.lotId) || `Lot #${a.lotId}`,
            batchNo: a.batchNo,
            expiryDate: a.expiryDate,
            manufacturingDate: a.manufacturingDate,
            quantity: a.netQty,
        }));

        return NextResponse.json({ allocations });
    } catch (e) {
        console.error("allocations GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
