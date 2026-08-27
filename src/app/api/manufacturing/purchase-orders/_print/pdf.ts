import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { jsPDF } from "jspdf";
import type { PurchaseOrderPrintableSnapshot } from "./types";

type PdfDocument = InstanceType<typeof jsPDF>;

type TableOptions = {
    fontSize?: number;
    columnStyles?: Record<string, { cellWidth?: number | "auto" | "wrap"; halign?: "left" | "center" | "right" }>;
    headFillColor?: [number, number, number];
    tableWidth?: number | "auto" | "wrap";
    cellPadding?: number;
};

const PAGE_MARGIN = 10;
const FOOTER_RESERVED = 22;
const PDF_FONT_NAME = "Arial";
const PDF_FONT_FILE = "arial.ttf";
const PDF_FONT_BOLD_FILE = "arial-bold.ttf";
const STANDARD_PURCHASE_TERMS = [
    "Please send two copies of your invoice upon shipment.",
    "Enter this purchase-order number on all packages, bills of lading, and invoices.",
    "Goods are subject to inspection and approval upon arrival. Non-conforming goods will be returned at the seller's expense."
];

function activeFont(doc: PdfDocument): string {
    return doc.getFont().fontName === PDF_FONT_NAME ? PDF_FONT_NAME : "helvetica";
}

function setPdfFont(doc: PdfDocument, style: "normal" | "bold" | "italic" = "normal"): PdfDocument {
    doc.setFont(activeFont(doc), style);
    return doc;
}

function supportsPesoGlyph(doc: PdfDocument): boolean {
    return activeFont(doc) === PDF_FONT_NAME;
}

function money(value: number, currency: string, doc: PdfDocument): string {
    const normalizedCurrency = (currency || "PHP").toUpperCase();
    const numericValue = Number.isFinite(value) ? value : 0;
    if (normalizedCurrency === "PHP") {
        const amount = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numericValue);
        return `${supportsPesoGlyph(doc) ? "₱" : "PHP "}${amount}`;
    }
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: normalizedCurrency,
        maximumFractionDigits: 2
    }).format(numericValue);
}

function quantity(value: number): string {
    return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 }).format(Number.isFinite(value) ? value : 0);
}

function displayDate(value: string): string {
    if (!value || value === "N/A") return "N/A";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-PH");
}

function printableDate(value: string): string {
    if (!value || value === "N/A") return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Manila"
    }).format(date);
}

function uniqueValues(values: readonly string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(value => value && value !== "N/A"))];
}

function joinValues(values: readonly string[], fallback = "N/A"): string {
    return uniqueValues(values).join(", ") || fallback;
}

function pdfText(value: unknown, fallback = "N/A"): string {
    const result = String(value ?? "").trim();
    return result || fallback;
}

function fitSingleLine(doc: PdfDocument, value: string, maxWidth: number): string {
    if (doc.getTextWidth(value) <= maxWidth) return value;
    let shortened = value;
    while (shortened.length > 4 && doc.getTextWidth(`${shortened}...`) > maxWidth) {
        shortened = shortened.slice(0, -1);
    }
    return `${shortened}...`;
}

function registerPdfFont(doc: PdfDocument): void {
    try {
        const regularFont = readFileSync(join(process.cwd(), "public", "fonts", PDF_FONT_FILE)).toString("base64");
        const boldFont = readFileSync(join(process.cwd(), "public", "fonts", PDF_FONT_BOLD_FILE)).toString("base64");
        doc.addFileToVFS(PDF_FONT_FILE, regularFont);
        doc.addFileToVFS(PDF_FONT_BOLD_FILE, boldFont);
        doc.addFont(PDF_FONT_FILE, PDF_FONT_NAME, "normal");
        doc.addFont(PDF_FONT_BOLD_FILE, PDF_FONT_NAME, "bold");
        doc.setFont(PDF_FONT_NAME, "normal");
    } catch {
        // Keep PDF generation available if the optional Unicode font is unavailable.
        doc.setFont("helvetica", "normal");
    }
}

function purchaseOrderType(currencyCode: string): string {
    return currencyCode.toUpperCase() === "PHP" ? "Local Purchase Order" : "Foreign Purchase Order";
}

function currentY(doc: PdfDocument, fallback: number): number {
    const lastTable = (doc as PdfDocument & { lastAutoTable?: { finalY?: number } }).lastAutoTable;
    return lastTable?.finalY ? lastTable.finalY + 7 : fallback;
}

function drawHeader(doc: PdfDocument, data: PurchaseOrderPrintableSnapshot, title: string): number {
    const pageWidth = doc.internal.pageSize.getWidth();
    const company = data.company;
    if (company.logoDataUrl) {
        try {
            const format = company.logoDataUrl.startsWith("data:image/jpeg") || company.logoDataUrl.startsWith("data:image/jpg") ? "JPEG" : "PNG";
            doc.addImage(company.logoDataUrl, format, 10, 8, 20, 20);
        } catch {
            // A missing or unsupported logo must not prevent the compliance document from rendering.
        }
    }
    const left = company.logoDataUrl ? 34 : 10;
    const headerLeftWidth = Math.max(70, pageWidth - left - 92);
    setPdfFont(doc, "bold").setFontSize(12);
    const companyNameLines = doc.splitTextToSize(pdfText(company.name, "Vertex Manufacturing"), headerLeftWidth) as string[];
    doc.text(companyNameLines.slice(0, 1), left, 14);
    setPdfFont(doc, "bold").setFontSize(6.5).setTextColor(60, 60, 60);
    doc.text("PROCUREMENT & SUPPLY CHAIN MANAGEMENT", left, 19);
    setPdfFont(doc).setFontSize(7).setTextColor(0, 0, 0);
    const addressLines = doc.splitTextToSize(pdfText(company.address), headerLeftWidth) as string[];
    doc.text(addressLines.slice(0, 2), left, 24);
    const contactLines = doc.splitTextToSize(`Contact: ${pdfText(company.contact)} | ${pdfText(company.email)}`, headerLeftWidth) as string[];
    doc.text(contactLines.slice(0, 2), left, 31);

    setPdfFont(doc, "bold").setFontSize(11);
    doc.text(title, pageWidth - 10, 14, { align: "right" });
    setPdfFont(doc).setFontSize(7);
    const rightMetadataWidth = 88;
    const drawRightMetadata = (value: string, y: number) => {
        const lines = doc.splitTextToSize(value, rightMetadataWidth) as string[];
        doc.text(lines.slice(0, 2), pageWidth - 10, y, { align: "right" });
    };
    if (data.documentType === "PURCHASE_ORDER") {
        drawRightMetadata(`PO NUMBER: ${pdfText(data.purchaseOrder.purchaseOrderNumber)}`, 19);
        drawRightMetadata(`DATE: ${displayDate(data.purchaseOrder.encodedAt)}`, 24);
        drawRightMetadata(`TYPE: ${purchaseOrderType(data.purchaseOrder.currencyCode)}`, 29);
    } else if (data.documentType === "QA_GOODS_RECEIPT") {
        drawRightMetadata(`PO: ${pdfText(data.purchaseOrder.purchaseOrderNumber)}`, 19);
    } else {
        drawRightMetadata(`PO: ${pdfText(data.purchaseOrder.purchaseOrderNumber)}`, 19);
        drawRightMetadata(`Generated: ${displayDate(data.generatedAt)}`, 24);
        drawRightMetadata(`Generated by: ${pdfText(data.generatedBy)}`, 29);
    }
    doc.setDrawColor(70, 70, 70).line(10, 38, pageWidth - 10, 38);
    return 46;
}

function drawSectionTitle(doc: PdfDocument, title: string, y: number): number {
    setPdfFont(doc, "bold").setFontSize(9).setTextColor(30, 30, 30);
    doc.text(title, 10, y);
    doc.setTextColor(0, 0, 0);
    return y + 5;
}

function drawFooter(doc: PdfDocument, data: PurchaseOrderPrintableSnapshot): void {
    const pageCount = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(170, 170, 170).line(10, pageHeight - 14, pageWidth - 10, pageHeight - 14);
        setPdfFont(doc).setFontSize(6).setTextColor(90, 90, 90);
        const footerLeft = data.documentType === "PURCHASE_ORDER"
            ? "OFFICIAL PURCHASE ORDER - CONFIDENTIAL & PROPRIETARY"
            : data.documentType === "QA_GOODS_RECEIPT"
                ? "QA GOODS RECEIPT"
            : "System-generated manufacturing purchase-order compliance document";
        const footerCenter = data.documentType === "QA_GOODS_RECEIPT"
            ? ""
            : `Template: ${pdfText(data.template.name)} v${pdfText(data.template.version)}`;
        doc.text(fitSingleLine(doc, footerLeft, 62), 10, pageHeight - 9);
        if (footerCenter) doc.text(fitSingleLine(doc, footerCenter, 66), 135, pageHeight - 9, { align: "center" });
        doc.text(`Page ${page} of ${pageCount}`, pageWidth - 10, pageHeight - 9, { align: "right" });
        doc.setTextColor(0, 0, 0);
    }
}

async function renderTable(
    doc: PdfDocument,
    startY: number,
    head: string[],
    body: string[][],
    orientation: "portrait" | "landscape" = "portrait",
    options: TableOptions = {}
): Promise<number> {
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = (autoTableModule.default || autoTableModule) as typeof import("jspdf-autotable").default;
    autoTable(doc, {
        startY,
        head: [head],
        body,
        theme: "grid",
        styles: { font: activeFont(doc), fontSize: options.fontSize ?? (orientation === "landscape" ? 7 : 7.5), cellPadding: options.cellPadding ?? 2, overflow: "linebreak" },
        headStyles: { fillColor: options.headFillColor ?? [31, 78, 121], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 251] },
        margin: { left: 10, right: 10, bottom: 20 },
        tableWidth: options.tableWidth ?? "auto",
        ...(options.columnStyles ? { columnStyles: options.columnStyles } : {})
    });
    return currentY(doc, startY + 12);
}

type WrappedPanelRow = {
    labelLines: string[];
    valueLines: string[];
    height: number;
};

function wrapPanelRows(doc: PdfDocument, rows: Array<[string, string]>, labelWidth: number, valueWidth: number): WrappedPanelRow[] {
    return rows.map(([label, value]) => {
        setPdfFont(doc, "bold").setFontSize(6.3);
        const labelLines = doc.splitTextToSize(pdfText(label), labelWidth - 6) as string[];
        setPdfFont(doc, "bold").setFontSize(7);
        const valueLines = doc.splitTextToSize(pdfText(value), valueWidth) as string[];
        return {
            labelLines,
            valueLines,
            height: Math.max(5, Math.max(labelLines.length, valueLines.length) * 3.2) + 1
        };
    });
}

function infoPanelHeight(doc: PdfDocument, rows: Array<[string, string]>, labelWidth: number, valueWidth: number): number {
    const wrappedRows = wrapPanelRows(doc, rows, labelWidth, valueWidth);
    return Math.max(48, wrappedRows.reduce((total, row) => total + row.height, 0) + 15);
}

function drawInfoPanel(
    doc: PdfDocument,
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    rows: Array<[string, string]>
): void {
    const headerHeight = 7;
    const labelWidth = width * 0.36;
    const valueWidth = width - labelWidth - 7;
    const wrappedRows = wrapPanelRows(doc, rows, labelWidth, valueWidth);
    doc.setDrawColor(65, 65, 65).setLineWidth(0.25);
    doc.rect(x, y, width, height);
    doc.setFillColor(31, 78, 121);
    doc.rect(x, y, width, headerHeight, "F");
    setPdfFont(doc, "bold").setFontSize(7).setTextColor(255, 255, 255);
    const titleLines = doc.splitTextToSize(title.toUpperCase(), width - 6) as string[];
    doc.text(titleLines.slice(0, 2), x + 3, y + 4.7);

    let rowY = y + headerHeight + 5;
    wrappedRows.forEach(row => {
        setPdfFont(doc, "bold").setFontSize(6.3).setTextColor(80, 80, 80);
        doc.text(row.labelLines, x + 3, rowY);
        setPdfFont(doc, "bold").setFontSize(7).setTextColor(20, 20, 20);
        doc.text(row.valueLines, x + labelWidth, rowY);
        rowY += row.height;
    });
    doc.setTextColor(0, 0, 0);
}

function ensureSpace(
    doc: PdfDocument,
    y: number,
    requiredHeight: number,
    data: PurchaseOrderPrintableSnapshot,
    title: string
): number {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + requiredHeight <= pageHeight - FOOTER_RESERVED) return y;
    doc.addPage();
    return drawHeader(doc, data, title);
}

function drawRemarksAndTotals(doc: PdfDocument, data: PurchaseOrderPrintableSnapshot, startY: number): number {
    const po = data.purchaseOrder;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - PAGE_MARGIN * 2;
    const gap = 4;
    const remarksWidth = 108;
    const totalsWidth = contentWidth - remarksWidth - gap;
    const remarks = po.remark || "No purchase notes or special terms recorded.";
    setPdfFont(doc).setFontSize(7);
    const remarkLines = doc.splitTextToSize(remarks, remarksWidth - 8) as string[];
    const gross = data.lines.reduce((sum, line) => sum + line.orderedQuantity * line.unitPriceForeign, 0);
    const discount = data.lines.reduce((sum, line) => sum + line.discountAmount, 0);
    const net = data.lines.reduce((sum, line) => sum + line.netAmount, 0);
    const displayNet = data.lines.length > 0
        ? net
        : (po.currencyCode === "PHP" ? po.totalAmount : po.totalForeignCurrency);
    const totalRows: Array<[string, string, boolean?]> = [
        ["Subtotal (Gross):", money(data.lines.length > 0 ? gross : po.grossAmount, po.currencyCode, doc)],
        ["Discount Subtotal:", `-${money(discount, po.currencyCode, doc)}`],
        [`TOTAL NET (${po.currencyCode}):`, money(displayNet, po.currencyCode, doc), true]
    ];
    if (po.currencyCode !== "PHP") {
        totalRows.push([`PHP Value (@ ${po.exchangeRate.toFixed(4)}):`, money(po.totalAmount, "PHP", doc)]);
    }
    const totalsAvailableWidth = totalsWidth - 6;
    const totalsLabelWidth = totalsAvailableWidth * 0.56;
    const totalsValueWidth = totalsAvailableWidth - totalsLabelWidth - 3;
    const wrappedTotals = totalRows.map(([label, value, emphasized]) => {
        setPdfFont(doc, emphasized ? "bold" : "normal").setFontSize(emphasized ? 8 : 7);
        const labelLines = doc.splitTextToSize(label, totalsLabelWidth) as string[];
        const valueLines = doc.splitTextToSize(value, totalsValueWidth) as string[];
        return {
            labelLines,
            valueLines,
            emphasized,
            height: Math.max(7, Math.max(labelLines.length, valueLines.length) * 3.5 + 1)
        };
    });
    const totalsHeight = 12 + wrappedTotals.reduce((total, row) => total + row.height, 0);
    const height = Math.max(34, 18 + remarkLines.length * 3.4, totalsHeight);
    doc.setDrawColor(65, 65, 65).setLineWidth(0.25);
    doc.rect(PAGE_MARGIN, startY, remarksWidth, height);
    doc.rect(PAGE_MARGIN + remarksWidth + gap, startY, totalsWidth, height);
    setPdfFont(doc, "bold").setFontSize(7).setTextColor(20, 20, 20);
    doc.text("REMARKS & SPECIAL INSTRUCTIONS", PAGE_MARGIN + 3, startY + 6);
    setPdfFont(doc).setFontSize(7).setTextColor(50, 50, 50);
    doc.text(remarkLines, PAGE_MARGIN + 3, startY + 12);

    const totalsX = PAGE_MARGIN + remarksWidth + gap;
    let rowY = startY + 7;
    wrappedTotals.forEach(row => {
        setPdfFont(doc, row.emphasized ? "bold" : "normal").setFontSize(row.emphasized ? 8 : 7);
        doc.setTextColor(row.emphasized ? 20 : 70, row.emphasized ? 20 : 70, row.emphasized ? 20 : 70);
        doc.text(row.labelLines, totalsX + 3, rowY);
        doc.text(row.valueLines, totalsX + totalsWidth - 3, rowY, { align: "right" });
        if (row.emphasized) {
            doc.setDrawColor(90, 90, 90).line(totalsX, rowY + row.height - 1, totalsX + totalsWidth, rowY + row.height - 1);
        }
        rowY += row.height;
    });
    doc.setTextColor(0, 0, 0);
    return startY + height + 6;
}

function drawStandardPurchaseTerms(doc: PdfDocument, startY: number): number {
    let y = drawSectionTitle(doc, "STANDARD PURCHASE TERMS & CONDITIONS", startY);
    setPdfFont(doc).setFontSize(7).setTextColor(50, 50, 50);
    STANDARD_PURCHASE_TERMS.forEach((term, index) => {
        const lines = doc.splitTextToSize(`${index + 1}. ${term}`, doc.internal.pageSize.getWidth() - 24) as string[];
        doc.text(lines, PAGE_MARGIN + 2, y);
        y += Math.max(4, lines.length * 3.2) + 1;
    });
    doc.setTextColor(0, 0, 0);
    return y + 4;
}

function drawSignatureBlock(doc: PdfDocument, startY: number): number {
    const labels = ["1. PREPARED BY", "2. APPROVED BY", "3. RECEIVED & QC BY", "4. POSTED BY"];
    const contentWidth = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
    const columnGap = 4;
    const columnWidth = (contentWidth - columnGap * 3) / 4;
    labels.forEach((label, index) => {
        const x = PAGE_MARGIN + index * (columnWidth + columnGap);
        doc.setDrawColor(70, 70, 70).line(x, startY, x + columnWidth, startY);
        setPdfFont(doc, "bold").setFontSize(6.5).setTextColor(20, 20, 20);
        doc.text(label, x, startY + 5);
        setPdfFont(doc).setFontSize(6.5).setTextColor(80, 80, 80);
        doc.text("SIGNATURE & DATE", x, startY + 10);
    });
    doc.setTextColor(0, 0, 0);
    return startY + 16;
}

function drawBottomSignatureBlock(doc: PdfDocument, data: PurchaseOrderPrintableSnapshot, y: number): number {
    const pageHeight = doc.internal.pageSize.getHeight();
    const footerBoundary = pageHeight - FOOTER_RESERVED;
    const sectionHeight = 27;
    if (y + sectionHeight > footerBoundary) {
        doc.addPage();
        y = drawHeader(doc, data, "QA GOODS RECEIPT");
    }
    const sectionY = Math.max(y + 3, footerBoundary - sectionHeight);
    const headingY = drawSectionTitle(doc, "Signatories", sectionY);
    return drawSignatureBlock(doc, headingY + 3);
}

function drawPurchaseOrderAuditStrip(doc: PdfDocument, data: PurchaseOrderPrintableSnapshot, startY: number): number {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setDrawColor(170, 170, 170).line(PAGE_MARGIN, startY, pageWidth - PAGE_MARGIN, startY);
    setPdfFont(doc).setFontSize(5.5).setTextColor(90, 90, 90);
    const auditText = [
        `Audit source: purchase_order:${data.purchaseOrder.id}`,
        `Workflow revision: ${data.purchaseOrder.workflowRevision}`,
        `Template: ${pdfText(data.template.name)} v${pdfText(data.template.version)}`,
        `Generated by: ${pdfText(data.generatedBy)}`
    ].join(" | ");
    const lines = doc.splitTextToSize(auditText, pageWidth - PAGE_MARGIN * 2) as string[];
    doc.text(lines, PAGE_MARGIN, startY + 4);
    doc.setTextColor(0, 0, 0);
    return startY + Math.max(7, lines.length * 3.2);
}

async function renderPoDocument(doc: PdfDocument, data: PurchaseOrderPrintableSnapshot, y: number): Promise<number> {
    const po = data.purchaseOrder;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - PAGE_MARGIN * 2;
    const gap = 4;
    const panelWidth = (contentWidth - gap) / 2;
    const supplierRows: Array<[string, string]> = [
        ["Vendor / Supplier", po.supplier],
        ["Vendor Class", po.vendorClass],
        ["Supplier Address", po.supplierAddress],
        ["Payment Terms", po.paymentTerms],
        ["Delivery Terms", po.deliveryTerms],
        ["Payment Mode", po.paymentMode],
        ["Arrangement", po.paymentArrangement]
    ];
    const orderRows: Array<[string, string]> = [
        ["External Ref", po.reference],
        ["Plant Branch", po.branch],
        ["Currency / FX", `${po.currencyCode} @ ${po.exchangeRate.toFixed(4)}`],
        ["Price Control Source", po.priceType],
        ["Status", `${po.inventoryStatus} / ${po.paymentStatus}`]
    ];
    const panelHeight = Math.max(
        infoPanelHeight(doc, supplierRows, panelWidth * 0.36, panelWidth * 0.64 - 7),
        infoPanelHeight(doc, orderRows, panelWidth * 0.36, panelWidth * 0.64 - 7)
    );
    y = ensureSpace(doc, y, panelHeight + 8, data, "PURCHASE ORDER");
    drawInfoPanel(doc, PAGE_MARGIN, y, panelWidth, panelHeight, "Vendor / Supplier Details", supplierRows);
    drawInfoPanel(doc, PAGE_MARGIN + panelWidth + gap, y, panelWidth, panelHeight, "Order Specifications", orderRows);
    y += panelHeight + 8;

    y = drawSectionTitle(doc, "PURCHASE ORDER CARGO MANIFEST", y);
    y = await renderTable(
        doc,
        y,
        ["#", "Item Type", "Raw Product Description", "UOM", "Qty", "Unit Price", "Discount", "Net Amount"],
        data.lines.map((line, index) => [
            String(index + 1),
            pdfText(line.categoryType).replace(/_/g, " "),
            `${line.productName}\n${line.productCode}`,
            line.unit,
            quantity(line.orderedQuantity),
            money(line.unitPriceForeign, po.currencyCode, doc),
            money(line.discountAmount, po.currencyCode, doc),
            money(line.netAmount, po.currencyCode, doc)
        ]),
        "portrait",
        {
            fontSize: 6.8,
            cellPadding: 1.5,
            headFillColor: [34, 34, 34],
            tableWidth: contentWidth,
            columnStyles: {
                "0": { cellWidth: 8, halign: "center" },
                "1": { cellWidth: 24 },
                "2": { cellWidth: 58 },
                "3": { cellWidth: 15, halign: "center" },
                "4": { cellWidth: 17, halign: "right" },
                "5": { cellWidth: 22, halign: "right" },
                "6": { cellWidth: 21, halign: "right" },
                "7": { cellWidth: 25, halign: "right" }
            }
        }
    );

    if (po.isForceReceived) {
        y = ensureSpace(doc, y, 24, data, "PURCHASE ORDER");
        y = drawSectionTitle(doc, "FORCE RECEIVED", y);
        y = await renderTable(doc, y, ["Closed at", "Force Close Reason"], [[
            po.forceReceivedAt || "N/A",
            po.forceReceivedReason || "N/A"
        ]]);
    }

    y = ensureSpace(doc, y, 58, data, "PURCHASE ORDER");
    y = drawRemarksAndTotals(doc, data, y);
    y = ensureSpace(doc, y, 42, data, "PURCHASE ORDER");
    y = drawStandardPurchaseTerms(doc, y);
    y = ensureSpace(doc, y, 24, data, "PURCHASE ORDER");
    y = drawPurchaseOrderAuditStrip(doc, data, y);
    return drawSignatureBlock(doc, y);
}

async function renderFinanceDocument(doc: PdfDocument, data: PurchaseOrderPrintableSnapshot, y: number): Promise<number> {
    const selected = data.selectedApproval;
    y = drawSectionTitle(doc, "Finance decision", y);
    y = await renderTable(doc, y, ["Decision", "Stage", "Actor", "Decision date", "Status transition", "Revision"], [[
        selected?.action || "N/A",
        selected?.stage || "N/A",
        `${selected?.actor || "N/A"}\nRole: ${selected?.actorRole || "N/A"}`,
        selected ? displayDate(selected.createdAt) : "N/A",
        selected ? `${selected.fromStatus} -> ${selected.toStatus}` : "N/A",
        selected ? `${selected.revisionBefore} -> ${selected.revisionAfter}` : "N/A"
    ]]);
    if (selected?.remarks) {
        y = drawSectionTitle(doc, "Finance remarks", y + 2);
        setPdfFont(doc).setFontSize(8);
        doc.text(doc.splitTextToSize(selected.remarks, doc.internal.pageSize.getWidth() - 20), 10, y);
        y += 12;
    }
    y = drawSectionTitle(doc, "Purchase-order snapshot", y + 4);
    y = await renderTable(doc, y, ["Product", "Ordered", "Unit price", "Discount", "Net amount"], data.lines.map(line => [
        `${line.productName}\n${line.productCode}`,
        quantity(line.orderedQuantity),
        money(line.unitPriceForeign, data.purchaseOrder.currencyCode, doc),
        money(line.discountAmount, data.purchaseOrder.currencyCode, doc),
        money(line.netAmount, data.purchaseOrder.currencyCode, doc)
    ]));
    y = drawSectionTitle(doc, "Approval history", y);
    y = await renderTable(doc, y, ["Action", "Stage", "Actor", "Remarks", "Created", "Revision"], data.approvals.map(entry => [
        entry.action,
        entry.stage,
        entry.actor,
        entry.remarks || "N/A",
        displayDate(entry.createdAt),
        `${entry.revisionBefore} -> ${entry.revisionAfter}`
    ]));
    return y;
}

function qaReceiptSummary(data: PurchaseOrderPrintableSnapshot) {
    const receiptHeaders = data.receivingHeaders;
    const recordReceiptNumbers = data.receivingRecords.map(record => record.receiptNumber);
    const recordReceiptDates = data.receivingRecords.map(record => record.receivedDate);
    const recordBranches = data.receivingRecords.map(record => record.branch);
    const receiptNumbers = receiptHeaders.length > 0
        ? receiptHeaders.map(header => header.receiptNumber)
        : recordReceiptNumbers;
    const receiptDates = receiptHeaders.length > 0
        ? receiptHeaders.map(header => printableDate(header.receiptDate))
        : recordReceiptDates.map(printableDate);
    const branches = receiptHeaders.length > 0
        ? receiptHeaders.map(header => header.branch)
        : recordBranches;
    const receiptStatuses = receiptHeaders.map(header => header.quantityStatus);
    const receiptCount = receiptHeaders.length > 0
        ? `${receiptHeaders.length} committed receipt${receiptHeaders.length === 1 ? "" : "s"}`
        : receiptNumbers.length > 0
            ? `${uniqueValues(receiptNumbers).length} receipt${uniqueValues(receiptNumbers).length === 1 ? "" : "s"}`
            : "N/A";
    return {
        receiptNumbers: joinValues(receiptNumbers),
        receiptDates: joinValues(receiptDates),
        branches: joinValues(branches),
        receiptStatuses: joinValues(receiptStatuses),
        receiptCount
    };
}

async function renderQaDocument(doc: PdfDocument, data: PurchaseOrderPrintableSnapshot, y: number): Promise<number> {
    const po = data.purchaseOrder;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - PAGE_MARGIN * 2;
    const gap = 4;
    const panelWidth = (contentWidth - gap) / 2;
    const summary = qaReceiptSummary(data);
    const supplierRows: Array<[string, string]> = [
        ["Vendor / Supplier", po.supplier],
        ["Vendor Class", po.vendorClass],
        ["Supplier Address", po.supplierAddress],
        ["Payment Terms", po.paymentTerms],
        ["Delivery Terms", po.deliveryTerms],
        ["Payment Mode", po.paymentMode],
        ["Arrangement", po.paymentArrangement]
    ];
    const receiptRows: Array<[string, string]> = [
        ["Purchase Order", po.purchaseOrderNumber],
        ["External Reference", po.reference],
        ["Purchase Order Date", printableDate(po.encodedAt)],
        ["Receipt Number(s)", summary.receiptNumbers],
        ["Receipt Date(s)", summary.receiptDates],
        ["Receipt Count", summary.receiptCount],
        ["Receiving Branch", summary.branches],
        ["Receipt Status", summary.receiptStatuses],
        ["Document Status", po.inventoryStatus],
        ["Payment Status", po.paymentStatus]
    ];
    const panelHeight = Math.max(
        infoPanelHeight(doc, supplierRows, panelWidth * 0.36, panelWidth * 0.64 - 7),
        infoPanelHeight(doc, receiptRows, panelWidth * 0.36, panelWidth * 0.64 - 7)
    );
    y = ensureSpace(doc, y, panelHeight + 13, data, "QA GOODS RECEIPT");
    y = drawSectionTitle(doc, "Goods-receipt details", y);
    drawInfoPanel(doc, PAGE_MARGIN, y, panelWidth, panelHeight, "Supplier / Order Details", supplierRows);
    drawInfoPanel(doc, PAGE_MARGIN + panelWidth + gap, y, panelWidth, panelHeight, "Receipt Details", receiptRows);
    y += panelHeight + 8;
    y = drawSectionTitle(doc, "QA inspection and receiving records", y);
    y = await renderTable(doc, y,
        ["Product", "Receipt / batch", "Branch / lot", "Received", "Accepted", "Rejected", "Over-delivery", "QA", "Expiry"],
        data.receivingRecords.map(record => [
            `${record.product}\n${record.productCode}`,
            `${record.receiptNumber}\n${record.batchNumber}`,
            `${record.branch}\n${record.storageLot}`,
            quantity(record.receivedQuantity),
            quantity(record.acceptedQuantity),
            quantity(record.rejectedQuantity),
            quantity(record.overDeliveryQuantity),
            record.qaStatus,
            printableDate(record.expirationDate)
        ]));
    return drawBottomSignatureBlock(doc, data, y);
}

async function renderStorageDocument(doc: PdfDocument, data: PurchaseOrderPrintableSnapshot, y: number): Promise<number> {
    y = drawSectionTitle(doc, "Inventory movement and storage-lot handoff", y);
    y = await renderTable(doc, y,
        ["Kind", "Product", "Storage lot", "Branch", "Quantity", "Transaction", "Source / batch"],
        data.movements.map(movement => [
            movement.kind,
            `${movement.product}\n${movement.productCode}`,
            movement.storageLot,
            movement.branch,
            quantity(movement.quantity),
            movement.transactionType,
            `${movement.sourceDocument}\n${movement.batchNumber}`
        ]));
    y = drawSectionTitle(doc, "MRP storage allocations", y);
    y = await renderTable(doc, y, ["Allocation", "Product", "Job order", "Material", "Quantity", "Inventory lots"], data.allocations.map(allocation => [
        String(allocation.allocationId),
        allocation.product,
        allocation.jobOrder,
        allocation.material,
        quantity(allocation.quantity),
        allocation.inventoryLots
    ]));
    return y;
}

async function renderLandedCostDocument(doc: PdfDocument, data: PurchaseOrderPrintableSnapshot, y: number): Promise<number> {
    const landedCost = data.landedCost;
    if (!landedCost) return y;
    y = drawSectionTitle(doc, "Landed-cost computation", y);
    y = await renderTable(doc, y, ["Computation", "Status", "Allocation rule", "Total landed fee", "Rounding variance", "Finalized"], [[
        `#${landedCost.computationId}`,
        landedCost.status,
        landedCost.allocationRule,
        money(landedCost.totalLandedFee, "PHP", doc),
        money(landedCost.roundingVariance, "PHP", doc),
        displayDate(landedCost.finalizedAt)
    ]]);
    if (landedCost.expenses.length > 0) {
        y = drawSectionTitle(doc, "Landed-cost expenses", y);
        y = await renderTable(doc, y, ["Expense", "Chart of account", "Amount"], landedCost.expenses.map(expense => [
            expense.expenseType,
            expense.account,
            money(expense.amount, "PHP", doc)
        ]));
    }
    y = drawSectionTitle(doc, "Line allocation", y);
    y = await renderTable(doc, y, ["Product", "Quantity", "Base unit cost (PHP)", "Allocated fee (PHP)", "Final landed unit cost (PHP)", "Share"], landedCost.allocations.map(allocation => [
        allocation.product,
        quantity(allocation.quantity),
        money(allocation.baseUnitCost, "PHP", doc),
        money(allocation.allocatedExpense, "PHP", doc),
        money(allocation.finalLandedUnitCost, "PHP", doc),
        allocation.allocationPercent == null ? "N/A" : `${allocation.allocationPercent.toFixed(4)}%`
    ]));
    if (landedCost.attachments.length > 0) {
        y = drawSectionTitle(doc, "Supporting computation files", y);
        setPdfFont(doc).setFontSize(8);
        const attachmentLines = doc.splitTextToSize(landedCost.attachments.join("\n"), doc.internal.pageSize.getWidth() - 20) as string[];
        doc.text(attachmentLines, 10, y);
        y += attachmentLines.length * 4;
    }
    return y;
}

async function renderAuditBlock(doc: PdfDocument, data: PurchaseOrderPrintableSnapshot, y: number): Promise<number> {
    const selectedApproval = data.selectedApproval;
    y = drawSectionTitle(doc, "Audit source records and sign-off", y + 3);
    return renderTable(doc, y, ["Audit field", "Value", "Audit field", "Value"], [
        ["Document type", data.documentType, "Purchase-order ID", String(data.purchaseOrder.id)],
        ["Workflow revision", String(data.purchaseOrder.workflowRevision), "Template", `${data.template.name} v${data.template.version}`],
        ["Approval history ID", selectedApproval ? String(selectedApproval.historyId) : "N/A", "Receiving header ID", data.sourceReceivingHeaderId ? String(data.sourceReceivingHeaderId) : "N/A"],
        ["Landed-cost computation ID", data.landedCost ? String(data.landedCost.computationId) : "N/A", "Generated by", data.generatedBy],
        ["Generated at", displayDate(data.generatedAt), "PO source", `purchase_order:${data.purchaseOrder.id}`],
        ["Buyer / preparer sign-off", "Signature/date: ____________________", "Finance / QA sign-off", "Signature/date: ____________________"]
    ]);
}

export async function generatePurchaseOrderPdf(data: PurchaseOrderPrintableSnapshot): Promise<{ buffer: Buffer; pageCount: number }> {
    const jsPDFModule = await import("jspdf");
    const JsPDFClass = (jsPDFModule.default || jsPDFModule.jsPDF) as unknown as typeof import("jspdf").jsPDF;
    const doc = new JsPDFClass({ orientation: "portrait", unit: "mm", format: "a4" });
    registerPdfFont(doc);
    const titles: Record<PurchaseOrderPrintableSnapshot["documentType"], string> = {
        PURCHASE_ORDER: "PURCHASE ORDER",
        FINANCE_DECISION: "FINANCE DECISION",
        QA_GOODS_RECEIPT: "QA GOODS RECEIPT",
        STORAGE_LOT_ALLOCATION: "STORAGE-LOT ALLOCATION",
        LANDED_COST: "LANDED-COST COMPUTATION"
    };
    const y = drawHeader(doc, data, titles[data.documentType]);
    let contentY = y;
    switch (data.documentType) {
        case "PURCHASE_ORDER": contentY = await renderPoDocument(doc, data, y); break;
        case "FINANCE_DECISION": contentY = await renderFinanceDocument(doc, data, y); break;
        case "QA_GOODS_RECEIPT": contentY = await renderQaDocument(doc, data, y); break;
        case "STORAGE_LOT_ALLOCATION": contentY = await renderStorageDocument(doc, data, y); break;
        case "LANDED_COST": contentY = await renderLandedCostDocument(doc, data, y); break;
    }
    if (data.documentType !== "PURCHASE_ORDER" && data.documentType !== "QA_GOODS_RECEIPT") {
        await renderAuditBlock(doc, data, Math.max(contentY, currentY(doc, y)));
    }
    drawFooter(doc, data);
    return { buffer: Buffer.from(doc.output("arraybuffer")), pageCount: doc.getNumberOfPages() };
}
