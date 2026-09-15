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
    baseBatchWeightPerSackParam?: number,
    components?: any[],
    bomBaseQty?: number
): ContainerizationMetrics {
    const sacksPerMix = Math.max(1, Number(sacksPerMixParam) || 4);
    const baseBatchWeightPerSack = Math.max(1, Number(baseBatchWeightPerSackParam) || 32892.5); // grams
    const cuttingUnitWeightGrams = Math.max(1, Number(versionCuttingWeightGrams) || 500); // grams
    const expectedYieldPercentage = (versionExpectedYieldPercent !== undefined && versionExpectedYieldPercent !== null && Number(versionExpectedYieldPercent) > 0 && Number(versionExpectedYieldPercent) <= 100)
        ? Number(versionExpectedYieldPercent)
        : 100.0;
    const yieldFactor = expectedYieldPercentage / 100;

    // Determine scrap rate: from versionScrapRate, or from components average wastage factor, or default 0.05
    let scrapRate = 0.0500;
    if (versionScrapRate !== undefined && versionScrapRate !== null && !isNaN(Number(versionScrapRate))) {
        const rawScrap = Number(versionScrapRate);
        scrapRate = rawScrap > 1 ? rawScrap / 100 : Math.max(0, rawScrap);
    } else if (Array.isArray(components) && components.length > 0) {
        const wastages = components
            .map((c) => Number(c.wastage_factor_percentage || c.scrap_percentage || 0))
            .filter((w) => w > 0);
        if (wastages.length > 0) {
            const avgWastage = wastages.reduce((sum, w) => sum + w, 0) / wastages.length;
            scrapRate = avgWastage > 1 ? avgWastage / 100 : avgWastage;
        }
    }

    const pcsPerCaseBundle = Math.max(1, Number(uomCount) || 1); // Uses product uom count
    const casesBundlesPerPallet = Math.max(1, Number(versionCasesPerPallet) || 50); // Pallet capacity

    const targetNetPcs = Math.max(1, Number(targetQuantity) || 0);

    // Dynamic BOM Flour calculation if flour/grain component is present in BOM
    let flourGramsTotal = 0;
    let sackCount = 0;
    let mixCount = 0;

    const baseQty = Math.max(1, Number(bomBaseQty) || 1);
    if (Array.isArray(components) && components.length > 0) {
        const flourComp = components.find((c) => {
            const name = String(c.product_name || c.component_product_id?.product_name || c.title || "").toLowerCase();
            return name.includes("flour") || name.includes("harina") || name.includes("wheat") || name.includes("starch") || name.includes("rice");
        });

        if (flourComp) {
            const qtyReqPerBase = Number(flourComp.quantity_required || 0);
            const uomStr = String(flourComp.unit_of_measurement || flourComp.uom_shortcut || "").toUpperCase();

            // Convert to grams
            let gramsPerBase = qtyReqPerBase;
            if (uomStr.includes("KG") || uomStr.includes("KILO")) {
                gramsPerBase = qtyReqPerBase * 1000;
            } else if (uomStr.includes("SACK") || uomStr.includes("BAG")) {
                gramsPerBase = qtyReqPerBase * 25000;
            } else if (uomStr.includes("G") || uomStr.includes("GRAM")) {
                gramsPerBase = qtyReqPerBase;
            }

            const totalFlourGramsNeeded = (gramsPerBase / baseQty) * targetNetPcs;
            if (totalFlourGramsNeeded > 0) {
                flourGramsTotal = Math.round(totalFlourGramsNeeded);
                sackCount = Math.ceil(flourGramsTotal / 25000);
                mixCount = Math.ceil(sackCount / sacksPerMix);
            }
        }
    }

    // Fallback if no specific flour component was identified
    if (mixCount <= 0) {
        const netPcsPerSack = (baseBatchWeightPerSack / cuttingUnitWeightGrams * yieldFactor) * (1 - scrapRate);
        const totalSacksNeeded = Math.ceil(targetNetPcs / Math.max(0.001, netPcsPerSack));
        mixCount = Math.ceil(totalSacksNeeded / sacksPerMix);
        sackCount = mixCount * sacksPerMix;
        flourGramsTotal = sackCount * 25000;
    }

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
        targetQuantity: targetNetPcs,
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

