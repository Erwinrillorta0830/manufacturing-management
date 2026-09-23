import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { LaborEfficiencyFilters, LaborEfficiencyOption, LaborEfficiencyReportPayload, LaborEfficiencyRow } from "../types";

function generatedAt(): string {
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date());
}

function formatNumber(value: number | null, digits = 4): string {
    return value === null ? "N/A" : value.toLocaleString("en-PH", { maximumFractionDigits: digits });
}

export function describeLaborEfficiencyFilters(
    filters: LaborEfficiencyFilters,
    branches: LaborEfficiencyOption[],
    products: LaborEfficiencyOption[]
): string {
    const active: string[] = [];
    if (filters.branchId !== "all") active.push(`Branch: ${branches.find((item) => String(item.id) === filters.branchId)?.label || filters.branchId}`);
    if (filters.productId !== "all") active.push(`Product: ${products.find((item) => String(item.id) === filters.productId)?.label || filters.productId}`);
    if (filters.status !== "all") active.push(`Status: ${filters.status}`);
    if (filters.dateFrom || filters.dateTo) active.push(`Created: ${filters.dateFrom || "Any"} to ${filters.dateTo || "Any"}`);
    if (filters.jobOrder.trim()) active.push(`Job Order: ${filters.jobOrder.trim()}`);
    return active.join(" | ") || "All Job Orders";
}

function exportSummaryRow(row: LaborEfficiencyRow) {
    return {
        "Job Order": row.jobOrderNo,
        Product: row.productName,
        SKU: row.productCode,
        Branch: row.branchName,
        Status: row.status,
        Created: row.createdAt || "",
        "QA-Passed Output": row.goodOutputQuantity,
        UOM: row.uom,
        "Standard Labor Hours": row.standardHours,
        "Actual Labor Hours": row.actualHours,
        "Variance Hours (Actual - Standard)": row.varianceHours,
        "Labor Efficiency (%)": row.efficiencyPercent,
        "Productivity (Output / Labor Hour)": row.productivity,
        Provisional: row.provisional,
        "Data Quality Notes": row.incompleteReasons.join(" ")
    };
}

function exportDetailRows(rows: LaborEfficiencyRow[]) {
    return rows.flatMap((row) => [
        ...row.standardLines.map((line) => ({
            "Job Order": row.jobOrderNo,
            "Detail Type": "Standard allowance",
            Route: line.routeName,
            Person: line.positionName,
            Manpower: line.manpowerCount,
            "Hours per Person / Batch": line.hoursRequired,
            "Standard Hours per Batch": line.standardHoursPerBatch,
            "Earned Standard Hours": line.earnedStandardHours,
            "Logged Hours": null,
            "Running Timer Hours": null,
            "Actual Hours": null,
            Provisional: false
        })),
        ...row.actualLines.map((line) => ({
            "Job Order": row.jobOrderNo,
            "Detail Type": "Actual labor",
            Route: line.operationName,
            Person: line.operatorName,
            Manpower: null,
            "Hours per Person / Batch": null,
            "Standard Hours per Batch": null,
            "Earned Standard Hours": null,
            "Logged Hours": line.loggedHours,
            "Running Timer Hours": line.runningHours,
            "Actual Hours": line.totalHours,
            Provisional: line.timerRunning
        }))
    ]);
}

function buildLaborEfficiencyWorkbook(payload: LaborEfficiencyReportPayload, filterDescription: string) {
    const workbook = XLSX.utils.book_new();
    const rows = payload.rows.map(exportSummaryRow);
    const summary = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Notice: "No Job Orders match the selected filters." }]);
    summary["!cols"] = Object.keys(rows[0] || { Notice: "" }).map((header) => ({
        wch: Math.min(40, Math.max(header.length + 2, ...rows.map((row) => String(row[header as keyof typeof row] ?? "").length + 2)))
    }));
    XLSX.utils.book_append_sheet(workbook, summary, "Labor Summary");

    const detailRows = exportDetailRows(payload.rows);
    const details = XLSX.utils.json_to_sheet(detailRows.length ? detailRows : [{ Notice: "No labor detail is available for these Job Orders." }]);
    details["!cols"] = [18, 23, 28, 28, 12, 23, 24, 23, 18, 23, 18, 14].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, details, "Labor Detail");

    const overview = XLSX.utils.aoa_to_sheet([
        ["LABOR EFFICIENCY & PRODUCTIVITY REPORT"],
        [`Generated: ${generatedAt()}`],
        [`Filters: ${filterDescription}`],
        ["Comparable JOs", payload.summary.comparableCount, "Incomplete JOs", payload.summary.incompleteCount],
        ["Standard labor hours", payload.summary.standardHours, "Actual labor hours", payload.summary.actualHours],
        ["Variance hours (actual - standard)", payload.summary.varianceHours, "Labor efficiency (%)", payload.summary.efficiencyPercent],
        [],
        ["Productivity by UOM", "QA-passed output", "Actual labor hours", "Output per labor hour"],
        ...payload.summary.productivityByUom.map((item) => [item.uom, item.goodOutputQuantity, item.actualHours, item.productivity])
    ]);
    overview["!cols"] = [34, 22, 28, 26].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, overview, "Report Overview");
    return workbook;
}

function buildLaborEfficiencyPdf(payload: LaborEfficiencyReportPayload, filterDescription: string) {
    const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const pageWidth = document.internal.pageSize.getWidth();
    const margin = 12;
    document.setFont("helvetica", "bold");
    document.setFontSize(15);
    document.text("LABOR EFFICIENCY & PRODUCTIVITY REPORT", margin, 14);
    document.setFont("helvetica", "normal");
    document.setFontSize(8);
    document.text(`Generated: ${generatedAt()}`, margin, 20);
    const filters = document.splitTextToSize(`Filters: ${filterDescription}`, pageWidth - margin * 2);
    document.text(filters, margin, 25);
    const summaryY = 25 + filters.length * 4 + 3;
    const productivityText = payload.summary.productivityByUom.map((item) =>
        `${formatNumber(item.productivity)} ${item.uom}/hr`
    ).join(" | ") || "N/A";
    const summaryText = document.splitTextToSize(
        `Comparable JOs: ${payload.summary.comparableCount} | Incomplete: ${payload.summary.incompleteCount} | Standard hours: ${formatNumber(payload.summary.standardHours)} | Actual hours: ${formatNumber(payload.summary.actualHours)} | Variance: ${formatNumber(payload.summary.varianceHours)} | Efficiency: ${formatNumber(payload.summary.efficiencyPercent, 2)}% | Productivity: ${productivityText}`,
        pageWidth - margin * 2
    );
    document.text(summaryText, margin, summaryY);
    autoTable(document, {
        startY: summaryY + summaryText.length * 4 + 4,
        margin: { left: margin, right: margin, bottom: 12 },
        head: [["Job Order", "Product", "Branch", "Status", "Passed Output", "Standard Hrs", "Actual Hrs", "Variance Hrs", "Efficiency", "Productivity"]],
        body: payload.rows.map((row) => [
            row.jobOrderNo,
            `${row.productName}${row.productCode ? ` (${row.productCode})` : ""}`,
            row.branchName,
            `${row.status}${row.provisional ? " (Provisional)" : ""}`,
            `${formatNumber(row.goodOutputQuantity)} ${row.uom}`,
            formatNumber(row.standardHours),
            formatNumber(row.actualHours),
            formatNumber(row.varianceHours),
            row.efficiencyPercent === null ? "N/A" : `${formatNumber(row.efficiencyPercent, 2)}%`,
            row.productivity === null ? "N/A" : `${formatNumber(row.productivity)} ${row.uom}/hr`
        ]),
        styles: { font: "helvetica", fontSize: 7, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7 },
        columnStyles: {
            0: { cellWidth: 28 }, 1: { cellWidth: 48 }, 2: { cellWidth: 34 }, 3: { cellWidth: 38 },
            4: { cellWidth: 37, halign: "right" }, 5: { cellWidth: 27, halign: "right" },
            6: { cellWidth: 27, halign: "right" }, 7: { cellWidth: 29, halign: "right" },
            8: { cellWidth: 25, halign: "right" }, 9: { cellWidth: 39, halign: "right" }
        }
    });

    document.addPage();
    document.setFont("helvetica", "bold");
    document.setFontSize(13);
    document.text("STANDARD ALLOWANCE & ACTUAL OPERATOR HOURS", margin, 14);
    autoTable(document, {
        startY: 20,
        margin: { left: margin, right: margin, bottom: 12 },
        head: [["Job Order", "Type", "Route", "Position / Operator", "Manpower", "Std Hrs / Batch", "Earned Std Hrs", "Logged Hrs", "Running Hrs", "Actual Hrs"]],
        body: exportDetailRows(payload.rows).map((row) => [
            row["Job Order"], row["Detail Type"], row.Route, row.Person,
            row.Manpower === null ? "—" : String(row.Manpower),
            formatNumber(row["Standard Hours per Batch"]),
            formatNumber(row["Earned Standard Hours"]),
            formatNumber(row["Logged Hours"]),
            formatNumber(row["Running Timer Hours"]),
            formatNumber(row["Actual Hours"])
        ]),
        styles: { font: "helvetica", fontSize: 7, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7 }
    });
    for (let page = 1; page <= document.getNumberOfPages(); page += 1) {
        document.setPage(page);
        document.setFont("helvetica", "normal");
        document.setFontSize(7);
        document.text(`Page ${page} of ${document.getNumberOfPages()}`, pageWidth - margin, document.internal.pageSize.getHeight() - 5, { align: "right" });
    }
    return document;
}

export function laborEfficiencyExportFilename(format: "xlsx" | "pdf"): string {
    return `labor-efficiency-productivity-${new Date().toISOString().slice(0, 10)}.${format}`;
}

export function generateLaborEfficiencyExcel(payload: LaborEfficiencyReportPayload, filterDescription: string): Uint8Array {
    return new Uint8Array(XLSX.write(buildLaborEfficiencyWorkbook(payload, filterDescription), { bookType: "xlsx", type: "buffer" }));
}

export function generateLaborEfficiencyPdf(payload: LaborEfficiencyReportPayload, filterDescription: string): Uint8Array {
    return new Uint8Array(buildLaborEfficiencyPdf(payload, filterDescription).output("arraybuffer"));
}

export function exportLaborEfficiencyExcel(payload: LaborEfficiencyReportPayload, filterDescription: string): void {
    XLSX.writeFile(buildLaborEfficiencyWorkbook(payload, filterDescription), laborEfficiencyExportFilename("xlsx"));
}

export function exportLaborEfficiencyPdf(payload: LaborEfficiencyReportPayload, filterDescription: string): void {
    buildLaborEfficiencyPdf(payload, filterDescription).save(laborEfficiencyExportFilename("pdf"));
}
