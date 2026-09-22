const LOT_TRANSFER_PRODUCT_TYPE_LABELS: Record<number, string> = {
    388: "Finished Goods",
    389: "Raw Materials",
    390: "Packaging Material"
};

function normalizeProductTypeName(value: string) {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
    if (normalized === "packaging items" || normalized === "packaging materials" || normalized === "packaging material") {
        return "Packaging Material";
    }
    return value.trim();
}

export function getLotTransferProductTypeLabel(productTypeId: number | null | undefined, productTypeName?: string | null) {
    const numericId = Number(productTypeId);
    if (Number.isSafeInteger(numericId) && numericId > 0 && LOT_TRANSFER_PRODUCT_TYPE_LABELS[numericId]) {
        return LOT_TRANSFER_PRODUCT_TYPE_LABELS[numericId];
    }

    const normalizedName = normalizeProductTypeName(productTypeName || "");
    return normalizedName || "Unclassified";
}
