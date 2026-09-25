import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { MaterialStagingItem, StagingJobOrder } from "../types";
import { displayJobOrderStatus } from "../../job-order-status";
import { stagingStateInfo } from "../../shared/job-order-journey";

function formatAllocationLabel(allocation: {
    lot_name?: string | null;
    batch_no: string;
}): string {
    const batchNo = String(allocation.batch_no || "").trim();
    const lotName = String(allocation.lot_name || "").trim();
    if (lotName && batchNo) return `${lotName} (${batchNo})`;
    return lotName || batchNo;
}

/**
 * Builds the materials-table rows for the slip. The Lot / Batch cell lists
 * only lots with actually staged quantity: SOFT reservations created at
 * JO-initialize carry suggested lot numbers that must never print as staged.
 */
export function buildStagingSlipRows(materials: MaterialStagingItem[]): string[][] {
    return materials.map((material) => {
        const remaining = Math.max(0, Number(material.required_quantity || 0) - Number(material.staged_quantity || 0));
        const lotBatchLabel = material.allocations
            .filter((allocation) => Number(allocation.staged_quantity || 0) > 0)
            .map(formatAllocationLabel)
            .filter((label) => label.length > 0)
            .join(", ") || "—";
        return [
            material.product_code ? `${material.product_name}\n${material.product_code}` : material.product_name,
            `${Number(material.required_quantity || 0).toLocaleString()} ${material.uom}`,
            `${Number(material.staged_quantity || 0).toLocaleString()} ${material.uom}`,
            `${remaining.toLocaleString()} ${material.uom}`,
            material.staging_bin || "—",
            stagingStateInfo(material.reservation_status)?.label || material.reservation_status,
            lotBatchLabel
        ];
    });
}

/**
 * Builds the printable Material Staging Slip as a PDF document. The slip is
 * generated entirely on the client so physical shop-floor documents never
 * inherit the application shell (user name/email) or the browser's print
 * header/footer metadata.
 */
export function generateStagingSlipPdf(jobOrder: StagingJobOrder): jsPDF {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 26, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("VERTEX TECH CORP • VOS ERP", margin, 11);

    doc.setFontSize(10);
    doc.text("MATERIAL STAGING SLIP", margin, 17);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("MANUFACTURING MANAGEMENT — SHOP FLOOR STAGING", margin, 22);

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(jobOrder.job_order_no, pageWidth - margin, 11, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    doc.text(`Status: ${displayJobOrderStatus(jobOrder.status)}`, pageWidth - margin, 17, { align: "right" });
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 22, { align: "right" });

    let currentY = 32;

    // Metadata Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 28, 2, 2, "FD");

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("JOB ORDER & STAGING DESTINATION", margin + 4, currentY + 5.5);

    const metaBoxLeft = margin + 4;
    const metaBoxRight = pageWidth - margin - 4;
    const metaColumnWidth = (metaBoxRight - metaBoxLeft) / 3;
    const metaColumns = [metaBoxLeft, metaBoxLeft + metaColumnWidth, metaBoxLeft + (metaColumnWidth * 2)];
    const metaRows: Array<Array<{ label: string; value: string }>> = [
        [
            { label: "Product", value: `${jobOrder.product_name}${jobOrder.product_code ? ` (${jobOrder.product_code})` : ""}` },
            { label: "Recipe Version", value: jobOrder.version_name || "Default" },
            { label: "Target Quantity", value: `${jobOrder.target_quantity.toLocaleString()} units` }
        ],
        [
            { label: "Branch", value: jobOrder.branch_name || (jobOrder.branch_id ? `Branch #${jobOrder.branch_id}` : "Unassigned") },
            { label: "Work Center", value: jobOrder.primary_work_center_name || "Unassigned" },
            { label: "Target Bin", value: jobOrder.suggested_staging_bin || "No active destination" }
        ],
        [
            { label: "Shift", value: jobOrder.shift_option || "Shift 1" },
            { label: "Staging Progress", value: `${jobOrder.staging_percentage}% (${jobOrder.staged_materials_count}/${jobOrder.total_materials_count} components)` },
            { label: "Reservation", value: stagingStateInfo(jobOrder.reservation_status)?.label || jobOrder.reservation_status }
        ]
    ];

    metaRows.forEach((row, rowIndex) => {
        const rowY = currentY + 10.5 + (rowIndex * 6.5);
        row.forEach((cell, columnIndex) => {
            const x = metaColumns[columnIndex];
            const cellRight = columnIndex === row.length - 1 ? metaBoxRight : metaColumns[columnIndex + 1];
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.8);
            doc.setTextColor(100, 116, 139);
            doc.text(`${cell.label}:`, x, rowY);
            const labelWidth = doc.getTextWidth(`${cell.label}: `);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(15, 23, 42);
            const maxWidth = Math.max(18, cellRight - x - labelWidth - 3);
            const valueLines = doc.splitTextToSize(cell.value, maxWidth).slice(0, 2);
            doc.text(valueLines, x + labelWidth, rowY);
        });
    });

    currentY += 34;

    // Materials Table
    const tableHeaders = ["Component", "Required", "Staged", "Remaining", "Bin", "Reservation", "Lot / Batch"];
    const tableRows = buildStagingSlipRows(jobOrder.materials);

    autoTable(doc, {
        head: [tableHeaders],
        body: tableRows,
        startY: currentY,
        margin: { left: margin, right: margin },
        styles: {
            fontSize: 7,
            cellPadding: 1.8,
            textColor: [15, 23, 42],
            lineColor: [226, 232, 240],
            lineWidth: 0.1
        },
        headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 7
        },
        columnStyles: {
            0: { cellWidth: 40 },
            1: { cellWidth: 20, halign: "right" },
            2: { cellWidth: 18, halign: "right" },
            3: { cellWidth: 18, halign: "right" },
            4: { cellWidth: 26 },
            5: { cellWidth: 18, halign: "center" },
            6: { cellWidth: "auto" }
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        }
    });

    // Sign-Off Block
    // @ts-expect-error lastAutoTable injected by jspdf-autotable
    const finalY = (doc.lastAutoTable?.finalY || 150) + 14;
    let signY = finalY;
    if (signY > pageHeight - 35) {
        doc.addPage();
        signY = 25;
    }

    doc.setDrawColor(203, 213, 225);
    doc.line(margin, signY - 4, pageWidth - margin, signY - 4);

    const colW = (pageWidth - (margin * 2) - 16) / 3;
    const signColumns = [
        { x: margin, title: "1. PICKED / STAGED BY:", caption: "Warehouse Stager Signature & Date" },
        { x: margin + colW + 8, title: "2. VERIFIED BY:", caption: "Production Supervisor Signature & Date" },
        { x: margin + (colW * 2) + 16, title: "3. RECEIVED ON FLOOR BY:", caption: "Shop Floor Receiver Signature & Date" }
    ];
    signColumns.forEach((column) => {
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(71, 85, 105);
        doc.text(column.title, column.x, signY);
        doc.setDrawColor(15, 23, 42);
        doc.line(column.x, signY + 16, column.x + colW, signY + 16);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(column.caption, column.x, signY + 20);
    });

    // Page Footer
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
            `Vertex Tech Corp • Material Staging Slip ${jobOrder.job_order_no} • Page ${page} of ${totalPages}`,
            pageWidth / 2,
            pageHeight - 6,
            { align: "center" }
        );
    }

    return doc;
}

export function downloadStagingSlipPdf(jobOrder: StagingJobOrder): void {
    const doc = generateStagingSlipPdf(jobOrder);
    doc.save(`StagingSlip_${jobOrder.job_order_no}.pdf`);
}
