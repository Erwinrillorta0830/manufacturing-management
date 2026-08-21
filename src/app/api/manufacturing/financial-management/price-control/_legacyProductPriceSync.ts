export type LegacyPriceTypeRow = {
    price_type_id: number;
    price_type_name: string;
    sort?: number | string | null;
};

export type LegacyProductsPatch = Partial<{
    price_per_unit: number | null;
    priceA: number | null;
    priceB: number | null;
    priceC: number | null;
    priceD: number | null;
    priceE: number | null;
}>;

const LEGACY_TIER_COLUMNS = ["priceA", "priceB", "priceC", "priceD", "priceE"] as const;

export function sortPriceTypes(rows: LegacyPriceTypeRow[]): LegacyPriceTypeRow[] {
    return [...rows].sort((a, b) => {
        const aSort = Number(a.sort ?? Number.MAX_SAFE_INTEGER);
        const bSort = Number(b.sort ?? Number.MAX_SAFE_INTEGER);
        return (
            aSort - bSort ||
            String(a.price_type_name ?? "").localeCompare(String(b.price_type_name ?? ""))
        );
    });
}

export function legacyPatchFromName(priceTypeName: string, price: number | null): LegacyProductsPatch | null {
    const normalized = String(priceTypeName ?? "")
        .trim()
        .toUpperCase()
        .replace(/[_-]+/g, " ");

    if (normalized === "A" || normalized === "PRICE A" || normalized === "TIER A") {
        return { priceA: price, price_per_unit: price };
    }
    if (normalized === "B" || normalized === "PRICE B" || normalized === "TIER B") return { priceB: price };
    if (normalized === "C" || normalized === "PRICE C" || normalized === "TIER C") return { priceC: price };
    if (normalized === "D" || normalized === "PRICE D" || normalized === "TIER D") return { priceD: price };
    if (normalized === "E" || normalized === "PRICE E" || normalized === "TIER E") return { priceE: price };
    if (normalized === "LIST" || normalized === "LIST PRICE" || normalized === "PRICE PER UNIT") {
        return { price_per_unit: price };
    }
    return null;
}

/** @deprecated Use resolveLegacyProductsPatch; kept for name-only callers. */
export function mapPriceTypeToProductsPatch(priceTypeName: string, price: number): LegacyProductsPatch | null {
    return legacyPatchFromName(priceTypeName, price);
}

export function legacyPatchFromSortIndex(index: number, price: number | null): LegacyProductsPatch | null {
    if (index < 0 || index >= LEGACY_TIER_COLUMNS.length) return null;

    const column = LEGACY_TIER_COLUMNS[index];
    const patch: LegacyProductsPatch = { [column]: price };
    if (index === 0) {
        patch.price_per_unit = price;
    }
    return patch;
}

export function resolveLegacyProductsPatch(args: {
    priceTypeId: number;
    priceTypeName: string;
    price: number | null;
    catalog: LegacyPriceTypeRow[];
}): LegacyProductsPatch | null {
    const fromName = legacyPatchFromName(args.priceTypeName, args.price);
    if (fromName) return fromName;

    if (args.priceTypeId === -1) return null;

    const sorted = sortPriceTypes(args.catalog.filter((row) => row.price_type_id !== -1));
    const index = sorted.findIndex((row) => row.price_type_id === args.priceTypeId);
    if (index < 0) return null;

    return legacyPatchFromSortIndex(index, args.price);
}
