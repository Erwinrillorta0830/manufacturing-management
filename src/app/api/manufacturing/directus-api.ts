// VOS ERP - Directus API Helper (BFF Server-Side Only)
// Located inside src/app/api/manufacturing/ to ensure the modules/ folder has zero direct Directus imports.

import { calculateCostBreakdown, calculateMaterialCost, calculateMarginSummary, calculateOverheadSummary, calculateRouteBreakdown } from "@/modules/manufacturing-management/finished-goods/costing";

export const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
export const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN !== undefined ? process.env.DIRECTUS_STATIC_TOKEN : "test";

export const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_TOKEN}`;
}

// Data Interfaces
export interface DirectusProductCurrencyProfile {
    id: number;
    product_id: number;
    is_foreign_sourced: boolean;
    purchase_currency: "PHP" | "USD";
    purchase_price: number | null;
}

export interface DirectusProduct {
    product_id: number;
    product_name: string;
    product_code: string;
    description: string;
    short_description?: string | null;
    unit_of_measurement: { unit_id: number; unit_name: string; unit_shortcut: string } | null;
    cost_per_unit: number;
    price_per_unit: number;
    barcode?: string | null;
    parent_id?: number | null;
    density_factor?: number | null;
    has_versions?: boolean;
    currency_profile?: DirectusProductCurrencyProfile | null;
}

export interface DirectusBOM {
    bom_id: number;
    product_id: number;
    bom_name: string;
    base_quantity: number;
    expected_yield_percentage: number;
    is_active: boolean;
    version: { id: number; version_name: string; created_at?: string; custom_overhead?: number | null } | number | null;
    custom_overhead?: number | null;
    valid_from?: string;
    valid_to?: string;
}

export interface DirectusUnit {
    unit_id: number;
    unit_name: string;
    unit_shortcut: string;
}

export interface DirectusBOMComponent {
    component_id: number;
    bom_id: number;
    component_product_id: number;
    quantity_required: number;
    unit_of_measurement: { unit_id: number; unit_name: string; unit_shortcut: string } | null;
    wastage_factor_percentage: number;
    component_type: "raw_material" | "sub_assembly" | "by_product";
    landed_cost?: number | null;
}

export interface DirectusOperation {
    id: number;
    operation_name: string;
}

export interface DirectusRouting {
    routing_id: number;
    bom_id: number;
    operation_name: string;
    operation_id?: number | null;
    step_batch_size?: number;
    estimated_overhead_cost: number;
    duration_hours: number;
    sequence_order: number;
}

export interface DirectusBOMComponentInput {
    id?: string | number;
    productId: number;
    quantity: number;
    uom?: string | null;
    uomId?: number | null;
    wastagePercent: number;
    type?: "raw_material" | "sub_assembly" | "by_product" | null;
    landedCost?: number | null;
}

export interface DirectusRoutingStepInput {
    id?: string | number;
    sequence: number;
    name: string;
    operationId?: number | null;
    stepBatchSize?: number;
    machineHourlyRate: number;
    durationHours: number;
}

export interface CostRollupResult {
    productId: number;
    productName: string;
    sku: string;
    bomId: number | null;
    bomVersion: string | number;
    materialsCost: number;
    stepBatchSize?: number;
    machineOverheadCost: number;
    customOverheadCost: number;
    additionalOperatingOverhead: number;
    totalOverheadExpenses: number;
    includedInCogs: number;
    excludedFromCogs: number;
    preYieldDirectCost: number;
    routingsCost: number;
    yieldPercentage: number;
    yieldFactor: number;
    totalBaseCost: number;
    targetSellingPrice: number;
    grossProfit: number;
    grossMarginPercent: number;
    netProfit: number;
    netMarginPercent: number;
    marginBasis: "sales";
    costTree: CostNode[];
}

export interface CostNode {
    id: string;
    name: string;
    type: "ingredient" | "by_product" | "routing" | "sub_assembly";
    quantity: number;
    uom: string;
    unitCost: number;
    wastagePercent: number;
    totalCost: number;
    stepBatchSize?: number;
    machineRate?: number;
    machineHours?: number;
    children?: CostNode[];
}

export interface DirectusProductVersion {
    id: number;
    product_id: number;
    version_name: string;
}

/**
 * 1. Fetches all products registered in the database.
 */
export async function fetchAllProducts(search?: string, limit: number = -1): Promise<DirectusProduct[]> {
    try {
        const explicitFields = "product_id,product_name,product_code,description,isActive,cost_per_unit,price_per_unit,product_brand,barcode,parent_id.product_id,parent_id.product_name,product_category.category_name,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,unit_of_measurement_count,product_image,density_factor,weight,weight_unit_id,product_type";
        let url = `${DIRECTUS_URL}/items/products?limit=${limit}&fields=${explicitFields}`;
        if (search && search.trim()) {
            url += `&search=${encodeURIComponent(search.trim())}`;
        }
        
        const [prodRes, versionsRes, profilesRes] = await Promise.all([
            fetch(url, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_product_version?limit=-1&fields=product_id`, { headers, cache: "no-store" }),
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
 * 1b. Fetches all unit definitions registered in the database.
 */
export async function fetchAllUnits(): Promise<DirectusUnit[]> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, next: { revalidate: 60 } });
        if (!res.ok) throw new Error(`Directus failed to fetch units: ${res.status}`);
        const json = await res.json();
        return json.data || [];
    } catch (error) {
        console.error("[Manufacturing Directus API] Error fetching units:", error);
        return [];
    }
}

/**
 * 2. Fetches the latest landed unit cost for a raw ingredient based on recent shipment logs.
 */
export async function getLatestLandedCost(productId: number, forexRate: number = 58.00): Promise<number> {
    try {
        const resProfile = await fetch(`${DIRECTUS_URL}/items/product_currency_profiles?filter[product_id][_eq]=${productId}&limit=1`, { headers, cache: "no-store" });
        if (resProfile.ok) {
            const profileJson = await resProfile.json();
            const profile = profileJson.data?.[0];
            if (profile && profile.is_foreign_sourced && profile.purchase_currency === "USD" && profile.purchase_price) {
                return Number(profile.purchase_price) * forexRate;
            }
        }

        const query = encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _eq: productId } },
                { shipment_id: { status: { _in: ["Received", "Receiving (QA)"] } } }
            ]
        }));
        
        const url = `${DIRECTUS_URL}/items/shipment_line_items?filter=${query}&fields=*,shipment_id.date_received&sort=-shipment_id.date_received&limit=1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        
        if (res.ok) {
            const json = await res.json();
            const latest = json.data?.[0];
            if (latest && latest.final_landed_unit_cost) {
                return Number(latest.final_landed_unit_cost);
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
 * 3. Crawls active BOM, routing steps, and components for a product.
 */
export async function getActiveBOMForProduct(productId: number): Promise<{
    bom: DirectusBOM | null;
    components: DirectusBOMComponent[];
    routings: DirectusRouting[];
}> {
    try {
        const filter = encodeURIComponent(JSON.stringify({
            product_id: { _eq: productId }
        }));
        
        const resBOM = await fetch(`${DIRECTUS_URL}/items/manufacturing_boms?filter=${filter}&fields=*,version.*&limit=-1`, { headers, cache: "no-store" });
        if (!resBOM.ok) return { bom: null, components: [], routings: [] };
        
        const bomData = await resBOM.json();
        const boms: DirectusBOM[] = bomData.data || [];
        
        if (boms.length === 0) return { bom: null, components: [], routings: [] };
        
        const sortedBoms = [...boms].sort((a, b) => {
            const versionA = a.version && typeof a.version === "object" ? a.version : null;
            const versionB = b.version && typeof b.version === "object" ? b.version : null;
            const timeA = versionA?.created_at ? new Date(versionA.created_at).getTime() : 0;
            const timeB = versionB?.created_at ? new Date(versionB.created_at).getTime() : 0;
            
            if (timeA !== timeB) return timeB - timeA;
            
            const idA = versionA ? versionA.id : 0;
            const idB = versionB ? versionB.id : 0;
            if (idA !== idB) return idB - idA;
            
            return b.bom_id - a.bom_id;
        });
        
        const activeBOM = sortedBoms[0];
        
        const compFilter = encodeURIComponent(JSON.stringify({ bom_id: { _eq: activeBOM.bom_id } }));
        const resComp = await fetch(`${DIRECTUS_URL}/items/manufacturing_bom_components?filter=${compFilter}&limit=-1`, { headers, cache: "no-store" });
        const compJson = await resComp.json();
        const components: DirectusBOMComponent[] = compJson.data || [];
        
        const routFilter = encodeURIComponent(JSON.stringify({ bom_id: { _eq: activeBOM.bom_id } }));
        const resRout = await fetch(`${DIRECTUS_URL}/items/manufacturing_routings?filter=${routFilter}&sort=sequence_order&limit=-1`, { headers, cache: "no-store" });
        const routJson = await resRout.json();
        const routings: DirectusRouting[] = routJson.data || [];
        
        return { bom: activeBOM, components, routings };
    } catch (e) {
        console.error(`[Manufacturing Directus API] Error fetching active BOM for product ID ${productId}:`, e);
        return { bom: null, components: [], routings: [] };
    }
}

/**
 * 3b. Crawls detailed BOM components and routings for a specific version.
 */
export async function getBOMDetailsForVersion(productId: number, versionId: number): Promise<{
    bom: DirectusBOM | null;
    components: DirectusBOMComponent[];
    routings: DirectusRouting[];
}> {
    try {
        const filter = encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _eq: productId } },
                { version: { _eq: versionId } }
            ]
        }));
        
        const resBOM = await fetch(`${DIRECTUS_URL}/items/manufacturing_boms?filter=${filter}&fields=*,version.*&limit=1`, { headers, cache: "no-store" });
        if (!resBOM.ok) return { bom: null, components: [], routings: [] };
        
        const bomData = await resBOM.json();
        const activeBOM: DirectusBOM = bomData.data?.[0];
        
        if (!activeBOM) return { bom: null, components: [], routings: [] };
        
        const compFilter = encodeURIComponent(JSON.stringify({ bom_id: { _eq: activeBOM.bom_id } }));
        const resComp = await fetch(`${DIRECTUS_URL}/items/manufacturing_bom_components?filter=${compFilter}&limit=-1`, { headers, cache: "no-store" });
        const compJson = await resComp.json();
        const components: DirectusBOMComponent[] = compJson.data || [];
        
        const routFilter = encodeURIComponent(JSON.stringify({ bom_id: { _eq: activeBOM.bom_id } }));
        const resRout = await fetch(`${DIRECTUS_URL}/items/manufacturing_routings?filter=${routFilter}&sort=sequence_order&limit=-1`, { headers, cache: "no-store" });
        const routJson = await resRout.json();
        const routings: DirectusRouting[] = routJson.data || [];
        
        return { bom: activeBOM, components, routings };
    } catch (e) {
        console.error(`[Manufacturing Directus API] Error fetching BOM details for version ${versionId}:`, e);
        return { bom: null, components: [], routings: [] };
    }
}

/**
 * @deprecated Kept for compatibility only. New costing consumers must use
 * products/products-helper.ts and its explicit unit/batch result contract.
 */
export async function calculateLegacyRollupCost(
    productId: number,
    visited: Set<number> = new Set(),
    productsMap?: Map<number, DirectusProduct>,
    forexRate: number = 58.00
): Promise<CostRollupResult> {
    const defaultResult = (pName = "Unknown Product", sku = ""): CostRollupResult => ({
        productId,
        productName: pName,
        sku,
        bomId: null,
        bomVersion: "v1.0",
        materialsCost: 0,
        stepBatchSize: 1,
        machineOverheadCost: 0,
        customOverheadCost: 0,
        additionalOperatingOverhead: 0,
        totalOverheadExpenses: 0,
        includedInCogs: 0,
        excludedFromCogs: 0,
        preYieldDirectCost: 0,
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
    const { bom, components, routings } = await getActiveBOMForProduct(productId);
    if (!bom) {
        const landedCost = await getLatestLandedCost(productId, forexRate);
        const leafBreakdown = calculateCostBreakdown({
            materialsCost: landedCost,
            machineOverheadCost: 0,
            customOverheadCost: 0,
            expectedYieldPercentage: 100
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

    let materialsSubtotal = 0;
    const costTreeNodes: CostNode[] = [];

    for (const comp of components) {
        let compUnitCost = 0;
        let childrenNodes: CostNode[] | undefined;

        if (comp.landed_cost && Number(comp.landed_cost) > 0) {
            compUnitCost = Number(comp.landed_cost);
        } else if (comp.component_type === "sub_assembly") {
            const subResult = await calculateLegacyRollupCost(comp.component_product_id, new Set(visited), productsMap, forexRate);
            compUnitCost = subResult.totalBaseCost;
            childrenNodes = subResult.costTree;
        } else {
            compUnitCost = await getLatestLandedCost(comp.component_product_id, forexRate);
        }

        const lineCost = calculateMaterialCost({
            quantity: comp.quantity_required,
            unitCost: compUnitCost,
            wastagePercent: comp.wastage_factor_percentage,
            isByProduct: comp.component_type === "by_product"
        });

        if (comp.component_type !== "by_product") {
            materialsSubtotal += lineCost;
        }

        const compProduct = productsMap.get(comp.component_product_id);
        const ingName = compProduct ? compProduct.product_name : `Component #${comp.component_product_id}`;

        costTreeNodes.push({
            id: `comp-${comp.component_id}`,
            name: ingName,
            type: comp.component_type === "by_product" ? "by_product" : comp.component_type === "sub_assembly" ? "sub_assembly" : "ingredient",
            quantity: comp.quantity_required,
            uom: comp.unit_of_measurement?.unit_shortcut || "pc",
            unitCost: compUnitCost,
            wastagePercent: comp.wastage_factor_percentage,
            totalCost: lineCost,
            children: childrenNodes
        });
    }

    let machineOverheadSubtotal = 0;
    for (const r of routings) {
        const routeBreakdown = calculateRouteBreakdown({
            machineHourlyRate: r.estimated_overhead_cost,
            setupTimeHours: 0,
            runTimeHours: r.duration_hours,
            baseQuantity: bom.base_quantity
        });
        machineOverheadSubtotal += routeBreakdown.machineOverheadCost;

        costTreeNodes.push({
            id: `route-${r.routing_id}`,
            name: r.operation_name,
            type: "routing",
            quantity: routeBreakdown.machineHours,
            uom: "hrs",
            unitCost: Number(r.estimated_overhead_cost || 0),
            wastagePercent: 0,
            totalCost: routeBreakdown.totalCost,
            machineRate: Number(r.estimated_overhead_cost || 0),
            machineHours: routeBreakdown.machineHours
        });
    }

    const breakdown = calculateCostBreakdown({
        materialsCost: materialsSubtotal,
        machineOverheadCost: machineOverheadSubtotal,
        customOverheadCost: bom.custom_overhead ?? (bom.version && typeof bom.version === "object" ? bom.version.custom_overhead : 0),
        expectedYieldPercentage: bom.expected_yield_percentage
    });
    const overheadSummary = calculateOverheadSummary(breakdown.customOverheadCost);
    
    const targetPrice = currentProduct.price_per_unit || 0;
    const margin = calculateMarginSummary(
        targetPrice,
        breakdown.totalBaseCost,
        overheadSummary.excludedFromCogs
    );

    return {
        productId,
        productName: currentProduct.product_name,
        sku: currentProduct.product_code,
        bomId: bom.bom_id,
        bomVersion: (bom.version && typeof bom.version === "object") ? bom.version.version_name : (bom.version || "V1"),
        ...breakdown,
        additionalOperatingOverhead: overheadSummary.additionalOperatingOverhead,
        totalOverheadExpenses: overheadSummary.totalOverheadExpenses,
        includedInCogs: overheadSummary.includedInCogs,
        excludedFromCogs: overheadSummary.excludedFromCogs,
        routingsCost: breakdown.machineOverheadCost,
        targetSellingPrice: targetPrice,
        ...margin,
        costTree: costTreeNodes
    };
}

/**
 * 5. Utility to update product cost field.
 */
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

/**
 * Updates custom overhead on version.
 */
export async function updateProductVersionOverhead(bomId: number, customOverhead: number): Promise<boolean> {
    try {
        const bomRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_boms/${bomId}`, { headers });
        if (!bomRes.ok) return false;
        const bomVersion = (await bomRes.json()).data?.version;
        if (!bomVersion) return false;
        const versionId = typeof bomVersion === "object" ? bomVersion.id : Number(bomVersion);
        
        const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_product_version/${versionId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ custom_overhead: customOverhead })
        });
        return res.ok;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed version overhead update:", e);
        return false;
    }
}

/**
 * 8. Updates active BOM metadata.
 */
export async function saveActiveBOMDetails(bomId: number, expectedYield: number): Promise<boolean> {
    try {
        const url = `${DIRECTUS_URL}/items/manufacturing_boms/${bomId}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ expected_yield_percentage: expectedYield })
        });
        return res.ok;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed saving BOM yield details:", e);
        return false;
    }
}

/**
 * Registers a new product version in the database.
 */
export async function createProductVersion(productId: number, versionName: string): Promise<number | null> {
    try {
        const url = `${DIRECTUS_URL}/items/manufacturing_product_version`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                product_id: productId,
                version_name: versionName,
                created_at: new Date().toISOString()
            })
        });
        if (!res.ok) throw new Error("Failed to create product version");
        const json = await res.json();
        return json.data?.id || null;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed product version registration:", e);
        return null;
    }
}

/**
 * Syncs BOM components.
 */
export async function syncBOMComponents(bomId: number, components: DirectusBOMComponentInput[], isNewBOM = false): Promise<boolean> {
    try {
        const units = await fetchAllUnits();
        if (isNewBOM) {
            for (const item of components) {
                let uomId = item.uomId;
                if (!uomId && item.uom) {
                    const matchedUnit = units.find(u => 
                        u.unit_shortcut?.toLowerCase() === String(item.uom).toLowerCase() ||
                        u.unit_name?.toLowerCase() === String(item.uom).toLowerCase()
                    );
                    if (matchedUnit) uomId = matchedUnit.unit_id;
                }
                const payload = {
                    bom_id: bomId,
                    component_product_id: item.productId,
                    quantity_required: item.quantity,
                    unit_of_measurement: uomId || null,
                    wastage_factor_percentage: item.wastagePercent,
                    component_type: item.type || "raw_material",
                    landed_cost: Number(item.landedCost) || 0
                };
                await fetch(`${DIRECTUS_URL}/items/manufacturing_bom_components`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload)
                });
            }
            return true;
        }

        const getUrl = `${DIRECTUS_URL}/items/manufacturing_bom_components?filter[bom_id][_eq]=${bomId}&limit=-1`;
        const resGet = await fetch(getUrl, { headers, cache: "no-store" });
        if (!resGet.ok) throw new Error("Failed to fetch components");
        const existing: { component_id: number }[] = (await resGet.json()).data || [];
        const uiIds = new Set(components.map(item => String(item.id)));

        const toDelete = existing.filter(e => !uiIds.has(String(e.component_id)));
        for (const item of toDelete) {
            await fetch(`${DIRECTUS_URL}/items/manufacturing_bom_components/${item.component_id}`, {
                method: "DELETE",
                headers
            });
        }

        for (const item of components) {
            let uomId = item.uomId;
            if (!uomId && item.uom) {
                const matchedUnit = units.find(u => 
                    u.unit_shortcut?.toLowerCase() === String(item.uom).toLowerCase() ||
                    u.unit_name?.toLowerCase() === String(item.uom).toLowerCase()
                );
                if (matchedUnit) uomId = matchedUnit.unit_id;
            }
            const payload = {
                bom_id: bomId,
                component_product_id: item.productId,
                quantity_required: item.quantity,
                unit_of_measurement: uomId || null,
                wastage_factor_percentage: item.wastagePercent,
                component_type: item.type || "raw_material",
                landed_cost: Number(item.landedCost) || 0
            };
            const isNew = isNaN(Number(item.id));
            if (isNew) {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_bom_components`, { method: "POST", headers, body: JSON.stringify(payload) });
            } else {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_bom_components/${item.id}`, { method: "PATCH", headers, body: JSON.stringify(payload) });
            }
        }
        return true;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed syncing components:", e);
        return false;
    }
}

/**
 * Syncs routing steps.
 */
export async function syncRoutingSteps(
    bomId: number,
    routings: DirectusRoutingStepInput[],
    versionId: number,
    isNewBOM = false
): Promise<boolean> {
    try {
        let finalVersionId = versionId;
        if (!finalVersionId || finalVersionId === 0) {
            const bomRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_boms/${bomId}`, { headers });
            if (bomRes.ok) {
                const bomVersion = (await bomRes.json()).data?.version;
                if (bomVersion) {
                    finalVersionId = typeof bomVersion === "object" ? bomVersion.id : Number(bomVersion);
                }
            }
        }

        const operations = await fetchAllOperations();

        if (isNewBOM) {
            for (const step of routings) {
                const matchedOp = operations.find(o => o.operation_name.trim().toLowerCase() === String(step.name || "").trim().toLowerCase());
                const payload = {
                    bom_id: bomId,
                    version: finalVersionId,
                    sequence_order: step.sequence,
                    operation_name: step.name,
                    operation_id: matchedOp ? matchedOp.id : (step.operationId || null),
                    step_batch_size: step.stepBatchSize || 1,
                    estimated_overhead_cost: step.machineHourlyRate,
                    duration_hours: step.durationHours
                };
                await fetch(`${DIRECTUS_URL}/items/manufacturing_routings`, { method: "POST", headers, body: JSON.stringify(payload) });
            }
            return true;
        }

        const getUrl = `${DIRECTUS_URL}/items/manufacturing_routings?filter[bom_id][_eq]=${bomId}&limit=-1`;
        const resGet = await fetch(getUrl, { headers, cache: "no-store" });
        if (!resGet.ok) throw new Error("Failed to fetch routing steps");
        const existing: { routing_id: number }[] = (await resGet.json()).data || [];
        const uiIds = new Set(routings.map(step => String(step.id)));

        const toDelete = existing.filter(e => !uiIds.has(String(e.routing_id)));
        for (const step of toDelete) {
            await fetch(`${DIRECTUS_URL}/items/manufacturing_routings/${step.routing_id}`, { method: "DELETE", headers });
        }

        for (const step of routings) {
            const matchedOp = operations.find(o => o.operation_name.trim().toLowerCase() === String(step.name || "").trim().toLowerCase());
            const payload = {
                bom_id: bomId,
                version: finalVersionId,
                sequence_order: step.sequence,
                operation_name: step.name,
                operation_id: matchedOp ? matchedOp.id : (step.operationId || null),
                step_batch_size: step.stepBatchSize || 1,
                estimated_overhead_cost: step.machineHourlyRate,
                duration_hours: step.durationHours
            };
            const isNew = isNaN(Number(step.id));
            if (isNew) {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_routings`, { method: "POST", headers, body: JSON.stringify(payload) });
            } else {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_routings/${step.id}`, { method: "PATCH", headers, body: JSON.stringify(payload) });
            }
        }
        return true;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed syncing routings:", e);
        return false;
    }
}

/**
 * Updates product overheads.
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

export async function syncProductOverheads(
    productId: number,
    versionId: number,
    overheads: { id?: string | number; overheadId: number; amount: number }[]
): Promise<boolean> {
    try {
        const url = `${DIRECTUS_URL}/items/product_overheads?filter[product_id][_eq]=${productId}&filter[version_id][_eq]=${versionId}&limit=-1`;
        const resGet = await fetch(url, { headers, cache: "no-store" });
        const existing: { id: number }[] = resGet.ok ? (await resGet.json()).data || [] : [];
        const uiIds = new Set(overheads.map(o => String(o.id)));
        
        const toDelete = existing.filter(e => !uiIds.has(String(e.id)));
        for (const item of toDelete) {
            await fetch(`${DIRECTUS_URL}/items/product_overheads/${item.id}`, { method: "DELETE", headers });
        }
        
        for (const item of overheads) {
            const payload = {
                product_id: productId,
                version_id: versionId,
                overhead_id: Number(item.overheadId),
                amount: Number(item.amount) || 0
            };
            const isNew = isNaN(Number(item.id));
            if (isNew) {
                await fetch(`${DIRECTUS_URL}/items/product_overheads`, { method: "POST", headers, body: JSON.stringify(payload) });
            } else {
                await fetch(`${DIRECTUS_URL}/items/product_overheads/${item.id}`, { method: "PATCH", headers, body: JSON.stringify(payload) });
            }
        }
        return true;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed syncing product overheads:", e);
        return false;
    }
}

/**
 * Fetch all reusable overhead types.
 */
export async function fetchAllOverheadTypes(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/overhead_types?limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed fetching overhead types:", e);
        return [];
    }
}

/**
 * Creates a new overhead type variable.
 */
export async function createOverheadType(name: string): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/overhead_types`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ overhead_name: name })
        });
        if (!res.ok) return null;
        return (await res.json()).data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create overhead type:", e);
        return null;
    }
}

/**
 * Fetch operations.
 */
export async function fetchAllOperations(): Promise<DirectusOperation[]> {
    try {
        const url = `${DIRECTUS_URL}/items/manufacturing_operations?limit=-1&sort=operation_name`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed fetching operations:", e);
        return [];
    }
}

/**
 * Creates a new manufacturing operation.
 */
export async function createOperation(name: string): Promise<DirectusOperation | null> {
    try {
        const url = `${DIRECTUS_URL}/items/manufacturing_operations`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ operation_name: name })
        });
        if (!res.ok) return null;
        return (await res.json()).data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create manufacturing operation:", e);
        return null;
    }
}

/**
 * Updates product details.
 */
export async function updateProductDetails(
    productId: number,
    details: {
        product_name?: string;
        product_code?: string;
        description?: string;
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
    }
): Promise<boolean> {
    try {
        const url = `${DIRECTUS_URL}/items/products/${productId}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify(details)
        });
        return res.ok;
    } catch (e) {
        console.error(`[Manufacturing Directus API] Failed updating product details:`, e);
        return false;
    }
}

export interface DirectusProductPerSupplier {
    id: number;
    supplier_id: number;
    product_id: DirectusProduct & {
        unit_of_measurement?: {
            unit_id: number;
            unit_name: string;
            unit_shortcut: string;
            sku_code?: string | null;
        } | null;
    };
}

export interface DirectusSupplier {
    id: number;
    supplier_name: string;
    supplier_shortcut?: string | null;
    isActive?: boolean;
    is_foreign?: number | boolean;
    currency?: string;
    country?: string;
}

/**
 * Fetches all active suppliers from Directus.
 */
export async function fetchSuppliers(): Promise<DirectusSupplier[]> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/suppliers?fields=id,supplier_name,supplier_shortcut,contact_person,email_address,phone_number,address,city,brgy,state_province,postal_code,country,supplier_type,tin_number,bank_details,payment_terms,delivery_terms,agreement_or_contract,preferred_communication_method,notes_or_comments,date_added,supplier_image,isActive,nonBuy,user_id,is_foreign,currency&filter[isActive][_eq]=true&sort=supplier_name&limit=-1`, { headers, cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch suppliers");
        const json = await res.json();
        return json.data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Error fetching suppliers:", e);
        return [];
    }
}

/**
 * Create a new supplier
 */
export async function createSupplier(supplierData: Record<string, unknown>): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/suppliers`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ ...supplierData, isActive: 1 })
        });
        if (!res.ok) throw new Error(`Failed to create supplier: ${res.status}`);
        return (await res.json()).data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create supplier:", e);
        throw e;
    }
}

/**
 * Fetches products linked to a supplier.
 */
export async function fetchProductsBySupplier(supplierId: number): Promise<DirectusProductPerSupplier[]> {
    try {
        const url = `${DIRECTUS_URL}/items/product_per_supplier?filter[supplier_id][_eq]=${supplierId}&fields=id,supplier_id,product_id.*,product_id.unit_of_measurement.*&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch products for supplier");
        const json = await res.json();
        return json.data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Error fetching products for supplier:", e);
        return [];
    }
}

/**
 * Fetch all saved quotations, including populated customer details.
 */
export async function fetchQuotations(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/quotation_header?limit=-1&sort=-quote_date`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        const quotes = ((await res.json()).data || []) as { id: number; customer_id: string | number | Record<string, unknown>; [key: string]: unknown }[];

        const custIds = Array.from(new Set(quotes.map(q => q.customer_id).filter(Boolean)));
        let customers: { id: string | number; customer_name: string; customer_code: string }[] = [];
        if (custIds.length > 0) {
            const custUrl = `${DIRECTUS_URL}/items/customer?filter[id][_in]=${custIds.join(",")}&limit=-1`;
            const custRes = await fetch(custUrl, { headers, cache: "no-store" });
            if (custRes.ok) {
                customers = ((await custRes.json()).data || []) as { id: string | number; customer_name: string; customer_code: string }[];
            }
        }

        return quotes.map(q => {
            const rawCustId = q.customer_id;
            if (rawCustId && (typeof rawCustId === "number" || typeof rawCustId === "string")) {
                const match = customers.find(c => String(c.id) === String(rawCustId));
                if (match) return { ...q, customer_id: match };
            }
            return q;
        });
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed fetching quotations:", e);
        return [];
    }
}

/**
 * Saves a quotation and its line snapshots.
 */
export async function saveQuotation(
    quoteData: {
        quote_number: string;
        customer_id: number;
        total_selling_price: number;
        total_simulated_cost: number;
        forex_rate_used: number;
        remarks?: string;
    },
    snapshots: Array<{
        product_id: number;
        version_id: number;
        node_name: string;
        node_type: string;
        quantity: number;
        uom: string;
        frozen_unit_cost_php: number;
        frozen_total_cost_php: number;
    }>
): Promise<unknown> {
    let quoteId: number | null = null;
    const createdSnapshotIds: number[] = [];
    try {
        // 1. Post Header
        const headerRes = await fetch(`${DIRECTUS_URL}/items/quotation_header`, {
            method: "POST",
            headers,
            body: JSON.stringify(quoteData)
        });
        if (!headerRes.ok) {
            const errText = await headerRes.text();
            throw new Error(`Failed to create quote header: ${headerRes.status} - ${errText}`);
        }
        const headerJson = await headerRes.json();
        quoteId = headerJson.data.id;

        // 2. Post Snapshot nodes
        for (const node of snapshots) {
            const nodePayload = {
                ...node,
                quotation_id: quoteId
            };
            const nodeRes = await fetch(`${DIRECTUS_URL}/items/quotation_snapshots`, {
                method: "POST",
                headers,
                body: JSON.stringify(nodePayload)
            });
            if (!nodeRes.ok) throw new Error(`Failed to save quote node: ${nodeRes.status}`);
            const nodeJson = await nodeRes.json();
            createdSnapshotIds.push(nodeJson.data.id);
        }

        return { success: true, quoteId };
    } catch (e) {
        console.error("Failed to transactional save quotation. Rolling back...", e);
        // Rollback snapshot nodes
        for (const sId of createdSnapshotIds) {
            await fetch(`${DIRECTUS_URL}/items/quotation_snapshots/${sId}`, { method: "DELETE", headers }).catch(() => {});
        }
        // Rollback header
        if (quoteId) {
            await fetch(`${DIRECTUS_URL}/items/quotation_header/${quoteId}`, { method: "DELETE", headers }).catch(() => {});
        }
        throw e;
    }
}

/**
 * Fetch all registered customers.
 */
export async function fetchCustomers(search?: string, includeInactive = false): Promise<unknown[]> {
    try {
        let url = `${DIRECTUS_URL}/items/customer?limit=250&sort=customer_name`;
        if (!includeInactive) {
            url += `&filter[isActive][_eq]=true`;
        }
        if (search && search.trim()) {
            url += `&search=${encodeURIComponent(search.trim())}`;
        }
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch customers:", e);
        return [];
    }
}

/**
 * Create a new customer record.
 */
export async function createCustomer(payload: {
    customer_code: string;
    customer_name: string;
    encoder_id: number;
    customer_tin?: string;
    contact_number?: string;
    customer_email?: string;
    store_name?: string;
    brgy?: string;
    city?: string;
    province?: string;
    isActive?: number;
}): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/customer`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                ...payload,
                isActive: payload.isActive !== undefined ? payload.isActive : 1
            })
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const errMsg = body.errors?.[0]?.message || `Directus failed: ${res.status}`;
            throw new Error(errMsg);
        }
        const json = await res.json();
        return json.data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create customer:", e);
        throw e;
    }
}

/**
 * Update a customer record.
 */
export async function updateCustomer(id: number | string, payload: Partial<{
    customer_code: string;
    customer_name: string;
    customer_tin?: string;
    contact_number?: string;
    customer_email?: string;
    store_name?: string;
    brgy?: string;
    city?: string;
    province?: string;
    isActive?: number;
}>): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/customer/${id}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const errMsg = body.errors?.[0]?.message || `Directus failed: ${res.status}`;
            throw new Error(errMsg);
        }
        const json = await res.json();
        return json.data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to update customer:", e);
        throw e;
    }
}

/**
 * Delete a customer record.
 */
export async function deleteCustomer(id: number | string): Promise<boolean> {
    try {
        const url = `${DIRECTUS_URL}/items/customer/${id}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ isActive: 0 })
        });
        return res.ok;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to soft-delete customer:", e);
        return false;
    }
}


/**
 * Fetch all registered store types.
 */
export async function fetchStoreTypes(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/store_type?limit=-1&sort=store_type`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch store types:", e);
        return [];
    }
}

/**
 * Create a new store type record.
 */
export async function createStoreType(name: string, userId: number): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/store_type`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                store_type: name,
                created_by: userId
            })
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const errMsg = body.errors?.[0]?.message || `Directus failed: ${res.status}`;
            throw new Error(errMsg);
        }
        const json = await res.json();
        return json.data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create store type:", e);
        throw e;
    }
}

/**
 * Fetch all registered payment terms.
 */
export async function fetchPaymentTerms(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/payment_terms?limit=-1&sort=payment_name`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch payment terms:", e);
        return [];
    }
}




/**
 * Fetch detailed cost snapshot nodes for a specific quote.
 */
export async function fetchQuotationSnapshots(quoteId: number): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/quotation_snapshots?filter[quotation_id][_eq]=${quoteId}&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch quotation snapshots:", e);
        return [];
    }
}

export interface DirectusShipment {
    shipment_id?: number;
    reference_number: string;
    supplier_id: number | Record<string, unknown>;
    date_received: string | null;
    total_foreign_currency: number;
    exchange_rate: number;
    total_php_value: number;
    status: "Ordered" | "Approved" | "En Route" | "Receiving (QA)" | "Received";
    created_at?: string;
}

export interface DirectusShipmentLineItem {
    line_id?: number;
    shipment_id: number;
    product_id: number | Record<string, unknown>;
    quantity_received: number;
    base_unit_cost_php: number;
    allocated_expense_php: number;
    final_landed_unit_cost: number;
}

export interface DirectusShipmentExpense {
    expense_id?: number;
    shipment_id: number;
    expense_type: string;
    amount_php: number;
    allocation_method: "Value" | "Weight" | "Volume";
}

/**
 * Fetch expenses for a shipment
 */
export async function fetchShipmentExpenses(shipmentId: number): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/purchase_order_expenses?filter[purchase_order_id][_eq]=${shipmentId}&fields=*,overhead_id.*&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch shipment expenses:", e);
        return [];
    }
}

/**
 * Allocate shipment expenses and calculate final landed unit costs
 */
export async function processShipmentLandedCosts(
    shipmentId: number,
    status: "Ordered" | "Approved" | "En Route" | "Receiving (QA)" | "Received",
    expenses: Array<Partial<DirectusShipmentExpense>>,
    allocationMethod: "Value" | "Weight" | "Volume",
    _lineItemUpdates?: Array<{ line_id: number; quantity_received: number }>
): Promise<unknown> {
    try {
        void _lineItemUpdates;
        // 1. Delete existing expenses for this shipment
        const oldExpensesRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_expenses?filter[purchase_order_id][_eq]=${shipmentId}&limit=-1`, { headers });
        if (oldExpensesRes.ok) {
            const oldExpenses = (await oldExpensesRes.json()).data || [];
            for (const exp of oldExpenses) {
                await fetch(`${DIRECTUS_URL}/items/purchase_order_expenses/${exp.expense_id}`, { method: "DELETE", headers }).catch(() => {});
            }
        }

        // 2. Save new expenses and sum up PHP total
        let totalExpensesPhp = 0;
        for (const exp of expenses) {
            const resExp = await fetch(`${DIRECTUS_URL}/items/purchase_order_expenses`, {
                method: "POST",
                headers,
                body: JSON.stringify({ ...exp, purchase_order_id: shipmentId, allocation_method: allocationMethod })
            });
            if (resExp.ok) {
                const data = (await resExp.json()).data;
                totalExpensesPhp += Number(data.amount_php || 0);
            }
        }

        // 3. Fetch shipment line items with product fields for allocation weight/volume ratios
        const linesRes = await fetch(`${DIRECTUS_URL}/items/shipment_line_items?filter[shipment_id][_eq]=${shipmentId}&fields=*,product_id.*&limit=-1`, { headers });
        if (!linesRes.ok) throw new Error("Failed to load shipment line items");
        const lines = (await linesRes.json()).data || [];

        if (lines.length === 0) {
            // No lines, just update status
            await fetch(`${DIRECTUS_URL}/items/incoming_shipments/${shipmentId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ status })
            });
            return { success: true };
        }

        // 4. Calculate total base values for allocation
        let totalWeight = 0;
        let totalVolume = 0;
        let totalCommercialValuePhp = 0;

        lines.forEach((l: { quantity_received?: unknown; base_unit_cost_php?: unknown; product_id?: { weight?: unknown; product_weight?: unknown; cbm_height?: unknown; cbm_width?: unknown; cbm_length?: unknown; product_id: string | number }; line_id?: unknown }) => {
            const qty = Number(l.quantity_received) || 0;
            const price = Number(l.base_unit_cost_php) || 0;
            totalCommercialValuePhp += qty * price;

            const prod = l.product_id;
            const weight = Number(prod?.weight || prod?.product_weight || 0);
            totalWeight += qty * weight;

            const height = Number(prod?.cbm_height || 0);
            const width = Number(prod?.cbm_width || 0);
            const length = Number(prod?.cbm_length || 0);
            totalVolume += qty * (height * width * length);
        });

        // 5. Allocate expenses and update shipment_line_items
        for (const l of lines) {
            const qty = Number(l.quantity_received) || 1;
            const price = Number(l.base_unit_cost_php) || 0;
            const lineValuePhp = qty * price;

            let ratio = 0;
            if (allocationMethod === "Weight" && totalWeight > 0) {
                const prod = l.product_id;
                const weight = Number(prod?.weight || prod?.product_weight || 0);
                ratio = (qty * weight) / totalWeight;
            } else if (allocationMethod === "Volume" && totalVolume > 0) {
                const prod = l.product_id;
                const height = Number(prod?.cbm_height || 0);
                const width = Number(prod?.cbm_width || 0);
                const length = Number(prod?.cbm_length || 0);
                ratio = (qty * (height * width * length)) / totalVolume;
            } else {
                // Default: Commercial Value
                if (totalCommercialValuePhp > 0) {
                    ratio = lineValuePhp / totalCommercialValuePhp;
                } else {
                    ratio = 1 / lines.length;
                }
            }

            const allocatedExpense = ratio * totalExpensesPhp;
            const finalLandedUnitCost = price + (qty > 0 ? (allocatedExpense / qty) : 0);

            // Update shipment line item
            await fetch(`${DIRECTUS_URL}/items/shipment_line_items/${l.line_id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    allocated_expense_php: allocatedExpense,
                    final_landed_unit_cost: finalLandedUnitCost
                })
            });

            // If shipment is received, update product table cost_per_unit & estimated_unit_cost
            if (status === "Received" || status === "Receiving (QA)") {
                await fetch(`${DIRECTUS_URL}/items/products/${l.product_id.product_id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        cost_per_unit: finalLandedUnitCost,
                        estimated_unit_cost: finalLandedUnitCost
                    })
                });
            }
        }

        // 6. Update Shipment Header Status
        const updatePayload: Record<string, unknown> = { status };
        if (status === "Received" || status === "Receiving (QA)") {
            updatePayload.date_received = new Date().toISOString().split('T')[0];
        }
        await fetch(`${DIRECTUS_URL}/items/incoming_shipments/${shipmentId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload)
        });

        return { success: true };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed in processShipmentLandedCosts:", e);
        throw e;
    }
}

/**
 * Fetch all incoming shipments
 */
export async function fetchIncomingShipments(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/incoming_shipments?fields=*,supplier_id.*&sort=-created_at&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch incoming shipments:", e);
        return [];
    }
}

/**
 * Fetch line items for a shipment
 */
export async function fetchShipmentLineItems(shipmentId: number): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/shipment_line_items?filter[shipment_id][_eq]=${shipmentId}&fields=*,product_id.*,product_id.unit_of_measurement.*&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch shipment line items:", e);
        return [];
    }
}

/**
 * Create an incoming shipment along with line items
 */
export async function createIncomingShipment(
    shipmentData: Partial<DirectusShipment>,
    lineItems: Array<Partial<DirectusShipmentLineItem>>
): Promise<unknown> {
    let shipmentId: number | null = null;
    const createdLineIds: number[] = [];
    try {
        const url = `${DIRECTUS_URL}/items/incoming_shipments`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                ...shipmentData,
                status: shipmentData.status || "Shipped",
                date_received: shipmentData.date_received || new Date().toISOString().split('T')[0]
            })
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Failed to create shipment header: ${res.status} - ${txt}`);
        }
        const shipmentJson = await res.json();
        shipmentId = shipmentJson.data.shipment_id;

        for (const item of lineItems) {
            const payload = {
                ...item,
                shipment_id: shipmentId,
                allocated_expense_php: 0,
                final_landed_unit_cost: item.base_unit_cost_php || 0,
                quantity_received: 0
            };
            const itemRes = await fetch(`${DIRECTUS_URL}/items/shipment_line_items`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });
            if (!itemRes.ok) throw new Error(`Failed to create line item: ${itemRes.status}`);
            const itemJson = await itemRes.json();
            createdLineIds.push(itemJson.data.line_id);
        }

        return { success: true, shipment_id: shipmentId };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to save incoming shipment. Rolling back...", e);
        for (const lid of createdLineIds) {
            await fetch(`${DIRECTUS_URL}/items/shipment_line_items/${lid}`, { method: "DELETE", headers }).catch(() => {});
        }
        if (shipmentId) {
            await fetch(`${DIRECTUS_URL}/items/incoming_shipments/${shipmentId}`, { method: "DELETE", headers }).catch(() => {});
        }
        throw e;
    }
}

/**
 * Updates status of an incoming shipment, and commits product costs if status is Receiving (QA).
 */
export async function updateIncomingShipmentStatus(
    shipmentId: number, 
    status: "Ordered" | "Approved" | "En Route" | "Receiving (QA)" | "Received"
) {
    try {
        if (status === "Receiving (QA)" || status === "Received") {
            const linesRes = await fetch(`${DIRECTUS_URL}/items/shipment_line_items?filter[shipment_id][_eq]=${shipmentId}&fields=*,product_id.*&limit=-1`, { headers });
            if (linesRes.ok) {
                const lines = (await linesRes.json()).data || [];
                for (const l of lines) {
                    const finalLandedUnitCost = Number(l.final_landed_unit_cost || l.base_unit_cost_php || 0);
                    if (finalLandedUnitCost > 0 && l.product_id?.product_id) {
                        await fetch(`${DIRECTUS_URL}/items/products/${l.product_id.product_id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({
                                cost_per_unit: finalLandedUnitCost,
                                estimated_unit_cost: finalLandedUnitCost
                            })
                        }).catch(err => console.error("Error updating product cost on status change:", err));
                    }
                }
            }
        }

        const updatePayload: Record<string, unknown> = { status };
        if (status === "Received" || status === "Receiving (QA)") {
            updatePayload.date_received = new Date().toISOString().split('T')[0];
        }
        const res = await fetch(`${DIRECTUS_URL}/items/incoming_shipments/${shipmentId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload)
        });

        if (!res.ok) throw new Error(`Failed to update shipment status: ${res.status}`);
        return { success: true };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to update incoming shipment status:", e);
        throw e;
    }
}

/**
 * Fetch all job orders
 */
export interface DirectusJobOrder {
    jo_id: string;
    due_date?: string | null;
    status: string;
    is_batched: boolean;
    procurement_status: string;
    branch_id?: number | null;
    assigned_personnel?: unknown;
    product_id?: number | null;
    product_name?: string | null;
    quantity?: number;
    bom?: unknown;
    components?: unknown;
    routings?: unknown;
    allocation_results?: unknown;
    products?: {
        product_id?: number | null;
        product_name?: string | null;
        quantity?: number;
        bom?: unknown;
        components?: unknown;
        routings?: unknown;
        allocation_results?: unknown;
    }[];
    sales_orders?: unknown[];
    [key: string]: unknown;
}

import {
    fetchJobOrders as _fetchJobOrders,
    createJobOrder as _createJobOrder,
    modifyJobOrder as _modifyJobOrder,
    deleteJobOrder as _deleteJobOrder
} from "./planning-engineering/planning-helper";

export {
    _fetchJobOrders as fetchJobOrders,
    _createJobOrder as createJobOrder,
    _modifyJobOrder as updateJobOrder,
    _modifyJobOrder as modifyJobOrder,
    _deleteJobOrder as deleteJobOrder
};

/**
 * Fetch all registered density factors.
 */
export async function fetchDensityFactors(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/density_factors?limit=-1&sort=name&filter[isActive][_neq]=false`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch density factors:", e);
        return [];
    }
}

/**
 * Create a new density factor.
 */
export async function createDensityFactor(payload: {
    name: string;
    density: number;
    description?: string;
    is_system?: boolean;
}): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/density_factors`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                ...payload,
                is_system: !!payload.is_system,
                isActive: true
            })
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const errMsg = body.errors?.[0]?.message || `Directus failed: ${res.status}`;
            throw new Error(errMsg);
        }
        return (await res.json()).data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create density factor:", e);
        throw e;
    }
}

/**
 * Delete a density factor by ID.
 */
export async function deleteDensityFactor(id: number | string): Promise<boolean> {
    try {
        const url = `${DIRECTUS_URL}/items/density_factors/${id}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ isActive: false })
        });
        return res.ok;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to delete density factor:", e);
        return false;
    }
}

/**
 * Get a general setting value by key.
 */
export async function getGeneralSetting(key: string): Promise<string | null> {
    try {
        const url = `${DIRECTUS_URL}/items/general_setting?filter[setting_key][_eq]=${key}&limit=1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return null;
        const body = await res.json();
        return body.data?.[0]?.setting_value ?? null;
    } catch (e) {
        console.error(`[Manufacturing Directus API] Failed to fetch general setting for key ${key}:`, e);
        return null;
    }
}

/**
 * Set or update a general setting value.
 */
export async function setGeneralSetting(key: string, value: string): Promise<boolean> {
    try {
        const checkUrl = `${DIRECTUS_URL}/items/general_setting?filter[setting_key][_eq]=${key}&limit=1`;
        const checkRes = await fetch(checkUrl, { headers, cache: "no-store" });
        
        let existingId: number | null = null;
        if (checkRes.ok) {
            const body = await checkRes.json();
            if (body.data?.[0]) {
                existingId = body.data[0].id;
            }
        }

        if (existingId !== null) {
            const updateUrl = `${DIRECTUS_URL}/items/general_setting/${existingId}`;
            const res = await fetch(updateUrl, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ setting_value: value })
            });
            return res.ok;
        } else {
            const createUrl = `${DIRECTUS_URL}/items/general_setting`;
            const res = await fetch(createUrl, {
                method: "POST",
                headers,
                body: JSON.stringify({ setting_key: key, setting_value: value })
            });
            return res.ok;
        }
    } catch (e) {
        console.error(`[Manufacturing Directus API] Failed to set general setting for key ${key}:`, e);
        return false;
    }
}

/**
 * Get all general settings as a key-value record.
 */
export async function getAllGeneralSettings(): Promise<Record<string, string>> {
    try {
        const url = `${DIRECTUS_URL}/items/general_setting?limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return {};
        const body = await res.json();
        const settings: Record<string, string> = {};
        if (Array.isArray(body.data)) {
            body.data.forEach((item: { setting_key: string; setting_value: string }) => {
                if (item.setting_key) {
                    settings[item.setting_key] = item.setting_value;
                }
            });
        }
        return settings;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch all general settings:", e);
        return {};
    }
}

let cachedTimezone: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000;

export async function getConfiguredTimezone(): Promise<string> {
    const now = Date.now();
    if (cachedTimezone && (now - cacheTimestamp < CACHE_TTL_MS)) {
        return cachedTimezone;
    }
    
    try {
        const tz = await getGeneralSetting("timezone");
        if (tz) {
            cachedTimezone = tz;
            cacheTimestamp = now;
            return tz;
        }
    } catch (e) {
        console.error("[Timezone Helper] Error fetching timezone setting, falling back to Asia/Manila:", e);
    }
    
    cachedTimezone = "Asia/Manila";
    cacheTimestamp = now;
    return cachedTimezone;
}

export async function getTodayDateString(now = new Date()): Promise<string> {
    const tz = await getConfiguredTimezone();
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export async function getISOStringInConfiguredTimezone(d = new Date()): Promise<string> {
    const tz = await getConfiguredTimezone();
    
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
    
    const parts = formatter.formatToParts(d);
    const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    
    const tzString = d.toLocaleString("en-US", { timeZone: tz });
    const localDate = new Date(tzString);
    const utcString = d.toLocaleString("en-US", { timeZone: "UTC" });
    const utcDate = new Date(utcString);
    const diff = Math.round((localDate.getTime() - utcDate.getTime()) / 60000);
    const sign = diff >= 0 ? "+" : "-";
    const absDiff = Math.abs(diff);
    const hours = String(Math.floor(absDiff / 60)).padStart(2, "0");
    const minutes = String(absDiff % 60).padStart(2, "0");
    
    return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}.${ms}${sign}${hours}:${minutes}`;
}



