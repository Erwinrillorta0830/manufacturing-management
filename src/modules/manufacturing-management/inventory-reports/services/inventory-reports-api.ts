import {
    LotLookup
} from "../types";

export interface RawProduct {
    product_id: number;
    product_name: string;
    product_code: string;
    unit_of_measurement?: {
        unit_shortcut?: string;
        unit_name?: string;
    } | null;
    product_type?: number | { id: number; name?: string } | null;
}

export interface RawBranch {
    id: number;
    branch_name: string;
}

export interface RawBatch {
    line_id: number;
    product_id: number;
    version_id?: number | null;
    version_name?: string | null;
    branch_id: number;
    lot_id: number | null;
    lot_name: string | null;
    lot_number: string | null;
    batch_no: string | null;
    expiration_date?: string | null;
    quantity_received: number;
    on_hand_quantity?: number;
    reserved_quantity?: number;
    available_quantity?: number;
    final_landed_unit_cost: number;
    base_unit_cost_php: number;
    qa_status: string;
    rejection_reason?: string | null;
    created_on?: string | null;
    source_reference?: string | null;
    source_type?: string | null;
    remarks?: string | null;
    transaction_type?: string | null;
}

export interface RawInventoryResponse {
    products: RawProduct[];
    batches: RawBatch[];
    branches: RawBranch[];
}

export async function fetchInventoryData(): Promise<RawInventoryResponse> {
    const res = await fetch("/api/manufacturing/inventory");
    if (!res.ok) {
        throw new Error("Failed to fetch inventory data from BFF");
    }
    return await res.json();
}

export async function fetchLotsList(): Promise<LotLookup[]> {
    const res = await fetch("/api/manufacturing/inventory-warehousing/inventory-reports/lots");
    if (!res.ok) {
        throw new Error("Failed to fetch lots for lookup from BFF");
    }
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.map((l: any) => ({
        lotId: l.lotId,
        lotName: l.lotName,
        inventoryTypeName: l.inventoryTypeName || "Unknown",
        maxBatchCapacity: l.maxBatchCapacity || 10
    }));
}

export interface RawMovement {
    movement_id: number;
    product_id: number | { product_id?: number };
    version_id?: number | { version_id?: number; version_name?: string } | null;
    lot_id: number | { lot_id?: number; lot_name?: string } | null;
    branch_id: number | { id?: number };
    transaction_type_id?: number | { transaction_type_id?: number; type_name?: string } | null;
    source_document_id?: number | null;
    source_document_no?: string | null;
    batch_no: string;
    expiry_date?: string | null;
    manufacturing_date?: string | null;
    created_at?: string | null;
    quantity: number | string;
    remarks?: string | null;
}

export async function fetchInventoryMovements(): Promise<RawMovement[]> {
    const res = await fetch("/api/manufacturing/inventory/movements?limit=500");
    if (!res.ok) {
        throw new Error("Failed to fetch inventory movements from BFF");
    }
    const json = await res.json();
    return json.data || [];
}

export interface RawVersion {
    version_id: number;
    version_name: string;
}

export async function fetchVersionsForProducts(productIds: number[]): Promise<Map<number, string>> {
    const versionMap = new Map<number, string>();
    if (!productIds || productIds.length === 0) return versionMap;

    try {
        const fetchPromises = productIds.map(id =>
            fetch(`/api/manufacturing/finished-goods/versions?productId=${id}`)
                .then(res => res.ok ? res.json() : [])
                .catch(() => [])
        );
        const results = await Promise.all(fetchPromises);
        results.forEach((vList: RawVersion[]) => {
            if (Array.isArray(vList)) {
                vList.forEach(v => {
                    if (v.version_id && v.version_name) {
                        versionMap.set(Number(v.version_id), v.version_name);
                    }
                });
            }
        });
    } catch (err) {
        console.error("Failed to fetch product versions:", err);
    }
    return versionMap;
}

const TRANSACTION_TYPE_MAP: Record<number, string> = {
    1: "Job Order Consumage",
    2: "Job Order Finished Goods",
    3: "Purchase Receiving QA",
    4: "Sales Issue",
    5: "QA Reject / Bad Order Receipt",
    6: "Physical Inventory Surplus",
    7: "Physical Inventory Deficit",
    8: "Job Order Wastage / Scrap"
};

export function buildBatchesFromMovements(
    movements: RawMovement[],
    inventoryLots: RawBatch[],
    versionMap?: Map<number, string>
): RawBatch[] {
    if (!movements || movements.length === 0) {
        return inventoryLots;
    }

    // Build lookup for lot unit costs, QA statuses, transaction types, and lot names from inventoryLots fallback
    const lotMetaMap = new Map<string, { unitCost: number; qaStatus: string; transactionType: string | null; reservedQuantity: number }>();
    const lotNameByIdMap = new Map<number, string>();
    inventoryLots.forEach((l) => {
        const key = `${l.product_id}:${l.version_id ?? "null"}:${l.branch_id}:${l.lot_id ?? "null"}:${l.batch_no || ""}`;
        lotMetaMap.set(key, {
            unitCost: l.final_landed_unit_cost || l.base_unit_cost_php || 0,
            qaStatus: l.qa_status || "Passed",
            transactionType: l.transaction_type || null,
            reservedQuantity: Number(l.reserved_quantity || 0),
        });
        if (l.lot_id && l.lot_name) {
            lotNameByIdMap.set(l.lot_id, l.lot_name);
        }
    });

    // Group movements by composite key: productId:versionId:lotId:branchId:batchNo
    const groupMap = new Map<string, {
        firstMvt: RawMovement;
        totalQty: number;
        productId: number;
        versionId: number | null;
        lotId: number | null;
        branchId: number;
        batchNo: string;
    }>();

    movements.forEach((m) => {
        let productId = 0;
        if (typeof m.product_id === "object" && m.product_id !== null) {
            const obj = m.product_id as { product_id?: number | string; id?: number | string };
            productId = Number(obj.product_id ?? obj.id ?? 0);
        } else {
            productId = Number(m.product_id || 0);
        }

        let branchId = 0;
        if (typeof m.branch_id === "object" && m.branch_id !== null) {
            const obj = m.branch_id as { id?: number | string; branch_id?: number | string };
            branchId = Number(obj.id ?? obj.branch_id ?? 0);
        } else {
            branchId = Number(m.branch_id || 0);
        }

        let lotId: number | null = null;
        if (m.lot_id !== null && m.lot_id !== undefined) {
            if (typeof m.lot_id === "object" && m.lot_id !== null) {
                const obj = m.lot_id as { lot_id?: number | string; id?: number | string };
                const raw = obj.lot_id ?? obj.id;
                if (raw !== undefined && raw !== null && raw !== "") {
                    const parsed = Number(raw);
                    if (!isNaN(parsed) && parsed > 0) lotId = parsed;
                }
            } else {
                const parsed = Number(m.lot_id);
                if (!isNaN(parsed) && parsed > 0) lotId = parsed;
            }
        }

        let versionId: number | null = null;
        if (m.version_id !== null && m.version_id !== undefined) {
            if (typeof m.version_id === "object" && m.version_id !== null) {
                const obj = m.version_id as { version_id?: number | string; id?: number | string };
                const raw = obj.version_id ?? obj.id;
                if (raw !== undefined && raw !== null && raw !== "") {
                    const parsed = Number(raw);
                    if (!isNaN(parsed) && parsed > 0) versionId = parsed;
                }
            } else {
                const parsed = Number(m.version_id);
                if (!isNaN(parsed) && parsed > 0) versionId = parsed;
            }
        }

        const batchNo = String(m.batch_no || "").trim() || "LOT-N/A";
        const qty = Number(m.quantity || 0);

        if (!productId) return;

        const key = `${productId}:${versionId ?? "null"}:${lotId ?? "null"}:${branchId}:${batchNo}`;
        const existing = groupMap.get(key);

        if (!existing) {
            groupMap.set(key, {
                firstMvt: m,
                totalQty: qty,
                productId,
                versionId,
                lotId,
                branchId,
                batchNo
            });
        } else {
            existing.totalQty += qty;
            // If existing firstMvt didn't have positive quantity (inbound), update if current movement is inbound
            if (Number(m.quantity || 0) > 0 && Number(existing.firstMvt.quantity || 0) <= 0) {
                existing.firstMvt = m;
            }
        }
    });

    const result: RawBatch[] = [];
    groupMap.forEach((group) => {
        // Only include batches with positive stock on hand
        if (group.totalQty <= 0) return;

        const m = group.firstMvt;
        const metaKey = `${group.productId}:${group.versionId ?? "null"}:${group.branchId}:${group.lotId ?? "null"}:${group.batchNo}`;
        const fallbackMetaKey = `${group.productId}:null:${group.branchId}:${group.lotId ?? "null"}:${group.batchNo}`;
        const lotMeta = lotMetaMap.get(metaKey) || lotMetaMap.get(fallbackMetaKey);
        const reservedQuantity = Math.min(group.totalQty, lotMeta?.reservedQuantity || 0);
        const availableQuantity = Math.max(0, group.totalQty - reservedQuantity);

        const lotName = typeof m.lot_id === "object" ? m.lot_id?.lot_name || null : (group.lotId ? lotNameByIdMap.get(group.lotId) || null : null);
        let versionName = typeof m.version_id === "object" ? m.version_id?.version_name || null : null;
        if (!versionName && group.versionId && versionMap) {
            versionName = versionMap.get(group.versionId) || null;
        }

        let txnType: string | null = null;
        if (m.transaction_type_id !== null && m.transaction_type_id !== undefined) {
            if (typeof m.transaction_type_id === "object" && m.transaction_type_id !== null) {
                const obj = m.transaction_type_id as { type_name?: string; name?: string; transaction_type_id?: number | string; id?: number | string };
                txnType = obj.type_name || obj.name || null;
                if (!txnType) {
                    const rawId = Number(obj.transaction_type_id ?? obj.id ?? 0);
                    if (rawId && TRANSACTION_TYPE_MAP[rawId]) {
                        txnType = TRANSACTION_TYPE_MAP[rawId];
                    }
                }
            } else {
                const typeId = Number(m.transaction_type_id);
                if (!isNaN(typeId) && TRANSACTION_TYPE_MAP[typeId]) {
                    txnType = TRANSACTION_TYPE_MAP[typeId];
                }
            }
        }

        if (!txnType) {
            txnType = lotMeta?.transactionType || null;
        }

        if (!txnType && m.source_document_no) {
            const doc = String(m.source_document_no).toUpperCase();
            if (doc.startsWith("REC-") || doc.startsWith("PO-")) {
                txnType = "Purchase Receiving QA";
            } else if (doc.startsWith("JO-") || doc.startsWith("YIELD-")) {
                txnType = "Job Order Finished Goods";
            } else if (doc.startsWith("PH-") || doc.startsWith("ADJ-")) {
                txnType = "Physical Inventory Surplus";
            } else if (doc.startsWith("SO-") || doc.startsWith("INV-")) {
                txnType = "Sales Issue";
            }
        }

        if (!txnType) {
            txnType = "Ledger Movement";
        }

        result.push({
            line_id: m.movement_id,
            product_id: group.productId,
            version_id: group.versionId,
            version_name: versionName,
            branch_id: group.branchId,
            lot_id: group.lotId,
            lot_name: lotName,
            lot_number: group.batchNo,
            batch_no: group.batchNo,
            expiration_date: m.expiry_date || null,
            quantity_received: availableQuantity,
            on_hand_quantity: group.totalQty,
            reserved_quantity: reservedQuantity,
            available_quantity: availableQuantity,
            final_landed_unit_cost: lotMeta?.unitCost || 0,
            base_unit_cost_php: lotMeta?.unitCost || 0,
            qa_status: lotMeta?.qaStatus || "Passed",
            created_on: m.manufacturing_date || m.created_at || null,
            source_reference: m.source_document_no || null,
            remarks: m.remarks || null,
            transaction_type: txnType
        });
    });

    return result.length > 0 ? result : inventoryLots;
}
