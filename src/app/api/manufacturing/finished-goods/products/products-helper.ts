import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    DirectusProduct,
    DirectusProductCurrencyProfile,
    CostRollupResult,
    CostNode
} from "@/modules/manufacturing-management/finished-goods/types";
import { calculateCostBreakdown, calculateMaterialCost, calculateMarginSummary, calculateOverheadSummary, calculateRouteBreakdown } from "@/modules/manufacturing-management/finished-goods/costing";
import { getActiveVersionForProduct, getBOMDetailsForVersion } from "../versions/versions-helper";

/**
 * Fetches the latest landed unit cost for a raw ingredient based on recent shipment logs.
 */
export async function getLatestLandedCost(
    productId: number,
    forexRate: number = 58.00,
    profilesMap?: Map<number, DirectusProductCurrencyProfile>,
    productsMap?: Map<number, DirectusProduct>
): Promise<number> {
    try {
        let profile: DirectusProductCurrencyProfile | undefined = undefined;
        if (profilesMap) {
            profile = profilesMap.get(productId);
        } else {
            const resProfile = await fetch(`${DIRECTUS_URL}/items/product_currency_profiles?filter[product_id][_eq]=${productId}&limit=1`, { headers, cache: "no-store" });
            if (resProfile.ok) {
                const profileJson = await resProfile.json();
                profile = profileJson.data?.[0];
            }
        }

        if (profile && profile.is_foreign_sourced && profile.purchase_currency === "USD" && profile.purchase_price) {
            return Number(profile.purchase_price) * forexRate;
        }

        const query = encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _eq: productId } },
                { quantity: { _gt: 0 } }
            ]
        }));

        const url = `${DIRECTUS_URL}/items/inventory_movements?filter=${query}&fields=*&sort=-movement_id&limit=1`;
        const res = await fetch(url, { headers, cache: "no-store" });

        if (res.ok) {
            const json = await res.json();
            const latest = json.data?.[0];
            if (latest) {
                return Number(latest.unit_cost || latest.cost_per_unit || 0);
            }
        }

        if (productsMap) {
            const cachedProd = productsMap.get(productId);
            if (cachedProd) {
                return Number(cachedProd.cost_per_unit || cachedProd.price_per_unit || 0);
            }
        }

        const resProd = await fetch(`${DIRECTUS_URL}/items/products/${productId}?fields=price_per_unit,cost_per_unit`, { headers });
        if (resProd.ok) {
            const jsonProd = await resProd.json();
            return Number(jsonProd.data?.cost_per_unit || jsonProd.data?.price_per_unit || 0);
        }
        return 0;
    } catch (e) {
        console.error(`[Manufacturing Directus API] Error fetching landed cost for product ID ${productId}:`, e);
        return 0;
    }
}


/**
 * Fetches all products.
 */
export async function fetchAllProducts(search?: string, limit: number = -1): Promise<DirectusProduct[]> {
    try {
        const explicitFields = "product_id,product_name,product_code,description,short_description,isActive,cost_per_unit,price_per_unit,product_brand,barcode,parent_id,parent_id.product_id,parent_id.product_name,product_category.category_name,unit_of_measurement.unit_id,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,unit_of_measurement_count,product_image,density_factor,product_type";
        let url = `${DIRECTUS_URL}/items/products?limit=${limit}&fields=${explicitFields}`;
        if (search && search.trim()) {
            url += `&search=${encodeURIComponent(search.trim())}`;
        }

        const [prodRes, versionsRes, profilesRes] = await Promise.all([
            fetch(url, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?limit=-1&fields=product_id`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/product_currency_profiles?limit=-1`, { headers, cache: "no-store" })
        ]);

        if (!prodRes.ok) throw new Error(`Directus failed to fetch products: ${prodRes.status}`);
        const prodJson = await prodRes.json();
        const products: DirectusProduct[] = prodJson.data || [];

        const versionProductIds = new Set<number>();
        if (versionsRes.ok) {
            const versionsJson = await versionsRes.json();
            const versions = versionsJson.data || [];
            versions.forEach((v: { product_id: number }) => {
                if (v.product_id) {
                    versionProductIds.add(Number(v.product_id));
                }
            });
        }

        const profiles = profilesRes.ok ? (await profilesRes.json()).data || [] : [];
        const profilesMap = new Map<number, DirectusProductCurrencyProfile>();
        profiles.forEach((p: DirectusProductCurrencyProfile) => {
            profilesMap.set(Number(p.product_id), p);
        });

        products.forEach((p: DirectusProduct) => {
            p.has_versions = versionProductIds.has(Number(p.product_id));
            p.currency_profile = profilesMap.get(Number(p.product_id)) || null;
        });

        products.sort((a: DirectusProduct, b: DirectusProduct) => {
            if (a.has_versions && !b.has_versions) return -1;
            if (!a.has_versions && b.has_versions) return 1;
            return a.product_name.localeCompare(b.product_name);
        });

        return products;
    } catch (error) {
        console.error("[Manufacturing Directus API] Error fetching products:", error);
        return [];
    }
}

/**
 * Calculates rollup costing standards recursively using route-level BOM.
 */
export async function calculateRollupCost(
    productId: number,
    visited: Set<number> = new Set(),
    productsMap?: Map<number, DirectusProduct>,
    forexRate: number = 58.00,
    profilesMap?: Map<number, DirectusProductCurrencyProfile>,
    versionId?: number
): Promise<CostRollupResult> {
    const defaultResult = (pName = "Unknown Product", sku = ""): CostRollupResult => ({
        productId,
        productName: pName,
        sku,
        bomId: null,
        bomVersion: "v1.0",
        materialsCost: 0,
        machineOverheadCost: 0,
        customOverheadCost: 0,
        additionalOperatingOverhead: 0,
        totalOverheadExpenses: 0,
        includedInCogs: 0,
        excludedFromCogs: 0,
        baseQuantity: 1,
        unitCost: 0,
        batchCost: 0,
        preYieldDirectCost: 0,
        yieldAdjustedUnitCost: 0,
        machineHours: 0,
        totalMachineCost: 0,
        routingsCost: 0,
        yieldPercentage: 100,
        yieldFactor: 1,
        totalBaseCost: 0,
        targetSellingPrice: 0,
        grossProfit: 0,
        grossMarginPercent: 0,
        netProfit: 0,
        netMarginPercent: 0,
        marginBasis: "sales",
        costTree: []
    });

    if (visited.has(productId)) {
        console.error(`[Cost Engine] Circular dependency detected on product ID: ${productId}`);
        return defaultResult("Circular Dependency Reference", "ERR-LOOP");
    }
    visited.add(productId);

    if (!productsMap) {
        const allProds = await fetchAllProducts();
        productsMap = new Map(allProds.map(p => [p.product_id, p]));
    }

    const product = productsMap.get(productId);
    if (!product) {
        const resProd = await fetch(`${DIRECTUS_URL}/items/products/${productId}`, { headers });
        if (!resProd.ok) return defaultResult();
        const productJson = await resProd.json();
        const fetchedProduct: DirectusProduct = productJson.data;
        if (!fetchedProduct) return defaultResult();
        productsMap.set(productId, fetchedProduct);
    }

    const currentProduct = productsMap.get(productId)!;
    const { version, routes } = versionId
        ? await getBOMDetailsForVersion(productId, versionId)
        : await getActiveVersionForProduct(productId);
    if (!version) {
        const landedCost = await getLatestLandedCost(productId, forexRate, profilesMap, productsMap);
        const leafBreakdown = calculateCostBreakdown({
            materialsCost: landedCost,
            machineOverheadCost: 0,
            customOverheadCost: 0,
            expectedYieldPercentage: 100,
            baseQuantity: 1
        });
        return {
            ...defaultResult(currentProduct.product_name, currentProduct.product_code),
            ...leafBreakdown,
            ...(() => {
                const overheadSummary = calculateOverheadSummary(leafBreakdown.customOverheadCost);
                return {
                    additionalOperatingOverhead: overheadSummary.additionalOperatingOverhead,
                    totalOverheadExpenses: overheadSummary.totalOverheadExpenses,
                    includedInCogs: overheadSummary.includedInCogs,
                    excludedFromCogs: overheadSummary.excludedFromCogs
                };
            })(),
            routingsCost: 0,
            targetSellingPrice: currentProduct.price_per_unit || 0,
            costTree: [{
                id: `leaf-${productId}`,
                name: currentProduct.product_name,
                type: "ingredient",
                quantity: 1,
                uom: "UOM",
                unitCost: landedCost,
                wastagePercent: 0,
                totalCost: landedCost
            }]
        };
    }

    // Load Work Centers for overhead rate
    const resWC = await fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1`, { headers, cache: "no-store" });
    const workCenters = resWC.ok ? (await resWC.json()).data || [] : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workCentersMap = new Map<number, any>(workCenters.map((wc: any) => [wc.work_center_id, wc]));

    // Load Operations for names
    const resOps = await fetch(`${DIRECTUS_URL}/items/manufacturing_operations?limit=-1`, { headers, cache: "no-store" });
    const operationsList = resOps.ok ? (await resOps.json()).data || [] : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operationsMap = new Map<number, string>(operationsList.map((op: any) => [op.id, op.operation_name]));

    // Load Units for UOM shortcut
    const resUnits = await fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" });
    const unitsList = resUnits.ok ? (await resUnits.json()).data || [] : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unitsMap = new Map<number, string>(unitsList.map((u: any) => [u.unit_id, u.unit_shortcut]));

    let materialsBatchSubtotal = 0;
    let machineOverheadCost = 0;
    let machineHoursSubtotal = 0;
    let totalMachineCostSubtotal = 0;
    const costTreeNodes: CostNode[] = [];

    // Process each route step
    for (const r of routes) {
        const workCenter = r.work_center_id ? workCentersMap.get(r.work_center_id) : null;
        const opName = r.operation_id ? (operationsMap.get(r.operation_id) || `Operation #${r.operation_id}`) : `Operation Step`;

        const routeBreakdown = calculateRouteBreakdown({
            stepBatchSize: r.step_batch_size || 1,
            machineHourlyRate: workCenter?.overhead_cost_per_hour || 0,
            setupTimeHours: r.setup_time_hours,
            runTimeHours: r.run_time_hours,
            baseQuantity: Number(version?.base_quantity) || 1
        });
        machineOverheadCost += routeBreakdown.machineOverheadCost;
        machineHoursSubtotal += routeBreakdown.machineHours;
        totalMachineCostSubtotal += routeBreakdown.totalMachineCost;

        const childrenNodes: CostNode[] = [];

        // Route BOM Items
        if (r.bom_items && r.bom_items.length > 0) {
            for (const bomItem of r.bom_items) {
                let compUnitCost = 0;
                let subChildren: CostNode[] | undefined;

                // Check if sub-assembly (meaning the product has active versions)
                const compProduct = productsMap.get(bomItem.product_id);
                const hasVersions = compProduct ? compProduct.has_versions : false;

                if (hasVersions) {
                    const subResult = await calculateRollupCost(bomItem.product_id, new Set(visited), productsMap, forexRate, profilesMap);
                    compUnitCost = subResult.unitCost;
                    subChildren = subResult.costTree;
                } else if (bomItem.cost_per_unit !== null && bomItem.cost_per_unit !== undefined) {
                    compUnitCost = Number(bomItem.cost_per_unit);
                } else {
                    compUnitCost = await getLatestLandedCost(bomItem.product_id, forexRate, profilesMap, productsMap);
                }

                const lineCost = calculateMaterialCost({
                    quantity: bomItem.quantity_required,
                    unitCost: compUnitCost,
                    wastagePercent: bomItem.wastage_factor_percentage
                });

                materialsBatchSubtotal += lineCost;

                const ingName = compProduct ? compProduct.product_name : `Component #${bomItem.product_id}`;
                const uomName = bomItem.unit_of_measurement
                    ? (typeof bomItem.unit_of_measurement === "number"
                        ? (unitsMap.get(bomItem.unit_of_measurement) || "pc")
                        : String(bomItem.unit_of_measurement))
                    : "pc";

                childrenNodes.push({
                    id: `bom-${bomItem.id}`,
                    name: ingName,
                    type: hasVersions ? "sub_assembly" : "ingredient",
                    quantity: bomItem.quantity_required,
                    uom: uomName,
                    unitCost: compUnitCost,
                    wastagePercent: Number(bomItem.wastage_factor_percentage || 0),
                    totalCost: lineCost,
                    children: subChildren
                });
            }
        }

        // Add Routing node to main tree
        costTreeNodes.push({
            id: `route-${r.route_id}`,
            name: `${opName} (${workCenter ? workCenter.work_center_name : "No Work Center"})`,
            type: "routing",
            quantity: 1,
            uom: "hrs",
            unitCost: routeBreakdown.machineOverheadCost,
            wastagePercent: 0,
            totalCost: routeBreakdown.machineOverheadCost,
            machineRate: workCenter?.overhead_cost_per_hour || 0,
            machineHours: routeBreakdown.machineHours,
            machineCostPerUnit: routeBreakdown.machineOverheadCost,
            stepBatchSize: r.step_batch_size || 1,
            children: childrenNodes.length > 0 ? childrenNodes : undefined
        });
    }

    const baseQuantity = Number(version?.base_quantity) > 0 ? Number(version?.base_quantity) : 1;
    const materialsSubtotal = materialsBatchSubtotal / baseQuantity;

    const breakdown = calculateCostBreakdown({
        materialsCost: materialsSubtotal,
        machineOverheadCost: machineOverheadCost,
        customOverheadCost: version.custom_overhead || 0,
        expectedYieldPercentage: version.expected_yield_percentage,
        baseQuantity,
        machineHours: machineHoursSubtotal,
        totalMachineCost: totalMachineCostSubtotal
    });
    const overheadSummary = calculateOverheadSummary(
        breakdown.customOverheadCost,
        (version.overheads || []).map(overhead => overhead.amount)
    );

    const targetPrice = currentProduct.price_per_unit || 0;
    const margin = calculateMarginSummary(
        targetPrice,
        breakdown.unitCost,
        overheadSummary.excludedFromCogs
    );

    return {
        productId,
        productName: currentProduct.product_name,
        sku: currentProduct.product_code,
        bomId: version.version_id, // map version_id as bomId
        bomVersion: version.version_name,
        ...breakdown,
        additionalOperatingOverhead: overheadSummary.additionalOperatingOverhead,
        totalOverheadExpenses: overheadSummary.totalOverheadExpenses,
        includedInCogs: overheadSummary.includedInCogs,
        excludedFromCogs: overheadSummary.excludedFromCogs,
        totalMachineCost: breakdown.totalMachineCost,
        routingsCost: breakdown.machineOverheadCost,
        targetSellingPrice: targetPrice,
        ...margin,
        costTree: costTreeNodes
    };
}

/**
 * Updates product details.
 */
export interface ProductDetailsUpdateResult {
    ok: boolean;
    status?: number;
    error?: string;
}

export async function updateProductDetails(
    productId: number,
    details: {
        product_name?: string;
        product_code?: string;
        description?: string;
        short_description?: string | null;
        parent_id?: number | null;
        barcode?: string;
        price_per_unit?: number;
        density_factor?: number;
        product_brand?: number;
        product_category?: number;
        cost_per_unit?: number;
        product_class?: number;
        product_segment?: number;
        product_section?: number;
        product_shelf_life?: number;
        unit_of_measurement_count?: number;
        product_image?: string;
        unit_of_measurement?: number | null;
    }
): Promise<ProductDetailsUpdateResult> {
    try {
        const url = `${DIRECTUS_URL}/items/products/${productId}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify(details)
        });
        if (res.ok) return { ok: true };
        return {
            ok: false,
            status: res.status,
            error: await res.text()
        };
    } catch (e) {
        console.error(`[Manufacturing Directus API] Failed updating product details:`, e);
        return {
            ok: false,
            error: e instanceof Error ? e.message : String(e)
        };
    }
}

export interface ProductDetailsVerificationInput {
    productName: string;
    productCode: string;
    parentId: number | null;
    productBrand: number;
    productCategory: number;
    unitOfMeasurement: number;
    unitOfMeasurementCount: number;
    densityFactor: number;
    productShelfLife: number;

}

function directusRelationId(value: unknown, keys: string[]): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            if (record[key] !== undefined && record[key] !== null) {
                const nestedId = Number(record[key]);
                return Number.isFinite(nestedId) ? nestedId : null;
            }
        }
        return null;
    }
    const id = Number(value);
    return Number.isFinite(id) ? id : null;
}

function numbersMatch(actual: unknown, expected: number): boolean {
    const parsed = Number(actual);
    return Number.isFinite(parsed) && Math.abs(parsed - expected) < 0.000001;
}

export async function verifyProductDetails(
    productId: number,
    expected: ProductDetailsVerificationInput
): Promise<{ ok: boolean; error?: string }> {
    try {
        const query = new URLSearchParams({
            fields: "product_id,product_name,product_code,parent_id,product_brand,product_category,unit_of_measurement,unit_of_measurement_count,density_factor,product_shelf_life",
            limit: "1"
        });
        const res = await fetch(`${DIRECTUS_URL}/items/products/${productId}?${query.toString()}`, {
            headers,
            cache: "no-store"
        });
        if (!res.ok) return { ok: false, error: "Product update could not be verified." };

        const saved = (await res.json()).data as Record<string, unknown> | undefined;
        if (!saved) return { ok: false, error: "Product update could not be verified." };

        const parentId = directusRelationId(saved.parent_id, ["product_id", "id"]);
        const productBrand = directusRelationId(saved.product_brand, ["brand_id", "id"]);
        const productCategory = directusRelationId(saved.product_category, ["category_id", "id"]);
        const unitOfMeasurement = directusRelationId(saved.unit_of_measurement, ["unit_id", "id"]);

        const matches =
            String(saved.product_name || "").trim() === expected.productName &&
            String(saved.product_code || "").trim() === expected.productCode &&
            parentId === expected.parentId &&
            productBrand === expected.productBrand &&
            productCategory === expected.productCategory &&
            unitOfMeasurement === expected.unitOfMeasurement &&
            numbersMatch(saved.unit_of_measurement_count, expected.unitOfMeasurementCount) &&
            numbersMatch(saved.density_factor, expected.densityFactor) &&
            numbersMatch(saved.product_shelf_life, expected.productShelfLife);


        return matches
            ? { ok: true }
            : { ok: false, error: "Directus did not persist all requested product details." };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed verifying product details:", e);
        return { ok: false, error: "Product update could not be verified." };
    }
}

/**
 * Gets product overheads.
 */
export async function getProductOverheads(productId: number, versionId: number): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/product_overheads?filter[product_id][_eq]=${productId}&filter[version_id][_eq]=${versionId}&fields=*,overhead_id.*&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        const json = res.ok ? await res.json() : { data: [] };
        let data = json.data || [];

        if (data.length === 0) {
            const latestUrl = `${DIRECTUS_URL}/items/product_overheads?filter[product_id][_eq]=${productId}&sort=-date_created&fields=*,overhead_id.*&limit=100`;
            const resLatest = await fetch(latestUrl, { headers, cache: "no-store" });
            const latestData = resLatest.ok ? (await resLatest.json()).data || [] : [];
            if (latestData.length > 0) {
                const latestVersionId = latestData[0].version_id;
                data = latestData.filter((o: { version_id?: unknown }) => o.version_id === latestVersionId);
            }
        }
        return data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed fetching product overheads:", e);
        return [];
    }
}

/**
 * Syncs product overheads.
 */
export async function syncProductOverheads(
    productId: number,
    versionId: number,
    overheads: { id?: string | number; overheadId: number; amount: number; overheadName?: string }[]
): Promise<boolean> {
    try {
        const validOverheads = overheads.filter(o => {
            const hasOverhead = Number(o.overheadId || 0) !== 0 || String(o.overheadName || "").trim() !== "";
            const hasAmount = Number(o.amount || 0) !== 0;
            return hasOverhead || hasAmount;
        });

        const url = `${DIRECTUS_URL}/items/product_overheads?filter[product_id][_eq]=${productId}&filter[version_id][_eq]=${versionId}&limit=-1`;
        const resGet = await fetch(url, { headers, cache: "no-store" });
        if (!resGet.ok) throw new Error(`Failed to fetch existing product overheads: ${resGet.status}`);
        const existing: { id: number }[] = (await resGet.json()).data || [];
        const uiIds = new Set(validOverheads.map(o => String(o.id)));

        const toDelete = existing.filter(e => !uiIds.has(String(e.id)));
        for (const item of toDelete) {
            const res = await fetch(`${DIRECTUS_URL}/items/product_overheads/${item.id}`, { method: "DELETE", headers });
            if (!res.ok) throw new Error(`Failed to delete product overhead ${item.id}: ${res.status}`);
        }

        for (const item of validOverheads) {
            const payload = {
                product_id: productId,
                version_id: versionId,
                overhead_id: Number(item.overheadId),
                amount: Number(item.amount) || 0
            };
            const isNew = isNaN(Number(item.id)) || Number(item.id) < 0;
            if (isNew) {
                const res = await fetch(`${DIRECTUS_URL}/items/product_overheads`, { method: "POST", headers, body: JSON.stringify(payload) });
                if (!res.ok) throw new Error(`Failed to create product overhead: ${res.status}`);
            } else {
                const res = await fetch(`${DIRECTUS_URL}/items/product_overheads/${item.id}`, { method: "PATCH", headers, body: JSON.stringify(payload) });
                if (!res.ok) throw new Error(`Failed to update product overhead ${item.id}: ${res.status}`);
            }
        }
        return true;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed syncing product overheads:", e);
        return false;
    }
}

export async function updateProductStandardCost(productId: number, standardCost: number): Promise<boolean> {
    try {
        const url = `${DIRECTUS_URL}/items/products/${productId}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ cost_per_unit: standardCost })
        });
        return res.ok;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed standard cost update:", e);
        return false;
    }
}
