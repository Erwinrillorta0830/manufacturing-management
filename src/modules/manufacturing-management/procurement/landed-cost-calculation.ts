import { calculatePackagingWeightShares } from "./packaging-weight";

export type LandedCostAllocationRule = "Value" | "Weight" | "Volume" | "Hybrid";
export type PurchaseOrderCategoryType = "RAW_MATERIAL" | "PACKAGING";

export interface LandedCostCalculationLine {
    key: number;
    category_type: PurchaseOrderCategoryType;
    quantity: number;
    baseUnitCostPhp: number;
    lineGrossWeightKg: number;
    volume: number;
}

export interface LandedCostCalculationLineResult extends LandedCostCalculationLine {
    commercialValue: number;
    valueShare: number;
    categoryFeePool: number;
    weightShare: number;
    allocatedExpense: number;
    roundingVariance: number;
    addedUnitCost: number;
    finalLandedUnitCost: number;
}

export interface LandedCostCalculationResult {
    lines: LandedCostCalculationLineResult[];
    totalShipmentValue: number;
    rmValueShare: number;
    pkgValueShare: number;
    rmFeePool: number;
    pkgFeePool: number;
    totalLandedFee: number;
    roundingVariance: number;
    roundingRecipientKey: number | null;
}

const MONEY_SCALE = 100;
const EPSILON = 0.0000001;

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

function finiteNonNegative(value: number, fallback = 0): number {
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function allocationRatio(rule: LandedCostAllocationRule, line: LandedCostCalculationLine): number {
    if (rule === "Weight") return finiteNonNegative(line.lineGrossWeightKg);
    if (rule === "Volume") return finiteNonNegative(line.volume) * finiteNonNegative(line.quantity);
    return finiteNonNegative(line.quantity) * finiteNonNegative(line.baseUnitCostPhp);
}

export function calculateLandedCost(
    lines: LandedCostCalculationLine[],
    totalLandedFee: number,
    rule: LandedCostAllocationRule
): LandedCostCalculationResult {
    if (!rule) throw new Error("An allocation rule is required before landed-cost finalization.");
    if (lines.length === 0) {
        return {
            lines: [],
            totalShipmentValue: 0,
            rmValueShare: 0,
            pkgValueShare: 0,
            rmFeePool: 0,
            pkgFeePool: 0,
            totalLandedFee: roundMoney(finiteNonNegative(totalLandedFee)),
            roundingVariance: 0,
            roundingRecipientKey: null
        };
    }

    const normalizedFee = finiteNonNegative(totalLandedFee);
    const normalizedLines = lines.map(line => ({
        ...line,
        quantity: finiteNonNegative(line.quantity),
        baseUnitCostPhp: finiteNonNegative(line.baseUnitCostPhp),
        lineGrossWeightKg: finiteNonNegative(line.lineGrossWeightKg),
        volume: finiteNonNegative(line.volume)
    }));

    const totalShipmentValue = normalizedLines.reduce(
        (sum, line) => sum + line.quantity * line.baseUnitCostPhp,
        0
    );
    const rawMaterialValue = normalizedLines
        .filter(line => line.category_type === "RAW_MATERIAL")
        .reduce((sum, line) => sum + line.quantity * line.baseUnitCostPhp, 0);
    const packagingValue = normalizedLines
        .filter(line => line.category_type === "PACKAGING")
        .reduce((sum, line) => sum + line.quantity * line.baseUnitCostPhp, 0);
    const rmValueShare = totalShipmentValue > EPSILON ? rawMaterialValue / totalShipmentValue : 0;
    const pkgValueShare = totalShipmentValue > EPSILON ? packagingValue / totalShipmentValue : 0;

    let rmFeePool = 0;
    let pkgFeePool = 0;
    if (rule === "Hybrid") {
        if (packagingValue > EPSILON && normalizedLines.some(line =>
            line.category_type === "PACKAGING" && line.quantity > EPSILON && line.lineGrossWeightKg <= EPSILON
        )) {
            throw new Error("Gross Weight is required for Packaging items.");
        }
        if (totalShipmentValue > EPSILON) {
            rmFeePool = normalizedFee * rmValueShare;
            pkgFeePool = normalizedFee * pkgValueShare;
        } else {
            const rmCount = normalizedLines.filter(line => line.category_type === "RAW_MATERIAL").length;
            const pkgCount = normalizedLines.filter(line => line.category_type === "PACKAGING").length;
            const totalCount = Math.max(1, rmCount + pkgCount);
            rmFeePool = normalizedFee * rmCount / totalCount;
            pkgFeePool = normalizedFee * pkgCount / totalCount;
        }
    }

    const rawAllocations = new Map<number, number>();
    const weightShares = new Map<number, number>();

    if (rule === "Hybrid") {
        const rawLines = normalizedLines.filter(line => line.category_type === "RAW_MATERIAL");
        const packageLines = normalizedLines.filter(line => line.category_type === "PACKAGING");
        const totalRawQuantity = rawLines.reduce((sum, line) => sum + line.quantity, 0);
        for (const line of rawLines) {
            rawAllocations.set(
                line.key,
                totalRawQuantity > EPSILON
                    ? rmFeePool * line.quantity / totalRawQuantity
                    : rmFeePool / Math.max(1, rawLines.length)
            );
        }
        const packageWeightShares = calculatePackagingWeightShares(packageLines.map(line => ({
            key: line.key,
            lineGrossWeightKg: line.lineGrossWeightKg
        })));
        for (const line of packageLines) {
            const share = packageWeightShares.get(line.key) || 0;
            weightShares.set(line.key, share);
            rawAllocations.set(
                line.key,
                share > EPSILON ? pkgFeePool * share : pkgFeePool / Math.max(1, packageLines.length)
            );
        }
    } else {
        const totalRatio = normalizedLines.reduce((sum, line) => sum + allocationRatio(rule, line), 0);
        for (const line of normalizedLines) {
            const ratio = totalRatio > EPSILON
                ? allocationRatio(rule, line) / totalRatio
                : 1 / normalizedLines.length;
            rawAllocations.set(line.key, normalizedFee * ratio);
        }
    }

    let roundedTotal = 0;
    let highestValue = -1;
    let roundingRecipientKey: number | null = null;
    const results = normalizedLines.map(line => {
        const commercialValue = line.quantity * line.baseUnitCostPhp;
        if (commercialValue > highestValue) {
            highestValue = commercialValue;
            roundingRecipientKey = line.key;
        }
        const allocatedExpense = roundMoney(rawAllocations.get(line.key) || 0);
        roundedTotal += allocatedExpense;
        const categoryFeePool = rule === "Hybrid"
            ? line.category_type === "PACKAGING" ? pkgFeePool : rmFeePool
            : normalizedFee;
        return {
            ...line,
            commercialValue,
            valueShare: totalShipmentValue > EPSILON ? commercialValue / totalShipmentValue : 0,
            categoryFeePool,
            weightShare: weightShares.get(line.key) || 0,
            allocatedExpense,
            roundingVariance: 0,
            addedUnitCost: 0,
            finalLandedUnitCost: 0
        };
    });

    const roundingVariance = roundMoney(normalizedFee - roundedTotal);
    if (roundingVariance !== 0 && roundingRecipientKey !== null) {
        const recipient = results.find(line => line.key === roundingRecipientKey);
        if (recipient) {
            recipient.roundingVariance = roundingVariance;
            recipient.allocatedExpense = roundMoney(recipient.allocatedExpense + roundingVariance);
        }
    }

    for (const line of results) {
        line.addedUnitCost = line.quantity > EPSILON
            ? roundMoney(line.allocatedExpense / line.quantity)
            : 0;
        line.finalLandedUnitCost = roundMoney(line.baseUnitCostPhp + line.addedUnitCost);
    }

    return {
        lines: results,
        totalShipmentValue: roundMoney(totalShipmentValue),
        rmValueShare,
        pkgValueShare,
        rmFeePool: roundMoney(rmFeePool),
        pkgFeePool: roundMoney(pkgFeePool),
        totalLandedFee: roundMoney(normalizedFee),
        roundingVariance,
        roundingRecipientKey
    };
}
