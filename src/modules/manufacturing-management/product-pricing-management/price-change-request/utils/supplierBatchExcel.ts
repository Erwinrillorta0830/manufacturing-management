import type { MatrixRow } from "../../product-pricing/types";
import { flattenPrintMatrixRows } from "../../shared/supplier-batch/flattenPrintMatrix";
import {
    parseSupplierBatchExcelImport as parseSupplierBatchExcelCore,
    type BatchExcelParseResult,
} from "../../shared/supplier-batch/supplierBatchExcel";
import type { PriceTypeOption, ProductSearchRow } from "../providers/pcrApi";
import type { BatchImportPrefill } from "../types";

export {
    BATCH_EXCEL_COMBINED_TEMPLATE_VERSION,
    BATCH_EXCEL_TEMPLATE_VERSION,
    exportSupplierBatchExcel,
} from "../../shared/supplier-batch/supplierBatchExcel";

export type BatchExcelImportResult =
    | { ok: true; prefill: BatchImportPrefill }
    | { ok: false; errors: string[] };

function cellKey(productId: number, priceTypeId: number) {
    return `${productId}:${priceTypeId}`;
}

function flatRowToProductSearchRow(
    row: ReturnType<typeof flattenPrintMatrixRows>[number],
): ProductSearchRow {
    return {
        product_id: row.product_id,
        product_name: row.product_name,
        product_code: row.product_code,
        barcode: row.barcode,
        parent_id: row.parent_id,
        __group_id: row.group_id,
        unit_of_measurement: row.unit_id,
    };
}

function toBatchImportPrefill(
    parsed: Extract<BatchExcelParseResult, { ok: true }>,
    matrixRows: MatrixRow[],
    priceTypes: PriceTypeOption[],
): BatchImportPrefill {
    const flatByProductId = new Map(
        flattenPrintMatrixRows(matrixRows, priceTypes).map((row) => [row.product_id, row]),
    );

    const productCatalog = new Map<number, ProductSearchRow>();
    const tierPriceMap = new Map<string, number | null>();
    const draftPrices = new Map<string, string>();
    const draftCosts = new Map<number, string>();
    const currentCostMap = new Map<number, number | null>();
    const importedProductIds: number[] = [];

    const trackProduct = (productId: number) => {
        if (!importedProductIds.includes(productId)) {
            importedProductIds.push(productId);
        }
    };

    for (const change of parsed.priceChanges) {
        draftPrices.set(cellKey(change.product_id, change.price_type_id), String(change.proposed_price));
        trackProduct(change.product_id);
    }

    for (const change of parsed.costChanges) {
        draftCosts.set(change.product_id, String(change.proposed_cost));
        trackProduct(change.product_id);
    }

    for (const productId of importedProductIds) {
        const flat = flatByProductId.get(productId);
        if (!flat) continue;

        productCatalog.set(productId, flatRowToProductSearchRow(flat));
        currentCostMap.set(productId, flat.current_list_cost);

        for (const priceType of priceTypes) {
            const current = flat.currentByPriceTypeId.get(priceType.price_type_id) ?? null;
            tierPriceMap.set(cellKey(productId, priceType.price_type_id), current);
        }
    }

    return {
        supplierId: parsed.supplierId,
        supplierName: parsed.supplierName,
        remarks: "Imported price change batch",
        productCatalog,
        tierPriceMap,
        draftPrices,
        draftCosts,
        currentCostMap,
        importedProductIds,
    };
}

export async function parseSupplierBatchExcelImport(args: {
    file: File;
    expectedSupplierId: number;
    priceTypes: PriceTypeOption[];
    matrixRows: MatrixRow[];
}): Promise<BatchExcelImportResult> {
    const parsed = await parseSupplierBatchExcelCore(args);
    if (!parsed.ok) return parsed;
    return {
        ok: true,
        prefill: toBatchImportPrefill(parsed, args.matrixRows, args.priceTypes),
    };
}
