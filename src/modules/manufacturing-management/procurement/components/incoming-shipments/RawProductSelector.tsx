import React, { useMemo } from "react";
import { RawMaterial } from "../../types";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
    PURCHASE_ORDER_MATERIAL_TYPE_OPTIONS,
    PurchaseOrderMaterialType
} from "./types";
import { normalizeProductRelationId, resolveProductParentId } from "../../product-relation";

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
            parent_product_id: number;
            unit_shortcut: string;
            cost_per_unit: number;
            unit_of_measurement_count?: number;
        }>;
    }) => void;
}

function familyIdForMaterial(material: RawMaterial): number | null {
    return resolveProductParentId(material) ?? normalizeProductRelationId(material.product_id);
}

function familyMembers(materials: RawMaterial[], familyId: number): RawMaterial[] {
    return materials.filter(material => {
        const productId = normalizeProductRelationId(material.product_id);
        const parentId = normalizeProductRelationId(material.parent_id);
        return productId === familyId || parentId === familyId;
    });
}

function primaryPurchaseMaterial(members: RawMaterial[], familyId: number): RawMaterial | undefined {
    return members.find(material => Number(material.product_id) === familyId) || members[0];
}

export function RawProductSelector({
    rawMaterials,
    selectedProductId,
    parentProductId,
    materialType = "",
    disabled = false,
    onSelect
}: RawProductSelectorProps) {
    const filteredMaterials = useMemo(() => {
        const productTypeId = PURCHASE_ORDER_MATERIAL_TYPE_OPTIONS.find(
            option => option.value === materialType
        )?.productTypeId;

        if (!productTypeId) return [];
        return rawMaterials.filter(material => {
            if (Number(material.product_type) === productTypeId) return true;
            const parentId = normalizeProductRelationId(material.parent_id);
            const parent = parentId
                ? rawMaterials.find(candidate => Number(candidate.product_id) === parentId)
                : null;
            return Number(parent?.product_type) === productTypeId;
        });
    }, [materialType, rawMaterials]);

    const options = useMemo(() => {
        const families = new Map<number, RawMaterial[]>();
        for (const material of filteredMaterials) {
            const familyId = familyIdForMaterial(material);
            if (!familyId) continue;
            const members = families.get(familyId) || [];
            members.push(material);
            families.set(familyId, members);
        }

        return [...families.entries()]
            .map(([familyId, members]) => {
                const parent = primaryPurchaseMaterial(members, familyId);
                return {
                    value: String(familyId),
                    label: parent?.product_name || members[0]?.product_name || `Product #${familyId}`
                };
            })
            .sort((left, right) => left.label.localeCompare(right.label));
    }, [filteredMaterials]);

    const selectedFamilyId = useMemo(() => {
        if (parentProductId) return String(parentProductId);
        const selected = filteredMaterials.find(material => String(material.product_id) === String(selectedProductId));
        if (!selected) return String(selectedProductId || "");
        return String(familyIdForMaterial(selected) || selected.product_id);
    }, [filteredMaterials, parentProductId, selectedProductId]);

    const handleValueChange = (val: string) => {
        const familyId = Number(val);
        if (!Number.isSafeInteger(familyId) || familyId <= 0) return;

        const members = familyMembers(filteredMaterials, familyId);
        const defaultMaterial = primaryPurchaseMaterial(members, familyId);
        if (!defaultMaterial) return;

        const parentMaterial = members.find(material => Number(material.product_id) === familyId) || defaultMaterial;
        const cost = Number(defaultMaterial.cost_per_unit || defaultMaterial.estimated_unit_cost || 0);

        onSelect({
            parent_product_id: String(familyId),
            product_id: String(defaultMaterial.product_id),
            product_name: parentMaterial.product_name || defaultMaterial.product_name,
            product_code: defaultMaterial.product_code || "",
            selected_uom: defaultMaterial.unit_of_measurement?.unit_shortcut || "PCS",
            base_unit_cost_php: String(cost),
            uom_options: members.map(member => ({
                product_id: member.product_id,
                parent_product_id: resolveProductParentId(member) || member.product_id,
                unit_shortcut: member.unit_of_measurement?.unit_shortcut || "PCS",
                cost_per_unit: member.cost_per_unit || member.estimated_unit_cost || 0,
                unit_of_measurement_count: member.unit_of_measurement_count || 1
            }))
        });
    };

    return (
        <SearchableSelect
            options={options}
            value={selectedFamilyId}
            onValueChange={handleValueChange}
            placeholder={materialType ? "Select product..." : "Select type first..."}
            disabled={disabled || !materialType}
            className="h-8 text-xs font-semibold w-full bg-background"
        />
    );
}
