export const PAGE_MARGIN_IN = 0.5;
export const PAGE_MARGIN_PT = 36;
export const NORMAL_MARGIN_PT = 40;
export const DEFAULT_TABLE_BLOCKS_PER_PAGE = 4;

export type PrintPaper = "a4" | "legal" | "a3";
export type PrintOrientation = "landscape" | "portrait";
export type PrintLayout = "table" | "cards";
export type CardsPerPageOption = number | "auto";

export type PrintLayoutOptions = {
    layout?: PrintLayout;
    paper?: PrintPaper;
    orientation?: PrintOrientation;
    compact?: boolean;
    fontSize?: number;
    blocksPerPage?: number;
    cardsPerPage?: CardsPerPageOption;
};

const PAPER_SIZES_PT: Record<PrintPaper, { width: number; height: number }> = {
    a4: { width: 595.28, height: 841.89 },
    legal: { width: 612, height: 1008 },
    a3: { width: 841.89, height: 1190.55 },
};

export function getPageDimensionsPt(paper: PrintPaper, orientation: PrintOrientation) {
    const size = PAPER_SIZES_PT[paper];
    if (orientation === "landscape") {
        return { width: size.height, height: size.width };
    }
    return { width: size.width, height: size.height };
}

export function getCssPageSize(paper: PrintPaper, orientation: PrintOrientation): string {
    const label = paper === "a4" ? "A4" : paper === "legal" ? "legal" : "A3";
    return `${label} ${orientation}`;
}

export function getPageMarginCss(compact: boolean): string {
    return compact ? `${PAGE_MARGIN_IN}in` : `${(NORMAL_MARGIN_PT / 72).toFixed(3)}in`;
}

export type PrintPageMetrics = {
    marginPt: number;
    contentLeft: number;
    contentTop: number;
    contentWidth: number;
    contentHeight: number;
    contentBottom: number;
    columns: number;
    cardWidth: number;
    gap: number;
    lineHeight: number;
    cardPadding: number;
    pillHeight: number;
    tableHeaderHeight: number;
    tableRowHeight: number;
    headerHeight: number;
    headerHeightContinuation: number;
    footerReserve: number;
    compact: boolean;
    blocksPerPage: number;
    blockSlotHeight: number | null;
    cardsPerPage: number | null;
    cardRowsPerPage: number | null;
    fixedCardGrid: boolean;
};

export function getPrintPageMetrics(
    pageWidth: number,
    pageHeight: number,
    options: PrintLayoutOptions & { layoutLabel: "Table" | "Cards" },
): PrintPageMetrics {
    const compact = options.compact ?? true;
    const layoutMode =
        options.layout ?? (options.layoutLabel === "Cards" ? "cards" : "table");
    const resolvedCardsPerPage: CardsPerPageOption | null =
        layoutMode === "cards"
            ? options.cardsPerPage === "auto"
                ? "auto"
                : (options.cardsPerPage ?? 6)
            : null;
    const fixedCardGrid = layoutMode === "cards" && resolvedCardsPerPage === 6;
    const blocksPerPage =
        layoutMode === "cards"
            ? 1
            : Math.max(1, options.blocksPerPage ?? DEFAULT_TABLE_BLOCKS_PER_PAGE);
    const denseTableBlocks = layoutMode === "table" && blocksPerPage > 1;
    const denseBlocks = denseTableBlocks;
    const marginPt = compact ? PAGE_MARGIN_PT : NORMAL_MARGIN_PT;
    const gap = denseTableBlocks ? 3 : fixedCardGrid ? 4 : compact ? 6 : 12;
    const contentLeft = marginPt;
    const contentWidth = pageWidth - marginPt * 2;
    const minCardWidth = compact ? 280 : 320;
    const footerReserve = 14;
    const headerHeight = compact ? (denseTableBlocks || fixedCardGrid ? 38 : 34) : 50;
    const headerHeightContinuation = compact ? 16 : 24;
    const contentTop = marginPt + headerHeight + (compact ? 4 : 8);
    const contentBottom = pageHeight - marginPt;

    let columns = 1;
    let cardRowsPerPage: number | null = null;
    let cardsPerPage: number | null = null;

    if (fixedCardGrid) {
        columns = 2;
        cardRowsPerPage = 3;
        cardsPerPage = 6;
    } else if (options.layoutLabel === "Cards" && !denseBlocks) {
        columns = Math.max(1, Math.floor((contentWidth + gap) / (minCardWidth + gap)));
    }

    const cardWidth = columns > 0 ? (contentWidth - gap * (columns - 1)) / columns : contentWidth;
    const usableHeight = contentBottom - contentTop - footerReserve;
    const blockSlotHeight = fixedCardGrid
        ? (usableHeight - gap * ((cardRowsPerPage ?? 3) - 1)) / (cardRowsPerPage ?? 3)
        : blocksPerPage > 1
          ? (usableHeight - gap * (blocksPerPage - 1)) / blocksPerPage
          : null;

    const compactCardMetrics = fixedCardGrid;
    const compactTableMetrics = denseTableBlocks;

    return {
        marginPt,
        contentLeft,
        contentTop,
        contentWidth,
        contentHeight: contentBottom - contentTop,
        contentBottom,
        columns,
        cardWidth,
        gap,
        lineHeight: compactCardMetrics ? 7 : compactTableMetrics ? 6 : compact ? 10 : 12,
        cardPadding: compactCardMetrics ? 4 : compactTableMetrics ? 3 : compact ? 8 : 10,
        pillHeight: compactCardMetrics ? 9 : compactTableMetrics ? 8 : compact ? 12 : 14,
        tableHeaderHeight: compactCardMetrics ? 10 : compactTableMetrics ? 8 : compact ? 15 : 17,
        tableRowHeight: compactCardMetrics ? 9 : compactTableMetrics ? 7 : compact ? 15 : 18,
        headerHeight,
        headerHeightContinuation,
        footerReserve,
        compact,
        blocksPerPage,
        blockSlotHeight,
        cardsPerPage,
        cardRowsPerPage,
        fixedCardGrid,
    };
}

export function formatPrintMoney(v: unknown): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return `PHP ${n.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    })}`;
}

export function printTextValue(v: unknown): string {
    const s = String(v ?? "").trim();
    return s || "-";
}

export const TIER_PALETTE_CSS: Array<{ fill: string; text: string }> = [
    { fill: "#f8fafc", text: "#1e293b" },
    { fill: "#f0f9ff", text: "#0369a1" },
    { fill: "#ecfdf5", text: "#047857" },
    { fill: "#f5f3ff", text: "#6d28d9" },
    { fill: "#fffbeb", text: "#b45309" },
    { fill: "#fff1f2", text: "#be123c" },
];
