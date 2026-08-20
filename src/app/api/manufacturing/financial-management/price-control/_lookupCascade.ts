export type LookupProductSets = {
    catSet: Set<string>;
    brandSet: Set<string>;
    unitSet: Set<string>;
};

type ScanFilter = { categoryId: number; brandId: number };

export async function collectCascadeSets(args: {
    productIds?: number[];
    categoryId: number;
    brandId: number;
    runScan: (filter: ScanFilter) => Promise<LookupProductSets>;
}) {
    const scanCache = new Map<string, LookupProductSets>();

    const runScanCached = async (filter: ScanFilter) => {
        const key = `${filter.categoryId}:${filter.brandId}`;
        if (!scanCache.has(key)) {
            scanCache.set(key, await args.runScan(filter));
        }
        return scanCache.get(key)!;
    };

    const catsResult = await runScanCached({
        categoryId: 0,
        brandId: args.brandId > 0 ? args.brandId : 0,
    });
    const brandsResult = await runScanCached({
        categoryId: args.categoryId > 0 ? args.categoryId : 0,
        brandId: 0,
    });
    const unitsResult = await runScanCached({
        categoryId: args.categoryId > 0 ? args.categoryId : 0,
        brandId: args.brandId > 0 ? args.brandId : 0,
    });

    return { catsResult, brandsResult, unitsResult };
}
