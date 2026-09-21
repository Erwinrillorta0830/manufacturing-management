import { NextResponse } from "next/server";
import {
  fetchMmInventoryMovements,
  movementErrorStatus,
  type MmInventoryMovement
} from "@/app/api/manufacturing/services/mm-inventory-movements.service";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";
import { movementMmLotId } from "@/modules/manufacturing-management/lot-management/movement-reference";

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

function directusNumber(value: unknown): number | null {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["movement_id", "id", "user_id", "lot_id"]) {
      const nested = Number(record[key]);
      if (Number.isSafeInteger(nested) && nested > 0) return nested;
    }
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function directusText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function canonicalLotTransferType(value: unknown, quantity: number): string {
  const normalized = directusText(value)
    ?.toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "";

  if (normalized.includes("REVERSAL")) {
    return normalized.includes("OUT") || quantity < 0
      ? "LOT_TRANSFER_REVERSAL_OUT"
      : "LOT_TRANSFER_REVERSAL_IN";
  }
  return normalized.includes("OUT") || quantity < 0
    ? "LOT_TRANSFER_OUT"
    : "LOT_TRANSFER_IN";
}

function normalizeDirectusLotTransferMovement(row: Record<string, unknown>): MmInventoryMovement | null {
  const movementId = directusNumber(row.movement_id ?? row.id);
  const quantity = Number(row.quantity ?? 0);
  const mmLotId = directusNumber(row.mm_lot_id);
  const sourceDocumentNo = directusText(row.source_document_no);

  if (!movementId || !Number.isFinite(quantity) || quantity === 0 || !mmLotId || !sourceDocumentNo?.toUpperCase().startsWith("LTR-")) {
    return null;
  }

  const transactionDate = directusText(row.created_at);
  const transactionTypeId = directusNumber(row.transaction_type_id);
  const branchId = directusNumber(row.branch_id);
  const productId = directusNumber(row.product_id) || 0;
  const batchNo = directusText(row.batch_no) || "";
  const manufacturingDate = directusText(row.manufacturing_date);
  const expirationDate = directusText(row.expiry_date ?? row.expiration_date);
  const transactionTypeValue = row.transaction_type
    ?? row.type_name
    ?? (row.transaction_type_id && typeof row.transaction_type_id === "object"
      ? (row.transaction_type_id as Record<string, unknown>).type_name
      : null);
  const transactionType = canonicalLotTransferType(transactionTypeValue, quantity);
  const quantityIn = quantity > 0 ? quantity : 0;
  const quantityOut = quantity < 0 ? Math.abs(quantity) : 0;

  return {
    movementKey: `MM-LEGACY-${movementId}`,
    movement_key: `MM-LEGACY-${movementId}`,
    movementId,
    movement_id: movementId,
    transactionTypeId,
    transaction_type_id: transactionTypeId,
    versionId: null,
    version_id: null,
    transactionType,
    transaction_type: transactionType,
    movementDirection: quantity > 0 ? "IN" : "OUT",
    movement_direction: quantity > 0 ? "IN" : "OUT",
    sourceModule: "MM_INVENTORY",
    source_module: "MM_INVENTORY",
    referenceId: directusNumber(row.source_document_id),
    reference_id: directusNumber(row.source_document_id),
    referenceDetailId: directusNumber(row.source_document_detail_id) || movementId,
    reference_detail_id: directusNumber(row.source_document_detail_id) || movementId,
    referenceNo: sourceDocumentNo,
    reference_no: sourceDocumentNo,
    transactionDate: transactionDate || "",
    transaction_date: transactionDate || "",
    postedAt: transactionDate,
    posted_at: transactionDate,
    postedBy: directusNumber(row.created_by),
    posted_by: directusNumber(row.created_by),
    branchId,
    branch_id: branchId,
    inventoryLotId: directusNumber(row.inventory_lot_id),
    inventory_lot_id: directusNumber(row.inventory_lot_id),
    mmLotId,
    mm_lot_id: mmLotId,
    lotId: mmLotId,
    lot_id: mmLotId,
    productId,
    product_id: productId,
    productCode: "",
    product_code: "",
    productName: "",
    product_name: "",
    productTypeId: null,
    product_type_id: null,
    productTypeName: null,
    product_type_name: null,
    unitId: null,
    unit_id: null,
    batchNo: batchNo,
    batch_no: batchNo,
    manufacturingDate,
    manufacturing_date: manufacturingDate,
    expirationDate,
    expiration_date: expirationDate,
    expiryDate: expirationDate,
    expiry_date: expirationDate,
    inventoryCondition: "GOOD",
    inventory_condition: "GOOD",
    quantityIn,
    quantity_in: quantityIn,
    quantityOut,
    quantity_out: quantityOut,
    unitCost: Number(row.unit_cost ?? 0) || 0,
    unit_cost: Number(row.unit_cost ?? 0) || 0,
    differenceCost: 0,
    difference_cost: 0,
    remarks: directusText(row.remarks),
    stockType: null,
    stock_type: null,
    sourceStatus: "POSTED",
    source_status: "POSTED",
    quantity,
    source_document_id: directusNumber(row.source_document_id),
    source_document_no: sourceDocumentNo,
    created_at: transactionDate,
    created_by: directusNumber(row.created_by),
    id: movementId
  };
}

async function fetchDirectusLotTransferMovements(mmLotId: number | null): Promise<MmInventoryMovement[]> {
  if (!DIRECTUS_URL) return [];

  const params = new URLSearchParams({
    limit: "-1",
    sort: "created_at,movement_id",
    fields: [
      "movement_id",
      "source_document_id",
      "source_document_detail_id",
      "source_document_no",
      "product_id",
      "branch_id",
      "inventory_lot_id",
      "mm_lot_id",
      "batch_no",
      "quantity",
      "expiry_date",
      "manufacturing_date",
      "transaction_type_id",
      "created_by",
      "created_at",
      "remarks"
    ].join(",")
  });
  params.set("filter[source_document_no][_starts_with]", "LTR-");
  if (mmLotId !== null) params.set("filter[mm_lot_id][_eq]", String(mmLotId));

  try {
    const response = await fetch(`${DIRECTUS_URL}/items/inventory_movements?${params.toString()}`, {
      headers: directusHeaders,
      cache: "no-store"
    });
    if (!response.ok) {
      console.warn(`[MM Inventory Movements BFF] Directus lot-transfer fallback returned HTTP ${response.status}.`);
      return [];
    }

    const payload = await response.json().catch(() => null);
    const rows = payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];
    return rows
      .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
      .map(normalizeDirectusLotTransferMovement)
      .filter((row): row is MmInventoryMovement => row !== null);
  } catch (error) {
    console.warn("[MM Inventory Movements BFF] Directus lot-transfer fallback failed:", error);
    return [];
  }
}

function mergeMovements(
  primary: MmInventoryMovement[],
  supplements: MmInventoryMovement[]
): MmInventoryMovement[] {
  const byMovementId = new Map<number, MmInventoryMovement>();
  const withoutMovementId: MmInventoryMovement[] = [];

  for (const movement of supplements) {
    const movementId = Number(movement.movementId ?? movement.movement_id ?? 0);
    if (movementId > 0) byMovementId.set(movementId, movement);
    else withoutMovementId.push(movement);
  }

  for (const movement of primary) {
    const movementId = Number(movement.movementId ?? movement.movement_id ?? 0);
    if (movementId > 0) {
      byMovementId.set(movementId, { ...byMovementId.get(movementId), ...movement });
    } else {
      withoutMovementId.push(movement);
    }
  }

  return [...byMovementId.values(), ...withoutMovementId];
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
    const canonicalLotId = mmLotId || lotId;
    const inventoryLotId = valueOrNull(searchParams.get("inventoryLotId") || searchParams.get("inventory_lot_id"));
    const batchNo = valueOrNull(searchParams.get("batchNo") || searchParams.get("batch_no") || searchParams.get("batch"));
    const direction = valueOrNull(searchParams.get("direction") || searchParams.get("movementDirection"));
    const transactionType = valueOrNull(searchParams.get("transactionType") || searchParams.get("transaction_type"));
    const transactionTypeId = valueOrNull(searchParams.get("transactionTypeId") || searchParams.get("transaction_type_id"));
    const movementId = valueOrNull(searchParams.get("movementId") || searchParams.get("movement_id"));
    const includeLotTransfers = ["1", "true", "yes"].includes((searchParams.get("includeLotTransfers") || "").toLowerCase());
    const canonicalLotNumber = numberOrNull(canonicalLotId);

    let springMovements: MmInventoryMovement[] = [];
    try {
      springMovements = await fetchMmInventoryMovements({
        branch: numberOrNull(branch),
        productType: numberOrNull(productType),
        referenceId: numberOrNull(referenceId),
        product: numberOrNull(productId),
        mmLot: canonicalLotNumber,
        inventoryLot: numberOrNull(inventoryLotId),
        movementDirection: direction,
        transactionType,
        transactionTypeId: numberOrNull(transactionTypeId),
        movementId: numberOrNull(movementId)
      });
    } catch (error) {
      if (!includeLotTransfers) throw error;
      console.warn("[MM Inventory Movements BFF] Spring movement lookup failed; using the Directus lot-transfer fallback.", error);
    }
    const directusMovements = includeLotTransfers
      ? await fetchDirectusLotTransferMovements(canonicalLotNumber)
      : [];
    const movements = mergeMovements(springMovements, directusMovements);

    let filtered = movements;
    const branchNumber = numberOrNull(branch);
    const productTypeNumber = numberOrNull(productType);
    const referenceNumber = numberOrNull(referenceId);
    const productNumber = numberOrNull(productId);
    const mmLotNumber = canonicalLotNumber;
    const inventoryLotNumber = numberOrNull(inventoryLotId);
    const transactionTypeNumber = numberOrNull(transactionTypeId);
    const movementNumber = numberOrNull(movementId);

    if (branchNumber) filtered = filtered.filter((movement) => Number(movement.branchId) === branchNumber);
    if (productTypeNumber) filtered = filtered.filter((movement) => Number(movement.productTypeId) === productTypeNumber);
    if (referenceNumber) filtered = filtered.filter((movement) => Number(movement.referenceId) === referenceNumber);
    if (productNumber) filtered = filtered.filter((movement) => Number(movement.productId) === productNumber);
    if (mmLotNumber !== null) filtered = filtered.filter((movement) => movementMmLotId(movement) === mmLotNumber);
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
