import { ScrapReportRow, ScrapSummaryKPIs, DefectCategorySummary } from "../types/scrap-rejection.types";
import { formatPHP } from "../services/scrap-rejection.helpers";

export function exportScrapCSV(
    rows: ScrapReportRow[],
    summary: ScrapSummaryKPIs,
    defectCategories: DefectCategorySummary[]
) {
    if (rows.length === 0) return;

    const summaryLines = [
        `"--- EXECUTIVE SUMMARY ---"`,
        `"Total Job Orders Analyzed",${summary.total_jobs}`,
        `"Total Produced Units",${summary.total_produced_units}`,
        `"Total Scrapped Units",${summary.total_scrapped_units}`,
        `"Overall Scrap Rate (%)",${summary.overall_scrap_rate.toFixed(2)}%`,
        `"Total Material Loss (PHP)",${summary.total_material_loss_php.toFixed(2)}`,
        `"Total Rework Hours",${summary.total_rework_hours.toFixed(2)}`,
        `"Total Rework Labor Cost (PHP)",${summary.total_rework_labor_cost_php.toFixed(2)}`,
        `"Top Defect Category","${summary.top_defect_category}"`,
        `"Top Rejection Reason","${summary.top_rejection_reason}"`,
        `""`,
        `"--- TOP DEFECT CATEGORIES ---"`,
        `"Category","Defect Count","Rejected Qty","Defect Share (%)"`,
        ...defectCategories.map(c => `"${c.category}",${c.defectCount},${c.rejectedQuantity},${c.percentage.toFixed(1)}%`),
        `""`,
        `"--- JOB ORDER BREAKDOWN ---"`
    ];

    const headers = [
        "Job Order No",
        "Product Code",
        "Product Name",
        "Branch",
        "Status",
        "Target Qty",
        "Produced Qty",
        "Scrap Qty",
        "Scrap Rate (%)",
        "Material Loss (PHP)",
        "Rework Qty",
        "Rework Hours",
        "Rework Labor Cost (PHP)",
        "Top Defect Category",
        "Top Rejection Reason",
        "Date"
    ];

    const tableLines = rows.map(r => [
        `"${r.job_order_no}"`,
        `"${r.product_code}"`,
        `"${r.product_name.replace(/"/g, '""')}"`,
        `"${r.branch_name}"`,
        `"${r.status}"`,
        r.target_quantity,
        r.actual_quantity_produced,
        r.scrap_quantity,
        r.scrap_rate_percentage.toFixed(2),
        r.material_loss_php.toFixed(2),
        r.rework_quantity,
        r.rework_hours.toFixed(2),
        r.rework_labor_cost_php.toFixed(2),
        `"${r.top_defect_category || "N/A"}"`,
        `"${r.top_rejection_reason || "N/A"}"`,
        `"${r.date ? new Date(r.date).toLocaleDateString() : "N/A"}"`
    ].join(","));

    const csvContent = "data:text/csv;charset=utf-8," + [...summaryLines, headers.join(","), ...tableLines].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `scrap_and_rejection_analysis_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
