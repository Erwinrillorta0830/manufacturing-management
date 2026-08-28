import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { canonicalBatchNumber } from "@/app/api/manufacturing/procurement/_domain";
import { movementStockKey, sumMovementQuantitiesByStock, uniqueRowsByMovementStockKey } from "@/app/api/manufacturing/qa-receiving/_movement-stock";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";
import { resolveJobOrderRelationship } from "./_job-order-relationships";


interface InventoryLot {
    id: number;
    product_id: number;
    branch_id: number;
    lot_number?: string;
    batch_no?: string;
    lot_id?: number | { lot_id: number; lot_name?: string } | null;
    expiry_date?: string | null;
    quantity?: string | number;
    unit_cost?: string | number;
    qa_status?: string;
    rejection_reason?: string | null;
    created_on?: string | null;
    source_reference?: string | null;
    source_type?: string | null;
    remarks?: string | null;
    version_id?: number | null;
    job_order_id?: number | null;
    job_order_no?: string | null;
    job_order_relationship_status?: "linked" | "unlinked" | "ambiguous";
    reserved_quantity?: number;
    on_hand_quantity?: number;
    available_quantity?: number;
}

interface LedgerEntry {
    quantity?: string | number;
}

interface DirectusMovementRaw {
    movement_id: number;
    product_id: number | { product_id?: number };
    branch_id: number | { id?: number };
    lot_id: number | { lot_id?: number; lot_name?: string } | null;
    batch_no?: string | null;
    quantity: number | string;
    remarks?: string | null;
    transaction_type_id?: number | {
        transaction_type_id?: number | null;
        type_name?: string | null;
    } | null;
    version_id?: number | { version_id?: number } | null;
    expiry_date?: string | null;
    created_at?: string | null;
    source_document_id?: number | { id?: number; job_order_id?: number } | null;
    source_document_no?: string | null;
}

interface DirectusJobOrderRaw {
    job_order_id?: number | null;
    job_order_no?: string | null;
}

interface DirectusFinalQAReleaseRaw {
    lot_id?: number | { lot_id?: number; id?: number } | null;
    overall_disposition?: string | null;
    approved_at?: string | null;
}

interface DirectusReceiptRaw {
    product_id: number | { product_id?: number | null } | null;
    batch_no?: string | null;
    lot_no?: string | null;
    qa_status?: string | null;
    expiry_date?: string | null;
    received_date?: string | null;
    final_landed_unit_cost?: number | string | null;
    unit_price?: number | string | null;
}

interface DirectusYieldRaw {
    job_order_id?: {
        product_id?: number | null;
        job_order_no?: string | null;
    } | null;
    lot_number?: string | null;
    qa_status?: string | null;
    logged_at?: string | null;
}

export async function GET() {
    try {
        const [ledgerRes, movementsRes, productsRes, branchesRes, jobOrdersRes, finalQARes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/product_ledger?limit=100&sort=-id`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/inventory_movements?fields=*,source_document_id,source_document_no,lot_id.lot_id,lot_id.lot_name,version_id.version_id,transaction_type_id.transaction_type_id,transaction_type_id.type_name&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/products?limit=500&fields=product_id,product_name,product_code,product_brand.brand_id,product_brand.brand_name,product_category.category_id,product_category.category_name,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,cost_per_unit,product_shelf_life,parent_id,product_type`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/branches?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?fields=job_order_id,job_order_no&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_final_qa_releases?fields=lot_id,overall_disposition,approved_at&limit=-1&sort=-approved_at`, { headers, cache: "no-store" })
        ]);

        let ledger = [];
        if (ledgerRes.ok) {
            try {
                ledger = (await ledgerRes.json()).data || [];
            } catch (e) {
                console.error("Failed to parse Directus product_ledger:", e);
            }
        } else {
            console.warn("Directus product_ledger fetch failed, using fallback entries.");
        }

        if (!movementsRes.ok) throw new Error("Failed to fetch inventory_movements from Directus");
        if (!productsRes.ok) throw new Error("Failed to fetch products from Directus");
        if (!branchesRes.ok) throw new Error("Failed to fetch branches from Directus");
        if (!jobOrdersRes.ok) throw new Error("Failed to fetch manufacturing_job_orders from Directus");

        const rawMovements = (await movementsRes.json()).data || [];
        const productsData = (await productsRes.json()).data || [];
        const branches = (await branchesRes.json()).data || [];
        const jobOrders = (await jobOrdersRes.json()).data as DirectusJobOrderRaw[] || [];
        const finalQaStatusByLotId = new Map<number, string>();
        if (finalQARes.ok) {
            const finalQaReleases = (await finalQARes.json()).data as DirectusFinalQAReleaseRaw[] || [];
            finalQaReleases.forEach((release) => {
                const lotId = typeof release.lot_id === "object" && release.lot_id
                    ? Number(release.lot_id.lot_id || release.lot_id.id || 0)
                    : Number(release.lot_id || 0);
                if (lotId <= 0 || finalQaStatusByLotId.has(lotId)) return;
                const disposition = String(release.overall_disposition || "").trim();
                const status = disposition === "Approved"
                    ? "Passed"
                    : disposition === "Rejected"
                        ? "Failed"
                        : disposition === "Quarantined"
                            ? "Quarantined"
                            : null;
                if (status) finalQaStatusByLotId.set(lotId, status);
            });
        } else {
            console.warn("Directus manufacturing_final_qa_releases fetch failed; retaining source QA statuses.");
        }

        const movementStock = sumMovementQuantitiesByStock(
            rawMovements as unknown as Array<Record<string, unknown>>
        );

        // Group movements by movementStockKey
        const movementsByKey = new Map<string, DirectusMovementRaw[]>();
        rawMovements.forEach((m: DirectusMovementRaw) => {
            const key = movementStockKey(m as unknown as Record<string, unknown>);
            if (key.startsWith("0:")) return; // Skip invalid product IDs
            const list = movementsByKey.get(key) || [];
            list.push(m);
            movementsByKey.set(key, list);
        });

        // Fetch corresponding QA status, expiry dates, and unit costs from sources
        const pIds = Array.from(new Set(rawMovements.map((m: DirectusMovementRaw) => {
            const prodId = typeof m.product_id === "object" ? m.product_id?.product_id : m.product_id;
            return Number(prodId);
        }).filter(Boolean)));
        const batchStatusMap = new Map<string, string>();
        const batchExpiryMap = new Map<string, string>();
        const batchCreatedMap = new Map<string, string>();
        const batchCostMap = new Map<string, number>();

        if (pIds.length > 0) {
            try {
                const recRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_in]=${pIds.join(",")}&limit=-1`, { headers, cache: "no-store" });
                if (recRes.ok) {
                    const receipts: DirectusReceiptRaw[] = (await recRes.json()).data || [];
                    receipts.forEach((rec) => {
                        const productIdVal = rec.product_id;
                        const productId = Number(
                            productIdVal && typeof productIdVal === "object"
                                ? productIdVal.product_id
                                : productIdVal
                        );
                        const batchNo = String(rec.batch_no || rec.lot_no || "LOT-N/A").trim() || "LOT-N/A";
                        const key = `${productId}:${batchNo}`;
                        batchStatusMap.set(key, rec.qa_status || "Passed");
                        if (rec.expiry_date) batchExpiryMap.set(key, rec.expiry_date);
                        if (rec.received_date) batchCreatedMap.set(key, rec.received_date);
                        const unitCost = Number(rec.final_landed_unit_cost || rec.unit_price || 0);
                        if (unitCost > 0) batchCostMap.set(key, unitCost);
                    });
                }
            } catch (err) {
                console.error("Error loading PO receipts for inventory status:", err);
            }

            try {
                const yieldRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_in]=${pIds.join(",")}&fields=*,job_order_id.product_id,job_order_id.job_order_no&limit=-1`, { headers, cache: "no-store" });
                if (yieldRes.ok) {
                    const yields: DirectusYieldRaw[] = (await yieldRes.json()).data || [];
                    yields.forEach((yl) => {
                        const productId = Number(yl.job_order_id?.product_id);
                        if (!productId) return;
                        const batchNo = String(yl.lot_number || `MFG-${yl.job_order_id?.job_order_no}`).trim() || "LOT-N/A";
                        const key = `${productId}:${batchNo}`;
                        batchStatusMap.set(key, yl.qa_status || "Pending");
                        if (yl.logged_at) batchCreatedMap.set(key, yl.logged_at);
                    });
                }
            } catch (err) {
                console.error("Error loading yield ledger for inventory status:", err);
            }
        }

        // Construct virtual inventory lots from aggregated movements
        const porData: InventoryLot[] = [];
        for (const [key, list] of movementsByKey.entries()) {
            const onHand = movementStock.get(key) || 0;
            if (onHand <= 0) continue; // Only show active stock levels!

            const creationMvt = list.find((m) => Number(m.quantity) > 0) || list[0];
            const lotIdObj = typeof creationMvt.lot_id === "object" && creationMvt.lot_id
                ? { lot_id: Number(creationMvt.lot_id.lot_id || 0), lot_name: creationMvt.lot_id.lot_name }
                : (typeof creationMvt.lot_id === "number" ? creationMvt.lot_id : null);

            const productId = Number(typeof creationMvt.product_id === "object" ? creationMvt.product_id?.product_id : creationMvt.product_id);
            const branchId = Number(typeof creationMvt.branch_id === "object" ? creationMvt.branch_id?.id : creationMvt.branch_id);
            const batchNo = String(creationMvt.batch_no || "LOT-N/A").trim() || "LOT-N/A";
            const lookupKey = `${productId}:${batchNo}`;

            // Resolve unit cost from PO receipt or fallback to product cost
            const product = productsData.find((p: { product_id: number }) => Number(p.product_id) === productId);
            const resolvedUnitCost = batchCostMap.get(lookupKey) || Number(product?.cost_per_unit || 0);

            const masterLotId = typeof lotIdObj === "object" && lotIdObj
                ? Number(lotIdObj.lot_id || 0)
                : Number(lotIdObj || 0);
            const qaStatus = finalQaStatusByLotId.get(masterLotId) || batchStatusMap.get(lookupKey) || "Passed";
            const expiryDate = batchExpiryMap.get(lookupKey) || creationMvt.expiry_date || null;
            const createdOnVal = batchCreatedMap.get(lookupKey) || creationMvt.created_at || null;
            const jobOrderRelationship = resolveJobOrderRelationship(list, jobOrders);

            porData.push({
                id: creationMvt.movement_id,
                product_id: productId,
                branch_id: branchId,
                lot_number: batchNo,
                batch_no: batchNo,
                lot_id: lotIdObj,
                expiry_date: expiryDate,
                quantity: onHand,
                unit_cost: resolvedUnitCost,
                qa_status: qaStatus,
                rejection_reason: null,
                created_on: createdOnVal,
                source_reference: creationMvt.source_document_no || null,
                source_type: typeof creationMvt.transaction_type_id === "object" ? creationMvt.transaction_type_id?.type_name || null : null,
                remarks: creationMvt.remarks || null,
                version_id: creationMvt.version_id ? (typeof creationMvt.version_id === "object" ? creationMvt.version_id.version_id : creationMvt.version_id) : null,
                job_order_id: jobOrderRelationship.jobOrderId,
                job_order_no: jobOrderRelationship.jobOrderNo,
                job_order_relationship_status: jobOrderRelationship.status
            });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const products = productsData.map((p: any) => {
            const productTypeId = p.product_type && typeof p.product_type === "object"
                ? Number(p.product_type.id)
                : Number(p.product_type);
            return {
                ...p,
                product_type: isNaN(productTypeId) ? null : productTypeId,
                is_finished_good: productTypeId === 388
            };
        });

        // Multiple receipts can point at the same physical stock key. Movements
        // already aggregate that key, so expose it once instead of double-counting it.
        const uniqueBatches = uniqueRowsByMovementStockKey(
            porData as Array<InventoryLot & Record<string, unknown>>
        );
        const reservedByStockKey = new Map<string, number>();
        const reservationRes = await fetch(
            `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[status][_eq]=Reserved&fields=id,quantity,inventory_lot_id.id,inventory_lot_id.product_id,inventory_lot_id.branch_id,inventory_lot_id.batch_no,inventory_lot_id.lot_number,inventory_lot_id.lot_id.lot_id,inventory_lot_id.lot_id&limit=-1`,
            { headers, cache: "no-store" }
        );
        if (!reservationRes.ok) throw new Error("Failed to fetch active invoice reservations from Directus");
        interface DirectusReservationLotRaw {
            product_id?: number;
            branch_id?: number;
            batch_no?: string | null;
            lot_number?: string | null;
            lot_id?: number | { lot_id?: number } | null;
        }
        interface DirectusReservationRaw {
            id: number;
            quantity: number | string;
            inventory_lot_id?: number | DirectusReservationLotRaw | null;
        }
        const reservations: DirectusReservationRaw[] = (await reservationRes.json()).data || [];
        for (const reservation of reservations) {
            const lotObj = typeof reservation.inventory_lot_id === "object" ? reservation.inventory_lot_id : null;
            if (!lotObj) continue;
            const productId = Number(lotObj.product_id || 0);
            const branchId = Number(lotObj.branch_id || 0);
            if (!productId) continue;
            const batchNo = String(lotObj.batch_no || lotObj.lot_number || "LOT-N/A").trim() || "LOT-N/A";
            const lotIdVal = typeof lotObj.lot_id === "object"
                ? Number(lotObj.lot_id?.lot_id || 0)
                : Number(lotObj.lot_id || 0);

            const key = movementStockKey({
                product_id: productId,
                branch_id: branchId,
                batch_no: batchNo,
                lot_id: lotIdVal || null
            });

            reservedByStockKey.set(
                key,
                (reservedByStockKey.get(key) || 0) + Number(reservation.quantity || 0)
            );
        }

        // Map virtual inventory lots to the Batch format expected by the frontend
        const batches = uniqueBatches.map((b: InventoryLot) => {
            const batchNo = canonicalBatchNumber(b.batch_no, b.lot_number);
            const lotId = typeof b.lot_id === "object" ? b.lot_id?.lot_id || null : b.lot_id || null;
            const lotName = typeof b.lot_id === "object" ? b.lot_id?.lot_name || null : null;

            // Find matching movements in memory
            const stockMovements = movementsByKey.get(movementStockKey(b as unknown as Record<string, unknown>)) || [];
            const creationMvt = stockMovements.find((m: DirectusMovementRaw) => Number(m.quantity) > 0) || stockMovements[0];
            const versionId = typeof creationMvt?.version_id === "object"
                ? Number(creationMvt.version_id?.version_id || 0) || null
                : Number(creationMvt?.version_id || 0) || null;

            const txnTypeName = typeof creationMvt?.transaction_type_id === "object"
                ? creationMvt.transaction_type_id?.type_name
                : null;

            const resolvedTxnType = txnTypeName || (b.source_type ? String(b.source_type).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Legacy Stock");
            const resolvedRemarks = b.remarks || b.rejection_reason || creationMvt?.remarks || null;
            const onHand = movementStock.get(movementStockKey(b as unknown as Record<string, unknown>)) || 0;
            const reserved = Math.min(onHand, reservedByStockKey.get(movementStockKey(b as unknown as Record<string, unknown>)) || 0);
            const available = Math.max(0, onHand - reserved);

            return {
                line_id: b.id,
                product_id: b.product_id,
                version_id: versionId,
                branch_id: b.branch_id,
                batch_no: batchNo,
                lot_number: batchNo || "LOT-N/A",
                lot_id: lotId,
                lot_name: lotName,
                storage_assignment_state: lotId ? "assigned" : "legacy_unassigned",
                expiration_date: b.expiry_date,
                quantity_received: available,
                on_hand_quantity: onHand,
                reserved_quantity: reserved,
                available_quantity: available,
                base_unit_cost_php: Number(b.unit_cost || 0),
                allocated_expense_php: 0,
                final_landed_unit_cost: Number(b.unit_cost || 0),
                qa_status: b.qa_status,
                rejection_reason: b.rejection_reason || null,
                created_on: b.created_on,
                source_reference: b.source_reference || null,
                source_type: b.source_type || null,
                remarks: resolvedRemarks,
                transaction_type: resolvedTxnType,
                job_order_id: b.job_order_id ?? null,
                job_order_no: b.job_order_no ?? null,
                job_order_relationship_status: b.job_order_relationship_status || "unlinked"
            };
        });

        return NextResponse.json({
            ledger,
            batches,
            products,
            branches
        });
    } catch (e) {
        console.error("[Inventory BFF GET] Error:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch inventory logs" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { productId, branchId, quantity, documentType, documentDescription, documentDate } = body;

        if (!productId || !branchId || quantity === undefined) {
            return NextResponse.json({ error: "Missing required fields (productId, branchId, quantity)" }, { status: 400 });
        }

        const pId = Number(productId);
        const bId = Number(branchId);
        const qtyChange = Number(quantity);

        if (isNaN(pId) || isNaN(bId) || isNaN(qtyChange)) {
            return NextResponse.json({ error: "Invalid numeric formats for productId, branchId, or quantity" }, { status: 400 });
        }

        // If adjustment is a deduction, prevent stock from going below zero
        if (qtyChange < 0) {
            const ledgerRes = await fetch(`${DIRECTUS_URL}/items/product_ledger?filter[productId][_eq]=${pId}&filter[branchId][_eq]=${bId}&limit=-1`, { headers, cache: "no-store" });
            let currentStock = 0;
            let ledger = [];
            if (ledgerRes.ok) {
                ledger = (await ledgerRes.json()).data || [];
            }
            
            currentStock = ledger.reduce((sum: number, entry: LedgerEntry) => sum + (Number(entry.quantity) || 0), 0);

            if (currentStock + qtyChange < 0) {
                return NextResponse.json({ 
                    error: `Cannot complete adjustment. Insufficient stock (Available: ${currentStock.toLocaleString(undefined, { minimumFractionDigits: 2 })}, requested reduction: ${Math.abs(qtyChange).toLocaleString(undefined, { minimumFractionDigits: 2 })})` 
                }, { status: 400 });
            }
        }

        const docNo = `ADJ-${Math.floor(100000 + Math.random() * 900000)}`;

        const ledgerPayload = {
            productId: pId,
            branchId: bId,
            quantity: qtyChange,
            documentType: documentType || "Stock Adjustment",
            documentNo: docNo,
            documentDescription: documentDescription || "Manual Stock Take Adjustment",
            documentDate: documentDate || await getTodayDateString()
        };

        const res = await fetch(`${DIRECTUS_URL}/items/product_ledger`, {
            method: "POST",
            headers,
            body: JSON.stringify(ledgerPayload)
        });

        if (!res.ok) {
            const errTxt = await res.text();
            return NextResponse.json({ error: `Failed to save to cloud product ledger: ${res.status} - ${errTxt}` }, { status: res.status });
        }

        const saved = (await res.json()).data;
        return NextResponse.json({ success: true, data: saved });
    } catch (e) {
        console.error("[Inventory BFF POST] Error:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to post stock adjustment" }, { status: 500 });
    }
}



