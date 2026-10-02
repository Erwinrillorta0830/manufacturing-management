import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

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

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());

    const diffTime = expDate.getTime() - today.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

interface RawBranch {
    id: number;
    branch_name?: string;
    branch_code?: string;
    isBadStock: number | boolean | string;
    isActive?: number | boolean | string;
}

interface RawProduct {
    product_id: number;
    product_name: string;
    product_code: string | null;
    description?: string | null;
    cost_per_unit?: number | string | null;
    estimated_unit_cost?: number | string | null;
    price_per_unit?: number | string | null;
    maintaining_quantity: number;
    product_type?: number | { id?: number; name?: string } | null;
    unit_of_measurement: { unit_shortcut: string | null } | null;
}

interface SpringProductOnhand {
    branchId?: number;
    branch_id?: number;
    productId?: number;
    product_id?: number;
    onhandQuantity?: number | string;
    onhand_quantity?: number | string;
}

interface SpringBatchOnhand {
    branchId?: number;
    branch_id?: number;
    productId?: number;
    product_id?: number;
    batchNo?: string;
    batch_no?: string;
    lotId?: number;
    lot_id?: number;
    lotName?: string;
    lot_name?: string;
    unitCost?: number | string;
    unit_cost?: number | string;
    onhandQuantity?: number | string;
    onhand_quantity?: number | string;
    expirationDate?: string;
    expiration_date?: string;
    expiry_date?: string;
}

export interface NearExpiryBatch {
    batch_no: string;
    lot_name: string | null;
    product_id: number;
    product_name: string;
    product_code: string | null;
    product_description: string | null;
    branch_id: number;
    branch_name: string;
    branch_code: string;
    quantity: number;
    unit: string | null;
    unit_cost: number;
    expiration_date: string | null;
    days_remaining: number | null;
    status: "CRITICAL" | "WARNING" | "UPCOMING" | "EXPIRED";
}

export interface LowStockItem {
    product_id: number;
    product_name: string;
    product_code: string | null;
    description: string | null;
    unit: string | null;
    on_hand: number; // Usable unexpired on-hand (FEFO)
    expired_quantity: number;
    total_physical_on_hand: number;
    maintaining_quantity: number;
    near_expiry_batches: NearExpiryBatch[];
}

export async function GET() {
    try {
        if (!SPRING_API_BASE) {
            return NextResponse.json(
                { error: "SPRING_API_BASE_URL is not configured; live inventory cannot be loaded." },
                { status: 503 }
            );
        }

        // 1. Extract Spring Boot auth token from cookies or local token file
        let token: string | undefined;
        try {
            const cookieStore = await cookies();
            token =
                cookieStore.get("vos_access_token")?.value ||
                cookieStore.get("springboot_token")?.value ||
                cookieStore.get("token")?.value;
        } catch {
            // ignore
        }

        if (!token) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const fs = require("fs");
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const path = require("path");
                const tokenFile = path.resolve(process.cwd(), "node_modules/.cache/vos-tokens/latest_token.txt");
                if (fs.existsSync(tokenFile)) {
                    token = fs.readFileSync(tokenFile, "utf8").trim();
                }
            } catch {
                // ignore
            }
        }

        const springHeaders: Record<string, string> = {
            Accept: "application/json",
        };
        if (token) {
            springHeaders["Authorization"] = `Bearer ${token}`;
            springHeaders["Cookie"] = `vos_access_token=${token}`;
        }

        // 2. Fetch Directus metadata & Spring Boot live on-hand in parallel
        const [branchRes, productRes, invLotsRes, lotsRes, prodTypesRes, springProdRes, springBatchRes] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code,isBadStock,isActive`,
                { headers, cache: "no-store" }
            ),
            fetch(
                `${DIRECTUS_URL}/items/products?filter[isActive][_eq]=1&filter[maintaining_quantity][_gt]=0` +
                `&fields=product_id,product_name,product_code,description,cost_per_unit,estimated_unit_cost,price_per_unit,maintaining_quantity,product_type,unit_of_measurement.unit_shortcut&limit=-1`,
                { headers, cache: "no-store" }
            ),
            fetch(
                `${DIRECTUS_URL}/items/mm_inventory_lots?limit=-1&fields=*`,
                { headers, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=*`,
                { headers, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/product_type?limit=-1&fields=id,name`,
                { headers, cache: "no-store" }
            ).catch(() => null),
            fetch(`${SPRING_API_BASE}/api/mm-product-onhand/all`, { headers: springHeaders, cache: "no-store" }).catch(() => null),
            fetch(`${SPRING_API_BASE}/api/mm-batch-onhand/all`, { headers: springHeaders, cache: "no-store" }).catch(() => null),
        ]);

        if (!branchRes.ok) {
            return NextResponse.json(
                { error: "Failed to fetch branches from Directus" },
                { status: branchRes.status }
            );
        }

        if (!productRes.ok) {
            return NextResponse.json(
                { error: "Failed to fetch products from Directus" },
                { status: productRes.status }
            );
        }

        // Graceful handling of unauthenticated or cold Spring Boot session (no hard 401 error throw)
        if (springProdRes && !springProdRes.ok && springProdRes.status === 401) {
            return NextResponse.json({
                items: [],
                expiry_batches: [],
                authenticated: false,
                message: "Awaiting active session for live stock tracking",
            });
        }

        const branchData: RawBranch[] = (await branchRes.json()).data ?? [];
        const branchMap = new Map<number, { branch_name: string; branch_code: string }>();
        const goodBranchIds = new Set<number>();

        for (const b of branchData) {
            const bId = Number(b.id);
            branchMap.set(bId, {
                branch_name: b.branch_name || b.branch_code || `Branch ${bId}`,
                branch_code: b.branch_code || `B${bId}`,
            });
            if (Number(b.isBadStock) === 0 && (b.isActive === undefined || Number(b.isActive) === 1)) {
                goodBranchIds.add(bId);
            }
        }

        if (goodBranchIds.size === 0) {
            return NextResponse.json({ items: [], expiry_batches: [] });
        }

        const productData: RawProduct[] = (await productRes.json()).data ?? [];
        if (productData.length === 0) {
            return NextResponse.json({ items: [], expiry_batches: [] });
        }

        const productById = new Map<number, RawProduct>();
        for (const p of productData) {
            productById.set(p.product_id, p);
        }

        // Build lot name map with flexible id / lot_id resolution
        const lotNameMap = new Map<number, string>();
        if (lotsRes && lotsRes.ok) {
            const lotsJson = await lotsRes.json().catch(() => ({ data: [] }));
            const lotsList: Array<Record<string, unknown>> = lotsJson?.data || [];
            for (const l of lotsList) {
                const rawLotId = l.lot_id ?? l.id;
                let lotId = 0;
                if (typeof rawLotId === "object" && rawLotId !== null) {
                    lotId = Number((rawLotId as { lot_id?: number; id?: number }).lot_id || (rawLotId as { lot_id?: number; id?: number }).id || 0);
                } else if (rawLotId !== null && rawLotId !== undefined) {
                    lotId = Number(rawLotId || 0);
                }
                const name = String(l.lot_name || l.name || "").trim();
                if (lotId > 0 && name) {
                    lotNameMap.set(lotId, name);
                }
            }
        }

        // Build product type map to identify Raw Materials (ID 389, "Raw Material", "Ingredient")
        const prodTypeMap = new Map<number, string>();
        if (prodTypesRes && prodTypesRes.ok) {
            const ptJson = await prodTypesRes.json().catch(() => ({ data: [] }));
            const ptList: Array<{ id: number; name: string }> = ptJson?.data || [];
            for (const pt of ptList) {
                prodTypeMap.set(Number(pt.id), String(pt.name || ""));
            }
        }

        const rawMaterialProductIds = new Set<number>();
        for (const p of productData) {
            let typeId: number | null = null;
            let typeName = "";
            if (typeof p.product_type === "object" && p.product_type !== null) {
                typeId = p.product_type.id ? Number(p.product_type.id) : null;
                typeName = (p.product_type.name || "").toLowerCase();
            } else if (p.product_type !== null && p.product_type !== undefined) {
                typeId = Number(p.product_type);
                typeName = (prodTypeMap.get(typeId) || "").toLowerCase();
            }
            if (typeId === 389 || typeName.includes("raw") || typeName.includes("ingredient")) {
                rawMaterialProductIds.add(p.product_id);
            }
        }

        // 3. Build Batch & Lot Lookup from mm_inventory_lots with multi-tier indexing
        const lotByInvId = new Map<number, { lotId: number; lotName: string; expDate: string | null; unitCost: number }>();
        const lotByBranchProdBatch = new Map<string, { lotId: number; lotName: string; expDate: string | null; unitCost: number }>();
        const lotByProdBatch = new Map<string, { lotId: number; lotName: string; expDate: string | null; unitCost: number }>();
        const lotByBatchOnly = new Map<string, { lotId: number; lotName: string; expDate: string | null; unitCost: number }>();

        if (invLotsRes && invLotsRes.ok) {
            const invLotsData = await invLotsRes.json().catch(() => ({ data: [] }));
            const invLotsList: Array<Record<string, unknown>> = invLotsData?.data || [];

            for (const row of invLotsList) {
                const invId = Number(row.inventory_lot_id || row.id || 0);

                let lotId = 0;
                if (typeof row.lot_id === "object" && row.lot_id !== null) {
                    lotId = Number((row.lot_id as { lot_id?: number; id?: number }).lot_id || (row.lot_id as { lot_id?: number; id?: number }).id || 0);
                } else if (row.lot_id !== null && row.lot_id !== undefined) {
                    lotId = Number(row.lot_id || 0);
                }

                let prodId = 0;
                if (typeof row.product_id === "object" && row.product_id !== null) {
                    prodId = Number((row.product_id as { product_id?: number; id?: number }).product_id || (row.product_id as { product_id?: number; id?: number }).id || 0);
                } else if (row.product_id !== null && row.product_id !== undefined) {
                    prodId = Number(row.product_id || 0);
                }

                let branchId = 0;
                if (typeof row.branch_id === "object" && row.branch_id !== null) {
                    branchId = Number((row.branch_id as { id?: number; branch_id?: number }).id || (row.branch_id as { id?: number; branch_id?: number }).branch_id || 0);
                } else if (row.branch_id !== null && row.branch_id !== undefined) {
                    branchId = Number(row.branch_id || 0);
                }

                const bNo = String(row.batch_no || "").trim().toLowerCase();
                const expDate = row.expiry_date ? String(row.expiry_date).split("T")[0] : null;
                const uCost = Number(row.unit_cost || 0);
                const lotName = lotNameMap.get(lotId) || (lotId > 0 ? `LOT-${lotId}` : "");

                const entry = {
                    lotId,
                    lotName,
                    expDate,
                    unitCost: isNaN(uCost) ? 0 : uCost,
                };

                if (invId > 0) lotByInvId.set(invId, entry);
                if (branchId > 0 && prodId > 0 && bNo) lotByBranchProdBatch.set(`${branchId}_${prodId}_${bNo}`, entry);
                if (prodId > 0 && bNo) lotByProdBatch.set(`${prodId}_${bNo}`, entry);
                if (bNo) lotByBatchOnly.set(bNo, entry);
            }
        }

        // 4. Aggregate Live Product & Batch Stock from Spring Boot
        const totalPhysicalMap = new Map<number, number>();
        const expiredMap = new Map<number, number>();
        const nearExpiryMap = new Map<number, NearExpiryBatch[]>();
        const flatNearExpiryBatches: NearExpiryBatch[] = [];

        // A. Process Spring Batch On-Hand (Authoritative for Batch Expirations)
        if (springBatchRes && springBatchRes.ok) {
            const batchJson = await springBatchRes.json();
            const batchList: SpringBatchOnhand[] = Array.isArray(batchJson) ? batchJson : batchJson?.data || [];
            
            const batchPhysicalSum = new Map<number, number>();

            for (const row of batchList) {
                const pId = Number(row.productId ?? row.product_id ?? 0);
                const bId = Number(row.branchId ?? row.branch_id ?? 0);
                const qty = Number(row.onhandQuantity ?? row.onhand_quantity ?? 0);
                const bNo = String(row.batchNo ?? row.batch_no ?? "").trim();
                const bNoLower = bNo.toLowerCase();
                const invId = Number(row.inventoryLotId || row.inventory_lot_id || 0);
                const rawSpringLotId = Number(row.mmLotId || row.mm_lot_id || row.lotId || row.lot_id || 0);

                if (pId <= 0 || qty <= 0 || !goodBranchIds.has(bId)) continue;

                batchPhysicalSum.set(pId, (batchPhysicalSum.get(pId) || 0) + qty);

                // Multi-tier lookup for batch metadata (lot name, expiration date, unit cost)
                const matchedMeta =
                    (invId > 0 ? lotByInvId.get(invId) : null) ||
                    lotByBranchProdBatch.get(`${bId}_${pId}_${bNoLower}`) ||
                    lotByProdBatch.get(`${pId}_${bNoLower}`) ||
                    lotByBatchOnly.get(bNoLower);

                // Resolve expiration date
                const rawExp = row.expirationDate ?? row.expiration_date ?? row.expiry_date;
                const expDateStr = rawExp
                    ? String(rawExp).split("T")[0]
                    : matchedMeta?.expDate || null;

                const daysRemaining = getDiffDays(expDateStr);

                if (daysRemaining !== null && daysRemaining <= 0) {
                    // Batch is expired -> accumulate expired quantity
                    expiredMap.set(pId, (expiredMap.get(pId) || 0) + qty);
                } else if (daysRemaining !== null && daysRemaining > 0) {
                    // Requirement: If the raw material product batches is 6 months (180 days) before expiry date, show it in modal
                    const isRaw = rawMaterialProductIds.has(pId);
                    if (isRaw && daysRemaining <= 180) {
                        const product = productById.get(pId);
                        const branchInfo = branchMap.get(bId);

                        // Resolve lot name with multiple reliable fallbacks
                        let lotName = String(row.lotName ?? row.lot_name ?? "").trim();
                        if (!lotName && rawSpringLotId > 0) {
                            lotName = lotNameMap.get(rawSpringLotId) || "";
                        }
                        if (!lotName && matchedMeta?.lotName) {
                            lotName = matchedMeta.lotName;
                        }
                        if (!lotName && matchedMeta?.lotId) {
                            lotName = lotNameMap.get(matchedMeta.lotId) || (matchedMeta.lotId > 0 ? `LOT-${matchedMeta.lotId}` : "");
                        }

                        // Resolve unit cost
                        const rawCost =
                            row.unitCost ??
                            row.unit_cost ??
                            matchedMeta?.unitCost ??
                            product?.cost_per_unit ??
                            product?.estimated_unit_cost ??
                            product?.price_per_unit;
                        const unitCost = rawCost !== null && rawCost !== undefined && !isNaN(Number(rawCost))
                            ? Number(rawCost)
                            : 0;

                        // Determine expiration status
                        let status: "CRITICAL" | "WARNING" | "UPCOMING" | "EXPIRED" = "UPCOMING";
                        if (daysRemaining <= 14) {
                            status = "CRITICAL";
                        } else if (daysRemaining <= 30) {
                            status = "WARNING";
                        } else {
                            status = "UPCOMING";
                        }

                        const batchItem: NearExpiryBatch = {
                            batch_no: bNo || "N/A",
                            lot_name: lotName || null,
                            product_id: pId,
                            product_name: product?.product_name || `Product #${pId}`,
                            product_code: product?.product_code || null,
                            product_description: product?.description || null,
                            branch_id: bId,
                            branch_name: branchInfo?.branch_name || `Branch ${bId}`,
                            branch_code: branchInfo?.branch_code || `B${bId}`,
                            quantity: qty,
                            unit: product?.unit_of_measurement?.unit_shortcut || null,
                            unit_cost: unitCost,
                            expiration_date: expDateStr,
                            days_remaining: daysRemaining,
                            status,
                        };

                        const existingList = nearExpiryMap.get(pId) || [];
                        existingList.push(batchItem);
                        nearExpiryMap.set(pId, existingList);
                        flatNearExpiryBatches.push(batchItem);
                    }
                }
            }

            // Populate totalPhysicalMap from batch sum
            for (const [pId, sumQty] of batchPhysicalSum.entries()) {
                totalPhysicalMap.set(pId, sumQty);
            }
        }

        // B. Process Spring Product On-Hand (fills in any product total on-hand if batch list was omitted)
        if (springProdRes && springProdRes.ok) {
            const prodJson = await springProdRes.json();
            const prodList: SpringProductOnhand[] = Array.isArray(prodJson) ? prodJson : prodJson?.data || [];
            for (const row of prodList) {
                const pId = Number(row.productId ?? row.product_id ?? 0);
                const bId = Number(row.branchId ?? row.branch_id ?? 0);
                const qty = Number(row.onhandQuantity ?? row.onhand_quantity ?? 0);
                if (pId > 0 && goodBranchIds.has(bId) && qty > 0) {
                    if (!totalPhysicalMap.has(pId)) {
                        totalPhysicalMap.set(pId, (totalPhysicalMap.get(pId) || 0) + qty);
                    }
                }
            }
        }

        // 5. Evaluate Usable On-Hand (FEFO: Usable = Total - Expired) and Filter
        const lowStockItems: LowStockItem[] = productData
            .map((p): LowStockItem => {
                const totalPhysical = totalPhysicalMap.get(p.product_id) ?? 0;
                const expiredQty = expiredMap.get(p.product_id) ?? 0;
                const usableOnHand = Math.max(0, totalPhysical - expiredQty);
                const maintaining = Number(p.maintaining_quantity);
                const nearExpiry = nearExpiryMap.get(p.product_id) ?? [];

                // Sort near expiry batches with nearest expiry first (FEFO)
                nearExpiry.sort((a, b) => {
                    const daysA = a.days_remaining ?? 999;
                    const daysB = b.days_remaining ?? 999;
                    return daysA - daysB;
                });

                return {
                    product_id: p.product_id,
                    product_name: p.product_name,
                    product_code: p.product_code ?? null,
                    description: p.description || null,
                    unit: p.unit_of_measurement?.unit_shortcut ?? null,
                    on_hand: usableOnHand,
                    expired_quantity: expiredQty,
                    total_physical_on_hand: totalPhysical,
                    maintaining_quantity: maintaining,
                    near_expiry_batches: nearExpiry,
                };
            })
            .filter((item) => item.on_hand <= item.maintaining_quantity || item.near_expiry_batches.length > 0)
            // Sort: Products with lowest stock ratio first (0 on_hand = worst), then by name
            .sort((a, b) => {
                const ratioA = a.maintaining_quantity > 0 ? a.on_hand / a.maintaining_quantity : 0;
                const ratioB = b.maintaining_quantity > 0 ? b.on_hand / b.maintaining_quantity : 0;
                if (ratioA !== ratioB) return ratioA - ratioB;
                return a.product_name.localeCompare(b.product_name);
            });

        // Sort flat near-expiry batches strictly by days remaining ascending (nearest expiry first / FEFO)
        flatNearExpiryBatches.sort((a, b) => {
            const daysA = a.days_remaining ?? 999;
            const daysB = b.days_remaining ?? 999;
            return daysA - daysB;
        });

        return NextResponse.json({
            items: lowStockItems,
            expiry_batches: flatNearExpiryBatches,
        });
    } catch (err) {
        console.error("[low-stock-alert] Error:", err);
        return NextResponse.json(
            { error: "Failed to fetch low-stock data" },
            { status: 500 }
        );
    }
}
