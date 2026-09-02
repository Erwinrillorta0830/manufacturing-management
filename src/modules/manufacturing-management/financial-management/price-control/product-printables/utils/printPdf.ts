// src/modules/financial-management/printables-management/product-printables/utils/printPdf.ts

import type { MatrixRow, PriceType, Unit, Supplier } from "../types";
import { PdfEngine } from "@/components/pdf-layout-design/PdfEngine";
import { PdfTemplate } from "@/components/pdf-layout-design/services/pdf-template";
import { PdfData } from "@/components/pdf-layout-design/types";
import { PRICE_MAX_DECIMAL_PLACES } from "../../shared/pricePrecision";

type MatrixOptions = {
    paper?: string;
    orientation?: "landscape" | "portrait";
    fontSize?: number;
    title?: string;
    priceTypes?: PriceType[];
    units?: Unit[];
    usedUnitIds?: Set<number>;
    supplier?: Supplier | null;
    selectedTemplate?: PdfTemplate;
    companyData?: PdfData | null;
    selectedPriceTypeIds?: string[];
    printedBy?: string;
    filterSummary?: string;
};

type PdfCell = {
    content: string;
    rowSpan?: number;
    colSpan?: number;
    styles?: {
        halign?: "left" | "center" | "right" | "justify";
        valign?: "top" | "middle" | "bottom";
        fillColor?: [number, number, number];
        textColor?: [number, number, number];
        fontStyle?: "normal" | "bold" | "italic" | "bolditalic";
        fontSize?: number;
        cellWidth?: number | "auto" | "wrap";
        minCellWidth?: number;
        overflow?: "linebreak" | "ellipsize" | "visible" | "hidden";
    };
};

const TIERS = ["A", "B", "C", "D", "E"] as const;

const groupColors: Record<string, [number, number, number]> = {
    LIST: [243, 244, 246], // gray-100
    A: [240, 249, 255], // sky-50
    B: [236, 253, 245], // emerald-50
    C: [245, 243, 255], // violet-50
    D: [255, 251, 235], // amber-50
    E: [255, 241, 242], // rose-50
};

const groupTextColors: Record<string, [number, number, number]> = {
    LIST: [75, 85, 99], // gray-600
    A: [3, 105, 161],  // sky-700
    B: [4, 120, 87],   // emerald-700
    C: [109, 40, 217], // violet-700
    D: [180, 83, 9],   // amber-800
    E: [190, 18, 60],  // rose-700
};

function money(v: unknown): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return `PHP ${n.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: PRICE_MAX_DECIMAL_PLACES,
    })}`;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function resolveMatrixTableLayout(args: {
    pageWidth: number;
    leftMargin: number;
    rightMargin: number;
    requestedFontSize: number;
    totalColumnCount: number;
    priceColumnCount: number;
}) {
    const availableWidth = Math.max(120, args.pageWidth - args.leftMargin - args.rightMargin);
    const totalColumns = Math.max(4, args.totalColumnCount);
    const priceColumns = Math.max(1, args.priceColumnCount);
    let brandW = 24;
    let categoryW = 24;
    let nameW = 76;
    let fontSize = args.requestedFontSize;
    let padding = 1;

    if (totalColumns > 9) {
        brandW = 22;
        categoryW = 22;
        nameW = 64;
        fontSize = Math.min(fontSize, 6.5);
        padding = 0.8;
    }

    if (totalColumns > 12) {
        brandW = 20;
        categoryW = 20;
        nameW = 54;
        fontSize = Math.min(fontSize, 6);
        padding = 0.8;
    }

    if (totalColumns > 15) {
        brandW = 18;
        categoryW = 18;
        nameW = 44;
        fontSize = Math.min(fontSize, 5.5);
        padding = 0.6;
    }

    const metadataWidth = brandW + categoryW + nameW;
    const priceW = Math.max(7, (availableWidth - metadataWidth) / priceColumns);

    return {
        tableWidth: availableWidth,
        brandW,
        categoryW,
        nameW,
        priceW,
        fontSize,
        headFontSize: clamp(fontSize - 0.5, 4.5, args.requestedFontSize),
        padding,
    };
}

function fallbackUnit(unitId: number): Unit {
    return {
        unit_id: unitId,
        unit_name: `Unit ${unitId}`,
        unit_shortcut: `U${unitId}`,
    };
}

function unitsForRow(row: MatrixRow, selectedUnits: Unit[]): Unit[] {
    if (selectedUnits.length > 0) return selectedUnits;

    return Object.keys(row.variantsByUnitId)
        .map((unitId) => Number(unitId))
        .filter((unitId) => Number.isFinite(unitId) && unitId > 0)
        .sort((a, b) => a - b)
        .map(fallbackUnit);
}

function unitLabel(unit: Unit): string {
    return unit.unit_shortcut || unit.unit_name || `Unit ${unit.unit_id}`;
}

export async function generateProductMatrixPdf(rows: MatrixRow[], options: MatrixOptions = {}) {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const { drawPageNumbers } = await import("@/components/pdf-layout-design/PdfGenerator");
    const {
        fontSize = 7,
        title = "Product Matrix Report",
        units = [],
        usedUnitIds = new Set(),
        supplier = null,
        selectedTemplate,
        companyData,
        selectedPriceTypeIds = [],
        priceTypes = [],
        printedBy = "System User",
        filterSummary = ""
    } = options;

    const allPriceTypes = priceTypes || [];

    // Determine active tiers based on selection
    // Map -1 to "LIST" and others to their numeric price type ID
    const activeTiers = allPriceTypes.length > 0
        ? allPriceTypes
            .filter(pt => selectedPriceTypeIds.length === 0 || selectedPriceTypeIds.includes(String(pt.price_type_id)))
            .map(pt => {
                if (pt.price_type_id === -1) {
                    return { key: "LIST" as const, label: pt.price_type_name };
                }
                return {
                    key: String(pt.price_type_id),
                    label: pt.price_type_name
                };
            })
        : TIERS.map((key, i) => ({
            key,
            label: allPriceTypes?.[i]?.price_type_name || `PRICE TYPE ${key}`
        })).slice(0, 5);

    const usedUnits = units
        .filter(u => usedUnitIds.has(Number(u.unit_id)))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const now = new Date();

    // --- Extract config from template ---
    const tplConfig = selectedTemplate?.config;

    // Paper size: template uses e.g. "Letter", jsPDF also accepts these strings
    const finalPaper = tplConfig?.paperSize.toLowerCase() || options.paper || "a4";
    const finalOrientation = tplConfig?.orientation || options.orientation || "landscape";

    // Margins: prefer template config, fallback to default
    const finalMargins = tplConfig?.margins || { top: 10, left: 10, right: 10, bottom: 10 };

    // Body start Y (below header elements)
    const bodyEnd = tplConfig?.bodyEnd;

    const doc = new jsPDF({ orientation: finalOrientation, unit: "mm", format: finalPaper });
    const pageWidth = doc.internal.pageSize.getWidth();

    const priceColumnCount = Math.max(1, activeTiers.length);
    const totalCols = 3 + priceColumnCount;
    const matrixLayout = resolveMatrixTableLayout({
        pageWidth,
        leftMargin: finalMargins.left,
        rightMargin: finalMargins.right,
        requestedFontSize: fontSize,
        totalColumnCount: totalCols,
        priceColumnCount,
    });

    const headRow: PdfCell[] = [
        {
            content: "Brand",
            styles: {
                valign: "middle",
                halign: "center",
                cellWidth: matrixLayout.brandW,
                overflow: "ellipsize",
            },
        },
        {
            content: "Category",
            styles: {
                valign: "middle",
                halign: "center",
                cellWidth: matrixLayout.categoryW,
                overflow: "ellipsize",
            },
        },
        {
            content: "Product Name",
            styles: {
                valign: "middle",
                fontStyle: "bold",
                halign: "center",
                cellWidth: matrixLayout.nameW,
                overflow: "ellipsize",
            },
        },
    ];

    for (const tier of activeTiers) {
        headRow.push({
            content: tier.label,
            styles: {
                halign: "center",
                fillColor: groupColors[tier.key] || [245, 245, 245],
                textColor: groupTextColors[tier.key] || [50, 50, 50],
                fontStyle: "bold",
                cellWidth: matrixLayout.priceW,
                minCellWidth: matrixLayout.priceW,
                overflow: "ellipsize",
            },
        });
    }

    const body = rows.flatMap((row) => {
        const baseCells: (string | PdfCell)[] = [
            {
                content: row.brand_name || "-",
                styles: { overflow: "ellipsize" },
            },
            {
                content: row.category_name || "-",
                styles: { overflow: "ellipsize" },
            },
            {
                content: row.display.product_name || "-",
                styles: { fontStyle: "bold", overflow: "ellipsize" },
            },
        ];

        for (const tier of activeTiers) {
            const priceLines = unitsForRow(row, usedUnits)
                .map((unit) => {
                    const price = row.variantsByUnitId[Number(unit.unit_id)]?.tiers?.[tier.key];
                    return price != null ? `${unitLabel(unit)}: ${money(price)}` : null;
                })
                .filter((line): line is string => line != null);

            baseCells.push({
                content: priceLines.length > 0 ? priceLines.join("\n") : "-",
                styles: {
                    halign: "left",
                    valign: "middle",
                    fillColor: groupColors[tier.key],
                    textColor: groupTextColors[tier.key],
                    cellWidth: matrixLayout.priceW,
                    minCellWidth: matrixLayout.priceW,
                    overflow: "linebreak",
                },
            });
        }
        return [baseCells];
    });


    const generated = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

    let y = 40;

    if (selectedTemplate) {
        let templateHeaderEnd = await PdfEngine.applyTemplate(doc, selectedTemplate.name, companyData || null);
        if (tplConfig?.bodyStart != null) {
            templateHeaderEnd = tplConfig.bodyStart;
        }

        // Create a clear gap for metadata and push table down
        const metadataHeight = filterSummary ? 12 : 8;
        const metadataTop = templateHeaderEnd - 3; // Shift up to hug the header line
        y = metadataTop + metadataHeight + 1; // Table starts immediately after metadata

        // Add metadata even with template
        doc.setFontSize(8.5);
        doc.setTextColor(60);

        const pageWidth = doc.internal.pageSize.getWidth();

        const row1Y = metadataTop;
        // TOP: "PRICE LIST REPORT" title
        doc.setFont("helvetica", "bold");
        doc.text("PRICE LIST REPORT", finalMargins.left, row1Y);

        // Divider below the title
        doc.setDrawColor(220);
        doc.setLineWidth(0.2);
        doc.line(finalMargins.left, row1Y + 2, pageWidth - finalMargins.right, row1Y + 2);

        // Start metadata below the divider
        let metaY = row1Y + 7;
        const filterLines = filterSummary ? filterSummary.split("\n") : [];
        const rightData = [
            { label: "Generated at:", value: generated },
            { label: "Generated By:", value: printedBy }
        ];

        // 1. Pre-calculate right block positioning
        doc.setFont("helvetica", "bold");
        const genAtLabelW = doc.getTextWidth("Generated at:");
        const genByLabelW = doc.getTextWidth("Generated By:");
        const maxRightLabelW = Math.max(genAtLabelW, genByLabelW) + 2;

        doc.setFont("helvetica", "normal");
        const genAtValueW = doc.getTextWidth(generated);
        const genByValueW = doc.getTextWidth(printedBy);
        const rightBlockW = maxRightLabelW + Math.max(genAtValueW, genByValueW);
        const rightX = pageWidth - finalMargins.right - rightBlockW;

        // 2. Pre-calculate filter label width
        let maxFilterLabelW = 0;
        if (filterLines.length > 0) {
            doc.setFont("helvetica", "bold");
            for (const line of filterLines) {
                const colonIndex = line.indexOf(":");
                if (colonIndex !== -1) {
                    maxFilterLabelW = Math.max(maxFilterLabelW, doc.getTextWidth(line.substring(0, colonIndex + 1)));
                }
            }
            maxFilterLabelW += 2;
        }

        // 3. Render both side-by-side
        const maxMetaRows = Math.max(filterLines.length, rightData.length);
        const metaRowStep = 4.5;

        for (let i = 0; i < maxMetaRows; i++) {
            // Left: Filters
            if (i < filterLines.length) {
                const line = filterLines[i];
                const colonIndex = line.indexOf(":");
                if (colonIndex !== -1) {
                    const label = line.substring(0, colonIndex + 1);
                    const value = line.substring(colonIndex + 1);
                    doc.setFont("helvetica", "bold");
                    doc.text(label, finalMargins.left, metaY);
                    doc.setFont("helvetica", "normal");
                    doc.text(value, finalMargins.left + maxFilterLabelW, metaY);
                } else {
                    doc.setFont("helvetica", "normal");
                    doc.text(line, finalMargins.left, metaY);
                }
            }

            // Right: Generation Info
            if (i < rightData.length) {
                const item = rightData[i];
                doc.setFont("helvetica", "bold");
                doc.text(item.label, rightX, metaY);
                doc.setFont("helvetica", "normal");
                doc.text(item.value, rightX + maxRightLabelW, metaY);
            }

            metaY += metaRowStep;
        }
        
        // Update y for table start
        y = Math.max(y, metaY + 2);

        // Reset for table
        doc.setFont("helvetica", "normal");
    } else {
        doc.setFontSize(22);
        doc.setTextColor(0, 51, 102); // Professional Dark Blue
        doc.setFont("helvetica", "bold");
        doc.text(title.toUpperCase(), finalMargins.left, finalMargins.top + 5);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.setFont("helvetica", "normal");
        doc.text("OFFICIAL PRODUCT PRICING MATRIX REPORT", finalMargins.left, finalMargins.top + 11);

        y = finalMargins.top + 20;

        // Metadata Block
        doc.setDrawColor(230);
        doc.setFillColor(248, 250, 252);
        const metaHeight = filterSummary ? 18 : 12;
        doc.roundedRect(finalMargins.left, y - 5, doc.internal.pageSize.getWidth() - finalMargins.left - finalMargins.right, metaHeight, 1, 1, "FD");

        doc.setFontSize(9);
        doc.setTextColor(70);

        let currentX = finalMargins.left + 5;
        doc.setFont("helvetica", "bold");
        doc.text("REPORT DATE:", currentX, y);
        currentX += doc.getTextWidth("REPORT DATE: ") + 2;
        doc.setFont("helvetica", "normal");
        doc.text(generated, currentX, y);
        currentX += doc.getTextWidth(generated) + 12;

        doc.setFont("helvetica", "bold");
        doc.text("PREPARED BY:", currentX, y);
        currentX += doc.getTextWidth("PREPARED BY: ") + 2;
        doc.setFont("helvetica", "normal");
        doc.text(printedBy, currentX, y);

        if (filterSummary) {
            y += 6;
            const filterLines = filterSummary.split("\n");
            
            // Calculate max label width for filters
            let maxFilterLabelW = 0;
            doc.setFont("helvetica", "bold");
            for (const line of filterLines) {
                const colonIndex = line.indexOf(":");
                if (colonIndex !== -1) {
                    const label = line.substring(0, colonIndex + 1);
                    maxFilterLabelW = Math.max(maxFilterLabelW, doc.getTextWidth(label));
                }
            }
            maxFilterLabelW += 2;

            const availableWidth = doc.internal.pageSize.getWidth() - finalMargins.left - finalMargins.right - 10;

            for (const line of filterLines) {
                const colonIndex = line.indexOf(":");
                if (colonIndex !== -1) {
                    const label = line.substring(0, colonIndex + 1);
                    const value = line.substring(colonIndex + 1);
                    
                    doc.setFont("helvetica", "bold");
                    doc.text(label, finalMargins.left + 5, y);
                    
                    doc.setFont("helvetica", "normal");
                    const valueX = finalMargins.left + 5 + maxFilterLabelW;
                    const splitValue = doc.splitTextToSize(value, availableWidth - maxFilterLabelW);
                    doc.text(splitValue, valueX, y);
                    y += (Math.max(1, splitValue.length) * 4);
                } else {
                    doc.setFont("helvetica", "normal");
                    const splitLines = doc.splitTextToSize(line, availableWidth);
                    doc.text(splitLines, finalMargins.left + 5, y);
                    y += (splitLines.length * 4);
                }
            }
        } else {
            y += 4;
        }

        y += 5;

        if (supplier) {
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.setFont("helvetica", "bold");
            doc.text(supplier.supplier_name, finalMargins.left, y);
            y += 4;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(80);

            const details: string[] = [];
            if (supplier.address) details.push(`Address: ${supplier.address}`);
            if (supplier.tin_number) details.push(`TIN: ${supplier.tin_number}`);
            if (supplier.contact_person) details.push(`Contact: ${supplier.contact_person}`);
            if (supplier.phone_number) details.push(`Phone: ${supplier.phone_number}`);

            if (details.length > 0) {
                doc.text(details.join("  |  "), finalMargins.left, y);
                y += 4;
            }
        }
    }

    autoTable(doc, {
        startY: y + 1,
        head: [headRow],
        body,
        theme: "grid",
        styles: {
            fontSize: matrixLayout.fontSize,
            cellPadding: matrixLayout.padding,
            valign: "middle",
            lineWidth: 0.3,
            lineColor: [200, 200, 200],
            overflow: "ellipsize",
        },
        headStyles: {
            fillColor: [245, 245, 245],
            textColor: [50, 50, 50],
            fontStyle: "bold",
            fontSize: matrixLayout.headFontSize,
            overflow: "ellipsize",
        },
        tableWidth: matrixLayout.tableWidth,
        columnStyles: Object.fromEntries([
            [0, { cellWidth: matrixLayout.brandW, overflow: "ellipsize" }],
            [1, { cellWidth: matrixLayout.categoryW, overflow: "ellipsize" }],
            [2, { cellWidth: matrixLayout.nameW, overflow: "ellipsize" }],
            ...Array.from(
                { length: priceColumnCount },
                (_, index) =>
                    [
                        index + 3,
                        {
                            cellWidth: matrixLayout.priceW,
                            minCellWidth: matrixLayout.priceW,
                            overflow: "linebreak",
                            halign: "left",
                        },
                    ] as const,
            ),
        ]),
        margin: {
            left: finalMargins.left,
            right: finalMargins.right,
            top: finalMargins.top,
            bottom: bodyEnd != null
                ? (doc.internal.pageSize.getHeight() - bodyEnd)
                : finalMargins.bottom,
        },
        didParseCell: (data) => {
            if (data.section === "body" && data.column.index >= 3) {
                const tierIdx = data.column.index - 3;
                const tier = activeTiers[tierIdx];
                if (tier) {
                    data.cell.styles.fillColor = groupColors[tier.key];
                    data.cell.styles.textColor = groupTextColors[tier.key];
                    data.cell.styles.halign = "left";
                    data.cell.styles.overflow = "linebreak";
                }
            }
        },
        didDrawPage: (data) => {
            if (selectedTemplate?.config?.pageNumber?.show) {
                drawPageNumbers(doc, selectedTemplate.config);
            } else {
                const str = "Page " + doc.getCurrentPageInfo().pageNumber;
                doc.setFontSize(8);
                doc.text(str, data.settings.margin.left, doc.internal.pageSize.getHeight() - 4);
            }
        },
    });
    doc.save(`Product_Printables_Matrix_${now.getTime()}.pdf`);
}
