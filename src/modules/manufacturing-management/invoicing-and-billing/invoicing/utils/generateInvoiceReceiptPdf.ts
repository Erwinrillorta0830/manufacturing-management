import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PrintableInvoice, ORTemplate, ORFieldConfig } from "../types";
import { receiptBackgroundUrl } from "../services/invoicing-api";

const money = (value: number) => new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

function formatDate(dateStr: string) {
    try {
        if (!dateStr) return "";
        const parts = String(dateStr).split("T")[0].split("-");
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const d = new Date(year, month, day);
            return d.toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
        }
        return new Date(dateStr).toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
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

export async function generateInvoiceReceiptPdf(invoice: PrintableInvoice, _options?: { includeBackground?: boolean }): Promise<jsPDF> {
    return generateTableReceipt(invoice);
}

function generateTableReceipt(invoice: PrintableInvoice): jsPDF {
    const doc = new jsPDF({ unit: "mm", format: [210, 265] });
    doc.setProperties({ title: `${invoice.receiptType?.type || "Charge Invoice"} ${invoice.invoiceNo}`, subject: "Sales Invoice", author: "VOS Manufacturing Management" });

    const margin = 10;
    const pageWidth = 210;
    const pageHeight = 265;
    const contentWidth = pageWidth - margin * 2;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(margin, margin, contentWidth, pageHeight - margin * 2);

    // 1. Company Letterhead
    const companyName = invoice.companyInfo?.companyName || "MEN2 MARKETING & DISTRIBUTION ENTERPRISE CORPORATION";
    const companyTin = invoice.companyInfo?.companyTin ? `VAT REG. TIN: ${invoice.companyInfo.companyTin}` : "VAT REG. TIN: 009-553-391-00000";
    const companyAddress = invoice.companyInfo?.companyAddress || "Gonzales, Bonuan Boquig, Dagupan City, Pangasinan";

    let currentY = 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(companyName.toUpperCase(), pageWidth / 2, currentY, { align: "center" });

    currentY += 4.5;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(companyTin, pageWidth / 2, currentY, { align: "center" });

    currentY += 4;
    doc.text(companyAddress, pageWidth / 2, currentY, { align: "center" });

    // 2. Subheader (Doc Type + Barcode & Invoice No)
    currentY += 7;
    const docTitle = (invoice.receiptType?.type || "CHARGE INVOICE").toUpperCase();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(docTitle, margin + 4, currentY + 3);

    // Top Right Invoice No
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(invoice.invoiceNo, pageWidth - margin - 4, currentY + 3, { align: "right" });
    doc.setTextColor(0, 0, 0);

    // 3. Customer Info Block
    currentY += 10;
    const customerBlockTop = currentY;
    const customerBlockHeight = 24;

    doc.setLineWidth(0.3);
    doc.rect(margin + 2, customerBlockTop, contentWidth - 4, customerBlockHeight);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");

    const lineH = 5.5;
    let custY = customerBlockTop + 4.5;

    // Row 1
    doc.setFont("helvetica", "bold");
    doc.text("SOLD TO:", margin + 4, custY);
    doc.setFont("helvetica", "normal");
    doc.text((invoice.customerName || "N/A").toUpperCase(), margin + 22, custY, { maxWidth: 110 });

    doc.setFont("helvetica", "bold");
    doc.text("Date:", pageWidth - margin - 60, custY);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(invoice.invoiceDate) || "N/A", pageWidth - margin - 6, custY, { align: "right" });

    // Row 2
    custY += lineH;
    doc.setFont("helvetica", "bold");
    doc.text("Registered Name:", margin + 4, custY);
    doc.setFont("helvetica", "normal");
    doc.text((invoice.storeName || invoice.customerName || "N/A").toUpperCase(), margin + 33, custY, { maxWidth: 100 });

    doc.setFont("helvetica", "bold");
    doc.text("Terms:", pageWidth - margin - 60, custY);
    doc.setFont("helvetica", "normal");
    doc.text(invoice.paymentTermName || "N/A", pageWidth - margin - 6, custY, { align: "right" });

    // Row 3
    custY += lineH;
    doc.setFont("helvetica", "bold");
    doc.text("TIN:", margin + 4, custY);
    doc.setFont("helvetica", "normal");
    doc.text(invoice.customerTin || "N/A", margin + 14, custY);

    // Row 4
    custY += lineH;
    doc.setFont("helvetica", "bold");
    doc.text("Business Address:", margin + 4, custY);
    doc.setFont("helvetica", "normal");
    doc.text((invoice.customerAddress || "N/A").toUpperCase(), margin + 33, custY, { maxWidth: contentWidth - 40 });

    // 4. Tabular Item Grid
    currentY = customerBlockTop + customerBlockHeight + 4;
    const gridTopY = currentY;

    const netTotal = invoice.totals.net || invoice.totals.gross || 0;
    const vatableSales = netTotal / 1.12;
    const vatAmount = netTotal - vatableSales;

    const tableRows = invoice.lines.map((line) => [
        `${line.productName}${line.productCode ? `\n${line.productCode}` : ""}`,
        `${line.quantity} ${line.unit || "PCS"}`,
        `P${money(line.unitPrice)}`,
        `P${money(line.netAmount)}`
    ]);

    // Ensure minimum row count so table stretches down like BIR printed booklets
    const minRows = 10;
    while (tableRows.length < minRows) {
        tableRows.push(["", "", "", ""]);
    }

    autoTable(doc, {
        startY: gridTopY,
        margin: { left: margin + 2, right: margin + 2 },
        head: [["Item Description / Nature of Service", "Quantity", "Unit Cost/Price", "Amount"]],
        body: tableRows,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.2 },
        headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: "bold", halign: "center" },
        columnStyles: {
            0: { cellWidth: 100, halign: "left" },
            1: { cellWidth: 30, halign: "center" },
            2: { cellWidth: 28, halign: "right" },
            3: { cellWidth: 28, halign: "right" },
        },
    });

    const gridBottomY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || (gridTopY + 70);

    // 5. Footer & Tax Computation Block
    currentY = Math.max(gridBottomY + 3, 175);
    const taxBlockTop = currentY;
    const taxBlockHeight = 44;
    const colHalfWidth = (contentWidth - 4) / 2;

    doc.setLineWidth(0.3);
    doc.rect(margin + 2, taxBlockTop, contentWidth - 4, taxBlockHeight);
    doc.line(margin + 2 + colHalfWidth, taxBlockTop, margin + 2 + colHalfWidth, taxBlockTop + taxBlockHeight);

    // Left Column Tax Breakdown
    const leftRows: Array<[string, string]> = [
        ["VATable Sales", `P${money(vatableSales)}`],
        ["VAT", `P${money(vatAmount)}`],
        ["Zero-Rated Sales", "P0.00"],
        ["VAT-Exempt Sales", "P0.00"],
        [`PO NO. : ${invoice.poNo || "N/A"}`, ""],
        [`SALESMAN : ${invoice.salesmanName || "N/A"}`, ""],
    ];

    // Right Column Tax Breakdown
    const rightRows: Array<[string, string]> = [
        ["Total Sales (VAT Inclusive)", `P${money(netTotal)}`],
        ["Less: VAT", `P${money(vatAmount)}`],
        ["Amount: Net of VAT", `P${money(vatableSales)}`],
        ["Add: VAT", `P${money(vatAmount)}`],
        ["Less: Withholding Tax", "P0.00"],
        ["TOTAL AMOUNT DUE", `P${money(netTotal)}`],
    ];

    const rowStep = taxBlockHeight / 6;

    // Draw Left Rows
    leftRows.forEach(([lbl, val], idx) => {
        const rowY = taxBlockTop + idx * rowStep;
        if (idx > 0) doc.line(margin + 2, rowY, margin + 2 + colHalfWidth, rowY);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.text(lbl, margin + 5, rowY + 4.5);
        if (val) {
            doc.setFont("helvetica", "bold");
            doc.text(val, margin + colHalfWidth - 3, rowY + 4.5, { align: "right" });
        }
    });

    // Draw Right Rows
    rightRows.forEach(([lbl, val], idx) => {
        const rowY = taxBlockTop + idx * rowStep;
        const rightXStart = margin + 2 + colHalfWidth;
        if (idx > 0) doc.line(rightXStart, rowY, margin + contentWidth - 2, rowY);

        const isTotal = idx === 5;
        doc.setFont("helvetica", isTotal ? "bold" : "normal");
        doc.setFontSize(isTotal ? 8.5 : 7.5);
        doc.text(lbl, rightXStart + 3, rowY + 4.5);
        doc.setFont("helvetica", "bold");
        doc.text(val, margin + contentWidth - 4, rowY + 4.5, { align: "right" });
    });

    // 6. Footnote & Signature Block
    currentY = taxBlockTop + taxBlockHeight + 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);


    // Signature on Right Side
    const sigX = pageWidth - margin - 65;
    doc.line(sigX, currentY + 12, pageWidth - margin - 4, currentY + 12);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("Cashier/Authorized Representative", sigX + 30, currentY + 15, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Printer's Accreditation No. 004MP2024000000033", sigX + 30, currentY + 18.5, { align: "center" });
    doc.text("Date Issued: 03-14-2024", sigX + 30, currentY + 21.5, { align: "center" });

    return doc;
}

async function imageDataUrl(fileId: string): Promise<string | null> {
    try {
        const response = await fetch(receiptBackgroundUrl(fileId), { cache: "no-store" });
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => resolve("");
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

async function generateOfficialReceipt(invoice: PrintableInvoice, template: ORTemplate, includeBackground: boolean): Promise<jsPDF> {
    const width = template?.width || 210;
    const height = template?.height || 265;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [width, height], compress: true });
    doc.setProperties({ title: `Official Receipt - ${invoice.invoiceNo}`, subject: 'Sales Invoice', author: 'VOS Manufacturing Management' });

    doc.setFont('courier', 'normal');
    doc.setFontSize(11);

    if (includeBackground && template.backgroundImage) {
        try {
            const bgData = await imageDataUrl(template.backgroundImage);
            if (bgData) {
                doc.addImage(bgData, 0, 0, width, height);
            }
        } catch {
            // background skipped if missing
        }
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
