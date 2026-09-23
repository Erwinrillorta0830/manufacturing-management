import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
    CostComparison,
    StandardVsActualCostFilters,
    StandardVsActualCostRow,
    CostVarianceOption
} from "../types";

type ReportTotals = {
    comparableCount: number;
    incompleteCount: number;
    standard: number;
    actual: number;
    variance: number;
};

const SUMMARY_HEADERS = [
    "Job Order",
    "Product",
    "SKU",
    "Branch",
    "Status",
    "Created At",
    "Target Quantity",
    "QA-Passed Good Output",
    "UOM",
    "Materials Standard (PHP)",
    "Materials Actual (PHP)",
    "Materials Variance (PHP)",
    "Materials Variance %",
    "Labor Standard (PHP)",
    "Labor Actual (PHP)",
    "Labor Variance (PHP)",
    "Labor Variance %",
    "Overhead Standard (PHP)",
    "Overhead Actual (PHP)",
    "Overhead Variance (PHP)",
    "Overhead Variance %",
    "Total Standard (PHP)",
    "Total Actual (PHP)",
    "Total Variance (PHP)",
    "Total Variance %",
    "Comparison Complete",
    "Provisional",
    "Data Quality Notes"
];

const CURRENCY_FORMAT = '"PHP" #,##0.00;[Red]("PHP" #,##0.00);-';
const NUMBER_FORMAT = "#,##0.####";
const PERCENT_FORMAT = '0.00"%"';

function generatedAt(): string {
    return new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila"
    }).format(new Date());
}

export function describeCostVarianceFilters(
    filters: StandardVsActualCostFilters,
    branches: CostVarianceOption[],
    products: CostVarianceOption[]
): string {
    const active: string[] = [];
    if (filters.branchId !== "all") {
        active.push(`Branch: ${branches.find((option) => String(option.id) === filters.branchId)?.label || filters.branchId}`);
    }
    if (filters.productId !== "all") {
        active.push(`Product: ${products.find((option) => String(option.id) === filters.productId)?.label || filters.productId}`);
    }
    if (filters.status !== "all") active.push(`Status: ${filters.status}`);
    if (filters.dateFrom || filters.dateTo) active.push(`Created: ${filters.dateFrom || "Any"} to ${filters.dateTo || "Any"}`);
    if (filters.jobOrder.trim()) active.push(`Job Order: ${filters.jobOrder.trim()}`);
    return active.join(" | ") || "All Job Orders";
}

function summaryValues(row: StandardVsActualCostRow): Array<string | number | boolean | null> {
    return [
        row.jobOrderNo,
        row.productName,
        row.productCode,
        row.branchName,
        row.status,
        row.createdAt || "",
        row.targetQuantity,
        row.goodOutputQuantity,
        row.uom,
        row.costs.directMaterials.standard,
        row.costs.directMaterials.actual,
        row.costs.directMaterials.variance,
        row.costs.directMaterials.variancePercent,
        row.costs.directLabor.standard,
        row.costs.directLabor.actual,
        row.costs.directLabor.variance,
        row.costs.directLabor.variancePercent,
        row.costs.manufacturingOverhead.standard,
        row.costs.manufacturingOverhead.actual,
        row.costs.manufacturingOverhead.variance,
        row.costs.manufacturingOverhead.variancePercent,
        row.costs.total.standard,
        row.costs.total.actual,
        row.costs.total.variance,
        row.costs.total.variancePercent,
        row.costs.total.complete,
        row.provisional,
        row.incompleteReasons.join(" ")
    ];
}

function actualCostDetailRows(rows: StandardVsActualCostRow[]): Array<Array<string | number | null>> {
    return rows.flatMap((row) => [
        ...row.detail.materials.map((line) => [
            row.jobOrderNo,
            "Direct materials",
            line.productName,
            "Consumed material",
            line.lotNumber,
            line.consumedQuantity,
            line.currentUnitCost,
            line.actualCost
        ] as Array<string | number | null>),
        ...row.detail.labor.map((line) => [
            row.jobOrderNo,
            "Direct labor",
            line.operatorName,
            line.operationName,
            "Logged labor hours",
            line.hours,
            line.hourlyRate,
            line.actualCost
        ] as Array<string | number | null>),
        ...row.detail.overhead.map((line) => [
            row.jobOrderNo,
            "Manufacturing overhead",
            line.workCenterName,
            line.operationName,
            "Applied overhead hours",
            line.hours,
            line.hourlyRate,
            line.actualCost
        ] as Array<string | number | null>)
    ]);
}

export function exportCostVarianceExcel(
    rows: StandardVsActualCostRow[],
    totals: ReportTotals,
    filterDescription: string
): void {
    const generated = generatedAt();
    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.aoa_to_sheet([
        ["STANDARD VS. ACTUAL COST VARIANCE REPORT"],
        [`Generated: ${generated}`],
        [`Filters: ${filterDescription}`],
        [
            "Comparable JOs", totals.comparableCount,
            "Incomplete JOs", totals.incompleteCount,
            "Standard allowed (PHP)", totals.standard,
            "Actual cost (PHP)", totals.actual,
            "Net variance (PHP)", totals.variance
        ],
        ["Aggregate totals include complete JO comparisons only."],
        [],
        SUMMARY_HEADERS,
        ...rows.map(summaryValues)
    ]);

    const dataStartRow = 7;
    const currencyColumns = [9, 10, 11, 13, 14, 15, 17, 18, 19, 21, 22, 23];
    const percentageColumns = [12, 16, 20, 24];
    const quantityColumns = [6, 7];
    for (let rowIndex = dataStartRow; rowIndex < dataStartRow + rows.length; rowIndex += 1) {
        for (const columnIndex of currencyColumns) {
            const cell = summarySheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
            if (cell && typeof cell.v === "number") cell.z = CURRENCY_FORMAT;
        }
        for (const columnIndex of percentageColumns) {
            const cell = summarySheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
            if (cell && typeof cell.v === "number") cell.z = PERCENT_FORMAT;
        }
        for (const columnIndex of quantityColumns) {
            const cell = summarySheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
            if (cell && typeof cell.v === "number") cell.z = NUMBER_FORMAT;
        }
    }
    summarySheet["!cols"] = SUMMARY_HEADERS.map((header, index) => {
        const values = rows.map((row) => String(summaryValues(row)[index] ?? ""));
        return { wch: Math.min(42, Math.max(header.length + 2, ...values.map((value) => Math.min(value.length + 2, 42)))) };
    });
    summarySheet["!autofilter"] = {
        ref: XLSX.utils.encode_range({
            s: { r: 6, c: 0 },
            e: { r: 6 + rows.length, c: SUMMARY_HEADERS.length - 1 }
        })
    };
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Variance Summary");

    const detailHeaders = ["Job Order", "Cost Element", "Cost Owner", "Operation / Location", "Lot / Basis", "Quantity / Hours", "Rate (PHP)", "Actual Cost (PHP)"];
    const details = actualCostDetailRows(rows);
    const detailSheet = XLSX.utils.aoa_to_sheet([
        ["ACTUAL COST SOURCE DETAILS"],
        [`Generated: ${generated}`],
        [`Filters: ${filterDescription}`],
        [],
        detailHeaders,
        ...(details.length > 0 ? details : [["No actual cost source details are available for these rows."]])
    ]);
    detailSheet["!cols"] = [18, 27, 32, 28, 28, 20, 18, 20].map((wch) => ({ wch }));
    detailSheet["!autofilter"] = {
        ref: XLSX.utils.encode_range({
            s: { r: 4, c: 0 },
            e: { r: 4 + Math.max(details.length, 1), c: detailHeaders.length - 1 }
        })
    };
    for (let rowIndex = 5; rowIndex < 5 + details.length; rowIndex += 1) {
        for (const columnIndex of [6, 7]) {
            const cell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
            if (cell && typeof cell.v === "number") cell.z = CURRENCY_FORMAT;
        }
        const quantityCell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: 5 })];
        if (quantityCell && typeof quantityCell.v === "number") quantityCell.z = NUMBER_FORMAT;
    }
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Actual Cost Details");

    XLSX.writeFile(workbook, `standard-vs-actual-cost-variance-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function formatPdfMoney(value: number | null): string {
    return value === null ? "N/A" : `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPdfQuantity(value: number): string {
    return value.toLocaleString("en-PH", { maximumFractionDigits: 4 });
}

function varianceRows(row: StandardVsActualCostRow): Array<{ label: string; comparison: CostComparison }> {
    return [
        { label: "Direct materials", comparison: row.costs.directMaterials },
        { label: "Direct labor", comparison: row.costs.directLabor },
        { label: "Manufacturing overhead", comparison: row.costs.manufacturingOverhead },
        { label: "Total", comparison: row.costs.total }
    ];
}

export function exportCostVariancePdf(
    rows: StandardVsActualCostRow[],
    totals: ReportTotals,
    filterDescription: string
): void {
    const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const pageWidth = document.internal.pageSize.getWidth();
    const margin = 12;
    const generated = generatedAt();

    document.setFont("helvetica", "bold");
    document.setFontSize(15);
    document.text("STANDARD VS. ACTUAL COST VARIANCE REPORT", margin, 14);
    document.setFont("helvetica", "normal");
    document.setFontSize(8);
    document.text(`Generated: ${generated}`, margin, 20);
    const filterLines = document.splitTextToSize(`Filters: ${filterDescription}`, pageWidth - margin * 2);
    document.text(filterLines, margin, 25);
    const summaryY = 25 + filterLines.length * 4 + 3;
    const summaryLines = document.splitTextToSize(
        `Compared JOs: ${totals.comparableCount} | Incomplete: ${totals.incompleteCount} | Standard allowed: ${formatPdfMoney(totals.standard)} | Actual: ${formatPdfMoney(totals.actual)} | Net variance: ${formatPdfMoney(totals.variance)}. Totals include complete JO comparisons only.`,
        pageWidth - margin * 2
    );
    document.text(summaryLines, margin, summaryY);

    const comparisonBody = rows.flatMap((row) => varianceRows(row).map(({ label, comparison }) => [
        row.jobOrderNo,
        `${row.productName}${row.productCode ? ` (${row.productCode})` : ""}`,
        row.branchName,
        `${row.status}${row.provisional ? " (Provisional)" : ""}\nPassed: ${formatPdfQuantity(row.goodOutputQuantity)} ${row.uom}`,
        label,
        formatPdfMoney(comparison.standard),
        formatPdfMoney(comparison.actual),
        formatPdfMoney(comparison.variance),
        comparison.variancePercent === null ? "N/A" : `${comparison.variancePercent.toFixed(2)}%`
    ]));

    autoTable(document, {
        startY: summaryY + summaryLines.length * 4 + 4,
        margin: { left: margin, right: margin, bottom: 12 },
        head: [["Job Order", "Product", "Branch", "Status / QA-Passed Output", "Cost Element", "Standard", "Actual", "Variance", "Variance %"]],
        body: comparisonBody,
        styles: { font: "helvetica", fontSize: 7, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7 },
        columnStyles: {
            0: { cellWidth: 27 },
            1: { cellWidth: 47 },
            2: { cellWidth: 34 },
            3: { cellWidth: 48 },
            4: { cellWidth: 31 },
            5: { cellWidth: 34, halign: "right" },
            6: { cellWidth: 34, halign: "right" },
            7: { cellWidth: 34, halign: "right" },
            8: { cellWidth: 23, halign: "right" }
        },
        didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 4 && data.cell.raw === "Total") {
                data.cell.styles.fontStyle = "bold";
            }
        }
    });

    document.addPage();
    document.setFont("helvetica", "bold");
    document.setFontSize(13);
    document.text("ACTUAL COST SOURCE DETAILS", margin, 14);
    document.setFont("helvetica", "normal");
    document.setFontSize(8);
    document.text(`Generated: ${generated} | Filters: ${filterDescription}`, margin, 20, { maxWidth: pageWidth - margin * 2 });

    const detailBody = actualCostDetailRows(rows).map((line) => [
        String(line[0]),
        String(line[1]),
        String(line[2]),
        String(line[3]),
        String(line[4]),
        formatPdfQuantity(Number(line[5] || 0)),
        formatPdfMoney(typeof line[6] === "number" ? line[6] : null),
        formatPdfMoney(typeof line[7] === "number" ? line[7] : null)
    ]);
    if (detailBody.length > 0) {
        autoTable(document, {
            startY: 25,
            margin: { left: margin, right: margin, bottom: 12 },
            head: [["Job Order", "Cost Element", "Cost Owner", "Operation / Location", "Lot / Basis", "Quantity / Hours", "Rate", "Actual Cost"]],
            body: detailBody,
            styles: { font: "helvetica", fontSize: 7, cellPadding: 2, overflow: "linebreak" },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7 },
            columnStyles: {
                0: { cellWidth: 27 },
                1: { cellWidth: 37 },
                2: { cellWidth: 50 },
                3: { cellWidth: 45 },
                4: { cellWidth: 48 },
                5: { cellWidth: 35, halign: "right" },
                6: { cellWidth: 35, halign: "right" },
                7: { cellWidth: 35, halign: "right" }
            }
        });
    } else {
        document.setFontSize(9);
        document.text("No actual cost source details are available for these rows.", margin, 32);
    }

    const noteRows = rows
        .filter((row) => row.provisional || row.incompleteReasons.length > 0)
        .map((row) => [
            row.jobOrderNo,
            [row.provisional ? "Provisional" : "", ...row.incompleteReasons].filter(Boolean).join(" ")
        ]);
    if (noteRows.length > 0) {
        document.addPage();
        document.setFont("helvetica", "bold");
        document.setFontSize(13);
        document.text("DATA COMPLETENESS NOTES", margin, 14);
        autoTable(document, {
            startY: 20,
            margin: { left: margin, right: margin, bottom: 12 },
            head: [["Job Order", "Provisional / Incomplete Data Notes"]],
            body: noteRows,
            styles: { font: "helvetica", fontSize: 8, cellPadding: 2, overflow: "linebreak" },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
            columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: "auto" } }
        });
    }

    const pageCount = document.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        document.setPage(page);
        document.setFont("helvetica", "normal");
        document.setFontSize(7);
        document.text(`Page ${page} of ${pageCount}`, pageWidth - margin, document.internal.pageSize.getHeight() - 5, { align: "right" });
    }
    document.save(`standard-vs-actual-cost-variance-${new Date().toISOString().slice(0, 10)}.pdf`);
}
