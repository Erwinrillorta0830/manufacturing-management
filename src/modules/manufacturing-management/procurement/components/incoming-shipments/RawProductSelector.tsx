import React, { useMemo } from "react";
import { RawMaterial } from "../../types";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatAmount } from "./ShipmentBadges";

export interface RawProductSelectorProps {
    id?: string;
    autoFocus?: boolean;
    rawMaterials: RawMaterial[];
    selectedProductId: string;
    parentProductId?: string;
    productName?: string;
    onSelect: (selected: {
        parent_product_id: string;
        product_id: string;
        product_name: string;
        product_code: string;
        selected_uom: string;
        base_unit_cost_php: string;
        uom_options: Array<{
            product_id: number;
            unit_shortcut: string;
            cost_per_unit: number;
            unit_of_measurement_count?: number;
        }>;
    }) => void;
}

export function RawProductSelector({
    rawMaterials,
    selectedProductId,
    onSelect
}: RawProductSelectorProps) {
    const options = useMemo(() => {
        return rawMaterials.map(rm => {
            const uom = rm.unit_of_measurement?.unit_shortcut || "PCS";
            const cost = Number(rm.cost_per_unit || rm.estimated_unit_cost || 0);
            const sku = rm.product_code ? ` [${rm.product_code}]` : "";
            return {
                value: String(rm.product_id),
                label: `${rm.product_name}${sku} — (${uom} @ ₱${formatAmount(cost)})`
            };
        });
    }, [rawMaterials]);

    const handleValueChange = (val: string) => {
        const selectedMaterial = rawMaterials.find(rm => String(rm.product_id) === String(val));
        if (!selectedMaterial) return;

        const parentId = selectedMaterial.parent_id ? String(selectedMaterial.parent_id) : String(selectedMaterial.product_id);
        const parentMaterial = rawMaterials.find(rm => String(rm.product_id) === parentId) || selectedMaterial;
        
        const siblings = rawMaterials.filter(rm => 
            String(rm.product_id) === parentId || String(rm.parent_id) === parentId
        );

        const cost = Number(selectedMaterial.cost_per_unit || selectedMaterial.estimated_unit_cost || 0);

        onSelect({
            parent_product_id: parentId,
            product_id: String(selectedMaterial.product_id),
            product_name: parentMaterial.product_name || selectedMaterial.product_name,
            product_code: selectedMaterial.product_code || "",
            selected_uom: selectedMaterial.unit_of_measurement?.unit_shortcut || "PCS",
            base_unit_cost_php: String(cost),
            uom_options: siblings.map(x => ({
                product_id: x.product_id,
                unit_shortcut: x.unit_of_measurement?.unit_shortcut || "PCS",
                cost_per_unit: x.cost_per_unit || x.estimated_unit_cost || 0,
                unit_of_measurement_count: x.unit_of_measurement_count || 1
            }))
        });
    };

    return (
        <SearchableSelect
            options={options}
            value={String(selectedProductId || "")}
            onValueChange={handleValueChange}
            placeholder="Select raw product..."
            className="h-8 text-xs font-semibold w-full bg-background"
        />
    );
}
