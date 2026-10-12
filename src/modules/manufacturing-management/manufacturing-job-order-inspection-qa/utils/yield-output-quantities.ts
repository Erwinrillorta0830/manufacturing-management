export function getYieldOutputTotals(
    goodQuantity: number,
    rejectedQuantity: number,
    legacyScrapQuantity: number
): { rejectedQuantity: number; totalQuantity: number } {
    const good = Number.isFinite(goodQuantity) ? Math.max(0, goodQuantity) : 0;
    const rejected = Number.isFinite(rejectedQuantity) ? Math.max(0, rejectedQuantity) : 0;
    const scrap = Number.isFinite(legacyScrapQuantity) ? Math.max(0, legacyScrapQuantity) : 0;

    return {
        rejectedQuantity: rejected + scrap,
        totalQuantity: good + rejected + scrap
    };
}
