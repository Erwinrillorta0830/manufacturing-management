import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { canonicalBatchNumber } from "@/app/api/manufacturing/procurement/_domain";
import { movementStockKey, sumMovementQuantitiesByStock, uniqueRowsByMovementStockKey } from "@/app/api/manufacturing/qa-receiving/_movement-stock";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";


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
        type_name?: string | null;
    } | null;
    version_id?: number | { version_id?: number } | null;
    expiry_date?: string | null;
    created_at?: string | null;
    source_document_no?: string | null;
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
        const [ledgerRes, movementsRes, productsRes, branchesRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/product_ledger?limit=100&sort=-id`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/inventory_movements?fields=*,lot_id.lot_id,lot_id.lot_name,version_id.version_id,transaction_type_id.type_name&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/products?limit=500&fields=product_id,product_name,product_code,product_brand.brand_id,product_brand.brand_name,product_category.category_id,product_category.category_name,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,cost_per_unit,product_shelf_life,parent_id,product_type`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/branches?limit=-1`, { headers, cache: "no-store" })
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

        const rawMovements = (await movementsRes.json()).data || [];
        const productsData = (await productsRes.json()).data || [];
        const branches = (await branchesRes.json()).data || [];

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

            const qaStatus = batchStatusMap.get(lookupKey) || "Passed";
            const expiryDate = batchExpiryMap.get(lookupKey) || creationMvt.expiry_date || null;
            const createdOnVal = batchCreatedMap.get(lookupKey) || creationMvt.created_at || null;

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
                version_id: creationMvt.version_id ? (typeof creationMvt.version_id === "object" ? creationMvt.version_id.version_id : creationMvt.version_id) : null
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
        const inventoryLotIds = porData.map((batch: InventoryLot) => Number(batch.id)).filter(Boolean);
        const stockKeyByInventoryLot = new Map<number, string>(porData.map((batch: InventoryLot) => [
            Number(batch.id),
            movementStockKey(batch as unknown as Record<string, unknown>),
        ]));
        const reservedByStockKey = new Map<string, number>();
        if (inventoryLotIds.length > 0) {
            const reservationRes = await fetch(
                `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[inventory_lot_id][_in]=${inventoryLotIds.join(",")}&filter[status][_eq]=Reserved&fields=inventory_lot_id,quantity&limit=-1`,
                { headers, cache: "no-store" }
            );
            if (!reservationRes.ok) throw new Error("Failed to fetch active invoice reservations from Directus");
            const reservations: { inventory_lot_id: number | { id?: number }; quantity: number | string }[] = (await reservationRes.json()).data || [];
            for (const reservation of reservations) {
                const inventoryLotId = typeof reservation.inventory_lot_id === "object"
                    ? Number(reservation.inventory_lot_id?.id || 0)
                    : Number(reservation.inventory_lot_id || 0);
                const key = stockKeyByInventoryLot.get(inventoryLotId);
                if (!key) continue;
                reservedByStockKey.set(
                    key,
                    (reservedByStockKey.get(key) || 0) + Number(reservation.quantity || 0)
                );
            }
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
                transaction_type: resolvedTxnType
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



