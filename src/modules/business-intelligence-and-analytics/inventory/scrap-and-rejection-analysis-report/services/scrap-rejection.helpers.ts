import { ScrapReportRow, ScrapSummaryKPIs, DefectCategorySummary } from "../types/scrap-rejection.types";

/**
 * Calculates scrap rate percentage safely
 */
export function calculateScrapRate(scrapQty: number, totalBaseQty: number): number {
    if (totalBaseQty <= 0) return 0;
    const rate = (scrapQty / totalBaseQty) * 100;
    return Math.min(100, Math.max(0, Math.round(rate * 100) / 100));
}

/**
 * Formats PHP currency value
 */
export function formatPHP(value: number): string {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value || 0);
}

/**
 * Computes executive summary KPIs from report rows
 */
export function computeScrapSummaryKPIs(
    rows: ScrapReportRow[],
    defectCategories: DefectCategorySummary[]
): ScrapSummaryKPIs {
    const total_jobs = rows.length;
    const total_produced_units = Math.round(rows.reduce((sum, r) => sum + r.actual_quantity_produced, 0) * 100) / 100;
    const total_scrapped_units = Math.round(rows.reduce((sum, r) => sum + r.scrap_quantity, 0) * 100) / 100;
    const total_material_loss_php = Math.round(rows.reduce((sum, r) => sum + r.material_loss_php, 0) * 100) / 100;
    const total_rework_hours = Math.round(rows.reduce((sum, r) => sum + r.rework_hours, 0) * 100) / 100;
    const total_rework_labor_cost_php = Math.round(rows.reduce((sum, r) => sum + r.rework_labor_cost_php, 0) * 100) / 100;

    const baseInput = total_produced_units + total_scrapped_units;
    const overall_scrap_rate = baseInput > 0
        ? Math.round((total_scrapped_units / baseInput) * 1000) / 10
        : 0;

    // Determine top defect category
    const top_defect_category = defectCategories.length > 0 ? defectCategories[0].category : "None";

    // Determine top rejection reason
    const reasonFrequency = new Map<string, number>();
    rows.forEach(r => {
        if (r.top_rejection_reason) {
            reasonFrequency.set(r.top_rejection_reason, (reasonFrequency.get(r.top_rejection_reason) || 0) + 1);
        }
    });

    let top_rejection_reason = "None";
    let maxCount = 0;
    reasonFrequency.forEach((count, reason) => {
        if (count > maxCount) {
            maxCount = count;
            top_rejection_reason = reason;
        }
    });

    return {
        total_jobs,
        total_produced_units,
        total_scrapped_units,
        overall_scrap_rate,
        total_material_loss_php,
        total_rework_hours,
        total_rework_labor_cost_php,
        top_defect_category,
        top_rejection_reason
    };
}
