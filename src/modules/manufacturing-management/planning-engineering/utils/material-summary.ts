import { calculateMaterialCost } from "../../finished-goods-master/costing";

export interface WizardMaterialComponent extends Record<string, unknown> {
    component_id?: unknown;
    uom_id?: unknown;
    unit_of_measurement?: unknown;
    quantity_required?: unknown;
    wastage_factor_percentage?: unknown;
    cost_per_unit?: unknown;
    component_product_id?: (Record<string, unknown> & {
        product_id?: unknown;
    }) | null;
}

interface MaterialGroup<T extends WizardMaterialComponent> {
    first: T;
    quantityRequired: number;
    effectiveQuantity: number;
    standardMaterialCost: number;
}

function finiteNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function relationId(value: unknown, keys: string[]): unknown {
    if (!value || typeof value !== "object") return value;
    const relation = value as Record<string, unknown>;
    return keys.map((key) => relation[key]).find((candidate) => candidate !== undefined && candidate !== null);
}

function normalizedReference(value: unknown): string | null {
    const reference = relationId(value, ["unit_id", "uom_id", "id", "unit_shortcut", "unit_name"]);
    if (reference === undefined || reference === null || String(reference).trim() === "") return null;
    const text = String(reference).trim();
    const number = Number(text);
    return Number.isFinite(number) ? `id:${number}` : `label:${text.toLocaleLowerCase()}`;
}

function materialGroupKey(component: WizardMaterialComponent): string | null {
    const rawProductId = relationId(component.component_product_id?.product_id, ["product_id", "id"]);
    const productId = Number(rawProductId);
    if (!Number.isSafeInteger(productId) || productId <= 0) return null;

    const uomReference = component.uom_id ?? component.unit_of_measurement;
    return `${productId}|${normalizedReference(uomReference) || "product-default-uom"}`;
}

/**
 * Combines repeated BOM materials for wizard summaries while preserving the
 * original effective quantity and cost across differing line-level wastage.
 */
export function aggregateWizardMaterialComponents(components: WizardMaterialComponent[]): WizardMaterialComponent[] {
    const grouped = new Map<string, MaterialGroup<WizardMaterialComponent>>();
    const ordered: Array<
        | { type: "component"; value: WizardMaterialComponent }
        | { type: "group"; value: MaterialGroup<WizardMaterialComponent> }
    > = [];

    components.forEach((component) => {
        const key = materialGroupKey(component);
        if (!key) {
            ordered.push({ type: "component", value: component });
            return;
        }

        const quantityRequired = finiteNumber(component.quantity_required);
        const wastageFactor = finiteNumber(component.wastage_factor_percentage);
        const effectiveQuantity = quantityRequired * (1 + wastageFactor / 100);
        const unitCost = finiteNumber(component.cost_per_unit ?? component.component_product_id?.cost_per_unit);
        const standardMaterialCost = calculateMaterialCost({
            quantity: quantityRequired,
            unitCost,
            wastagePercent: wastageFactor
        });
        const existing = grouped.get(key);

        if (existing) {
            existing.quantityRequired += quantityRequired;
            existing.effectiveQuantity += effectiveQuantity;
            existing.standardMaterialCost += standardMaterialCost;
            return;
        }

        const group: MaterialGroup<WizardMaterialComponent> = {
            first: component,
            quantityRequired,
            effectiveQuantity,
            standardMaterialCost
        };
        grouped.set(key, group);
        ordered.push({ type: "group", value: group });
    });

    return ordered.map((entry) => {
        if (entry.type === "component") return entry.value;
        const group = entry.value;

        const weightedWastage = group.quantityRequired !== 0
            ? ((group.effectiveQuantity / group.quantityRequired) - 1) * 100
            : 0;
        const usableFactor = 1 - (weightedWastage / 100);
        const costFactor = usableFactor > 0 ? usableFactor : 1;
        const weightedUnitCost = group.quantityRequired !== 0
            ? (group.standardMaterialCost * costFactor) / group.quantityRequired
            : finiteNumber(group.first.cost_per_unit ?? group.first.component_product_id?.cost_per_unit);

        return {
            ...group.first,
            quantity_required: group.quantityRequired,
            wastage_factor_percentage: weightedWastage,
            cost_per_unit: weightedUnitCost,
            component_product_id: group.first.component_product_id
                ? { ...group.first.component_product_id, cost_per_unit: weightedUnitCost }
                : group.first.component_product_id
        };
    });
}
