import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPRING_API_BASE = process.env.SPRING_API_BASE_URL;

interface RawDirectusProduct {
    product_id: number | string;
    product_name?: string | null;
    product_code?: string | null;
    barcode?: string | null;
    description?: string | null;
    maintaining_quantity?: number | string | null;
    cost_per_unit?: number | string | null;
    price_per_unit?: number | string | null;
    estimated_unit_cost?: number | string | null;
    priceA?: number | string | null;
    product_type?: number | { id?: number; name?: string } | null;
    unit_of_measurement?: {
        unit_id?: number | string;
        unit_name?: string;
        unit_shortcut?: string;
    } | number | string | null;
    product_category?: {
        category_id?: number | string;
        category_name?: string;
    } | number | string | null;
    isActive?: boolean | number;
    status?: string | null;
}

interface RawDirectusBranch {
    id: number | string;
    branch_name: string;
    branch_code?: string | null;
    isActive?: boolean | number;
}

interface RawDirectusCategory {
    category_id: number | string;
    category_name: string;
}

interface SpringProductOnhand {
    branchId?: number | string;
    branch_id?: number | string;
    productId?: number | string;
    product_id?: number | string;
    unitId?: number | string;
    totalQuantityIn?: number | string;
    totalQuantityOut?: number | string;
    onhandQuantity?: number | string;
    onhand_quantity?: number | string;
}

interface SpringBatchOnhand {
    branchId?: number | string;
    branch_id?: number | string;
    productId?: number | string;
    product_id?: number | string;
    inventoryLotId?: number | string | null;
    inventory_lot_id?: number | string | null;
    mmLotId?: number | string | null;
    mm_lot_id?: number | string | null;
    lotId?: number | string | null;
    lot_id?: number | string | null;
    lotName?: string | null;
    lot_name?: string | null;
    batchNo?: string | null;
    batch_no?: string | null;
    manufacturingDate?: string | null;
    manufacturing_date?: string | null;
    expirationDate?: string | null;
    expiration_date?: string | null;
    inventoryCondition?: string | null;
    inventory_condition?: string | null;
    onhandQuantity?: number | string;
    onhand_quantity?: number | string;
    totalQuantityIn?: number | string;
    totalQuantityOut?: number | string;
    firstMovementDate?: string | null;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchFilter = searchParams.get("branch_id");
        const categoryFilter = searchParams.get("category_id");
        const productTypeFilter = searchParams.get("product_type") || searchParams.get("productType") || searchParams.get("product_type_id") || searchParams.get("productTypeId");
        const statusFilter = searchParams.get("status"); // "below_maintaining" | "out_of_stock" | "low_stock" | "all"
        const searchQuery = (searchParams.get("search") || "").trim().toLowerCase();

        // 1. Resolve Authorization token for Spring Boot
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

        const springReqHeaders: Record<string, string> = {
            Accept: "application/json",
        };
        if (token) {
            springReqHeaders["Authorization"] = `Bearer ${token}`;
            springReqHeaders["Cookie"] = `vos_access_token=${token}`;
        }

        // 2. Fetch Directus metadata in parallel (including mm_lots, mm_inventory_lots, and product_type)
        const timestamp = Date.now();
        const [productsRes, categoriesRes, branchesRes, mmLotsRes, invLotsRes, productTypesRes] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,barcode,description,maintaining_quantity,cost_per_unit,price_per_unit,estimated_unit_cost,priceA,product_type,product_type.id,product_type.name,unit_of_measurement.unit_id,unit_of_measurement.unit_name,unit_of_measurement.unit_shortcut,product_category.category_id,product_category.category_name,isActive,status&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ),
            fetch(
                `${DIRECTUS_URL}/items/categories?limit=-1&fields=category_id,category_name&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&fields=id,branch_name,branch_code,isActive&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=lot_id,lot_name,branch_id,status&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/mm_inventory_lots?limit=-1&fields=id,inventory_lot_id,lot_id,product_id,batch_no,branch_id&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/product_type?limit=-1&fields=id,name&_t=${timestamp}`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
        ]);

        if (!productsRes.ok) {
            const errBody = await productsRes.text().catch(() => "");
            return NextResponse.json(
                { error: `Directus failed to fetch products: ${productsRes.status} ${errBody}` },
                { status: productsRes.status }
            );
        }

        const productsJson = await productsRes.json();
        const rawProducts: RawDirectusProduct[] = productsJson.data || [];

        const categoriesJson = categoriesRes && categoriesRes.ok ? await categoriesRes.json() : { data: [] };
        const rawCategories: RawDirectusCategory[] = categoriesJson.data || [];

        const branchesJson = branchesRes && branchesRes.ok ? await branchesRes.json() : { data: [] };
        const rawBranches: RawDirectusBranch[] = (branchesJson.data || []).filter((b: RawDirectusBranch) => {
            return b.isActive === 1 || b.isActive === true || String(b.isActive) === "1";
        });

        // Parse product_type
        const productTypesJson = productTypesRes && productTypesRes.ok ? await productTypesRes.json() : { data: [] };
        const rawProductTypes: Array<{ id: number | string; name: string }> = productTypesJson.data || [];
        const productTypeMap = new Map<number, string>();
        rawProductTypes.forEach((pt) => {
            const id = Number(pt.id);
            if (id > 0) {
                productTypeMap.set(id, String(pt.name || "").trim());
            }
        });
        if (!productTypeMap.has(388)) productTypeMap.set(388, "Finished Goods");
        if (!productTypeMap.has(389)) productTypeMap.set(389, "Raw Materials");
        if (!productTypeMap.has(390)) productTypeMap.set(390, "Packaging Items");

        // Parse mm_lots (with fallback to 'lots')
        const rawMmLots: Array<{
            lot_id?: number | string;
            id?: number | string;
            lot_name?: string;
            branch_id?: number | string;
        }> =
            mmLotsRes && mmLotsRes.ok
                ? (await mmLotsRes.json()).data || []
                : [];

        const mmLotMap = new Map<number, { lot_id: number; lot_name: string; branch_id: number }>();
        rawMmLots.forEach((l) => {
            const lotId = Number(l.lot_id || l.id);
            if (lotId > 0) {
                mmLotMap.set(lotId, {
                    lot_id: lotId,
                    lot_name: String(l.lot_name || `Lot #${lotId}`).trim(),
                    branch_id: Number(l.branch_id || 0),
                });
            }
        });

        // Parse mm_inventory_lots to link batches and inventory lots to lot_id
        const invLotsJson = invLotsRes && invLotsRes.ok ? await invLotsRes.json() : { data: [] };
        const rawInvLots: Array<{
            id?: number | string;
            inventory_lot_id?: number | string;
            lot_id?: number | string | { lot_id?: number | string; id?: number | string };
            product_id?: number | string | { product_id?: number | string; id?: number | string };
            batch_no?: string;
            branch_id?: number | string;
        }> = invLotsJson.data || [];

        const invLotToLotIdMap = new Map<number, number>();
        const batchKeyToLotMap = new Map<string, { lot_id: number; lot_name: string }>();

        rawInvLots.forEach((il) => {
            const invId = Number(il.inventory_lot_id || il.id || 0);
            let targetLotId = 0;
            if (typeof il.lot_id === "object" && il.lot_id !== null) {
                targetLotId = Number(il.lot_id.lot_id || il.lot_id.id || 0);
            } else if (il.lot_id) {
                targetLotId = Number(il.lot_id);
            }

            if (invId > 0 && targetLotId > 0) {
                invLotToLotIdMap.set(invId, targetLotId);
            }

            let pId = 0;
            if (typeof il.product_id === "object" && il.product_id !== null) {
                pId = Number(il.product_id.product_id || il.product_id.id || 0);
            } else if (il.product_id) {
                pId = Number(il.product_id);
            }

            const bNo = String(il.batch_no || "").trim().toLowerCase();
            if (targetLotId > 0 && mmLotMap.has(targetLotId)) {
                const lotObj = mmLotMap.get(targetLotId)!;
                if (pId > 0 && bNo) {
                    batchKeyToLotMap.set(`${pId}_${bNo}`, { lot_id: targetLotId, lot_name: lotObj.lot_name });
                }
                if (bNo && !batchKeyToLotMap.has(bNo)) {
                    batchKeyToLotMap.set(bNo, { lot_id: targetLotId, lot_name: lotObj.lot_name });
                }
            }
        });

        // 3. Fetch Live On-Hand from Spring Boot
        let productOnhandList: SpringProductOnhand[] = [];
        let batchOnhandList: SpringBatchOnhand[] = [];

        if (SPRING_API_BASE) {
            const productOnhandUrl = branchFilter && Number(branchFilter) > 0
                ? `${SPRING_API_BASE}/api/mm-product-onhand/filter?branch=${branchFilter}`
                : `${SPRING_API_BASE}/api/mm-product-onhand/all`;

            const batchOnhandUrl = branchFilter && Number(branchFilter) > 0
                ? `${SPRING_API_BASE}/api/mm-batch-onhand/filter?branch=${branchFilter}`
                : `${SPRING_API_BASE}/api/mm-batch-onhand/all`;

            const [springProdRes, springBatchRes] = await Promise.all([
                fetch(productOnhandUrl, { headers: springReqHeaders, cache: "no-store" }).catch(() => null),
                fetch(batchOnhandUrl, { headers: springReqHeaders, cache: "no-store" }).catch(() => null),
            ]);

            if (springProdRes && springProdRes.ok) {
                const prodData = await springProdRes.json();
                productOnhandList = Array.isArray(prodData) ? prodData : prodData?.data || [];
            }

            if (springBatchRes && springBatchRes.ok) {
                const batchData = await springBatchRes.json();
                batchOnhandList = Array.isArray(batchData) ? batchData : batchData?.data || [];
            }
        }

        // 4. Map Product On-Hand by Active Branch (Option A: Branch-Aware Deficits)
        // Spring Boot's v_mm_product_onhand view already has: WHERE (b.onhand_quantity > 0)
        // Strictly filter to active branches only
        const branchLookupMap = new Map<number, string>();
        rawBranches.forEach((br) => branchLookupMap.set(Number(br.id), br.branch_name));

        const activeBranchIds = new Set<number>(rawBranches.map((b) => Number(b.id)));
        const targetBranches = (branchFilter && Number(branchFilter) > 0)
            ? rawBranches.filter((b) => Number(b.id) === Number(branchFilter))
            : rawBranches;

        const productBranchOnhandMap = new Map<number, Map<number, number>>();
        const productTotalOnhandMap = new Map<number, number>();

        productOnhandList.forEach((row) => {
            const pId = Number(row.productId ?? row.product_id ?? 0);
            const bId = Number(row.branchId ?? row.branch_id ?? 0);
            const qty = Number(row.onhandQuantity ?? row.onhand_quantity ?? 0);

            if (pId <= 0 || qty <= 0) return;
            // Strict: Do not count inactive branches
            if (!activeBranchIds.has(bId)) return;

            if (branchFilter && Number(branchFilter) > 0) {
                if (bId === Number(branchFilter)) {
                    if (!productBranchOnhandMap.has(pId)) productBranchOnhandMap.set(pId, new Map());
                    productBranchOnhandMap.get(pId)!.set(bId, (productBranchOnhandMap.get(pId)!.get(bId) || 0) + qty);
                    productTotalOnhandMap.set(pId, (productTotalOnhandMap.get(pId) || 0) + qty);
                }
            } else {
                if (!productBranchOnhandMap.has(pId)) productBranchOnhandMap.set(pId, new Map());
                productBranchOnhandMap.get(pId)!.set(bId, (productBranchOnhandMap.get(pId)!.get(bId) || 0) + qty);
                productTotalOnhandMap.set(pId, (productTotalOnhandMap.get(pId) || 0) + qty);
            }
        });

        // 5. Map Active Batches per Product with Authoritative Lot Resolution
        // Also capture negative batches separately for warning indicators
        interface EnrichedBatchDetail {
            batchNo: string;
            lotId: number | null;
            lotName: string;
            branchId: number;
            branchName: string;
            onhandQuantity: number;
            manufacturingDate: string | null;
            expirationDate: string | null;
            inventoryCondition: string;
            isNegativeDiscrepancy: boolean;
            isExpired?: boolean;
        }

        const batchesByProductMap = new Map<number, EnrichedBatchDetail[]>();

        batchOnhandList.forEach((b) => {
            const pId = Number(b.productId ?? b.product_id ?? 0);
            const bId = Number(b.branchId ?? b.branch_id ?? 0);
            const qty = Number(b.onhandQuantity ?? b.onhand_quantity ?? 0);

            if (pId <= 0) return;
            // Strict: Do not count inactive branches
            if (!activeBranchIds.has(bId)) return;
            if (branchFilter && Number(branchFilter) > 0 && bId !== Number(branchFilter)) return;

            const batchNo = String(b.batchNo ?? b.batch_no ?? "").trim() || "N/A";
            const batchNoLower = batchNo.toLowerCase();
            const rawLotId = b.mmLotId ?? b.mm_lot_id ?? b.lotId ?? b.lot_id;
            const rawInvLotId = b.inventoryLotId ?? b.inventory_lot_id;

            // Multi-tiered Lot Name Lookup
            let resolvedLotId: number | null = null;
            let resolvedLotName: string | null = null;

            // 1. Direct match in mm_lots by rawLotId
            if (rawLotId && Number(rawLotId) > 0) {
                const parsedLotId = Number(rawLotId);
                if (mmLotMap.has(parsedLotId)) {
                    resolvedLotId = parsedLotId;
                    resolvedLotName = mmLotMap.get(parsedLotId)!.lot_name;
                }
            }

            // 2. Check if rawLotId was an inventory_lot_id
            if (!resolvedLotName && rawLotId && Number(rawLotId) > 0) {
                const targetLot = invLotToLotIdMap.get(Number(rawLotId));
                if (targetLot && mmLotMap.has(targetLot)) {
                    resolvedLotId = targetLot;
                    resolvedLotName = mmLotMap.get(targetLot)!.lot_name;
                }
            }

            // 3. Match by rawInvLotId in mm_inventory_lots -> mm_lots
            if (!resolvedLotName && rawInvLotId && Number(rawInvLotId) > 0) {
                const targetLot = invLotToLotIdMap.get(Number(rawInvLotId));
                if (targetLot && mmLotMap.has(targetLot)) {
                    resolvedLotId = targetLot;
                    resolvedLotName = mmLotMap.get(targetLot)!.lot_name;
                }
            }

            // 4. Match by (productId, batchNo) or batchNo
            if (!resolvedLotName && pId > 0 && batchNoLower) {
                const matchByProdBatch = batchKeyToLotMap.get(`${pId}_${batchNoLower}`);
                if (matchByProdBatch) {
                    resolvedLotId = matchByProdBatch.lot_id;
                    resolvedLotName = matchByProdBatch.lot_name;
                }
            }

            if (!resolvedLotName && batchNoLower) {
                const matchByBatch = batchKeyToLotMap.get(batchNoLower);
                if (matchByBatch) {
                    resolvedLotId = matchByBatch.lot_id;
                    resolvedLotName = matchByBatch.lot_name;
                }
            }

            // 5. Check if Spring Boot supplied a custom non-generic lotName
            if (!resolvedLotName && (b.lotName || b.lot_name)) {
                const nameCandidate = String(b.lotName || b.lot_name).trim();
                if (nameCandidate && !nameCandidate.startsWith("Lot #")) {
                    resolvedLotName = nameCandidate;
                }
            }

            // 6. Clean fallback
            if (!resolvedLotName) {
                const fallbackId = resolvedLotId || (rawLotId ? Number(rawLotId) : null);
                resolvedLotName = fallbackId ? `Lot #${fallbackId}` : "Unassigned / Pending Storage Rack";
                if (!resolvedLotId && fallbackId) {
                    resolvedLotId = fallbackId;
                }
            }

            const condition = String(b.inventoryCondition ?? b.inventory_condition ?? "GOOD").trim();
            const mfgDate = b.manufacturingDate ?? b.manufacturing_date ? String(b.manufacturingDate ?? b.manufacturing_date).slice(0, 10) : null;
            const expDate = b.expirationDate ?? b.expiration_date ? String(b.expirationDate ?? b.expiration_date).slice(0, 10) : null;

            const isNegative = qty <= 0;

            const detail: EnrichedBatchDetail = {
                batchNo,
                lotId: resolvedLotId,
                lotName: resolvedLotName,
                branchId: bId,
                branchName: branchLookupMap.get(bId) || `Branch #${bId}`,
                onhandQuantity: qty,
                manufacturingDate: mfgDate,
                expirationDate: expDate,
                inventoryCondition: condition,
                isNegativeDiscrepancy: isNegative,
            };

            const existing = batchesByProductMap.get(pId) || [];
            existing.push(detail);
            batchesByProductMap.set(pId, existing);
        });

        // 6. Enrich Products with Status, Deficit, and Sequencing
        const todayStr = new Date().toISOString().slice(0, 10);

        const enrichedProducts = rawProducts
            .filter((p) => {
                const pId = Number(p.product_id);
                const isDeleted = String(p.status).toLowerCase() === "deleted";
                if (isDeleted) return false;

                const activeVal = p.isActive;
                const isActive = activeVal === 1 || activeVal === true || String(activeVal) === "1";

                // Include active products, OR any product that currently holds live onhand inventory or batches
                const hasLiveOnHand = (productTotalOnhandMap.get(pId) || 0) > 0;
                const hasBatches = batchesByProductMap.has(pId);

                return isActive || hasLiveOnHand || hasBatches;
            })
            .map((p) => {
                const productId = Number(p.product_id);
                const productName = String(p.product_name || p.description || `Product #${productId}`).trim();
                const productCode = String(p.product_code || p.barcode || `SKU-${productId}`).trim();
                const maintainingQty = Math.max(0, Number(p.maintaining_quantity || 0));
                const unitCost = Number(p.cost_per_unit ?? p.price_per_unit ?? p.estimated_unit_cost ?? p.priceA ?? 0);

                // UOM mapping
                let uomName = "Units";
                let uomShortcut = "PCS";
                let uomId: number | null = null;
                if (p.unit_of_measurement && typeof p.unit_of_measurement === "object") {
                    uomName = p.unit_of_measurement.unit_name || uomName;
                    uomShortcut = p.unit_of_measurement.unit_shortcut || p.unit_of_measurement.unit_name || uomShortcut;
                    uomId = p.unit_of_measurement.unit_id ? Number(p.unit_of_measurement.unit_id) : null;
                } else if (p.unit_of_measurement) {
                    uomId = Number(p.unit_of_measurement);
                }

                // Category mapping
                let categoryId: number | null = null;
                let categoryName = "Uncategorized";
                if (p.product_category && typeof p.product_category === "object") {
                    categoryId = p.product_category.category_id ? Number(p.product_category.category_id) : null;
                    categoryName = p.product_category.category_name || categoryName;
                } else if (p.product_category) {
                    categoryId = Number(p.product_category);
                    const matchedCat = rawCategories.find((c) => Number(c.category_id) === categoryId);
                    if (matchedCat) categoryName = matchedCat.category_name;
                }

                // Product type
                const rawType = p.product_type;
                let productTypeId: number | null = null;
                let productTypeName = "Unspecified";

                if (rawType && typeof rawType === "object") {
                    productTypeId = rawType.id ? Number(rawType.id) : null;
                    productTypeName = rawType.name || (productTypeId ? productTypeMap.get(productTypeId) : null) || productTypeName;
                } else if (rawType !== null && rawType !== undefined) {
                    productTypeId = Number(rawType);
                    productTypeName = productTypeMap.get(productTypeId) || productTypeName;
                }

                // Packaging Materials (productTypeId === 390) do not expire
                const isPackaging = productTypeId === 390;

                // Identify expired batches and calculate expired totals
                const rawProductBatches = batchesByProductMap.get(productId) || [];
                let productExpiredOnHand = 0;
                const expiredByBranch = new Map<number, number>();

                const enrichedBatches = rawProductBatches.map((b) => {
                    const isExpired = !isPackaging && Boolean(b.expirationDate && b.expirationDate <= todayStr);
                    if (isExpired && b.onhandQuantity > 0) {
                        productExpiredOnHand += b.onhandQuantity;
                        expiredByBranch.set(b.branchId, (expiredByBranch.get(b.branchId) || 0) + b.onhandQuantity);
                    }
                    return {
                        ...b,
                        isExpired,
                    };
                });

                const branchOnHandMap = productBranchOnhandMap.get(productId) || new Map<number, number>();
                let productTotalOnHand = 0;

                const branchStock = targetBranches.map((br) => {
                    const brId = Number(br.id);
                    const brOnHand = branchOnHandMap.get(brId) || 0;
                    const brExpired = expiredByBranch.get(brId) || 0;
                    const brUsable = Math.max(0, brOnHand - brExpired);
                    productTotalOnHand += brOnHand;

                    return {
                        branchId: brId,
                        branchName: br.branch_name,
                        branchCode: br.branch_code || "",
                        onhandQuantity: brUsable,
                        expiredQuantity: brExpired,
                        maintainingQuantity: maintainingQty,
                        deficitQuantity: 0,
                        isBelowMaintaining: false,
                        isOutOfStock: brUsable === 0,
                    };
                });

                // Product-level safety stock and deficit evaluation strictly based on USABLE unexpired stock
                const totalPhysicalOnHand = productTotalOnHand;
                const usableOnHand = Math.max(0, totalPhysicalOnHand - productExpiredOnHand);
                const onHand = usableOnHand;
                const deficit = maintainingQty > 0 ? Math.max(0, maintainingQty - onHand) : 0;
                const isBelowMaintaining = maintainingQty > 0 && onHand <= maintainingQty;

                let stockStatus: "out_of_stock" | "low_stock" | "healthy" | "zero_threshold";
                if (maintainingQty === 0) {
                    stockStatus = "zero_threshold";
                } else if (onHand === 0) {
                    stockStatus = "out_of_stock";
                } else if (onHand <= maintainingQty) {
                    stockStatus = "low_stock";
                } else {
                    stockStatus = "healthy";
                }

                const estimatedReplenishmentCost = deficit * (unitCost > 0 ? unitCost : 0);

                // Packaging Materials (productTypeId === 390): FIFO by first movement or mfgDate
                // Finished Goods (388) & Raw Materials / Ingredients: FEFO by expirationDate
                const sortedBatches = [...enrichedBatches].sort((a, b) => {
                    // 1. Put negative discrepancies at the very end
                    if (a.isNegativeDiscrepancy !== b.isNegativeDiscrepancy) {
                        return a.isNegativeDiscrepancy ? 1 : -1;
                    }

                    // 2. Put expired batches AFTER valid unexpired batches so Next FEFO never picks expired stock
                    if (a.isExpired !== b.isExpired) {
                        return a.isExpired ? 1 : -1;
                    }

                    if (isPackaging) {
                        // FIFO (Packaging)
                        const dateA = a.manufacturingDate || "9999-12-31";
                        const dateB = b.manufacturingDate || "9999-12-31";
                        return dateA.localeCompare(dateB);
                    } else {
                        // FEFO (Raw Materials / Ingredients & Finished Goods)
                        const expA = a.expirationDate || "9999-12-31";
                        const expB = b.expirationDate || "9999-12-31";
                        return expA.localeCompare(expB);
                    }
                });

                return {
                    productId,
                    productName,
                    productCode,
                    productTypeId,
                    productTypeName,
                    categoryId,
                    categoryName,
                    uomId,
                    uomName,
                    uomShortcut,
                    unitCost,
                    maintainingQuantity: maintainingQty,
                    onHandQuantity: onHand,
                    expiredQuantity: productExpiredOnHand,
                    totalPhysicalOnHand,
                    deficitQuantity: deficit,
                    isBelowMaintaining,
                    stockStatus,
                    estimatedReplenishmentCost,
                    batches: sortedBatches,
                    branchStock,
                };
            });

        // 7. Calculate Aggregated Metrics across all qualifying products
        let belowMaintainingCount = 0;
        let outOfStockCount = 0;
        let lowStockCount = 0;
        let totalDeficitQuantity = 0;
        let totalReplenishmentCost = 0;

        enrichedProducts.forEach((item) => {
            if (item.maintainingQuantity > 0) {
                if (item.isBelowMaintaining) {
                    belowMaintainingCount += 1;
                    totalDeficitQuantity += item.deficitQuantity;
                    totalReplenishmentCost += item.estimatedReplenishmentCost;
                }
                if (item.stockStatus === "out_of_stock") {
                    outOfStockCount += 1;
                } else if (item.stockStatus === "low_stock") {
                    lowStockCount += 1;
                }
            }
        });

        // 8. Apply Filtering
        let filteredProducts = enrichedProducts;

        // Category filter
        if (categoryFilter && Number(categoryFilter) > 0) {
            const catId = Number(categoryFilter);
            filteredProducts = filteredProducts.filter((p) => p.categoryId === catId);
        }

        // Product type filter
        if (productTypeFilter && Number(productTypeFilter) > 0) {
            const typeId = Number(productTypeFilter);
            filteredProducts = filteredProducts.filter((p) => p.productTypeId === typeId);
        }

        // Status filter:
        // Default (or "below_maintaining"): shows strictly items where maintaining_quantity > 0 and onHand <= maintainingQuantity
        if (!statusFilter || statusFilter === "below_maintaining") {
            filteredProducts = filteredProducts.filter((p) => p.isBelowMaintaining && p.maintainingQuantity > 0);
        } else if (statusFilter === "out_of_stock") {
            filteredProducts = filteredProducts.filter((p) => p.stockStatus === "out_of_stock");
        } else if (statusFilter === "low_stock") {
            filteredProducts = filteredProducts.filter((p) => p.stockStatus === "low_stock");
        } else if (statusFilter === "healthy") {
            filteredProducts = filteredProducts.filter((p) => p.stockStatus === "healthy");
        } else if (statusFilter === "zero_threshold") {
            filteredProducts = filteredProducts.filter((p) => p.stockStatus === "zero_threshold");
        }
        // If statusFilter === "all", no filter applied

        // Search query filter (SKU, product name, category, product ID, batch number, or lot name)
        if (searchQuery) {
            filteredProducts = filteredProducts.filter((p) =>
                p.productName.toLowerCase().includes(searchQuery) ||
                p.productCode.toLowerCase().includes(searchQuery) ||
                p.categoryName.toLowerCase().includes(searchQuery) ||
                String(p.productId).includes(searchQuery) ||
                p.batches.some(
                    (b) =>
                        b.batchNo.toLowerCase().includes(searchQuery) ||
                        b.lotName.toLowerCase().includes(searchQuery)
                )
            );
        }

        return NextResponse.json({
            success: true,
            summary: {
                totalProducts: enrichedProducts.length,
                belowMaintainingCount,
                outOfStockCount,
                lowStockCount,
                totalDeficitQuantity,
                totalReplenishmentCost,
            },
            filters: {
                branchId: branchFilter ? Number(branchFilter) : null,
                categoryId: categoryFilter ? Number(categoryFilter) : null,
                productTypeId: productTypeFilter ? Number(productTypeFilter) : null,
                status: statusFilter || "below_maintaining",
                search: searchQuery,
            },
            categories: rawCategories.map((c) => ({
                id: Number(c.category_id),
                name: c.category_name,
            })),
            branches: rawBranches.map((b) => ({
                id: Number(b.id),
                name: b.branch_name,
                code: b.branch_code || "",
            })),
            productTypes: Array.from(productTypeMap.entries()).map(([id, name]) => ({
                id,
                name,
            })),
            data: filteredProducts,
        });
    } catch (error) {
        console.error("[InventoryReports API] Unhandled exception:", error);
        return NextResponse.json(
            { error: (error as Error).message || "Internal server error loading inventory reports" },
            { status: 500 }
        );
    }
}
