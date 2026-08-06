// VOS ERP - BOM & Costing Directus API Service

import { DIRECTUS_URL, headers } from "./core-api.service";
import {
    fetchAllUnits,
    fetchAllOperations,
    type DirectusBOM,
    type DirectusBOMComponent,
    type DirectusRouting,
    type DirectusBOMComponentInput,
    type DirectusRoutingStepInput
} from "./finished-goods-catalog-api.service";

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
