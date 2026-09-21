import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    AssetDepreciationRecord,
    DepreciationScheduleSummary,
    DepartmentOption,
    PeriodPreset,
    AssetReportingStatus
} from "@/modules/business-intelligence-and-analytics/financial-management/fixed-assets-depreciation-schedule/types";
import {
    computeStraightLineMetrics,
    computeUOPMetrics,
    resolvePeriodDates,
    CalculatedDepreciationMetrics
} from "@/modules/business-intelligence-and-analytics/financial-management/fixed-assets-depreciation-schedule/utils/depreciationCalculations";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchSpringBootDepreciation(): Promise<Map<number, any>> {
    const yieldMap = new Map<number, any>();
    if (!SPRING_API_BASE_URL) return yieldMap;

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
                    const id = Number(item.asset_id || item.id);
                    if (!isNaN(id) && id > 0) {
                        yieldMap.set(id, item);
                    }
                }
            }
        }
    } catch (e) {
        console.warn("[Fixed Assets Depreciation] Spring Boot fetch notice:", e);
    }

    return yieldMap;
}

export async function GET(req: NextRequest) {
    try {
        if (!DIRECTUS_URL) {
            return NextResponse.json(
                { ok: false, error: "Directus API base URL is not configured." },
                { status: 500 }
            );
        }

        const { searchParams } = new URL(req.url);

        // Reference reporting parameters
        const requestedAsOf = searchParams.get("asOfDate") || new Date().toISOString().split("T")[0];
        const requestedPreset = (searchParams.get("periodPreset") || "fy_ytd") as PeriodPreset;
        const requestedCustomStart = searchParams.get("periodStartDate") || undefined;

        const { periodStartDate, asOfDate } = resolvePeriodDates(
            requestedPreset,
            requestedAsOf,
            requestedCustomStart
        );

        // Filters
        const filterAssetType = searchParams.get("assetType") || "ALL";
        const filterMethod = searchParams.get("depreciationMethod") || "ALL";
        const filterDepartment = searchParams.get("departmentId") || "ALL";
        const filterSearch = (searchParams.get("search") || "").trim().toLowerCase();
        const rawStatuses = searchParams.get("status");
        const statusFilters: AssetReportingStatus[] =
            rawStatuses && rawStatuses !== "ALL"
                ? (rawStatuses.split(",").map((s) => s.trim()) as AssetReportingStatus[])
                : [];

        const directusHeaders = getDirectusHeaders();

        // Concurrently fetch assets, departments, users, and SpringBoot live yield view
        const [assetsRes, deptRes, usersRes, springYieldMap] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/assets_and_equipment?limit=-1&sort=-id&fields=*,item_id.id,item_id.item_name,item_id.item_type.id,item_id.item_type.type_name,department.department_id,department.department_name,production_unit_id.unit_id,production_unit_id.unit_name,production_unit_id.unit_shortcut`,
                { headers: directusHeaders, cache: "no-store" }
            ),
            fetch(`${DIRECTUS_URL}/items/department?limit=-1&fields=department_id,department_name`, {
                headers: directusHeaders,
                cache: "no-store"
            }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, {
                headers: directusHeaders,
                cache: "no-store"
            }).catch(() => null),
            fetchSpringBootDepreciation()
        ]);

        if (!assetsRes.ok) {
            const errBody = await assetsRes.text().catch(() => "");
            return NextResponse.json(
                {
                    ok: false,
                    error: `Failed to fetch assets from database (Status ${assetsRes.status}): ${errBody.slice(0, 150)}`
                },
                { status: assetsRes.status }
            );
        }

        const assetsJson = await assetsRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawAssets: any[] = Array.isArray(assetsJson.data) ? assetsJson.data : [];

        // Parse departments
        let departments: DepartmentOption[] = [];
        if (deptRes && deptRes.ok) {
            const deptJson = await deptRes.json();
            departments = Array.isArray(deptJson.data) ? deptJson.data : [];
        }

        // Build users lookup map
        const userMap = new Map<number, string>();
        if (usersRes && usersRes.ok) {
            try {
                const usersJson = await usersRes.json();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rawUsers: any[] = Array.isArray(usersJson.data) ? usersJson.data : [];
                for (const u of rawUsers) {
                    const uid = Number(u.user_id);
                    if (!isNaN(uid)) {
                        const fullName = `${u.user_fname || ""} ${u.user_lname || ""}`.trim();
                        userMap.set(uid, fullName || `User #${uid}`);
                    }
                }
            } catch {
                // Ignore parsing errors for users map
            }
        }

        // Authoritative Calculation Engine
        const processedRecords: AssetDepreciationRecord[] = [];

        for (const raw of rawAssets) {
            const id = Number(raw.id);
            if (!id || isNaN(id)) continue;

            const itemId = Number(raw.item_id?.id || raw.item_id || 0);
            const itemName = raw.item_id?.item_name || `Asset #${id}`;
            const itemImage = raw.item_image || raw.item_id?.item_image || null;

            const assetType = (raw.asset_type || "Administrative") === "Production" ? "Production" : "Administrative";
            const depreciationMethod =
                raw.depreciation_method === "Units of Production"
                    ? "Units of Production"
                    : "Straight Line";

            const condition = raw.condition || "Good";
            const assetOrigin = raw.asset_origin === "Existing" ? "Existing" : "New";

            const deptId = raw.department?.department_id || raw.department || null;
            const deptName = raw.department?.department_name || (deptId ? `Dept #${deptId}` : "Unassigned");

            const empId = Number(raw.employee?.user_id || raw.employee || 0) || null;
            const empName = (empId ? userMap.get(empId) : null) || "Unassigned";

            const dateAcquired = raw.date_acquired ? String(raw.date_acquired).split("T")[0] : asOfDate;
            const depreciationStartDate = raw.depreciation_start_date
                ? String(raw.depreciation_start_date).split("T")[0]
                : dateAcquired;

            const acquisitionCost = Number(raw.acquisition_cost || raw.cost_per_item || raw.total || 0);
            const residualValue = Number(raw.residual_value || 0);
            const lifeSpanYears = Number(raw.life_span || 5);
            const lifeSpanMonths = Number(raw.useful_life_months || lifeSpanYears * 12);

            const openingBookValue =
                raw.opening_book_value !== null && raw.opening_book_value !== undefined
                    ? Number(raw.opening_book_value)
                    : null;
            const openingAccum = Number(raw.opening_accumulated_depreciation || 0);
            const openingUnits = Number(raw.opening_production_units || 0);
            const openingProdDate = raw.opening_production_date
                ? String(raw.opening_production_date).split("T")[0]
                : null;

            const maxCapacity =
                raw.maximum_unit_produced_capacity !== null && raw.maximum_unit_produced_capacity !== undefined
                    ? Number(raw.maximum_unit_produced_capacity)
                    : null;
            const prodUnitId = raw.production_unit_id?.unit_id || raw.production_unit_id || null;
            const prodUnitName = raw.production_unit_id?.unit_name || "Units";
            const prodUnitShortcut = raw.production_unit_id?.unit_shortcut || "units";

            // Live SpringBoot / MySQL view linkage
            const liveYield = springYieldMap.get(id);
            const actualUnitsProduced = liveYield?.production_units
                ? Number(liveYield.production_units)
                : openingUnits;

            let metrics: CalculatedDepreciationMetrics;
            if (depreciationMethod === "Units of Production") {
                metrics = computeUOPMetrics({
                    acquisitionCost,
                    residualValue,
                    maximumCapacity: maxCapacity,
                    actualUnitsProduced,
                    openingProductionUnits: openingUnits,
                    openingAccumulatedDepreciation: openingAccum,
                    assetOrigin,
                    openingBookValue,
                    periodStartDate,
                    asOfDate,
                    condition
                });
            } else {
                metrics = computeStraightLineMetrics({
                    acquisitionCost,
                    residualValue,
                    lifeSpanYears,
                    depreciationStartDate,
                    assetOrigin,
                    openingBookValue,
                    openingAccumulatedDepreciation: openingAccum,
                    openingProductionDate: openingProdDate,
                    periodStartDate,
                    asOfDate,
                    condition
                });
            }

            const record: AssetDepreciationRecord = {
                id,
                item_id: itemId,
                item_name: itemName,
                item_image: itemImage,
                serial: raw.serial || null,
                barcode: raw.barcode || null,
                rfid_code: raw.rfid_code || null,
                asset_type: assetType,
                depreciation_method: depreciationMethod,
                condition,
                department_id: deptId ? Number(deptId) : null,
                department_name: deptName,
                employee_id: empId ? Number(empId) : null,
                employee_name: empName,
                date_acquired: dateAcquired,
                depreciation_start_date: depreciationStartDate,
                asset_origin: assetOrigin,

                acquisition_cost: acquisitionCost,
                residual_value: residualValue,
                depreciable_base: metrics.depreciableBase,
                life_span_years: lifeSpanYears,
                life_span_months: lifeSpanMonths,

                opening_book_value: openingBookValue,
                opening_accumulated_depreciation: openingAccum,
                opening_production_units: openingUnits,
                opening_production_date: openingProdDate,

                maximum_unit_produced_capacity: maxCapacity,
                production_unit_id: prodUnitId ? Number(prodUnitId) : null,
                production_unit_name: prodUnitName,
                production_unit_shortcut: prodUnitShortcut,
                actual_units_produced: actualUnitsProduced,
                remaining_production_capacity:
                    metrics.remainingProductionCapacity !== undefined
                        ? metrics.remainingProductionCapacity
                        : Math.max(0, (maxCapacity || 0) - actualUnitsProduced),
                depreciation_per_unit: metrics.depreciationPerUnit || 0,

                beginning_accumulated_depreciation: metrics.beginningAccumulatedDepreciation,
                current_period_depreciation: metrics.currentPeriodDepreciation,
                ending_accumulated_depreciation: metrics.endingAccumulatedDepreciation,
                net_book_value: metrics.netBookValue,
                depreciated_percent: metrics.depreciatedPercent,
                status: metrics.status,
                is_fully_depreciated: metrics.isFullyDepreciated,
                months_in_service: metrics.monthsInService || 0,
                remaining_life_years: metrics.remainingLifeYears || 0,
                annual_depreciation_rate: metrics.annualDepreciationRate
            };

            processedRecords.push(record);
        }

        // Apply filters
        const filtered = processedRecords.filter((rec) => {
            if (filterAssetType !== "ALL" && rec.asset_type !== filterAssetType) return false;
            if (filterMethod !== "ALL" && rec.depreciation_method !== filterMethod) return false;
            if (filterDepartment !== "ALL") {
                if (String(rec.department_id) !== filterDepartment) return false;
            }
            if (statusFilters.length > 0 && !statusFilters.includes(rec.status)) return false;
            if (filterSearch) {
                const searchCorpus = `${rec.id} ${rec.item_name} ${rec.serial || ""} ${rec.barcode || ""} ${rec.department_name}`.toLowerCase();
                if (!searchCorpus.includes(filterSearch)) return false;
            }
            return true;
        });

        // Compute summary KPIs on filtered dataset
        let totalCost = 0;
        let totalSalvage = 0;
        let totalBase = 0;
        let totalBeginning = 0;
        let totalPeriod = 0;
        let totalEnding = 0;
        let totalNbv = 0;

        let activeCount = 0;
        let fullyDeprCount = 0;
        let discontinuedCount = 0;
        let underMaintenanceCount = 0;

        for (const rec of filtered) {
            totalCost += rec.acquisition_cost;
            totalSalvage += rec.residual_value;
            totalBase += rec.depreciable_base;
            totalBeginning += rec.beginning_accumulated_depreciation;
            totalPeriod += rec.current_period_depreciation;
            totalEnding += rec.ending_accumulated_depreciation;
            totalNbv += rec.net_book_value;

            if (rec.status === "Active") activeCount++;
            else if (rec.status === "Fully Depreciated") fullyDeprCount++;
            else if (rec.status === "Discontinued") discontinuedCount++;
            else if (rec.status === "Under Maintenance") underMaintenanceCount++;
        }

        const summary: DepreciationScheduleSummary = {
            total_assets_count: filtered.length,
            active_assets_count: activeCount,
            fully_depreciated_count: fullyDeprCount,
            discontinued_count: discontinuedCount,
            under_maintenance_count: underMaintenanceCount,
            total_acquisition_cost: Math.round(totalCost * 100) / 100,
            total_salvage_value: Math.round(totalSalvage * 100) / 100,
            total_depreciable_base: Math.round(totalBase * 100) / 100,
            total_beginning_accum_depreciation: Math.round(totalBeginning * 100) / 100,
            total_current_period_depreciation: Math.round(totalPeriod * 100) / 100,
            total_ending_accum_depreciation: Math.round(totalEnding * 100) / 100,
            total_net_book_value: Math.round(totalNbv * 100) / 100
        };

        return NextResponse.json({
            ok: true,
            data: filtered,
            summary,
            departments,
            asOfDate,
            periodStartDate,
            periodPreset: requestedPreset,
            meta: {
                generatedAt: new Date().toISOString(),
                totalCount: filtered.length
            }
        });
    } catch (err: unknown) {
        console.error("[Fixed Assets Depreciation API Error]:", err);
        const errorMsg = err instanceof Error ? err.message : "Internal server error occurred";
        return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
    }
}
