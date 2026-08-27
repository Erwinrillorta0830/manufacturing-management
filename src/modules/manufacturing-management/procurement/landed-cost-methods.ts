import type { LandedCostAllocationRule } from "./types";

export interface LandedCostMethodOption {
    value: LandedCostAllocationRule;
    label: string;
    description: string;
}

export const LANDED_COST_METHOD_OPTIONS: readonly LandedCostMethodOption[] = [
    { value: "Quantity", label: "Quantity", description: "Allocate by accepted received quantity." },
    { value: "Weight", label: "Weight", description: "Allocate by line gross weight." },
    {
        value: "Hybrid",
        label: "Hybrid (RM Qty / PKG Weight / FG Value)",
        description: "Raw Materials by quantity, Packaging by weight, Finished Goods by commercial value."
    }
];

export function landedCostMethodLabel(rule: LandedCostAllocationRule | ""): string {
    if (!rule) return "No allocation rule selected";
    return LANDED_COST_METHOD_OPTIONS.find(option => option.value === rule)?.label
        || (rule === "Value"
            ? "Commercial Value (legacy)"
            : rule === "Volume"
                ? "Volume (legacy)"
                : "No allocation rule selected");
}
