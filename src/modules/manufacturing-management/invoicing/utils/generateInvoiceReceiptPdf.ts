import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PrintableInvoice, ORTemplate, ORFieldConfig } from "../types";
import { receiptBackgroundUrl } from "../services/invoicing-api";

const money = (value: number) => new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

function formatDate(dateStr: string) {
    try {
        return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
    } catch {
        return dateStr;
    }
}

const CODE128_PATTERNS = [
    "11011001100", "11001101100", "11001100110", "10010011000", "10010001100", "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
    "11001000100", "11000100100", "10110011100", "10011011100", "10011001110", "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
    "11001001110", "11011100100", "11001110100", "11101101110", "11101001100", "11101000110", "11100010110", "11101101000", "11101100100", "11101100010",
    "11011011000", "11011000110", "11000110110", "10101111000", "10001011110", "10111101000", "11110101000", "11110100010", "10111011110",
    "10111101110", "11101011110", "11110101110", "11101110110", "11101111010", "11111011010", "11101111101", "11111011110", "11101111101", "11011111010",
    "11111101101", "11011111011", "11110111011", "11011011111", "11100100010", "11010001110", "11000101110", "11000111010", "11101101110", "11101000110",
    "11100010110", "11101101000", "11101100100", "11101100010", "11011011000", "11011000110", "11000110110", "10101111000", "10001011110", "10111101000",
    "11110101000", "11110100010", "10111011110", "10111101110", "11101011110", "11110101110", "11101110110", "11101111010", "11111011010", "11101111101",
    "11111011110", "11111101101", "11011111011", "11110111011", "11011011111", "11101101110", "11011111010", "11010111110", "11011101110", "11110101110",
    "11011111011", "11110111011"
];

function drawBarcodeVector(doc: jsPDF, text: string, x: number, y: number, config: ORFieldConfig) {
    if (!text) return;
    try {
        const barcodeHeight = config.barcodeHeight ?? 9;
        const moduleWidth = config.barcodeModuleWidth ?? 0.45;
        const showText = !config.hideBarcodeText;

        let checksum = 104;
        let bits = "11010010110";

        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i);
            const val = charCode - 32;
            if (val < 0 || val > 102) continue;
            bits += CODE128_PATTERNS[val];
            checksum += (val * (i + 1));
        }

        checksum %= 103;
        bits += CODE128_PATTERNS[checksum];
        bits += "11000111010";
        bits += "11";

        const totalBarcodeWidth = bits.length * moduleWidth;
        const quietZoneH = 4;
        const quietZoneV = 2;

        doc.setFillColor(255, 255, 255);
        doc.rect(x - quietZoneH, y - quietZoneV, totalBarcodeWidth + (quietZoneH * 2), barcodeHeight + (quietZoneV * 2) + (showText ? 5 : 0), 'F');

        if (!config.hidden) {
            doc.setFillColor(0, 0, 0);
            let currentX = x;
            let i = 0;
            while (i < bits.length) {
                let j = i;
                while (j < bits.length && bits[j] === bits[i]) j++;
                const count = j - i;
                if (bits[i] === "1") doc.rect(currentX, y, moduleWidth * count, barcodeHeight, 'F');
                currentX += moduleWidth * count;
                i = j;
            }
        }

        if (showText) {
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(config.fontSize || 8);
            doc.setFont('courier', 'normal');
            doc.text(text, x + (totalBarcodeWidth / 2), y + barcodeHeight + 3, { align: 'center' });
        }
    } catch { }
}

function renderField(doc: jsPDF, key: string, value: string, defaultX: number, defaultY: number, template?: ORTemplate) {
    const config = template?.fields?.[key];
    if (config?.hidden) return;

    const x = config ? config.x : defaultX;
    const y = config ? config.y : defaultY;

    if (config) {
        doc.setFont(config.fontFamily || 'courier', config.fontWeight || 'normal');
        doc.setFontSize(config.fontSize || 10);
        doc.setCharSpace(config.charSpacing ?? 0);
    } else {
        doc.setFont('courier', 'normal');
        doc.setFontSize(10);
        doc.setCharSpace(0);
    }

    const maxWidth = config?.maxWidth;
    const lineHeightMult = config?.lineHeight ?? 1.2;
    const fontSizePt = config?.fontSize || 10;
    const lineStep = (fontSizePt * 0.3527) * lineHeightMult;

    if (maxWidth) {
        const lines = doc.splitTextToSize(value, maxWidth);
        (lines as string[]).forEach((line, idx) => doc.text(line, x, y + (idx * lineStep), { baseline: 'top' }));
    } else {
        const scaleX = config?.scaleX ?? 1;
        if (scaleX !== 1) {
            try {
                doc.saveGraphicsState();
                (doc as unknown as { scale?: (x: number, y: number) => jsPDF }).scale?.(scaleX, 1);
                doc.text(value, x / scaleX, y, { baseline: 'top' });
                doc.restoreGraphicsState();
            } catch {
                doc.text(value, x, y, { baseline: 'top' });
            }
        } else {
            doc.text(value, x, y, { baseline: 'top' });
        }
    }
}

export async function generateInvoiceReceiptPdf(invoice: PrintableInvoice, options: { includeBackground?: boolean } = {}): Promise<jsPDF> {
    const template = invoice.templateConfig;

    if (template) {
        return generateOfficialReceipt(invoice, template as unknown as ORTemplate, options.includeBackground !== false);
    }

    return generateTableReceipt(invoice);
}

function generateTableReceipt(invoice: PrintableInvoice): jsPDF {
    const doc = new jsPDF({ unit: "mm", format: [210, 265] });
    doc.setProperties({ title: `${invoice.receiptType.type} ${invoice.invoiceNo}`, subject: "Sales Invoice", author: "VOS Manufacturing Management" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(invoice.receiptType.type.toUpperCase(), 105, 14, { align: "center" });
    doc.setFontSize(9);
    doc.text(`NO. ${invoice.invoiceNo}`, 195, 14, { align: "right" });
    doc.setLineWidth(0.25);
    doc.line(15, 18, 195, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const fields: [string, string, string, string][] = [
        ["DATE", formatDate(invoice.invoiceDate), "PO NO.", invoice.poNo || "N/A"],
        ["CUSTOMER", invoice.customerName, "SALESMAN", invoice.salesmanName],
        ["STORE", invoice.storeName, "TERMS", invoice.paymentTermName],
        ["ADDRESS", invoice.customerAddress || "N/A", "TIN", invoice.customerTin],
    ];
    let y = 25;
    for (const [leftLabel, leftValue, rightLabel, rightValue] of fields) {
        doc.setFont("helvetica", "bold");
        doc.text(`${leftLabel}:`, 15, y);
        doc.text(`${rightLabel}:`, 125, y);
        doc.setFont("helvetica", "normal");
        doc.text(String(leftValue), 38, y, { maxWidth: 82 });
        doc.text(String(rightValue), 148, y, { maxWidth: 47 });
        y += 6;
    }

    autoTable(doc, {
        startY: 51,
        margin: { left: 15, right: 15 },
        head: [["DESCRIPTION", "QTY", "UNIT", "PRICE", "DISCOUNT", "AMOUNT"]],
        body: invoice.lines.map((line) => [
            `${line.productName}${line.productCode ? `\n${line.productCode}` : ""}`,
            money(line.quantity),
            line.unit,
            money(line.unitPrice),
            money(line.discountAmount),
            money(line.netAmount),
        ]),
        theme: "grid",
        styles: { font: "helvetica", fontSize: 7, cellPadding: 2, lineColor: [80, 80, 80], lineWidth: 0.15 },
        headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 73 }, 1: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    });

    const tableEnd = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 70;
    y = Math.min(Math.max(tableEnd + 8, 185), 225);
    const vatable = invoice.totals.net - invoice.totals.vat;
    const totals: [string, number][] = [
        ["GROSS", invoice.totals.gross],
        ["DISCOUNT", invoice.totals.discount],
        ["VATABLE SALES", vatable],
        ["VAT", invoice.totals.vat],
        ["TOTAL AMOUNT DUE", invoice.totals.net],
    ];
    for (const [label, value] of totals) {
        doc.setFont("helvetica", label === "TOTAL AMOUNT DUE" ? "bold" : "normal");
        doc.text(label, 135, y);
        doc.text(money(value), 195, y, { align: "right" });
        y += 6;
    }
    doc.line(135, y - 4, 195, y - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`Sales Order: ${invoice.orderNo}`, 15, 250);
    doc.text(`Status: ${invoice.transactionStatus}`, 195, 250, { align: "right" });
    return doc;
}

async function imageDataUrl(fileId: string) {
    const response = await fetch(receiptBackgroundUrl(fileId), { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load receipt background image");
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Unable to read receipt background image"));
        reader.readAsDataURL(blob);
    });
}

async function generateOfficialReceipt(invoice: PrintableInvoice, template: ORTemplate, includeBackground: boolean): Promise<jsPDF> {
    const width = template?.width || 210;
    const height = template?.height || 265;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [width, height], compress: true });
    doc.setProperties({ title: `Official Receipt - ${invoice.invoiceNo}`, subject: 'Sales Invoice', author: 'VOS Manufacturing Management' });

    doc.setFont('courier', 'normal');
    doc.setFontSize(11);

    if (includeBackground && template.backgroundImage) {
        doc.addImage(await imageDataUrl(template.backgroundImage), 0, 0, width, height);
    }

    const fieldValues: Record<string, string> = {
        customer_name: invoice.customerName.toUpperCase(),
        date: formatDate(invoice.invoiceDate),
        store_name: invoice.storeName.toUpperCase(),
        payment_name: invoice.paymentTermName.toUpperCase(),
        customer_tin: invoice.customerTin || "N/A",
        address: invoice.customerAddress.toUpperCase(),
        vatable_sales: money(invoice.totals.net - invoice.totals.vat),
        vat_amount: money(invoice.totals.vat),
        gross_total: money(invoice.totals.gross),
        discount_total: money(invoice.totals.discount),
        net_total: money(invoice.totals.net),
        po_no: `PO NO. : ${invoice.poNo}`,
        salesman: `SALESMAN : ${invoice.salesmanName}`,
        total_amount_due: money(invoice.totals.net),
        net_total_footer: money(invoice.totals.net),
        zero_rated: "0.00",
        exempt: "0.00",
        withholding_tax: "0.00",
    };

    if (template?.fields) {
        Object.entries(template.fields).forEach(([key, config]) => {
            const cfg = config as unknown as ORFieldConfig;
            if (key === 'barcode') {
                if (invoice.invoiceNo) {
                    drawBarcodeVector(doc, invoice.invoiceNo, cfg.x, cfg.y, cfg);
                }
                return;
            }
            if (cfg.hidden) return;
            const value = fieldValues[key];
            if (value !== undefined) {
                renderField(doc, key, value, 0, 0, template);
            }
        });
    }

    const tableStartY = template?.tableSettings?.startY || 65;
    const minRowHeight = template?.tableSettings?.rowHeight || 12.2;
    const cols = template?.tableSettings?.columns;
    const tableFontSize = template?.tableSettings?.fontSize || 10;

    doc.setFontSize(tableFontSize);
    doc.setFont('courier', 'normal');

    let currentY = tableStartY;
    const tableLineStep = (tableFontSize * 0.3527) * 1.1;

    (invoice.lines || []).forEach((item) => {
        const productName = item.productName.toUpperCase();
        const productNameX = cols?.product_name?.x || 10;
        const productNameMaxWidth = template?.tableSettings?.product_name_width || ((cols?.quantity?.x || 105) - productNameX - 5);

        const lines: string[] = doc.splitTextToSize(productName, productNameMaxWidth) as string[];

        const wrappedContentHeight = lines.length * tableLineStep;
        const actualRowHeight = Math.max(minRowHeight, wrappedContentHeight + 1);
        const midYOffset = (actualRowHeight - (tableFontSize * 0.3527)) / 2;

        if (cols?.barcode) {
            doc.text(item.productCode || "", cols.barcode.x, currentY + midYOffset, { baseline: 'top' });
        }

        lines.forEach((line, lineIdx) => {
            const blockTopOffset = (actualRowHeight - wrappedContentHeight) / 2;
            const lineY = currentY + blockTopOffset + (lineIdx * tableLineStep);
            doc.text(line, productNameX, lineY, { baseline: 'top' });
        });

        doc.text(`${item.quantity} ${item.unit}`, cols?.quantity?.x || 105, currentY + midYOffset, { align: 'center', baseline: 'top' });
        doc.text(money(item.unitPrice), cols?.unit_price?.x || 126, currentY + midYOffset, { align: 'right', baseline: 'top' });
        doc.text(item.discountAmount > 0 ? money(item.discountAmount) : "", cols?.discount?.x || 153, currentY + midYOffset, { align: 'right', baseline: 'top' });
        doc.text(money(item.netAmount), cols?.net_amount?.x || 184, currentY + midYOffset, { align: 'right', baseline: 'top' });

        currentY += actualRowHeight;
    });

    return doc;
}
