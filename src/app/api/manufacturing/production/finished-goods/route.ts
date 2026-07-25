/* eslint-disable */
import { NextResponse } from "next/server";

interface LedgerEntry {
    id: number;
    documentNo: string;
    documentDate?: string;
    documentDescription?: string;
    productId: string | number;
    quantity: string | number;
    branchId: string | number;
    documentType?: string;
}

interface Product {
    product_id: number;
    product_name?: string;
    cost_per_unit?: string | number;
}

interface InventoryLot {
    id: number;
    lot_number: string;
    expiry_date?: string | null;
    unit_cost?: string | number;
    quantity?: string | number;
    created_on?: string;
    qa_status?: string;
}

interface ConsumeComponentBody {
    component_product_id?: string | number;
    product_id?: string | number;
    required?: string | number;
    quantity?: string | number;
    component_name?: string;
    product_name?: string;
}

interface ComponentConsumed {
    component_product_id: number;
    product_id?: string | number;
    required?: string | number;
    quantity?: string | number;
    scaledQuantity: number;
    component_name?: string;
    product_name?: string;
}

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://vtc:8074";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");

        // Fetch product ledger entries representing finished goods releases
        let ledgerUrl = `${DIRECTUS_URL}/items/product_ledger?filter[documentType][_in]=QA Receive,Job Order Receipt&filter[quantity][_gt]=0&limit=-1&sort=-id`;
        if (joId) {
            ledgerUrl += `&filter[documentNo][_eq]=${encodeURIComponent(joId)}`;
        }
        const ledgerRes = await fetch(ledgerUrl, { headers, cache: "no-store" });
        if (!ledgerRes.ok) {
            const errTxt = await ledgerRes.text();
            return NextResponse.json({ error: `Failed to fetch cloud product ledger: ${ledgerRes.status} - ${errTxt}` }, { status: ledgerRes.status });
        }
        const ledgerEntries = (await ledgerRes.json()).data || [];

        // Fetch products and inventory lots to resolve names, lot number details and unit cost
        const [productsRes, porRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,cost_per_unit`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/inventory_lots?limit=-1`, { headers, cache: "no-store" })
        ]);

        const products: Product[] = productsRes.ok ? (await productsRes.json()).data || [] : [];
        const porData: InventoryLot[] = porRes.ok ? (await porRes.json()).data || [] : [];

        const data = ledgerEntries.map((entry: LedgerEntry) => {
            const lotNumber = entry.documentDescription?.startsWith("MFG Run: ")
                ? entry.documentDescription.substring("MFG Run: ".length)
                : (entry.documentDescription || `MFG-${entry.documentNo}`);

            const matchedProduct = products.find((p: Product) => Number(p.product_id) === Number(entry.productId));
            const matchedPOR = porData.find((p: InventoryLot) => p.lot_number === lotNumber);

            return {
                id: matchedPOR?.id || entry.id,
                jo_id: entry.documentNo,
                product_id: Number(entry.productId),
                product_name: matchedProduct?.product_name || "Manufactured Good",
                quantity_produced: Number(entry.quantity),
                quantity: Number(entry.quantity),
                branch_id: Number(entry.branchId),
                lot_number: lotNumber,
                qa_status: matchedPOR?.qa_status || "Pending",
                expiration_date: matchedPOR?.expiry_date || entry.documentDate || new Date().toISOString().split('T')[0],
                unit_cost: Number(matchedPOR?.unit_cost || matchedProduct?.cost_per_unit || 0),
                date_received: entry.documentDate ? `${entry.documentDate}T12:00:00.000Z` : new Date().toISOString()
            };
        });

        return NextResponse.json(data);
    } catch (e) {
        console.error("API Error in production finished-goods GET:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch finished goods receipts" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { joId, productId, productName, quantityProduced, branchId, lotNumber, expirationDate, manufacturingDate, unitCost, componentsConsumed, completeJobOrder = true } = body;

        if (!joId || !productId || !quantityProduced || !branchId) {
            return NextResponse.json({ error: "Missing required fields (joId, productId, quantityProduced, branchId)" }, { status: 400 });
        }

        // Helper function to resolve or create master lot in the lots table
        const resolveMasterLotId = async (name: string, typeId: number) => {
            let lotId = 49; // Default fallback to a valid existing lot ID (e.g. 49) instead of 1
            const mappedTypeId = typeId === 1 ? 390 : 389;
            try {
                const lotQuery = encodeURIComponent(JSON.stringify({ lot_name: { _eq: name } }));
                const lotLookupRes = await fetch(`${DIRECTUS_URL}/items/lots?filter=${lotQuery}&limit=1`, { headers, cache: "no-store" });
                const lotLookup = lotLookupRes.ok ? (await lotLookupRes.json()).data || [] : [];
                if (lotLookup.length > 0) {
                    lotId = lotLookup[0].lot_id;
                } else {
                    const createLotRes = await fetch(`${DIRECTUS_URL}/items/lots`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            lot_name: name,
                            inventory_type_id: mappedTypeId,
                            max_batch_capacity: 100000,
                            created_by: 24
                        })
                    });
                    if (createLotRes.ok) {
                        lotId = (await createLotRes.json()).data.lot_id;
                    } else {
                        console.error(`Failed to create master lot ${name}:`, await createLotRes.text());
                    }
                }
            } catch (err) {
                console.error(`Error resolving master lot ID for ${name}:`, err);
            }
            return lotId;
        };

        const qty = Number(quantityProduced);
        const bId = Number(branchId);
        const pId = Number(productId);
        const finalLotNo = lotNumber || `MFG-${joId}`;
        const finalExpDate = expirationDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Fetch planned quantity to scale raw material consumption dynamically based on actual yield vs planned yield
        let scaleFactor = 1;
        try {
            const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(joId)}&limit=1`, { headers });
            if (joRes.ok) {
                const joData = (await joRes.json()).data || [];
                if (joData.length > 0) {
                    const plannedQty = Number(joData[0].target_quantity) || 0;
                    if (plannedQty > 0) {
                        scaleFactor = qty / plannedQty;
                        console.log(`[BFF Finished Goods] Dynamic scaling factor: ${scaleFactor} (Actual: ${qty}, Planned: ${plannedQty})`);
                    }
                }
            }
        } catch (scaleErr) {
            console.error("[BFF Finished Goods] Error calculating raw material scale factor:", scaleErr);
        }

        const scaledComponents: ComponentConsumed[] = (componentsConsumed && Array.isArray(componentsConsumed))
            ? componentsConsumed.map((comp: ConsumeComponentBody) => {
                const compId = Number(comp.component_product_id || comp.product_id);
                const baseQty = Number(comp.required || comp.quantity || 0);
                return {
                    ...comp,
                    component_product_id: compId,
                    scaledQuantity: baseQty * scaleFactor
                };
            })
            : [];

        // Strict Inventory Sufficiency Check for Consumed Components using cloud product ledger
        if (scaledComponents.length > 0) {
            const compIds = scaledComponents
                .map(c => c.component_product_id)
                .filter(id => !isNaN(id) && id > 0);

            if (compIds.length > 0) {
                const compIdsStr = compIds.join(",");
                let ledgerData: LedgerEntry[] = [];
                try {
                    const ledgerRes = await fetch(`${DIRECTUS_URL}/items/product_ledger?filter[productId][_in]=${compIdsStr}&filter[branchId][_eq]=${bId}&limit=-1`, { 
                        headers, 
                        cache: "no-store" 
                    });
                    if (ledgerRes.ok) {
                        ledgerData = (await ledgerRes.json()).data || [];
                    } else {
                        console.error("[BFF Finished Goods] Failed to fetch ledger items for stock checks:", await ledgerRes.text());
                    }
                } catch (ledgerErr) {
                    console.error("[BFF Finished Goods] Ledger stock check request failed:", ledgerErr);
                }

                // Map product ID to current accumulated stock
                const stockMap: Record<number, number> = {};
                compIds.forEach(id => {
                    stockMap[id] = 0;
                });

                ledgerData.forEach(entry => {
                    const pId = Number(entry.productId);
                    const entryQty = Number(entry.quantity) || 0;
                    if (stockMap[pId] !== undefined) {
                        stockMap[pId] += entryQty;
                    }
                });

                const insufficient: string[] = [];
                for (const comp of scaledComponents) {
                    const compId = comp.component_product_id;
                    const compQtyRequired = comp.scaledQuantity;
                    const compName = comp.component_name || comp.product_name || `Component #${compId}`;

                    if (compId && compQtyRequired > 0) {
                        const available = stockMap[compId] || 0;
                        if (available < compQtyRequired) {
                            insufficient.push(`${compName} (Needed: ${compQtyRequired.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Available: ${available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`);
                        }
                    }
                }

                if (insufficient.length > 0) {
                    return NextResponse.json({ 
                        error: `You have insufficient stock for: ${insufficient.join(", ")}` 
                    }, { status: 400 });
                }
            }
        }

        const newReceipt = {
            id: Date.now(),
            jo_id: joId,
            product_id: pId,
            product_name: productName || "Manufactured Good",
            quantity_produced: qty,
            branch_id: bId,
            lot_number: finalLotNo,
            expiration_date: finalExpDate,
            unit_cost: Number(unitCost || 0),
            date_received: new Date().toISOString()
        };

        // 1. Automatically register finished goods into the decoupled inventory_lots collection
        let insertedLotId = 0;
        let skipStockOperations = false;
        try {
            // Check if there is an existing lot and movement already registered for this JO yield (e.g. from shift run logs)
            const existingLotsRes = await fetch(`${DIRECTUS_URL}/items/inventory_lots?filter[_and][0][product_id][_eq]=${pId}&filter[_and][1][lot_number][_eq]=${encodeURIComponent(finalLotNo)}&filter[_and][2][branch_id][_eq]=${bId}&limit=1`, { headers, cache: "no-store" });
            if (existingLotsRes.ok) {
                const existingLots = (await existingLotsRes.json()).data || [];
                if (existingLots.length > 0) {
                    insertedLotId = existingLots[0].id;
                    
                    // Check if there is already a positive finished goods movement for this lot and job order
                    const existingMvtRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?filter[_and][0][product_id][_eq]=${pId}&filter[_and][1][batch_no][_eq]=${encodeURIComponent(finalLotNo)}&filter[_and][2][source_document_no][_eq]=${encodeURIComponent(joId)}&filter[_and][3][transaction_type_id][_eq]=2&limit=1`, { headers, cache: "no-store" });
                    if (existingMvtRes.ok) {
                        const existingMvts = (await existingMvtRes.json()).data || [];
                        if (existingMvts.length > 0) {
                            skipStockOperations = true;
                            console.log(`[BFF Finished Goods] Prior yield lot and movement found for JO ${joId} and Lot ${finalLotNo}. Skipping stock operations to prevent duplicates.`);
                        }
                    }
                }
            }
        } catch (checkErr) {
            console.error("[BFF Finished Goods] Error checking for prior yield logs/movements:", checkErr);
        }

        if (!skipStockOperations) {
            try {
                const finishedLotId = await resolveMasterLotId(finalLotNo, 2); // 2 = Finished Goods
                const lotPayload = {
                    product_id: pId,
                    branch_id: bId,
                    lot_number: finalLotNo,
                    lot_id: finishedLotId,
                    expiry_date: finalExpDate,
                    quantity: 0,
                    unit_cost: Number(unitCost || 0),
                    qa_status: "Pending",
                    source_type: "manufacturing",
                    source_reference: joId,
                    created_on: manufacturingDate ? new Date(manufacturingDate).toISOString() : new Date().toISOString()
                };

                const lotRes = await fetch(`${DIRECTUS_URL}/items/inventory_lots`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(lotPayload)
                });

                if (!lotRes.ok) {
                    const errTxt = await lotRes.text();
                    console.error("[BFF Finished Goods] Failed to create cloud inventory lot record:", errTxt);
                    return NextResponse.json({ error: `Failed to register lot in cloud: ${lotRes.status} - ${errTxt}` }, { status: 500 });
                }
                const lotObj = await lotRes.json();
                insertedLotId = Number(lotObj.data?.id || lotObj.data?.lot_id || 0);

                // 1b. Log finished yield movement in inventory_movements ledger
                const finishedMovementPayload = {
                    product_id: pId,
                    lot_id: finishedLotId,
                    branch_id: bId,
                    transaction_type_id: 2, // Job Order Finished Goods
                    source_document_id: insertedLotId,
                    source_document_no: joId,
                    batch_no: finalLotNo,
                    expiry_date: finalExpDate,
                    manufacturing_date: manufacturingDate || new Date().toISOString().split('T')[0],
                    quantity: qty,
                    created_by: 24,
                    remarks: `Finished yield output from Job Order ${joId}`
                };
                const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(finishedMovementPayload)
                });
                if (!movRes.ok) {
                    console.error("[BFF Finished Goods] Failed to create positive inventory movement record:", await movRes.text());
                }
            } catch (err) {
                console.error("[BFF Finished Goods] Error recording stock yield:", err);
                return NextResponse.json({ error: "Failed to record finished goods lot and movement in cloud" }, { status: 500 });
            }
        }

        // 2. Create positive product_ledger entry for produced item
        const ledgerPosRes = await fetch(`${DIRECTUS_URL}/items/product_ledger`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                branchId: bId,
                productId: pId,
                quantity: qty,
                documentType: "Job Order Receipt",
                documentNo: joId,
                documentDescription: `MFG Run: ${finalLotNo}`,
                documentDate: new Date().toISOString().split('T')[0]
            })
        });
        if (!ledgerPosRes.ok) {
            console.error("[BFF Finished Goods] Failed to create positive product ledger record:", await ledgerPosRes.text());
        }

        // 3. Create negative product_ledger entries for consumed components (Deductions) and update inventory_lots
        if (scaledComponents.length > 0) {
            for (const comp of scaledComponents) {
                const compId = comp.component_product_id;
                const compQtyRequired = comp.scaledQuantity;

                if (compId && compQtyRequired > 0) {
                    console.log(`[BFF Finished Goods] Deducting raw material product ID ${compId} (${compQtyRequired} units) consumed for JO ${joId}...`);
                    
                    const ledgerNegRes = await fetch(`${DIRECTUS_URL}/items/product_ledger`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            branchId: bId,
                            productId: compId,
                            quantity: -compQtyRequired,
                            documentType: "Job Order Issue",
                            documentNo: joId,
                            documentDescription: `Consumed to produce: ${productName || "Finished Goods"}`,
                            documentDate: new Date().toISOString().split('T')[0]
                        })
                    });
                    if (!ledgerNegRes.ok) {
                        console.error(`[BFF Finished Goods] Failed to create deduction product ledger record for product ${compId}:`, await ledgerNegRes.text());
                    }

                    // Deduct from FIFO inventory lots ONLY IF we are not skipping stock operations
                    if (!skipStockOperations) {
                        try {
                            const filterQuery = encodeURIComponent(JSON.stringify({
                                _and: [
                                    { product_id: { _eq: compId } },
                                    { branch_id: { _eq: bId } },
                                    { qa_status: { _eq: "Passed" } }
                                ]
                            }));
                            const lotsRes = await fetch(`${DIRECTUS_URL}/items/inventory_lots?filter=${filterQuery}&sort=expiry_date,created_on&limit=-1`, { headers });
                            if (lotsRes.ok) {
                                const activeLots = (await lotsRes.json()).data || [];
                                
                                // Fetch inventory movements to calculate the true ledger stock
                                const movFilter = encodeURIComponent(JSON.stringify({
                                    _and: [
                                        { product_id: { _eq: compId } },
                                        { branch_id: { _eq: bId } }
                                    ]
                                }));
                                const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?filter=${movFilter}&limit=-1`, { headers, cache: "no-store" });
                                const movements = movRes.ok ? (await movRes.json()).data || [] : [];
                                const movementStockMap = new Map<string, number>();
                                movements.forEach((mov: any) => {
                                    const batchNo = mov.batch_no || "LOT-N/A";
                                    const qty = Number(mov.quantity || 0);
                                    movementStockMap.set(batchNo, (movementStockMap.get(batchNo) || 0) + qty);
                                });

                                // Map lots and enrich them with correct ledger quantity
                                const activeLotsEnriched = activeLots.map((lot: any) => {
                                    const lotNum = lot.lot_number || "LOT-N/A";
                                    const ledgerQty = movementStockMap.get(lotNum) || 0;
                                    return {
                                        ...lot,
                                        quantity: ledgerQty
                                    };
                                }).filter((lot: any) => lot.quantity > 0);

                                // Sort in JS to guarantee FIFO/FEFO
                                activeLotsEnriched.sort((a: any, b: any) => {
                                    if (a.expiry_date && b.expiry_date) {
                                        return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
                                    }
                                    if (a.expiry_date) return -1;
                                    if (b.expiry_date) return 1;
                                    return new Date(a.created_on || 0).getTime() - new Date(b.created_on || 0).getTime();
                                });

                                 let remainingToDeduct = compQtyRequired;
                                 for (const lot of activeLotsEnriched) {
                                     if (remainingToDeduct <= 0) break;
                                     const available = Number(lot.quantity || 0);
                                     const deduct = Math.min(available, remainingToDeduct);
                                     remainingToDeduct -= deduct;
                                     
                                     console.log(`[BFF Finished Goods] Deducting ${deduct} units from lot ID ${lot.id} (lot number: ${lot.lot_number}).`);
                                     
                                     // Log negative ledger movement in inventory_movements
                                     try {
                                         const consumedLotId = await resolveMasterLotId(lot.lot_number || "LOT-N/A", 1); // 1 = Raw Materials
                                         const componentMovementPayload = {
                                             product_id: compId,
                                             lot_id: consumedLotId,
                                             branch_id: bId,
                                             transaction_type_id: 1, // Job Order Consumage
                                             source_document_id: lot.id,
                                             source_document_no: joId,
                                             batch_no: lot.lot_number || "LOT-N/A",
                                             expiry_date: lot.expiry_date || null,
                                             manufacturing_date: lot.created_on ? lot.created_on.split("T")[0] : null,
                                             quantity: -deduct, // Negative for deduction
                                             created_by: 24,
                                             remarks: `Consumed from lot ${lot.lot_number || "N/A"} for JO yield`
                                         };
                                         const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
                                             method: "POST",
                                             headers,
                                             body: JSON.stringify(componentMovementPayload)
                                         });
                                         if (!movRes.ok) {
                                             console.error(`[BFF Finished Goods] Failed to create deduction movement record for product ${compId}:`, await movRes.text());
                                         }
                                     } catch (movErr) {
                                         console.error(`[BFF Finished Goods] Error creating deduction movement record for product ${compId}:`, movErr);
                                     }
                                 }
                            } else {
                                console.error(`[BFF Finished Goods] Failed to fetch active inventory lots for component ${compId}:`, await lotsRes.text());
                            }
                        } catch (lotDeductErr) {
                            console.error(`[BFF Finished Goods] Error during inventory lots deduction for component ${compId}:`, lotDeductErr);
                        }
                    }
                }
            }
        }

        // 2. Update the Job Order status to Completed in the database
        if (completeJobOrder) {
            try {
                const joLookup = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(joId)}&limit=1`, { headers });
                if (joLookup.ok) {
                    const joData = (await joLookup.json()).data?.[0];
                    if (joData) {
                        await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joData.job_order_id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({
                                status: "Completed",
                                actual_quantity_produced: qty
                            })
                        });

                        // 3. Proportional Sales Order Allocation Splitting & status updates
                        const josoRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[job_order_id][_eq]=${joData.job_order_id}&limit=-1`, { headers });
                        if (josoRes.ok) {
                            const linksResponse = await josoRes.json();
                            const links = linksResponse.data || [];
                            console.log(`[BFF Finished Goods] Found ${links.length} allocations for Job Order ${joId}`);

                            for (const link of links) {
                                const detailId = link.sales_order_detail_id;
                                if (!detailId) continue;

                                let allocatedQty = Number(link.allocated_quantity || 0);
                                const targetQty = Number(joData.target_quantity || 0);
                                if (qty < targetQty && targetQty > 0) {
                                    // Yield loss: split proportionally
                                    allocatedQty = (allocatedQty * qty) / targetQty;
                                }

                                // Fetch the sales order detail to get unit price and current allocated_quantity
                                const detailRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, { headers });
                                if (detailRes.ok) {
                                    const detailData = (await detailRes.json()).data;
                                    if (detailData) {
                                        const currentAllocated = Number(detailData.allocated_quantity || 0);
                                        const newAllocated = currentAllocated + allocatedQty;
                                        const unitPrice = Number(detailData.unit_price || 0);
                                        const newAllocatedAmount = newAllocated * unitPrice;

                                        // Update sales_order_details
                                        await fetch(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, {
                                            method: "PATCH",
                                            headers,
                                            body: JSON.stringify({
                                                allocated_quantity: newAllocated,
                                                allocated_amount: newAllocatedAmount
                                            })
                                        });

                                        // Check if parent sales order is fully allocated
                                        const parentOrderId = detailData.order_id;
                                        if (parentOrderId) {
                                            const allDetailsRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${parentOrderId}&limit=-1`, { headers });
                                            if (allDetailsRes.ok) {
                                                const allDetails = (await allDetailsRes.json()).data || [];
                                                const allFullyAllocated = allDetails.every((d: any) => {
                                                    const ordered = Number(d.ordered_quantity || 0);
                                                    const alloc = Number(d.allocated_quantity || 0);
                                                    return alloc >= ordered;
                                                });

                                                console.log(`[BFF Finished Goods] Auto-transitioning Sales Order ${parentOrderId} to For Invoicing`);
                                                await fetch(`${DIRECTUS_URL}/items/sales_order/${parentOrderId}`, {
                                                    method: "PATCH",
                                                    headers,
                                                    body: JSON.stringify({ order_status: "For Invoicing" })
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            console.error(`[BFF Finished Goods] Failed to fetch allocations for Job Order ${joId}: ${josoRes.status}`);
                        }
                    }
                }
            } catch (joErr) {
                console.error("[BFF Finished Goods] Failed to update job order status and process allocations:", joErr);
            }
        }

        return NextResponse.json({ success: true, data: newReceipt });
    } catch (e) {
        console.error("API Error in production finished-goods POST:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to create finished goods receipt" }, { status: 500 });
    }
}
