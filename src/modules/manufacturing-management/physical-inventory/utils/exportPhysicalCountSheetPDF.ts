import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PhysicalCountSheet } from "../types";
import { formatDate } from "../utils";

export function generatePhysicalCountSheetPDF(sheet: PhysicalCountSheet): jsPDF {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // 1. Header Banner (Dark Navy / Slate #0F172A)
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 28, "F");

    // Title & Branding
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("VERTEX TECH CORP • VOS ERP", margin, 11);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("PHYSICAL INVENTORY AUDIT COUNT SHEET (PI 2.0)", margin, 17);

    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("OFFICIAL WAREHOUSE FLOOR VERIFICATION & STOCK AUDIT", margin, 23);

    // Right-side Sheet Meta
    const phNo = sheet.ph_no || sheet.sheet_no || `PI-${sheet.id}`;
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`#${phNo}`, pageWidth - margin, 11, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    doc.text(`Status: ${sheet.status || "IN PROGRESS"}`, pageWidth - margin, 17, { align: "right" });
    doc.text(`Printed: ${formatDate(new Date().toISOString())}`, pageWidth - margin, 23, { align: "right" });

    let currentY = 33;

    // 2. Metadata Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 24, 2, 2, "FD");

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("TRANSACTION METADATA & SCOPE", margin + 4, currentY + 5.5);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);

    // Row 1
    doc.text("Facility Branch:", margin + 4, currentY + 11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(String(sheet.branch_name || "Main Warehouse"), margin + 27, currentY + 11);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Classification:", margin + 95, currentY + 11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sheet.inventory_type || "Finished Goods"} (${sheet.stock_type || "Good Stock"})`, margin + 116, currentY + 11);

    // Row 2
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Start Timestamp:", margin + 4, currentY + 17);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(formatDate(sheet.starting_date), margin + 27, currentY + 17);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Cut-Off Benchmark:", margin + 95, currentY + 17);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(formatDate(sheet.cutOff_date || sheet.cutoff_date), margin + 125, currentY + 17);

    // Row 3
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Auditor In-Charge:", margin + 4, currentY + 22.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(String(sheet.encoder_name || "System Auditor"), margin + 30, currentY + 22.5);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Total SKU Count:", margin + 95, currentY + 22.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${(sheet.line_items || []).length} SKUs Listed`, margin + 120, currentY + 22.5);

    currentY += 28;

    // 3. Line Items AutoTable
    const isFG = sheet.inventory_type === "Finished Goods" || sheet.stock_type?.includes("Finished");

    const tableHeaders = isFG
        ? ["#", "Product Description & SKU Code", "Location Bin", "Version", "UOM", "System Qty", "Physical Count", "Auditor Notes"]
        : ["#", "Product Description & SKU Code", "Location Bin", "UOM", "System Qty", "Physical Count", "Auditor Notes"];

    const tableRows = (sheet.line_items || []).map((item, idx) => {
        const pName = typeof item.product_id === "object"
            ? (item.product_id?.product_name || item.product_name || "Product")
            : (item.product_name || "Product");

        const pCode = typeof item.product_id === "object"
            ? (item.product_id?.product_code || item.product_code || "")
            : (item.product_code || "");

        const barcode = item.barcode || (typeof item.product_id === "object" ? item.product_id?.barcode : "");

        let desc = pName;
        if (pCode) desc += `\nSKU: ${pCode}`;
        if (barcode) desc += ` | Barcode: ${barcode}`;

        const lName = typeof item.lot_id === "object"
            ? (item.lot_id?.lot_name || "Main Storage")
            : "Main Storage";

        const vName = typeof item.version_id === "object"
            ? (item.version_id?.version_name || item.version_id?.version_code || "v1.0")
            : "v1.0";

        const physStr = item.physical_count !== null && item.physical_count !== undefined
            ? item.physical_count.toLocaleString()
            : "[  _____  ]";

        if (isFG) {
            return [
                String(idx + 1),
                desc,
                lName,
                vName,
                (item.uom || "PCS").toUpperCase(),
                (item.system_count || 0).toLocaleString(),
                physStr,
                item.remarks || ""
            ];
        } else {
            return [
                String(idx + 1),
                desc,
                lName,
                (item.uom || "PCS").toUpperCase(),
                (item.system_count || 0).toLocaleString(),
                physStr,
                item.remarks || ""
            ];
        }
    });

    autoTable(doc, {
        head: [tableHeaders],
        body: tableRows,
        startY: currentY,
        margin: { left: margin, right: margin },
        styles: {
            fontSize: 7.5,
            cellPadding: 2,
            textColor: [15, 23, 42],
            lineColor: [226, 232, 240],
            lineWidth: 0.1
        },
        headStyles: {
            fillColor: [30, 41, 59], // slate-800
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 7.5,
            halign: "left"
        },
        columnStyles: isFG ? {
            0: { cellWidth: 8, halign: "center" },
            1: { cellWidth: 52 },
            2: { cellWidth: 28 },
            3: { cellWidth: 20 },
            4: { cellWidth: 14, halign: "center" },
            5: { cellWidth: 20, halign: "right" },
            6: { cellWidth: 24, halign: "center", fontStyle: "bold" },
            7: { cellWidth: "auto" }
        } : {
            0: { cellWidth: 8, halign: "center" },
            1: { cellWidth: 64 },
            2: { cellWidth: 32 },
            3: { cellWidth: 16, halign: "center" },
            4: { cellWidth: 22, halign: "right" },
            5: { cellWidth: 26, halign: "center", fontStyle: "bold" },
            6: { cellWidth: "auto" }
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        }
    });

    // Sign-Off Block
    // @ts-expect-error lastAutoTable injected by jspdf-autotable
    const finalY = (doc.lastAutoTable?.finalY || 160) + 12;

    // Check if we need a new page for sign-off block
    let signY = finalY;
    if (signY > pageHeight - 35) {
        doc.addPage();
        signY = 25;
    }

    doc.setDrawColor(203, 213, 225);
    doc.line(margin, signY - 4, pageWidth - margin, signY - 4);

    const colW = (pageWidth - (margin * 2) - 16) / 3;

    // Sign Column 1: Auditor
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text("1. COUNTED & AUDITED BY:", margin, signY);
    doc.setDrawColor(15, 23, 42);
    doc.line(margin, signY + 16, margin + colW, signY + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Floor Auditor Signature & Date", margin, signY + 20);

    // Sign Column 2: Supervisor
    const col2X = margin + colW + 8;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("2. VERIFIED & CHECKED BY:", col2X, signY);
    doc.line(col2X, signY + 16, col2X + colW, signY + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Warehouse Supervisor Signature & Date", col2X, signY + 20);

    // Sign Column 3: Manager
    const col3X = col2X + colW + 8;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("3. APPROVED BY:", col3X, signY);
    doc.line(col3X, signY + 16, col3X + colW, signY + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Operations / Plant Manager Signature & Date", col3X, signY + 20);

    // Page Numbers Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
            `Vertex Tech Corp • Physical Inventory Count Sheet #${phNo} • Page ${i} of ${totalPages}`,
            pageWidth / 2,
            pageHeight - 6,
            { align: "center" }
        );
    }

    return doc;
}

export function downloadPhysicalCountSheetPDF(sheet: PhysicalCountSheet) {
    const doc = generatePhysicalCountSheetPDF(sheet);
    const phNo = sheet.ph_no || sheet.sheet_no || `PI-${sheet.id}`;
    doc.save(`CountSheet_${phNo}.pdf`);
}
