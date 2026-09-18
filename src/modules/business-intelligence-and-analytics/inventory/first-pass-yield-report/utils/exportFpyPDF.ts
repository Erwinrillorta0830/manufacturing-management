import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FPYReportRow, FPYSummaryKPIs } from "../types/fpy.types";

export function exportFpyPDF(
    rows: FPYReportRow[],
    summary: FPYSummaryKPIs,
    filtersDesc?: string
) {
    const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let currentY = 16;

    // Header Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("FIRST-PASS YIELD (FPY) REPORT", margin, currentY);

    // Metadata & Generation Date
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    const dateStr = `Generated on: ${new Date().toLocaleString()}`;
    doc.text(dateStr, pageWidth - margin, currentY, { align: "right" });

    currentY += 6;
    doc.setFontSize(9);
    doc.text("Measures the percentage of units produced correctly without needing rework or repair.", margin, currentY);

    if (filtersDesc) {
        currentY += 5;
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(`Active Filters: ${filtersDesc}`, margin, currentY);
    }

    currentY += 8;

    // Summary KPI Block
    autoTable(doc, {
        startY: currentY,
        head: [["Total JOs", "Units Inspected", "1st-Pass Good", "Rework Units", "Scrapped Units", "Overall FPY %", "Rework Rate %", "Scrap Rate %", "Dominant Defect"]],
        body: [[
            String(summary.total_jobs),
            summary.total_inspected_units.toLocaleString(),
            summary.total_passed_first_time.toLocaleString(),
            summary.total_reworked_units.toLocaleString(),
            summary.total_scrapped_units.toLocaleString(),
            `${summary.overall_fpy_percentage.toFixed(1)}%`,
            `${summary.overall_rework_rate.toFixed(2)}%`,
            `${summary.overall_scrap_rate.toFixed(2)}%`,
            summary.top_defect_reason || "None"
        ]],
        theme: "grid",
        headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 7.5,
            halign: "center"
        },
        bodyStyles: {
            fontSize: 8,
            fontStyle: "bold",
            halign: "center",
            textColor: [15, 23, 42]
        },
        margin: { left: margin, right: margin }
    });

    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // Main Table Rows
    const tableRows = rows.map(r => [
        r.job_order_no + (r.is_rework_order ? " (RWK)" : ""),
        r.product_name,
        r.branch_name,
        r.target_quantity.toLocaleString(),
        r.inspected_quantity.toLocaleString(),
        r.passed_quantity.toLocaleString(),
        r.rework_quantity > 0 ? r.rework_quantity.toLocaleString() : "0",
        r.scrap_quantity > 0 ? r.scrap_quantity.toLocaleString() : "0",
        `${r.fpy_percentage.toFixed(1)}%`,
        r.quality_tier,
        r.top_rejection_reason || "—",
        r.status
    ]);

    autoTable(doc, {
        startY: currentY,
        head: [["JO #", "Product", "Branch", "Target", "Inspected", "1st-Pass", "Rework Qty", "Scrap Qty", "FPY %", "Rating", "Top Defect", "Status"]],
        body: tableRows,
        theme: "striped",
        headStyles: {
            fillColor: [15, 23, 42],
            textColor: [255, 255, 255],
            fontSize: 7,
            fontStyle: "bold",
            halign: "center"
        },
        bodyStyles: {
            fontSize: 7,
            textColor: [30, 41, 59]
        },
        columnStyles: {
            0: { halign: "left", fontStyle: "bold" },
            1: { halign: "left" },
            2: { halign: "left" },
            3: { halign: "right" },
            4: { halign: "right" },
            5: { halign: "right", fontStyle: "bold" },
            6: { halign: "right" },
            7: { halign: "right" },
            8: { halign: "center", fontStyle: "bold" },
            9: { halign: "center" },
            10: { halign: "left" },
            11: { halign: "center" }
        },
        margin: { left: margin, right: margin },
        didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 8) {
                const rowObj = rows[data.row.index];
                if (rowObj) {
                    if (rowObj.fpy_percentage >= 95) {
                        data.cell.styles.textColor = [16, 149, 102]; // Green
                    } else if (rowObj.fpy_percentage >= 85) {
                        data.cell.styles.textColor = [202, 138, 4]; // Amber
                    } else {
                        data.cell.styles.textColor = [220, 38, 38]; // Red
                    }
                }
            }
        }
    });

    const filename = `First_Pass_Yield_Report_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(filename);
}
