import type { LandedCostAllocationRule } from "./types";

export interface LandedCostMethodOption {
    value: LandedCostAllocationRule;
    label: string;
    description: string;
}

export const LANDED_COST_METHOD_OPTIONS: readonly LandedCostMethodOption[] = [
    { value: "Value", label: "Commercial Value", description: "Allocate by each line's commercial value." },
    { value: "Weight", label: "Weight", description: "Allocate by line gross weight." },
    { value: "Volume", label: "Volume", description: "Allocate by line cubic volume." },
    {
        value: "Hybrid",
        label: "Hybrid (RM Qty / PKG Weight / FG Value)",
        description: "Raw Materials by quantity, Packaging by weight, Finished Goods by commercial value."
    }
];

export function landedCostMethodLabel(rule: LandedCostAllocationRule | ""): string {
    return LANDED_COST_METHOD_OPTIONS.find(option => option.value === rule)?.label || "No allocation rule selected";
}
