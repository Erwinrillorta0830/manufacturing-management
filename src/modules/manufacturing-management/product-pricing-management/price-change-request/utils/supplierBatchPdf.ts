import { generatePricingMatrixPdf } from "../../product-pricing/utils/printPdf";
import { buildMatrixTierKeys } from "../../product-pricing/utils/pivot";
import type { MatrixRow, PriceType, Unit } from "../../product-pricing/types";
import type { PriceTypeOption, UnitOption } from "../providers/pcrApi";

function toPriceTypes(priceTypes: PriceTypeOption[]): PriceType[] {
    return priceTypes.map((priceType) => ({
        price_type_id: priceType.price_type_id,
        price_type_name: String(priceType.price_type_name ?? `#${priceType.price_type_id}`),
        sort: priceType.sort ?? null,
    }));
}

function toUnits(units: UnitOption[]): Unit[] {
    return units.map((unit) => ({
        unit_id: unit.unit_id,
        unit_name: unit.unit_name ?? null,
        unit_shortcut: unit.unit_shortcut ?? null,
        order: unit.order ?? null,
    }));
}

export function exportSupplierBatchPdf(args: {
    rows: MatrixRow[];
    priceTypes: PriceTypeOption[];
    units: UnitOption[];
    usedUnitIds: Set<number>;
    supplierName: string;
}) {
    const { rows, priceTypes, units, usedUnitIds, supplierName } = args;
    const mappedPriceTypes = toPriceTypes(priceTypes);
    const mappedUnits = toUnits(units);
    const tiers = buildMatrixTierKeys(mappedPriceTypes);
    const stamp = new Date().toISOString().split("T")[0];
    const safeName = supplierName.replace(/[<>:"/\\|?*]+/g, "_").trim() || "supplier";

    generatePricingMatrixPdf(rows, {
        layout: "table",
        paper: "a4",
        orientation: "landscape",
        fontSize: 5,
        compact: true,
        includeBarcode: true,
        blocksPerPage: 4,
        title: "Supplier Price Change Template",
        supplierNames: [supplierName],
        priceTypes: mappedPriceTypes,
        tiers,
        units: mappedUnits,
        usedUnitIds,
        saveAsName: `supplier-price-change-${safeName}-${stamp}.pdf`,
    });
}
