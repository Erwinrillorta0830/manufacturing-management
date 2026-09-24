import { NextResponse } from "next/server";
import {
  fetchMmInventoryMovements,
  movementErrorStatus,
  type MmInventoryMovement,
  type NormalizedMmInventoryMovement,
} from "@/app/api/manufacturing/services/mm-inventory-movements.service";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type MMInventoryMovement = MmInventoryMovement;

function valueOrNull(value: string | null): string | null {
  const normalized = value?.trim() || null;
  return normalized && normalized.toUpperCase() !== "ALL" ? normalized : null;
}

function numberOrNull(value: string | null): number | null {
  const normalized = valueOrNull(value);
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const branch = valueOrNull(searchParams.get("branch") || searchParams.get("branch_id"));
    const productType = valueOrNull(searchParams.get("productType") || searchParams.get("product_type_id"));
    const referenceNo = valueOrNull(searchParams.get("referenceNo") || searchParams.get("reference_no"));
    const referenceId = valueOrNull(searchParams.get("referenceId") || searchParams.get("reference_id"));
    const productId = valueOrNull(searchParams.get("productId") || searchParams.get("product_id"));
    const lotId = valueOrNull(searchParams.get("lotId") || searchParams.get("lot_id") || searchParams.get("lot"));
    const mmLotId = valueOrNull(searchParams.get("mmLotId") || searchParams.get("mm_lot_id"));
    const inventoryLotId = valueOrNull(searchParams.get("inventoryLotId") || searchParams.get("inventory_lot_id"));
    const batchNo = valueOrNull(searchParams.get("batchNo") || searchParams.get("batch_no") || searchParams.get("batch"));
    const direction = valueOrNull(searchParams.get("direction") || searchParams.get("movementDirection"));
    const transactionType = valueOrNull(searchParams.get("transactionType") || searchParams.get("transaction_type"));
    const transactionTypeId = valueOrNull(searchParams.get("transactionTypeId") || searchParams.get("transaction_type_id"));
    const movementId = valueOrNull(searchParams.get("movementId") || searchParams.get("movement_id"));

    const movements = await fetchMmInventoryMovements({
      branch: numberOrNull(branch),
      productType: numberOrNull(productType),
      referenceId: numberOrNull(referenceId),
      product: numberOrNull(productId),
      mmLot: numberOrNull(mmLotId),
      inventoryLot: numberOrNull(inventoryLotId),
      movementDirection: direction,
      transactionType,
      transactionTypeId: numberOrNull(transactionTypeId),
      movementId: numberOrNull(movementId)
    });

    let filtered = movements;
    const branchNumber = numberOrNull(branch);
    const productTypeNumber = numberOrNull(productType);
    const referenceNumber = numberOrNull(referenceId);
    const productNumber = numberOrNull(productId);
    const lotNumber = numberOrNull(lotId);
    const mmLotNumber = numberOrNull(mmLotId);
    const inventoryLotNumber = numberOrNull(inventoryLotId);
    const transactionTypeNumber = numberOrNull(transactionTypeId);
    const movementNumber = numberOrNull(movementId);

    // Directus rejected-leg supplement: the Spring movement mirror does not
    // carry QA Reject / Bad Order Receipt legs (transaction_type_id 5), which
    // left bad-stock lots with empty movement history. Spring rows stay
    // canonical: a supplement leg already covered by Spring is dropped to
    // avoid duplicates if the mirror catches up later.
    try {
        const supplementParams = new URLSearchParams({
            "filter[transaction_type_id][_eq]": "5",
            fields: "movement_id,inventory_lot_id,mm_lot_id,product_id,branch_id,batch_no,quantity,source_document_id,source_document_no,created_at,created_by,remarks,manufacturing_date,expiry_date",
            limit: "-1",
        });
        if (mmLotNumber) supplementParams.set("filter[mm_lot_id][_eq]", String(mmLotNumber));
        if (inventoryLotNumber) supplementParams.set("filter[inventory_lot_id][_eq]", String(inventoryLotNumber));
        if (branchNumber) supplementParams.set("filter[branch_id][_eq]", String(branchNumber));
        if (productNumber) supplementParams.set("filter[product_id][_eq]", String(productNumber));
        const supplementRes = await fetch(
            `${DIRECTUS_URL}/items/inventory_movements?${supplementParams.toString()}`,
            { headers, cache: "no-store" },
        );
        if (supplementRes.ok) {
            const supplementJson = await supplementRes.json();
            const rejectedRows: Record<string, unknown>[] = supplementJson.data || [];
            if (rejectedRows.length > 0) {
                const springCovered = new Set<string>();
                for (const m of filtered) {
                    const lotId = Number(m.mmLotId ?? m.mm_lot_id ?? m.lotId ?? m.lot_id ?? 0);
                    const productId = Number(m.productId ?? m.product_id ?? 0);
                    const batchNo = String(m.batchNo ?? m.batch_no ?? "").trim().toLowerCase();
                    if (lotId > 0 && productId > 0 && batchNo) {
                        springCovered.add(`${lotId}_${productId}_${batchNo}`);
                    }
                }
                const qaStatusByInvLotId = new Map<number, string>();
                const invIds = Array.from(new Set(
                    rejectedRows.map((row) => Number(row.inventory_lot_id ?? 0)).filter((id) => id > 0),
                ));
                if (invIds.length > 0) {
                    const lotsRes = await fetch(
                        `${DIRECTUS_URL}/items/mm_inventory_lots?filter[inventory_lot_id][_in]=${invIds.join(",")}&fields=inventory_lot_id,qa_status&limit=${invIds.length}`,
                        { headers, cache: "no-store" },
                    ).catch(() => null);
                    if (lotsRes && lotsRes.ok) {
                        const lotsJson = await lotsRes.json().catch(() => null);
                        for (const lotRow of (lotsJson?.data || []) as Record<string, unknown>[]) {
                            const invId = Number(lotRow.inventory_lot_id ?? 0);
                            const qa = String(lotRow.qa_status || "").trim().toUpperCase();
                            if (invId > 0 && qa) qaStatusByInvLotId.set(invId, qa);
                        }
                    }
                }
                const supplemented: NormalizedMmInventoryMovement[] = [];
                for (const row of rejectedRows) {
                    const lotId = Number(row.mm_lot_id ?? 0);
                    const productId = Number(row.product_id ?? 0);
                    const batchNo = String(row.batch_no || "").trim();
                    const quantity = Number(row.quantity ?? 0);
                    if (!(lotId > 0 && productId > 0 && batchNo && Number.isFinite(quantity) && quantity !== 0)) continue;
                    if (springCovered.has(`${lotId}_${productId}_${batchNo.toLowerCase()}`)) continue;
                    const movementId = Number(row.movement_id ?? 0) || null;
                    const invId = Number(row.inventory_lot_id ?? 0) || null;
                    const branchId = Number(row.branch_id ?? 0) || null;
                    const createdAt = String(row.created_at || "");
                    supplemented.push({
                        movementKey: movementId ? `DIRECTUS-${movementId}` : null,
                        movementId,
                        transactionTypeId: 5,
                        versionId: null,
                        transactionType: "QA Reject / Bad Order Receipt",
                        movementDirection: "IN",
                        sourceModule: null,
                        referenceId: Number(row.source_document_id ?? 0) || null,
                        referenceDetailId: null,
                        referenceNo: String(row.source_document_no || ""),
                        transactionDate: createdAt || null,
                        postedAt: createdAt || null,
                        postedBy: Number(row.created_by ?? 0) || null,
                        branchId,
                        inventoryLotId: invId,
                        mmLotId: lotId,
                        productId,
                        productCode: null,
                        productName: null,
                        productTypeId: null,
                        productTypeName: null,
                        unitId: null,
                        batchNo,
                        manufacturingDate: String(row.manufacturing_date || "") || null,
                        expirationDate: String(row.expiry_date || "") || null,
                        inventoryCondition: (invId && qaStatusByInvLotId.get(invId)) || null,
                        quantity,
                        movement_id: movementId,
                        transaction_type_id: 5,
                        version_id: null,
                        source_document_id: Number(row.source_document_id ?? 0) || null,
                        source_document_no: String(row.source_document_no || ""),
                        product_id: productId,
                        branch_id: branchId,
                        inventory_lot_id: invId,
                        mm_lot_id: lotId,
                        batch_no: batchNo,
                        expiry_date: String(row.expiry_date || "") || null,
                        manufacturing_date: String(row.manufacturing_date || "") || null,
                        created_at: createdAt || null,
                        created_by: Number(row.created_by ?? 0) || null,
                        quantity_in: Math.max(0, quantity),
                        quantity_out: Math.max(0, -quantity),
                        quantityIn: Math.max(0, quantity),
                        quantityOut: Math.max(0, -quantity),
                        remarks: String(row.remarks || "") || null,
                    });
                }
                filtered = [...filtered, ...supplemented];
            }
        }
    } catch (supplementError) {
        console.error("[MM Inventory Movements BFF] Rejected-leg supplement failed:", supplementError);
    }

    if (branchNumber) filtered = filtered.filter((movement) => Number(movement.branchId) === branchNumber);
    if (productTypeNumber) filtered = filtered.filter((movement) => Number(movement.productTypeId) === productTypeNumber);
    if (referenceNumber) filtered = filtered.filter((movement) => Number(movement.referenceId) === referenceNumber);
    if (productNumber) filtered = filtered.filter((movement) => Number(movement.productId) === productNumber);
    if (lotNumber !== null) {
      filtered = filtered.filter((m) => {
        const rawInvId = m.inventoryLotId ?? m.inventory_lot_id;
        const hasInvId = rawInvId !== null && rawInvId !== undefined && Number(rawInvId) > 0;
        const rawLotId = m.mmLotId ?? m.mm_lot_id ?? m.lotId ?? m.lot_id;
        const effectiveLotId = (hasInvId && rawLotId) ? Number(rawLotId) : 0;
        return Number(effectiveLotId) === Number(lotNumber);
      });
    }
    if (mmLotNumber) filtered = filtered.filter((movement) => Number(movement.mmLotId ?? movement.mm_lot_id ?? movement.lotId ?? movement.lot_id) === mmLotNumber);
    if (inventoryLotNumber) filtered = filtered.filter((movement) => Number(movement.inventoryLotId ?? movement.inventory_lot_id) === inventoryLotNumber);
    if (transactionTypeNumber) filtered = filtered.filter((movement) => Number(movement.transactionTypeId) === transactionTypeNumber);
    if (movementNumber) filtered = filtered.filter((movement) => Number(movement.movementId) === movementNumber);

    if (referenceNo) {
      const referenceSearch = referenceNo.toUpperCase();
      filtered = filtered.filter((movement) => String(movement.referenceNo || "").toUpperCase().includes(referenceSearch));
    }
    if (batchNo) {
      const batchSearch = batchNo.toLowerCase();
      filtered = filtered.filter((movement) => String(movement.batchNo || "").toLowerCase().includes(batchSearch));
    }
    if (direction) {
      const directionUpper = direction.toUpperCase();
      filtered = filtered.filter((movement) => String(movement.movementDirection || "").toUpperCase() === directionUpper);
    }
    if (transactionType) {
      const transactionTypeUpper = transactionType.toUpperCase();
      filtered = filtered.filter((movement) => String(movement.transactionType || "").toUpperCase() === transactionTypeUpper);
    }

    return NextResponse.json(filtered);
  } catch (error) {
    const status = movementErrorStatus(error);
    let message = error instanceof Error ? error.message : "Failed to load inventory movements.";
    message = message
      .replace(/,\s*"path":\s*"[^"]*"/g, "")
      .replace(/"path":\s*"[^"]*"/g, "")
      .replace(/https?:\/\/[^\s]+/g, "")
      .trim();
    console.error("[MM Inventory Movements BFF] Read failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}