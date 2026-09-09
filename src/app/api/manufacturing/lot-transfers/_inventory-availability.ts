import { LotTransferError } from "./_errors";
import {
    LOT_TRANSFER_COLLECTION,
    LOT_TRANSFER_DETAIL_COLLECTION
} from "./_config";
import { directusRows } from "./_directus";
import type { RecordValue } from "./_directus";
import type {
    ProtectedAllocation
} from "./_types";
import {
    activeStatus,
    firstValue,
    isRecord,
    normalizedBatch,
    nullableString,
    numeric,
    productId,
    relationId,
    rowId,
    stringValue
} from "./_values";

function movementFilter(filters: Record<string, unknown>): string {
    const params = new URLSearchParams({
        filter: JSON.stringify(filters),
        fields: "movement_id,product_id,branch_id,mm_lot_id,batch_no,quantity,expiry_date,manufacturing_date,transaction_type_id,source_document_id,source_document_no",
        limit: "-1"
    });
    return params.toString();
}

function excludeExactTransferMovement(rows: RecordValue[], excludeTransfer?: { id: number; requestNo: string }): RecordValue[] {
    if (!excludeTransfer) return rows;
    return rows.filter((row) => !(numeric(row.source_document_id) === excludeTransfer.id && stringValue(row.source_document_no) === excludeTransfer.requestNo));
}

export async function movementsForBatch(
    input: { productId: number; branchId: number; lotId: number; batchNo: string },
    excludeTransfer?: { id: number; requestNo: string }
): Promise<RecordValue[]> {
    const filters: Record<string, unknown>[] = [
        { product_id: { _eq: input.productId } },
        { branch_id: { _eq: input.branchId } },
        { mm_lot_id: { _eq: input.lotId } },
        { batch_no: { _eq: input.batchNo } }
    ];
    const rows = await directusRows(
        `/items/inventory_movements?${movementFilter({ _and: filters })}`,
        "Source inventory movement lookup"
    );
    return excludeExactTransferMovement(rows, excludeTransfer);
}

export async function movementsForLot(
    input: { branchId: number; lotId: number },
    excludeTransfer?: { id: number; requestNo: string }
): Promise<RecordValue[]> {
    const filters: Record<string, unknown>[] = [
        { branch_id: { _eq: input.branchId } },
        { mm_lot_id: { _eq: input.lotId } }
    ];
    const rows = await directusRows(
        `/items/inventory_movements?${movementFilter({ _and: filters })}`,
        "Lot inventory movement lookup"
    );
    return excludeExactTransferMovement(rows, excludeTransfer);
}

const ACTIVE_JOB_ORDER_STATUSES = new Set([
    "PLANNED",
    "DRAFT",
    "RELEASED",
    "IN PROGRESS",
    "ONGOING",
    "PROCEED",
    "ON HOLD"
]);
const ACTIVE_STOCK_TRANSFER_STATUS_VALUES = [
    "REQUESTED",
    "FOR_PICKING",
    "PICKING",
    "PICKED",
    "FOR_LOADING"
];
const ACTIVE_STOCK_TRANSFER_STATUSES = new Set(ACTIVE_STOCK_TRANSFER_STATUS_VALUES.map((status) => status.replace(/[_-]+/g, " ")));
const ACTIVE_LOT_TRANSFER_STATUS_VALUES = ["Submitted", "Approved"];

export interface ProtectedAllocationLookup {
    branchId: number;
    productId: number;
    lotId: number;
    inventoryLotId: number;
    batchNo: string;
    legacyReservedQuantity: number;
    excludeLotTransferId?: number;
}

export interface ProtectedAllocationSummary {
    legacyReservedQuantity: number;
    explicitQuantity: number;
    totalQuantity: number;
    allocations: ProtectedAllocation[];
    unresolved: string[];
}

function appendProtectedAllocation(
    allocations: ProtectedAllocation[],
    seen: Set<string>,
    input: ProtectedAllocation
): void {
    if (input.allocationId <= 0 || input.quantity <= 0) return;
    const key = `${input.source}:${input.allocationId}`;
    if (seen.has(key)) return;
    seen.add(key);
    allocations.push(input);
}

function jobOrderStatus(row: RecordValue, statusByMaterialId: Map<number, string>): string {
    const material = firstValue(row, ["jo_material_id"]);
    const jobOrder = isRecord(material) ? firstValue(material, ["job_order_id"]) : null;
    const nestedStatus = isRecord(jobOrder) ? firstValue(jobOrder, ["status"]) : null;
    const materialId = relationId(material, ["jo_material_id"]);
    return stringValue(
        nestedStatus || firstValue(row, ["job_order_status", "jo_material_id.job_order_id.status"]) || statusByMaterialId.get(materialId)
    );
}

async function jobOrderStatusesForReservations(rows: RecordValue[]): Promise<Map<number, string>> {
    const materialIds = [...new Set(rows.map((row) => relationId(firstValue(row, ["jo_material_id"]), ["jo_material_id"])).filter((id) => id > 0))];
    if (materialIds.length === 0) return new Map();

    const materials = await directusRows(
        `/items/manufacturing_job_order_materials?filter[jo_material_id][_in]=${materialIds.join(",")}&fields=jo_material_id,job_order_id&limit=-1`,
        "Job-order material identity lookup"
    );
    const jobOrderIds = [...new Set(materials.map((row) => relationId(firstValue(row, ["job_order_id"]), ["job_order_id"])).filter((id) => id > 0))];
    if (jobOrderIds.length === 0) return new Map();

    const jobOrders = await directusRows(
        `/items/manufacturing_job_orders?filter[job_order_id][_in]=${jobOrderIds.join(",")}&fields=job_order_id,status&limit=-1`,
        "Job-order status lookup"
    );
    const statusByJobOrderId = new Map(
        jobOrders.map((row) => [relationId(firstValue(row, ["job_order_id"]), ["job_order_id"]), stringValue(row.status)])
    );
    return new Map(
        materials.map((row) => [
            relationId(firstValue(row, ["jo_material_id"]), ["jo_material_id"]),
            statusByJobOrderId.get(relationId(firstValue(row, ["job_order_id"]), ["job_order_id"])) || ""
        ])
    );
}

function stockTransferReference(row: RecordValue, header: RecordValue | undefined): string | null {
    return nullableString(
        firstValue(header || {}, ["order_no"]) ||
        firstValue(row, ["stock_transfer_id", "reference_no"])
    );
}

export async function protectedAllocationsForInventoryLot(input: ProtectedAllocationLookup): Promise<ProtectedAllocationSummary> {
    const allocationRows: ProtectedAllocation[] = [];
    const seen = new Set<string>();
    const unresolved: string[] = [];
    const batchKey = normalizedBatch(input.batchNo);

    const reservationFilter = JSON.stringify({
        _and: [
            { inventory_lot_id: { _eq: input.inventoryLotId } },
            { status: { _in: ["Reserved", "Picked"] } }
        ]
    });
    const jobReservationFilter = JSON.stringify({
        _and: [
            { product_id: { _eq: input.productId } },
            { branch_id: { _eq: input.branchId } }
        ]
    });
    const stockDetailFilter = JSON.stringify({ product_id: { _eq: input.productId } });
    const lotTransferFilter = JSON.stringify({ status: { _in: ACTIVE_LOT_TRANSFER_STATUS_VALUES } });

    const lotTransferDetailRowsPromise = (async () => {
        try {
            return await directusRows(
                `/items/${LOT_TRANSFER_DETAIL_COLLECTION}?fields=lot_transfer_detail_id,lot_transfer_id,line_no,product_id,source_inventory_lot_id,source_batch_no,quantity&limit=-1`,
                "Lot-transfer detail protected allocation lookup"
            );
        } catch (error) {
            // Before the detail migration, active legacy headers remain the only
            // available source of protected lot-transfer allocations.
            if (error instanceof LotTransferError && [400, 404].includes(error.statusCode)) return [];
            throw error;
        }
    })();

    const [salesOrderRows, salesInvoiceRows, jobReservationRows, stockDetailRows, lotTransferRows, lotTransferDetailRows] = await Promise.all([
        directusRows(
            `/items/sales_order_reservation?filter=${encodeURIComponent(reservationFilter)}&fields=reservation_id,reserved_quantity,picked_quantity,status,sales_order_detail_id&limit=-1`,
            "Sales-order protected allocation lookup"
        ),
        directusRows(
            `/items/sales_invoice_reservation?filter=${encodeURIComponent(reservationFilter)}&fields=id,quantity,status,sales_invoice_detail_id&limit=-1`,
            "Sales-invoice protected allocation lookup"
        ),
        directusRows(
            `/items/manufacturing_job_order_materials_reservations?filter=${encodeURIComponent(jobReservationFilter)}&fields=jo_materials_reservation_id,product_id,branch_id,mm_lot_id,batch_no,reserved_quantity,actual_used_quantity,jo_material_id&limit=-1`,
            "Job-order protected allocation lookup"
        ),
        directusRows(
            `/items/mm_stock_transfer_details?filter=${encodeURIComponent(stockDetailFilter)}&fields=id,stock_transfer_id,inventory_lot_id,lot_id,product_id,batch_no,allocated_quantity,picked_quantity,dispatched_quantity,received_quantity&limit=-1`,
            "Stock-transfer protected allocation lookup"
        ),
        directusRows(
            `/items/${LOT_TRANSFER_COLLECTION}?filter=${encodeURIComponent(lotTransferFilter)}&fields=lot_transfer_id,request_no,status,branch_id,product_id,source_lot_id,source_inventory_lot_id,source_batch_no,quantity&limit=-1`,
            "Lot-transfer protected allocation lookup"
        ),
        lotTransferDetailRowsPromise
    ]);
    const statusByMaterialId = await jobOrderStatusesForReservations(jobReservationRows);

    for (const row of salesOrderRows) {
        const allocationId = rowId(row, ["reservation_id", "id"]);
        const quantity = Math.max(numeric(row.reserved_quantity), numeric(row.picked_quantity));
        if (quantity > 0 && allocationId <= 0) {
            unresolved.push("A sales-order allocation has no resolvable reservation identity.");
            continue;
        }
        appendProtectedAllocation(allocationRows, seen, {
            source: "SALES_ORDER",
            allocationId,
            quantity,
            status: stringValue(row.status),
            reference: nullableString(firstValue(row, ["sales_order_detail_id"]))
        });
    }

    for (const row of salesInvoiceRows) {
        const allocationId = rowId(row, ["id"]);
        const quantity = Math.max(0, numeric(row.quantity));
        if (quantity > 0 && allocationId <= 0) {
            unresolved.push("A sales-invoice allocation has no resolvable reservation identity.");
            continue;
        }
        appendProtectedAllocation(allocationRows, seen, {
            source: "SALES_INVOICE",
            allocationId,
            quantity,
            status: stringValue(row.status),
            reference: nullableString(firstValue(row, ["sales_invoice_detail_id"]))
        });
    }

    for (const row of jobReservationRows) {
        const allocationId = rowId(row, ["jo_materials_reservation_id"]);
        const quantity = Math.max(0, numeric(row.reserved_quantity));
        const status = jobOrderStatus(row, statusByMaterialId);
        if (quantity <= 0) continue;
        if (allocationId <= 0) {
            unresolved.push("A job-order allocation has no resolvable reservation identity.");
            continue;
        }
        if (!status) {
            unresolved.push(`Job-order allocation ${allocationId} has no resolvable job-order status.`);
            continue;
        }
        if (!activeStatus(status, ACTIVE_JOB_ORDER_STATUSES)) continue;

        const rowLotId = relationId(firstValue(row, ["mm_lot_id"]), ["lot_id", "mm_lot_id"]);
        const rowBatch = normalizedBatch(row.batch_no);
        if (rowLotId !== input.lotId || rowBatch !== batchKey) {
            if (rowLotId <= 0 || !rowBatch) unresolved.push(`Job-order allocation ${allocationId} has no exact lot/batch identity.`);
            continue;
        }

        appendProtectedAllocation(allocationRows, seen, {
            source: "JOB_ORDER_MATERIAL",
            allocationId,
            quantity,
            status,
            reference: nullableString(firstValue(row, ["jo_material_id"]))
        });
    }

    const stockTransferIds = [...new Set(stockDetailRows.map((row) => rowId(row, ["stock_transfer_id"])).filter((id) => id > 0))];
    const stockTransferHeaders = stockTransferIds.length > 0
        ? await directusRows(
            `/items/mm_stock_transfer?filter[id][_in]=${stockTransferIds.join(",")}&fields=id,order_no,status,source_branch_id&limit=-1`,
            "Stock-transfer header lookup"
        )
        : [];
    const stockHeadersById = new Map(stockTransferHeaders.map((row) => [rowId(row, ["id"]), row]));

    for (const row of stockDetailRows) {
        const detailId = rowId(row, ["id"]);
        const transferId = rowId(row, ["stock_transfer_id"]);
        if (detailId <= 0 || transferId <= 0) {
            unresolved.push("A stock-transfer allocation has no resolvable detail or transfer identity.");
            continue;
        }
        const header = stockHeadersById.get(transferId);
        if (!header) {
            unresolved.push(`Stock-transfer allocation ${detailId} has no resolvable transfer header.`);
            continue;
        }
        if (!stringValue(header.status)) {
            unresolved.push(`Stock-transfer allocation ${detailId} has no resolvable transfer status.`);
            continue;
        }
        if (!activeStatus(header.status, ACTIVE_STOCK_TRANSFER_STATUSES)) continue;
        const headerBranchId = relationId(header.source_branch_id, ["branch_id", "id"]);
        if (headerBranchId <= 0) {
            unresolved.push(`Stock-transfer allocation ${detailId} has no exact source branch identity.`);
            continue;
        }
        if (headerBranchId !== input.branchId) continue;

        const rowProductId = productId(row);
        const rowInventoryLotId = relationId(firstValue(row, ["inventory_lot_id"]), ["inventory_lot_id", "id"]);
        const rowLotId = relationId(firstValue(row, ["lot_id"]), ["lot_id", "id"]);
        const rowBatch = normalizedBatch(row.batch_no);
        const allocated = Math.max(numeric(row.allocated_quantity), numeric(row.picked_quantity));
        const alreadyDispatched = Math.max(numeric(row.dispatched_quantity), numeric(row.received_quantity));
        const quantity = Math.max(0, allocated - alreadyDispatched);
        if (rowProductId !== input.productId || quantity <= 0) continue;

        if (rowInventoryLotId <= 0 || rowLotId <= 0 || !rowBatch) {
            unresolved.push(`Stock-transfer allocation ${detailId} has no exact lot/batch identity.`);
            continue;
        }
        if (rowInventoryLotId !== input.inventoryLotId || rowLotId !== input.lotId || rowBatch !== batchKey) continue;

        appendProtectedAllocation(allocationRows, seen, {
            source: "STOCK_TRANSFER",
            allocationId: detailId,
            quantity,
            status: stringValue(header.status),
            reference: stockTransferReference(row, header)
        });
    }

    const detailsByTransferId = new Map<number, RecordValue[]>();
    for (const row of lotTransferDetailRows) {
        const transferId = rowId(row, ["lot_transfer_id"]);
        if (transferId <= 0) continue;
        const details = detailsByTransferId.get(transferId) || [];
        details.push(row);
        detailsByTransferId.set(transferId, details);
    }

    for (const row of lotTransferRows) {
        const allocationId = rowId(row, ["lot_transfer_id"]);
        if (allocationId === input.excludeLotTransferId) continue;
        if (allocationId <= 0) {
            unresolved.push("A lot-transfer allocation has no resolvable request identity.");
            continue;
        }
        const headerBranchId = relationId(firstValue(row, ["branch_id"]), ["branch_id", "id"]);
        if (headerBranchId <= 0) {
            unresolved.push(`Lot-transfer allocation ${allocationId} has no exact source branch identity.`);
            continue;
        }
        if (headerBranchId !== input.branchId) continue;

        const detailRows = detailsByTransferId.get(allocationId) || [];
        if (detailRows.length > 0) {
            for (const detail of detailRows) {
                const quantity = Math.max(0, numeric(detail.quantity));
                if (quantity <= 0) continue;
                const detailId = rowId(detail, ["lot_transfer_detail_id", "id"]);
                const detailProductId = productId(detail);
                const detailInventoryLotId = rowId(detail, ["source_inventory_lot_id", "inventory_lot_id"]);
                const detailBatch = normalizedBatch(detail.source_batch_no);
                if (detailId <= 0 || detailProductId <= 0 || detailInventoryLotId <= 0 || !detailBatch) {
                    unresolved.push(`Lot-transfer allocation ${allocationId} has a detail line without exact source identity.`);
                    continue;
                }
                if (
                    detailProductId !== input.productId
                    || relationId(firstValue(row, ["source_lot_id"]), ["lot_id", "id"]) !== input.lotId
                    || detailInventoryLotId !== input.inventoryLotId
                    || detailBatch !== batchKey
                ) continue;
                appendProtectedAllocation(allocationRows, seen, {
                    source: "LOT_TRANSFER",
                    allocationId: detailId,
                    quantity,
                    status: stringValue(row.status),
                    reference: nullableString(firstValue(row, ["request_no"]))
                        ? `${nullableString(firstValue(row, ["request_no"]))} line ${numeric(detail.line_no) || "?"}`
                        : `Transfer ${allocationId} line ${numeric(detail.line_no) || "?"}`
                });
            }
            continue;
        }

        // Legacy single-line headers have no detail identity. Keep them
        // protected when their header aliases exactly match the source batch.
        const quantity = Math.max(0, numeric(row.quantity));
        const sourceLotId = relationId(firstValue(row, ["source_lot_id"]), ["lot_id", "id"]);
        const sourceInventoryLotId = rowId(row, ["source_inventory_lot_id", "inventory_lot_id"]);
        const sourceBatch = normalizedBatch(row.source_batch_no);
        const legacyProductId = productId(row);
        if (quantity <= 0) continue;
        if (legacyProductId <= 0 || sourceLotId <= 0 || sourceInventoryLotId <= 0 || !sourceBatch) {
            unresolved.push(`Lot-transfer allocation ${allocationId} has no exact legacy source identity.`);
            continue;
        }
        if (legacyProductId !== input.productId || sourceLotId !== input.lotId || sourceInventoryLotId !== input.inventoryLotId || sourceBatch !== batchKey) continue;
        appendProtectedAllocation(allocationRows, seen, {
            source: "LOT_TRANSFER",
            allocationId,
            quantity,
            status: stringValue(row.status),
            reference: nullableString(firstValue(row, ["request_no"]))
        });
    }

    const explicitQuantity = allocationRows.reduce((sum, allocation) => sum + allocation.quantity, 0);
    const legacyReservedQuantity = Math.max(0, input.legacyReservedQuantity);
    return {
        legacyReservedQuantity,
        explicitQuantity,
        totalQuantity: Math.max(legacyReservedQuantity, explicitQuantity),
        allocations: allocationRows,
        unresolved
    };
}
