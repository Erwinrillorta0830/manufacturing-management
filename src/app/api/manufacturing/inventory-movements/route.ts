import { NextResponse } from "next/server";
import {
  fetchMmInventoryMovements,
  movementErrorStatus,
  type MmInventoryMovement
} from "@/app/api/manufacturing/services/mm-inventory-movements.service";

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
  return Number.isSafeInteger(number) && number > 0 ? number : null;
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
      lot: numberOrNull(lotId),
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

    if (branchNumber) filtered = filtered.filter((movement) => Number(movement.branchId) === branchNumber);
    if (productTypeNumber) filtered = filtered.filter((movement) => Number(movement.productTypeId) === productTypeNumber);
    if (referenceNumber) filtered = filtered.filter((movement) => Number(movement.referenceId) === referenceNumber);
    if (productNumber) filtered = filtered.filter((movement) => Number(movement.productId) === productNumber);
    if (lotNumber) filtered = filtered.filter((movement) => Number(movement.lotId ?? movement.lot_id ?? movement.mmLotId ?? movement.mm_lot_id) === lotNumber);
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
    const message = error instanceof Error ? error.message : "Failed to load inventory movements.";
    console.error("[MM Inventory Movements BFF] Read failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
