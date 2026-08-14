import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export interface PhysicalInventorySheet {
    id: number;
    ph_no: string;
    branch_id: number | { id?: number; branch_name?: string; branch_code?: string } | null;
    starting_date: string;
    cutoff_date: string;
    date_encoded: string;
    inventory_type?: string | null;
    stock_type?: string | null;
    encoded_by?: number | string | null;
    is_committed: number | boolean;
    committed_at?: string | null;
    is_cancelled: number | boolean;
    total_amount: number;
    remarks?: string | null;
    offset_pairings?: unknown;
}

export interface PhysicalInventoryDetail {
    id?: number;
    ph_id: number;
    product_id: number | { product_id?: number; product_name?: string; product_code?: string; barcode?: string; unit_of_measurement?: { unit_shortcut?: string; unit_name?: string } } | null;
    version_id?: number | { version_id?: number; version_name?: string; version_code?: string } | null;
    lot_id?: number | { lot_id?: number; lot_name?: string } | null;
    batch_no?: string | null;
    system_count: number;
    physical_count: number;
    variance: number;
    variance_base?: number;
    unit_price: number;
    difference_cost: number;
    offset_qty?: number;
    offset_match?: number | null;
    remarks?: string | null;
}

export interface DirectusMovement {
    movement_id: number;
    product_id: number | { product_id?: number; product_name?: string; product_code?: string; cost_per_unit?: number; price_per_unit?: number };
    branch_id: number | { id?: number };
    lot_id?: number | { lot_id?: number; lot_name?: string } | null;
    version_id?: number | { version_id?: number; version_name?: string } | null;
    batch_no?: string | null;
    lot_no?: string | null;
    lot_number?: string | null;
    quantity: number | string;
    unit_price?: number | string | null;
    unit_cost?: number | string | null;
    date_created?: string | null;
    created_at?: string | null;
    timestamp?: string | null;
}

export interface DirectusProductMeta {
    product_id: number;
    product_name: string;
    product_code: string;
    barcode?: string;
    category_id?: number | { category_id?: number; category_name?: string };
    product_type?: number | string | { id?: number | string; name?: string; type_name?: string } | null;
    inventory_type?: string;
    cost_per_unit?: number | string | null;
    price_per_unit?: number | string | null;
    unit_of_measurement?: { unit_id?: number; unit_name?: string; unit_shortcut?: string } | null;
}

/**
 * Safely extracts a positive numeric ID from a number or object relation.
 */
export function extractId(value: unknown, defaultKey = "id"): number {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const raw = record[defaultKey] ?? record.id ?? record.product_id ?? record.lot_id ?? record.version_id ?? record.category_id;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Rounds monetary amounts to 2 decimal places.
 */
export function roundMoney(amount: number | string | null | undefined): number {
    const numeric = Number(amount || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 100) / 100;
}

/**
 * Formats quantity values as clean decimals.
 */
export function roundQty(qty: number | string | null | undefined): number {
    const numeric = Number(qty || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 10000) / 10000;
}

/**
 * Generates a standard physical inventory count sheet number: PI-YYYY-XXXX
 */
export function generatePhNo(): string {
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `PI-${year}-${randomSuffix}`;
}

export interface SnapshotOptions {
    branchId: number;
    cutoffDateStr?: string;
    startingDateStr?: string;
    inventoryType?: string;
    productTypeId?: number | string;
    categoryId?: number;
    supplierId?: number;
}

/**
 * Calculates snapshot of active system inventory quantities from inventory_movements ledger.
 * Aggregates SUM(quantity) grouped by product_id, version_id, and lot_id (location) up to cutoff_date for a given branch.
 * Complies with PI 2.0 specs: removes single-batch constraint and aggregates per SKU & Storage Location.
 */
export async function snapshotSystemInventory(
    branchIdOrOptions: number | SnapshotOptions,
    legacyCutoffDateStr?: string
): Promise<PhysicalInventoryDetail[]> {
    const options: SnapshotOptions = typeof branchIdOrOptions === "object"
        ? branchIdOrOptions
        : { branchId: branchIdOrOptions, cutoffDateStr: legacyCutoffDateStr };

    const branchId = options.branchId;
    const cutoffDateStr = options.cutoffDateStr;

    // Determine cutoff timestamp if provided
    let cutoffTimestamp = Number.MAX_SAFE_INTEGER;
    if (cutoffDateStr) {
        const cutoffDate = new Date(cutoffDateStr);
        if (!isNaN(cutoffDate.getTime())) {
            cutoffTimestamp = cutoffDate.getTime();
        }
    }

    // Direct query to inventory_movements expanding lot_id (lots table) and product_id (products table)
    const [movementsRes, productsRes, versionsRes] = await Promise.all([
        fetch(`${DIRECTUS_URL}/items/inventory_movements?filter[branch_id][_eq]=${branchId}&limit=-1&fields=*,product_id.*,lot_id.*`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,barcode,cost_per_unit,price_per_unit,category_id.*,unit_of_measurement.*,product_type.*`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?limit=-1&fields=version_id,version_name,version_code,product_id,status`, { headers, cache: "no-store" }).catch(() => null),
    ]);

    const movements: DirectusMovement[] = movementsRes.ok ? ((await movementsRes.json()).data || []) : [];
    const products: DirectusProductMeta[] = productsRes.ok ? ((await productsRes.json()).data || []) : [];
    const rawVersions = versionsRes && versionsRes.ok ? ((await versionsRes.json()).data || []) : [];

    // Map default active version per product
    const defaultProductVersionMap = new Map<number, number>();
    rawVersions.forEach((v: { product_id?: number | string; status?: string; version_id?: number | string }) => {
        if (v.product_id && (v.status === "Active" || !defaultProductVersionMap.has(Number(v.product_id)))) {
            defaultProductVersionMap.set(Number(v.product_id), Number(v.version_id));
        }
    });

    // Map product metadata & unit costs
    const productCostMap = new Map<number, number>();
    const productMetaMap = new Map<number, DirectusProductMeta>();
    for (const p of products) {
        const cost = Number(p.cost_per_unit || p.price_per_unit || 0);
        productCostMap.set(p.product_id, roundMoney(cost));
        productMetaMap.set(p.product_id, p);
    }

    // Group inventory_movements ledger transactions by composite key: productId:versionId:lotId
    // In accordance with PI 2.0, aggregate counts are reconciled against total SKU quantity per storage location without restricting entry to a single batch.
    const stockGroupMap = new Map<string, {
        productId: number;
        versionId: number;
        lotId: number;
        systemCount: number;
        movementUnitPrice: number;
        lotObj: { lot_id?: number; lot_name?: string } | null;
        productObj: { product_id?: number; product_name?: string; product_code?: string; barcode?: string; unit_of_measurement?: { unit_shortcut?: string; unit_name?: string } } | null;
    }>();

    for (const m of movements) {
        // Filter out ledger movements posted after cutoff date
        const dateRaw = m.date_created || m.created_at || m.timestamp;
        if (dateRaw) {
            const mTime = new Date(dateRaw).getTime();
            if (!isNaN(mTime) && mTime > cutoffTimestamp) {
                continue;
            }
        }

        const productId = extractId(m.product_id, "product_id");
        if (!productId) continue;

        // Apply inventoryType / productTypeId / category filter if specified
        if (options.inventoryType || options.productTypeId || options.categoryId) {
            const prodMeta = productMetaMap.get(productId);
            if (options.categoryId) {
                const catId = extractId(prodMeta?.category_id, "category_id");
                if (catId && catId !== options.categoryId) continue;
            }

            const pType = prodMeta?.product_type;
            const pTypeId = extractId(pType, "id");

            if (options.productTypeId) {
                const targetPTypeId = Number(options.productTypeId);
                if (pTypeId && targetPTypeId && pTypeId !== targetPTypeId) {
                    continue;
                }
            } else if (options.inventoryType) {
                const pTypeName = (typeof pType === "object" && pType !== null
                    ? ((pType as { name?: string; type_name?: string }).name || (pType as { name?: string; type_name?: string }).type_name || "")
                    : String(pType || "")).toLowerCase();
                const filterType = String(options.inventoryType).toLowerCase();

                const matchesType = (String(pTypeId) === filterType) ||
                    (pTypeName && pTypeName.includes(filterType)) ||
                    (filterType && filterType.includes(pTypeName)) ||
                    (filterType.includes("finish") && (pTypeId === 388 || pTypeName.includes("finish"))) ||
                    (filterType.includes("raw") && (pTypeId === 389 || pTypeName.includes("raw"))) ||
                    (filterType.includes("pack") && (pTypeId === 390 || pTypeName.includes("pack")));

                if (!matchesType && pTypeName) {
                    continue;
                }
            }
        }

        const lotId = extractId(m.lot_id, "lot_id");
        const versionId = extractId(m.version_id, "version_id") || extractId(m.version_id, "id") || (defaultProductVersionMap.get(productId) || 0);

        const key = `${productId}:${versionId}:${lotId}`;
        const qty = Number(m.quantity || 0);
        const mUnitPrice = Number(m.unit_price || m.unit_cost || 0);

        const existing = stockGroupMap.get(key);
        if (existing) {
            existing.systemCount += qty;
            if (mUnitPrice > 0) existing.movementUnitPrice = mUnitPrice;
        } else {
            const prodMeta = productMetaMap.get(productId);
            stockGroupMap.set(key, {
                productId,
                versionId,
                lotId,
                systemCount: qty,
                movementUnitPrice: mUnitPrice > 0 ? mUnitPrice : 0,
                lotObj: typeof m.lot_id === "object" ? m.lot_id : null,
                productObj: prodMeta ? {
                    product_id: prodMeta.product_id,
                    product_name: prodMeta.product_name,
                    product_code: prodMeta.product_code,
                    barcode: prodMeta.barcode,
                    unit_of_measurement: prodMeta.unit_of_measurement ? {
                        unit_shortcut: prodMeta.unit_of_measurement.unit_shortcut,
                        unit_name: prodMeta.unit_of_measurement.unit_name
                    } : undefined
                } : (typeof m.product_id === "object" ? m.product_id : null),
            });
        }
    }

    // Build line item details strictly from aggregated inventory_movements ledger sums
    const details: PhysicalInventoryDetail[] = [];
    for (const group of stockGroupMap.values()) {
        const systemCount = roundQty(group.systemCount);
        // Include active items (where net ledger sum is non-zero)
        if (systemCount === 0) continue;

        let unitPrice = group.movementUnitPrice;
        if (!unitPrice && productCostMap.has(group.productId)) {
            unitPrice = productCostMap.get(group.productId)!;
        }

        const physicalCount = systemCount; // Initial physical count input defaults to system snapshot sum
        const variance = roundQty(physicalCount - systemCount); // 0
        const differenceCost = roundMoney(variance * unitPrice); // 0.00

        details.push({
            ph_id: 0,
            product_id: group.productObj || group.productId,
            version_id: group.versionId || undefined,
            lot_id: group.lotObj || group.lotId || undefined,
            batch_no: null,
            system_count: systemCount,
            physical_count: physicalCount,
            variance,
            variance_base: variance,
            unit_price: roundMoney(unitPrice),
            difference_cost: differenceCost,
            offset_qty: 0,
            remarks: null,
        });
    }

    return details;
}
