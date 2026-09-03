import * as repo from "./stock-transfer.repo";
import * as helpers from "./stock-transfer.helpers";
import { fetchItems, createItems } from "./api";
import type { 
  StockTransferRow, 
  EnrichedProduct,
  CreateTransferPayload,
  UpdateTransferPayload,
  StockTransferInsertPayload,
  ProductRow,
  MMStockTransferDetail,
} from "../types/stock-transfer.types";
import { CreateStockTransferSchema, UpdateStockTransferSchema, UpdateItemValue } from "../types/stock-transfer.schema";
import { createInventoryLot, fetchLotsByBranch, fetchInventoryLots, ensureLotForBranch } from "@/modules/manufacturing-management/shared/services/lot-tracking.service";
import { allocateStock } from "@/modules/manufacturing-management/shared/services/stock-allocation.engine";

/**
 * Safely resolves valid lot_id and inventory_lot_id foreign keys from existing records
 * or creates an appropriate source inventory lot to satisfy foreign key constraints.
 */
async function resolveDetailLotReferences(
  transfer: StockTransferRow,
  destLotId?: number | null,
  destInventoryLotId?: number | null
): Promise<{ lot_id: number; inventory_lot_id: number; target_lot_id: number | null; target_inventory_lot_id: number | null } | null> {
  const prodId = typeof transfer.product_id === "object" ? transfer.product_id.product_id : transfer.product_id;
  const srcBranch = typeof transfer.source_branch_id === "object" && transfer.source_branch_id !== null ? transfer.source_branch_id.id : (transfer.source_branch_id || transfer.source_branch);
  const targetBranch = typeof transfer.target_branch_id === "object" && transfer.target_branch_id !== null ? transfer.target_branch_id.id : (transfer.target_branch_id || transfer.target_branch);

  let sourceLotId: number | null = transfer.source_lot_id ? Number(transfer.source_lot_id) : null;
  let sourceInvLotId: number | null = transfer.source_inventory_lot_id ? Number(transfer.source_inventory_lot_id) : null;

  // 1. If source lot references are missing, look up existing inventory lot on source branch
  if ((!sourceLotId || !sourceInvLotId) && srcBranch && prodId) {
    try {
      const invLots = await fetchInventoryLots({ branchId: Number(srcBranch), productId: Number(prodId) });
      if (invLots.length > 0) {
        sourceLotId = sourceLotId || (invLots[0].lot_id ? Number(invLots[0].lot_id) : null);
        sourceInvLotId = sourceInvLotId || (invLots[0].inventory_lot_id ? Number(invLots[0].inventory_lot_id) : null);
      }
    } catch (e) {
      console.warn("[StockTransfer] Warning looking up source inventory lot:", e);
    }
  }

  // 2. If lot_id still missing, check if any lot exists for the source branch or create a master lot
  if (!sourceLotId && srcBranch) {
    try {
      const lot = await ensureLotForBranch(Number(srcBranch));
      if (lot && lot.lot_id) {
        sourceLotId = Number(lot.lot_id);
      }
    } catch (e) {
      console.warn("[StockTransfer] Warning ensuring source branch lot:", e);
    }
  }

  // 3. If still missing, check target lot or target branch lots
  if (!sourceLotId) {
    if (destLotId) {
      sourceLotId = Number(destLotId);
    } else if (targetBranch) {
      try {
        const lots = await fetchLotsByBranch(Number(targetBranch));
        if (lots.length > 0 && lots[0].lot_id) {
          sourceLotId = Number(lots[0].lot_id);
        }
      } catch (e) {
        console.warn("[StockTransfer] Warning looking up target branch lots:", e);
      }
    }
  }

  // 4. If source inventory lot is missing but we have sourceLotId, create a base inventory lot record
  if (!sourceInvLotId && sourceLotId && (srcBranch || targetBranch) && prodId) {
    try {
      const branchForLot = srcBranch || targetBranch;
      const res = await createInventoryLot({
        lot_id: Number(sourceLotId),
        branch_id: Number(branchForLot),
        product_id: Number(prodId),
        batch_no: transfer.batch_no || `TRF-SRC-${transfer.order_no}-${transfer.id}`,
        unit_cost: transfer.amount / (transfer.ordered_quantity || 1),
        qa_status: "GOOD",
        status: "ACTIVE",
        source_type: "STOCK_TRANSFER",
        source_reference: transfer.order_no,
      });
      sourceInvLotId = res?.data?.inventory_lot_id ? Number(res.data.inventory_lot_id) : null;
    } catch (e) {
      console.warn("[StockTransfer] Warning creating fallback source inventory lot:", e);
    }
  }

  // If we couldn't resolve valid foreign keys, return null so we don't attempt an invalid insert
  if (!sourceLotId || !sourceInvLotId) {
    return null;
  }

  return {
    lot_id: Number(sourceLotId),
    inventory_lot_id: Number(sourceInvLotId),
    target_lot_id: destLotId ? Number(destLotId) : null,
    target_inventory_lot_id: destInventoryLotId ? Number(destInventoryLotId) : null,
  };
}

/**
 * Ensures an active master lot exists in mm_lots for a given branch using authenticated Directus client.
 * Satisfies all NOT NULL constraints: unit_id, created_by, branch_id, lot_name.
 */
async function ensureBranchLotDirect(branchId: number, unitId?: number | null, userId?: number | null): Promise<number | null> {
  try {
    const res = await fetchItems<{ lot_id?: number; id?: number; status?: string }>("items/mm_lots", {
      filter: JSON.stringify({ branch_id: { _eq: branchId } }),
      limit: 10,
      fields: "lot_id,status,branch_id",
    }).catch(() => ({ data: [] }));

    if (res.data && res.data.length > 0) {
      const active = res.data.find(l => l.status === "ACTIVE" || !l.status) || res.data[0];
      const lotId = Number(active.lot_id || (active as unknown as { id?: number }).id);
      if (lotId) {
        console.log(`[StockTransfer] Found existing lot ${lotId} for branch ${branchId}`);
        return lotId;
      }
    }

    // Resolve valid unit_id for mm_lots foreign key
    let validUnitId = unitId ? Number(unitId) : null;
    if (!validUnitId) {
      const unitsRes = await fetchItems<{ unit_id?: number }>("items/units", { limit: 1, fields: "unit_id" }).catch(() => ({ data: [] }));
      validUnitId = Number(unitsRes.data?.[0]?.unit_id || 1);
    }

    const createRes = await createItems<{ lot_id?: number; id?: number }>("items/mm_lots", {
      lot_name: `Main Lot - Branch ${branchId}`,
      branch_id: branchId,
      unit_id: validUnitId,
      max_batch_capacity: 100,
      status: "ACTIVE",
      description: "Auto-generated lot for stock operations",
      created_by: userId || 1,
    });

    if (createRes) {
      const raw = createRes.data || createRes;
      const item = Array.isArray(raw) ? raw[0] : raw;
      const newLotId = typeof item === "number" ? item : Number(item?.lot_id || item?.id);
      if (newLotId) {
        console.log(`[StockTransfer] Created new lot ${newLotId} for branch ${branchId}`);
        return newLotId;
      }
    }

    const confirmRes = await fetchItems<{ lot_id?: number }>("items/mm_lots", {
      filter: JSON.stringify({ branch_id: { _eq: branchId } }),
      limit: 1,
      fields: "lot_id",
    }).catch(() => ({ data: [] }));

    if (confirmRes.data && confirmRes.data.length > 0) {
      return Number(confirmRes.data[0].lot_id);
    }
  } catch (err) {
    console.error(`[StockTransfer] Failed to ensure lot for branch ${branchId}:`, err);
  }
  return null;
}

/**
 * Ensures a destination inventory lot exists in mm_inventory_lots for a specific lot, product, and batch number.
 * Conforms strictly to schema: UNIQUE KEY (lot_id, product_id, batch_no) & FK (lot_id, branch_id) -> mm_lots.
 */
async function ensureDestinationInventoryLot(params: {
  lotId?: number | null;
  branchId: number;
  productId: number;
  unitId?: number | null;
  batchNo: string;
  unitCost: number;
  manufacturingDate?: string | null;
  expiryDate?: string | null;
  qaStatus?: string;
  sourceReference: string;
  userId?: number | null;
}): Promise<{ inventoryLotId: number; lotId: number } | null> {
  const { branchId, productId, unitId, batchNo, unitCost, manufacturingDate, expiryDate, qaStatus, sourceReference, userId } = params;
  if (!branchId || !productId || !batchNo) {
    console.warn("[StockTransfer] ensureDestinationInventoryLot missing required parameters:", { productId, batchNo, branchId });
    return null;
  }

  try {
    // 1. Resolve and validate lot_id for the target branch in mm_lots
    let validLotId: number | null = null;
    if (params.lotId) {
      const checkLot = await fetchItems<{ lot_id?: number }>("items/mm_lots", {
        filter: JSON.stringify({
          _and: [
            { lot_id: { _eq: Number(params.lotId) } },
            { branch_id: { _eq: branchId } },
          ],
        }),
        limit: 1,
        fields: "lot_id",
      }).catch(() => ({ data: [] }));

      if (checkLot.data && checkLot.data.length > 0) {
        validLotId = Number(checkLot.data[0].lot_id || params.lotId);
      }
    }

    if (!validLotId) {
      validLotId = await ensureBranchLotDirect(branchId, unitId, userId);
    }

    if (!validLotId) {
      console.warn(`[StockTransfer] Could not resolve valid destination lot for branch ${branchId}`);
      return null;
    }

    // 2. Check if inventory lot already exists in mm_inventory_lots for (lot_id, product_id, batch_no)
    // NOTE: mm_inventory_lots primary key is inventory_lot_id (no 'id' field exists)
    try {
      const existingRes = await fetchItems<{ inventory_lot_id: number }>("items/mm_inventory_lots", {
        filter: JSON.stringify({
          _and: [
            { lot_id: { _eq: validLotId } },
            { product_id: { _eq: productId } },
            { batch_no: { _eq: batchNo } },
          ],
        }),
        limit: 1,
        fields: "inventory_lot_id,lot_id,branch_id,product_id,batch_no",
      });

      if (existingRes.data && existingRes.data.length > 0) {
        const foundId = Number(existingRes.data[0].inventory_lot_id);
        if (foundId) {
          console.log(`[StockTransfer] Found existing destination inventory lot: ${foundId} for batch ${batchNo}`);
          return { inventoryLotId: foundId, lotId: validLotId };
        }
      }
    } catch (queryErr) {
      console.warn("[StockTransfer] Warning querying existing mm_inventory_lots:", queryErr);
    }

    // 3. Create new inventory lot record in mm_inventory_lots
    const batchPayload = {
      lot_id: validLotId,
      branch_id: branchId,
      product_id: productId,
      batch_no: batchNo,
      unit_cost: unitCost || 0,
      manufacturing_date: manufacturingDate || null,
      expiry_date: expiryDate || null,
      qa_status: (qaStatus as string) || "GOOD",
      status: "ACTIVE",
      source_type: "STOCK_TRANSFER",
      source_reference: sourceReference,
      created_by: userId || 1,
    };

    try {
      const createRes = await createItems<{ inventory_lot_id?: number; id?: number }>("items/mm_inventory_lots", batchPayload);
      if (createRes) {
        const raw = createRes.data || createRes;
        const item = Array.isArray(raw) ? raw[0] : raw;
        const invLotId = typeof item === "number" ? item : Number(item?.inventory_lot_id || item?.id);
        if (invLotId && !isNaN(invLotId)) {
          console.log(`[StockTransfer] Created new destination inventory lot: ${invLotId} for batch ${batchNo}`);
          return { inventoryLotId: invLotId, lotId: validLotId };
        }
      }

      // If response didn't include the ID directly, confirm by querying
      const confirmQuery = await fetchItems<{ inventory_lot_id: number }>("items/mm_inventory_lots", {
        filter: JSON.stringify({
          _and: [
            { lot_id: { _eq: validLotId } },
            { product_id: { _eq: productId } },
            { batch_no: { _eq: batchNo } },
          ],
        }),
        limit: 1,
        fields: "inventory_lot_id,lot_id,branch_id,product_id,batch_no",
      }).catch(() => ({ data: [] }));

      if (confirmQuery.data && confirmQuery.data.length > 0) {
        const foundId = Number(confirmQuery.data[0].inventory_lot_id);
        if (foundId) {
          console.log(`[StockTransfer] Confirmed destination inventory lot: ${foundId}`);
          return { inventoryLotId: foundId, lotId: validLotId };
        }
      }
    } catch (createErr) {
      console.warn("[StockTransfer] mm_inventory_lots creation conflict, re-fetching:", createErr);
      const fallbackQuery = await fetchItems<{ inventory_lot_id: number }>("items/mm_inventory_lots", {
        filter: JSON.stringify({
          _and: [
            { lot_id: { _eq: validLotId } },
            { product_id: { _eq: productId } },
            { batch_no: { _eq: batchNo } },
          ],
        }),
        limit: 1,
        fields: "inventory_lot_id,lot_id,branch_id,product_id,batch_no",
      }).catch(() => ({ data: [] }));

      if (fallbackQuery.data && fallbackQuery.data.length > 0) {
        const foundId = Number(fallbackQuery.data[0].inventory_lot_id);
        if (foundId) {
          console.log(`[StockTransfer] Resolved destination inventory lot after conflict: ${foundId}`);
          return { inventoryLotId: foundId, lotId: validLotId };
        }
      }
    }
  } catch (err) {
    console.error("[StockTransfer] Error in ensureDestinationInventoryLot:", err);
  }

  return null;
}

/**
 * Service to orchestrate stock transfer business logic.
 * Higher-level than the repo; used by the API route handlers.
 */

/**
 * Fetches transfers by status and enriches them with dispatched RFID data.
 */
export async function getEnrichedTransfers(status?: string): Promise<StockTransferRow[]> {
  const transfers = await repo.fetchStockTransfers(status);
  
  if (transfers.length === 0) return [];

  // Fetch all RFIDs for these transfers to attach 'dispatched_rfids'
  const transferIds = transfers.map(t => t.id);
  const rfidRecords = await repo.fetchDispatchedRfids(transferIds);

  // Group RFIDs by transfer_id
  const rfidMap: Record<number, string[]> = {};
  rfidRecords.forEach(r => {
    if (!rfidMap[r.stock_transfer_id]) rfidMap[r.stock_transfer_id] = [];
    rfidMap[r.stock_transfer_id].push(r.rfid_tag);
  });

  // Fetch missing product_per_supplier data
  const productIds = transfers
    .filter(t => t.product_id && typeof t.product_id === 'object' && t.product_id.product_id)
    .map(t => (t.product_id as ProductRow).product_id as number);
    
  const supplierMap = await repo.fetchProductSuppliers(productIds);

  // Attach RFIDs and Suppliers to each row
  return transfers.map(t => {
    let enrichedProduct = t.product_id;
    if (enrichedProduct && typeof enrichedProduct === 'object' && enrichedProduct.product_id) {
      enrichedProduct = {
        ...enrichedProduct,
        product_per_supplier: supplierMap[enrichedProduct.product_id] || []
      };
    }

    return {
      ...t,
      product_id: enrichedProduct,
      dispatched_rfids: rfidMap[t.id] || []
    };
  });
}

/**
 * Fetches products and enriches them with branch-specific inventory quantities.
 */
export async function getEnrichedProducts(
  branchId: number, 
  search?: string, 
  token?: string
): Promise<EnrichedProduct[]> {
  const [products, inventory] = await Promise.all([
    repo.fetchProducts(search),
    repo.fetchBranchInventory(branchId, token)
  ]);

  // Build inventory map for faster lookup: productId -> total rfid count
  const invMap: Record<number, number> = {};
  inventory.forEach((i: { productId?: number; product_id?: number; runningInventory?: number; running_inventory?: number }) => {
    const pId = Number(i.productId || i.product_id);
    const qty = Number(i.runningInventory || i.running_inventory || 0);
    if (!isNaN(pId)) invMap[pId] = (invMap[pId] || 0) + qty;
  });

  return products.map(p => {
    const rfidCount = invMap[p.product_id] || 0;
    const unitCount = Number(p.unit_of_measurement_count || 1) || 1;
    
    // Formula for available unit quantity: rfid_count / unit_multiplier
    return {
      ...p,
      qtyAvailable: Math.floor(rfidCount / unitCount)
    } as EnrichedProduct;
  });
}

/**
 * Handles the creation of a new stock transfer request.
 */
export async function createTransfer(payload: CreateTransferPayload, userId?: number): Promise<{ success: boolean; orderNo: string }> {
  // 1. Validate payload
  const validated = CreateStockTransferSchema.parse(payload);
  
  const orderNo = helpers.generateOrderNo(validated.sourceBranch, validated.targetBranch);
  const nowPHT = new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).replace(" ", "T");

  // 2. Prepare Directus payloads (1 row per product item in mm_stock_transfer)
  interface ItemWithAllocations {
    payload: StockTransferInsertPayload;
    allocations: {
      inventory_lot_id: number;
      lot_id: number;
      batch_no: string;
      allocated_quantity: number;
      manufacturing_date?: string | null;
      expiry_date?: string | null;
    }[];
  }

  const itemsToCreate: ItemWithAllocations[] = await Promise.all(
    validated.scannedItems
      .filter(item => item.productId > 0)
      .map(async item => {
        let itemAllocations = item.allocations && item.allocations.length > 0 ? item.allocations : [];
        let batchNo = (itemAllocations[0]?.batch_no) || item.batch_no || null;
        let sourceLotId = (itemAllocations[0]?.lot_id) || item.source_lot_id || null;
        let sourceInventoryLotId = (itemAllocations[0]?.inventory_lot_id) || item.source_inventory_lot_id || null;

        if (itemAllocations.length === 0 && (!batchNo || !sourceLotId || !sourceInventoryLotId)) {
          try {
            const fefoPlan = await allocateStock({
              productId: item.productId,
              branchId: Number(validated.sourceBranch),
              requestedQuantity: item.unitQty,
            });
            if (fefoPlan.allocations.length > 0) {
              itemAllocations = fefoPlan.allocations;
              const topAlloc = fefoPlan.allocations[0];
              batchNo = topAlloc.batch_no;
              sourceLotId = topAlloc.lot_id;
              sourceInventoryLotId = topAlloc.inventory_lot_id;
            }
          } catch (err) {
            console.warn("[StockTransfer] FEFO lookup warning:", err);
          }

          // If source branch has negative or zero available stock, auto-create new lot / batch for source branch
          if ((!sourceLotId || !sourceInventoryLotId) && validated.sourceBranch) {
            try {
              const lot = await ensureLotForBranch(Number(validated.sourceBranch));
              if (lot) {
                sourceLotId = sourceLotId || lot.lot_id;
                batchNo = batchNo || item.batch_no || `TRF-SRC-${orderNo}-${item.productId}`;
                const res = await createInventoryLot({
                  lot_id: lot.lot_id,
                  branch_id: Number(validated.sourceBranch),
                  product_id: item.productId,
                  batch_no: batchNo,
                  unit_cost: item.unitPrice || 0,
                  qa_status: "GOOD",
                  status: "ACTIVE",
                  source_type: "STOCK_TRANSFER",
                  source_reference: orderNo,
                  created_by: userId || undefined,
                });
                if (res?.data?.inventory_lot_id) {
                  sourceInventoryLotId = Number(res.data.inventory_lot_id);
                }
              }
            } catch (err) {
              console.warn("[StockTransfer] Auto-creating source lot/batch for negative stock:", err);
            }
          }
        }

        const manufacturingDate = (itemAllocations[0]?.manufacturing_date) || item.manufacturing_date || null;
        const expiryDate = (itemAllocations[0]?.expiry_date) || item.expiry_date || null;

        return {
          payload: {
            order_no: orderNo,
            source_branch_id: Number(validated.sourceBranch),
            target_branch_id: Number(validated.targetBranch),
            source_branch: Number(validated.sourceBranch),
            target_branch: Number(validated.targetBranch),
            lead_date: validated.leadDate ? validated.leadDate.split("T")[0] : null,
            product_id: item.productId,
            unit_id: item.unitId || 1,
            ordered_quantity: item.unitQty,
            allocated_quantity: 0,
            picked_quantity: 0,
            received_quantity: 0,
            amount: item.totalAmount ?? (item.unitQty * (item.unitPrice || 0)),
            status: "REQUESTED",
            remarks: item.rfid || null,
            date_requested: nowPHT,
            date_encoded: nowPHT,
            encoder_id: userId || null,
            source_lot_id: sourceLotId,
            source_inventory_lot_id: sourceInventoryLotId,
            batch_no: batchNo,
            manufacturing_date: manufacturingDate,
            expiration_date: expiryDate,
          },
          allocations: itemAllocations,
        };
      })
  );

  if (itemsToCreate.length === 0) {
    throw new Error("No valid products provided for transfer");
  }

  // 3. Persist main transfer rows (1 row per product)
  const insertPayloads = itemsToCreate.map(i => i.payload);
  const createdRows = await repo.createStockTransfers(insertPayloads);

  // 4. Persist multiple details in mm_stock_transfer_details (1 row per allocated batch/lot)
  try {
    const detailsPayload: MMStockTransferDetail[] = [];
    const rowsArray = Array.isArray(createdRows) ? createdRows : [createdRows];

    for (let i = 0; i < rowsArray.length; i++) {
      const row = rowsArray[i];
      const itemData = itemsToCreate[i];
      if (!row?.id || !itemData) continue;

      const unitCost = itemData.payload.amount / (itemData.payload.ordered_quantity || 1);

      if (itemData.allocations.length > 0) {
        // Multi-batch allocations: insert each batch as a distinct row in mm_stock_transfer_details
        for (const alloc of itemData.allocations) {
          detailsPayload.push({
            stock_transfer_id: row.id,
            inventory_lot_id: alloc.inventory_lot_id,
            target_inventory_lot_id: null,
            lot_id: alloc.lot_id,
            target_lot_id: null,
            product_id: itemData.payload.product_id,
            unit_id: itemData.payload.unit_id,
            batch_no: alloc.batch_no,
            manufacturing_date: alloc.manufacturing_date || itemData.payload.manufacturing_date || null,
            expiration_date: alloc.expiry_date || itemData.payload.expiration_date || null,
            inventory_condition: "GOOD",
            unit_cost: unitCost,
            allocated_quantity: alloc.allocated_quantity,
            picked_quantity: 0,
            dispatched_quantity: 0,
            received_quantity: 0,
            variance_quantity: 0,
            remarks: itemData.payload.remarks || null,
          });
        }
      } else if (itemData.payload.source_inventory_lot_id && itemData.payload.source_lot_id) {
        // Single batch fallback
        detailsPayload.push({
          stock_transfer_id: row.id,
          inventory_lot_id: itemData.payload.source_inventory_lot_id,
          target_inventory_lot_id: null,
          lot_id: itemData.payload.source_lot_id,
          target_lot_id: null,
          product_id: itemData.payload.product_id,
          unit_id: itemData.payload.unit_id,
          batch_no: itemData.payload.batch_no || `BATCH-${row.id}`,
          manufacturing_date: itemData.payload.manufacturing_date || null,
          expiration_date: itemData.payload.expiration_date || null,
          inventory_condition: "GOOD",
          unit_cost: unitCost,
          allocated_quantity: itemData.payload.ordered_quantity,
          picked_quantity: 0,
          dispatched_quantity: 0,
          received_quantity: 0,
          variance_quantity: 0,
          remarks: itemData.payload.remarks || null,
        });
      }
    }

    if (detailsPayload.length > 0) {
      await repo.createStockTransferDetails(detailsPayload).catch(e => console.warn("[StockTransfer] Detail creation warning:", e));
    }
  } catch (err) {
    console.warn("[StockTransfer] Warning creating transfer details:", err);
  }

  return { success: true, orderNo };
}

export async function updateTransferStatus(payload: UpdateTransferPayload): Promise<{ success: boolean }> {
  // 1. Validate payload
  const validated = UpdateStockTransferSchema.parse(payload);

  // 2. Normalize updates (handle both 'items' and 'ids' formats)
  const nowPHT = new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).replace(" ", "T");
  const rawItems: UpdateItemValue[] = validated.items || (validated.ids || []).map(id => ({
    id,
    status: validated.status || "REQUESTED"
  }));

  const updates = rawItems.map(u => {
    const dbStatus = helpers.formatStatusForDb(u.status);
    const itemRemarks = u.remarks || validated.remarks || undefined;
    return {
      ...u,
      status: dbStatus,
      ...(itemRemarks !== undefined ? { remarks: itemRemarks } : {}),
      ...(dbStatus === "RECEIVED" ? { date_received: nowPHT, receiver_id: validated.userId || null } : {}),
      ...(dbStatus === "FOR_PICKING" ? { 
        approved_by: validated.userId || null
      } : {}),
      ...(dbStatus === "FOR_LOADING" || dbStatus === "DISPATCHED" ? { 
        dispatched_at: nowPHT, 
        dispatched_by: validated.userId || null,
        dispatched_quantity: u.dispatched_quantity ?? u.picked_quantity ?? u.allocated_quantity
      } : {}),
      ...(dbStatus === "REJECTED" ? { 
        rejected_at: nowPHT, 
        rejected_by: validated.userId || null 
      } : {})
    };
  });

  console.log("[Stock Transfer Service] Mapped updates payload:", JSON.stringify(updates));

  if (updates.length === 0) return { success: true };

  // 3. Update main table statuses
  await repo.updateTransfersStatus(updates);

  // 4. Synchronize mm_stock_transfer_details across lifecycle transitions
  try {
    const updatedIds = updates.map(u => u.id);
    const transferRows = await repo.fetchStockTransfersByIds(updatedIds);
    const existingDetails = await repo.fetchStockTransferDetails(updatedIds);

    for (const u of updates) {
      const t = transferRows.find(row => row.id === u.id);
      if (!t) continue;

      const detailsForTransfer = existingDetails.filter(d => d.stock_transfer_id === u.id);
      const prodId = typeof t.product_id === "object" ? t.product_id.product_id : t.product_id;
      const unitId = typeof t.unit_id === "object" && t.unit_id !== null ? t.unit_id.unit_id : (t.unit_id || 1);
      const srcBranch = typeof t.source_branch_id === "object" && t.source_branch_id !== null ? t.source_branch_id.id : (t.source_branch_id || t.source_branch);
      const targetBranch = typeof t.target_branch_id === "object" && t.target_branch_id !== null ? t.target_branch_id.id : (t.target_branch_id || t.target_branch);
      const unitCost = t.amount / (t.ordered_quantity || 1);

      // A. Allocation Stage (FOR_PICKING) -> Ensure detail records exist with FEFO allocation
      if (u.status === "FOR_PICKING") {
        const allocatedQty = u.allocated_quantity ?? t.allocated_quantity ?? t.ordered_quantity;
        if (detailsForTransfer.length === 0) {
          let allocations: { inventory_lot_id: number; lot_id: number; batch_no: string; allocated_quantity: number; expiry_date?: string | null }[] = [];
          if (srcBranch && prodId && allocatedQty > 0) {
            try {
              const fefoPlan = await allocateStock({
                productId: Number(prodId),
                branchId: Number(srcBranch),
                requestedQuantity: Number(allocatedQty),
              });
              if (fefoPlan?.allocations?.length > 0) {
                allocations = fefoPlan.allocations;
              }
            } catch (e) {
              console.warn("[StockTransfer] FEFO allocation lookup warning on approval:", e);
            }
          }

          if (allocations.length > 0) {
            const newDetails: MMStockTransferDetail[] = allocations.map(a => ({
              stock_transfer_id: t.id,
              inventory_lot_id: a.inventory_lot_id,
              target_inventory_lot_id: null,
              lot_id: a.lot_id,
              target_lot_id: null,
              product_id: Number(prodId),
              unit_id: Number(unitId),
              batch_no: a.batch_no,
              expiration_date: a.expiry_date || null,
              inventory_condition: "GOOD",
              unit_cost: unitCost,
              allocated_quantity: a.allocated_quantity,
              picked_quantity: 0,
              dispatched_quantity: 0,
              received_quantity: 0,
              variance_quantity: 0,
            }));
            await repo.createStockTransferDetails(newDetails);
          } else {
            // Source branch has negative or zero available stock in FEFO:
            // Ensure/create source lot & new inventory lot batch for this transfer
            let srcLotId = t.source_lot_id ? Number(t.source_lot_id) : null;
            let srcInvLotId = t.source_inventory_lot_id ? Number(t.source_inventory_lot_id) : null;
            const batchNo = t.batch_no || `TRF-SRC-${t.order_no}-${t.id}`;

            if (!srcLotId && srcBranch) {
              const lot = await ensureLotForBranch(Number(srcBranch));
              if (lot) srcLotId = lot.lot_id;
            }

            if (!srcInvLotId && srcLotId && srcBranch && prodId) {
              const res = await createInventoryLot({
                lot_id: Number(srcLotId),
                branch_id: Number(srcBranch),
                product_id: Number(prodId),
                batch_no: batchNo,
                unit_cost: unitCost,
                qa_status: "GOOD",
                status: "ACTIVE",
                source_type: "STOCK_TRANSFER",
                source_reference: t.order_no,
                created_by: validated.userId,
              }).catch(() => null);
              srcInvLotId = res?.data?.inventory_lot_id ? Number(res.data.inventory_lot_id) : null;
            }

            if (srcLotId && srcInvLotId) {
              await repo.createStockTransferDetails([{
                stock_transfer_id: t.id,
                inventory_lot_id: Number(srcInvLotId),
                target_inventory_lot_id: null,
                lot_id: Number(srcLotId),
                target_lot_id: null,
                product_id: Number(prodId),
                unit_id: Number(unitId),
                batch_no: batchNo,
                inventory_condition: "GOOD",
                unit_cost: unitCost,
                allocated_quantity: Number(allocatedQty),
                picked_quantity: 0,
                dispatched_quantity: 0,
                received_quantity: 0,
                variance_quantity: 0,
              }]);

              // Update transfer row with the new source lot and batch references
              await repo.updateTransfer(t.id, {
                source_lot_id: srcLotId,
                source_inventory_lot_id: srcInvLotId,
                batch_no: batchNo,
                allocated_quantity: Number(allocatedQty),
              }).catch(() => null);
            }
          }
        }
      }

      // B. Picking Stage (PICKED / PICKING)
      if (u.status === "PICKED" || u.status === "PICKING" || u.picked_quantity !== undefined) {
        const totalAllocated = detailsForTransfer.reduce((sum, d) => sum + Number(d.allocated_quantity || 0), 0);
        const headerPicked = u.picked_quantity ?? t.picked_quantity ?? t.allocated_quantity ?? t.ordered_quantity ?? 0;
        const isFull = u.status === "PICKED" || headerPicked >= totalAllocated || totalAllocated === 0;

        for (const d of detailsForTransfer) {
          if (d.id) {
            const detailAlloc = Number(d.allocated_quantity || 0);
            const detailPicked = isFull
              ? detailAlloc
              : (totalAllocated > 0 ? Math.round((detailAlloc / totalAllocated) * headerPicked) : headerPicked);

            await repo.updateStockTransferDetail(d.id, {
              picked_quantity: detailPicked,
            });
          }
        }
      }

      // C. Dispatch Stage (FOR_LOADING / DISPATCHED)
      if (u.status === "DISPATCHED" || u.status === "FOR_LOADING" || u.dispatched_quantity !== undefined) {
        const totalAllocated = detailsForTransfer.reduce((sum, d) => sum + Number(d.allocated_quantity || 0), 0);
        const headerDispatched = u.dispatched_quantity ?? u.picked_quantity ?? t.dispatched_quantity ?? t.picked_quantity ?? t.allocated_quantity ?? t.ordered_quantity ?? 0;
        const isFull = u.status === "DISPATCHED" || u.status === "FOR_LOADING" || headerDispatched >= totalAllocated || totalAllocated === 0;

        for (const d of detailsForTransfer) {
          if (d.id) {
            const detailAlloc = Number(d.allocated_quantity || 0);
            const detailDispatched = isFull
              ? (Number(d.picked_quantity) || detailAlloc)
              : (totalAllocated > 0 ? Math.round((detailAlloc / totalAllocated) * headerDispatched) : headerDispatched);

            await repo.updateStockTransferDetail(d.id, {
              dispatched_quantity: detailDispatched,
              picked_quantity: Number(d.picked_quantity || detailDispatched),
            });
          }
        }
      }

      // D. Receiving Stage (RECEIVED)
      if (u.status === "RECEIVED" || u.received_quantity !== undefined) {
        let destLotId = u.destination_lot_id || validated.destination_lot_id || t.destination_lot_id;
        if (!destLotId && targetBranch) {
          try {
            const lot = await ensureLotForBranch(Number(targetBranch));
            if (lot) destLotId = lot.lot_id;
          } catch (e) {
            console.warn("[StockTransfer] Warning ensuring target branch lot:", e);
          }
        }

        const headerReceived = u.received_quantity ?? t.received_quantity ?? t.dispatched_quantity ?? t.picked_quantity ?? t.allocated_quantity ?? t.ordered_quantity ?? 0;
        const totalDispatched = detailsForTransfer.reduce((sum, d) => sum + Number(d.dispatched_quantity || d.allocated_quantity || 0), 0);
        const isFull = u.status === "RECEIVED" || headerReceived >= totalDispatched || totalDispatched === 0;

        // Check if Multi-Lot & Multi-Batch structured allocations were provided
        const rawLotAllocations = (u as { lot_allocations?: { lot_id: number; batches?: { batch_no: string; quantity: number; manufacturing_date?: string | null; expiry_date?: string | null; qa_status?: string | null; unit_cost?: number }[] }[] }).lot_allocations;

        if (rawLotAllocations && Array.isArray(rawLotAllocations) && rawLotAllocations.length > 0) {
          // Flatten all batch splits across all assigned storage lots (one batch per row)
          const flattenedBatches: {
            lot_id: number;
            batch_no: string;
            quantity: number;
            manufacturing_date?: string | null;
            expiry_date?: string | null;
            qa_status?: string | null;
            unit_cost?: number;
          }[] = [];

          for (const g of rawLotAllocations) {
            const gLotId = Number(g.lot_id);
            for (const b of (g.batches || [])) {
              if (Number(b.quantity) > 0 || b.batch_no) {
                flattenedBatches.push({
                  lot_id: gLotId,
                  batch_no: b.batch_no || `TRF-${t.order_no}-${gLotId}`,
                  quantity: Number(b.quantity) || 0,
                  manufacturing_date: b.manufacturing_date || u.manufacturing_date || t.manufacturing_date || null,
                  expiry_date: b.expiry_date || u.expiration_date || t.expiry_date || null,
                  qa_status: b.qa_status || "GOOD",
                  unit_cost: b.unit_cost || unitCost,
                });
              }
            }
          }

          if (flattenedBatches.length > 0) {
            let detailIdx = 0;
            for (const batchAlloc of flattenedBatches) {
              let destInventoryLotId: number | null = null;
              let finalDestLotId: number | null = batchAlloc.lot_id;

              if (targetBranch && prodId) {
                const ensured = await ensureDestinationInventoryLot({
                  lotId: batchAlloc.lot_id,
                  branchId: Number(targetBranch),
                  productId: Number(prodId),
                  unitId: Number(unitId),
                  batchNo: batchAlloc.batch_no,
                  unitCost: batchAlloc.unit_cost || unitCost,
                  manufacturingDate: batchAlloc.manufacturing_date,
                  expiryDate: batchAlloc.expiry_date,
                  qaStatus: (batchAlloc.qa_status as "GOOD" | "DAMAGED" | "QUARANTINED" | "EXPIRED") || "GOOD",
                  sourceReference: t.order_no,
                  userId: validated.userId,
                });
                if (ensured) {
                  destInventoryLotId = ensured.inventoryLotId;
                  finalDestLotId = ensured.lotId;
                }
              }

              if (detailIdx < detailsForTransfer.length) {
                // Update existing detail row
                const d = detailsForTransfer[detailIdx];
                const dispQty = Number(d.dispatched_quantity || d.allocated_quantity || batchAlloc.quantity);
                await repo.updateStockTransferDetail(d.id!, {
                  batch_no: batchAlloc.batch_no,
                  manufacturing_date: batchAlloc.manufacturing_date || d.manufacturing_date || null,
                  received_quantity: batchAlloc.quantity,
                  variance_quantity: batchAlloc.quantity - dispQty,
                  target_lot_id: finalDestLotId || d.target_lot_id,
                  target_inventory_lot_id: destInventoryLotId || d.target_inventory_lot_id,
                  expiration_date: batchAlloc.expiry_date || d.expiration_date || null,
                  inventory_condition: (batchAlloc.qa_status as "GOOD" | "DAMAGED" | "QUARANTINED" | "EXPIRED") || d.inventory_condition || "GOOD",
                });
              } else {
                // Create new detail row for extra batch split
                const resolved = await resolveDetailLotReferences(t, finalDestLotId, destInventoryLotId);
                if (resolved) {
                  await repo.createStockTransferDetails([{
                    stock_transfer_id: t.id,
                    inventory_lot_id: resolved.inventory_lot_id,
                    target_inventory_lot_id: destInventoryLotId || resolved.target_inventory_lot_id,
                    lot_id: resolved.lot_id,
                    target_lot_id: finalDestLotId || resolved.target_lot_id,
                    product_id: Number(prodId),
                    unit_id: Number(unitId),
                    batch_no: batchAlloc.batch_no,
                    manufacturing_date: batchAlloc.manufacturing_date || null,
                    inventory_condition: (batchAlloc.qa_status as "GOOD" | "DAMAGED" | "QUARANTINED" | "EXPIRED") || "GOOD",
                    unit_cost: batchAlloc.unit_cost || unitCost,
                    allocated_quantity: batchAlloc.quantity,
                    picked_quantity: batchAlloc.quantity,
                    dispatched_quantity: batchAlloc.quantity,
                    received_quantity: batchAlloc.quantity,
                    variance_quantity: 0,
                    expiration_date: batchAlloc.expiry_date || null,
                  }]).catch(e => console.warn("[StockTransfer] Multi-batch detail creation error:", e));
                }
              }
              detailIdx++;
            }

            // If there were more details in detailsForTransfer than received batches, mark excess as 0 received
            while (detailIdx < detailsForTransfer.length) {
              const d = detailsForTransfer[detailIdx];
              const dispQty = Number(d.dispatched_quantity || d.allocated_quantity || 0);
              await repo.updateStockTransferDetail(d.id!, {
                received_quantity: 0,
                variance_quantity: -dispQty,
                target_lot_id: null,
                target_inventory_lot_id: null,
              });
              detailIdx++;
            }
          }
        } else if (detailsForTransfer.length > 0) {
          for (const d of detailsForTransfer) {
            if (!d.id) continue;

            const detailDispatched = Number(d.dispatched_quantity || d.allocated_quantity || 0);
            const detailReceived = isFull
              ? detailDispatched
              : (totalDispatched > 0 ? Math.round((detailDispatched / totalDispatched) * headerReceived) : headerReceived);
            const variance = detailReceived - detailDispatched;

            const batchNoForDest = d.batch_no || u.destination_batch_no || t.batch_no || `TRF-${t.order_no}-${d.id}`;
            let destInventoryLotId: number | null = null;
            let finalDestLotId: number | null = destLotId ? Number(destLotId) : null;

            if (targetBranch && prodId) {
              const ensured = await ensureDestinationInventoryLot({
                lotId: destLotId ? Number(destLotId) : null,
                branchId: Number(targetBranch),
                productId: Number(prodId),
                unitId: Number(unitId),
                batchNo: batchNoForDest,
                unitCost: unitCost,
                manufacturingDate: u.manufacturing_date || d.manufacturing_date || t.manufacturing_date || null,
                expiryDate: u.expiration_date || d.expiration_date || t.expiry_date || null,
                qaStatus: d.inventory_condition || "GOOD",
                sourceReference: t.order_no,
                userId: validated.userId,
              });
              if (ensured) {
                destInventoryLotId = ensured.inventoryLotId;
                finalDestLotId = ensured.lotId;
              }
            }

            await repo.updateStockTransferDetail(d.id, {
              received_quantity: detailReceived,
              variance_quantity: variance,
              target_lot_id: finalDestLotId || d.target_lot_id,
              target_inventory_lot_id: destInventoryLotId || d.target_inventory_lot_id,
              manufacturing_date: u.manufacturing_date || d.manufacturing_date || t.manufacturing_date || null,
              expiration_date: u.expiration_date || d.expiration_date || t.expiry_date || null,
            });
          }
        } else {
          // Reconstruct/create missing detail row for previously unattached transfer
          const destBatchNo = u.destination_batch_no || t.batch_no || `TRF-${t.order_no}-${t.id}`;
          let destInventoryLotId: number | null = null;
          let finalDestLotId: number | null = destLotId ? Number(destLotId) : null;

          if (targetBranch && prodId) {
            const ensured = await ensureDestinationInventoryLot({
              lotId: destLotId ? Number(destLotId) : null,
              branchId: Number(targetBranch),
              productId: Number(prodId),
              unitId: Number(unitId),
              batchNo: destBatchNo,
              unitCost: unitCost,
              manufacturingDate: u.manufacturing_date || t.manufacturing_date || null,
              expiryDate: u.expiration_date || t.expiry_date || null,
              qaStatus: "GOOD",
              sourceReference: t.order_no,
              userId: validated.userId,
            });
            if (ensured) {
              destInventoryLotId = ensured.inventoryLotId;
              finalDestLotId = ensured.lotId;
            }
          }

          const resolved = await resolveDetailLotReferences(t, finalDestLotId, destInventoryLotId);
          if (resolved) {
            const dispQty = t.dispatched_quantity || t.picked_quantity || t.allocated_quantity || headerReceived;
            await repo.createStockTransferDetails([{
              stock_transfer_id: t.id,
              inventory_lot_id: resolved.inventory_lot_id,
              target_inventory_lot_id: destInventoryLotId || resolved.target_inventory_lot_id,
              lot_id: resolved.lot_id,
              target_lot_id: finalDestLotId || resolved.target_lot_id,
              product_id: Number(prodId),
              unit_id: Number(unitId),
              batch_no: destBatchNo,
              manufacturing_date: u.manufacturing_date || t.manufacturing_date || null,
              inventory_condition: "GOOD",
              unit_cost: unitCost,
              allocated_quantity: Number(t.allocated_quantity || headerReceived),
              picked_quantity: Number(t.picked_quantity || dispQty),
              dispatched_quantity: Number(dispQty),
              received_quantity: Number(headerReceived),
              variance_quantity: Number(headerReceived) - Number(dispQty),
              expiration_date: u.expiration_date || t.expiry_date || null,
            }]).catch(e => console.warn("[StockTransfer] Detail creation error:", e));
          }
        }
      }
    }
  } catch (err) {
    console.warn("[StockTransfer] Warning during detail synchronization:", err);
  }

  // 5. Record RFID tracking if provided
  if (validated.rfids && validated.rfids.length > 0 && validated.scanType) {
    const trackingEntries = validated.rfids.map(r => ({
      stock_transfer_id: r.stock_transfer_id,
      rfid_tag: r.rfid_tag,
      scan_type: validated.scanType!,
      created_by: validated.userId || null,
      created_at: nowPHT
    }));
    await repo.insertRfidTracking(trackingEntries);
  }

  // 6. Record attachments if provided
  if (validated.attachments && validated.attachments.length > 0) {
    const attachmentEntries = updates.flatMap(u => 
      validated.attachments!.map(fileId => ({
        stock_transfer_id: u.id,
        directus_file_id: fileId,
        created_by: validated.userId || null
      }))
    );
    await repo.insertStockTransferAttachments(attachmentEntries);
  }

  return { success: true };
}

/**
 * Specifically handles manual receiving where received_quantity is auto-filled.
 */
export async function manualReceiveItems(ids: number[], status: string, userId?: number): Promise<{ success: boolean }> {
  const targetItems = await repo.fetchStockTransfersByIds(ids);
  if (targetItems.length === 0) return { success: true };

  const dbStatus = helpers.formatStatusForDb(status);
  const nowPHT = new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).replace(" ", "T");

  const updates = targetItems.map(item => ({
    id: item.id,
    status: dbStatus,
    received_quantity: item.allocated_quantity ?? item.ordered_quantity ?? 0,
    date_received: nowPHT,
    receiver_id: userId || null,
  }));

  // Update status and received_quantity in bulk
  await repo.updateTransfersStatus(updates);

  // Sync destination inventory lots and mm_stock_transfer_details
  if (dbStatus === "RECEIVED") {
    try {
      const existingDetails = await repo.fetchStockTransferDetails(ids);
      for (const t of targetItems) {
        let destLotId = t.destination_lot_id;
        const targetBranch = typeof t.target_branch_id === "object" && t.target_branch_id !== null ? t.target_branch_id.id : (t.target_branch_id || t.target_branch);
        const prodId = typeof t.product_id === "object" ? t.product_id.product_id : t.product_id;
        const unitId = typeof t.unit_id === "object" && t.unit_id !== null ? t.unit_id.unit_id : (t.unit_id || 1);
        const unitCost = t.amount / (t.received_quantity || t.ordered_quantity || 1);

        if (!destLotId && targetBranch) {
          try {
            const lot = await ensureLotForBranch(Number(targetBranch));
            if (lot) destLotId = lot.lot_id;
          } catch (e) {
            console.warn("[StockTransfer] Warning ensuring target branch lot:", e);
          }
        }

        let destInventoryLotId: number | null = null;
        let finalDestLotId: number | null = destLotId ? Number(destLotId) : null;

        if (targetBranch && prodId) {
          const batchNo = t.batch_no || `TRF-${t.order_no}-${t.id}`;
          const ensured = await ensureDestinationInventoryLot({
            lotId: destLotId ? Number(destLotId) : null,
            branchId: Number(targetBranch),
            productId: Number(prodId),
            unitId: Number(unitId),
            batchNo,
            unitCost,
            sourceReference: t.order_no,
            userId,
          });
          if (ensured) {
            destInventoryLotId = ensured.inventoryLotId;
            finalDestLotId = ensured.lotId;
          }
        }

        const detailsForTransfer = existingDetails.filter(d => d.stock_transfer_id === t.id);

        if (detailsForTransfer.length > 0) {
          for (const d of detailsForTransfer) {
            if (!d.id) continue;
            const batchNo = d.batch_no || t.batch_no || `TRF-${t.order_no}-${d.id}`;
            let dInventoryLotId: number | null = null;
            let dLotId: number | null = finalDestLotId;

            if (targetBranch && prodId) {
              const ensured = await ensureDestinationInventoryLot({
                lotId: finalDestLotId,
                branchId: Number(targetBranch),
                productId: Number(prodId),
                unitId: Number(unitId),
                batchNo,
                unitCost,
                expiryDate: d.expiration_date || t.expiry_date || null,
                qaStatus: d.inventory_condition || "GOOD",
                sourceReference: t.order_no,
                userId,
              });
              if (ensured) {
                dInventoryLotId = ensured.inventoryLotId;
                dLotId = ensured.lotId;
              }
            }

            const dispQty = Number(d.dispatched_quantity || d.allocated_quantity || 0);
            const recvQty = dispQty;

            await repo.updateStockTransferDetail(d.id, {
              received_quantity: recvQty,
              variance_quantity: 0,
              target_lot_id: dLotId || d.target_lot_id,
              target_inventory_lot_id: dInventoryLotId || d.target_inventory_lot_id,
            });
          }
        } else {
          const receivedQty = t.allocated_quantity ?? t.ordered_quantity ?? 0;
          const resolved = await resolveDetailLotReferences(t, finalDestLotId, destInventoryLotId);
          if (resolved) {
            const dispQty = t.dispatched_quantity || t.picked_quantity || t.allocated_quantity || receivedQty;
            await repo.createStockTransferDetails([{
              stock_transfer_id: t.id,
              inventory_lot_id: resolved.inventory_lot_id,
              target_inventory_lot_id: destInventoryLotId || resolved.target_inventory_lot_id,
              lot_id: resolved.lot_id,
              target_lot_id: destLotId ? Number(destLotId) : resolved.target_lot_id,
              product_id: Number(prodId),
              unit_id: Number(unitId),
              batch_no: t.batch_no || `TRF-${t.order_no}-${t.id}`,
              inventory_condition: "GOOD",
              unit_cost: unitCost,
              allocated_quantity: Number(t.allocated_quantity || receivedQty),
              picked_quantity: Number(t.picked_quantity || dispQty),
              dispatched_quantity: Number(dispQty),
              received_quantity: Number(receivedQty),
              variance_quantity: Number(receivedQty) - Number(dispQty),
            }]).catch(e => console.warn("[StockTransfer] Detail creation error:", e));
          }
        }
      }
    } catch (err) {
      console.warn("[StockTransfer] Warning during manual receive detail sync:", err);
    }
  }

  return { success: true };
}
