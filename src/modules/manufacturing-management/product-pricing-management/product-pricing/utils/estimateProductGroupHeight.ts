import { getRegisteredUnitIds, type RowWithVariants } from "./rowUnits";

const BASE_HEADER = 88;
const TABLE_HEADER = 36;
const TIER_ROW = 52;
const CARD_CELL_ROW = 56;
const PADDING = 12;

type RowLike = RowWithVariants;

export function estimateProductGroupBlockHeight(tierCount: number): number {
    const tiers = Math.max(1, tierCount);
    return BASE_HEADER + TABLE_HEADER + tiers * TIER_ROW + PADDING;
}

export function estimateProductGroupCardHeight(args: {
    tierCount: number;
    row?: RowLike;
    gridCols?: number;
}): number {
    const { tierCount, row, gridCols = 2 } = args;

    const unitCount = Math.max(1, row ? getRegisteredUnitIds(row).length : 0);

    const cellCount = Math.max(1, tierCount) * unitCount;
    const gridRows = Math.ceil(cellCount / Math.max(1, gridCols));
    return BASE_HEADER + gridRows * CARD_CELL_ROW + PADDING;
}

export function estimateProductGroupCardRowHeight(args: {
    rows: RowLike[];
    tierCount: number;
}): number {
    const { rows, tierCount } = args;
    if (rows.length === 0) return BASE_HEADER + PADDING;

    return Math.max(
        ...rows.map((row) =>
            estimateProductGroupCardHeight({ tierCount, row, gridCols: 2 }),
        ),
        BASE_HEADER + PADDING,
    );
}
