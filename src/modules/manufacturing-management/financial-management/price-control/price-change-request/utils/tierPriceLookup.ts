import type { TierPriceRow } from "../providers/pcrApi";

export function tierPriceKey(productId: number, priceTypeId: number) {
    return `${productId}:${priceTypeId}`;
}

export function buildTierPriceMap(rows: TierPriceRow[]): Map<string, number | null> {
    const map = new Map<string, number | null>();

    for (const row of rows) {
        const productId = Number(row.product_id);
        const priceTypeId = Number(row.price_type_id);
        if (!Number.isFinite(productId) || !Number.isFinite(priceTypeId)) continue;

        const price = row.price === null || row.price === undefined ? null : Number(row.price);
        map.set(tierPriceKey(productId, priceTypeId), Number.isFinite(price) ? price : null);
    }

    return map;
}

export function lookupTierPrice(
    map: Map<string, number | null>,
    productId: number,
    priceTypeId: number,
): number | null {
    return map.get(tierPriceKey(productId, priceTypeId)) ?? null;
}
