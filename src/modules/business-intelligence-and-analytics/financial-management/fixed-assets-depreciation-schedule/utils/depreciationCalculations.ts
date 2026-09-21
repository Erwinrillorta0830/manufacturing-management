import {
    AssetDepreciationRecord,
    AmortizationScheduleRow,
    AssetAmortizationDetail,
    AssetReportingStatus,
    PeriodPreset
} from "../types";

/**
 * Parses date string (YYYY-MM-DD or ISO) safely into UTC midnight Date
 */
export function parseDateSafe(dateVal: string | Date | null | undefined): Date {
    if (!dateVal) return new Date();
    if (dateVal instanceof Date) return dateVal;
    const str = String(dateVal).split("T")[0].trim();
    const parts = str.split("-");
    if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            return new Date(Date.UTC(y, m, d));
        }
    }
    const parsed = new Date(dateVal);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Calculates whole and fractional elapsed months between two UTC dates
 */
export function getElapsedMonths(start: Date, end: Date): number {
    if (end < start) return 0;
    const yearDiff = end.getUTCFullYear() - start.getUTCFullYear();
    const monthDiff = end.getUTCMonth() - start.getUTCMonth();
    let totalMonths = yearDiff * 12 + monthDiff;

    // Fractional month based on days in end month
    const daysInEndMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    const dayRatio = Math.min(1, end.getUTCDate() / daysInEndMonth);
    totalMonths += dayRatio;

    return Math.max(0, totalMonths);
}

/**
 * Returns beginning and ending date strings for a given period preset and reference As-Of Date
 */
export function resolvePeriodDates(
    preset: PeriodPreset,
    asOfDateStr: string,
    customStartDate?: string
): { periodStartDate: string; asOfDate: string } {
    const asOf = parseDateSafe(asOfDateStr);
    const y = asOf.getUTCFullYear();
    const m = asOf.getUTCMonth();

    let start: Date;

    switch (preset) {
        case "current_month":
            start = new Date(Date.UTC(y, m, 1));
            break;
        case "current_quarter": {
            const qMonth = Math.floor(m / 3) * 3;
            start = new Date(Date.UTC(y, qMonth, 1));
            break;
        }
        case "current_year":
        case "fy_ytd":
            // Fiscal Year starts Jan 1
            start = new Date(Date.UTC(y, 0, 1));
            break;
        case "prior_year":
            start = new Date(Date.UTC(y - 1, 0, 1));
            break;
        case "custom":
        default:
            if (customStartDate) {
                start = parseDateSafe(customStartDate);
            } else {
                start = new Date(Date.UTC(y, 0, 1));
            }
            break;
    }

    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

    return {
        periodStartDate: fmt(start),
        asOfDate: fmt(asOf)
    };
}

/**
 * Evaluates reporting status of an asset based on condition and book value
 */
export function evaluateAssetStatus(
    condition: string,
    nbv: number,
    salvageValue: number,
    acquisitionCost: number
): AssetReportingStatus {
    const condNorm = condition ? condition.trim().toLowerCase() : "";
    if (condNorm.includes("discontinued") || condNorm.includes("scrapped")) {
        return "Discontinued";
    }
    if (condNorm.includes("maintenance")) {
        return "Under Maintenance";
    }
    if (condNorm.includes("bad")) {
        return "Bad";
    }
    if (nbv <= salvageValue + 0.01 && acquisitionCost > 0) {
        return "Fully Depreciated";
    }
    return "Active";
}

export interface CalculatedDepreciationMetrics {
    depreciableBase: number;
    beginningAccumulatedDepreciation: number;
    currentPeriodDepreciation: number;
    endingAccumulatedDepreciation: number;
    netBookValue: number;
    depreciatedPercent: number;
    status: AssetReportingStatus;
    isFullyDepreciated: boolean;
    monthsInService: number;
    remainingLifeYears: number;
    annualDepreciationRate: number;
    depreciationPerUnit: number;
    remainingProductionCapacity: number;
}

/**
 * Computes period depreciation metrics for Straight-Line assets
 */
export function computeStraightLineMetrics(params: {
    acquisitionCost: number;
    residualValue: number;
    lifeSpanYears: number;
    depreciationStartDate: string;
    assetOrigin: "New" | "Existing";
    openingBookValue: number | null;
    openingAccumulatedDepreciation: number;
    openingProductionDate: string | null;
    periodStartDate: string;
    asOfDate: string;
    condition: string;
}): CalculatedDepreciationMetrics {
    const {
        acquisitionCost,
        residualValue,
        lifeSpanYears,
        depreciationStartDate,
        assetOrigin,
        openingBookValue,
        openingAccumulatedDepreciation,
        openingProductionDate,
        periodStartDate,
        asOfDate,
        condition
    } = params;

    const depreciableBase = Math.max(0, acquisitionCost - residualValue);
    const lifeYears = Math.max(0.1, lifeSpanYears || 5);
    const totalLifeMonths = lifeYears * 12;

    const startDate = parseDateSafe(depreciationStartDate);
    const periodStart = parseDateSafe(periodStartDate);
    const cutoffDate = parseDateSafe(asOfDate);

    // Initial base annual & monthly rates
    const initialAnnualRate = depreciableBase / lifeYears;
    const initialMonthlyRate = initialAnnualRate / 12;

    let beginningAccum = 0;
    let endingAccum = 0;

    if (assetOrigin === "Existing") {
        // Cutover mechanics:
        // Use opening values as baseline
        const cutoverDate = parseDateSafe(openingProductionDate || depreciationStartDate);
        const bookValueAtCutover =
            openingBookValue !== null && openingBookValue !== undefined
                ? openingBookValue
                : Math.max(residualValue, acquisitionCost - openingAccumulatedDepreciation);

        const remainingDepreciableBase = Math.max(0, bookValueAtCutover - residualValue);

        // Estimate remaining useful life post-cutover
        const yearsAlreadyDepreciated =
            initialAnnualRate > 0 ? openingAccumulatedDepreciation / initialAnnualRate : 0;
        const remainingLifeYears = Math.max(0.25, lifeYears - yearsAlreadyDepreciated);
        const remainingLifeMonths = remainingLifeYears * 12;
        const monthlyRatePostCutover =
            remainingLifeMonths > 0 ? remainingDepreciableBase / remainingLifeMonths : 0;

        // Elapsed months from cutover to periodStart and to cutoffDate
        const monthsFromCutoverToPeriodStart = getElapsedMonths(cutoverDate, periodStart);
        const monthsFromCutoverToCutoff = getElapsedMonths(cutoverDate, cutoffDate);

        const accumPrePeriodPostCutover = Math.min(
            remainingDepreciableBase,
            monthsFromCutoverToPeriodStart * monthlyRatePostCutover
        );
        const accumTotalPostCutover = Math.min(
            remainingDepreciableBase,
            monthsFromCutoverToCutoff * monthlyRatePostCutover
        );

        beginningAccum = Math.min(
            depreciableBase,
            openingAccumulatedDepreciation + accumPrePeriodPostCutover
        );
        endingAccum = Math.min(
            depreciableBase,
            openingAccumulatedDepreciation + accumTotalPostCutover
        );
    } else {
        // New asset mechanics:
        const monthsToPeriodStart = getElapsedMonths(startDate, periodStart);
        const monthsToCutoff = getElapsedMonths(startDate, cutoffDate);

        beginningAccum = Math.min(depreciableBase, monthsToPeriodStart * initialMonthlyRate);
        endingAccum = Math.min(depreciableBase, monthsToCutoff * initialMonthlyRate);
    }

    // Ensure monotonically non-decreasing and non-negative
    endingAccum = Math.max(beginningAccum, endingAccum);
    const currentPeriodDepreciation = Math.max(0, endingAccum - beginningAccum);
    const netBookValue = Math.max(residualValue, acquisitionCost - endingAccum);
    const depreciatedPercent =
        depreciableBase > 0 ? Math.min(100, (endingAccum / depreciableBase) * 100) : 100;

    const status = evaluateAssetStatus(condition, netBookValue, residualValue, acquisitionCost);
    const isFullyDepreciated = status === "Fully Depreciated" || endingAccum >= depreciableBase - 0.01;

    const totalElapsedMonths = getElapsedMonths(startDate, cutoffDate);
    const remainingMonths = Math.max(0, totalLifeMonths - totalElapsedMonths);

    return {
        depreciableBase,
        beginningAccumulatedDepreciation: round2(beginningAccum),
        currentPeriodDepreciation: round2(currentPeriodDepreciation),
        endingAccumulatedDepreciation: round2(endingAccum),
        netBookValue: round2(netBookValue),
        depreciatedPercent: round2(depreciatedPercent),
        status,
        isFullyDepreciated,
        monthsInService: Math.floor(totalElapsedMonths),
        remainingLifeYears: round2(remainingMonths / 12),
        annualDepreciationRate: round2(initialAnnualRate),
        depreciationPerUnit: 0,
        remainingProductionCapacity: 0
    };
}

/**
 * Computes period depreciation metrics for Units of Production assets
 */
export function computeUOPMetrics(params: {
    acquisitionCost: number;
    residualValue: number;
    maximumCapacity: number | null;
    actualUnitsProduced: number;
    openingProductionUnits: number;
    openingAccumulatedDepreciation: number;
    assetOrigin: "New" | "Existing";
    openingBookValue: number | null;
    periodStartDate: string;
    asOfDate: string;
    condition: string;
}): CalculatedDepreciationMetrics {
    const {
        acquisitionCost,
        residualValue,
        maximumCapacity,
        actualUnitsProduced,
        openingProductionUnits,
        openingAccumulatedDepreciation,
        assetOrigin,
        openingBookValue,
        condition
    } = params;

    const depreciableBase = Math.max(0, acquisitionCost - residualValue);
    const maxUnits = Math.max(1, maximumCapacity || 100000);
    const ratePerUnit = depreciableBase / maxUnits;

    let beginningAccum = 0;
    let endingAccum = 0;

    if (assetOrigin === "Existing") {
        const bookValueAtCutover =
            openingBookValue !== null && openingBookValue !== undefined
                ? openingBookValue
                : Math.max(residualValue, acquisitionCost - openingAccumulatedDepreciation);
        const remainingDepreciableBase = Math.max(0, bookValueAtCutover - residualValue);

        // Production units after cutover
        const postCutoverUnits = Math.max(0, actualUnitsProduced - openingProductionUnits);
        const postCutoverDepreciation = Math.min(
            remainingDepreciableBase,
            postCutoverUnits * ratePerUnit
        );

        beginningAccum = Math.min(depreciableBase, openingAccumulatedDepreciation);
        endingAccum = Math.min(
            depreciableBase,
            beginningAccum + postCutoverDepreciation
        );
    } else {
        endingAccum = Math.min(depreciableBase, actualUnitsProduced * ratePerUnit);
        // For periodic split without fine-grained ledger, beginning accum reflects pre-period usage
        beginningAccum = Math.min(endingAccum, Math.min(depreciableBase, openingAccumulatedDepreciation));
    }

    // Ensure non-negative, monotonically non-decreasing and bounded by depreciableBase
    beginningAccum = Math.max(0, Math.min(depreciableBase, beginningAccum));
    endingAccum = Math.max(beginningAccum, Math.min(depreciableBase, endingAccum));

    const currentPeriodDepreciation = Math.max(0, endingAccum - beginningAccum);
    const netBookValue = Math.max(residualValue, acquisitionCost - endingAccum);
    const depreciatedPercent =
        depreciableBase > 0 ? Math.min(100, (endingAccum / depreciableBase) * 100) : 100;
    const remainingCapacity = Math.max(0, maxUnits - actualUnitsProduced);

    const status = evaluateAssetStatus(condition, netBookValue, residualValue, acquisitionCost);
    const isFullyDepreciated = status === "Fully Depreciated" || endingAccum >= depreciableBase - 0.01;

    return {
        depreciableBase,
        depreciationPerUnit: round4(ratePerUnit),
        remainingProductionCapacity: round2(remainingCapacity),
        beginningAccumulatedDepreciation: round2(beginningAccum),
        currentPeriodDepreciation: round2(currentPeriodDepreciation),
        endingAccumulatedDepreciation: round2(endingAccum),
        netBookValue: round2(netBookValue),
        depreciatedPercent: round2(depreciatedPercent),
        status,
        isFullyDepreciated,
        monthsInService: 0,
        remainingLifeYears: 0,
        annualDepreciationRate: round2(ratePerUnit * (maxUnits / 5)) // Nominal annualization
    };
}

/**
 * Deterministically generates period-by-period amortization schedule for an asset (Audit Trail)
 */
export function generateAssetAmortizationSchedule(
    asset: AssetDepreciationRecord,
    asOfDateStr: string
): AssetAmortizationDetail {
    const isSL = asset.depreciation_method === "Straight Line";
    const startDate = parseDateSafe(asset.depreciation_start_date || asset.date_acquired);
    const cutoffDate = parseDateSafe(asOfDateStr);
    const cutoffYear = cutoffDate.getUTCFullYear();

    const startYear = startDate.getUTCFullYear();
    const lifeYears = Math.max(1, Math.ceil(asset.life_span_years || 5));
    const maxYear = Math.max(cutoffYear + 2, startYear + lifeYears + 1);

    const schedule: AmortizationScheduleRow[] = [];
    const notes: string[] = [];

    const depreciableBase = asset.depreciable_base;
    const residualValue = asset.residual_value;
    const acquisitionCost = asset.acquisition_cost;

    let currentNbv = acquisitionCost;
    let runningAccum = 0;

    if (asset.asset_origin === "Existing") {
        notes.push(
            `Migrated Asset: Initial opening accumulated depreciation of ₱${round2(asset.opening_accumulated_depreciation).toLocaleString()} recognized at cutover.`
        );
        notes.push(
            `Remaining depreciable base of ₱${round2(Math.max(0, (asset.opening_book_value || currentNbv) - residualValue)).toLocaleString()} amortized post-cutover.`
        );
    }

    if (isSL) {
        const annualDepr = asset.life_span_years > 0 ? depreciableBase / asset.life_span_years : 0;
        notes.push(
            `Straight-Line: Depreciable base ₱${round2(depreciableBase).toLocaleString()} over ${asset.life_span_years} years (₱${round2(annualDepr).toLocaleString()}/year).`
        );

        let periodIdx = 1;
        for (let y = startYear; y <= maxYear; y++) {
            if (runningAccum >= depreciableBase - 0.01 && currentNbv <= residualValue + 0.01) {
                // If already fully depreciated in previous years and beyond cutoff, stop
                if (y > cutoffYear + 1) break;
            }

            const openingNbv = currentNbv;
            let expense = 0;

            if (y === startYear) {
                // In-service year proration: months remaining in year
                const startMonth = startDate.getUTCMonth();
                const inServiceMonths = 12 - startMonth;
                const prorated = (annualDepr / 12) * inServiceMonths;
                expense = Math.min(Math.max(0, currentNbv - residualValue), prorated);
            } else {
                expense = Math.min(Math.max(0, currentNbv - residualValue), annualDepr);
            }

            runningAccum = Math.min(depreciableBase, runningAccum + expense);
            currentNbv = Math.max(residualValue, acquisitionCost - runningAccum);

            const isCutoffPeriod = y === cutoffYear;
            const percentDepreciated = depreciableBase > 0 ? (runningAccum / depreciableBase) * 100 : 100;

            schedule.push({
                period_index: periodIdx++,
                period_label: `FY ${y}`,
                period_start_date: `${y}-01-01`,
                period_end_date: `${y}-12-31`,
                opening_nbv: round2(openingNbv),
                depreciation_expense: round2(expense),
                ending_accumulated_depreciation: round2(runningAccum),
                ending_nbv: round2(currentNbv),
                is_cutoff_period: isCutoffPeriod,
                percent_depreciated: round2(percentDepreciated)
            });
        }
    } else {
        // Units of Production schedule
        const maxCapacity = asset.maximum_unit_produced_capacity || 100000;
        const ratePerUnit = asset.depreciation_per_unit || depreciableBase / maxCapacity;
        notes.push(
            `Units of Production: Depreciable base ₱${round2(depreciableBase).toLocaleString()} over ${maxCapacity.toLocaleString()} ${asset.production_unit_name || "units"} (₱${ratePerUnit.toFixed(4)}/unit).`
        );

        const currentYield = asset.actual_units_produced || 0;
        const totalPeriods = 5;
        const nominalUnitsPerPeriod = maxCapacity / totalPeriods;

        let periodIdx = 1;
        for (let i = 0; i < totalPeriods; i++) {
            const y = startYear + i;
            const openingNbv = currentNbv;
            const unitsInPeriod = i === 0 ? Math.max(currentYield, nominalUnitsPerPeriod) : nominalUnitsPerPeriod;
            const expense = Math.min(
                Math.max(0, currentNbv - residualValue),
                unitsInPeriod * ratePerUnit
            );

            runningAccum = Math.min(depreciableBase, runningAccum + expense);
            currentNbv = Math.max(residualValue, acquisitionCost - runningAccum);

            schedule.push({
                period_index: periodIdx++,
                period_label: `FY ${y} (Est. ${Math.round(unitsInPeriod).toLocaleString()} units)`,
                period_start_date: `${y}-01-01`,
                period_end_date: `${y}-12-31`,
                opening_nbv: round2(openingNbv),
                depreciation_expense: round2(expense),
                ending_accumulated_depreciation: round2(runningAccum),
                ending_nbv: round2(currentNbv),
                production_units_period: Math.round(unitsInPeriod),
                is_cutoff_period: y === cutoffYear,
                percent_depreciated: round2(
                    depreciableBase > 0 ? (runningAccum / depreciableBase) * 100 : 100
                )
            });
        }
    }

    return {
        asset,
        schedule,
        audit_trail: {
            formula_used:
                asset.depreciation_method === "Straight Line"
                    ? asset.asset_origin === "Existing"
                        ? "Straight Line (Migrated Cutover Remaining Base / Remaining Life)"
                        : "Straight Line (Historical Cost - Salvage Value) / Useful Life"
                    : "Units of Production ((Cost - Salvage Value) / Max Capacity) × Actual Production Units",
            depreciable_base: round2(depreciableBase),
            rate_description:
                asset.depreciation_method === "Straight Line"
                    ? `₱${round2(asset.annual_depreciation_rate).toLocaleString()} / year (₱${round2(asset.annual_depreciation_rate / 12).toLocaleString()} / month)`
                    : `₱${asset.depreciation_per_unit.toFixed(4)} per ${asset.production_unit_name || "unit"}`,
            notes
        }
    };
}

// Helpers
export function round2(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function round4(num: number): number {
    return Math.round((num + Number.EPSILON) * 10000) / 10000;
}

export function formatCurrency(amount: number | null | undefined): string {
    if (amount === null || amount === undefined || isNaN(amount)) return "₱0.00";
    return `₱${amount.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

export function formatPercent(val: number | null | undefined): string {
    if (val === null || val === undefined || isNaN(val)) return "0.0%";
    return `${val.toFixed(1)}%`;
}

export function formatDateString(dateVal: string | null | undefined): string {
    if (!dateVal) return "—";
    try {
        const d = parseDateSafe(dateVal);
        return d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            timeZone: "UTC"
        });
    } catch {
        return String(dateVal);
    }
}
