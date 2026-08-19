export function sanitizePdfFilenamePart(value: string): string {
    return value.replace(/[<>:"/\\|?*]+/g, "_").trim() || "supplier";
}

export function buildProductPricingPdfSaveAsName(
    supplierIds: number[],
    suppliersById: Map<number, string>,
    date: Date = new Date(),
): string {
    const stamp = date.toISOString().split("T")[0];

    if (supplierIds.length === 0) {
        return `Product_Pricing_Matrix_${stamp}.pdf`;
    }

    if (supplierIds.length === 1) {
        const id = Number(supplierIds[0]);
        const name = suppliersById.get(id) ?? `Supplier_${id}`;
        const safeName = sanitizePdfFilenamePart(name);
        return `Product_Pricing_Matrix_${safeName}_${stamp}.pdf`;
    }

    return `Product_Pricing_Matrix_Multiple_Suppliers_${stamp}.pdf`;
}
