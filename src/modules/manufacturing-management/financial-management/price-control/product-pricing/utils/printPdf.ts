// src/modules/supply-chain-management/product-pricing-management/product-pricing/utils/printPdf.ts
import jsPDF from "jspdf";

import type { MatrixRow, Unit, PriceType } from "../types";
import { buildMatrixTierKeys, tierLabelForTierKey } from "./pivot";
import {
    DEFAULT_TABLE_BLOCKS_PER_PAGE,
    getPrintPageMetrics,
    printTextValue,
    type PrintLayoutOptions,
    type PrintPageMetrics,
} from "./printLayout";

type Options = PrintLayoutOptions & {
    includeBarcode?: boolean;
    priceTypes?: PriceType[];
    tiers?: string[];
    units?: Unit[];
    usedUnitIds?: Set<number>;
    supplierNames?: string[];
    filtersText?: string;
    title?: string;
    saveAsName?: string;
};

const DEFAULT_TITLE = "Product Pricing Matrix Report";
const DENSE_PRODUCT_HEADER_LINE_HEIGHT = 10;
const DENSE_PRODUCT_HEADER_GAP_BEFORE_TABLE = 3;
const MIN_PRICE_FONT_SIZE = 4;

function denseProductHeaderBlockHeight(): number {
    return DENSE_PRODUCT_HEADER_LINE_HEIGHT + DENSE_PRODUCT_HEADER_GAP_BEFORE_TABLE;
}

function buildDenseProductHeaderText(row: MatrixRow, includeBarcode: boolean): string {
    const display = row.display;
    const name = printTextValue(display.product_name);
    const code = printTextValue(display.product_code);
    let text = `${name} -- Code: ${code}`;
    if (includeBarcode) {
        text += ` Barcode: ${printTextValue(display.barcode)}`;
    }
    return text;
}

function truncatePdfText(doc: jsPDF, text: string, maxWidth: number): string {
    if (doc.getTextWidth(text) <= maxWidth) {
        return text;
    }

    const ellipsis = "...";
    let low = 0;
    let high = text.length;

    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const candidate = `${text.slice(0, mid).trimEnd()}${ellipsis}`;
        if (doc.getTextWidth(candidate) <= maxWidth) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    return `${text.slice(0, low).trimEnd()}${ellipsis}`;
}

function drawDenseProductHeader(
    doc: jsPDF,
    args: {
        row: MatrixRow;
        includeBarcode: boolean;
        fontSize: number;
        blockX: number;
        blockY: number;
        blockWidth: number;
        cardPadding: number;
    },
): number {
    const textX = args.blockX + args.cardPadding;
    const textWidth = args.blockWidth - args.cardPadding * 2;
    const headerText = buildDenseProductHeaderText(args.row, args.includeBarcode);
    const truncated = truncatePdfText(doc, headerText, textWidth);
    const textY = args.blockY + args.cardPadding + args.fontSize * 0.85;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(args.fontSize);
    doc.setTextColor(20);
    doc.text(truncated, textX, textY);

    return args.blockY + args.cardPadding + denseProductHeaderBlockHeight();
}

const TIER_PALETTE: Array<{ fill: [number, number, number]; text: [number, number, number] }> = [
    { fill: [248, 250, 252], text: [30, 41, 59] },
    { fill: [240, 249, 255], text: [3, 105, 161] },
    { fill: [236, 253, 245], text: [4, 120, 87] },
    { fill: [245, 243, 255], text: [109, 40, 217] },
    { fill: [255, 251, 235], text: [180, 83, 9] },
    { fill: [255, 241, 242], text: [190, 18, 60] },
];

function tierPalette(index: number) {
    return TIER_PALETTE[index % TIER_PALETTE.length];
}

function unitLabel(unit: Unit | undefined, fallback: string) {
    return printTextValue(unit?.unit_shortcut || unit?.unit_name || fallback);
}

function wrapHeaderLines(doc: jsPDF, text: string, maxWidth: number, maxLines = 2): string[] {
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    if (lines.length <= maxLines) return lines;

    const clipped = lines.slice(0, maxLines);
    const last = clipped[maxLines - 1] ?? "";
    clipped[maxLines - 1] = `${last.replace(/\s+\S*$/, "").trimEnd()}...`;
    return clipped;
}

function supplierHeaderText(supplierNames: string[]): string | null {
    const names = supplierNames.map((name) => String(name ?? "").trim()).filter(Boolean);
    if (names.length === 0) return null;
    if (names.length === 1) return `Supplier: ${names[0]}`;
    return `Suppliers: ${names.join(", ")}`;
}

function rowUnits(row: MatrixRow, usedUnits: Unit[]): Unit[] {
    if (usedUnits.length > 0) return usedUnits;

    return Object.keys(row.variantsByUnitId)
        .map((unitId) => Number(unitId))
        .filter((unitId) => Number.isFinite(unitId) && unitId > 0)
        .map((unitId) => ({
            unit_id: unitId,
            unit_name: `Unit ${unitId}`,
            unit_shortcut: `U${unitId}`,
        }));
}

function hasPriceValue(row: MatrixRow, tier: string, unitId: number): boolean {
    return row.variantsByUnitId[unitId]?.tiers?.[tier] != null;
}

function populatedUnitsForRow(row: MatrixRow, tiers: string[], units: Unit[]): Unit[] {
    return units.filter((unit) =>
        tiers.some((tier) => hasPriceValue(row, tier, Number(unit.unit_id))),
    );
}

function populatedTiersForRow(row: MatrixRow, tiers: string[], units: Unit[]): string[] {
    return tiers.filter((tier) =>
        units.some((unit) => hasPriceValue(row, tier, Number(unit.unit_id))),
    );
}

type CardTableLayout = {
    tableTopY: number;
    tableHeaderHeight: number;
    tableRowHeight: number;
    tableHeight: number;
    tableBottomY: number;
};

function resolveCardTableLayout(args: {
    stretchTableToSlot: boolean;
    cardHeight: number;
    blockY: number;
    tableTopY: number;
    visibleTierCount: number;
    defaultTableHeaderHeight: number;
    defaultTableRowHeight: number;
    bottomPadding: number;
}): CardTableLayout {
    const tierCount = Math.max(1, args.visibleTierCount);
    const defaultTableHeight = args.defaultTableHeaderHeight + tierCount * args.defaultTableRowHeight;

    if (!args.stretchTableToSlot) {
        return {
            tableTopY: args.tableTopY,
            tableHeaderHeight: args.defaultTableHeaderHeight,
            tableRowHeight: args.defaultTableRowHeight,
            tableHeight: defaultTableHeight,
            tableBottomY: args.tableTopY + defaultTableHeight,
        };
    }

    const usedHeaderHeight = args.tableTopY - args.blockY;
    const tableHeight = Math.max(
        args.defaultTableHeaderHeight + tierCount * 5,
        args.cardHeight - usedHeaderHeight - args.bottomPadding,
    );
    const minHeaderHeight = args.defaultTableHeaderHeight;
    const minRowHeight = args.defaultTableRowHeight;
    const minTableHeight = minHeaderHeight + tierCount * minRowHeight;
    const minReadableRowHeight = 5;

    let tableHeaderHeight = minHeaderHeight;
    let tableRowHeight = minRowHeight;

    if (tableHeight >= minTableHeight) {
        const extra = tableHeight - minTableHeight;
        tableHeaderHeight = minHeaderHeight + extra * 0.2;
        tableRowHeight = (tableHeight - tableHeaderHeight) / tierCount;
    } else {
        tableHeaderHeight = Math.min(minHeaderHeight, tableHeight * 0.18);
        tableRowHeight = Math.max(
            minReadableRowHeight,
            (tableHeight - tableHeaderHeight) / tierCount,
        );
    }

    return {
        tableTopY: args.tableTopY,
        tableHeaderHeight,
        tableRowHeight,
        tableHeight,
        tableBottomY: args.tableTopY + tableHeight,
    };
}

function tableCellTextY(rowY: number, rowHeight: number, centered: boolean): number {
    if (!centered) {
        return rowY + rowHeight - 5;
    }
    return rowY + rowHeight / 2;
}

function drawPageFooter(doc: jsPDF, metrics: PrintPageMetrics) {
    const pageHeight = doc.internal.pageSize.getHeight();
    const str = `Page ${doc.getCurrentPageInfo().pageNumber}`;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(str, metrics.contentLeft, pageHeight - metrics.marginPt + 10);
}

function drawReportHeader(
    doc: jsPDF,
    args: {
        now: Date;
        total: number;
        layout: string;
        metrics: PrintPageMetrics;
        continuation?: boolean;
        title: string;
        supplierNames?: string[];
        filtersText?: string;
    },
): number {
    const { metrics } = args;
    const x = metrics.contentLeft;
    const maxWidth = metrics.contentWidth;
    let y = metrics.marginPt + (args.continuation ? 8 : 10);

    if (args.continuation) {
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.setFont("helvetica", "bold");
        doc.text(`${args.title} (continued)`, x, y);
        return y + 12;
    }

    const titleSize = metrics.compact ? 11 : 14;
    const bodySize = metrics.compact ? 8 : 9;
    const lineGap = metrics.compact ? 10 : 12;

    doc.setFontSize(titleSize);
    doc.setTextColor(20);
    doc.setFont("helvetica", "bold");
    doc.text(args.title, x, y);
    y += lineGap;

    doc.setFontSize(bodySize);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);

    const supplierLine = supplierHeaderText(args.supplierNames ?? []);
    if (supplierLine) {
        const wrapped = wrapHeaderLines(doc, supplierLine, maxWidth, 2);
        doc.text(wrapped, x, y);
        y += wrapped.length * (lineGap - 1);
    }

    const filters = String(args.filtersText ?? "").trim();
    if (filters) {
        const wrapped = wrapHeaderLines(doc, `Filters: ${filters}`, maxWidth, 2);
        doc.text(wrapped, x, y);
        y += wrapped.length * (lineGap - 1);
    }

    if (metrics.compact) {
        doc.text(
            `Generated: ${args.now.toLocaleDateString()} ${args.now.toLocaleTimeString()}  |  Products: ${args.total}  |  Layout: ${args.layout}`,
            x,
            y,
        );
        y += lineGap;
    } else {
        doc.text(`Generated on: ${args.now.toLocaleDateString()} ${args.now.toLocaleTimeString()}`, x, y);
        y += lineGap;
        doc.text(`Total Products: ${args.total}`, x, y);
        y += lineGap;
        doc.text(`Layout: ${args.layout}`, x, y);
        y += lineGap;
    }

    return y + 4;
}

type SpreadsheetColumn =
    | {
          kind: "meta";
          label: string;
          width: number;
          value: (row: MatrixRow) => string;
          bold?: boolean;
      }
    | {
          kind: "tier";
          label: string;
          width: number;
          tier: string;
          palette: { fill: [number, number, number]; text: [number, number, number] };
      };

function resolveSpreadsheetColumns(args: {
    contentWidth: number;
    tiers: string[];
    priceTypes: PriceType[];
    includeBarcode: boolean;
}): SpreadsheetColumn[] {
    const tierCount = Math.max(1, args.tiers.length);
    const compact = tierCount > 7;
    const brandWidth = compact ? 44 : 52;
    const categoryWidth = compact ? 48 : 56;
    const productWidth = compact ? 112 : 136;
    const codeWidth = args.includeBarcode ? (compact ? 72 : 88) : 0;
    const metaWidth = brandWidth + categoryWidth + productWidth + codeWidth;
    const tierWidth = Math.max(38, (args.contentWidth - metaWidth) / tierCount);
    const scale = metaWidth + tierWidth * tierCount > args.contentWidth
        ? args.contentWidth / (metaWidth + tierWidth * tierCount)
        : 1;

    const columns: SpreadsheetColumn[] = [
        {
            kind: "meta",
            label: "Brand",
            width: brandWidth * scale,
            value: (row) => printTextValue(row.brand_name),
        },
        {
            kind: "meta",
            label: "Category",
            width: categoryWidth * scale,
            value: (row) => printTextValue(row.category_name),
        },
        {
            kind: "meta",
            label: "Product Name",
            width: productWidth * scale,
            value: (row) => printTextValue(row.display.product_name),
            bold: true,
        },
    ];

    if (args.includeBarcode) {
        columns.push({
            kind: "meta",
            label: "Code / Barcode",
            width: codeWidth * scale,
            value: (row) =>
                [
                    `Code: ${printTextValue(row.display.product_code)}`,
                    `Barcode: ${printTextValue(row.display.barcode)}`,
                ].join("\n"),
        });
    }

    args.tiers.forEach((tier, index) => {
        columns.push({
            kind: "tier",
            label: tierLabelForTierKey(tier, args.priceTypes),
            width: tierWidth * scale,
            tier,
            palette: tierPalette(index),
        });
    });

    return columns;
}

function splitCellLines(doc: jsPDF, text: string, width: number, maxLines: number): string[] {
    const lines = doc.splitTextToSize(text, Math.max(8, width - 8)) as string[];
    if (lines.length <= maxLines) return lines;

    const clipped = lines.slice(0, maxLines);
    const last = clipped[maxLines - 1] ?? "";
    clipped[maxLines - 1] = truncatePdfText(doc, `${last}...`, Math.max(8, width - 8));
    return clipped;
}

function formatPdfAmount(v: unknown): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    });
}

type TierPriceLine = {
    prefix: string;
    amount: string | null;
};

function tierCellLines(row: MatrixRow, tier: string, units: Unit[]): TierPriceLine[] {
    const lines = units
        .map((unit): TierPriceLine | null => {
            const price = row.variantsByUnitId[Number(unit.unit_id)]?.tiers?.[tier];
            return price != null
                ? { prefix: `${unitLabel(unit, `Unit ${unit.unit_id}`)}: `, amount: formatPdfAmount(price) }
                : null;
        })
        .filter((line): line is TierPriceLine => line != null);

    return lines.length > 0 ? lines : [{ prefix: "-", amount: null }];
}

type FittedTextOptions = {
    align?: "left" | "center" | "right";
    baseline?: "alphabetic" | "bottom" | "middle" | "top" | "hanging" | "ideographic";
};

function fittedFontSize(doc: jsPDF, text: string, maxWidth: number, baseFontSize: number) {
    const width = Math.max(4, maxWidth);
    for (let size = baseFontSize; size >= MIN_PRICE_FONT_SIZE; size -= 0.25) {
        doc.setFontSize(size);
        if (doc.getTextWidth(text) <= width) return size;
    }
    return MIN_PRICE_FONT_SIZE;
}

function drawPesoSymbol(doc: jsPDF, x: number, y: number, fontSize: number, options?: FittedTextOptions) {
    const previousDrawColor = doc.getDrawColor();
    doc.text("P", x, y, options);
    const pWidth = doc.getTextWidth("P");
    const lineY1 = y - fontSize * 0.53;
    const lineY2 = y - fontSize * 0.39;
    const overhang = Math.max(0.45, fontSize * 0.12);
    doc.setDrawColor(doc.getTextColor());
    doc.setLineWidth(Math.max(0.25, fontSize * 0.055));
    doc.line(x - overhang, lineY1, x + pWidth + overhang, lineY1);
    doc.line(x - overhang, lineY2, x + pWidth + overhang, lineY2);
    doc.setDrawColor(previousDrawColor);
}

function drawFittedText(
    doc: jsPDF,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    baseFontSize: number,
    options?: FittedTextOptions,
) {
    const size = fittedFontSize(doc, text, maxWidth, baseFontSize);
    doc.setFontSize(size);
    doc.text(text, x, y, options);
    doc.setFontSize(baseFontSize);
}

function fittedMoneyFontSize(
    doc: jsPDF,
    prefix: string,
    amount: string,
    maxWidth: number,
    baseFontSize: number,
) {
    const width = Math.max(4, maxWidth);
    for (let size = baseFontSize; size >= MIN_PRICE_FONT_SIZE; size -= 0.25) {
        doc.setFontSize(size);
        const symbolWidth = doc.getTextWidth("P") + 1.5;
        if (doc.getTextWidth(prefix) + symbolWidth + doc.getTextWidth(amount) <= width) return size;
    }
    return MIN_PRICE_FONT_SIZE;
}

function drawFittedMoneyLine(
    doc: jsPDF,
    line: TierPriceLine,
    x: number,
    y: number,
    maxWidth: number,
    baseFontSize: number,
) {
    if (line.amount == null) {
        drawFittedText(doc, line.prefix, x, y, maxWidth, baseFontSize);
        return;
    }

    const size = fittedMoneyFontSize(doc, line.prefix, line.amount, maxWidth, baseFontSize);
    doc.setFontSize(size);
    doc.text(line.prefix, x, y);
    const symbolX = x + doc.getTextWidth(line.prefix);
    drawPesoSymbol(doc, symbolX, y, size);
    doc.text(line.amount, symbolX + doc.getTextWidth("P") + 1.5, y);
    doc.setFontSize(baseFontSize);
}

function drawFittedMoney(
    doc: jsPDF,
    amount: string,
    rightX: number,
    y: number,
    maxWidth: number,
    baseFontSize: number,
    options?: FittedTextOptions,
) {
    const size = fittedMoneyFontSize(doc, "", amount, maxWidth, baseFontSize);
    doc.setFontSize(size);
    const symbolWidth = doc.getTextWidth("P") + 1.5;
    const amountWidth = doc.getTextWidth(amount);
    const leftX = rightX - symbolWidth - amountWidth;
    drawPesoSymbol(doc, leftX, y, size, options?.baseline ? { baseline: options.baseline } : undefined);
    doc.text(amount, leftX + symbolWidth, y, options?.baseline ? { baseline: options.baseline } : undefined);
    doc.setFontSize(baseFontSize);
}

function renderPricingSpreadsheetPdf(
    doc: jsPDF,
    rows: MatrixRow[],
    args: {
        now: Date;
        includeBarcode: boolean;
        metrics: PrintPageMetrics;
        fontSize: number;
        priceTypes: PriceType[];
        tiers: string[];
        usedUnits: Unit[];
        title: string;
        supplierNames?: string[];
        filtersText?: string;
    },
) {
    const { metrics } = args;
    const columns = resolveSpreadsheetColumns({
        contentWidth: metrics.contentWidth,
        tiers: args.tiers,
        priceTypes: args.priceTypes,
        includeBarcode: args.includeBarcode,
    });
    const headerHeight = metrics.compact ? 16 : 20;
    const lineHeight = Math.max(args.fontSize + 2, 7);
    const minRowHeight = metrics.compact ? 18 : 22;
    const maxLinesPerCell = metrics.compact ? 3 : 4;
    const maxY = () => metrics.contentBottom - metrics.footerReserve;

    let y = drawReportHeader(doc, {
        now: args.now,
        total: rows.length,
        layout: "Table",
        metrics,
        title: args.title,
        supplierNames: args.supplierNames,
        filtersText: args.filtersText,
    });

    const drawHeader = () => {
        let x = metrics.contentLeft;
        doc.setDrawColor(210, 210, 210);
        doc.setFillColor(248, 250, 252);
        doc.rect(metrics.contentLeft, y, metrics.contentWidth, headerHeight, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(Math.max(args.fontSize, 6));
        doc.setTextColor(40);

        columns.forEach((column) => {
            if (column.kind === "tier") {
                doc.setFillColor(...column.palette.fill);
                doc.rect(x, y, column.width, headerHeight, "FD");
                doc.setTextColor(...column.palette.text);
            } else {
                doc.setTextColor(40);
            }

            const label = truncatePdfText(doc, column.label, column.width - 8);
            doc.text(label, x + 4, y + headerHeight / 2, { baseline: "middle" });
            doc.setDrawColor(210, 210, 210);
            doc.line(x, y, x, y + headerHeight);
            x += column.width;
        });

        doc.line(metrics.contentLeft + metrics.contentWidth, y, metrics.contentLeft + metrics.contentWidth, y + headerHeight);
        y += headerHeight;
    };

    drawHeader();

    const addPage = () => {
        drawPageFooter(doc, metrics);
        doc.addPage();
        y = drawReportHeader(doc, {
            now: args.now,
            total: rows.length,
            layout: "Table",
            metrics,
            continuation: true,
            title: args.title,
            supplierNames: args.supplierNames,
            filtersText: args.filtersText,
        });
        drawHeader();
    };

    rows.forEach((row) => {
        const units = rowUnits(row, args.usedUnits);
        const cellLines = columns.map((column) => {
            if (column.kind === "tier") {
                const tierLines = tierCellLines(row, column.tier, units);
                return tierLines.length > maxLinesPerCell ? tierLines.slice(0, maxLinesPerCell) : tierLines;
            }
            return splitCellLines(doc, column.value(row), column.width, maxLinesPerCell);
        });
        const rowHeight = Math.max(minRowHeight, Math.max(...cellLines.map((lines) => lines.length)) * lineHeight + 8);

        if (y + rowHeight > maxY()) {
            addPage();
        }

        let x = metrics.contentLeft;
        columns.forEach((column, columnIndex) => {
            const lines = cellLines[columnIndex] ?? ["-"];
            if (column.kind === "tier") {
                doc.setFillColor(...column.palette.fill);
            } else {
                doc.setFillColor(255, 255, 255);
            }
            doc.setDrawColor(225, 225, 225);
            doc.rect(x, y, column.width, rowHeight, "FD");

            doc.setFont("helvetica", column.kind === "meta" && column.bold ? "bold" : "normal");
            doc.setFontSize(args.fontSize);
            if (column.kind === "tier") {
                doc.setTextColor(...column.palette.text);
            } else {
                doc.setTextColor(30);
            }
            if (column.kind === "tier") {
                (lines as TierPriceLine[]).forEach((line, lineIndex) => {
                    drawFittedMoneyLine(
                        doc,
                        line,
                        x + 4,
                        y + 6 + args.fontSize + lineIndex * lineHeight,
                        column.width - 8,
                        args.fontSize,
                    );
                });
            } else {
                doc.text(lines as string[], x + 4, y + 6 + args.fontSize);
            }
            x += column.width;
        });

        y += rowHeight;
    });

    drawPageFooter(doc, metrics);
}

function renderPricingProductBlocksPdf(
    doc: jsPDF,
    rows: MatrixRow[],
    args: {
        layoutLabel: "Table" | "Cards";
        now: Date;
        includeBarcode: boolean;
        metrics: PrintPageMetrics;
        fontSize: number;
        priceTypes: PriceType[];
        tiers: string[];
        usedUnits: Unit[];
        title: string;
        supplierNames?: string[];
        filtersText?: string;
    },
) {
    const { metrics } = args;
    const {
        cardWidth,
        gap,
        lineHeight,
        cardPadding,
        pillHeight,
        tableHeaderHeight,
        tableRowHeight,
        contentLeft,
        contentBottom,
        footerReserve,
        blocksPerPage,
        blockSlotHeight,
        cardsPerPage,
        fixedCardGrid,
    } = metrics;

    const denseBlocks = blocksPerPage > 1;
    const stretchTableToSlot = fixedCardGrid || denseBlocks;
    const useDenseProductHeader = stretchTableToSlot;
    const maxNameLines = useDenseProductHeader ? 1 : 4;
    const maxPillRows = useDenseProductHeader ? 0 : 3;

    let x = contentLeft;
    let y = 0;
    let columnIndex = 0;
    let rowMaxHeight = 0;
    let blocksOnPage = 0;
    let contentTopBase = 0;

    const maxY = () => contentBottom - footerReserve;

    const resetPosition = (contentTop: number) => {
        x = contentLeft;
        y = contentTop;
        contentTopBase = contentTop;
        columnIndex = 0;
        rowMaxHeight = 0;
        blocksOnPage = 0;
    };

    const drawHeaderAndReset = (continuation: boolean) => {
        const contentTop = drawReportHeader(doc, {
            now: args.now,
            total: rows.length,
            layout: args.layoutLabel,
            metrics,
            continuation,
            title: args.title,
            supplierNames: args.supplierNames,
            filtersText: args.filtersText,
        });
        resetPosition(contentTop);
    };

    const addPage = () => {
        drawPageFooter(doc, metrics);
        doc.addPage();
        drawHeaderAndReset(true);
    };

    drawHeaderAndReset(false);

    const advanceCardPosition = (height: number) => {
        if (fixedCardGrid) {
            blocksOnPage += 1;
            return;
        }

        if (denseBlocks) {
            y += height + gap;
            blocksOnPage += 1;
            return;
        }

        rowMaxHeight = Math.max(rowMaxHeight, height);
        if (columnIndex + 1 < metrics.columns) {
            columnIndex += 1;
            x = contentLeft + columnIndex * (cardWidth + gap);
            return;
        }

        columnIndex = 0;
        x = contentLeft;
        y += rowMaxHeight + gap;
        rowMaxHeight = 0;
    };

    for (const row of rows) {
        const display = row.display;
        const unitsForRow = rowUnits(row, args.usedUnits);
        const sparseTable = args.layoutLabel === "Table";
        const productUnits = sparseTable
            ? populatedUnitsForRow(row, args.tiers, unitsForRow)
            : unitsForRow;
        const productTiers = sparseTable
            ? populatedTiersForRow(row, args.tiers, productUnits)
            : args.tiers;
        const hasPrintablePrices = !sparseTable || (productUnits.length > 0 && productTiers.length > 0);
        const printableUnits =
            productUnits.length > 0
                ? productUnits
                : [{ unit_id: 0, unit_name: "Price", unit_shortcut: "Price" }];

        const metaPills = useDenseProductHeader
            ? []
            : [
                  printTextValue(row.brand_name),
                  printTextValue(row.category_name),
                  `Code: ${printTextValue(display.product_code)}`,
                  args.includeBarcode ? `Barcode: ${printTextValue(display.barcode)}` : "",
              ].filter(Boolean);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(args.fontSize);
        const pillRows: string[][] = [];
        if (!useDenseProductHeader) {
            let currentPillRow: string[] = [];
            let currentPillWidth = 0;
            const maxPillWidth = cardWidth - cardPadding * 2;
            for (const pill of metaPills) {
                const pillWidth = Math.min(maxPillWidth, doc.getTextWidth(pill) + 10);
                if (currentPillRow.length > 0 && currentPillWidth + pillWidth + 4 > maxPillWidth) {
                    pillRows.push(currentPillRow);
                    currentPillRow = [];
                    currentPillWidth = 0;
                }
                currentPillRow.push(pill);
                currentPillWidth += pillWidth + 4;
            }
            if (currentPillRow.length > 0) pillRows.push(currentPillRow);
        }

        const estimatedBlockWidth =
            denseBlocks && !fixedCardGrid ? metrics.contentWidth : cardWidth;
        const wrappedNameAll = useDenseProductHeader
            ? []
            : (doc.splitTextToSize(
                  printTextValue(display.product_name),
                  estimatedBlockWidth - cardPadding * 2,
              ) as string[]);
        const wrappedName = wrappedNameAll.slice(0, maxNameLines);
        const visiblePillRows = pillRows.slice(0, maxPillRows);
        const printableTiers = productTiers;
        const visibleTableRows = Math.max(printableTiers.length, 1);

        const cardHeight =
            (fixedCardGrid || denseBlocks) && blockSlotHeight != null
                ? blockSlotHeight
                : (() => {
                      const tableHeight =
                          tableHeaderHeight + visibleTableRows * tableRowHeight;
                      const headerContentHeight = useDenseProductHeader
                          ? denseProductHeaderBlockHeight()
                          : wrappedName.length * (lineHeight + 1) +
                            Math.max(visiblePillRows.length, 1) * (pillHeight + 3) +
                            (metrics.compact ? 6 : 10);
                      return cardPadding * 2 + headerContentHeight + tableHeight;
                  })();

        if (fixedCardGrid) {
            if (cardsPerPage != null && blocksOnPage >= cardsPerPage) {
                addPage();
            }
        } else if (denseBlocks) {
            if (blocksOnPage >= blocksPerPage) {
                addPage();
            }
        } else if (columnIndex === 0) {
            if (y + cardHeight > maxY()) {
                addPage();
            }
        } else if (y + Math.max(rowMaxHeight, cardHeight) > maxY()) {
            columnIndex = 0;
            x = contentLeft;
            y += rowMaxHeight + gap;
            rowMaxHeight = 0;
            if (y + cardHeight > maxY()) {
                addPage();
            }
        }

        const gridCol = fixedCardGrid ? blocksOnPage % 2 : columnIndex;
        const gridRow = fixedCardGrid ? Math.floor(blocksOnPage / 2) : 0;
        const blockX = fixedCardGrid
            ? contentLeft + gridCol * (cardWidth + gap)
            : denseBlocks
              ? contentLeft
              : x;
        const blockY = fixedCardGrid
            ? contentTopBase + gridRow * (cardHeight + gap)
            : y;
        const blockWidth = denseBlocks && !fixedCardGrid ? metrics.contentWidth : cardWidth;

        doc.setDrawColor(210, 210, 210);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(
            blockX,
            blockY,
            blockWidth,
            cardHeight,
            fixedCardGrid || denseBlocks ? 2 : 4,
            fixedCardGrid || denseBlocks ? 2 : 4,
            "FD",
        );

        let cursorY = blockY + cardPadding + 2;
        if (useDenseProductHeader) {
            cursorY = drawDenseProductHeader(doc, {
                row,
                includeBarcode: args.includeBarcode,
                fontSize: args.fontSize,
                blockX,
                blockY,
                blockWidth,
                cardPadding,
            });
        } else {
            doc.setFontSize(args.fontSize + (metrics.compact ? 1 : 2));
            doc.setTextColor(20);
            doc.setFont("helvetica", "bold");
            doc.text(wrappedName, blockX + cardPadding, cursorY);
            cursorY += wrappedName.length * (lineHeight + 1);

            doc.setFontSize(args.fontSize);
            doc.setFont("helvetica", "normal");
            const maxPillWidth = blockWidth - cardPadding * 2;
            for (const pillRow of visiblePillRows) {
                let pillX = blockX + cardPadding;
                for (const pill of pillRow) {
                    const pillWidth = Math.min(maxPillWidth, doc.getTextWidth(pill) + 10);
                    doc.setFillColor(248, 250, 252);
                    doc.setDrawColor(235, 235, 235);
                    doc.roundedRect(pillX, cursorY - 8, pillWidth, pillHeight, 2, 2, "FD");
                    doc.setTextColor(90);
                    doc.text(pill, pillX + 5, cursorY);
                    pillX += pillWidth + 4;
                }
                cursorY += pillHeight + 3;
            }

            cursorY += metrics.compact ? 4 : 5;
        }
        const tableX = blockX + cardPadding;
        const tableWidth = blockWidth - cardPadding * 2;
        const tableLayout = resolveCardTableLayout({
            stretchTableToSlot,
            cardHeight,
            blockY,
            tableTopY: cursorY,
            visibleTierCount: visibleTableRows,
            defaultTableHeaderHeight: tableHeaderHeight,
            defaultTableRowHeight: tableRowHeight,
            bottomPadding: cardPadding,
        });
        const resolvedHeaderHeight = tableLayout.tableHeaderHeight;
        const resolvedRowHeight = tableLayout.tableRowHeight;
        const tierColumnWidth = Math.min(fixedCardGrid || denseBlocks ? 68 : 88, tableWidth * 0.36);
        const unitCount = Math.max(printableUnits.length, 1);
        const unitColumnWidth = (tableWidth - tierColumnWidth) / unitCount;
        const centerTableText = stretchTableToSlot;
        const headerTextY = tableCellTextY(cursorY, resolvedHeaderHeight, centerTableText);
        const headerTextOptions = centerTableText ? ({ baseline: "middle" } as const) : undefined;

        doc.setDrawColor(220, 220, 220);
        doc.setFillColor(248, 250, 252);
        doc.rect(tableX, cursorY, tableWidth, resolvedHeaderHeight, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(args.fontSize);
        doc.setTextColor(40);
        doc.text("Price Type", tableX + 4, headerTextY, headerTextOptions);
        printableUnits.forEach((unit, index) => {
            const cellX = tableX + tierColumnWidth + index * unitColumnWidth;
            const label = hasPrintablePrices ? unitLabel(unit, `Unit ${unit.unit_id}`) : "No prices";
            doc.text(
                (doc.splitTextToSize(label, unitColumnWidth - 6)[0] as string | undefined) ?? "-",
                cellX + 4,
                headerTextY,
                headerTextOptions,
            );
        });

        cursorY += resolvedHeaderHeight;
        doc.setFont("helvetica", "normal");
        if (!hasPrintablePrices) {
            const rowY = cursorY;
            const rowHeight = Math.max(resolvedRowHeight, tableLayout.tableBottomY - rowY);
            doc.setFillColor(249, 250, 251);
            doc.setDrawColor(225, 225, 225);
            doc.rect(tableX, rowY, tableWidth, rowHeight, "FD");
            doc.setFont("helvetica", "italic");
            doc.setTextColor(100);
            doc.text(
                "No prices available",
                tableX + tableWidth / 2,
                tableCellTextY(rowY, rowHeight, centerTableText),
                { align: "center", ...(centerTableText ? ({ baseline: "middle" } as const) : {}) },
            );
            advanceCardPosition(cardHeight);
            continue;
        }

        printableTiers.forEach((tier, tierIndex) => {
            const rowY = cursorY + tierIndex * resolvedRowHeight;
            const isLastRow = tierIndex === printableTiers.length - 1;
            const rowHeight =
                stretchTableToSlot && isLastRow
                    ? Math.max(resolvedRowHeight, tableLayout.tableBottomY - rowY)
                    : resolvedRowHeight;
            const palette = tierPalette(tierIndex);
            doc.setFillColor(...palette.fill);
            doc.setDrawColor(225, 225, 225);
            doc.rect(tableX, rowY, tableWidth, rowHeight, "FD");

            const rowTextY = tableCellTextY(rowY, rowHeight, centerTableText);
            const rowTextOptions = centerTableText ? ({ baseline: "middle" } as const) : undefined;

            doc.setTextColor(...palette.text);
            doc.setFont("helvetica", "bold");
            doc.text(
                (doc.splitTextToSize(tierLabelForTierKey(tier, args.priceTypes), tierColumnWidth - 6)[0] as
                    | string
                    | undefined) ?? "-",
                tableX + 4,
                rowTextY,
                rowTextOptions,
            );

            doc.setFont("helvetica", "normal");
            doc.setTextColor(30);
            printableUnits.forEach((unit, index) => {
                const cellX = tableX + tierColumnWidth + index * unitColumnWidth;
                const variant = row.variantsByUnitId[Number(unit.unit_id)];
                const price = variant?.tiers?.[tier];
                if (price != null) {
                    drawFittedMoney(
                        doc,
                        formatPdfAmount(price),
                        cellX + unitColumnWidth - 4,
                        rowTextY,
                        unitColumnWidth - 8,
                        args.fontSize,
                        rowTextOptions ?? undefined,
                    );
                } else {
                    doc.text("-", cellX + unitColumnWidth - 4, rowTextY, { align: "right", ...(rowTextOptions ?? {}) });
                }
                doc.setDrawColor(225, 225, 225);
                doc.line(cellX, rowY, cellX, rowY + rowHeight);
            });
        });

        advanceCardPosition(cardHeight);
    }

    drawPageFooter(doc, metrics);
}

export function generatePricingMatrixPdf(rows: MatrixRow[], opts: Options = {}) {
    const paper = opts.paper ?? "a4";
    const orientation = opts.orientation ?? "landscape";
    const layout = opts.layout ?? "table";
    const includeBarcode = opts.includeBarcode ?? true;
    const compact = opts.compact ?? true;
    const usedUnitIds = opts.usedUnitIds ?? new Set();
    const unitsList = opts.units ?? [];
    const now = new Date();
    const title = opts.title ?? DEFAULT_TITLE;
    const blocksPerPage =
        layout === "cards" ? 1 : (opts.blocksPerPage ?? DEFAULT_TABLE_BLOCKS_PER_PAGE);
    const cardsPerPage = layout === "cards" ? (opts.cardsPerPage ?? 6) : undefined;

    const doc = new jsPDF({ orientation, unit: "pt", format: paper });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const layoutLabel = layout === "cards" ? "Cards" : "Table";
    const metrics = getPrintPageMetrics(pageWidth, pageHeight, {
        layout,
        paper,
        orientation,
        compact,
        fontSize: opts.fontSize,
        layoutLabel,
        blocksPerPage,
        cardsPerPage,
    });

    const usedUnits = unitsList
        .filter((u) => usedUnitIds.has(Number(u.unit_id)))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const priceTypesList = opts.priceTypes ?? [];
    const tiers = opts.tiers?.length ? opts.tiers : buildMatrixTierKeys(priceTypesList);
    const defaultFontSize =
        opts.fontSize ||
        (metrics.fixedCardGrid ? 5 : blocksPerPage > 1 ? 5 : layout === "cards" ? 6 : 7);

    if (layout === "table") {
        renderPricingSpreadsheetPdf(doc, rows, {
            now,
            includeBarcode,
            metrics,
            fontSize: defaultFontSize,
            priceTypes: priceTypesList,
            tiers,
            usedUnits,
            title,
            supplierNames: opts.supplierNames,
            filtersText: opts.filtersText,
        });
    } else {
        renderPricingProductBlocksPdf(doc, rows, {
            layoutLabel,
            now,
            includeBarcode,
            metrics,
            fontSize: defaultFontSize,
            priceTypes: priceTypesList,
            tiers,
            usedUnits,
            title,
            supplierNames: opts.supplierNames,
            filtersText: opts.filtersText,
        });
    }

    const fileStamp = now.toISOString().split("T")[0];
    const fileName = opts.saveAsName ?? `Product_Pricing_Matrix_${fileStamp}.pdf`;
    doc.save(fileName);
}
