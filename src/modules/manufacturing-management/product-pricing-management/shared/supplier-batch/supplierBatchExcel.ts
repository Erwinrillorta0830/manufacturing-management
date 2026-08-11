import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

import type { MatrixRow } from "../../product-pricing/types";
import {
    buildUnitColumns,
    flattenPrintMatrixRows,
    type FlatSupplierProductRow,
    type PriceTypeRef,
    type UnitRef,
} from "./flattenPrintMatrix";
import {
    addSupplierBatchInstructionRows,
    isProposedColumnHeader,
    styleSupplierBatchWorksheet,
} from "./supplierBatchExcelStyles";
import {
    COST_MAX_DECIMAL_PLACES,
    PRICE_MAX_DECIMAL_PLACES,
    hasAtMostDecimalPlaces,
} from "../pricePrecision";

export const BATCH_EXCEL_TEMPLATE_VERSION = 1;
export const BATCH_EXCEL_COMBINED_TEMPLATE_VERSION = 2;
export const BATCH_EXCEL_GROUPED_UOM_TEMPLATE_VERSION = 3;

const META_TEMPLATE_VERSION = "Template Version";
const META_SUPPLIER_ID = "Supplier ID";
const META_SUPPLIER_NAME = "Supplier Name";
const META_GENERATED_AT = "Generated At";

const COL_PRODUCT_ID = "Product ID";
const COL_PRODUCT_CODE = "Product Code";
const COL_BARCODE = "Barcode";
const COL_PRODUCT_NAME = "Product Name";
const COL_GROUP_ID = "Group ID";
const COL_PARENT_ID = "Parent ID";
const COL_UNIT_ID = "Unit ID";
const COL_UNIT_OF_MEASUREMENT = "Unit of Measurement";
const COL_CURRENT_LIST_COST = "Current List Cost";
const COL_PROPOSED_LIST_COST = "Proposed List Cost";
const PENDING_MARKER = "Pending";
const MAPPING_SHEET_NAME = "__TemplateMapping";
const MAPPING_HEADERS = [COL_GROUP_ID, COL_UNIT_ID, COL_PRODUCT_ID, COL_UNIT_OF_MEASUREMENT] as const;

const IDENTITY_HEADERS = [
    COL_PRODUCT_ID,
    COL_PRODUCT_CODE,
    COL_BARCODE,
    COL_PRODUCT_NAME,
    COL_GROUP_ID,
    COL_PARENT_ID,
    COL_UNIT_ID,
] as const;

export type SupplierBatchPriceChange = {
    product_id: number;
    price_type_id: number;
    proposed_price: number;
    product_name: string;
    product_code: string | null;
    current_price: number | null;
};

export type SupplierBatchCostChange = {
    product_id: number;
    proposed_cost: number;
    product_name: string;
    product_code: string | null;
    current_cost: number | null;
};

export type SupplierBatchPendingPrice = {
    product_id: number;
    price_type_id: number;
    proposed_price: number | null;
};

export type SupplierBatchPendingCost = {
    product_id: number;
    proposed_cost: number | null;
};

export type BatchExcelParseResult =
    | {
          ok: true;
          supplierId: number;
          supplierName: string;
          priceChanges: SupplierBatchPriceChange[];
          costChanges: SupplierBatchCostChange[];
      }
    | { ok: false; errors: string[] };

function sortPriceTypes(priceTypes: PriceTypeRef[]) {
    return [...priceTypes].sort((a, b) => {
        const aSort = Number(a.sort ?? Number.MAX_SAFE_INTEGER);
        const bSort = Number(b.sort ?? Number.MAX_SAFE_INTEGER);
        return aSort - bSort || String(a.price_type_name ?? "").localeCompare(String(b.price_type_name ?? ""));
    });
}

function sanitizeFilenamePart(value: string) {
    return value.replace(/[<>:"/\\|?*]+/g, "_").trim() || "supplier";
}

function pendingNote(label: string, value: number | null | undefined, maxDecimalPlaces = COST_MAX_DECIMAL_PLACES) {
    const amount = value === null || value === undefined ? "" : ` Proposed value: ${value.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: maxDecimalPlaces,
    })}.`;
    return `${label} already has a pending request.${amount}`;
}

function priceCurrentHeader(priceType: PriceTypeRef, unitLabel: string) {
    return `Price ${String(priceType.price_type_name ?? `#${priceType.price_type_id}`).trim()} Current (${unitLabel})`;
}

function priceProposedHeader(priceType: PriceTypeRef, unitLabel: string) {
    return `Price ${String(priceType.price_type_name ?? `#${priceType.price_type_id}`).trim()} Proposed (${unitLabel})`;
}

function currentListCostHeader(unitLabel: string) {
    return `${COL_CURRENT_LIST_COST} (${unitLabel})`;
}

function proposedListCostHeader(unitLabel: string) {
    return `${COL_PROPOSED_LIST_COST} (${unitLabel})`;
}

function hasCurrentValue(value: unknown): boolean {
    return value !== null && value !== undefined && String(value).trim() !== "";
}

function unavailableProposedValueMessage(currentHeader: string) {
    return `Cannot enter a proposed value because ${currentHeader} is empty.`;
}

export async function exportSupplierBatchExcel(args: {
    supplierId: number;
    supplierName: string;
    matrixRows: MatrixRow[];
    priceTypes: PriceTypeRef[];
    units?: UnitRef[];
    filenamePrefix?: string;
    includeListCost?: boolean;
    includeProposedColumns?: boolean;
    pendingPriceRequests?: SupplierBatchPendingPrice[];
    pendingCostRequests?: SupplierBatchPendingCost[];
}) {
    const {
        supplierId,
        supplierName,
        matrixRows,
        priceTypes,
        units,
        filenamePrefix = "price-change-batch",
        includeListCost = false,
        includeProposedColumns = true,
        pendingPriceRequests = [],
        pendingCostRequests = [],
    } = args;
    const sortedPriceTypes = sortPriceTypes(priceTypes);
    const unitColumns = buildUnitColumns(matrixRows, units);
    const pendingPriceByKey = new Map<string, number | null>(
        pendingPriceRequests.map((row) => [`${row.product_id}:${row.price_type_id}`, row.proposed_price] as const),
    );
    const pendingCostByProductId = new Map(
        pendingCostRequests.map((row) => [row.product_id, row.proposed_cost] as const),
    );
    const generatedAt = new Date();
    const templateVersion = BATCH_EXCEL_GROUPED_UOM_TEMPLATE_VERSION;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Price Change Batch");

    sheet.addRow([META_TEMPLATE_VERSION, templateVersion]);
    sheet.addRow([META_SUPPLIER_ID, supplierId]);
    sheet.addRow([META_SUPPLIER_NAME, supplierName]);
    sheet.addRow([META_GENERATED_AT, generatedAt.toISOString()]);
    sheet.addRow([]);
    const instructionStartRowNumber = addSupplierBatchInstructionRows(sheet, { includeProposedColumns });

    const headers = [
        ...IDENTITY_HEADERS.filter((header) => header !== COL_UNIT_ID),
        ...(includeListCost
            ? unitColumns.flatMap((unit) =>
                  includeProposedColumns
                      ? [currentListCostHeader(unit.label), proposedListCostHeader(unit.label)]
                      : [currentListCostHeader(unit.label)],
              )
            : []),
        ...sortedPriceTypes.flatMap((priceType) =>
            unitColumns.flatMap((unit) =>
                includeProposedColumns
                    ? [priceCurrentHeader(priceType, unit.label), priceProposedHeader(priceType, unit.label)]
                    : [priceCurrentHeader(priceType, unit.label)],
            ),
        ),
    ];
    const proposedColumnIndexes = headers
        .map((header, index) => (isProposedColumnHeader(header) ? index + 1 : null))
        .filter((index): index is number => index !== null);
    const headerRowNumber = sheet.rowCount + 1;
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    const dataStartRowNumber = sheet.rowCount + 1;
    const pendingCellIndexes: Array<{ rowNumber: number; columnIndex: number; note?: string }> = [];
    const editableProposedCellIndexes: Array<{ rowNumber: number; columnIndex: number }> = [];
    const disabledProposedCellIndexes: Array<{ rowNumber: number; columnIndex: number; note: string }> = [];

    const registerProposedCell = (args: {
        rowNumber: number;
        columnIndex: number;
        currentValue: unknown;
        currentHeader: string;
        pending: boolean;
    }) => {
        if (!hasCurrentValue(args.currentValue) && !args.pending) {
            disabledProposedCellIndexes.push({
                rowNumber: args.rowNumber,
                columnIndex: args.columnIndex,
                note: unavailableProposedValueMessage(args.currentHeader),
            });
            return;
        }

        if (hasCurrentValue(args.currentValue) && !args.pending) {
            editableProposedCellIndexes.push({
                rowNumber: args.rowNumber,
                columnIndex: args.columnIndex,
            });
        }
    };

    matrixRows.forEach((row, rowIndex) => {
        const rowNumber = dataStartRowNumber + rowIndex;
        const display = row.display;
        const values: Array<string | number | null> = [
            display.product_id,
            display.product_code ?? "",
            display.barcode ?? "",
            display.product_name,
            row.group_id,
            display.parent_id ?? "",
        ];

        if (includeListCost) {
            for (const unit of unitColumns) {
                const variant = row.variantsByUnitId[unit.unitId];
                const productId = Number(variant?.product.product_id);
                const listTier = variant?.tiers.LIST;
                const current = listTier ?? variant?.product.cost_per_unit ?? null;
                const currentValue = variant && current != null ? Number(current) : null;
                values.push(currentValue);
                if (includeProposedColumns) {
                    const proposedHeader = proposedListCostHeader(unit.label);
                    const currentHeader = currentListCostHeader(unit.label);
                    const proposedColumnIndex = headers.indexOf(proposedHeader) + 1;
                    const pending = Boolean(variant && pendingCostByProductId.has(productId));
                    values.push(null);
                    registerProposedCell({
                        rowNumber,
                        columnIndex: proposedColumnIndex,
                        currentValue,
                        currentHeader,
                        pending,
                    });
                    if (pending) {
                        pendingCellIndexes.push({
                            rowNumber,
                            columnIndex: proposedColumnIndex,
                            note: pendingNote("List cost", pendingCostByProductId.get(productId)),
                        });
                    }
                }
            }
        }

        for (const priceType of sortedPriceTypes) {
            for (const unit of unitColumns) {
                const variant = row.variantsByUnitId[unit.unitId];
                const productId = Number(variant?.product.product_id);
                const current = variant?.tiers[String(priceType.price_type_id)] ?? null;
                const currentValue = variant && current != null ? Number(current) : null;
                values.push(currentValue);
                if (includeProposedColumns) {
                    const proposedHeader = priceProposedHeader(priceType, unit.label);
                    const currentHeader = priceCurrentHeader(priceType, unit.label);
                    const proposedColumnIndex = headers.indexOf(proposedHeader) + 1;
                    const key = `${productId}:${priceType.price_type_id}`;
                    const pending = Boolean(variant && pendingPriceByKey.has(key));
                    values.push(null);
                    registerProposedCell({
                        rowNumber,
                        columnIndex: proposedColumnIndex,
                        currentValue,
                        currentHeader,
                        pending,
                    });
                    if (pending) {
                        pendingCellIndexes.push({
                            rowNumber,
                            columnIndex: proposedColumnIndex,
                            note: pendingNote(
                                `${priceType.price_type_name || `#${priceType.price_type_id}`} price`,
                                pendingPriceByKey.get(key),
                                PRICE_MAX_DECIMAL_PLACES,
                            ),
                        });
                    }
                }
            }
        }

        sheet.addRow(values);
    });

    for (let columnIndex = 1; columnIndex <= headers.length; columnIndex += 1) {
        if (headers[columnIndex - 1].includes("Current (") || headers[columnIndex - 1].includes("Proposed (")) {
            const header = headers[columnIndex - 1];
            sheet.getColumn(columnIndex).numFmt = header.includes("List Cost (") ? "#,##0.00" : "#,##0.00##";
        }
    }

    const mappingSheet = workbook.addWorksheet(MAPPING_SHEET_NAME, { state: "veryHidden" });
    mappingSheet.addRow([...MAPPING_HEADERS]);
    for (const row of matrixRows) {
        for (const unit of unitColumns) {
            const variant = row.variantsByUnitId[unit.unitId];
            if (!variant) continue;
            mappingSheet.addRow([
                row.group_id,
                unit.unitId,
                variant.product.product_id,
                unit.label,
            ]);
        }
    }

    sheet.columns.forEach((column) => {
        column.width = 18;
    });
    sheet.getColumn(4).width = 36;
    styleSupplierBatchWorksheet({
        sheet,
        instructionStartRowNumber,
        headerRowNumber,
        totalColumns: headers.length,
        dataStartRowNumber,
        proposedColumnIndexes,
        editableProposedCellIndexes,
        disabledProposedCellIndexes,
        pendingCellIndexes,
    });

    if (includeProposedColumns) {
        await sheet.protect("", {
            selectLockedCells: false,
            selectUnlockedCells: true,
            formatCells: false,
            formatColumns: false,
            formatRows: false,
            insertColumns: false,
            insertRows: false,
            insertHyperlinks: false,
            deleteColumns: false,
            deleteRows: false,
            sort: false,
            autoFilter: true,
            pivotTables: false,
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const stamp = generatedAt.toISOString().slice(0, 10);
    saveAs(blob, `${filenamePrefix}-${sanitizeFilenamePart(supplierName)}-${stamp}.xlsx`);
}

function readMetaValue(rows: unknown[][], label: string): string {
    for (const row of rows) {
        if (!Array.isArray(row)) continue;
        if (String(row[0] ?? "").trim() === label) {
            return String(row[1] ?? "").trim();
        }
    }
    return "";
}

function findHeaderRowIndex(rows: unknown[][]): number {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const row = rows[i];
        if (!Array.isArray(row)) continue;
        if (row.some((cell) => String(cell ?? "").trim() === COL_PRODUCT_ID)) {
            return i;
        }
    }
    return -1;
}

function parseProposedValue(
    raw: unknown,
    maxDecimalPlaces = COST_MAX_DECIMAL_PLACES,
): { value: number | null; error: string | null } {
    if (raw === null || raw === undefined || raw === "") {
        return { value: null, error: null };
    }

    const text = String(raw).trim();
    if (!text) return { value: null, error: null };
    if (text.toLowerCase() === PENDING_MARKER.toLowerCase()) return { value: null, error: null };

    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
        return { value: null, error: "Invalid number" };
    }
    if (parsed < 0) {
        return { value: null, error: "Must be 0 or higher" };
    }
    if (!hasAtMostDecimalPlaces(text, maxDecimalPlaces)) {
        return { value: null, error: `Use at most ${maxDecimalPlaces} decimal places` };
    }

    return { value: parsed, error: null };
}

function resolvePriceTypeFromProposedHeader(
    header: string,
    priceTypes: PriceTypeRef[],
): PriceTypeRef | null {
    const trimmed = header.trim();
    if (!trimmed.endsWith(" Proposed")) return null;
    const label = trimmed.slice(0, -" Proposed".length).trim();
    if (!label) return null;

    const sorted = [...priceTypes].sort(
        (a, b) =>
            String(b.price_type_name ?? "").length - String(a.price_type_name ?? "").length,
    );

    for (const priceType of sorted) {
        const name = String(priceType.price_type_name ?? "").trim();
        if (name && label === name) return priceType;
        if (label === `#${priceType.price_type_id}`) return priceType;
    }

    return null;
}

function resolveGroupedPriceHeader(header: string, priceTypes: PriceTypeRef[]) {
    const match = /^Price (.+) Proposed \((.+)\)$/.exec(header.trim());
    if (!match) return null;
    const [, priceTypeLabel, unitLabel] = match;
    const priceType = priceTypes.find((candidate) => {
        const label = String(candidate.price_type_name ?? `#${candidate.price_type_id}`).trim();
        return label === priceTypeLabel;
    });
    return priceType ? { priceType, unitLabel } : null;
}

function groupedListCostUnitLabel(header: string) {
    const match = /^Proposed List Cost \((.+)\)$/.exec(header.trim());
    return match?.[1] ?? null;
}

function readGroupedProductMapping(workbook: XLSX.WorkBook) {
    const mappingSheet = workbook.Sheets[MAPPING_SHEET_NAME];
    if (!mappingSheet) return null;
    const mappingRows = XLSX.utils.sheet_to_json<unknown[]>(mappingSheet, {
        header: 1,
        defval: "",
    }) as unknown[][];
    const mapping = new Map<string, { productId: number; unitId: number }>();
    for (const row of mappingRows.slice(1)) {
        const groupId = Number(row[0]);
        const unitId = Number(row[1]);
        const productId = Number(row[2]);
        const unitLabel = String(row[3] ?? "").trim();
        if (groupId > 0 && Number.isFinite(unitId) && unitId >= 0 && productId > 0 && unitLabel) {
            mapping.set(`${groupId}:${unitLabel}`, { productId, unitId });
        }
    }
    return mapping;
}

export async function parseSupplierBatchExcelImport(args: {
    file: File;
    expectedSupplierId: number;
    priceTypes: PriceTypeRef[];
    matrixRows: MatrixRow[];
}): Promise<BatchExcelParseResult> {
    const { file, expectedSupplierId, priceTypes, matrixRows } = args;
    const errors: string[] = [];

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
        return { ok: false, errors: ["Workbook has no worksheets."] };
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];

    const templateVersion = Number(readMetaValue(rows, META_TEMPLATE_VERSION));
    if (
        templateVersion !== BATCH_EXCEL_TEMPLATE_VERSION &&
        templateVersion !== BATCH_EXCEL_COMBINED_TEMPLATE_VERSION &&
        templateVersion !== BATCH_EXCEL_GROUPED_UOM_TEMPLATE_VERSION
    ) {
        errors.push(`Unsupported template version (${String(templateVersion || "missing")}).`);
    }

    const supplierId = Number(readMetaValue(rows, META_SUPPLIER_ID));
    if (!Number.isFinite(supplierId) || supplierId <= 0) {
        errors.push("Workbook is missing a valid supplier ID.");
    } else if (supplierId !== expectedSupplierId) {
        errors.push("Workbook supplier does not match the selected supplier filter.");
    }

    const supplierName = readMetaValue(rows, META_SUPPLIER_NAME);

    const headerRowIndex = findHeaderRowIndex(rows);
    if (headerRowIndex < 0) {
        errors.push("Could not find the product header row in the workbook.");
        return { ok: false, errors };
    }

    const headerCells = (rows[headerRowIndex] ?? []).map((cell) => String(cell ?? "").trim());
    const headerIndex = new Map<string, number>();
    headerCells.forEach((header, index) => {
        if (header) headerIndex.set(header, index);
    });

    if (templateVersion === BATCH_EXCEL_GROUPED_UOM_TEMPLATE_VERSION) {
        const requiredHeaders = IDENTITY_HEADERS.filter((header) => header !== COL_UNIT_ID);
        for (const required of requiredHeaders) {
            if (!headerIndex.has(required)) errors.push(`Missing required column: ${required}`);
        }

        const productMapping = readGroupedProductMapping(workbook);
        if (!productMapping) errors.push("Workbook is missing its product mapping worksheet.");

        const groupedPriceColumns: Array<{
            priceType: PriceTypeRef;
            unitLabel: string;
            columnIndex: number;
        }> = [];
        const groupedCostColumns: Array<{ unitLabel: string; columnIndex: number }> = [];
        for (const [header, columnIndex] of headerIndex.entries()) {
            const priceHeader = resolveGroupedPriceHeader(header, priceTypes);
            if (priceHeader) groupedPriceColumns.push({ ...priceHeader, columnIndex });
            const costUnitLabel = groupedListCostUnitLabel(header);
            if (costUnitLabel) groupedCostColumns.push({ unitLabel: costUnitLabel, columnIndex });
        }
        if (groupedPriceColumns.length === 0 && groupedCostColumns.length === 0) {
            errors.push("No proposed price or list cost columns were found in the workbook.");
        }
        if (errors.length > 0 || !productMapping) return { ok: false, errors };

        const flatByProductId = new Map<number, FlatSupplierProductRow>();
        for (const flat of flattenPrintMatrixRows(matrixRows, priceTypes)) {
            flatByProductId.set(flat.product_id, flat);
        }

        const priceChanges: SupplierBatchPriceChange[] = [];
        const costChanges: SupplierBatchCostChange[] = [];
        let validProposedCount = 0;

        for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex];
            if (!Array.isArray(row) || row.every((cell) => String(cell ?? "").trim() === "")) continue;
            const groupId = Number(row[headerIndex.get(COL_GROUP_ID)!]);
            if (!Number.isFinite(groupId) || groupId <= 0) {
                errors.push(`Row ${rowIndex + 1}: invalid group ID.`);
                continue;
            }

            for (const column of groupedCostColumns) {
                const parsed = parseProposedValue(row[column.columnIndex]);
                if (parsed.error) {
                    errors.push(`Row ${rowIndex + 1}, ${proposedListCostHeader(column.unitLabel)}: ${parsed.error}`);
                    continue;
                }
                if (parsed.value === null) continue;
                const mappedProduct = productMapping.get(`${groupId}:${column.unitLabel}`);
                const flat = mappedProduct ? flatByProductId.get(mappedProduct.productId) : null;
                if (
                    !mappedProduct ||
                    !flat ||
                    flat.group_id !== groupId ||
                    Number(flat.unit_id ?? 0) !== mappedProduct.unitId
                ) {
                    errors.push(`Row ${rowIndex + 1}: ${column.unitLabel} is not linked to this product group.`);
                    continue;
                }
                if (!hasCurrentValue(flat.current_list_cost)) {
                    errors.push(
                        `Row ${rowIndex + 1}, ${proposedListCostHeader(column.unitLabel)}: ${unavailableProposedValueMessage(
                            currentListCostHeader(column.unitLabel),
                        )}`,
                    );
                    continue;
                }
                validProposedCount += 1;
                costChanges.push({
                    product_id: mappedProduct.productId,
                    proposed_cost: parsed.value,
                    product_name: flat.product_name,
                    product_code: flat.product_code,
                    current_cost: flat.current_list_cost,
                });
            }

            for (const column of groupedPriceColumns) {
                const parsed = parseProposedValue(row[column.columnIndex], PRICE_MAX_DECIMAL_PLACES);
                if (parsed.error) {
                    errors.push(`Row ${rowIndex + 1}, ${priceProposedHeader(column.priceType, column.unitLabel)}: ${parsed.error}`);
                    continue;
                }
                if (parsed.value === null) continue;
                const mappedProduct = productMapping.get(`${groupId}:${column.unitLabel}`);
                const flat = mappedProduct ? flatByProductId.get(mappedProduct.productId) : null;
                if (
                    !mappedProduct ||
                    !flat ||
                    flat.group_id !== groupId ||
                    Number(flat.unit_id ?? 0) !== mappedProduct.unitId
                ) {
                    errors.push(`Row ${rowIndex + 1}: ${column.unitLabel} is not linked to this product group.`);
                    continue;
                }
                const current = flat.currentByPriceTypeId.get(column.priceType.price_type_id) ?? null;
                if (!hasCurrentValue(current)) {
                    const currentHeader = priceCurrentHeader(column.priceType, column.unitLabel);
                    const proposedHeader = priceProposedHeader(column.priceType, column.unitLabel);
                    errors.push(
                        `Row ${rowIndex + 1}, ${proposedHeader}: ${unavailableProposedValueMessage(currentHeader)}`,
                    );
                    continue;
                }
                validProposedCount += 1;
                priceChanges.push({
                    product_id: mappedProduct.productId,
                    price_type_id: column.priceType.price_type_id,
                    proposed_price: parsed.value,
                    product_name: flat.product_name,
                    product_code: flat.product_code,
                    current_price: current,
                });
            }
        }

        if (errors.length > 0) return { ok: false, errors };
        if (validProposedCount === 0) {
            return { ok: false, errors: ["No valid proposed prices or list costs were found in the workbook."] };
        }
        return {
            ok: true,
            supplierId,
            supplierName: supplierName || `Supplier #${expectedSupplierId}`,
            priceChanges,
            costChanges,
        };
    }

    for (const required of IDENTITY_HEADERS) {
        if (!headerIndex.has(required)) {
            errors.push(`Missing required column: ${required}`);
        }
    }

    const proposedColumns: Array<{ priceType: PriceTypeRef; columnIndex: number }> = [];
    for (const [header, columnIndex] of headerIndex.entries()) {
        const priceType = resolvePriceTypeFromProposedHeader(header, priceTypes);
        if (priceType) {
            proposedColumns.push({ priceType, columnIndex });
        }
    }

    const hasListCostColumn = headerIndex.has(COL_PROPOSED_LIST_COST);

    if (proposedColumns.length === 0 && !hasListCostColumn) {
        errors.push("No proposed price or list cost columns were found in the workbook.");
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    const flatByProductId = new Map<number, FlatSupplierProductRow>();
    for (const flat of flattenPrintMatrixRows(matrixRows, priceTypes)) {
        flatByProductId.set(flat.product_id, flat);
    }

    const priceChanges: SupplierBatchPriceChange[] = [];
    const costChanges: SupplierBatchCostChange[] = [];
    let validProposedCount = 0;
    const proposedListCostColIndex = hasListCostColumn
        ? headerIndex.get(COL_PROPOSED_LIST_COST)
        : undefined;

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        if (!Array.isArray(row) || row.every((cell) => String(cell ?? "").trim() === "")) {
            continue;
        }

        const productId = Number(row[headerIndex.get(COL_PRODUCT_ID)!]);
        if (!Number.isFinite(productId) || productId <= 0) {
            errors.push(`Row ${rowIndex + 1}: invalid product ID.`);
            continue;
        }

        const flat = flatByProductId.get(productId);
        if (!flat) {
            errors.push(`Row ${rowIndex + 1}: product #${productId} is not linked to the selected supplier.`);
            continue;
        }

        if (proposedListCostColIndex !== undefined) {
            const parsedCost = parseProposedValue(row[proposedListCostColIndex]);
            if (parsedCost.error) {
                errors.push(`Row ${rowIndex + 1}, Proposed List Cost: ${parsedCost.error}`);
            } else if (parsedCost.value !== null) {
                if (!hasCurrentValue(flat.current_list_cost)) {
                    errors.push(
                        `Row ${rowIndex + 1}, ${COL_PROPOSED_LIST_COST}: ${unavailableProposedValueMessage(COL_CURRENT_LIST_COST)}`,
                    );
                } else {
                    validProposedCount += 1;
                    costChanges.push({
                        product_id: productId,
                        proposed_cost: parsedCost.value,
                        product_name: flat.product_name,
                        product_code: flat.product_code,
                        current_cost: flat.current_list_cost,
                    });
                }
            }
        }

        for (const { priceType, columnIndex } of proposedColumns) {
            const parsed = parseProposedValue(row[columnIndex], PRICE_MAX_DECIMAL_PLACES);
            if (parsed.error) {
                errors.push(
                    `Row ${rowIndex + 1}, ${priceType.price_type_name ?? priceType.price_type_id}: ${parsed.error}`,
                );
                continue;
            }
            if (parsed.value === null) continue;

            const current = flat.currentByPriceTypeId.get(priceType.price_type_id) ?? null;
            if (!hasCurrentValue(current)) {
                const proposedHeader = `${String(priceType.price_type_name ?? `#${priceType.price_type_id}`).trim()} Proposed`;
                const currentHeader = `${String(priceType.price_type_name ?? `#${priceType.price_type_id}`).trim()} Current`;
                errors.push(
                    `Row ${rowIndex + 1}, ${proposedHeader}: ${unavailableProposedValueMessage(currentHeader)}`,
                );
                continue;
            }

            validProposedCount += 1;
            priceChanges.push({
                product_id: productId,
                price_type_id: priceType.price_type_id,
                proposed_price: parsed.value,
                product_name: flat.product_name,
                product_code: flat.product_code,
                current_price: current,
            });
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    if (validProposedCount === 0) {
        return { ok: false, errors: ["No valid proposed prices or list costs were found in the workbook."] };
    }

    return {
        ok: true,
        supplierId: Number.isFinite(supplierId) ? supplierId : expectedSupplierId,
        supplierName: supplierName || `Supplier #${expectedSupplierId}`,
        priceChanges,
        costChanges,
    };
}
