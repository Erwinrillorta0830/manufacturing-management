import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { JobOrderProfitabilityRow, ProfitabilitySummaryKPIs } from "../types";

export function exportProfitabilityPDF(
    rows: JobOrderProfitabilityRow[],
    summary: ProfitabilitySummaryKPIs,
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

    const fmtCurrency = (val: number | null | undefined): string => {
        const num = Number(val || 0);
        return "PHP " + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Header Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("JOB ORDER PROFITABILITY REPORT", margin, currentY);

    // Metadata & Generation Date
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    const dateStr = `Generated on: ${new Date().toLocaleString()}`;
    doc.text(dateStr, pageWidth - margin, currentY, { align: "right" });

    currentY += 6;
    doc.setFontSize(9);
    doc.text("Executive gross margin and cost-of-goods-sold analysis per production run.", margin, currentY);

    if (filtersDesc) {
        currentY += 5;
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(`Active Filters: ${filtersDesc}`, margin, currentY);
    }

    currentY += 8;

    // Summary KPI Block (Table Form)
    autoTable(doc, {
        startY: currentY,
        head: [["Total JOs", "Total Revenue", "Direct Materials", "Direct Labor", "Overheads", "Total COGS", "Gross Profit", "Avg Gross Margin %"]],
        body: [[
            String(summary.total_jobs),
            fmtCurrency(summary.total_revenue),
            fmtCurrency(summary.total_materials_cost),
            fmtCurrency(summary.total_labor_cost),
            fmtCurrency(summary.total_overhead_cost),
            fmtCurrency(summary.total_cogs),
            fmtCurrency(summary.total_gross_profit),
            `${summary.average_gross_margin_percent.toFixed(1)}%`
        ]],
        theme: "grid",
        headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 8,
            halign: "center"
        },
        bodyStyles: {
            fontSize: 8.5,
            fontStyle: "bold",
            halign: "center",
            textColor: [15, 23, 42]
        },
        margin: { left: margin, right: margin }
    });

    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // Main Table Rows
    const tableRows = rows.map(r => [
        r.job_order_no,
        r.product_name,
        r.target_quantity.toLocaleString(),
        r.actual_quantity_produced.toLocaleString(),
        r.total_quantity_consumed > 0 ? r.total_quantity_consumed.toLocaleString() : "—",
        fmtCurrency(r.sales_unit_price),
        fmtCurrency(r.total_revenue),
        fmtCurrency(r.direct_materials_cost),
        fmtCurrency(r.direct_labor_cost),
        fmtCurrency(r.overhead_cost),
        fmtCurrency(r.total_cogs),
        fmtCurrency(r.gross_profit),
        `${r.gross_margin_percent.toFixed(1)}%`
    ]);

    autoTable(doc, {
        startY: currentY,
        head: [["JO #", "Product", "Target Qty", "Produced Qty", "Consumed Qty", "Unit Price", "Revenue", "Materials", "Labor", "Overhead", "Total COGS", "Gross Profit", "Margin %"]],
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
            2: { halign: "right" },
            3: { halign: "right", fontStyle: "bold" },
            4: { halign: "right" },
            5: { halign: "right" },
            6: { halign: "right", fontStyle: "bold" },
            7: { halign: "right" },
            8: { halign: "right" },
            9: { halign: "right" },
            10: { halign: "right", fontStyle: "bold" },
            11: { halign: "right", fontStyle: "bold" },
            12: { halign: "center", fontStyle: "bold" }
        },
        margin: { left: margin, right: margin },
        didParseCell: (data) => {
            if (data.section === "body" && (data.column.index === 11 || data.column.index === 12)) {
                const rowObj = rows[data.row.index];
                if (rowObj && rowObj.gross_profit < 0) {
                    data.cell.styles.textColor = [220, 38, 38]; // Red for negative margin
                } else if (rowObj && rowObj.gross_margin_percent >= 25) {
                    data.cell.styles.textColor = [16, 149, 102]; // Emerald for healthy margin
                }
            }
        }
    });

    const filename = `Job_Order_Profitability_Report_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(filename);
}
