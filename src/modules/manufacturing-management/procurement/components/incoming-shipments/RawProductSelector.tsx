import React, { useMemo } from "react";
import { RawMaterial } from "../../types";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatAmount } from "./ShipmentBadges";
import {
    PURCHASE_ORDER_MATERIAL_TYPE_OPTIONS,
    PurchaseOrderMaterialType
} from "./types";

export interface RawProductSelectorProps {
    id?: string;
    autoFocus?: boolean;
    rawMaterials: RawMaterial[];
    selectedProductId: string;
    parentProductId?: string;
    productName?: string;
    materialType?: PurchaseOrderMaterialType | "";
    disabled?: boolean;
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
    materialType = "",
    disabled = false,
    onSelect
}: RawProductSelectorProps) {
    const filteredMaterials = useMemo(() => {
        const productTypeId = PURCHASE_ORDER_MATERIAL_TYPE_OPTIONS.find(
            option => option.value === materialType
        )?.productTypeId;

        if (!productTypeId) return [];
        return rawMaterials.filter(material => Number(material.product_type) === productTypeId);
    }, [materialType, rawMaterials]);

    const options = useMemo(() => {
        return filteredMaterials.map(rm => {
            const uom = rm.unit_of_measurement?.unit_shortcut || "PCS";
            const cost = Number(rm.cost_per_unit || rm.estimated_unit_cost || 0);
            const sku = rm.product_code ? ` [${rm.product_code}]` : "";
            return {
                value: String(rm.product_id),
                label: `${rm.product_name}${sku} — (${uom} @ ₱${formatAmount(cost)})`
            };
        });
    }, [filteredMaterials]);

    const handleValueChange = (val: string) => {
        const selectedMaterial = filteredMaterials.find(rm => String(rm.product_id) === String(val));
        if (!selectedMaterial) return;

        const parentId = selectedMaterial.parent_id ? String(selectedMaterial.parent_id) : String(selectedMaterial.product_id);
        const parentMaterial = filteredMaterials.find(rm => String(rm.product_id) === parentId) || selectedMaterial;
        
        const siblings = filteredMaterials.filter(rm =>
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
            placeholder={materialType ? "Select raw product..." : "Select type first..."}
            disabled={disabled || !materialType}
            className="h-8 text-xs font-semibold w-full bg-background"
        />
    );
}
