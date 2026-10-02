import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";
import {
    BatchExpirationItem,
    ExpirationStatus,
    BatchExpirationKpis,
    TimelineWindow,
    CategoryThresholdConfig,
    CATEGORY_EXPIRATION_THRESHOLDS,
} from "@/modules/manufacturing-management/inventory-warehousing/batches-expiration-tracking/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPRING_API_BASE =
    process.env.SPRING_API_BASE_URL?.trim().replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_SPRING_API_URL?.trim().replace(/\/+$/, "") ||
    "";

function getDiffDays(expiryDateStr: string | null): number | null {
    if (!expiryDateStr) return null;
    const target = new Date(expiryDateStr);
    if (isNaN(target.getTime())) return null;

    // Reset to start of day for comparison
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());

    const diffTime = expDate.getTime() - today.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function resolveCategoryThreshold(): CategoryThresholdConfig {
    // Expiry strictly tracks Raw Materials (180 days / 6 months threshold - PM confirmed)
    return CATEGORY_EXPIRATION_THRESHOLDS.RAW_MATERIALS;
}

function computeExpirationStatus(
    daysRemaining: number | null,
    threshold: CategoryThresholdConfig
): ExpirationStatus {
    if (daysRemaining === null) return "NO_EXPIRY";
    if (daysRemaining < 0) return "EXPIRED";
    if (daysRemaining === 0) return "EXPIRING_TODAY";
    if (daysRemaining >= 1 && daysRemaining <= threshold.criticalDays) return "CRITICAL";
    if (daysRemaining > threshold.criticalDays && daysRemaining <= threshold.warningDays) return "WARNING";
    if (daysRemaining > threshold.warningDays && daysRemaining <= threshold.horizonDays) return "UPCOMING";
    return "SAFE";
}

interface SpringMovementRow {
    branchId?: number;
    branch_id?: number;
    inventoryLotId?: number;
    inventory_lot_id?: number;
    mmLotId?: number;
    mm_lot_id?: number;
    lotId?: number;
    lot_id?: number;
    productId?: number;
    product_id?: number;
    batchNo?: string;
    batch_no?: string;
    quantityIn?: number | string;
    quantity_in?: number | string;
    quantityOut?: number | string;
    quantity_out?: number | string;
    quantity?: number | string;
    unitCost?: number | string;
    unit_cost?: number | string;
    onhandQuantity?: number | string;
    onhand_quantity?: number | string;
    manufacturingDate?: string;
    manufacturing_date?: string;
    expirationDate?: string;
    expiration_date?: string;
    expiry_date?: string;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const branchParam = searchParams.get("branch");
        const statusParam = searchParams.get("status");
        const productTypeParam = searchParams.get("product_type");
        const onlyOnHand = searchParams.get("only_on_hand") !== "false";

        // Retrieve token from cookies for Spring Boot authorization
        const cookieStore = await cookies();
        const userToken =
            cookieStore.get("vos_access_token")?.value ||
            cookieStore.get("springboot_token")?.value ||
            cookieStore.get("token")?.value ||
            "";

        const springHeaders: Record<string, string> = {
            Accept: "application/json",
        };
        if (userToken) {
            springHeaders["Authorization"] = `Bearer ${userToken}`;
            springHeaders["Cookie"] = `vos_access_token=${userToken}`;
        }

        const timestamp = Date.now();

        // 1. Fetch Directus Authoritative Registry Tables & Movements in Parallel
        const [
            invLotsRes,
            lotsRes,
            productsRes,
            branchesRes,
            unitsRes,
            prodTypesRes,
            adjustmentsRes,
            directusMovementsRes,
            springOnhandRes,
            springMovementsRes,
        ] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/mm_inventory_lots?limit=-1&sort=-expiry_date,-created_at&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ),
            fetch(
                `${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=lot_id,lot_name,branch_id,unit_id,status&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_code,product_name,description,barcode,product_type,unit_of_measurement,cost_per_unit,estimated_unit_cost,price_per_unit&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code,isBadStock,isActive&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/units?limit=-1&fields=unit_id,unit_name,unit_shortcut&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/product_type?limit=-1&fields=id,name&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/mm_stock_adjustment?limit=-1&fields=id,doc_no,product_id,inventory_lot_id,lot_id,batch_no,branch_id,type,quantity,unit_cost&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/inventory_movements?limit=-1&fields=movement_id,product_id,lot_id,mm_lot_id,inventory_lot_id,branch_id,batch_no,quantity&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            SPRING_API_BASE
                ? fetch(`${SPRING_API_BASE}/api/mm-batch-onhand/all`, { headers: springHeaders, cache: "no-store" }).catch(() => null)
                : Promise.resolve(null),
            SPRING_API_BASE
                ? fetch(`${SPRING_API_BASE}/api/mm-inventory-movements/all`, { headers: springHeaders, cache: "no-store" }).catch(() => null)
                : Promise.resolve(null),
        ]);

        if (!invLotsRes.ok) {
            const errText = await invLotsRes.text().catch(() => "");
            return NextResponse.json(
                {
                    success: false,
                    error: `Failed to fetch mm_inventory_lots from registry: ${errText || invLotsRes.status}`,
                },
                { status: 500 }
            );
        }

        const invLotsData = await invLotsRes.json();
        const rawInvLots: Array<Record<string, unknown>> = invLotsData.data || [];

        const lotsData = lotsRes && lotsRes.ok ? await lotsRes.json() : { data: [] };
        const productsData = productsRes && productsRes.ok ? await productsRes.json() : { data: [] };
        const branchesData = branchesRes && branchesRes.ok ? await branchesRes.json() : { data: [] };
        const unitsData = unitsRes && unitsRes.ok ? await unitsRes.json() : { data: [] };
        const prodTypesData = prodTypesRes && prodTypesRes.ok ? await prodTypesRes.json() : { data: [] };
        const adjustmentsData = adjustmentsRes && adjustmentsRes.ok ? await adjustmentsRes.json() : { data: [] };
        const directusMovementsData = directusMovementsRes && directusMovementsRes.ok ? await directusMovementsRes.json() : { data: [] };

        // Build lookup maps
        const lotsMap = new Map<number, { lot_name: string; branch_id: number; unit_id?: number }>();
        for (const l of (lotsData.data || [])) {
            lotsMap.set(Number(l.lot_id), {
                lot_name: l.lot_name || `LOT-${l.lot_id}`,
                branch_id: Number(l.branch_id),
                unit_id: l.unit_id ? Number(l.unit_id) : undefined,
            });
        }

        const productsMap = new Map<number, {
            product_code: string;
            product_name: string;
            product_type?: number;
            unit_cost: number;
            unit_of_measurement?: number;
        }>();

        for (const p of (productsData.data || [])) {
            const pid = Number(p.product_id ?? p.id ?? 0);
            if (!pid) continue;
            const desc = String(p.description || "").trim();
            const pName = String(p.product_name || p.name || "").trim();
            const code = String(p.product_code || p.barcode || `PRD-${pid}`).trim();
            const rawCost = p.cost_per_unit ?? p.price_per_unit ?? p.estimated_unit_cost;
            const unitCost = rawCost !== null && rawCost !== undefined && !isNaN(Number(rawCost))
                ? Number(rawCost)
                : 0;

            productsMap.set(pid, {
                product_code: code,
                product_name: desc || pName || `Product #${pid}`,
                product_type: p.product_type ? Number(p.product_type) : undefined,
                unit_cost: unitCost,
                unit_of_measurement: p.unit_of_measurement ? Number(p.unit_of_measurement) : undefined,
            });
        }

        const branchesMap = new Map<number, { branch_name: string; branch_code: string; isBadStock: boolean; isActive: boolean }>();
        for (const b of (branchesData.data || [])) {
            const isBadStock = Number(b.isBadStock) === 1 || b.isBadStock === true || b.isBadStock === "1";
            const isActive = Number(b.isActive) === 1 || b.isActive === true || b.isActive === "1";
            branchesMap.set(Number(b.id), {
                branch_name: b.branch_name || `Branch ${b.id}`,
                branch_code: b.branch_code || `B${b.id}`,
                isBadStock,
                isActive,
            });
        }

        const unitsMap = new Map<number, { unit_name: string; unit_shortcut: string }>();
        for (const u of (unitsData.data || [])) {
            unitsMap.set(Number(u.unit_id), {
                unit_name: u.unit_name || "",
                unit_shortcut: u.unit_shortcut || u.unit_name || "",
            });
        }

        const prodTypesMap = new Map<number, string>();
        for (const pt of (prodTypesData.data || [])) {
            prodTypesMap.set(Number(pt.id), pt.name || "Standard");
        }

        // 2. Aggregate Live On-Hand Quantities
        // We support Spring Boot (canonical live view) AND Directus stock adjustments / movements fallback
        const onhandByInvLotId = new Map<number, number>();
        const onhandByBranchLotProductBatch = new Map<string, number>();

        // A. Parse Spring Boot /api/mm-batch-onhand/all if available
        if (springOnhandRes && springOnhandRes.ok) {
            try {
                const springJson = await springOnhandRes.json();
                const springRows: SpringMovementRow[] = Array.isArray(springJson)
                    ? springJson
                    : springJson?.data || [];

                for (const row of springRows) {
                    const qty = Number(row.onhandQuantity ?? row.onhand_quantity ?? 0);
                    const bId = Number(row.branchId || row.branch_id || 0);
                    const invId = Number(row.inventoryLotId || row.inventory_lot_id || 0);
                    const lotId = Number(row.mmLotId || row.mm_lot_id || row.lotId || row.lot_id || 0);
                    const pId = Number(row.productId || row.product_id || 0);
                    const bNo = String(row.batchNo || row.batch_no || "").trim().toLowerCase();

                    if (invId > 0) {
                        onhandByInvLotId.set(invId, qty);
                    }
                    if (bId > 0 && bNo) {
                        const key = `${bId}_${lotId}_${pId}_${bNo}`;
                        onhandByBranchLotProductBatch.set(key, qty);
                    }
                }
            } catch (err) {
                console.warn("[BatchesExpiration] Error parsing Spring Boot onhand:", err);
            }
        }

        // B. Parse Spring Boot /api/mm-inventory-movements/all if onhand was missing rows
        if (springMovementsRes && springMovementsRes.ok) {
            try {
                const movJson = await springMovementsRes.json();
                const movRows: SpringMovementRow[] = Array.isArray(movJson) ? movJson : movJson?.data || [];

                for (const m of movRows) {
                    const invId = Number(m.inventoryLotId || m.inventory_lot_id || 0);
                    const qIn = Number(m.quantityIn || m.quantity_in || 0);
                    const qOut = Number(m.quantityOut || m.quantity_out || 0);
                    const signedQty = Number(m.quantity || 0);
                    const net = (qIn || qOut) ? (qIn - qOut) : signedQty;

                    const bId = Number(m.branchId || m.branch_id || 0);
                    const lotId = Number(m.mmLotId || m.mm_lot_id || m.lotId || m.lot_id || 0);
                    const pId = Number(m.productId || m.product_id || 0);
                    const bNo = String(m.batchNo || m.batch_no || "").trim().toLowerCase();

                    if (invId > 0 && !onhandByInvLotId.has(invId)) {
                        onhandByInvLotId.set(invId, (onhandByInvLotId.get(invId) || 0) + net);
                    }
                    if (bId > 0 && bNo) {
                        const key = `${bId}_${lotId}_${pId}_${bNo}`;
                        if (!onhandByBranchLotProductBatch.has(key)) {
                            onhandByBranchLotProductBatch.set(key, (onhandByBranchLotProductBatch.get(key) || 0) + net);
                        }
                    }
                }
            } catch (err) {
                console.warn("[BatchesExpiration] Error parsing Spring Boot movements:", err);
            }
        }

        // C. Directus mm_stock_adjustment & inventory_movements Fallback / Enrichment
        // Ensures accurate balances even when Spring Boot is offline or un-synced
        const directusAdjustments: Array<Record<string, unknown>> = adjustmentsData.data || [];
        for (const adj of directusAdjustments) {
            const invId = Number(adj.inventory_lot_id || 0);
            const qty = Number(adj.quantity || 0);
            const delta = adj.type === "IN" ? qty : -qty;
            const bId = Number(adj.branch_id || 0);
            const lotId = Number(adj.lot_id || 0);
            const pId = Number(adj.product_id || 0);
            const bNo = String(adj.batch_no || "").trim().toLowerCase();

            if (invId > 0 && !onhandByInvLotId.has(invId)) {
                onhandByInvLotId.set(invId, (onhandByInvLotId.get(invId) || 0) + delta);
            }
            if (bId > 0 && bNo) {
                const key = `${bId}_${lotId}_${pId}_${bNo}`;
                if (!onhandByBranchLotProductBatch.has(key)) {
                    onhandByBranchLotProductBatch.set(key, (onhandByBranchLotProductBatch.get(key) || 0) + delta);
                }
            }
        }

        const directusMovements: Array<Record<string, unknown>> = directusMovementsData.data || [];
        for (const m of directusMovements) {
            const invId = Number(m.inventory_lot_id || 0);
            const qty = Number(m.quantity || 0);
            const bId = Number(m.branch_id || 0);
            const lotId = Number(m.mm_lot_id || m.lot_id || 0);
            const pId = Number(m.product_id || 0);
            const bNo = String(m.batch_no || "").trim().toLowerCase();

            if (invId > 0 && !onhandByInvLotId.has(invId)) {
                onhandByInvLotId.set(invId, (onhandByInvLotId.get(invId) || 0) + qty);
            }
            if (bId > 0 && bNo) {
                const key = `${bId}_${lotId}_${pId}_${bNo}`;
                if (!onhandByBranchLotProductBatch.has(key)) {
                    onhandByBranchLotProductBatch.set(key, (onhandByBranchLotProductBatch.get(key) || 0) + qty);
                }
            }
        }

        // 3. Assemble Batches with Resolved Product Names and Live Stock
        const items: BatchExpirationItem[] = [];

        for (const lot of rawInvLots) {
            const inventoryLotId = Number(lot.inventory_lot_id);
            const lotId = Number(lot.lot_id);
            const branchId = Number(lot.branch_id);
            const productId = Number(lot.product_id);
            const batchNo = String(lot.batch_no || "").trim();
            const expiryDateStr = lot.expiry_date ? String(lot.expiry_date).split("T")[0] : null;
            const mfgDateStr = lot.manufacturing_date ? String(lot.manufacturing_date).split("T")[0] : null;

            // Resolve relationships
            const lotInfo = lotsMap.get(lotId);
            const productInfo = productsMap.get(productId);
            const branchInfo = branchesMap.get(branchId);

            // Strictly filter out bad stock and inactive branches (only show batches from good branch where isBadStock = 0 and isActive = 1)
            if (!branchInfo || branchInfo.isBadStock || !branchInfo.isActive) {
                continue;
            }

            const unitId = lotInfo?.unit_id || productInfo?.unit_of_measurement || null;
            const unitInfo = unitId ? unitsMap.get(unitId) : undefined;
            const productTypeId = productInfo?.product_type || null;
            const productTypeName = productTypeId ? prodTypesMap.get(productTypeId) || null : null;

            // Expiry tracking strictly monitors Raw Materials (180 days / 6 months threshold)
            const isRawMaterial =
                productTypeId === 389 ||
                Boolean(
                    productTypeName &&
                    (productTypeName.toLowerCase().includes("raw") || productTypeName.toLowerCase().includes("ingredient"))
                );
            if (!isRawMaterial) {
                continue;
            }

            // Resolve live on-hand quantity respecting branch isolation
            const bNoLower = batchNo.toLowerCase();
            const compositeKey = `${branchId}_${lotId}_${productId}_${bNoLower}`;

            let onHandQty = 0;
            if (onhandByInvLotId.has(inventoryLotId)) {
                onHandQty = onhandByInvLotId.get(inventoryLotId) || 0;
            } else if (onhandByBranchLotProductBatch.has(compositeKey)) {
                onHandQty = onhandByBranchLotProductBatch.get(compositeKey) || 0;
            }

            const rawUnitCost = Number(lot.unit_cost) || productInfo?.unit_cost || 0;
            const unitCost = Math.max(0, rawUnitCost);
            const inventoryValue = Math.max(0, onHandQty) * unitCost;

            const categoryThreshold = resolveCategoryThreshold();
            const daysRemaining = getDiffDays(expiryDateStr);
            const expirationStatus = computeExpirationStatus(daysRemaining, categoryThreshold);

            const item: BatchExpirationItem = {
                inventory_lot_id: inventoryLotId,
                lot_id: lotId,
                lot_name: lotInfo?.lot_name || `Lot ${lotId}`,
                product_id: productId,
                product_code: productInfo?.product_code || `PRD-${productId}`,
                product_name: productInfo?.product_name || `Product #${productId}`,
                product_type_id: productTypeId,
                product_type_name: productTypeName,
                category_name: productTypeName,
                batch_no: batchNo || "-",
                manufacturing_date: mfgDateStr,
                expiry_date: expiryDateStr,
                days_remaining: daysRemaining,
                expiration_status: expirationStatus,
                warning_threshold_days: categoryThreshold.warningDays,
                critical_threshold_days: categoryThreshold.criticalDays,
                rotation_policy: categoryThreshold.rotationPolicy,
                branch_id: branchId,
                branch_name: branchInfo?.branch_name || `Branch ${branchId}`,
                branch_code: branchInfo?.branch_code || `B${branchId}`,
                unit_id: unitId,
                unit_name: unitInfo?.unit_name || null,
                unit_shortcut: unitInfo?.unit_shortcut || null,
                on_hand_quantity: onHandQty,
                unit_cost: unitCost,
                inventory_value: inventoryValue,
                qa_status: String(lot.qa_status || "GOOD"),
                status: String(lot.status || "ACTIVE"),
                remarks: lot.remarks ? String(lot.remarks) : null,
                source_reference: lot.source_reference ? String(lot.source_reference) : null,
            };

            items.push(item);
        }

        // 4. Compute High-Level KPIs across batches with on-hand exposure
        const kpis: BatchExpirationKpis = {
            expired_count: 0,
            expired_value: 0,
            critical_count: 0,
            critical_value: 0,
            warning_count: 0,
            warning_value: 0,
            upcoming_count: 0,
            upcoming_value: 0,
            next_7_days_count: 0,
            next_7_days_value: 0,
            next_30_days_count: 0,
            next_30_days_value: 0,
            next_90_days_count: 0,
            next_90_days_value: 0,
            next_180_days_count: 0,
            next_180_days_value: 0,
            total_batches_monitored: items.length,
            total_inventory_value: 0,
        };

        let windowExpiredVal = 0;
        let windowExpiredCount = 0;
        let window0to30Val = 0;
        let window0to30Count = 0;
        let window31to90Val = 0;
        let window31to90Count = 0;
        let window91to180Val = 0;
        let window91to180Count = 0;
        let window180PlusVal = 0;
        let window180PlusCount = 0;

        for (const item of items) {
            kpis.total_inventory_value += item.inventory_value;

            // Prioritize batches with active on-hand exposure for card badges and financial exposure
            const hasStock = item.on_hand_quantity > 0;
            const days = item.days_remaining;

            if (days !== null) {
                if (days < 0) {
                    kpis.expired_count += 1;
                    kpis.expired_value += item.inventory_value;
                    if (hasStock) {
                        windowExpiredVal += item.inventory_value;
                        windowExpiredCount += 1;
                    }
                } else if (days <= 30) {
                    kpis.critical_count += 1;
                    kpis.critical_value += item.inventory_value;
                    kpis.next_30_days_count += 1;
                    kpis.next_30_days_value += item.inventory_value;
                    kpis.next_180_days_count += 1;
                    kpis.next_180_days_value += item.inventory_value;
                    if (days <= 7) {
                        kpis.next_7_days_count = (kpis.next_7_days_count || 0) + 1;
                        kpis.next_7_days_value = (kpis.next_7_days_value || 0) + item.inventory_value;
                    }
                    if (hasStock) {
                        window0to30Val += item.inventory_value;
                        window0to30Count += 1;
                    }
                } else if (days <= 90) {
                    kpis.warning_count = (kpis.warning_count || 0) + 1;
                    kpis.warning_value = (kpis.warning_value || 0) + item.inventory_value;
                    kpis.next_90_days_count += 1;
                    kpis.next_90_days_value += item.inventory_value;
                    kpis.next_180_days_count += 1;
                    kpis.next_180_days_value += item.inventory_value;
                    if (hasStock) {
                        window31to90Val += item.inventory_value;
                        window31to90Count += 1;
                    }
                } else if (days <= 180) {
                    kpis.upcoming_count = (kpis.upcoming_count || 0) + 1;
                    kpis.upcoming_value = (kpis.upcoming_value || 0) + item.inventory_value;
                    kpis.next_180_days_count += 1;
                    kpis.next_180_days_value += item.inventory_value;
                    if (hasStock) {
                        window91to180Val += item.inventory_value;
                        window91to180Count += 1;
                    }
                } else {
                    if (hasStock) {
                        window180PlusVal += item.inventory_value;
                        window180PlusCount += 1;
                    }
                }
            }
        }

        const totalExposure = Math.max(
            1,
            windowExpiredVal + window0to30Val + window31to90Val + window91to180Val + window180PlusVal
        );

        const timeline: TimelineWindow[] = [
            {
                id: "expired",
                label: "Expired",
                sublabel: "< 0 days left",
                count: windowExpiredCount,
                value: windowExpiredVal,
                color: "#ef4444",
                bgClass: "bg-rose-500/10",
                borderClass: "border-rose-500/30",
                textClass: "text-rose-500",
                barColorClass: "bg-rose-500",
                percentage: Math.round((windowExpiredVal / totalExposure) * 100),
            },
            {
                id: "critical",
                label: "0–30 Days",
                sublabel: "Expiring within 1 Month",
                count: window0to30Count,
                value: window0to30Val,
                color: "#f97316",
                bgClass: "bg-orange-500/10",
                borderClass: "border-orange-500/30",
                textClass: "text-orange-500",
                barColorClass: "bg-orange-500",
                percentage: Math.round((window0to30Val / totalExposure) * 100),
            },
            {
                id: "warning",
                label: "31–90 Days",
                sublabel: "Expiring in 1–3 Months",
                count: window31to90Count,
                value: window31to90Val,
                color: "#eab308",
                bgClass: "bg-amber-500/10",
                borderClass: "border-amber-500/30",
                textClass: "text-amber-500",
                barColorClass: "bg-amber-500",
                percentage: Math.round((window31to90Val / totalExposure) * 100),
            },
            {
                id: "upcoming",
                label: "91–180 Days",
                sublabel: "Expiring in 3–6 Months",
                count: window91to180Count,
                value: window91to180Val,
                color: "#3b82f6",
                bgClass: "bg-blue-500/10",
                borderClass: "border-blue-500/30",
                textClass: "text-blue-500",
                barColorClass: "bg-blue-500",
                percentage: Math.round((window91to180Val / totalExposure) * 100),
            },
            {
                id: "safe",
                label: "180+ Days",
                sublabel: "Safe Inventory (> 6 Months)",
                count: window180PlusCount,
                value: window180PlusVal,
                color: "#10b981",
                bgClass: "bg-emerald-500/10",
                borderClass: "border-emerald-500/30",
                textClass: "text-emerald-500",
                barColorClass: "bg-emerald-500",
                percentage: Math.round((window180PlusVal / totalExposure) * 100),
            },
        ];

        // 5. Apply filters for table items response
        let filteredItems = items;

        if (onlyOnHand) {
            filteredItems = filteredItems.filter((i) => i.on_hand_quantity > 0);
        }

        if (branchParam && branchParam !== "ALL") {
            const bId = Number(branchParam);
            filteredItems = filteredItems.filter((i) => i.branch_id === bId);
        }

        if (statusParam && statusParam !== "ALL") {
            filteredItems = filteredItems.filter((i) => i.expiration_status === statusParam);
        }

        if (productTypeParam && productTypeParam !== "ALL") {
            filteredItems = filteredItems.filter(
                (i) => String(i.product_type_id) === productTypeParam || i.product_type_name === productTypeParam
            );
        }

        // Sort by FEFO (First Expired First Out) by default:
        // Nearest expiration first; null expiry at the end
        filteredItems.sort((a, b) => {
            if (a.expiry_date === null && b.expiry_date === null) return 0;
            if (a.expiry_date === null) return 1;
            if (b.expiry_date === null) return -1;
            return (a.days_remaining ?? 99999) - (b.days_remaining ?? 99999);
        });

        // Unique active good branches (isBadStock = 0 and isActive = 1) for client filters
        const uniqueBranches = Array.from(branchesMap.entries())
            .filter(([, info]) => !info.isBadStock && info.isActive)
            .map(([id, info]) => ({
                id,
                branch_name: info.branch_name,
                branch_code: info.branch_code,
            }));

        const uniqueProductTypes = Array.from(prodTypesMap.entries())
            .filter(([id, name]) => id === 389 || name.toLowerCase().includes("raw") || name.toLowerCase().includes("ingredient"))
            .map(([id, name]) => ({
                id,
                name,
            }));

        return NextResponse.json({
            success: true,
            data: filteredItems,
            kpis,
            timeline,
            branches: uniqueBranches,
            product_types: uniqueProductTypes,
            timestamp: new Date().toISOString(),
        });
    } catch (err: unknown) {
        console.error("[BatchesExpiration] Unexpected API error:", err);
        return NextResponse.json(
            {
                success: false,
                error: err instanceof Error ? err.message : "Internal Server Error",
                data: [],
            },
            { status: 500 }
        );
    }
}
