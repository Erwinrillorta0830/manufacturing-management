import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { QuotationHeader } from "../types";

interface ExportQuotationPDFParams {
    quote: QuotationHeader;
    snapshots: {
        node_name: string;
        type_name: string;
        version_name?: string;
        uom: string;
        standard_unit_price?: number;
        agreed_unit_price?: number;
        variance_php?: number;
        frozen_unit_cost_php: number;
        frozen_total_cost_php: number;
    }[];
    customerName: string;
    projectName: string;
    priceTypeName: string;
    createdByName: string;
}

export function generateQuotationPDF({
    quote,
    snapshots,
    customerName,
    projectName,
    priceTypeName,
    createdByName
}: ExportQuotationPDFParams) {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "letter"
    });

    const getFinalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    // Header Title
    doc.setTextColor(30, 25, 45); // Deep Indigo/Navy
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("QUOTATION REPORT", margin, 20);

    // Converted to SO badge if applicable
    if (quote.status === "Converted to SO") {
        doc.setFillColor(30, 25, 45);
        doc.rect(pageWidth - margin - 40, 12, 40, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text("CONVERTED TO SO", pageWidth - margin - 20, 17, { align: "center" });
    }

    // Quote Number & Project Badges
    doc.setFillColor(235, 230, 240); // Light lavender
    doc.rect(margin, 25, 65, 8, "F");
    doc.setTextColor(30, 25, 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(quote.quote_number, margin + 32.5, 30.5, { align: "center" });

    // Vertical Separator
    doc.setLineWidth(0.5);
    doc.setDrawColor(30, 25, 45);
    doc.line(margin + 68, 25, margin + 68, 33);

    doc.setFillColor(240, 240, 245);
    doc.rect(margin + 71, 25, 90, 8, "F");
    doc.text(`PROJECT: ${projectName.toUpperCase()}`, margin + 74, 30.5);

    // Horizontal line under header
    doc.setLineWidth(1);
    doc.setDrawColor(30, 25, 45);
    doc.line(margin, 38, pageWidth - margin, 38);

    // Meta Box
    doc.setLineWidth(0.1);
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin, 43, pageWidth - (margin * 2), 25);
    doc.line(pageWidth / 2, 43, pageWidth / 2, 68);

    doc.setFontSize(7);
    doc.setTextColor(100, 100, 110);
    doc.text("CUSTOMER NAME", margin + 5, 48);
    doc.text("PRICE TYPE", margin + 5, 58);
    doc.text("QUOTATION DATE", (pageWidth / 2) + 5, 48);
    doc.text("CREATED BY", (pageWidth / 2) + 5, 58);

    doc.setFontSize(10);
    doc.setTextColor(30, 25, 45);
    doc.setFont("helvetica", "normal");
    doc.text(customerName, margin + 5, 53);
    doc.text(priceTypeName || "N/A", margin + 5, 63);
    
    // Format Date
    const qDate = quote.quote_date ? new Date(quote.quote_date) : new Date();
    const dateOpts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    doc.text(qDate.toLocaleDateString('en-US', dateOpts), (pageWidth / 2) + 5, 53);
    doc.text(createdByName || "System", (pageWidth / 2) + 5, 63);

    // Table Data: Product Type | Product Name | UOM | Standard Unit Price | Agreed Price | Variance | Total Simulated Cost | Total Selling Price
    const tableBody = snapshots.map(snap => {
        const stdPrice = snap.standard_unit_price !== undefined ? snap.standard_unit_price : snap.frozen_total_cost_php;
        const agreedPrice = snap.agreed_unit_price !== undefined ? snap.agreed_unit_price : snap.frozen_total_cost_php;
        const variance = snap.variance_php !== undefined ? snap.variance_php : (agreedPrice - stdPrice);
        const simCost = Number(snap.frozen_unit_cost_php || 0);
        const sellingPrice = Number(snap.frozen_total_cost_php || 0);

        return [
            snap.type_name || "Finished Goods",
            snap.node_name,
            snap.uom || "pcs",
            `P ${Number(stdPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `P ${Number(agreedPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `P ${Number(variance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `P ${simCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `P ${sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ];
    });

    // Add Grand Total Row
    const grandTotalStdPrice = snapshots.reduce((sum, s) => sum + Number(s.standard_unit_price !== undefined ? s.standard_unit_price : s.frozen_total_cost_php || 0), 0);
    const grandTotalAgreedPrice = snapshots.reduce((sum, s) => sum + Number(s.agreed_unit_price !== undefined ? s.agreed_unit_price : s.frozen_total_cost_php || 0), 0);
    const grandTotalVariance = snapshots.reduce((sum, s) => sum + Number(s.variance_php !== undefined ? s.variance_php : ((s.agreed_unit_price !== undefined ? s.agreed_unit_price : s.frozen_total_cost_php || 0) - (s.standard_unit_price !== undefined ? s.standard_unit_price : s.frozen_total_cost_php || 0))), 0);
    const grandTotalCost = snapshots.reduce((sum, s) => sum + Number(s.frozen_unit_cost_php || 0), 0);
    const grandTotalPrice = snapshots.reduce((sum, s) => sum + Number(s.frozen_total_cost_php || 0), 0);

    tableBody.push([
        "GRAND TOTAL",
        "",
        "",
        `P ${grandTotalStdPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `P ${grandTotalAgreedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `P ${grandTotalVariance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `P ${grandTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `P ${grandTotalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ]);

    autoTable(doc, {
        startY: 75,
        margin: { left: margin, right: margin },
        head: [["PRODUCT TYPE", "PRODUCT NAME", "UOM", "STANDARD UNIT PRICE", "AGREED PRICE", "VARIANCE", "TOTAL SIMULATED COST", "TOTAL SELLING PRICE"]],
        body: tableBody,
        theme: "plain",
        headStyles: {
            fillColor: [30, 25, 45],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 7.5,
            cellPadding: 2.5
        },
        bodyStyles: {
            fontSize: 8,
            textColor: [50, 50, 50],
            cellPadding: 2.5,
        },
        columnStyles: {
            0: { halign: "left", cellWidth: 24 },
            1: { halign: "left", cellWidth: 42 },
            2: { halign: "center", cellWidth: 14 },
            3: { halign: "right", cellWidth: 21 },
            4: { halign: "right", cellWidth: 21 },
            5: { halign: "right", cellWidth: 19 },
            6: { halign: "right", cellWidth: 23 },
            7: { halign: "right", cellWidth: 23 }
        },
        didParseCell: (data) => {
            // Ensure header alignment matches data alignment
            if (data.section === "head") {
                if (data.column.index === 2) {
                    data.cell.styles.halign = "center";
                } else if (data.column.index >= 3) {
                    data.cell.styles.halign = "right";
                } else {
                    data.cell.styles.halign = "left";
                }
            }
            // Span the Grand Total row's first column across the first 3 columns
            if (data.row.index === tableBody.length - 1 && data.column.index === 0) {
                data.cell.colSpan = 3;
                data.cell.styles.halign = "right";
            }
        },
        willDrawCell: (data) => {
            // Style the Grand Total row
            if (data.row.index === tableBody.length - 1) {
                data.doc.setFont("helvetica", "bold");
                data.doc.setTextColor(30, 25, 45);
            }
        },
        didDrawCell: (data) => {
            if (data.row.index === tableBody.length - 1 && data.column.index >= 0) {
                doc.setDrawColor(30, 25, 45);
                doc.setLineWidth(0.5);
                // Top border
                doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
                // Bottom border
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
        }
    });

    // Footer
    const finalY = getFinalY();
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.text("Generated for internal system review. Confidential pricing details enclosed.", margin, finalY + 15);

    // Save PDF
    doc.save(`${quote.quote_number}_Simulation_Report.pdf`);
}
