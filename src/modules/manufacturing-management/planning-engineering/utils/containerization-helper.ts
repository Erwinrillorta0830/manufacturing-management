import {
    calculateMaterialRequirementPlan,
    calculateProductionQuantityPlan
} from "./production-timing";

export interface ContainerizationMetrics {
    productName: string;
    targetQuantity: number;
    requestedTargetQuantity: number;
    requestedBatchRatio: number;
    requiredBatchCount: number;
    effectiveTargetQuantity: number;
    requestedMixCount: number;
    requestedSackCount: number;
    containerUnitLabel: string;
    hasSackEstimate: boolean;
    hasFlourWeightEstimate: boolean;
    hasOutputEstimate: boolean;
    hasPalletEstimate: boolean;
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
    kilograms_per_inventory_unit?: number | null;
    component_product_id?: {
        product_name?: string;
    };
}

export interface ContainerizationProfile {
    sacksPerMixEquivalent: number;
    flourKgPerMix: number;
}

function normalizedUnitLabel(value: unknown): string {
    return String(value ?? "").trim().toLowerCase().replace(/[._-]/g, " ");
}

/** Returns the explicitly configured mass equivalent of one inventory unit. */
export function getKilogramsPerInventoryUnit(product: unknown): number | null {
    if (!product || typeof product !== "object") return null;
    const row = product as Record<string, unknown>;
    const uomValue = row.unit_of_measurement;
    const uom = typeof uomValue === "object" && uomValue !== null
        ? (uomValue as Record<string, unknown>).unit_shortcut ?? (uomValue as Record<string, unknown>).unit_name
        : uomValue;
    const uomLabel = normalizedUnitLabel(uom);
    if (uomLabel === "kg" || uomLabel.includes("kilogram")) return 1;
    if (uomLabel === "g" || uomLabel.includes("gram")) return 0.001;
    if (["lb", "lbs"].includes(uomLabel) || uomLabel.includes("pound")) return 0.45359237;
    if (["oz", "ounce"].includes(uomLabel)) return 0.028349523125;

    const weight = Number(row.net_weight ?? row.product_weight ?? row.weight);
    if (!Number.isFinite(weight) || weight <= 0) return null;
    const weightUnitValue = row.weight_unit_id;
    const weightUnit = typeof weightUnitValue === "object" && weightUnitValue !== null
        ? (weightUnitValue as Record<string, unknown>).code
            ?? (weightUnitValue as Record<string, unknown>).unit_shortcut
            ?? (weightUnitValue as Record<string, unknown>).name
            ?? (weightUnitValue as Record<string, unknown>).unit_name
        : weightUnitValue;
    const weightUnitLabel = normalizedUnitLabel(weightUnit);
    if (weightUnitLabel === "kg" || weightUnitLabel.includes("kilogram")) return weight;
    if (weightUnitLabel === "g" || weightUnitLabel.includes("gram")) return weight / 1000;
    if (["lb", "lbs"].includes(weightUnitLabel) || weightUnitLabel.includes("pound")) return weight * 0.45359237;
    if (["oz", "ounce"].includes(weightUnitLabel)) return weight * 0.028349523125;
    return null;
}

export function formatInventoryQuantity(
    value: number,
    uom: string,
    kilogramsPerInventoryUnit?: number | null
): { quantity: string; kilograms: string | null } {
    const formattedQuantity = Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
    const kilogramsPerUnit = Number(kilogramsPerInventoryUnit);
    const unit = normalizedUnitLabel(uom);
    return {
        quantity: `${formattedQuantity} ${uom}`,
        kilograms: (unit === "kg" || unit.includes("kilogram"))
            ? null
            : Number.isFinite(kilogramsPerUnit) && kilogramsPerUnit > 0
            ? `${(Number(value) * kilogramsPerUnit).toLocaleString(undefined, { maximumFractionDigits: 4 })} kg`
            : null
    };
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
    const sacksPerMix = Number(sacksPerMixParam) > 0 ? Number(sacksPerMixParam) : 0;
    const baseBatchWeightPerSack = Number(baseBatchWeightPerSackParam) > 0 ? Number(baseBatchWeightPerSackParam) : 0;
    const cuttingUnitWeightGrams = Number(versionCuttingWeightGrams) > 0 ? Number(versionCuttingWeightGrams) : 0;
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
    const casesBundlesPerPallet = Number(versionCasesPerPallet) > 0 ? Number(versionCasesPerPallet) : 0;

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
    const requestedMixCount = requestedBatchRatio;
    let containerUnitLabel = "sacks";
    let hasSackEstimate = false;
    let hasFlourWeightEstimate = false;

    if (containerizationProfile) {
        requestedSackCount = requestedMixCount * containerizationProfile.sacksPerMixEquivalent;
        sackCount = requiredBatchCount * containerizationProfile.sacksPerMixEquivalent;
        requestedFlourGrams = requestedMixCount * containerizationProfile.flourKgPerMix * 1000;
        flourGramsTotal = requiredBatchCount * containerizationProfile.flourKgPerMix * 1000;
        mixCount = requiredBatchCount;
        containerUnitLabel = "recipe sack-equivalents";
        hasSackEstimate = true;
        hasFlourWeightEstimate = true;
    }

    if (!containerizationProfile && Array.isArray(components) && components.length > 0) {
        const flourComp = components.find((c) => {
            const name = String(c.product_name || c.component_product_id?.product_name || c.title || "").toLowerCase();
            return name.includes("flour") || name.includes("harina") || name.includes("wheat") || name.includes("starch") || name.includes("rice");
        });

        if (flourComp) {
            const qtyReqPerUnit = Number(flourComp.quantity_required || 0);
            const materialPlan = calculateMaterialRequirementPlan(
                requestedTarget,
                effectiveTargetQuantity,
                qtyReqPerUnit,
                Number(flourComp.wastage_factor_percentage || 0)
            );
            const uomStr = normalizedUnitLabel(flourComp.unit_of_measurement || flourComp.uom_shortcut);
            const perInventoryUnitKg = Number(flourComp.kilograms_per_inventory_unit);
            const isBagOrSack = uomStr.includes("sack") || uomStr.includes("bag");
            const directKgPerUnit = uomStr === "kg" || uomStr.includes("kilogram")
                ? 1
                : uomStr === "g" || uomStr.includes("gram")
                    ? 0.001
                    : Number.isFinite(perInventoryUnitKg) && perInventoryUnitKg > 0
                        ? perInventoryUnitKg
                        : null;

            if (isBagOrSack) {
                requestedSackCount = materialPlan.demandRequired;
                sackCount = materialPlan.plannedRequired;
                containerUnitLabel = uomStr.includes("bag") ? "Bags" : "Sacks";
                hasSackEstimate = true;
            }
            if (directKgPerUnit !== null) {
                requestedFlourGrams = materialPlan.demandRequired * directKgPerUnit * 1000;
                flourGramsTotal = materialPlan.plannedRequired * directKgPerUnit * 1000;
                hasFlourWeightEstimate = true;
            }
            if (!hasSackEstimate && hasFlourWeightEstimate && baseBatchWeightPerSack > 0) {
                requestedSackCount = requestedFlourGrams / baseBatchWeightPerSack;
                sackCount = flourGramsTotal / baseBatchWeightPerSack;
                containerUnitLabel = "Sacks";
                hasSackEstimate = true;
            }
            mixCount = requiredBatchCount;
        }
    }

    if (!containerizationProfile && !hasSackEstimate && sacksPerMix > 0 && baseBatchWeightPerSack > 0) {
        requestedSackCount = requestedMixCount * sacksPerMix;
        sackCount = requiredBatchCount * sacksPerMix;
        requestedFlourGrams = requestedSackCount * baseBatchWeightPerSack;
        flourGramsTotal = sackCount * baseBatchWeightPerSack;
        containerUnitLabel = "Sacks";
        hasSackEstimate = true;
        hasFlourWeightEstimate = true;
    }
    if (!containerizationProfile && mixCount <= 0) {
        mixCount = requiredBatchCount;
    }

    const totalBaseWeightGrams = hasFlourWeightEstimate ? flourGramsTotal : 0;
    const hasOutputEstimate = totalBaseWeightGrams > 0 && cuttingUnitWeightGrams > 0;
    const grossPieces = hasOutputEstimate ? totalBaseWeightGrams / cuttingUnitWeightGrams : 0;
    // Expected yield already accounts for output loss; do not deduct the
    // separately configured scrap rate again from the same physical estimate.
    const netPieces = Math.max(0, grossPieces * yieldFactor);
    const wastePieces = Math.max(0, grossPieces - netPieces);

    // Case / Bundle Conversions
    const totalCasesBundlesExact = hasOutputEstimate ? netPieces / pcsPerCaseBundle : 0;
    const totalCasesBundlesFull = Math.floor(totalCasesBundlesExact);
    const remainingPcs = Math.round((totalCasesBundlesExact - totalCasesBundlesFull) * pcsPerCaseBundle);

    // Pallet Conversions
    const hasPalletEstimate = hasOutputEstimate && casesBundlesPerPallet > 0;
    const totalPalletsExact = hasPalletEstimate ? totalCasesBundlesFull / casesBundlesPerPallet : 0;
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
        containerUnitLabel,
        hasSackEstimate,
        hasFlourWeightEstimate,
        hasOutputEstimate,
        hasPalletEstimate,
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

