import { FPYReportRow, FPYSummaryKPIs } from "../types/fpy.types";

export function exportFpyCSV(
    rows: FPYReportRow[],
    summary: FPYSummaryKPIs,
    filtersDesc?: string
) {
    const csvRows: string[] = [];

    // Header metadata
    csvRows.push(`"FIRST-PASS YIELD (FPY) QUALITY REPORT"`);
    csvRows.push(`"Generated On:","${new Date().toLocaleString()}"`);
    if (filtersDesc) {
        csvRows.push(`"Active Filters:","${filtersDesc.replace(/"/g, '""')}"`);
    }
    csvRows.push("");

    // Summary KPIs
    csvRows.push(`"EXECUTIVE SUMMARY KPIs"`);
    csvRows.push(`"Total Job Orders Tracked",${summary.total_jobs}`);
    csvRows.push(`"Total Units Inspected",${summary.total_inspected_units}`);
    csvRows.push(`"Units Passed First-Time",${summary.total_passed_first_time}`);
    csvRows.push(`"Units Sent to Rework",${summary.total_reworked_units}`);
    csvRows.push(`"Units Scrapped",${summary.total_scrapped_units}`);
    csvRows.push(`"Overall First-Pass Yield (FPY %)",${summary.overall_fpy_percentage.toFixed(1)}%`);
    csvRows.push(`"Overall Rework Rate %",${summary.overall_rework_rate.toFixed(2)}%`);
    csvRows.push(`"Overall Scrap Rate %",${summary.overall_scrap_rate.toFixed(2)}%`);
    csvRows.push(`"Top Defect Reason","${(summary.top_defect_reason || "").replace(/"/g, '""')}"`);
    csvRows.push("");

    // Table Columns
    const columns = [
        "Job Order #",
        "Type",
        "Product Code",
        "Product Name",
        "Plant Branch",
        "Target Qty",
        "Produced Qty",
        "Inspected Qty",
        "1st-Pass Passed Qty",
        "Rework Qty",
        "Scrap Qty",
        "FPY %",
        "Rework Rate %",
        "Scrap Rate %",
        "Quality Tier",
        "Top Rejection Reason",
        "Status",
        "Start Date",
        "End Date"
    ];
    csvRows.push(columns.map(c => `"${c}"`).join(","));

    // Table Data Rows
    rows.forEach(r => {
        const rowData = [
            r.job_order_no,
            r.is_rework_order ? "Rework (RWK)" : "Standard",
            r.product_code,
            r.product_name,
            r.branch_name,
            r.target_quantity,
            r.actual_quantity_produced,
            r.inspected_quantity,
            r.passed_quantity,
            r.rework_quantity,
            r.scrap_quantity,
            `${r.fpy_percentage.toFixed(1)}%`,
            `${r.rework_rate_percentage.toFixed(2)}%`,
            `${r.scrap_rate_percentage.toFixed(2)}%`,
            r.quality_tier,
            r.top_rejection_reason || "None",
            r.status,
            r.start_date || "—",
            r.end_date || "—"
        ];
        csvRows.push(rowData.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","));
    });

    const csvContent = csvRows.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `First_Pass_Yield_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
