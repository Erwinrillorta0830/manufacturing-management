// VOS ERP - Legacy Cost Rollup Directus API Service

import { calculateCostBreakdown, calculateMaterialCost, calculateMarginSummary, calculateOverheadSummary, calculateRouteBreakdown } from "@/modules/manufacturing-management/finished-goods/costing";
import { DIRECTUS_URL, headers } from "./core-api.service";
import { fetchAllProducts, type DirectusProduct, type CostRollupResult, type CostNode } from "./finished-goods-catalog-api.service";
import { getActiveBOMForProduct, getLatestLandedCost } from "./bom-costing-api.service";

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
        const ingName = compProduct ? compProduct.product_name : `Unresolved Material (ID #${comp.component_product_id} - Archived or Missing)`;

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
