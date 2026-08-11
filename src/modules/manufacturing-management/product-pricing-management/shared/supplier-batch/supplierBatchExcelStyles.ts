import ExcelJS from "exceljs";

const BORDER_COLOR = "FFD1D5DB";
const HEADER_FILL = "FF334155";
const BODY_FILL = "FFF8FAFC";
const BODY_ALT_FILL = "FFFFFFFF";
const META_LABEL_COLOR = "FF64748B";
const PROPOSED_HEADER_FILL = "FF047857";
const PROPOSED_FILL = "FFECFDF5";
const PROPOSED_ALT_FILL = "FFD1FAE5";
const DISABLED_PROPOSED_FILL = "FFE5E7EB";
const DISABLED_PROPOSED_FONT = "FF6B7280";
const INSTRUCTION_FILL = "FFF8FAFC";
const PENDING_FILL = "FFFFF3CD";
const PENDING_FONT = "FF92400E";

const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: BORDER_COLOR } },
    right: { style: "thin", color: { argb: BORDER_COLOR } },
    bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    left: { style: "thin", color: { argb: BORDER_COLOR } },
};

export function isProposedColumnHeader(header: string): boolean {
    return header.includes(" Proposed (") || header.startsWith("Proposed List Cost (");
}

export function addSupplierBatchInstructionRows(
    sheet: ExcelJS.Worksheet,
    options: { includeProposedColumns?: boolean } = {},
): number {
    const includeProposedColumns = options.includeProposedColumns ?? true;
    const startRowNumber = sheet.rowCount + 1;
    sheet.addRow(["Instructions"]);
    if (includeProposedColumns) {
        sheet.addRow(["", "Enter changes only in columns containing Proposed; the unit is shown in each price column header."]);
        sheet.addRow(["", "Leave proposed cells blank when no change is needed. Proposed cells whose current value is empty are locked and cannot receive a value."]);
        sheet.addRow(["", "Yellow Pending cells already have active requests; leave them unchanged."]);
        sheet.addRow(["", "Do not edit product identity columns, current-value columns, supplier metadata, or headers."]);
        sheet.addRow(["", "Save this file and import it through Price Change Requests."]);
    } else {
        sheet.addRow(["", "This reference export shows current values only; proposed-change columns are not included."]);
        sheet.addRow(["", "Use this file for review or sharing, not for importing changes."]);
        sheet.addRow(["", "To submit changes, export again with Proposed columns and edit only those cells."]);
        sheet.addRow(["", "Do not edit product identity columns, current-value columns, supplier metadata, or headers."]);
        sheet.addRow(["", "No pending-change markers are shown in this reference export."]);
    }
    sheet.addRow([]);
    return startRowNumber;
}

function styleMetaRow(row: ExcelJS.Row) {
    const labelCell = row.getCell(1);
    const valueCell = row.getCell(2);

    labelCell.font = { size: 10, color: { argb: META_LABEL_COLOR }, name: "Calibri" };
    labelCell.alignment = { vertical: "middle" };
    labelCell.border = thinBorder;

    valueCell.font = { bold: true, size: 10, name: "Calibri" };
    valueCell.alignment = { vertical: "middle" };
    valueCell.border = thinBorder;
}

function styleHeaderRow(row: ExcelJS.Row, totalColumns: number) {
    row.height = 36;

    for (let col = 1; col <= totalColumns; col += 1) {
        const cell = row.getCell(col);
        cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" }, name: "Calibri" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = thinBorder;
    }
}

function styleInstructionRows(sheet: ExcelJS.Worksheet, startRowNumber: number, totalColumns: number) {
    const rows = [
        startRowNumber,
        startRowNumber + 1,
        startRowNumber + 2,
        startRowNumber + 3,
        startRowNumber + 4,
        startRowNumber + 5,
    ];

    for (const rowNumber of rows) {
        const row = sheet.getRow(rowNumber);
        row.height = rowNumber === startRowNumber ? 21 : 30;

        if (rowNumber > startRowNumber) {
            sheet.mergeCells(rowNumber, 2, rowNumber, 3);
        }

        for (let col = 1; col <= totalColumns; col += 1) {
            const cell = row.getCell(col);
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INSTRUCTION_FILL } };
            cell.border = thinBorder;
            cell.alignment = { vertical: "middle", wrapText: true };
            cell.font =
                rowNumber === startRowNumber
                    ? { bold: true, size: 10, name: "Calibri" }
                    : { size: 10, color: { argb: META_LABEL_COLOR }, name: "Calibri" };
        }
    }

    sheet.getRow(startRowNumber).getCell(1).font = { bold: true, size: 11, name: "Calibri" };
}

function styleDataRow(
    row: ExcelJS.Row,
    totalColumns: number,
    productNameColumn: number,
    proposedColumnIndexes: Set<number>,
    editableProposedCellIndexes: Set<string>,
    disabledProposedCellIndexes: Map<string, string>,
    striped: boolean,
) {
    row.height = 30;

    for (let col = 1; col <= totalColumns; col += 1) {
        const cell = row.getCell(col);
        const isProposedColumn = proposedColumnIndexes.has(col);
        const cellKey = `${row.number}:${col}`;
        const isEditableProposedCell = isProposedColumn && editableProposedCellIndexes.has(cellKey);
        const disabledNote = disabledProposedCellIndexes.get(cellKey);
        cell.font = { size: 11, name: "Calibri" };
        cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {
                argb: disabledNote
                    ? DISABLED_PROPOSED_FILL
                    : isProposedColumn
                    ? striped
                        ? PROPOSED_ALT_FILL
                        : PROPOSED_FILL
                : striped
                      ? BODY_ALT_FILL
                      : BODY_FILL,
            },
        };
        if (disabledNote) {
            cell.font = { size: 11, color: { argb: DISABLED_PROPOSED_FONT }, name: "Calibri" };
            cell.note = disabledNote;
        }
        cell.protection = { locked: !isEditableProposedCell, hidden: false };
        cell.alignment = {
            vertical: "middle",
            ...(col === productNameColumn ? { wrapText: true } : {}),
        };
        cell.border = thinBorder;
    }
}

export function styleSupplierBatchWorksheet(args: {
    sheet: ExcelJS.Worksheet;
    instructionStartRowNumber?: number;
    headerRowNumber: number;
    totalColumns: number;
    dataStartRowNumber: number;
    proposedColumnIndexes?: number[];
    editableProposedCellIndexes?: Array<{ rowNumber: number; columnIndex: number }>;
    disabledProposedCellIndexes?: Array<{ rowNumber: number; columnIndex: number; note: string }>;
    pendingCellIndexes?: Array<{ rowNumber: number; columnIndex: number; note?: string }>;
    productNameColumn?: number;
}) {
    const {
        sheet,
        instructionStartRowNumber,
        headerRowNumber,
        totalColumns,
        dataStartRowNumber,
        proposedColumnIndexes = [],
        editableProposedCellIndexes = [],
        disabledProposedCellIndexes = [],
        pendingCellIndexes = [],
        productNameColumn = 4,
    } = args;
    const proposedColumnIndexSet = new Set(proposedColumnIndexes);

    for (const rowNumber of [1, 2, 3, 4]) {
        styleMetaRow(sheet.getRow(rowNumber));
    }

    if (instructionStartRowNumber) {
        styleInstructionRows(sheet, instructionStartRowNumber, totalColumns);
    }

    styleHeaderRow(sheet.getRow(headerRowNumber), totalColumns);
    for (const columnIndex of proposedColumnIndexSet) {
        const cell = sheet.getRow(headerRowNumber).getCell(columnIndex);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PROPOSED_HEADER_FILL } };
    }

    const editableProposedCellIndexSet = new Set(
        editableProposedCellIndexes.map(({ rowNumber, columnIndex }) => `${rowNumber}:${columnIndex}`),
    );
    const disabledProposedCellIndexMap = new Map(
        disabledProposedCellIndexes.map(({ rowNumber, columnIndex, note }) => [
            `${rowNumber}:${columnIndex}`,
            note,
        ]),
    );

    for (let rowNumber = dataStartRowNumber; rowNumber <= sheet.rowCount; rowNumber += 1) {
        styleDataRow(
            sheet.getRow(rowNumber),
            totalColumns,
            productNameColumn,
            proposedColumnIndexSet,
            editableProposedCellIndexSet,
            disabledProposedCellIndexMap,
            (rowNumber - dataStartRowNumber) % 2 === 1,
        );
    }

    for (const pendingCell of pendingCellIndexes) {
        const cell = sheet.getRow(pendingCell.rowNumber).getCell(pendingCell.columnIndex);
        cell.value = "Pending";
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PENDING_FILL } };
        cell.font = { bold: true, size: 11, color: { argb: PENDING_FONT }, name: "Calibri" };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        if (pendingCell.note) {
            cell.note = pendingCell.note;
        }
    }
}
