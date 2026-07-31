import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getBOMDetailsForVersion, getActiveVersionForProduct } from "../../versions-helper";
import { ProductVersion, RouteStep, RouteBOMItem } from "@/modules/manufacturing-management/finished-goods/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ComponentInfo {
    productId: number;
    productName: string;
    productCode: string;
    quantity: number;
    wastageFactor: number;
    uom: string;
    costPerUnit: number;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const targetVersionIdParam = searchParams.get("targetVersionId");
        const baseVersionIdParam = searchParams.get("baseVersionId");

        if (!targetVersionIdParam) {
            return NextResponse.json({ error: "Missing required query parameter: targetVersionId" }, { status: 400 });
        }

        const targetVersionId = Number(targetVersionIdParam);
        if (isNaN(targetVersionId)) {
            return NextResponse.json({ error: "Invalid targetVersionId parameter" }, { status: 400 });
        }

        // 1. Fetch target version to get product_id
        const targetRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${targetVersionId}`, { headers, cache: "no-store" });
        if (!targetRes.ok) {
            return NextResponse.json({ error: `Target version with ID ${targetVersionId} not found` }, { status: 404 });
        }
        const targetVerData = (await targetRes.json()).data;
        const productId = Number(targetVerData.product_id);

        if (!productId || isNaN(productId)) {
            return NextResponse.json({ error: "Target version does not belong to a valid product" }, { status: 400 });
        }

        // 2. Fetch BOM details for target and base versions
        const targetBOM = await getBOMDetailsForVersion(productId, targetVersionId);

        let baseBOM: { version: ProductVersion | null; routes: RouteStep[] };
        if (baseVersionIdParam && !isNaN(Number(baseVersionIdParam))) {
            const baseVersionId = Number(baseVersionIdParam);
            baseBOM = await getBOMDetailsForVersion(productId, baseVersionId);
        } else {
            baseBOM = await getActiveVersionForProduct(productId);
        }

        // 3. Gather components and route metadata for enrichment
        const targetBomItems = (targetBOM.routes || []).flatMap(r => r.bom_items || []);
        const baseBomItems = (baseBOM.routes || []).flatMap(r => r.bom_items || []);

        const allComponentProductIds = [...new Set([
            ...targetBomItems.map(b => Number(b.product_id)),
            ...baseBomItems.map(b => Number(b.product_id))
        ])].filter(id => Number.isFinite(id) && id > 0);

        const workCenterIds = [...new Set([
            ...(targetBOM.routes || []).map(r => Number(r.work_center_id)),
            ...(baseBOM.routes || []).map(r => Number(r.work_center_id))
        ])].filter(id => Number.isFinite(id) && id > 0);

        const operationIds = [...new Set([
            ...(targetBOM.routes || []).map(r => Number(r.operation_id)),
            ...(baseBOM.routes || []).map(r => Number(r.operation_id))
        ])].filter(id => Number.isFinite(id) && id > 0);

        const [componentProductsRes, workCentersRes, operationsRes] = await Promise.all([
            allComponentProductIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${allComponentProductIds.join(",")}&fields=product_id,product_name,product_code,cost_per_unit,unit_of_measurement.unit_shortcut`, { headers, cache: "no-store" }).catch(() => null)
                : null,
            workCenterIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1`, { headers, cache: "no-store" })
                    .then(r => r.ok ? r : fetch(`${DIRECTUS_URL}/items/work_centers?limit=-1`, { headers, cache: "no-store" }))
                    .catch(() => null)
                : null,
            operationIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/manufacturing_operations?limit=-1`, { headers, cache: "no-store" })
                    .then(r => r.ok ? r : fetch(`${DIRECTUS_URL}/items/operations?limit=-1`, { headers, cache: "no-store" }))
                    .catch(() => null)
                : null
        ]);

        const componentProductsMap = new Map<number, { product_name: string; product_code: string; cost_per_unit: number; unit_shortcut: string }>();
        if (componentProductsRes && componentProductsRes.ok) {
            const json = await componentProductsRes.json();
            (json.data || []).forEach((p: { product_id: number; product_name?: string; product_code?: string; cost_per_unit?: number; unit_of_measurement?: { unit_shortcut?: string } | string }) => {
                const uom = typeof p.unit_of_measurement === "object" && p.unit_of_measurement !== null
                    ? p.unit_of_measurement.unit_shortcut
                    : "pcs";
                componentProductsMap.set(Number(p.product_id), {
                    product_name: p.product_name || `Product #${p.product_id}`,
                    product_code: p.product_code || `P-${p.product_id}`,
                    cost_per_unit: Number(p.cost_per_unit ?? 0),
                    unit_shortcut: uom || "pcs"
                });
            });
        }

        const workCentersMap = new Map<number, { work_center_name: string; overhead_cost_per_hour: number }>();
        if (workCentersRes && workCentersRes.ok) {
            const json = await workCentersRes.json();
            (json.data || []).forEach((wc: { work_center_id?: number; id?: number; work_center_name?: string; name?: string; overhead_cost_per_hour?: number; cost_per_hour?: number }) => {
                const id = Number(wc.work_center_id ?? wc.id);
                const name = wc.work_center_name || wc.name || `Work Center #${id}`;
                const cost = Number(wc.overhead_cost_per_hour ?? wc.cost_per_hour ?? 0);
                if (id) {
                    workCentersMap.set(id, {
                        work_center_name: name,
                        overhead_cost_per_hour: cost
                    });
                }
            });
        }

        const operationsMap = new Map<number, { operation_name: string }>();
        if (operationsRes && operationsRes.ok) {
            const json = await operationsRes.json();
            (json.data || []).forEach((op: { id?: number; operation_id?: number; operation_name?: string; name?: string }) => {
                const name = op.operation_name || op.name || `Operation #${op.operation_id || op.id}`;
                if (op.operation_id) operationsMap.set(Number(op.operation_id), { operation_name: name });
                if (op.id) operationsMap.set(Number(op.id), { operation_name: name });
            });
        }

        // 4. Compute Component Diffs
        const getCompMap = (bomItems: RouteBOMItem[]) => {
            const map = new Map<number, ComponentInfo>();
            bomItems.forEach(item => {
                const pId = Number(item.product_id);
                const pInfo = componentProductsMap.get(pId);
                const qty = Number(item.quantity_required ?? 0);
                const wastage = Number(item.wastage_factor_percentage ?? 0);
                const uomStr = pInfo?.unit_shortcut || (typeof item.unit_of_measurement === "string" ? item.unit_of_measurement : "pcs");
                const name = item.product_name || pInfo?.product_name || `Product #${pId}`;
                const code = item.product_code || pInfo?.product_code || `P-${pId}`;
                const cost = Number(item.cost_per_unit ?? pInfo?.cost_per_unit ?? 0);

                if (map.has(pId)) {
                    const existing = map.get(pId)!;
                    existing.quantity += qty;
                    existing.wastageFactor = Math.max(existing.wastageFactor, wastage);
                } else {
                    map.set(pId, {
                        productId: pId,
                        productName: name,
                        productCode: code,
                        quantity: qty,
                        wastageFactor: wastage,
                        uom: uomStr,
                        costPerUnit: cost
                    });
                }
            });
            return map;
        };

        const targetCompMap = getCompMap(targetBomItems);
        const baseCompMap = getCompMap(baseBomItems);

        const allCompProductIds = [...new Set([...targetCompMap.keys(), ...baseCompMap.keys()])];

        const addedComps: Record<string, unknown>[] = [];
        const removedComps: Record<string, unknown>[] = [];
        const modifiedComps: Record<string, unknown>[] = [];
        const unchangedComps: Record<string, unknown>[] = [];
        const allCompDiffs: Record<string, unknown>[] = [];

        allCompProductIds.forEach(pId => {
            const targetC = targetCompMap.get(pId);
            const baseC = baseCompMap.get(pId);

            const productName = targetC?.productName || baseC?.productName || `Product #${pId}`;
            const productCode = targetC?.productCode || baseC?.productCode || `P-${pId}`;
            const uom = targetC?.uom || baseC?.uom || "pcs";
            const costPerUnit = targetC?.costPerUnit ?? baseC?.costPerUnit ?? 0;

            const baseQty = baseC ? baseC.quantity : 0;
            const targetQty = targetC ? targetC.quantity : 0;
            const qtyDiff = targetQty - baseQty;

            const baseWastage = baseC ? baseC.wastageFactor : 0;
            const targetWastage = targetC ? targetC.wastageFactor : 0;
            const wastageDiff = targetWastage - baseWastage;

            let status: "added" | "removed" | "modified" | "unchanged";
            if (!baseC && targetC) {
                status = "added";
            } else if (baseC && !targetC) {
                status = "removed";
            } else if (Math.abs(qtyDiff) > 0.0001 || Math.abs(wastageDiff) > 0.0001) {
                status = "modified";
            } else {
                status = "unchanged";
            }

            const diffItem = {
                productId: pId,
                product_id: pId,
                productName,
                product_name: productName,
                productCode,
                product_code: productCode,
                status,
                baseQuantity: baseQty,
                base_quantity: baseQty,
                targetQuantity: targetQty,
                target_quantity: targetQty,
                quantityDiff: qtyDiff,
                quantity_diff: qtyDiff,
                baseWastageFactor: baseWastage,
                base_wastage_factor: baseWastage,
                targetWastageFactor: targetWastage,
                target_wastage_factor: targetWastage,
                wastageFactorDiff: wastageDiff,
                wastage_factor_diff: wastageDiff,
                uom,
                unit_of_measurement: uom,
                costPerUnit,
                cost_per_unit: costPerUnit
            };

            allCompDiffs.push(diffItem);
            if (status === "added") addedComps.push(diffItem);
            else if (status === "removed") removedComps.push(diffItem);
            else if (status === "modified") modifiedComps.push(diffItem);
            else unchangedComps.push(diffItem);
        });

        const componentDiffs = {
            added: addedComps,
            removed: removedComps,
            modified: modifiedComps,
            unchanged: unchangedComps,
            all: allCompDiffs
        };

        // 5. Compute Routing Diffs
        const targetRoutes = targetBOM.routes || [];
        const baseRoutes = baseBOM.routes || [];

        const getRouteStepInfo = (r: RouteStep) => {
            const wcId = r.work_center_id ? Number(r.work_center_id) : null;
            const opId = r.operation_id ? Number(r.operation_id) : null;
            const wcInfo = wcId ? workCentersMap.get(wcId) : null;
            const opInfo = opId ? operationsMap.get(opId) : null;

            return {
                routeId: r.route_id,
                sequence: Number(r.sequence_order),
                setupTime: Number(r.setup_time_hours ?? 0),
                runTime: Number(r.run_time_hours ?? 0),
                workCenterId: wcId,
                workCenterName: wcInfo?.work_center_name || r.work_center?.work_center_name || (wcId ? `Work Center #${wcId}` : "N/A"),
                hourlyRate: Number(r.work_center?.overhead_cost_per_hour ?? wcInfo?.overhead_cost_per_hour ?? 0),
                operationId: opId,
                operationName: opInfo?.operation_name || (opId ? `Operation #${opId}` : "N/A")
            };
        };

        const targetRouteMap = new Map<number, ReturnType<typeof getRouteStepInfo>>();
        targetRoutes.forEach(r => {
            targetRouteMap.set(Number(r.sequence_order), getRouteStepInfo(r));
        });

        const baseRouteMap = new Map<number, ReturnType<typeof getRouteStepInfo>>();
        baseRoutes.forEach(r => {
            baseRouteMap.set(Number(r.sequence_order), getRouteStepInfo(r));
        });

        const allSequences = [...new Set([...targetRouteMap.keys(), ...baseRouteMap.keys()])].sort((a, b) => a - b);

        const addedRoutes: Record<string, unknown>[] = [];
        const removedRoutes: Record<string, unknown>[] = [];
        const modifiedRoutes: Record<string, unknown>[] = [];
        const unchangedRoutes: Record<string, unknown>[] = [];
        const allRouteDiffs: Record<string, unknown>[] = [];

        allSequences.forEach(seq => {
            const targetR = targetRouteMap.get(seq);
            const baseR = baseRouteMap.get(seq);

            const baseSetup = baseR ? baseR.setupTime : 0;
            const targetSetup = targetR ? targetR.setupTime : 0;
            const setupDiff = targetSetup - baseSetup;

            const baseRun = baseR ? baseR.runTime : 0;
            const targetRun = targetR ? targetR.runTime : 0;
            const runDiff = targetRun - baseRun;

            let status: "added" | "removed" | "modified" | "unchanged";
            if (!baseR && targetR) {
                status = "added";
            } else if (baseR && !targetR) {
                status = "removed";
            } else if (
                Math.abs(setupDiff) > 0.0001 ||
                Math.abs(runDiff) > 0.0001 ||
                baseR?.workCenterId !== targetR?.workCenterId ||
                baseR?.operationId !== targetR?.operationId
            ) {
                status = "modified";
            } else {
                status = "unchanged";
            }

            const diffItem = {
                sequence: seq,
                sequence_order: seq,
                status,
                baseStep: baseR || null,
                targetStep: targetR || null,
                setupTimeDiff: setupDiff,
                setup_time_diff: setupDiff,
                runTimeDiff: runDiff,
                run_time_diff: runDiff,
                workCenter: targetR?.workCenterName || baseR?.workCenterName || "N/A",
                operation: targetR?.operationName || baseR?.operationName || "N/A"
            };

            allRouteDiffs.push(diffItem);
            if (status === "added") addedRoutes.push(diffItem);
            else if (status === "removed") removedRoutes.push(diffItem);
            else if (status === "modified") modifiedRoutes.push(diffItem);
            else unchangedRoutes.push(diffItem);
        });

        const routingDiffs = {
            added: addedRoutes,
            removed: removedRoutes,
            modified: modifiedRoutes,
            unchanged: unchangedRoutes,
            all: allRouteDiffs
        };

        // 6. Compute Cost Impact
        const targetMatCost = Array.from(targetCompMap.values()).reduce((sum, c) => {
            const effectiveQty = c.quantity * (1 + (c.wastageFactor / 100));
            return sum + (effectiveQty * c.costPerUnit);
        }, 0);

        const baseMatCost = Array.from(baseCompMap.values()).reduce((sum, c) => {
            const effectiveQty = c.quantity * (1 + (c.wastageFactor / 100));
            return sum + (effectiveQty * c.costPerUnit);
        }, 0);

        const targetLabCost = Array.from(targetRouteMap.values()).reduce((sum, r) => {
            return sum + ((r.setupTime + r.runTime) * r.hourlyRate);
        }, 0);

        const baseLabCost = Array.from(baseRouteMap.values()).reduce((sum, r) => {
            return sum + ((r.setupTime + r.runTime) * r.hourlyRate);
        }, 0);

        const targetOverhead = Number(targetBOM.version?.custom_overhead ?? 0);
        const baseOverhead = Number(baseBOM.version?.custom_overhead ?? 0);

        const targetTotal = targetMatCost + targetLabCost + targetOverhead;
        const baseTotal = baseMatCost + baseLabCost + baseOverhead;

        const matCostDiff = targetMatCost - baseMatCost;
        const labCostDiff = targetLabCost - baseLabCost;
        const totalDiff = targetTotal - baseTotal;
        const percentageChange = baseTotal > 0 ? ((totalDiff / baseTotal) * 100) : 0;

        const costImpact = {
            baseMaterialCost: Number(baseMatCost.toFixed(2)),
            targetMaterialCost: Number(targetMatCost.toFixed(2)),
            materialCostDiff: Number(matCostDiff.toFixed(2)),

            baseLaborCost: Number(baseLabCost.toFixed(2)),
            targetLaborCost: Number(targetLabCost.toFixed(2)),
            laborCostDiff: Number(labCostDiff.toFixed(2)),

            baseCustomOverhead: Number(baseOverhead.toFixed(2)),
            targetCustomOverhead: Number(targetOverhead.toFixed(2)),
            customOverheadDiff: Number((targetOverhead - baseOverhead).toFixed(2)),

            baseTotalCost: Number(baseTotal.toFixed(2)),
            targetTotalCost: Number(targetTotal.toFixed(2)),
            totalCostDiff: Number(totalDiff.toFixed(2)),

            percentageChange: Number(percentageChange.toFixed(2))
        };

        const bomComponents = Array.from(targetCompMap.values()).map(c => ({
            product_id: c.productId,
            component_name: c.productName,
            component_code: c.productCode,
            quantity_required: c.quantity,
            wastage_factor_percentage: c.wastageFactor,
            uom: c.uom,
            cost_per_unit: c.costPerUnit,
            extended_cost: Number((c.quantity * (1 + (c.wastageFactor / 100)) * c.costPerUnit).toFixed(2))
        }));

        const routingSteps = (targetBOM.routes || []).map(r => {
            const raw = r as unknown as Record<string, unknown>;
            const wcId = Number(r.work_center_id);
            const opId = Number(r.operation_id);
            const wcInfo = wcId ? workCentersMap.get(wcId) : null;
            const opInfo = opId ? operationsMap.get(opId) : null;
            const setupTime = Number(raw.setup_time_minutes ?? Math.round((r.setup_time_hours || 0) * 60));
            const runTime = Number(raw.run_time_minutes ?? Math.round((r.run_time_hours || 0) * 60));
            return {
                step_number: Number(raw.step_number || r.sequence_order || 1),
                operation_name: opInfo?.operation_name || (raw.operation_name as string) || `Operation #${opId}`,
                work_center_name: wcInfo?.work_center_name || (raw.work_center_name as string) || r.work_center?.work_center_name || `Work Center #${wcId}`,
                setup_time_minutes: setupTime,
                run_time_minutes: runTime,
                total_time_minutes: setupTime + runTime
            };
        });

        const costSummary = {
            materialCost: Number(targetMatCost.toFixed(2)),
            laborCost: Number(targetLabCost.toFixed(2)),
            customOverhead: Number(targetOverhead.toFixed(2)),
            totalUnitCost: Number(targetTotal.toFixed(2))
        };

        return NextResponse.json({
            targetVersion: targetBOM.version,
            baseVersion: baseBOM.version,
            bomComponents,
            routingSteps,
            costSummary,
            componentDiffs,
            bomComparison: componentDiffs,
            routingDiffs,
            routingComparison: routingDiffs,
            costImpact
        });
    } catch (e) {
        console.error("Error in GET Product Version Comparison:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to compare product versions" },
            { status: 500 }
        );
    }
}
