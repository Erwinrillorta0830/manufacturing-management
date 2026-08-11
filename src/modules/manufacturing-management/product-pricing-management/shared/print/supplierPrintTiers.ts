import type { PriceType } from "../../product-pricing/types";
import {
    buildMatrixTierKeys,
    LIST_TIER_KEY,
    priceTierKey,
    sortPriceTypes,
} from "../../product-pricing/utils/pivot";
import { sanitizePdfFilenamePart } from "./pdfFileNames";

export type SupplierPrintTierMode = "all" | "price" | "cost";

export function tiersForSupplierPrintMode(
    priceTypes: PriceType[],
    mode: SupplierPrintTierMode,
): string[] {
    if (mode === "cost") {
        return [LIST_TIER_KEY];
    }

    if (mode === "price") {
        return sortPriceTypes(priceTypes).map((pt) => priceTierKey(pt.price_type_id));
    }

    return buildMatrixTierKeys(priceTypes);
}

export function buildSupplierPrintFiltersText(args: {
    supplierName: string;
    exportModeLabel: string;
}): string {
    return `Supplier: ${args.supplierName} • Scope: Linked Only • Active Only • Export: ${args.exportModeLabel}`;
}

export function supplierPrintPdfOptions(args: {
    supplierName: string;
    tierMode: SupplierPrintTierMode;
}): {
    pdfTitle: string;
    blocksPerPage: number;
    pdfSaveAsName: string;
    defaultFontSize: number;
} {
    const stamp = new Date().toISOString().split("T")[0];
    const safeName = sanitizePdfFilenamePart(args.supplierName);

    if (args.tierMode === "cost") {
        return {
            pdfTitle: "Supplier List Cost Template",
            blocksPerPage: 4,
            pdfSaveAsName: `supplier-list-cost-${safeName}-${stamp}.pdf`,
            defaultFontSize: 5,
        };
    }

    return {
        pdfTitle: "Supplier Price Change Template",
        blocksPerPage: 4,
        pdfSaveAsName: `supplier-price-change-${safeName}-${stamp}.pdf`,
        defaultFontSize: 5,
    };
}
