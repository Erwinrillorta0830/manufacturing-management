import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    ProductionAssetMaster,
    WorkCenterOption,
    MachineDepreciationSummaryMetrics,
    RoutingCostingImpact,
    WorkCenterImpactSummary
} from "@/modules/business-intelligence-and-analytics/financial-management/machine-depreciation-overhead-allocation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";
const SPRING_API_BASE_URL = process.env.SPRING_API_BASE_URL?.replace(/\/+$/, "") || "";

function getDirectusHeaders(): Record<string, string> {
    const h: Record<string, string> = {
        "Content-Type": "application/json"
    };
    if (DIRECTUS_TOKEN) {
        h["Authorization"] = `Bearer ${DIRECTUS_TOKEN}`;
    }
    return h;
}

// Helper to fetch Spring Boot /api/asset-depreciation if available
async function fetchSpringBootDepreciation(): Promise<Map<number, Record<string, unknown>>> {
    const map = new Map<number, Record<string, unknown>>();
    if (!SPRING_API_BASE_URL) return map;

    try {
        const cookieStore = await cookies();
        const springToken =
            cookieStore.get("springboot_token")?.value || cookieStore.get("vos_access_token")?.value;

        const res = await fetch(`${SPRING_API_BASE_URL}/api/asset-depreciation`, {
            headers: {
                ...(springToken ? { Authorization: `Bearer ${springToken}` } : {}),
                "Content-Type": "application/json"
            },
            cache: "no-store"
        });

        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                for (const item of data) {
                    const id = Number(item.asset_id || item.id || item.assetId);
                    if (!isNaN(id) && id > 0) {
                        map.set(id, item);
                    }
                }
            }
        }
    } catch (e) {
        console.warn("[Machine Depreciation BIA] Spring Boot notice:", e);
    }

    return map;
}

export async function GET(req: NextRequest) {
    try {
        if (!DIRECTUS_URL) {
            return NextResponse.json(
                { ok: false, error: "Directus API base URL is not configured." },
                { status: 500 }
            );
        }

        const directusHeaders = getDirectusHeaders();
        const searchParams = req.nextUrl.searchParams;
        const view = searchParams.get("view");

        // -------------------------------------------------------------------------
        // Case A: Targeted Costing Impact Simulation Query
        // /api/.../machine-depreciation-overhead-allocation?view=impact&work_center_id=12&simulated_rate=84.5
        // -------------------------------------------------------------------------
        if (view === "impact") {
            const workCenterIdStr = searchParams.get("work_center_id");
            const workCenterId = parseInt(workCenterIdStr || "", 10);

            if (isNaN(workCenterId) || workCenterId <= 0) {
                return NextResponse.json(
                    { ok: false, error: "Valid work_center_id is required for Costing Impact simulation." },
                    { status: 400 }
                );
            }

            // 1. Fetch work center details
            const wcRes = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_work_centers?filter[work_center_id][_eq]=${workCenterId}&limit=1&fields=work_center_id,work_center_name,asset_id,overhead_cost_per_hour,capacity_per_hour,is_active`,
                { headers: directusHeaders, cache: "no-store" }
            );

            if (!wcRes.ok) {
                return NextResponse.json(
                    { ok: false, error: "Failed to retrieve work center details." },
                    { status: 502 }
                );
            }

            const wcJson = await wcRes.json();
            const wc = wcJson.data?.[0];
            if (!wc) {
                return NextResponse.json(
                    { ok: false, error: "Work center not found in database." },
                    { status: 404 }
                );
            }

            const currentRate = Number(wc.overhead_cost_per_hour || 0);

            // Derive BIA calculated candidate burden rate from linked asset if available
            let calculatedBurdenRate = currentRate;
            if (wc.asset_id) {
                const assetRes = await fetch(
                    `${DIRECTUS_URL}/items/assets_and_equipment/${wc.asset_id}?fields=id,depreciation_method,acquisition_cost,residual_value,life_span,maximum_unit_produced_capacity`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null);

                if (assetRes && assetRes.ok) {
                    const aJson = await assetRes.json();
                    const a = aJson.data;
                    if (a) {
                        const acq = Number(a.acquisition_cost || 0);
                        const resVal = Number(a.residual_value || 0);
                        const depBase = Math.max(0, acq - resVal);
                        const life = Number(a.life_span || 10);
                        const isSL = !String(a.depreciation_method || "").toLowerCase().includes("unit");
                        if (isSL && life > 0) {
                            const annualDep = depBase / life;
                            calculatedBurdenRate = annualDep / 3000;
                        } else if (!isSL && a.maximum_unit_produced_capacity && wc.capacity_per_hour) {
                            const maxCap = Number(a.maximum_unit_produced_capacity);
                            const wcCap = Number(wc.capacity_per_hour);
                            if (maxCap > 0 && wcCap > 0) {
                                calculatedBurdenRate = (depBase / maxCap) * wcCap;
                            }
                        }
                    }
                }
            }

            // Server-side validation of simulated_rate parameter
            const simulatedRateParam = searchParams.get("simulated_rate");
            let simulatedRate = calculatedBurdenRate;

            if (simulatedRateParam != null && simulatedRateParam.trim() !== "") {
                const parsed = parseFloat(simulatedRateParam);
                if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999999.9999) {
                    return NextResponse.json(
                        { ok: false, error: "simulated_rate must be a finite number within the DECIMAL(10,4) range (0.0000 through 999,999.9999)." },
                        { status: 400 }
                    );
                }
                simulatedRate = parsed;
            }

            // 2. Fetch routing steps assigned to this work center
            const routesRes = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_routes?filter[work_center_id][_eq]=${workCenterId}&sort=sequence_order&limit=-1&fields=route_id,version_id,work_center_id,operation_id,sequence_order,setup_time_hours,run_time_hours,step_batch_size`,
                { headers: directusHeaders, cache: "no-store" }
            );

            const routesJson = routesRes.ok ? await routesRes.json() : { data: [] };
            const routesRaw: Record<string, unknown>[] = routesJson.data || [];

            if (routesRaw.length === 0) {
                const emptySummary: WorkCenterImpactSummary = {
                    work_center_id: wc.work_center_id,
                    work_center_name: wc.work_center_name || "Work Station",
                    current_rate: currentRate,
                    calculated_burden_rate: calculatedBurdenRate,
                    simulated_rate: simulatedRate,
                    hourly_variance: simulatedRate - currentRate,
                    total_affected_products: 0,
                    total_affected_routes: 0,
                    routes: []
                };
                return NextResponse.json({ ok: true, summary: emptySummary });
            }

            // 3. Resolve version, product, and operation master metadata
            const versionIds = Array.from(new Set(routesRaw.map(r => Number(r.version_id)).filter(id => id > 0)));
            const operationIds = Array.from(new Set(routesRaw.map(r => Number(r.operation_id)).filter(id => id > 0)));

            const [versionsRes, opsRes] = await Promise.all([
                versionIds.length > 0
                    ? fetch(
                        `${DIRECTUS_URL}/items/product_manufacturing_version?filter[version_id][_in]=${versionIds.join(",")}&limit=-1&fields=version_id,version_name,product_id`,
                        { headers: directusHeaders, cache: "no-store" }
                    ).catch(() => null)
                    : null,
                operationIds.length > 0
                    ? fetch(
                        `${DIRECTUS_URL}/items/manufacturing_operations?filter[id][_in]=${operationIds.join(",")}&limit=-1&fields=id,operation_name`,
                        { headers: directusHeaders, cache: "no-store" }
                    ).catch(() => null)
                    : null
            ]);

            const versionsMap = new Map<number, { version_name: string; product_id: number }>();
            const productIdsToFetch: number[] = [];

            if (versionsRes && versionsRes.ok) {
                const vJson = await versionsRes.json();
                for (const v of vJson.data || []) {
                    const vid = Number(v.version_id);
                    const pid = Number(
                        typeof v.product_id === "object" && v.product_id
                            ? (v.product_id as { product_id?: number; id?: number }).product_id || (v.product_id as { id?: number }).id
                            : v.product_id
                    ) || 0;

                    const verName = String(v.version_name || `Version #${vid}`);
                    versionsMap.set(vid, {
                        version_name: verName,
                        product_id: pid
                    });
                    if (pid > 0) {
                        productIdsToFetch.push(pid);
                    }
                }
            }

            // Fetch product master details from products table
            const productsMap = new Map<number, string>();
            if (productIdsToFetch.length > 0) {
                const uniqueProdIds = Array.from(new Set(productIdsToFetch));
                const prodsRes = await fetch(
                    `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${uniqueProdIds.join(",")}&limit=-1&fields=product_id,product_name,product_code`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null);

                if (prodsRes && prodsRes.ok) {
                    const pJson = await prodsRes.json();
                    for (const p of pJson.data || []) {
                        const pid = Number(p.product_id);
                        const pName = p.product_name || p.product_code || `Product #${pid}`;
                        productsMap.set(pid, String(pName));
                    }
                }
            }

            // Operations Map
            const opsMap = new Map<number, string>();
            if (opsRes && opsRes.ok) {
                const oJson = await opsRes.json();
                for (const o of oJson.data || []) {
                    opsMap.set(Number(o.id), o.operation_name || "Manufacturing Step");
                }
            }

            // 4. Faithfully reproduce Manufacturing routing costing calculation
            // Semantics: Cycle Time = setup_time_hours + run_time_hours
            // Batch Overhead = hourlyRate * Cycle Time
            // Unit Overhead = Batch Overhead / step_batch_size
            const simulatedRoutes: RoutingCostingImpact[] = routesRaw.map(r => {
                const routeId = Number(r.route_id);
                const seq = Number(r.sequence_order || 10);
                const opId = Number(r.operation_id || 0);
                const verId = Number(r.version_id || 0);

                const verMeta = versionsMap.get(verId);
                const prodId = verMeta?.product_id || 0;
                const prodName = (prodId > 0 ? productsMap.get(prodId) : null) || (prodId > 0 ? `Product #${prodId}` : "Finished Good");
                const verName = verMeta?.version_name || (verId > 0 ? `Version #${verId}` : "Standard Version");
                const opName = opsMap.get(opId) || `Operation #${seq}`;

                const setupHours = Math.max(0, Number(r.setup_time_hours || 0));
                const runHours = Math.max(0, Number(r.run_time_hours || 0));
                const cycleTime = setupHours + runHours;
                const batchSize = Math.max(0.0001, Number(r.step_batch_size || 1));

                const currentBatchCost = currentRate * cycleTime;
                const currentUnitCost = currentBatchCost / batchSize;

                const simBatchCost = simulatedRate * cycleTime;
                const simUnitCost = simBatchCost / batchSize;

                return {
                    route_id: routeId,
                    sequence_order: seq,
                    operation_name: opName,
                    product_id: prodId,
                    product_name: prodName,
                    version_id: verId,
                    version_name: verName,
                    version_number: null,
                    work_center_id: wc.work_center_id,
                    work_center_name: wc.work_center_name || "Work Station",
                    setup_time_hours: setupHours,
                    run_time_hours: runHours,
                    cycle_time_hours: cycleTime,
                    step_batch_size: batchSize,
                    current_overhead_cost_per_batch: currentBatchCost,
                    current_overhead_cost_per_unit: currentUnitCost,
                    simulated_overhead_cost_per_batch: simBatchCost,
                    simulated_overhead_cost_per_unit: simUnitCost,
                    cogm_variance_per_batch: simBatchCost - currentBatchCost,
                    cogm_variance_per_unit: simUnitCost - currentUnitCost
                };
            });

            const uniqueAffectedProducts = new Set(simulatedRoutes.map(sr => sr.product_id).filter(id => id > 0));

            const impactSummary: WorkCenterImpactSummary = {
                work_center_id: wc.work_center_id,
                work_center_name: wc.work_center_name || "Work Station",
                current_rate: currentRate,
                calculated_burden_rate: calculatedBurdenRate,
                simulated_rate: simulatedRate,
                hourly_variance: simulatedRate - currentRate,
                total_affected_products: uniqueAffectedProducts.size,
                total_affected_routes: simulatedRoutes.length,
                routes: simulatedRoutes
            };

            return NextResponse.json({ ok: true, summary: impactSummary });
        }

        // -------------------------------------------------------------------------
        // Case B: Main Report Query (Option A: Direct Collections Query)
        // Queries canonical Directus collections:
        // 1. assets_and_equipment (filtered for asset_type=Production with relational joins)
        // 2. manufacturing_work_centers (operational work centers)
        // 3. Spring Boot asset depreciation (if available for live yield metrics)
        // This avoids Directus custom view permission restrictions (HTTP 403).
        // -------------------------------------------------------------------------
        const [assetsRes, wcRes, springMap] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/assets_and_equipment?filter[asset_type][_eq]=Production&limit=-1&sort=-id&fields=*,item_id.id,item_id.item_name,department.department_id,department.department_name,production_unit_id.unit_id,production_unit_id.unit_name,production_unit_id.unit_shortcut`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name,asset_id,overhead_cost_per_hour,capacity_per_hour,is_active`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetchSpringBootDepreciation()
        ]);

        if (!assetsRes || !assetsRes.ok) {
            const status = assetsRes?.status || 500;
            const errBody = await assetsRes?.text().catch(() => "");
            return NextResponse.json(
                {
                    ok: false,
                    error: `Failed to fetch production assets from database (HTTP ${status}): ${errBody?.slice(0, 150) || "Unknown error"}`
                },
                { status: 500 }
            );
        }

        const assetsJson = await assetsRes.json();
        const rawAssets: Record<string, unknown>[] = Array.isArray(assetsJson.data) ? assetsJson.data : [];

        // Fetch work center options & build multi-value lookup map by asset_id
        const wcData: Record<string, unknown>[] = wcRes && wcRes.ok ? (await wcRes.json()).data || [] : [];
        const wcByAssetId = new Map<number, WorkCenterOption[]>();
        const allWorkCenters: WorkCenterOption[] = wcData.map((wc) => {
            const opt: WorkCenterOption = {
                work_center_id: Number(wc.work_center_id),
                work_center_name: String(wc.work_center_name || "Work Station"),
                asset_id: wc.asset_id ? Number(wc.asset_id) : null,
                overhead_cost_per_hour: Number(wc.overhead_cost_per_hour || 0),
                capacity_per_hour: wc.capacity_per_hour ? Number(wc.capacity_per_hour) : null,
                is_active: wc.is_active !== 0 && wc.is_active !== false
            };
            if (opt.asset_id) {
                const existing = wcByAssetId.get(opt.asset_id) || [];
                existing.push(opt);
                wcByAssetId.set(opt.asset_id, existing);
            }
            return opt;
        });

        // Map asset records into ProductionAssetMaster domain model
        const mergedAssets: ProductionAssetMaster[] = rawAssets.map((row) => {
            const assetId = Number(row.id);
            const springItem = springMap.get(assetId);

            // Item Name resolution
            let itemName = "Production Machine";
            if (row.item_id && typeof row.item_id === "object" && "item_name" in (row.item_id as Record<string, unknown>)) {
                itemName = String((row.item_id as { item_name: string }).item_name);
            } else if (row.item_name) {
                itemName = String(row.item_name);
            }

            // Department resolution
            let deptName: string | null = null;
            if (row.department && typeof row.department === "object" && "department_name" in (row.department as Record<string, unknown>)) {
                deptName = String((row.department as { department_name: string }).department_name);
            } else if (typeof row.department === "string") {
                deptName = row.department;
            }

            // Production Unit resolution
            let prodUnitId: number | null = null;
            let prodUnitName: string | null = null;
            let prodUnitShortcut: string | null = null;
            if (row.production_unit_id && typeof row.production_unit_id === "object") {
                const u = row.production_unit_id as Record<string, unknown>;
                prodUnitId = Number(u.unit_id || u.id) || null;
                prodUnitName = (u.unit_name as string) || null;
                prodUnitShortcut = (u.unit_shortcut as string) || null;
            } else if (typeof row.production_unit_id === "number") {
                prodUnitId = row.production_unit_id;
            }

            const acquisitionCost = Number(row.acquisition_cost ?? springItem?.acquisition_cost ?? 0);
            const residualValue = Number(row.residual_value ?? springItem?.residual_value ?? 0);
            const depreciableAmount = Math.max(0, acquisitionCost - residualValue);

            const methodStr = String(row.depreciation_method ?? "Straight Line");
            const depreciationMethod: "Straight Line" | "Units of Production" =
                methodStr.toLowerCase().includes("unit") ? "Units of Production" : "Straight Line";

            const lifeSpanYears = Number(
                row.life_span ?? (springItem as { life_span?: number } | undefined)?.life_span ?? 5
            );

            const maxCapacity = Number(row.maximum_unit_produced_capacity ?? 0);
            const deprPerUnit = maxCapacity > 0 ? depreciableAmount / maxCapacity : null;

            // Linked operational work centers from Manufacturing (supports multiple work centers per asset)
            const linkedWcs = wcByAssetId.get(assetId) || [];
            const primaryWc = linkedWcs[0];

            return {
                asset_id: assetId,
                item_id: typeof row.item_id === "number" ? row.item_id : ((row.item_id as { id?: number } | undefined)?.id || null),
                item_name: itemName,
                serial: (row.serial as string) || null,
                barcode: (row.barcode as string) || null,
                rfid_code: (row.rfid_code as string) || null,
                department_id: null,
                department_name: deptName,
                date_acquired: (row.date_acquired as string) || null,
                depreciation_start_date: (row.depreciation_start_date as string) || null,
                depreciation_method: depreciationMethod,
                acquisition_cost: acquisitionCost,
                residual_value: residualValue,
                depreciable_amount: depreciableAmount,
                life_span: lifeSpanYears > 0 ? lifeSpanYears : 5,
                maximum_unit_produced_capacity: maxCapacity > 0 ? maxCapacity : null,
                production_unit_id: prodUnitId,
                production_unit: prodUnitName,
                production_unit_shortcut: prodUnitShortcut,
                depreciation_per_unit: deprPerUnit,
                production_units: Number(springItem?.productionUnits ?? 0),
                remaining_production_capacity: Number(springItem?.remainingProductionCapacity ?? 0),
                production_depreciation: Number(springItem?.productionDepreciation ?? 0),
                work_center_id: primaryWc?.work_center_id ?? null,
                work_center_name: primaryWc?.work_center_name ?? null,
                current_work_center_rate: primaryWc?.overhead_cost_per_hour || 0,
                work_center_capacity_per_hour: primaryWc?.capacity_per_hour ?? null,
                assigned_work_centers: linkedWcs
            };
        });

        // Calculate Summary KPIs
        const totalAnnualDepr = mergedAssets.reduce((sum, a) => {
            if (a.depreciation_method === "Straight Line" && a.life_span && a.life_span > 0) {
                return sum + (a.depreciable_amount / a.life_span);
            }
            return sum;
        }, 0);

        const assignedWcCount = mergedAssets.filter(a => Boolean(a.work_center_id || (a.assigned_work_centers && a.assigned_work_centers.length > 0))).length;
        const unassignedCount = mergedAssets.length - assignedWcCount;

        const activeRates = allWorkCenters.filter(w => w.overhead_cost_per_hour > 0);
        const avgHourlyBurden = activeRates.length > 0
            ? activeRates.reduce((sum, w) => sum + w.overhead_cost_per_hour, 0) / activeRates.length
            : 0;

        const summary: MachineDepreciationSummaryMetrics = {
            total_production_assets: mergedAssets.length,
            total_annual_depreciation: totalAnnualDepr,
            average_hourly_burden: avgHourlyBurden,
            assigned_work_centers_count: assignedWcCount,
            unassigned_assets_count: unassignedCount
        };

        return NextResponse.json({
            ok: true,
            assets: mergedAssets,
            workCenters: allWorkCenters,
            summary
        });
    } catch (err: unknown) {
        console.error("[BIA Machine Depreciation GET Error]:", err);
        const msg = err instanceof Error ? err.message : "Internal server error retrieving machine depreciation report";
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}

/**
 * PATCH: Apply the reviewed/calculated hourly rate to manufacturing_work_centers.overhead_cost_per_hour.
 *
 * Server-side validations:
 * 1. Valid Identifier: work_center_id must reference an existing active work center.
 * 2. Non-negative finite rate within DECIMAL(10,4) database range.
 * 3. Optimistic concurrency protection: rejects update if current rate != expected_current_rate.
 * 4. Verifies asset linkage if provided.
 * 5. Atomic Rate Update: Updates the work center rate in Directus and returns the confirmation.
 */
export async function PATCH(req: NextRequest) {
    try {
        if (!DIRECTUS_URL) {
            return NextResponse.json(
                { ok: false, error: "Directus API base URL is not configured." },
                { status: 500 }
            );
        }

        const directusHeaders = getDirectusHeaders();
        const body = await req.json();

        const workCenterId = parseInt(body.work_center_id, 10);
        if (isNaN(workCenterId) || workCenterId <= 0) {
            return NextResponse.json(
                { ok: false, error: "Valid work_center_id must reference an existing active work center." },
                { status: 400 }
            );
        }

        const newRate = Number(body.new_overhead_cost_per_hour);
        if (!Number.isFinite(newRate) || newRate < 0 || newRate > 999999.9999) {
            return NextResponse.json(
                { ok: false, error: "Calculated overhead rate must be a finite number within the DECIMAL(10,4) range (0.0000 through 999,999.9999)." },
                { status: 400 }
            );
        }

        const expectedCurrentRate = Number(body.expected_current_rate);
        if (!Number.isFinite(expectedCurrentRate)) {
            return NextResponse.json(
                { ok: false, error: "expected_current_rate is required for concurrency verification." },
                { status: 400 }
            );
        }

        // 1. Fetch current work center record to verify existence and concurrency
        const fetchWcRes = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_work_centers?filter[work_center_id][_eq]=${workCenterId}&limit=1&fields=work_center_id,work_center_name,asset_id,overhead_cost_per_hour,is_active`,
            { headers: directusHeaders, cache: "no-store" }
        );

        if (!fetchWcRes.ok) {
            return NextResponse.json(
                { ok: false, error: "Failed to connect to Manufacturing Work Center master data." },
                { status: 502 }
            );
        }

        const wcJson = await fetchWcRes.json();
        const existingWc = wcJson.data?.[0];

        if (!existingWc) {
            return NextResponse.json(
                { ok: false, error: "Work center not found in database." },
                { status: 404 }
            );
        }

        if (existingWc.is_active === 0 || existingWc.is_active === false) {
            return NextResponse.json(
                { ok: false, error: "Cannot apply rate to an inactive work center." },
                { status: 400 }
            );
        }

        // 2. Optimistic Concurrency Protection
        const currentDbRate = Number(existingWc.overhead_cost_per_hour || 0);
        if (Math.abs(currentDbRate - expectedCurrentRate) > 0.0001) {
            return NextResponse.json(
                {
                    ok: false,
                    error: `The work-center rate changed since this calculation was loaded (Current: ₱${currentDbRate.toFixed(4)}/hr, Expected: ₱${expectedCurrentRate.toFixed(4)}/hr). Please refresh and recalculate.`
                },
                { status: 409 }
            );
        }

        // 3. Prepare Update Payload
        const updatePayload: Record<string, unknown> = {
            overhead_cost_per_hour: newRate
        };

        // If asset_id is provided, optionally link or update work center asset assignment
        if (body.asset_id) {
            const bodyAssetId = Number(body.asset_id);
            if (bodyAssetId > 0 && (!existingWc.asset_id || body.assign_asset)) {
                updatePayload.asset_id = bodyAssetId;
            }
        }

        // 4. Atomic Rate Update: Patch manufacturing_work_centers
        const patchRes = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_work_centers/${workCenterId}`,
            {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify(updatePayload)
            }
        );

        if (!patchRes.ok) {
            const patchErr = await patchRes.text();
            console.error("[BIA Machine Depreciation PATCH Work Center Error]:", patchErr);
            return NextResponse.json(
                { ok: false, error: "Failed to persist updated rate to Manufacturing Work Center." },
                { status: 502 }
            );
        }

        return NextResponse.json({
            ok: true,
            message: `Work center overhead rate successfully updated from ₱${currentDbRate.toFixed(4)}/hr to ₱${newRate.toFixed(4)}/hr.`,
            work_center_id: workCenterId,
            work_center_name: existingWc.work_center_name || "Work Station",
            previous_rate: currentDbRate,
            new_rate: newRate,
            updated_at: new Date().toISOString()
        });
    } catch (err: unknown) {
        console.error("[BIA Machine Depreciation PATCH Error]:", err);
        const msg = err instanceof Error ? err.message : "Internal server error applying rate";
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
