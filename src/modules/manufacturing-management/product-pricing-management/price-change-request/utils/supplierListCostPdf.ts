import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import type { MatrixRow } from "../../product-pricing/types";
import { COST_MAX_DECIMAL_PLACES } from "../../shared/pricePrecision";
import { flattenListCostMatrixRows } from "../../shared/supplier-batch/flattenPrintMatrix";

function formatAmount(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
    return Number(value).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: COST_MAX_DECIMAL_PLACES,
    });
}

function formatMoneyCell(value: number | null | undefined): string {
    const amount = formatAmount(value);
    return amount ? `   ${amount}` : "";
}

function drawPesoSymbol(doc: jsPDF, x: number, y: number, fontSize: number) {
    const previousDrawColor = doc.getDrawColor();
    doc.text("P", x, y);
    const pWidth = doc.getTextWidth("P");
    const lineY1 = y - fontSize * 0.53;
    const lineY2 = y - fontSize * 0.39;
    const overhang = Math.max(0.45, fontSize * 0.12);
    doc.setDrawColor(doc.getTextColor());
    doc.setLineWidth(Math.max(0.25, fontSize * 0.055));
    doc.line(x - overhang, lineY1, x + pWidth + overhang, lineY1);
    doc.line(x - overhang, lineY2, x + pWidth + overhang, lineY2);
    doc.setDrawColor(previousDrawColor);
}

export function exportSupplierListCostPdf(args: {
    supplierName: string;
    matrixRows: MatrixRow[];
}) {
    const { supplierName, matrixRows } = args;
    const flatRows = flattenListCostMatrixRows(matrixRows);
    const generatedAt = new Date();

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const margin = 28;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Supplier List Cost Report", margin, margin);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`Supplier: ${supplierName}`, margin, margin + 14);
    doc.text(
        `Generated: ${generatedAt.toLocaleDateString()} ${generatedAt.toLocaleTimeString()}  |  Products: ${flatRows.length}`,
        margin,
        margin + 26,
    );
    doc.setTextColor(20);

    autoTable(doc, {
        startY: margin + 36,
        head: [["Product Code", "Barcode", "Product Name", "Unit ID", "Current List Cost", "Proposed List Cost"]],
        body: flatRows.map((row) => [
            row.product_code ?? "",
            row.barcode ?? "",
            row.product_name,
            row.unit_id != null ? String(row.unit_id) : "",
            formatMoneyCell(row.current_list_cost),
            "",
        ]),
        styles: { fontSize: 7, cellPadding: 3 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        margin: { left: margin, right: margin },
        didDrawCell: (data) => {
            if (data.section !== "body" || data.column.index !== 4 || !data.cell.raw) return;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(20);
            drawPesoSymbol(doc, data.cell.x + 3, data.cell.y + data.cell.height / 2 + 2.5, 7);
        },
    });

    doc.save(`list-cost-${supplierName.replace(/[<>:"/\\|?*]+/g, "_").trim() || "supplier"}.pdf`);
}
