export interface DescriptionUom {
    unit_shortcut?: string | null;
    unit_name?: string | null;
}

function normalizeText(value: unknown): string {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function resolveUomLabel(uom: DescriptionUom | string | null | undefined): string {
    if (typeof uom === "string") return normalizeText(uom);
    return normalizeText(uom?.unit_shortcut || uom?.unit_name);
}

export function formatRawMaterialDescription(
    productName: unknown,
    uom: DescriptionUom | string | null | undefined
): string {
    const normalizedProductName = normalizeText(productName);
    const normalizedUom = resolveUomLabel(uom);
    if (!normalizedProductName || !normalizedUom) return "";

    return `${normalizedProductName} - ${normalizedUom}`.toUpperCase();
}
