import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { resolveProductClassification } from "@/modules/manufacturing-management/adjustments/lot-transfer/services/lot-allocation.engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPRING_API_BASE = process.env.SPRING_API_BASE_URL;

interface RawBatch {
  inventory_lot_id: number;
  lot_id: number;
  branch_id: number;
  product_id: number;
  batch_no: string;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  expiration_date?: string | null;
  unit_cost?: string | number | null;
  qa_status?: string | null;
  status?: string | null;
  source_type?: string | null;
  source_reference?: string | null;
  remarks?: string | null;
}

interface ReconciledBatchItem {
  batchId: number;
  inventoryLotId: number;
  batchNumber: string;
  lotId: number;
  lotName: string;
  branchId: number;
  productId: number;
  productName: string;
  productCode: string;
  productDescription?: string;
  productTypeId?: number | null;
  productTypeName?: string;
  productCategoryName?: string;
  quantity: number;
  unitCost: number;
  unit_cost?: number;
  uomId?: number | null;
  uomName?: string;
  manufacturingDate?: string | null;
  expirationDate?: string | null;
  qaStatus: string;
  status: string;
  classificationCode: "RM" | "PKG" | "FG" | "OTHER";
}

export interface LotTransferLotStats {
  lotId: number;
  lotName: string;
  branchId: number;
  unitId?: number | null;
  unitName: string;
  maxCapacity: number;
  totalOccupancy: number;
  totalBatchCount: number;
  matchingBatchesToMove: number;
  matchingQtyToMove: number;
  capacityLeft: number;
  hasNegativeStock?: boolean;
  negativeStockQty?: number;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filterBranchId = searchParams.get("branchId") || searchParams.get("branch_id");
    const filterLotId = searchParams.get("lotId") || searchParams.get("lot_id");
    const filterProductTypeId = searchParams.get("productTypeId") || searchParams.get("product_type_id");
    const timestamp = Date.now();

    let token: string | undefined;
    try {
      const cookieStore = await cookies();
      token =
        cookieStore.get("springboot_token")?.value ||
        cookieStore.get("vos_access_token")?.value ||
        cookieStore.get("token")?.value;
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

    let mmLotsUrl = `${DIRECTUS_URL}/items/mm_lots?limit=-1&_t=${timestamp}`;
    if (filterBranchId) {
      mmLotsUrl += `&filter[branch_id][_eq]=${filterBranchId}`;
    }

    let mmInvUrl = `${DIRECTUS_URL}/items/mm_inventory_lots?limit=-1&sort=-updated_at,-created_at,-inventory_lot_id&_t=${timestamp}`;
    if (filterLotId) {
      mmInvUrl += `&filter[lot_id][_eq]=${filterLotId}`;
    }

    const [batchesRes, lotsRes, unitsRes, productsRes, movementsRes, onhandRes] = await Promise.all([
      fetch(mmInvUrl, { headers, cache: "no-store" }),
      fetch(mmLotsUrl, { headers, cache: "no-store" }).catch(() => null),
      fetch(`${DIRECTUS_URL}/items/units?limit=-1&fields=unit_id,unit_name,unit_shortcut&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
      fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,description,product_name,product_code,barcode,cost_per_unit,price_per_unit,estimated_unit_cost,product_type,product_type.*,product_category.category_name&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
      fetch(`${SPRING_API_BASE}/api/mm-inventory-movements/all`, { headers: reqHeaders, cache: "no-store" }).catch(() => null),
      fetch(`${SPRING_API_BASE}/api/mm-batch-onhand/all`, { headers: reqHeaders, cache: "no-store" }).catch(() => null),
    ]);

    const rawBatches: RawBatch[] = batchesRes && batchesRes.ok ? (await batchesRes.json())?.data || [] : [];
    const lotsData: Record<string, unknown>[] = lotsRes && lotsRes.ok ? (await lotsRes.json())?.data || [] : [];
    const unitsData: Record<string, unknown>[] = unitsRes && unitsRes.ok ? (await unitsRes.json())?.data || [] : [];
    const productsData: Record<string, unknown>[] = productsRes && productsRes.ok ? (await productsRes.json())?.data || [] : [];

    let rawMovements: Record<string, unknown>[] = [];
    if (movementsRes && movementsRes.ok) {
      try {
        const movJson = await movementsRes.json();
        rawMovements = Array.isArray(movJson) ? movJson : movJson?.data || [];
      } catch {
        rawMovements = [];
      }
    }

    let rawOnhand: Record<string, unknown>[] = [];
    if (onhandRes && onhandRes.ok) {
      try {
        const ohJson = await onhandRes.json();
        rawOnhand = Array.isArray(ohJson) ? ohJson : ohJson?.data || [];
      } catch {
        rawOnhand = [];
      }
    }

    // Units mapping
    const unitsMap = new Map<number, { unitId: number; unitName: string; unitShortcut: string }>();
    unitsData.forEach((u) => {
      const uId = Number(u.unit_id || 0);
      if (uId > 0) {
        unitsMap.set(uId, {
          unitId: uId,
          unitName: String(u.unit_name || ""),
          unitShortcut: String(u.unit_shortcut || u.unit_name || ""),
        });
      }
    });

    // Lots mapping
    const lotsMap = new Map<number, { lotId: number; lotName: string; branchId: number; unitId: number; unitName: string; maxCapacity: number }>();
    lotsData.forEach((l) => {
      const lId = Number(l.lot_id || 0);
      if (lId <= 0) return;
      const bId = Number(typeof l.branch_id === "object" && l.branch_id !== null ? (l.branch_id as { id?: number }).id : l.branch_id || 0);
      const uId = Number(l.unit_id || 0);
      const unit = unitsMap.get(uId);
      const uName = unit?.unitShortcut || unit?.unitName || "";
      const maxCap = Number(l.max_batch_capacity || 0);

      lotsMap.set(lId, {
        lotId: lId,
        lotName: String(l.lot_name || `Lot #${lId}`),
        branchId: bId,
        unitId: uId,
        unitName: uName,
        maxCapacity: maxCap,
      });
    });

    // Products mapping
    const productsMap = new Map<number, {
      productId: number;
      productName: string;
      productCode: string;
      description?: string;
      productTypeId: number | null;
      productTypeName: string;
      categoryName: string;
      classificationCode: "RM" | "PKG" | "FG" | "OTHER";
    }>();

    productsData.forEach((p) => {
      const pId = Number(p.product_id || 0);
      if (pId <= 0) return;

      const ptObj = p.product_type as { id?: number; name?: string } | number | undefined;
      const ptId = typeof ptObj === "object" && ptObj !== null ? Number(ptObj.id || 0) : typeof ptObj === "number" ? ptObj : null;
      const ptName = typeof ptObj === "object" && ptObj !== null ? String(ptObj.name || "") : "";
      const catObj = p.product_category as { category_name?: string } | undefined;
      const catName = catObj?.category_name || "";

      const rawName = p.product_name ?? p.name ?? p.title ?? "";
      const prodName = rawName ? String(rawName).trim() : `Product #${pId}`;
      const desc = p.description ? String(p.description).trim() : undefined;
      const prodCode = String(p.product_code || p.barcode || "").trim();

      const classification = resolveProductClassification(ptName || ptId, catName);

      productsMap.set(pId, {
        productId: pId,
        productName: prodName,
        productCode: prodCode,
        description: desc,
        productTypeId: ptId,
        productTypeName: ptName,
        categoryName: catName,
        classificationCode: classification.code,
      });
    });

    // Inventory Lot ID to Lot ID mapping
    const invLotToLotMap = new Map<number, number>();
    rawBatches.forEach((row) => {
      const invId = Number(row.inventory_lot_id || 0);
      const lId = Number(typeof row.lot_id === "object" && row.lot_id !== null ? (row.lot_id as { lot_id?: number }).lot_id : row.lot_id || 0);
      if (invId > 0 && lId > 0) {
        invLotToLotMap.set(invId, lId);
      }
    });

    const resolveLotForBranch = (rawLotId: unknown, invLotId: number, bId: number) => {
      let parsedLotId = 0;
      if (typeof rawLotId === "object" && rawLotId !== null) {
        parsedLotId = Number((rawLotId as { lot_id?: number }).lot_id || 0);
      } else if (rawLotId !== null && rawLotId !== undefined) {
        parsedLotId = Number(rawLotId || 0);
      }

      if (parsedLotId <= 0 && invLotId > 0 && invLotToLotMap.has(invLotId)) {
        parsedLotId = invLotToLotMap.get(invLotId) || 0;
      }

      if (parsedLotId > 0) {
        const matchedLot = lotsMap.get(parsedLotId);
        if (matchedLot && (matchedLot.branchId === bId || !matchedLot.branchId)) {
          return parsedLotId;
        }
        return parsedLotId;
      }
      return 0;
    };

    // Reconcile movements and live on-hand by (branchId, lotId, productId, batchNo)
    const movementNetByBranchInvLotId = new Map<string, { onhand: number; count: number; mfgDate?: string; expDate?: string }>();
    const movementNetByBranchLotProductBatch = new Map<string, { onhand: number; count: number; mfgDate?: string; expDate?: string }>();
    const movementNetByBranchLotProductBatchDate = new Map<string, { onhand: number; count: number; mfgDate?: string; expDate?: string }>();

    rawMovements.forEach((m) => {
      const branchId = Number(m.branchId || m.branch_id || 1);
      const invId = Number(m.inventoryLotId || m.inventory_lot_id || 0);
      const rawLotId = m.mmLotId ?? m.mm_lot_id ?? m.lotId ?? m.lot_id;
      const lotId = resolveLotForBranch(rawLotId, invId, branchId);
      const pId = Number(m.productId || m.product_id || 0);
      const bNo = String(m.batchNo || m.batch_no || "").trim();
      const qIn = Number(m.quantityIn || m.quantity_in || 0);
      const qOut = Number(m.quantityOut || m.quantity_out || 0);
      const net = qIn - qOut;
      const mfgDateStr = m.manufacturingDate || m.manufacturing_date ? String(m.manufacturingDate || m.manufacturing_date).slice(0, 10) : "";
      const expDateStr = m.expirationDate || m.expiration_date || m.expiry_date ? String(m.expirationDate || m.expiration_date || m.expiry_date).slice(0, 10) : "";

      if (invId > 0) {
        const invKey = `${branchId}_${invId}`;
        const cur = movementNetByBranchInvLotId.get(invKey) || { onhand: 0, count: 0 };
        cur.onhand += net;
        cur.count += 1;
        if (mfgDateStr && !cur.mfgDate) cur.mfgDate = mfgDateStr;
        if (expDateStr && !cur.expDate) cur.expDate = expDateStr;
        movementNetByBranchInvLotId.set(invKey, cur);
      }

      if (bNo && lotId > 0 && pId > 0) {
        const baseKey = `${branchId}_${lotId}_${pId}_${bNo.toLowerCase()}`;
        const curBase = movementNetByBranchLotProductBatch.get(baseKey) || { onhand: 0, count: 0 };
        curBase.onhand += net;
        curBase.count += 1;
        if (mfgDateStr && !curBase.mfgDate) curBase.mfgDate = mfgDateStr;
        if (expDateStr && !curBase.expDate) curBase.expDate = expDateStr;
        movementNetByBranchLotProductBatch.set(baseKey, curBase);

        if (mfgDateStr || expDateStr) {
          const dateKey = `${branchId}_${lotId}_${pId}_${bNo.toLowerCase()}_${mfgDateStr}_${expDateStr}`;
          const curDate = movementNetByBranchLotProductBatchDate.get(dateKey) || { onhand: 0, count: 0 };
          curDate.onhand += net;
          curDate.count += 1;
          if (mfgDateStr) curDate.mfgDate = mfgDateStr;
          if (expDateStr) curDate.expDate = expDateStr;
          movementNetByBranchLotProductBatchDate.set(dateKey, curDate);
        } else if (net < 0) {
          // If this OUT movement did not record mfg/exp date, decrement from existing date keys for this batch
          const prefix = `${branchId}_${lotId}_${pId}_${bNo.toLowerCase()}_`;
          let remainingOut = Math.abs(net);
          for (const [dKey, curDate] of movementNetByBranchLotProductBatchDate.entries()) {
            if (dKey.startsWith(prefix) && curDate.onhand > 0 && remainingOut > 0) {
              const deduction = Math.min(curDate.onhand, remainingOut);
              curDate.onhand -= deduction;
              remainingOut -= deduction;
            }
          }
        }
      }
    });

    rawOnhand.forEach((oh) => {
      const branchId = Number(oh.branchId || oh.branch_id || 1);
      const invId = Number(oh.inventoryLotId || oh.inventory_lot_id || 0);
      const rawLotId = oh.mmLotId || oh.mm_lot_id || oh.lotId || oh.lot_id;
      const lotId = resolveLotForBranch(rawLotId, invId, branchId);
      const pId = Number(oh.productId || oh.product_id || 0);
      const bNo = String(oh.batchNo || oh.batch_no || "").trim();
      const onhand = Number(oh.onhandQuantity ?? oh.onhand_quantity ?? 0);
      const mfgDate = (oh.manufacturingDate || oh.manufacturing_date) as string | undefined;
      const expDate = (oh.expirationDate || oh.expiration_date || oh.expiry_date) as string | undefined;
      const mfgDateStr = mfgDate ? String(mfgDate).slice(0, 10) : "";
      const expDateStr = expDate ? String(expDate).slice(0, 10) : "";

      if (invId > 0) {
        const invKey = `${branchId}_${invId}`;
        const cur = movementNetByBranchInvLotId.get(invKey) || { onhand: 0, count: 0 };
        if (cur.count === 0) {
          cur.onhand = onhand;
        }
        if (mfgDate && !cur.mfgDate) cur.mfgDate = mfgDate;
        if (expDate && !cur.expDate) cur.expDate = expDate;
        movementNetByBranchInvLotId.set(invKey, cur);
      }

      if (bNo && lotId > 0 && pId > 0) {
        const baseKey = `${branchId}_${lotId}_${pId}_${bNo.toLowerCase()}`;
        const curBase = movementNetByBranchLotProductBatch.get(baseKey) || { onhand: 0, count: 0 };
        if (curBase.count === 0) {
          curBase.onhand = onhand;
        }
        if (mfgDate && !curBase.mfgDate) curBase.mfgDate = mfgDate;
        if (expDate && !curBase.expDate) curBase.expDate = expDate;
        movementNetByBranchLotProductBatch.set(baseKey, curBase);

        if (mfgDateStr || expDateStr) {
          const dateKey = `${branchId}_${lotId}_${pId}_${bNo.toLowerCase()}_${mfgDateStr}_${expDateStr}`;
          const curDate = movementNetByBranchLotProductBatchDate.get(dateKey) || { onhand: 0, count: 0 };
          if (curDate.count === 0) {
            curDate.onhand = onhand;
          }
          if (mfgDate) curDate.mfgDate = mfgDate;
          if (expDate) curDate.expDate = expDate;
          movementNetByBranchLotProductBatchDate.set(dateKey, curDate);
        }
      }
    });

    // Map raw registered batches into reconciled candidates
    const candidates: ReconciledBatchItem[] = [];

    rawBatches.forEach((row) => {
      const batchId = Number(row.inventory_lot_id ?? 0);
      const rawBranchId = row.branch_id;
      const branchId = typeof rawBranchId === "object" && rawBranchId !== null
        ? Number((rawBranchId as { id?: number; branch_id?: number }).id || (rawBranchId as { id?: number; branch_id?: number }).branch_id || 0)
        : Number(rawBranchId || 0);

      const lotId = resolveLotForBranch(row.lot_id, batchId, branchId);
      const lotInfo = lotsMap.get(lotId);
      const effectiveBranchId = branchId || lotInfo?.branchId || 0;

      // Strictly do not show if inventory lot or storage lot is null or 0
      if (!batchId || batchId <= 0) return;
      if (!lotId || lotId <= 0) return;

      if (filterBranchId && effectiveBranchId !== Number(filterBranchId)) return;
      if (filterLotId && lotId !== Number(filterLotId)) return;

      const rawProdId = row.product_id;
      const productId = typeof rawProdId === "object" && rawProdId !== null
        ? Number((rawProdId as { product_id?: number; id?: number }).product_id || (rawProdId as { product_id?: number; id?: number }).id || 0)
        : Number(rawProdId || 0);
      const batchNumber = String(row.batch_no || "").trim();

      const prodInfo = productsMap.get(productId);

      const mfgNorm = String(row.manufacturing_date || "").slice(0, 10);
      const expNorm = String(row.expiry_date || row.expiration_date || "").slice(0, 10);

      const invKey = `${effectiveBranchId}_${batchId}`;
      const dateKey = `${effectiveBranchId}_${lotId}_${productId}_${batchNumber.toLowerCase()}_${mfgNorm}_${expNorm}`;
      const baseKey = `${effectiveBranchId}_${lotId}_${productId}_${batchNumber.toLowerCase()}`;

      const movementByExactDates = mfgNorm || expNorm ? movementNetByBranchLotProductBatchDate.get(dateKey) : undefined;
      const movementByLotProdBatch = movementNetByBranchLotProductBatch.get(baseKey);
      const movementByInvId = batchId > 0 ? movementNetByBranchInvLotId.get(invKey) : undefined;
      const movementInfo = movementByExactDates || movementByLotProdBatch || movementByInvId;

      const quantity = movementInfo !== undefined ? Number(movementInfo.onhand || 0) : 0;

      if (quantity <= 0) return; // Strictly ignore 0 and negative stock for transfer candidates

      const status = String(row.status || "ACTIVE").toUpperCase();
      if (status === "INACTIVE" || status === "CLOSED") return;

      candidates.push({
        batchId,
        inventoryLotId: batchId,
        batchNumber,
        lotId,
        lotName: lotInfo?.lotName || `Lot #${lotId}`,
        branchId: effectiveBranchId,
        productId,
        productName: prodInfo?.productName || `Product #${productId}`,
        productCode: prodInfo?.productCode || "-",
        productDescription: prodInfo?.description,
        productTypeId: prodInfo?.productTypeId,
        productTypeName: prodInfo?.productTypeName,
        productCategoryName: prodInfo?.categoryName,
        quantity,
        unitCost: Number(row.unit_cost || 0),
        unit_cost: Number(row.unit_cost || 0),
        uomId: lotInfo?.unitId,
        uomName: lotInfo?.unitName || "",
        manufacturingDate: row.manufacturing_date || movementByExactDates?.mfgDate || movementByLotProdBatch?.mfgDate || null,
        expirationDate: row.expiry_date || row.expiration_date || movementByExactDates?.expDate || movementByLotProdBatch?.expDate || null,
        qaStatus: String(row.qa_status || "GOOD").toUpperCase(),
        status,
        classificationCode: prodInfo?.classificationCode || "OTHER",
      });
    });

    // Group and deduplicate batches matching Lot Management rules (groupAndSumLotBatches)
    const batchesByKey = new Map<string, ReconciledBatchItem[]>();
    candidates.forEach((b) => {
      const bNo = b.batchNumber.toLowerCase();
      const key = `${b.branchId}_${b.lotId}_${b.productId}_${bNo}`;
      const list = batchesByKey.get(key) || [];
      list.push(b);
      batchesByKey.set(key, list);
    });

    const deduplicatedBatches: ReconciledBatchItem[] = [];

    batchesByKey.forEach((group) => {
      const dateGroups = new Map<string, ReconciledBatchItem[]>();
      group.forEach((b) => {
        const mfg = (b.manufacturingDate || "").slice(0, 10);
        const exp = (b.expirationDate || "").slice(0, 10);
        const dateKey = `${mfg}_${exp}`;
        const list = dateGroups.get(dateKey) || [];
        list.push(b);
        dateGroups.set(dateKey, list);
      });

      Array.from(dateGroups.values()).forEach((subGroup, idx) => {
        const uniqueMap = new Map<number, ReconciledBatchItem>();
        subGroup.forEach((b) => {
          if (!uniqueMap.has(b.batchId)) uniqueMap.set(b.batchId, b);
        });
        const items = Array.from(uniqueMap.values());
        if (items.length === 0) return;

        const base = items[0];
        const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
        if (totalQty <= 0) return;

        const displayBatchNo = idx === 0 ? base.batchNumber : `${base.batchNumber}-${idx}`;

        deduplicatedBatches.push({
          ...base,
          batchNumber: displayBatchNo,
          quantity: totalQty,
        });
      });
    });

    // Compute Lot Stats
    const lotStats: Record<number, LotTransferLotStats> = {};
    const parsedTargetTypeId = filterProductTypeId ? Number(filterProductTypeId) : null;

    lotsMap.forEach((lot, lId) => {
      if (filterBranchId && lot.branchId !== Number(filterBranchId)) return;
      if (filterLotId && lId !== Number(filterLotId)) return;

      const lotBatches = deduplicatedBatches.filter((b) => b.lotId === lId);

      // Total occupancy sums positive stock quantities in this lot (matching WarehouseRackView totalRackOccupancy)
      const totalOccupancy = lotBatches.reduce((sum, b) => {
        const q = Number(b.quantity) || 0;
        return q > 0 ? sum + q : sum;
      }, 0);
      const totalBatchCount = lotBatches.length;

      // Filter matching batches by selected Product Type
      const matchingBatches = lotBatches.filter((b) => {
        if (!parsedTargetTypeId) return true;
        if (b.productTypeId && b.productTypeId === parsedTargetTypeId) return true;

        // Code fallback comparison: 388 -> FG, 389 -> RM, 390 -> PKG
        if (parsedTargetTypeId === 388 && b.classificationCode === "FG") return true;
        if (parsedTargetTypeId === 389 && b.classificationCode === "RM") return true;
        if (parsedTargetTypeId === 390 && b.classificationCode === "PKG") return true;

        return false;
      });

      const matchingQtyToMove = matchingBatches.reduce((sum, b) => sum + b.quantity, 0);
      const matchingBatchesToMove = matchingBatches.length;

      const maxCap = lot.maxCapacity;
      const capacityLeft = maxCap > 0 ? Math.max(0, maxCap - totalOccupancy) : 999999;

      let hasNegativeStock = false;
      let negativeStockQty = 0;
      movementNetByBranchLotProductBatch.forEach((cur, key) => {
        const parts = key.split("_");
        const keyLotId = Number(parts[1] || 0);
        if (keyLotId === lId && cur.onhand < 0) {
          hasNegativeStock = true;
          negativeStockQty += Math.abs(cur.onhand);
        }
      });
      if (!hasNegativeStock) {
        movementNetByBranchInvLotId.forEach((cur, key) => {
          const parts = key.split("_");
          const invId = Number(parts[1] || 0);
          const keyLotId = invLotToLotMap.get(invId);
          if (keyLotId === lId && cur.onhand < 0) {
            hasNegativeStock = true;
            negativeStockQty += Math.abs(cur.onhand);
          }
        });
      }

      lotStats[lId] = {
        lotId: lId,
        lotName: lot.lotName,
        branchId: lot.branchId,
        unitId: lot.unitId,
        unitName: lot.unitName,
        maxCapacity: maxCap,
        totalOccupancy,
        totalBatchCount,
        matchingBatchesToMove,
        matchingQtyToMove,
        capacityLeft,
        hasNegativeStock,
        negativeStockQty,
      };
    });

    return NextResponse.json({
      lotStats,
      batches: deduplicatedBatches,
    });
  } catch (error) {
    console.error("[LotTransfer Batches API] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch lot transfer batches" },
      { status: 500 }
    );
  }
}
