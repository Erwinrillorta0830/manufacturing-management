import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { Batch, BatchStatus, BatchQaStatus } from "@/modules/manufacturing-management/lot-management/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPRING_API_BASE = process.env.SPRING_API_BASE_URL ;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const filterLotId = searchParams.get("lotId") || searchParams.get("mmLotId") || searchParams.get("mm_lot_id") || searchParams.get("lot_id");
        const filterBranchId = searchParams.get("branchId") || searchParams.get("branch_id") || searchParams.get("branch");
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

        const [batchesRes, lotsRes, usersRes, unitsRes, productsRes, movementsRes, onhandRes, branchesRes] = await Promise.all([
            fetch(mmUrl, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/mm_lots?limit=-1&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/units?limit=-1&fields=unit_id,unit_name,unit_shortcut&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,description,product_name,product_code,barcode,cost_per_unit,price_per_unit,estimated_unit_cost&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${SPRING_API_BASE}/api/mm-inventory-movements/all`, { headers: reqHeaders, cache: "no-store" }).catch(() => null),
            fetch(`${SPRING_API_BASE}/api/mm-batch-onhand/all`, { headers: reqHeaders, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null)
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

        let branchesList: { id: number; branch_name?: string; branch_code?: string }[] = [];
        if (branchesRes && branchesRes.ok) {
            try {
                const bJson = await branchesRes.json();
                branchesList = bJson.data || [];
            } catch (err) {
                console.error("Error parsing branches in GET batches:", err);
            }
        }

        const getBranchInfo = (brId: number) => {
            const b = branchesList.find((br) => Number(br.id) === Number(brId));
            return {
                branchName: b?.branch_name || (brId > 0 ? `Branch #${brId}` : "Unassigned"),
                branchCode: b?.branch_code || ""
            };
        };

        let lotsList: { lot_id: number; lot_name: string; unit_id?: number; branch_id?: number }[] = [];
        if (lotsRes && lotsRes.ok) {
            try {
                const lotsJson = await lotsRes.json();
                const rawLotsData: Record<string, unknown>[] = lotsJson.data || [];
                lotsList = rawLotsData.map((l) => {
                    const rawB = l.branch_id;
                    const bId = typeof rawB === "object" && rawB !== null
                        ? Number((rawB as { id?: number; branch_id?: number }).id || (rawB as { id?: number; branch_id?: number }).branch_id || 0)
                        : Number(rawB || 0);
                    return {
                        lot_id: Number(l.lot_id),
                        lot_name: String(l.lot_name || ""),
                        unit_id: l.unit_id ? Number(l.unit_id) : undefined,
                        branch_id: bId
                    };
                });
            } catch (err) {
                console.error("Error parsing lots in GET batches:", err);
            }
        }

        const resolveLotForBranch = (rawLotId: unknown, branchId: number) => {
            let parsedLotId = 0;
            if (typeof rawLotId === "object" && rawLotId !== null) {
                parsedLotId = Number((rawLotId as { lot_id?: number }).lot_id || 0);
            } else if (rawLotId !== null && rawLotId !== undefined) {
                parsedLotId = Number(rawLotId || 0);
            }

            if (parsedLotId > 0) {
                const matchedLot = lotsList.find((l) => Number(l.lot_id) === parsedLotId);
                // Option B: Lot only applies if it belongs to this branch
                if (matchedLot && Number(matchedLot.branch_id) === Number(branchId)) {
                    return {
                        lotId: parsedLotId,
                        lotName: matchedLot.lot_name
                    };
                }
            }

            return {
                lotId: 0,
                lotName: "Unassigned / Pending Storage Rack (Ghost Rack)"
            };
        };

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

        // Aggregate movements strictly partitioned by (branchId, inventoryLotId) and (branchId, lotId, productId, batchNo)
        const movementNetByBranchInvLotId = new Map<string, {
            onhand: number;
            totalIn: number;
            totalOut: number;
            unitCost: number;
            count: number;
            branchId: number;
            invId: number;
            mfgDate?: string;
            expDate?: string;
        }>();

        const movementNetByBranchLotProductBatch = new Map<string, {
            onhand: number;
            totalIn: number;
            totalOut: number;
            unitCost: number;
            count: number;
            branchId: number;
            lotId: number;
            productId: number;
            batchNo: string;
            mfgDate?: string;
            expDate?: string;
            condition?: string;
            remarks?: string;
            referenceNo?: string;
            postedAt?: string;
            unitId?: number;
            productName?: string;
            productCode?: string;
        }>();

        const movementNetByBranchLotProductBatchDate = new Map<string, {
            onhand: number;
            totalIn: number;
            totalOut: number;
            unitCost: number;
            count: number;
            branchId: number;
            lotId: number;
            productId: number;
            batchNo: string;
            mfgDate?: string;
            expDate?: string;
            condition?: string;
            remarks?: string;
            referenceNo?: string;
            postedAt?: string;
            unitId?: number;
            productName?: string;
            productCode?: string;
        }>();

        rawMovements.forEach((m) => {
            const branchId = Number(m.branchId || m.branch_id || 1);
            const rawInvId = m.inventoryLotId ?? m.inventory_lot_id;
            const invId = Number(rawInvId || 0);
            const rawLotId = m.mmLotId ?? m.mm_lot_id ?? m.lotId ?? m.lot_id;
            const { lotId: lId } = resolveLotForBranch(rawLotId, branchId);
            const pId = Number(m.productId || m.product_id || 0);
            const bNo = String(m.batchNo || m.batch_no || "").trim();
            const qIn = Number(m.quantityIn || m.quantity_in || 0);
            const qOut = Number(m.quantityOut || m.quantity_out || 0);
            const net = qIn - qOut;
            const cost = Number(m.unitCost || m.unit_cost || 0);
            const mfgDateStr = (m.manufacturingDate || m.manufacturing_date ? String(m.manufacturingDate || m.manufacturing_date).slice(0, 10) : "");
            const expDateStr = (m.expirationDate || m.expiration_date || m.expiry_date ? String(m.expirationDate || m.expiration_date || m.expiry_date).slice(0, 10) : "");

            if (invId > 0) {
                const invKey = `${branchId}_${invId}`;
                const cur = movementNetByBranchInvLotId.get(invKey) || {
                    onhand: 0,
                    totalIn: 0,
                    totalOut: 0,
                    unitCost: cost,
                    count: 0,
                    branchId,
                    invId
                };
                cur.onhand += net;
                cur.totalIn += qIn;
                cur.totalOut += qOut;
                if (cost > 0) cur.unitCost = cost;
                if (mfgDateStr && !cur.mfgDate) cur.mfgDate = mfgDateStr;
                if (expDateStr && !cur.expDate) cur.expDate = expDateStr;
                cur.count += 1;
                movementNetByBranchInvLotId.set(invKey, cur);
            }

            if (bNo) {
                const baseKey = `${branchId}_${lId}_${pId}_${bNo.toLowerCase()}`;
                const curBase = movementNetByBranchLotProductBatch.get(baseKey) || {
                    onhand: 0,
                    totalIn: 0,
                    totalOut: 0,
                    unitCost: cost,
                    count: 0,
                    branchId,
                    lotId: lId,
                    productId: pId,
                    batchNo: bNo,
                    mfgDate: mfgDateStr || undefined,
                    expDate: expDateStr || undefined,
                    condition: String(m.inventoryCondition || m.inventory_condition || "GOOD"),
                    remarks: (m.remarks as string) || undefined,
                    referenceNo: (m.referenceNo || m.reference_no) as string | undefined,
                    postedAt: (m.postedAt || m.posted_at || m.transactionDate || m.transaction_date) as string | undefined,
                    unitId: Number(m.unitId || m.unit_id || 1),
                    productName: (m.productName || m.product_name) as string | undefined,
                    productCode: (m.productCode || m.product_code) as string | undefined
                };
                curBase.onhand += net;
                curBase.totalIn += qIn;
                curBase.totalOut += qOut;
                if (cost > 0) curBase.unitCost = cost;
                if (mfgDateStr) curBase.mfgDate = mfgDateStr;
                if (expDateStr) curBase.expDate = expDateStr;
                if (m.inventoryCondition || m.inventory_condition) curBase.condition = String(m.inventoryCondition || m.inventory_condition);
                curBase.count += 1;
                movementNetByBranchLotProductBatch.set(baseKey, curBase);

                if (mfgDateStr || expDateStr) {
                    const dateKey = `${branchId}_${lId}_${pId}_${bNo.toLowerCase()}_${mfgDateStr}_${expDateStr}`;
                    const curDate = movementNetByBranchLotProductBatchDate.get(dateKey) || {
                        ...curBase,
                        onhand: 0,
                        totalIn: 0,
                        totalOut: 0,
                        unitCost: cost,
                        count: 0,
                        mfgDate: mfgDateStr || undefined,
                        expDate: expDateStr || undefined
                    };
                    curDate.onhand += net;
                    curDate.totalIn += qIn;
                    curDate.totalOut += qOut;
                    if (cost > 0) curDate.unitCost = cost;
                    curDate.count += 1;
                    movementNetByBranchLotProductBatchDate.set(dateKey, curDate);
                }
            }
        });

        rawOnhand.forEach((oh) => {
            const branchId = Number(oh.branchId || oh.branch_id || 1);
            const rawInvId = oh.inventoryLotId || oh.inventory_lot_id;
            const invId = Number(rawInvId || 0);
            const rawLotId = oh.mmLotId || oh.mm_lot_id || oh.lotId || oh.lot_id;
            const { lotId: lId } = resolveLotForBranch(rawLotId, branchId);
            const pId = Number(oh.productId || oh.product_id || 0);
            const bNo = String(oh.batchNo || oh.batch_no || "").trim();
            const onhand = Number(oh.onhandQuantity ?? oh.onhand_quantity ?? 0);
            const qIn = Number(oh.totalQuantityIn ?? oh.total_quantity_in ?? onhand);
            const qOut = Number(oh.totalQuantityOut ?? oh.total_quantity_out ?? 0);
            const mfgDate = (oh.manufacturingDate || oh.manufacturing_date) as string | undefined;
            const expDate = (oh.expirationDate || oh.expiration_date || oh.expiry_date) as string | undefined;
            const mfgDateStr = mfgDate ? String(mfgDate).slice(0, 10) : "";
            const expDateStr = expDate ? String(expDate).slice(0, 10) : "";
            const cond = String(oh.inventoryCondition || oh.inventory_condition || "GOOD");

            if (invId > 0) {
                const invKey = `${branchId}_${invId}`;
                const cur = movementNetByBranchInvLotId.get(invKey) || {
                    onhand: 0,
                    totalIn: 0,
                    totalOut: 0,
                    unitCost: 0,
                    count: 0,
                    branchId,
                    invId
                };
                if (cur.count === 0) {
                    cur.onhand = onhand;
                    cur.totalIn = qIn;
                    cur.totalOut = qOut;
                }
                if (mfgDate && !cur.mfgDate) cur.mfgDate = mfgDate;
                if (expDate && !cur.expDate) cur.expDate = expDate;
                movementNetByBranchInvLotId.set(invKey, cur);
            }

            if (bNo) {
                const baseKey = `${branchId}_${lId}_${pId}_${bNo.toLowerCase()}`;
                const curBase = movementNetByBranchLotProductBatch.get(baseKey) || {
                    onhand: 0,
                    totalIn: 0,
                    totalOut: 0,
                    unitCost: 0,
                    count: 0,
                    branchId,
                    lotId: lId,
                    productId: pId,
                    batchNo: bNo,
                    mfgDate,
                    expDate,
                    condition: cond,
                    unitId: Number(oh.unitId || oh.unit_id || 1),
                    productName: (oh.productName || oh.product_name) as string | undefined,
                    productCode: (oh.productCode || oh.product_code) as string | undefined
                };
                if (curBase.count === 0) {
                    curBase.onhand = onhand;
                    curBase.totalIn = qIn;
                    curBase.totalOut = qOut;
                }
                if (mfgDate && !curBase.mfgDate) curBase.mfgDate = mfgDate;
                if (expDate && !curBase.expDate) curBase.expDate = expDate;
                movementNetByBranchLotProductBatch.set(baseKey, curBase);

                if (mfgDateStr || expDateStr) {
                    const dateKey = `${branchId}_${lId}_${pId}_${bNo.toLowerCase()}_${mfgDateStr}_${expDateStr}`;
                    const curDate = movementNetByBranchLotProductBatchDate.get(dateKey) || {
                        ...curBase,
                        onhand: 0,
                        totalIn: 0,
                        totalOut: 0,
                        unitCost: 0,
                        count: 0,
                        mfgDate,
                        expDate
                    };
                    if (curDate.count === 0) {
                        curDate.onhand = onhand;
                        curDate.totalIn = qIn;
                        curDate.totalOut = qOut;
                    }
                    movementNetByBranchLotProductBatchDate.set(dateKey, curDate);
                }
            }
        });

        const emittedBranchInvLots = new Set<string>();
        const emittedBranchBatchKeys = new Set<string>();
        const emittedBranchBatchDateKeys = new Set<string>();

        const mappedBatches: Batch[] = [];

        rawBatches.forEach((row) => {
            const batchId = Number(row.inventory_lot_id ?? 0);
            const batchNumber = String(row.batch_no || "");
            const rawBranchId = row.branch_id;
            const branchId = typeof rawBranchId === "object" && rawBranchId !== null
                ? Number((rawBranchId as { id?: number; branch_id?: number }).id || (rawBranchId as { id?: number; branch_id?: number }).branch_id || 1)
                : Number(rawBranchId || 1);
            const branchInfo = getBranchInfo(branchId);

            const { lotId, lotName } = resolveLotForBranch(row.lot_id, branchId);

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

            // Compute live onhand quantity and unit cost from branch movements/onhand
            const mfgNorm = String(row.manufacturing_date || "").slice(0, 10);
            const expNorm = String(row.expiry_date || row.expiration_date || "").slice(0, 10);

            const invKey = `${branchId}_${batchId}`;
            const dateKey = `${branchId}_${lotId}_${productId}_${batchNumber.toLowerCase()}_${mfgNorm}_${expNorm}`;
            const baseKey = `${branchId}_${lotId}_${productId}_${batchNumber.toLowerCase()}`;

            const movementByExactDates = (mfgNorm || expNorm)
                ? movementNetByBranchLotProductBatchDate.get(dateKey)
                : undefined;
            const movementByLotProdBatch = movementNetByBranchLotProductBatch.get(baseKey);
            const movementByInvId = batchId > 0 ? movementNetByBranchInvLotId.get(invKey) : undefined;
            const movementInfo = movementByExactDates || movementByLotProdBatch || movementByInvId;

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

            mappedBatches.push({
                batchId,
                inventoryLotId: batchId,
                batchNumber,
                lotId,
                lotName,
                branchId,
                branchName: branchInfo.branchName,
                branchCode: branchInfo.branchCode,
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
            });

            emittedBranchInvLots.add(invKey);
            emittedBranchBatchKeys.add(baseKey);
            if (mfgNorm || expNorm) emittedBranchBatchDateKeys.add(dateKey);
        });

        let synthIdCounter = -1;

        // Emit separate batch rows for other branches that have stock/movements for registered inventoryLotIds
        movementNetByBranchInvLotId.forEach((mv, invKey) => {
            if (!emittedBranchInvLots.has(invKey)) {
                emittedBranchInvLots.add(invKey);

                const branchInfo = getBranchInfo(mv.branchId);
                const matchedRaw = rawBatches.find((r) => Number(r.inventory_lot_id) === mv.invId);

                let productId = 0;
                let productName = "";
                let itemCode = "";
                let batchNumber = "";
                let unitCost = mv.unitCost || 0;
                let qaStatus: BatchQaStatus = "GOOD";
                let status: BatchStatus = "ACTIVE";
                let uomId: number | null = null;
                let uomName = "";
                let uomShortcut = "";
                let mfgDate = mv.mfgDate || "";
                let expDate = mv.expDate || "";
                let remarks = "";

                if (matchedRaw) {
                    batchNumber = String(matchedRaw.batch_no || "");
                    mfgDate = String(matchedRaw.manufacturing_date || mv.mfgDate || "");
                    expDate = String(matchedRaw.expiry_date || matchedRaw.expiration_date || mv.expDate || "");
                    unitCost = unitCost || Number(matchedRaw.unit_cost || 0);
                    const rawQa = String(matchedRaw.qa_status || "GOOD").toUpperCase();
                    if (["GOOD", "DAMAGED", "QUARANTINED", "EXPIRED"].includes(rawQa)) {
                        qaStatus = rawQa as BatchQaStatus;
                    }
                    const rawSt = String(matchedRaw.status || "ACTIVE").toUpperCase();
                    if (["ACTIVE", "CLOSED", "INACTIVE"].includes(rawSt)) {
                        status = rawSt as BatchStatus;
                    }
                    remarks = String(matchedRaw.remarks || "");

                    if (matchedRaw.product_id) {
                        if (typeof matchedRaw.product_id === "object" && matchedRaw.product_id !== null) {
                            const pObj = matchedRaw.product_id as Record<string, unknown>;
                            productId = Number(pObj.product_id ?? pObj.id ?? 0);
                            productName = String(pObj.description || pObj.product_name || pObj.name || pObj.title || "").trim();
                            itemCode = String(pObj.sku_code || pObj.product_code || pObj.barcode || "").trim();
                        } else {
                            productId = Number(matchedRaw.product_id);
                            const matchedP = productsList.find((p) => Number(p.product_id) === productId);
                            if (matchedP) {
                                productName = matchedP.product_name || "";
                                itemCode = matchedP.sku_code || "";
                            }
                        }
                    }

                    const rawUnit = matchedRaw.uom_id ?? matchedRaw.unit_id;
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
                }

                // Option B: Resolve lot specifically in the context of THIS branch
                const { lotId, lotName } = resolveLotForBranch(matchedRaw?.lot_id, mv.branchId);

                if (!productName && productId > 0) productName = `Product #${productId}`;
                if (!itemCode && productId > 0) itemCode = `PROD-${productId}`;

                const mfgNorm = mfgDate.slice(0, 10);
                const expNorm = expDate.slice(0, 10);
                const baseKey = `${mv.branchId}_${lotId}_${productId}_${batchNumber.toLowerCase()}`;
                const dateKey = `${mv.branchId}_${lotId}_${productId}_${batchNumber.toLowerCase()}_${mfgNorm}_${expNorm}`;

                emittedBranchBatchKeys.add(baseKey);
                if (mfgNorm || expNorm) emittedBranchBatchDateKeys.add(dateKey);

                mappedBatches.push({
                    batchId: synthIdCounter--,
                    inventoryLotId: mv.invId,
                    batchNumber,
                    lotId,
                    lotName,
                    branchId: mv.branchId,
                    branchName: branchInfo.branchName,
                    branchCode: branchInfo.branchCode,
                    productId,
                    productName,
                    itemCode,
                    quantity: mv.onhand,
                    unitCost,
                    uomId,
                    uomName,
                    uomShortcut,
                    manufacturingDate: mfgDate,
                    expirationDate: expDate,
                    qaStatus,
                    status,
                    sourceType: "INVENTORY_MOVEMENT",
                    sourceReference: matchedRaw?.source_reference ? String(matchedRaw.source_reference) : undefined,
                    remarks,
                    createdAt: String(matchedRaw?.created_at || new Date().toISOString()),
                    updatedAt: String(matchedRaw?.updated_at || new Date().toISOString()),
                    createdBy: "System",
                    updatedBy: "System"
                });
            }
        });

        // Synthesize any date-specific groups not yet represented
        movementNetByBranchLotProductBatchDate.forEach((mv, dateKey) => {
            const bNoLower = (mv.batchNo || "").trim().toLowerCase();
            const baseKey = `${mv.branchId}_${mv.lotId}_${mv.productId}_${bNoLower}`;

            if (!emittedBranchBatchDateKeys.has(dateKey) && !emittedBranchBatchKeys.has(baseKey)) {
                emittedBranchBatchDateKeys.add(dateKey);
                emittedBranchBatchKeys.add(baseKey);

                const branchInfo = getBranchInfo(mv.branchId);
                const { lotId, lotName } = resolveLotForBranch(mv.lotId, mv.branchId);

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
                    lotId,
                    lotName,
                    branchId: mv.branchId,
                    branchName: branchInfo.branchName,
                    branchCode: branchInfo.branchCode,
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

        // Next synthesize any base batches with no dates that were not represented
        movementNetByBranchLotProductBatch.forEach((mv, baseKey) => {
            if (!emittedBranchBatchKeys.has(baseKey)) {
                emittedBranchBatchKeys.add(baseKey);

                const branchInfo = getBranchInfo(mv.branchId);
                const { lotId, lotName } = resolveLotForBranch(mv.lotId, mv.branchId);

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
                    lotId,
                    lotName,
                    branchId: mv.branchId,
                    branchName: branchInfo.branchName,
                    branchCode: branchInfo.branchCode,
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

        let finalBatches = mappedBatches;
        if (filterLotId) {
            finalBatches = finalBatches.filter((b) => Number(b.lotId) === Number(filterLotId));
        }
        if (filterBranchId && filterBranchId !== "ALL") {
            finalBatches = finalBatches.filter((b) => Number(b.branchId) === Number(filterBranchId));
        }

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
