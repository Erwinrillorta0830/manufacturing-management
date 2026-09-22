export type MaterialType = "raw_material" | "packaging" | "sub_assembly" | "finished_good";

export const MATERIAL_TYPE_OPTIONS: { value: MaterialType; label: string }[] = [
    { value: "raw_material", label: "Raw Material" },
    { value: "packaging", label: "Packaging Item" },
    { value: "sub_assembly", label: "Sub-assembly" },
    { value: "finished_good", label: "Finished Good" }
];

export function isMaterialType(value: unknown): value is MaterialType {
    return MATERIAL_TYPE_OPTIONS.some(option => option.value === value);
}

export function materialTypeFromProduct(
    productType: number | string | null | undefined,
    hasVersions: boolean | null | undefined
): MaterialType | null {
    const normalizedProductType = Number(productType);

    if (normalizedProductType === 389) return "raw_material";
    if (normalizedProductType === 390) return "packaging";
    if (normalizedProductType === 388) return hasVersions ? "sub_assembly" : "finished_good";
    return null;
}

export function isMaterialTypeCompatible(
    materialType: MaterialType,
    productType: number | string | null | undefined,
    hasVersions: boolean | null | undefined
): boolean {
    return materialTypeFromProduct(productType, hasVersions) === materialType;
}
