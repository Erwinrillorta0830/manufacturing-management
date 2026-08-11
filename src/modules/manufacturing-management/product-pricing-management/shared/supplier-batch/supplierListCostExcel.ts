import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

import type { MatrixRow } from "../../product-pricing/types";
import {
    buildUnitColumns,
    flattenListCostMatrixRows,
    type FlatListCostProductRow,
    type UnitRef,
} from "./flattenPrintMatrix";
import {
    addSupplierBatchInstructionRows,
    isProposedColumnHeader,
    styleSupplierBatchWorksheet,
} from "./supplierBatchExcelStyles";

export const LIST_COST_EXCEL_TEMPLATE_VERSION = 1;
export const LIST_COST_GROUPED_UOM_TEMPLATE_VERSION = 2;

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
    COL_CURRENT_LIST_COST,
    COL_PROPOSED_LIST_COST,
] as const;

export type ListCostImportLine = {
    product_id: number;
    product_code: string | null;
    barcode: string | null;
    product_name: string;
    current_cost: number | null;
    proposed_cost: number;
};

export type ListCostPendingRequest = {
    product_id: number;
    proposed_cost: number | null;
};

export type ListCostExcelParseResult =
    | {
          ok: true;
          supplierId: number;
          supplierName: string;
          lines: ListCostImportLine[];
      }
    | { ok: false; errors: string[] };

function sanitizeFilenamePart(value: string) {
    return value.replace(/[<>:"/\\|?*]+/g, "_").trim() || "supplier";
}

function pendingNote(value: number | null | undefined) {
    const amount = value === null || value === undefined ? "" : ` Proposed value: ${value.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}.`;
    return `List cost already has a pending request.${amount}`;
}

function currentListCostHeader(unitLabel: string) {
    return `${COL_CURRENT_LIST_COST} (${unitLabel})`;
}

function proposedListCostHeader(unitLabel: string) {
    return `${COL_PROPOSED_LIST_COST} (${unitLabel})`;
}

export async function exportSupplierListCostExcel(args: {
    supplierId: number;
    supplierName: string;
    matrixRows: MatrixRow[];
    units?: UnitRef[];
    includeProposedColumns?: boolean;
    pendingCostRequests?: ListCostPendingRequest[];
}) {
    const {
        supplierId,
        supplierName,
        matrixRows,
        units,
        includeProposedColumns = true,
        pendingCostRequests = [],
    } = args;
    const unitColumns = buildUnitColumns(matrixRows, units);
    const pendingCostByProductId = new Map(
        pendingCostRequests.map((row) => [row.product_id, row.proposed_cost] as const),
    );
    const generatedAt = new Date();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("List Cost Batch");

    sheet.addRow([META_TEMPLATE_VERSION, LIST_COST_GROUPED_UOM_TEMPLATE_VERSION]);
    sheet.addRow([META_SUPPLIER_ID, supplierId]);
    sheet.addRow([META_SUPPLIER_NAME, supplierName]);
    sheet.addRow([META_GENERATED_AT, generatedAt.toISOString()]);
    sheet.addRow([]);
    const instructionStartRowNumber = addSupplierBatchInstructionRows(sheet, { includeProposedColumns });

    const headers = [
        ...IDENTITY_HEADERS.filter(
            (header) => header !== COL_UNIT_ID && header !== COL_CURRENT_LIST_COST && header !== COL_PROPOSED_LIST_COST,
        ),
        ...unitColumns.flatMap((unit) =>
            includeProposedColumns
                ? [currentListCostHeader(unit.label), proposedListCostHeader(unit.label)]
                : [currentListCostHeader(unit.label)],
        ),
    ];
    const headerRowNumber = sheet.rowCount + 1;
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    const dataStartRowNumber = sheet.rowCount + 1;
    const proposedColumnIndexes = headers
        .map((header, index) => (isProposedColumnHeader(header) ? index + 1 : null))
        .filter((index): index is number => index !== null);
    const pendingCellIndexes: Array<{ rowNumber: number; columnIndex: number; note?: string }> = [];

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
        for (const unit of unitColumns) {
            const variant = row.variantsByUnitId[unit.unitId];
            const productId = Number(variant?.product.product_id);
            const listTier = variant?.tiers.LIST;
            const current = listTier ?? variant?.product.cost_per_unit ?? null;
            values.push(variant && current != null ? Number(current) : null);
            if (includeProposedColumns) values.push(null);
            if (includeProposedColumns && variant && pendingCostByProductId.has(productId)) {
                pendingCellIndexes.push({
                    rowNumber,
                    columnIndex: headers.indexOf(proposedListCostHeader(unit.label)) + 1,
                    note: pendingNote(pendingCostByProductId.get(productId)),
                });
            }
        }
        sheet.addRow(values);
    });

    for (let columnIndex = 1; columnIndex <= headers.length; columnIndex += 1) {
        if (headers[columnIndex - 1].includes("List Cost (")) sheet.getColumn(columnIndex).numFmt = "#,##0.00";
    }

    const mappingSheet = workbook.addWorksheet(MAPPING_SHEET_NAME, { state: "veryHidden" });
    mappingSheet.addRow([...MAPPING_HEADERS]);
    for (const row of matrixRows) {
        for (const unit of unitColumns) {
            const variant = row.variantsByUnitId[unit.unitId];
            if (!variant) continue;
            mappingSheet.addRow([row.group_id, unit.unitId, variant.product.product_id, unit.label]);
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
        pendingCellIndexes,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const stamp = generatedAt.toISOString().slice(0, 10);
    saveAs(blob, `list-cost-batch-${sanitizeFilenamePart(supplierName)}-${stamp}.xlsx`);
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

function parseProposedValue(raw: unknown): { value: number | null; error: string | null } {
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

    return { value: parsed, error: null };
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

export async function parseSupplierListCostExcelImport(args: {
    file: File;
    expectedSupplierId: number;
    matrixRows: MatrixRow[];
}): Promise<ListCostExcelParseResult> {
    const { file, expectedSupplierId, matrixRows } = args;
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
        templateVersion !== LIST_COST_EXCEL_TEMPLATE_VERSION &&
        templateVersion !== LIST_COST_GROUPED_UOM_TEMPLATE_VERSION
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

    if (templateVersion === LIST_COST_GROUPED_UOM_TEMPLATE_VERSION) {
        const requiredHeaders = IDENTITY_HEADERS.filter(
            (header) => header !== COL_UNIT_ID && header !== COL_CURRENT_LIST_COST && header !== COL_PROPOSED_LIST_COST,
        );
        for (const required of requiredHeaders) {
            if (!headerIndex.has(required)) errors.push(`Missing required column: ${required}`);
        }
        const productMapping = readGroupedProductMapping(workbook);
        if (!productMapping) errors.push("Workbook is missing its product mapping worksheet.");

        const proposedColumns: Array<{ unitLabel: string; columnIndex: number }> = [];
        for (const [header, columnIndex] of headerIndex.entries()) {
            const unitLabel = groupedListCostUnitLabel(header);
            if (unitLabel) proposedColumns.push({ unitLabel, columnIndex });
        }
        if (proposedColumns.length === 0) errors.push("No proposed list cost columns were found in the workbook.");
        if (errors.length > 0 || !productMapping) return { ok: false, errors };

        const flatByProductId = new Map<number, FlatListCostProductRow>();
        for (const flat of flattenListCostMatrixRows(matrixRows)) flatByProductId.set(flat.product_id, flat);

        const lines: ListCostImportLine[] = [];
        let validProposedCount = 0;
        for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex];
            if (!Array.isArray(row) || row.every((cell) => String(cell ?? "").trim() === "")) continue;
            const groupId = Number(row[headerIndex.get(COL_GROUP_ID)!]);
            if (!Number.isFinite(groupId) || groupId <= 0) {
                errors.push(`Row ${rowIndex + 1}: invalid group ID.`);
                continue;
            }
            for (const column of proposedColumns) {
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
                validProposedCount += 1;
                lines.push({
                    product_id: mappedProduct.productId,
                    product_code: flat.product_code,
                    barcode: flat.barcode,
                    product_name: flat.product_name,
                    current_cost: flat.current_list_cost,
                    proposed_cost: parsed.value,
                });
            }
        }

        if (errors.length > 0) return { ok: false, errors };
        if (validProposedCount === 0) {
            return { ok: false, errors: ["No valid proposed list costs were found in the workbook."] };
        }
        return {
            ok: true,
            supplierId,
            supplierName: supplierName || `Supplier #${expectedSupplierId}`,
            lines,
        };
    }

    for (const required of IDENTITY_HEADERS) {
        if (!headerIndex.has(required)) {
            errors.push(`Missing required column: ${required}`);
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    const flatByProductId = new Map<number, FlatListCostProductRow>();
    for (const flat of flattenListCostMatrixRows(matrixRows)) {
        flatByProductId.set(flat.product_id, flat);
    }

    const lines: ListCostImportLine[] = [];
    let validProposedCount = 0;
    const proposedColIndex = headerIndex.get(COL_PROPOSED_LIST_COST)!;

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

        const parsed = parseProposedValue(row[proposedColIndex]);
        if (parsed.error) {
            errors.push(`Row ${rowIndex + 1}, Proposed List Cost: ${parsed.error}`);
            continue;
        }
        if (parsed.value === null) continue;

        validProposedCount += 1;
        lines.push({
            product_id: productId,
            product_code: flat.product_code,
            barcode: flat.barcode,
            product_name: flat.product_name,
            current_cost: flat.current_list_cost,
            proposed_cost: parsed.value,
        });
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    if (validProposedCount === 0) {
        return { ok: false, errors: ["No valid proposed list costs were found in the workbook."] };
    }

    return {
        ok: true,
        supplierId: Number.isFinite(supplierId) ? supplierId : expectedSupplierId,
        supplierName: supplierName || `Supplier #${expectedSupplierId}`,
        lines,
    };
}
