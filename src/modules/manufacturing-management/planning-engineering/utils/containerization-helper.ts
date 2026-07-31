export interface ContainerizationMetrics {
    productName: string;
    targetQuantity: number;
    mixCount: number;
    sackCount: number;
    flourGramsTotal: number;
    baseBatchWeightGrams: number;
    totalBaseWeightGrams: number;
    cuttingUnitWeightGrams: number;
    yieldFactor: number;
    expectedYieldPercentage: number;
    grossPieces: number;
    scrapRate: number;
    wastePieces: number;
    netPieces: number;
    pcsPerCaseBundle: number;
    totalCasesBundlesFull: number;
    totalCasesBundlesExact: number;
    remainingPcs: number;
    casesBundlesPerPallet: number;
    totalPalletsFull: number;
    totalPalletsExact: number;
    remainingCasesBundles: number;
}

export function formatHoursToHMS(hours: number | null | undefined): string {
    if (hours === null || hours === undefined || isNaN(hours)) return "00:00:00";
    const totalSeconds = Math.round(Math.abs(hours) * 3600);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const sign = hours < 0 ? "-" : "";
    const pad = (num: number) => String(num).padStart(2, "0");
    return `${sign}${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function calculateContainerizationMetrics(
    productName: string,
    targetQuantity: number,
    uomCount?: number,
    versionExpectedYieldPercent?: number,
    versionScrapRate?: number,
    versionCuttingWeightGrams?: number,
    versionCasesPerPallet?: number,
    sacksPerMixParam?: number,
    baseBatchWeightPerSackParam?: number
): ContainerizationMetrics {
    // Pure parameter-driven calculations (no hardcoded product names or IDs)
    const sacksPerMix = Math.max(1, sacksPerMixParam || 4);
    const baseBatchWeightPerSack = Math.max(1, baseBatchWeightPerSackParam || 32892.5); // grams
    const cuttingUnitWeightGrams = Math.max(1, versionCuttingWeightGrams || 500); // grams
    const expectedYieldPercentage = (versionExpectedYieldPercent && versionExpectedYieldPercent > 0 && versionExpectedYieldPercent <= 100)
        ? versionExpectedYieldPercent
        : 100.0;
    const yieldFactor = expectedYieldPercentage / 100;
    const scrapRate = Math.max(0, versionScrapRate || 0.0500); // 5% default scrap rate
    const pcsPerCaseBundle = Math.max(1, uomCount || 1); // Uses existing product.unit_of_measurement_count
    const casesBundlesPerPallet = Math.max(1, versionCasesPerPallet || 50); // Pallet capacity

    // Estimate total net output and mixes required
    const netPcsPerSack = (baseBatchWeightPerSack / cuttingUnitWeightGrams * yieldFactor) * (1 - scrapRate);
    const targetNetPcs = Math.max(1, targetQuantity);
    const totalSacksNeeded = Math.ceil(targetNetPcs / Math.max(0.001, netPcsPerSack));
    const mixCount = Math.ceil(totalSacksNeeded / sacksPerMix);
    const sackCount = mixCount * sacksPerMix;

    const flourGramsTotal = sackCount * 25000;
    const totalBaseWeightGrams = sackCount * baseBatchWeightPerSack;
    const grossPieces = (totalBaseWeightGrams / cuttingUnitWeightGrams) * yieldFactor;
    const wastePieces = grossPieces * scrapRate;
    const netPieces = Math.max(0, grossPieces - wastePieces);

    // Case / Bundle Conversions
    const totalCasesBundlesExact = netPieces / pcsPerCaseBundle;
    const totalCasesBundlesFull = Math.floor(totalCasesBundlesExact);
    const remainingPcs = Math.round((totalCasesBundlesExact - totalCasesBundlesFull) * pcsPerCaseBundle);

    // Pallet Conversions
    const totalPalletsExact = totalCasesBundlesFull / casesBundlesPerPallet;
    const totalPalletsFull = Math.floor(totalPalletsExact);
    const remainingCasesBundles = Math.round((totalPalletsExact - totalPalletsFull) * casesBundlesPerPallet);

    return {
        productName,
        targetQuantity,
        mixCount,
        sackCount,
        flourGramsTotal,
        baseBatchWeightGrams: baseBatchWeightPerSack,
        totalBaseWeightGrams,
        cuttingUnitWeightGrams,
        yieldFactor,
        expectedYieldPercentage,
        grossPieces,
        scrapRate,
        wastePieces,
        netPieces,
        pcsPerCaseBundle,
        totalCasesBundlesFull,
        totalCasesBundlesExact,
        remainingPcs,
        casesBundlesPerPallet,
        totalPalletsFull,
        totalPalletsExact,
        remainingCasesBundles
    };
}
