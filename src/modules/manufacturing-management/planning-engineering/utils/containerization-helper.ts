import { calculateProductionQuantityPlan } from "./production-timing";

export interface ContainerizationMetrics {
    productName: string;
    targetQuantity: number;
    requestedTargetQuantity: number;
    requestedBatchRatio: number;
    requiredBatchCount: number;
    effectiveTargetQuantity: number;
    requestedMixCount: number;
    requestedSackCount: number;
    requestedFlourGrams: number;
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

export interface ContainerizationBOMComponent {
    product_name?: string;
    title?: string;
    quantity_required?: number;
    wastage_factor_percentage?: number;
    scrap_percentage?: number;
    unit_of_measurement?: string;
    uom_shortcut?: string;
    component_product_id?: {
        product_name?: string;
    };
}

export interface ContainerizationProfile {
    sacksPerMixEquivalent: number;
    flourKgPerMix: number;
}

const CONTAINERIZATION_PROFILE_MARKER = "[MM-CONTAINERIZATION-V1]";

/**
 * Reads the optional recipe-specific containerization profile from the
 * existing version remarks field. The marker is deliberately generic; the
 * values remain master-data configuration rather than source-code constants.
 */
export function parseContainerizationProfile(remarks: unknown): ContainerizationProfile | null {
    const text = String(remarks ?? "");
    const markerIndex = text.indexOf(CONTAINERIZATION_PROFILE_MARKER);
    if (markerIndex < 0) return null;

    const payload = text.slice(markerIndex + CONTAINERIZATION_PROFILE_MARKER.length).trim();
    const jsonStart = payload.indexOf("{");
    const jsonEnd = payload.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart) return null;

    try {
        const parsed = JSON.parse(payload.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
        const sacksPerMixEquivalent = Number(
            parsed.sacksPerMixEquivalent ?? parsed.sacks_per_mix_equivalent
        );
        const flourKgPerMix = Number(parsed.flourKgPerMix ?? parsed.flour_kg_per_mix);

        if (!Number.isFinite(sacksPerMixEquivalent) || sacksPerMixEquivalent <= 0) return null;
        if (!Number.isFinite(flourKgPerMix) || flourKgPerMix <= 0) return null;

        return { sacksPerMixEquivalent, flourKgPerMix };
    } catch {
        return null;
    }
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
    components?: ContainerizationBOMComponent[],
    bomBaseQty?: number,
    requestedTargetQuantity?: number,
    containerizationProfile?: ContainerizationProfile | null
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
    const baseQty = Math.max(1, Number(bomBaseQty) || 1);
    const requestedTarget = Math.max(1, Number(requestedTargetQuantity ?? targetQuantity) || 0);
    const quantityPlan = calculateProductionQuantityPlan(requestedTarget, baseQty);
    const requestedBatchRatio = quantityPlan.requestedBatchRatio;
    const requiredBatchCount = quantityPlan.requiredBatchCount;
    const effectiveTargetQuantity = quantityPlan.effectiveQuantity;

    // A recipe may define its production containerization in master-data
    // remarks. This is preferred over inferring from a component UOM because
    // a recipe-equivalent sack is not necessarily a physical inventory bag.
    let flourGramsTotal = 0;
    let sackCount = 0;
    let mixCount = 0;
    let requestedFlourGrams = 0;
    let requestedSackCount = 0;
    let requestedMixCount = requestedBatchRatio;

    if (containerizationProfile) {
        requestedSackCount = requestedMixCount * containerizationProfile.sacksPerMixEquivalent;
        sackCount = requiredBatchCount * containerizationProfile.sacksPerMixEquivalent;
        requestedFlourGrams = requestedMixCount * containerizationProfile.flourKgPerMix * 1000;
        flourGramsTotal = requiredBatchCount * containerizationProfile.flourKgPerMix * 1000;
        mixCount = requiredBatchCount;
    }

    if (!containerizationProfile && Array.isArray(components) && components.length > 0) {
        const flourComp = components.find((c) => {
            const name = String(c.product_name || c.component_product_id?.product_name || c.title || "").toLowerCase();
            return name.includes("flour") || name.includes("harina") || name.includes("wheat") || name.includes("starch") || name.includes("rice");
        });

        if (flourComp) {
            const qtyReqPerUnit = Number(flourComp.quantity_required || 0);
            const uomStr = String(flourComp.unit_of_measurement || flourComp.uom_shortcut || "").toUpperCase();

            // BOM quantities are normalized per finished output unit. Convert
            // the per-unit quantity to grams before applying exact demand and
            // full-batch planned output.
            let gramsPerUnit = qtyReqPerUnit;
            if (uomStr.includes("KG") || uomStr.includes("KILO")) {
                gramsPerUnit = qtyReqPerUnit * 1000;
            } else if (uomStr.includes("SACK") || uomStr.includes("BAG")) {
                gramsPerUnit = qtyReqPerUnit * 25000;
            } else if (uomStr.includes("G") || uomStr.includes("GRAM")) {
                gramsPerUnit = qtyReqPerUnit;
            }

            requestedFlourGrams = gramsPerUnit * requestedTarget;
            requestedSackCount = (requestedFlourGrams / 25000);
            const totalFlourGramsNeeded = gramsPerUnit * effectiveTargetQuantity;
            if (totalFlourGramsNeeded > 0) {
                flourGramsTotal = Math.round(totalFlourGramsNeeded);
                sackCount = Math.ceil(flourGramsTotal / 25000);
                // A recipe batch is one production mix. The configured sack
                // count remains available for packaging calculations, while
                // mix count follows the full-batch production plan.
                mixCount = requiredBatchCount;
            }
        }
    }

    // Fallback if no specific flour component was identified
    if (!containerizationProfile && mixCount <= 0) {
        const netPcsPerSack = (baseBatchWeightPerSack / cuttingUnitWeightGrams * yieldFactor) * (1 - scrapRate);
        const totalSacksNeeded = Math.ceil(targetNetPcs / Math.max(0.001, netPcsPerSack));
        mixCount = Math.ceil(totalSacksNeeded / sacksPerMix);
        sackCount = mixCount * sacksPerMix;
        flourGramsTotal = sackCount * 25000;
        requestedSackCount = requiredBatchCount > 0 ? (sackCount * requestedBatchRatio) / requiredBatchCount : sackCount;
        requestedFlourGrams = requiredBatchCount > 0 ? (flourGramsTotal * requestedBatchRatio) / requiredBatchCount : flourGramsTotal;
        requestedMixCount = requestedBatchRatio;
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
        requestedTargetQuantity: requestedTarget,
        requestedBatchRatio,
        requiredBatchCount,
        effectiveTargetQuantity,
        requestedMixCount,
        requestedSackCount,
        requestedFlourGrams,
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

