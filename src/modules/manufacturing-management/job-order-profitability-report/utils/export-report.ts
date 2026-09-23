import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { JobOrderProfitabilityExportRow, JobOrderProfitabilityFilters } from "../types";

const currencyFormat = '"PHP" #,##0.00;[Red]("PHP" #,##0.00);-';
const quantityFormat = "#,##0.####";

function generatedAt(): string {
    return new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila"
    }).format(new Date());
}

export function describeProfitabilityFilters(filters: JobOrderProfitabilityFilters): string {
    const active = [
        filters.search ? `Search: ${filters.search}` : "",
        filters.branchId !== "all" ? `Branch ID: ${filters.branchId}` : "",
        filters.productId !== "all" ? `Product ID: ${filters.productId}` : "",
        filters.status !== "all" ? `JO status: ${filters.status}` : "",
        filters.dateFrom || filters.dateTo ? `Manufacturing date: ${filters.dateFrom || "Any"} to ${filters.dateTo || "Any"}` : ""
    ].filter(Boolean);
    return active.join(" | ") || "All batches";
}

function rowValues(row: JobOrderProfitabilityExportRow): Array<string | number | null> {
    return [
        row.jobOrderNo,
        row.salesOrderNumbers.join(", "),
        row.productName,
        row.productCode,
        row.branchName,
        row.status,
        row.manufacturingDate,
        row.batchNumber,
        row.lotNumber,
        row.goodQuantity,
        row.rejectedQuantity,
        row.allocatedQuantity,
        row.unallocatedQuantity,
        row.directMaterialsCost,
        row.directLaborCost,
        row.manufacturingOverheadCost,
        row.totalBatchCogs,
        row.allocatedCogs,
        row.unallocatedCogs,
        row.revenue,
        row.grossProfit,
        row.grossMarginPercent,
        row.complete ? "Complete" : row.incompleteReasons.join(" ")
    ];
}

export function exportProfitabilityExcel(
    rows: JobOrderProfitabilityExportRow[],
    filters: JobOrderProfitabilityFilters
): void {
    const headers = [
        "Job Order", "Sales Orders", "Product", "Product Code", "Branch", "JO Status",
        "Manufacturing Date", "Finished Batch", "Finished Lot", "QA-Passed Good Qty", "Rejected Qty",
        "SO-Allocated Qty", "Unallocated Qty", "Direct Materials (PHP)", "Direct Labor (PHP)",
        "Manufacturing Overhead (PHP)", "Total Batch COGS (PHP)", "Allocated COGS (PHP)",
        "Unallocated COGS (PHP)", "Revenue (PHP)", "Gross Profit (PHP)", "Gross Margin %", "Data Quality"
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
        ["JOB & ORDER PROFITABILITY REPORT"],
        [`Generated: ${generatedAt()}`],
        [`Filters: ${describeProfitabilityFilters(filters)}`],
        [],
        headers,
        ...rows.map(rowValues)
    ]);
    sheet["!cols"] = headers.map((header, index) => {
        const values = rows.map((row) => String(rowValues(row)[index] ?? ""));
        return { wch: Math.min(38, Math.max(header.length + 2, ...values.map((value) => Math.min(38, value.length + 2)))) };
    });
    for (let rowIndex = 5; rowIndex < 5 + rows.length; rowIndex += 1) {
        for (const columnIndex of [13, 14, 15, 16, 17, 18, 19, 20]) {
            const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
            if (cell && typeof cell.v === "number") cell.z = currencyFormat;
        }
        for (const columnIndex of [9, 10, 11, 12]) {
            const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
            if (cell && typeof cell.v === "number") cell.z = quantityFormat;
        }
        const marginCell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: 21 })];
        if (marginCell && typeof marginCell.v === "number") marginCell.z = '0.00"%"';
    }
    if (rows.length) {
        sheet["!autofilter"] = { ref: XLSX.utils.encode_range({
            s: { r: 4, c: 0 },
            e: { r: 4 + rows.length, c: headers.length - 1 }
        }) };
    }
    XLSX.utils.book_append_sheet(workbook, sheet, "Batch Profitability");

    const detailRows = rows.flatMap((row) => [
        ...row.detail.materials.map((line) => [row.jobOrderNo, row.batchNumber, "Direct materials", line.productName, line.lotNumber, line.batchNumber, line.quantity, line.unitCost, line.totalCost]),
        ...row.detail.labor.map((line) => [row.jobOrderNo, row.batchNumber, "Direct labor", line.operatorName, line.operationName, "", line.hours, line.hourlyRate, line.batchCost]),
        ...row.detail.overhead.map((line) => [row.jobOrderNo, row.batchNumber, "Manufacturing overhead", line.workCenterName, line.operationName, "", line.hours, line.hourlyRate, line.batchCost])
    ]);
    const detailHeaders = ["Job Order", "Finished Batch", "Cost Element", "Source", "Operation / Lot", "Component Batch", "Quantity / Hours", "Unit Rate (PHP)", "Batch Cost (PHP)"];
    const detailSheet = XLSX.utils.aoa_to_sheet([
        ["BATCH COST SOURCE DETAILS"],
        [`Generated: ${generatedAt()}`],
        [`Filters: ${describeProfitabilityFilters(filters)}`],
        [],
        detailHeaders,
        ...detailRows
    ]);
    detailSheet["!cols"] = [18, 22, 26, 32, 30, 24, 20, 20, 20].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Batch Cost Details");
    XLSX.writeFile(workbook, `job-order-profitability-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function money(value: number | null): string {
    return value === null ? "N/A" : `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function exportProfitabilityPdf(rows: JobOrderProfitabilityExportRow[], filters: JobOrderProfitabilityFilters): void {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const margin = 10;
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("JOB & ORDER PROFITABILITY REPORT", margin, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Generated: ${generatedAt()}`, margin, 19);
    const filterLines = doc.splitTextToSize(`Filters: ${describeProfitabilityFilters(filters)}`, pageWidth - margin * 2);
    doc.text(filterLines, margin, 24);

    autoTable(doc, {
        startY: 27 + filterLines.length * 4,
        margin: { left: margin, right: margin, bottom: 10 },
        head: [["JO / Product", "SO / Batch", "Mfg. Date", "QA Good / Allocated", "Materials", "Labor", "Overhead", "Allocated COGS", "Revenue", "Gross Profit", "Margin"]],
        body: rows.map((row) => [
            `${row.jobOrderNo}\n${row.productName}`,
            `${row.salesOrderNumbers.join(", ") || "Unlinked"}\n${row.batchNumber}`,
            row.manufacturingDate || "N/A",
            `${row.goodQuantity.toLocaleString("en-PH")} / ${row.allocatedQuantity.toLocaleString("en-PH")} ${row.uom}`,
            money(row.directMaterialsCost),
            money(row.directLaborCost),
            money(row.manufacturingOverheadCost),
            money(row.allocatedCogs),
            money(row.revenue),
            money(row.grossProfit),
            row.grossMarginPercent === null ? "N/A" : `${row.grossMarginPercent.toFixed(2)}%`
        ]),
        styles: { font: "helvetica", fontSize: 7, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7 },
        columnStyles: {
            0: { cellWidth: 42 }, 1: { cellWidth: 42 }, 2: { cellWidth: 20 }, 3: { cellWidth: 32 },
            4: { cellWidth: 25 }, 5: { cellWidth: 25 }, 6: { cellWidth: 25 }, 7: { cellWidth: 27 },
            8: { cellWidth: 27 }, 9: { cellWidth: 27 }, 10: { cellWidth: 20 }
        }
    });

    const detailRows = rows.flatMap((row) => [
        ...row.detail.materials.map((line) => [row.jobOrderNo, row.batchNumber, "Materials", line.productName, `${line.lotNumber} / ${line.batchNumber}`, line.quantity.toLocaleString("en-PH"), money(line.unitCost), money(line.totalCost)]),
        ...row.detail.labor.map((line) => [row.jobOrderNo, row.batchNumber, "Labor", line.operatorName, line.operationName, `${line.hours.toLocaleString("en-PH")} hrs`, money(line.hourlyRate), money(line.batchCost)]),
        ...row.detail.overhead.map((line) => [row.jobOrderNo, row.batchNumber, "Overhead", line.workCenterName, line.operationName, `${line.hours.toLocaleString("en-PH")} hrs`, money(line.hourlyRate), money(line.batchCost)])
    ]);
    if (detailRows.length) {
        doc.addPage("a3", "landscape");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text("BATCH COST SOURCE DETAILS", margin, 14);
        autoTable(doc, {
            startY: 20,
            margin: { left: margin, right: margin, bottom: 10 },
            head: [["Job Order", "Finished Batch", "Element", "Source", "Operation / Lot", "Qty / Hours", "Rate", "Cost"]],
            body: detailRows,
            styles: { font: "helvetica", fontSize: 7, cellPadding: 2, overflow: "linebreak" },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7 }
        });
    }
    const notes = rows.filter((row) => row.incompleteReasons.length > 0 || row.unallocatedQuantity > 0)
        .map((row) => [row.jobOrderNo, row.batchNumber, row.incompleteReasons.join(" ") || `${row.unallocatedQuantity} ${row.uom} has no linked SO revenue/margin.`]);
    if (notes.length) {
        doc.addPage("a3", "landscape");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text("DATA COMPLETENESS & UNALLOCATED OUTPUT", margin, 14);
        autoTable(doc, {
            startY: 20,
            margin: { left: margin, right: margin, bottom: 10 },
            head: [["Job Order", "Finished Batch", "Notes"]],
            body: notes,
            styles: { font: "helvetica", fontSize: 8, cellPadding: 2, overflow: "linebreak" },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }
        });
    }
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 5, { align: "right" });
    }
    doc.save(`job-order-profitability-${new Date().toISOString().slice(0, 10)}.pdf`);
}
