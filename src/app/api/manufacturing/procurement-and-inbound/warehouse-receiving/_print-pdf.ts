import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsPDF } from "jspdf";
import { PROCUREMENT_MONEY_DECIMAL_SCALE } from "@/modules/manufacturing-management/decimal";
import type { WarehouseReceivingPrintableSnapshot } from "./_print-data";

const PAGE_MARGIN = 10;
const PAGE_WIDTH = 210;
const TABLE_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const PDF_FONT_NAME = "Arial";
const PDF_FONT_FILE = "arial.ttf";
const PDF_FONT_BOLD_FILE = "arial-bold.ttf";

function activeFont(doc: jsPDF): string {
    return doc.getFont().fontName === PDF_FONT_NAME ? PDF_FONT_NAME : "helvetica";
}

function setPdfFont(doc: jsPDF, style: "normal" | "bold" = "normal") {
    doc.setFont(activeFont(doc), style);
}

function registerPdfFont(doc: jsPDF) {
    try {
        const regularFont = readFileSync(join(process.cwd(), "public", "fonts", PDF_FONT_FILE)).toString("base64");
        const boldFont = readFileSync(join(process.cwd(), "public", "fonts", PDF_FONT_BOLD_FILE)).toString("base64");
        doc.addFileToVFS(PDF_FONT_FILE, regularFont);
        doc.addFileToVFS(PDF_FONT_BOLD_FILE, boldFont);
        doc.addFont(PDF_FONT_FILE, PDF_FONT_NAME, "normal");
        doc.addFont(PDF_FONT_BOLD_FILE, PDF_FONT_NAME, "bold");
        doc.setFont(PDF_FONT_NAME, "normal");
    } catch {
        doc.setFont("helvetica", "normal");
    }
}

function quantity(value: number): string {
    return new Intl.NumberFormat("en-PH", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4
    }).format(Number.isFinite(value) ? value : 0);
}

function money(value: number, currency: string, doc: jsPDF): string {
    const numericValue = Number.isFinite(value) ? value : 0;
    const normalizedCurrency = currency.trim().toUpperCase() || "PHP";
    const formatted = new Intl.NumberFormat("en-PH", {
        minimumFractionDigits: PROCUREMENT_MONEY_DECIMAL_SCALE,
        maximumFractionDigits: PROCUREMENT_MONEY_DECIMAL_SCALE
    }).format(numericValue);
    if (normalizedCurrency === "PHP") return `${activeFont(doc) === PDF_FONT_NAME ? "\u20B1" : "PHP "}${formatted}`;
    return `${normalizedCurrency} ${formatted}`;
}

function valueText(value: string): string {
    return value.trim() || "N/A";
}

function currentY(doc: jsPDF, fallback: number): number {
    const lastTable = doc as jsPDF & { lastAutoTable?: { finalY?: number } };
    return lastTable.lastAutoTable?.finalY ? lastTable.lastAutoTable.finalY + 7 : fallback;
}

function drawMetadata(doc: jsPDF, data: WarehouseReceivingPrintableSnapshot, startY: number): number {
    const rows: Array<[string, string]> = [
        ["Receipt / DR Number", data.receiptNumber],
        ["Date of Receipt", data.receiptDate],
        ["Receiving Branch", data.receivingBranch],
        ["Supplier Vendor", data.supplierVendor],
        ["PO Reference No.", data.poReferenceNumber],
        ["PO Total Amount", money(data.poTotalAmount, data.poTotalCurrency, doc)]
    ];
    let y = startY;
    const valueX = 58;
    const valueWidth = PAGE_WIDTH - valueX - PAGE_MARGIN;
    for (const [label, value] of rows) {
        setPdfFont(doc, "bold");
        doc.setFontSize(7.5);
        doc.text(label, PAGE_MARGIN, y);
        setPdfFont(doc);
        const lines = doc.splitTextToSize(valueText(value), valueWidth) as string[];
        doc.text(lines, valueX, y);
        y += Math.max(5, lines.length * 3.5) + 2;
    }
    return y + 2;
}

export async function generateWarehouseReceivingPdf(data: WarehouseReceivingPrintableSnapshot): Promise<Buffer> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    registerPdfFont(doc);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    setPdfFont(doc, "bold");
    doc.setFontSize(14);
    doc.text("RECEIVING SUMMARY", pageWidth / 2, 15, { align: "center" });
    doc.setDrawColor(70, 70, 70);
    doc.line(PAGE_MARGIN, 21, pageWidth - PAGE_MARGIN, 21);

    let y = drawMetadata(doc, data, 30);
    setPdfFont(doc, "bold");
    doc.setFontSize(9);
    doc.text("RECEIVED LINE ITEMS", PAGE_MARGIN, y);
    y += 5;

    const autoTableModule = await import("jspdf-autotable");
    const autoTable = (autoTableModule.default || autoTableModule) as typeof import("jspdf-autotable").default;
    autoTable(doc, {
        startY: y,
        head: [["#", "ITEM CODE", "PRODUCT DESCRIPTION", "UOM", "ORDERED", "PREV. RECEIVED", "RECEIVING QTY", "OVERAGE / REM."]],
        body: data.lines.map(line => [
            String(line.lineNumber),
            line.itemCode,
            line.description,
            line.uom,
            quantity(line.orderedQuantity),
            quantity(line.previouslyReceivedQuantity),
            quantity(line.receivingQuantity),
            line.overageOrRemaining
        ]),
        theme: "grid",
        tableWidth: TABLE_WIDTH,
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 18 },
        styles: {
            font: activeFont(doc),
            fontSize: 7,
            cellPadding: 1.6,
            overflow: "linebreak",
            lineColor: [175, 175, 175],
            lineWidth: 0.2,
            textColor: [20, 20, 20]
        },
        headStyles: {
            fillColor: [48, 48, 48],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            halign: "center",
            valign: "middle"
        },
        alternateRowStyles: { fillColor: [246, 246, 246] },
        columnStyles: {
            0: { cellWidth: 8, halign: "center" },
            1: { cellWidth: 24 },
            2: { cellWidth: 41 },
            3: { cellWidth: 16, halign: "center" },
            4: { cellWidth: 20, halign: "right" },
            5: { cellWidth: 25, halign: "right" },
            6: { cellWidth: 25, halign: "right" },
            7: { cellWidth: 31, halign: "right" }
        }
    });

    y = currentY(doc, y + 12);
    if (y > pageHeight - 38) {
        doc.addPage();
        y = PAGE_MARGIN + 8;
    }
    setPdfFont(doc, "bold");
    doc.setFontSize(9);
    doc.text("RECEIVING TOTALS", PAGE_MARGIN, y);
    y += 4;
    autoTable(doc, {
        startY: y,
        body: [
            ["RECEIVED QTY", quantity(data.receivedQuantity)],
            ["TOTAL UNITS ENTERED", quantity(data.totalUnitsEntered)],
            ["TOTAL AMOUNT", money(data.poTotalAmount, data.poTotalCurrency, doc)]
        ],
        theme: "grid",
        tableWidth: TABLE_WIDTH,
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 18 },
        styles: {
            font: activeFont(doc),
            fontSize: 8,
            cellPadding: 2,
            lineColor: [175, 175, 175],
            lineWidth: 0.2,
            textColor: [20, 20, 20]
        },
        columnStyles: {
            0: { cellWidth: 130, fontStyle: "bold" },
            1: { cellWidth: 60, halign: "right", fontStyle: "bold" }
        }
    });

    return Buffer.from(doc.output("arraybuffer"));
}
