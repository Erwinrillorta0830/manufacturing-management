import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { Batch, BatchStatus, BatchQaStatus } from "@/modules/manufacturing-management/lot-management/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPRING_API_BASE = process.env.SPRING_API_BASE_URL || "http://100.95.246.18:8188";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const filterLotId = searchParams.get("lotId");
        const timestamp = Date.now();

        let token: string | undefined;
        try {
            const cookieStore = await cookies();
            token = cookieStore.get("vos_access_token")?.value;
        } catch {
            // ignore
        }

        const reqHeaders: Record<string, string> = {
            Accept: "application/json",
        };
        if (token) {
            reqHeaders["Authorization"] = `Bearer ${token}`;
            reqHeaders["Cookie"] = `vos_access_token=${token}`;
        }

        let mmUrl = `${DIRECTUS_URL}/items/mm_inventory_lots?limit=-1&sort=-updated_at,-created_at,-inventory_lot_id&_t=${timestamp}`;
        if (filterLotId) {
            mmUrl += `&filter[lot_id][_eq]=${filterLotId}`;
        }

        const [batchesRes, lotsRes, usersRes, unitsRes, productsRes, movementsRes, onhandRes] = await Promise.all([
            fetch(mmUrl, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/mm_lots?limit=-1&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/units?limit=-1&fields=unit_id,unit_name,unit_shortcut&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,description,product_name,product_code,barcode,cost_per_unit,price_per_unit,estimated_unit_cost&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${SPRING_API_BASE}/api/mm-inventory-movements/all`, { headers: reqHeaders, cache: "no-store" }).catch(() => null),
            fetch(`${SPRING_API_BASE}/api/mm-batch-onhand/all`, { headers: reqHeaders, cache: "no-store" }).catch(() => null)
        ]);

        let rawBatches: Record<string, unknown>[] = [];
        if (batchesRes && batchesRes.ok) {
            const json = await batchesRes.json();
            rawBatches = json.data || [];
        }

        let rawMovements: Record<string, unknown>[] = [];
        if (movementsRes && movementsRes.ok) {
            try {
                const movJson = await movementsRes.json();
                rawMovements = Array.isArray(movJson) ? movJson : movJson?.data || [];
            } catch (err) {
                console.error("Error parsing movements in GET batches:", err);
            }
        }

        let rawOnhand: Record<string, unknown>[] = [];
        if (onhandRes && onhandRes.ok) {
            try {
                const onhandJson = await onhandRes.json();
                rawOnhand = Array.isArray(onhandJson) ? onhandJson : onhandJson?.data || [];
            } catch (err) {
                console.error("Error parsing mm-batch-onhand in GET batches:", err);
            }
        }

        let lotsList: { lot_id: number; lot_name: string; unit_id?: number }[] = [];
        if (lotsRes && lotsRes.ok) {
            try {
                const lotsJson = await lotsRes.json();
                lotsList = lotsJson.data || [];
            } catch (err) {
                console.error("Error parsing lots in GET batches:", err);
            }
        }

        let usersList: { user_id: number; user_fname?: string; user_lname?: string }[] = [];
        if (usersRes && usersRes.ok) {
            try {
                const usersJson = await usersRes.json();
                usersList = usersJson.data || [];
            } catch (err) {
                console.error("Error parsing users in GET batches:", err);
            }
        }

        let unitsList: { unit_id: number; unit_name?: string; unit_shortcut?: string }[] = [];
        if (unitsRes && unitsRes.ok) {
            try {
                const unitsJson = await unitsRes.json();
                unitsList = unitsJson.data || [];
            } catch (err) {
                console.error("Error parsing units in GET batches:", err);
            }
        }

        let productsList: { product_id: number; product_name?: string; sku_code?: string; product_code?: string; unit_cost?: number }[] = [];
        let pRes = productsRes;
        if (!pRes || !pRes.ok) {
            pRes = await fetch(`${DIRECTUS_URL}/items/products?limit=-1`, { headers, cache: "no-store" }).catch(() => null);
        }
        if (pRes && pRes.ok) {
            try {
                const prodJson = await pRes.json();
                const rawProds = prodJson.data || [];
                productsList = rawProds.map((p: Record<string, unknown>) => {
                    const rawCost = p.cost_per_unit ?? p.price_per_unit ?? p.estimated_unit_cost;
                    const unitCost = rawCost !== null && rawCost !== undefined && !isNaN(Number(rawCost))
                        ? Number(rawCost)
                        : 0;
                    const desc = String(p.description || "").trim();
                    const name = String(p.product_name || p.name || p.title || "").trim();
                    return {
                        product_id: Number(p.product_id ?? p.id ?? 0),
                        product_name: desc || name,
                        sku_code: String(p.product_code || p.barcode || "").trim(),
                        unit_cost: unitCost
                    };
                });
            } catch (err) {
                console.error("Error parsing products in GET batches:", err);
            }
        }

        // Aggregate movements by inventoryLotId and (lotId, productId, batchNo)
        const movementNetByInvLotId = new Map<number, { onhand: number; totalIn: number; totalOut: number; unitCost: number; count: number; mfgDate?: string; expDate?: string }>();
        const movementNetByLotProductBatch = new Map<string, { onhand: number; totalIn: number; totalOut: number; unitCost: number; count: number; lotId: number; productId: number; batchNo: string; mfgDate?: string; expDate?: string; condition?: string; remarks?: string; referenceNo?: string; postedAt?: string; branchId?: number; unitId?: number; productName?: string; productCode?: string; }>();

        rawMovements.forEach((m) => {
            const lId = Number(m.lotId || m.lot_id || 0);
            const pId = Number(m.productId || m.product_id || 0);
            const bNo = String(m.batchNo || m.batch_no || "").trim();
            const qIn = Number(m.quantityIn || m.quantity_in || 0);
            const qOut = Number(m.quantityOut || m.quantity_out || 0);
            const net = qIn - qOut;
            const cost = Number(m.unitCost || m.unit_cost || 0);
            const invId = Number(m.inventoryLotId || m.inventory_lot_id || 0);

            if (invId > 0) {
                const cur = movementNetByInvLotId.get(invId) || { onhand: 0, totalIn: 0, totalOut: 0, unitCost: cost, count: 0 };
                cur.onhand += net;
                cur.totalIn += qIn;
                cur.totalOut += qOut;
                if (cost > 0) cur.unitCost = cost;
                if (m.manufacturingDate || m.manufacturing_date) cur.mfgDate = (m.manufacturingDate || m.manufacturing_date) as string;
                if (m.expirationDate || m.expiration_date || m.expiry_date) cur.expDate = (m.expirationDate || m.expiration_date || m.expiry_date) as string;
                cur.count += 1;
                movementNetByInvLotId.set(invId, cur);
            }

            if (bNo) {
                const key = `${lId}_${pId}_${bNo.toLowerCase()}`;
                const cur = movementNetByLotProductBatch.get(key) || {
                    onhand: 0,
                    totalIn: 0,
                    totalOut: 0,
                    unitCost: cost,
                    count: 0,
                    lotId: lId,
                    productId: pId,
                    batchNo: bNo,
                    mfgDate: (m.manufacturingDate || m.manufacturing_date) as string | undefined,
                    expDate: (m.expirationDate || m.expiration_date || m.expiry_date) as string | undefined,
                    condition: String(m.inventoryCondition || m.inventory_condition || "GOOD"),
                    remarks: (m.remarks as string) || undefined,
                    referenceNo: (m.referenceNo || m.reference_no) as string | undefined,
                    postedAt: (m.postedAt || m.posted_at || m.transactionDate || m.transaction_date) as string | undefined,
                    branchId: Number(m.branchId || m.branch_id || 1),
                    unitId: Number(m.unitId || m.unit_id || 1),
                    productName: (m.productName || m.product_name) as string | undefined,
                    productCode: (m.productCode || m.product_code) as string | undefined
                };
                cur.onhand += net;
                cur.totalIn += qIn;
                cur.totalOut += qOut;
                if (cost > 0) cur.unitCost = cost;
                if (m.manufacturingDate || m.manufacturing_date) cur.mfgDate = (m.manufacturingDate || m.manufacturing_date) as string;
                if (m.expirationDate || m.expiration_date || m.expiry_date) cur.expDate = (m.expirationDate || m.expiration_date || m.expiry_date) as string;
                if (m.inventoryCondition || m.inventory_condition) cur.condition = String(m.inventoryCondition || m.inventory_condition);
                cur.count += 1;
                movementNetByLotProductBatch.set(key, cur);
            }
        });

        rawOnhand.forEach((oh) => {
            const lId = Number(oh.lotId || oh.lot_id || 0);
            const pId = Number(oh.productId || oh.product_id || 0);
            const bNo = String(oh.batchNo || oh.batch_no || "").trim();
            const invId = Number(oh.inventoryLotId || oh.inventory_lot_id || 0);
            const onhand = Number(oh.onhandQuantity ?? oh.onhand_quantity ?? 0);
            const qIn = Number(oh.totalQuantityIn ?? oh.total_quantity_in ?? onhand);
            const qOut = Number(oh.totalQuantityOut ?? oh.total_quantity_out ?? 0);
            const mfgDate = (oh.manufacturingDate || oh.manufacturing_date) as string | undefined;
            const expDate = (oh.expirationDate || oh.expiration_date || oh.expiry_date) as string | undefined;
            const cond = String(oh.inventoryCondition || oh.inventory_condition || "GOOD");

            if (invId > 0) {
                const cur = movementNetByInvLotId.get(invId) || { onhand: 0, totalIn: 0, totalOut: 0, unitCost: 0, count: 0 };
                cur.onhand = onhand;
                cur.totalIn = qIn;
                cur.totalOut = qOut;
                if (mfgDate) cur.mfgDate = mfgDate;
                if (expDate) cur.expDate = expDate;
                movementNetByInvLotId.set(invId, cur);
            }

            if (bNo) {
                const key = `${lId}_${pId}_${bNo.toLowerCase()}`;
                const cur = movementNetByLotProductBatch.get(key) || {
                    onhand: 0,
                    totalIn: 0,
                    totalOut: 0,
                    unitCost: 0,
                    count: 0,
                    lotId: lId,
                    productId: pId,
                    batchNo: bNo,
                    mfgDate,
                    expDate,
                    condition: cond,
                    branchId: Number(oh.branchId || oh.branch_id || 1),
                    unitId: Number(oh.unitId || oh.unit_id || 1)
                };
                cur.onhand = onhand;
                cur.totalIn = qIn;
                cur.totalOut = qOut;
                if (mfgDate) cur.mfgDate = mfgDate;
                if (expDate) cur.expDate = expDate;
                movementNetByLotProductBatch.set(key, cur);
            }
        });

        const mappedBatches: Batch[] = rawBatches.map((row) => {
            const batchId = Number(row.inventory_lot_id ?? 0);
            const batchNumber = String(row.batch_no || "");

            let lotId = 0;
            let lotName = "Unassigned Storage Lot";
            if (row.lot_id) {
                if (typeof row.lot_id === "object" && row.lot_id !== null) {
                    const lotObj = row.lot_id as { lot_id?: number; lot_name?: string };
                    lotId = Number(lotObj.lot_id || 0);
                    lotName = lotObj.lot_name || `Lot #${lotId}`;
                } else {
                    lotId = Number(row.lot_id);
                    const matched = lotsList.find((l) => Number(l.lot_id) === lotId);
                    if (matched) lotName = matched.lot_name;
                }
            }

            let productId = 0;
            let productName = "";
            let itemCode = String(row.item_code || "");
            if (row.product_id) {
                if (typeof row.product_id === "object" && row.product_id !== null) {
                    const pObj = row.product_id as Record<string, unknown>;
                    productId = Number(pObj.product_id ?? pObj.id ?? 0);
                    productName = String(pObj.description || pObj.product_name || pObj.name || pObj.title || "").trim();
                    itemCode = itemCode || String(pObj.sku_code || pObj.product_code || pObj.barcode || pObj.code || pObj.sku || "").trim();
                } else {
                    productId = Number(row.product_id);
                    const matchedP = productsList.find((p) => Number(p.product_id) === productId);
                    if (matchedP) {
                        productName = matchedP.product_name || "";
                        itemCode = itemCode || matchedP.sku_code || "";
                    }
                }
            }

            if (!productName && productId > 0) {
                productName = `Product #${productId}`;
            }
            if (!itemCode && productId > 0) {
                itemCode = `PROD-${productId}`;
            }

            let uomId: number | null = null;
            let uomName = "";
            let uomShortcut = "";
            const rawUnit = row.uom_id ?? row.unit_id;
            if (rawUnit && typeof rawUnit === "object") {
                const uObj = rawUnit as { unit_id?: number; unit_name?: string; unit_shortcut?: string };
                uomId = uObj.unit_id ?? null;
                uomName = uObj.unit_name || "";
                uomShortcut = uObj.unit_shortcut || uObj.unit_name || "";
            } else if (rawUnit !== null && rawUnit !== undefined) {
                uomId = Number(rawUnit);
            }

            if (uomId !== null) {
                const matchedUnit = unitsList.find((u) => Number(u.unit_id) === Number(uomId));
                if (matchedUnit) {
                    uomName = matchedUnit.unit_name || uomName;
                    uomShortcut = matchedUnit.unit_shortcut || matchedUnit.unit_name || uomShortcut;
                }
            }

            let createdBy = "System";
            if (row.created_by) {
                const uObj = row.created_by as { user_id?: number } | number;
                const uid = typeof uObj === "object" && uObj !== null ? uObj.user_id : Number(uObj);
                const matched = usersList.find((u) => Number(u.user_id) === Number(uid));
                if (matched) {
                    createdBy = [matched.user_fname, matched.user_lname].filter(Boolean).join(" ") || `User #${uid}`;
                } else if (uid) {
                    createdBy = `User #${uid}`;
                }
            }

            let updatedBy = "System";
            if (row.updated_by) {
                const uObj = row.updated_by as { user_id?: number } | number;
                const uid = typeof uObj === "object" && uObj !== null ? uObj.user_id : Number(uObj);
                const matched = usersList.find((u) => Number(u.user_id) === Number(uid));
                if (matched) {
                    updatedBy = [matched.user_fname, matched.user_lname].filter(Boolean).join(" ") || `User #${uid}`;
                } else if (uid) {
                    updatedBy = `User #${uid}`;
                }
            }

            const rawQa = String(row.qa_status || "GOOD").toUpperCase();
            let qaStatus: BatchQaStatus = "GOOD";
            if (["GOOD", "DAMAGED", "QUARANTINED", "EXPIRED"].includes(rawQa)) {
                qaStatus = rawQa as BatchQaStatus;
            }

            const rawStatus = String(row.status || "ACTIVE").toUpperCase();
            let status: BatchStatus = "ACTIVE";
            if (["ACTIVE", "CLOSED", "INACTIVE"].includes(rawStatus)) {
                status = rawStatus as BatchStatus;
            }

            const matchedP = productsList.find((p) => Number(p.product_id) === productId);

            // Compute live onhand quantity and unit cost from movements if present
            const movementByInvId = batchId > 0 ? movementNetByInvLotId.get(batchId) : undefined;
            const movementByLotProdBatch = movementNetByLotProductBatch.get(`${lotId}_${productId}_${batchNumber.toLowerCase()}`);
            const movementInfo = movementByInvId || movementByLotProdBatch;

            const quantity = movementInfo !== undefined
                ? Number(movementInfo.onhand || 0)
                : 0;

            const unitCost = movementInfo && movementInfo.unitCost > 0
                ? movementInfo.unitCost
                : (row.unit_cost != null && Number(row.unit_cost) > 0
                    ? Number(row.unit_cost)
                    : (matchedP?.unit_cost || Number(row.unit_cost ?? 0)));

            const manufacturingDate = String(row.manufacturing_date || movementInfo?.mfgDate || "");
            const expirationDate = String(row.expiry_date || movementInfo?.expDate || "");

            return {
                batchId,
                batchNumber,
                lotId,
                lotName,
                branchId: Number(row.branch_id || 1),
                productId,
                productName,
                itemCode,
                quantity,
                unitCost,
                uomId,
                uomName,
                uomShortcut,
                manufacturingDate,
                expirationDate,
                qaStatus,
                status,
                sourceType: row.source_type ? String(row.source_type) : undefined,
                sourceReference: row.source_reference ? String(row.source_reference) : undefined,
                remarks: String(row.remarks || ""),
                createdAt: String(row.created_at || ""),
                updatedAt: String(row.updated_at || ""),
                createdBy,
                updatedBy
            };
        });

        // Synthesize any batches that exist in movements but not in Directus mm_inventory_lots
        const existingKeys = new Set<string>();
        mappedBatches.forEach((b) => {
            existingKeys.add(`${b.lotId}_${b.productId}_${b.batchNumber.toLowerCase()}`);
            if (b.batchId > 0) existingKeys.add(`id_${b.batchId}`);
        });

        let synthIdCounter = -1;
        movementNetByLotProductBatch.forEach((mv, key) => {
            if (!existingKeys.has(key)) {
                // Find lot and product info
                let lotName = "Unassigned Storage Lot";
                const matchedLot = lotsList.find((l) => Number(l.lot_id) === mv.lotId);
                if (matchedLot) lotName = matchedLot.lot_name;
                else if (mv.lotId > 0) lotName = `Lot #${mv.lotId}`;

                let prodName = mv.productName || "";
                let itemCode = mv.productCode || "";
                const matchedP = productsList.find((p) => Number(p.product_id) === mv.productId);
                if (matchedP) {
                    prodName = prodName || matchedP.product_name || `Product #${mv.productId}`;
                    itemCode = itemCode || matchedP.sku_code || `PROD-${mv.productId}`;
                } else if (mv.productId > 0) {
                    prodName = prodName || `Product #${mv.productId}`;
                    itemCode = itemCode || `PROD-${mv.productId}`;
                }

                let uomName = "";
                let uomShortcut = "";
                const matchedUnit = unitsList.find((u) => Number(u.unit_id) === mv.unitId);
                if (matchedUnit) {
                    uomName = matchedUnit.unit_name || "";
                    uomShortcut = matchedUnit.unit_shortcut || matchedUnit.unit_name || "";
                }

                const rawQa = String(mv.condition || "GOOD").toUpperCase();
                let qaStatus: BatchQaStatus = "GOOD";
                if (["GOOD", "DAMAGED", "QUARANTINED", "EXPIRED"].includes(rawQa)) {
                    qaStatus = rawQa as BatchQaStatus;
                }

                mappedBatches.push({
                    batchId: synthIdCounter--,
                    batchNumber: mv.batchNo,
                    lotId: mv.lotId,
                    lotName,
                    branchId: mv.branchId || 1,
                    productId: mv.productId,
                    productName: prodName,
                    itemCode,
                    quantity: mv.onhand,
                    unitCost: mv.unitCost || (matchedP?.unit_cost || 0),
                    uomId: mv.unitId || null,
                    uomName,
                    uomShortcut,
                    manufacturingDate: mv.mfgDate || "",
                    expirationDate: mv.expDate || "",
                    qaStatus,
                    status: "ACTIVE",
                    sourceType: "INVENTORY_MOVEMENT",
                    sourceReference: mv.referenceNo,
                    remarks: mv.remarks || "",
                    createdAt: mv.postedAt || new Date().toISOString(),
                    updatedAt: mv.postedAt || new Date().toISOString(),
                    createdBy: "System",
                    updatedBy: "System"
                });
            }
        });

        const finalBatches = filterLotId
            ? mappedBatches.filter((b) => Number(b.lotId) === Number(filterLotId))
            : mappedBatches;

        return NextResponse.json(finalBatches);
    } catch (e) {
        console.error("API Error fetching batches:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to fetch batches" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
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

        const finalBatchNo = (batch_no || batch_number || "").trim();
        if (!finalBatchNo) {
            return NextResponse.json(
                { error: "batch_no is required" },
                { status: 400 }
            );
        }

        if (!lot_id || isNaN(Number(lot_id))) {
            return NextResponse.json(
                { error: "A valid Storage Lot selection (lot_id) is required" },
                { status: 400 }
            );
        }

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
            console.error("Error parsing user token in POST batch route:", err);
        }

        if (!userId) {
            try {
                const uRes = await fetch(`${DIRECTUS_URL}/items/user?limit=1&fields=user_id`, { headers, cache: "no-store" });
                if (uRes.ok) {
                    const uData = await uRes.json();
                    if (uData.data && uData.data.length > 0) {
                        userId = Number(uData.data[0].user_id);
                    }
                }
            } catch (err) {
                console.error("Error resolving fallback user_id in batch route:", err);
            }
        }

        let resolvedUnitCost = unit_cost !== undefined && unit_cost !== null && !isNaN(Number(unit_cost)) ? Number(unit_cost) : 0.0;
        if (resolvedUnitCost === 0 && product_id) {
            try {
                const pRes = await fetch(`${DIRECTUS_URL}/items/products/${product_id}?fields=cost_per_unit,price_per_unit,estimated_unit_cost`, { headers, cache: "no-store" }).catch(() => null);
                if (pRes && pRes.ok) {
                    const pJson = await pRes.json();
                    const rawCost = pJson.data?.cost_per_unit ?? pJson.data?.price_per_unit ?? pJson.data?.estimated_unit_cost;
                    if (rawCost !== null && rawCost !== undefined && !isNaN(Number(rawCost))) {
                        resolvedUnitCost = Number(rawCost);
                    }
                }
            } catch (err) {
                console.error("Error fetching product unit cost in batch POST:", err);
            }
        }

        const postBody: Record<string, unknown> = {
            lot_id: Number(lot_id),
            branch_id: Number(branch_id || 1),
            product_id: Number(product_id || 1),
            batch_no: finalBatchNo,
            manufacturing_date: manufacturing_date || null,
            expiry_date: expiry_date || expiration_date || null,
            unit_cost: resolvedUnitCost,
            qa_status: qa_status ? String(qa_status).toUpperCase() : "GOOD",
            status: status ? String(status).toUpperCase() : "ACTIVE",
            source_type: source_type ? String(source_type).trim() : null,
            source_reference: source_reference ? String(source_reference).trim() : null,
            remarks: remarks ? String(remarks).trim() : null,
            created_by: userId ? Number(userId) : 1
        };

        const res = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots`, {
            method: "POST",
            headers,
            body: JSON.stringify(postBody)
        });

        if (!res.ok) {
            const errTxt = await res.text();
            let errMsg = `Directus mm_inventory_lots create failed: ${res.status}`;
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
        console.error("API Error registering inventory lot batch:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to register batch" },
            { status: 500 }
        );
    }
}
