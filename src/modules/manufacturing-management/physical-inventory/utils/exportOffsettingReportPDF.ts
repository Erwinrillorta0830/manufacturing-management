import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PhysicalCountSheet, OffsetPairing } from "../types";
import { formatCurrency, formatDate } from "../utils";

export function generateOffsettingReportPDF(sheet: PhysicalCountSheet, pairings: OffsetPairing[]): jsPDF {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // 1. Header Banner (Dark Slate #0F172A)
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 28, "F");

    // Title & Branding
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("VERTEX TECH CORP • VOS ERP", margin, 11);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("INVENTORY OFFSETTING & RECONCILIATION REPORT", margin, 17);

    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("POST-AUDIT VARIANCE OFFSETTING & ADJUSTMENT JOURNAL BREAKDOWN", margin, 23);

    // Right-side Meta
    const phNo = sheet.ph_no || sheet.sheet_no || `PI-${sheet.id}`;
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`REF: #${phNo}`, pageWidth - margin, 11, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    doc.text(`Reconciliation Date: ${formatDate(new Date().toISOString())}`, pageWidth - margin, 17, { align: "right" });
    doc.text(`Status: ${sheet.status || "PENDING RECONCILIATION"}`, pageWidth - margin, 23, { align: "right" });

    let currentY = 33;

    // 2. Metadata Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 20, 2, 2, "FD");

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("AUDIT RECONCILIATION SCOPE", margin + 4, currentY + 5.5);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);

    // Row 1
    doc.text("Facility Branch:", margin + 4, currentY + 11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(String(sheet.branch_name || "Main Facility"), margin + 26, currentY + 11);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Classification:", margin + 95, currentY + 11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sheet.inventory_type || "Finished Goods"} (${sheet.stock_type || "Good Stock"})`, margin + 116, currentY + 11);

    // Row 2
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Audit Range:", margin + 4, currentY + 16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${formatDate(sheet.starting_date)}  to  ${formatDate(sheet.cutOff_date || sheet.cutoff_date)}`, margin + 23, currentY + 16);

    currentY += 25;

    // 3. Matched Pairings AutoTable
    const tableHeaders = ["Pair Ref", "Shortage SKU (Target)", "Surplus SKU (Source)", "Offset Qty", "Price Delta", "Net Financial Impact", "Reason Code"];

    const tableRows = (pairings || []).map(pair => [
        pair.id,
        `${pair.shortage_product_name}\n[${pair.shortage_product_code || "N/A"}]`,
        `${pair.surplus_product_name}\n[${pair.surplus_product_code || "N/A"}]`,
        pair.offset_qty.toLocaleString(),
        formatCurrency(pair.unit_price_variance),
        formatCurrency(pair.net_financial_impact),
        pair.reason_code
    ]);

    autoTable(doc, {
        head: [tableHeaders],
        body: tableRows.length > 0 ? tableRows : [["—", "No offset pairings recorded", "—", "—", "—", "—", "—"]],
        startY: currentY,
        margin: { left: margin, right: margin },
        styles: {
            fontSize: 7.5,
            cellPadding: 2.2,
            textColor: [15, 23, 42],
            lineColor: [226, 232, 240],
            lineWidth: 0.1
        },
        headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 7.5,
            halign: "left"
        },
        columnStyles: {
            0: { cellWidth: 16, halign: "center", fontStyle: "bold" },
            1: { cellWidth: 42 },
            2: { cellWidth: 42 },
            3: { cellWidth: 20, halign: "right", fontStyle: "bold" },
            4: { cellWidth: 18, halign: "right" },
            5: { cellWidth: 22, halign: "right", fontStyle: "bold" },
            6: { cellWidth: "auto" }
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        }
    });

    // 4. Financial Offsetting Summary Box
    // @ts-expect-error lastAutoTable injected by jspdf-autotable
    let summaryY = (doc.lastAutoTable?.finalY || 140) + 8;

    let grossShortageValuation = 0;
    let grossSurplusValuation = 0;

    (sheet.line_items || []).forEach(item => {
        const sys = item.system_count || 0;
        const phys = item.physical_count !== null ? item.physical_count : sys;
        const rawVar = item.variance !== undefined ? item.variance : (phys - sys);
        const factor = item.uom_factor || 1;
        const baseVar = item.variance_base !== undefined ? item.variance_base : (rawVar * factor);
        const price = item.unit_price || 0;

        if (baseVar < 0) {
            grossShortageValuation += Math.abs(baseVar * price);
        } else if (baseVar > 0) {
            grossSurplusValuation += baseVar * price;
        }
    });

    const totalOffsetQty = pairings.reduce((sum, p) => sum + p.offset_qty, 0);
    const remainingNetImpact = grossSurplusValuation - grossShortageValuation;

    if (summaryY > pageHeight - 65) {
        doc.addPage();
        summaryY = 20;
    }

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, summaryY, pageWidth - (margin * 2), 24, 2, 2, "FD");

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("FINANCIAL RECONCILIATION SUMMARY", margin + 4, summaryY + 5.5);

    const boxW = (pageWidth - (margin * 2) - 12) / 4;
    const item1X = margin + 4;
    const item2X = item1X + boxW;
    const item3X = item2X + boxW;
    const item4X = item3X + boxW;

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);

    doc.text("Gross Shortage Value", item1X, summaryY + 11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(225, 29, 72); // rose-600
    doc.text(`-${formatCurrency(grossShortageValuation)}`, item1X, summaryY + 17);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Gross Surplus Value", item2X, summaryY + 11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text(`+${formatCurrency(grossSurplusValuation)}`, item2X, summaryY + 17);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Total Offset Quantity", item3X, summaryY + 11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${totalOffsetQty.toLocaleString()} Units`, item3X, summaryY + 17);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Remaining Net to Ledger", item4X, summaryY + 11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(remainingNetImpact >= 0 ? 16 : 225, remainingNetImpact >= 0 ? 185 : 29, remainingNetImpact >= 0 ? 129 : 72);
    doc.text(formatCurrency(remainingNetImpact), item4X, summaryY + 17);

    // 5. Sign-Off Authorization Block
    let signY = summaryY + 32;
    if (signY > pageHeight - 35) {
        doc.addPage();
        signY = 25;
    }

    doc.setDrawColor(203, 213, 225);
    doc.line(margin, signY - 4, pageWidth - margin, signY - 4);

    const colW = (pageWidth - (margin * 2) - 16) / 3;

    // Sign 1: Auditor
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text("1. INVENTORY AUDITOR:", margin, signY);
    doc.setDrawColor(15, 23, 42);
    doc.line(margin, signY + 14, margin + colW, signY + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Auditor Signature & Date", margin, signY + 18);

    // Sign 2: Warehouse Manager
    const col2X = margin + colW + 8;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("2. WAREHOUSE MANAGER:", col2X, signY);
    doc.line(col2X, signY + 14, col2X + colW, signY + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Manager Signature & Date", col2X, signY + 18);

    // Sign 3: Finance / Accounting
    const col3X = col2X + colW + 8;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("3. FINANCE / ACCOUNTING:", col3X, signY);
    doc.line(col3X, signY + 14, col3X + colW, signY + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Approver Signature & Date", col3X, signY + 18);

    // Page Numbers Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
            `Vertex Tech Corp • Offsetting Breakdown Report #${phNo} • Page ${i} of ${totalPages}`,
            pageWidth / 2,
            pageHeight - 6,
            { align: "center" }
        );
    }

    return doc;
}

export function downloadOffsettingReportPDF(sheet: PhysicalCountSheet, pairings: OffsetPairing[]) {
    const doc = generateOffsettingReportPDF(sheet, pairings);
    const phNo = sheet.ph_no || sheet.sheet_no || `PI-${sheet.id}`;
    doc.save(`OffsettingReport_${phNo}.pdf`);
}
