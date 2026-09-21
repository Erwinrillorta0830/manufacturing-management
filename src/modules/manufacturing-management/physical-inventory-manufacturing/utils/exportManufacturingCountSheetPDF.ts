import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { MmPhysicalInventorySheet, MmPhysicalInventoryDetail } from "../types";

function formatDate(dateStr?: string | null): string {
    if (!dateStr) return "N/A";
    const str = String(dateStr).trim();
    if (str.includes("T")) {
        const parts = str.split("T");
        return `${parts[0]} ${parts[1].slice(0, 5)}`;
    }
    return str;
}

function formatQty(val: number | string | null | undefined): string {
    const num = Number(val || 0);
    if (!Number.isFinite(num)) return "0";
    if (Number.isInteger(num)) return num.toLocaleString("en-US");
    return parseFloat(num.toFixed(4)).toString();
}

interface GroupedBatch {
    batchNo: string;
    mfgDate: string;
    expDate: string;
    items: MmPhysicalInventoryDetail[];
}

interface GroupedLot {
    lotName: string;
    batches: GroupedBatch[];
}

function groupDetailsByLotAndBatch(details: MmPhysicalInventoryDetail[]): GroupedLot[] {
    const lotMap = new Map<string, Map<string, { mfgDate: string; expDate: string; items: MmPhysicalInventoryDetail[] }>>();

    for (const item of details) {
        const lObj = typeof item.lot_id === "object" && item.lot_id !== null ? item.lot_id : null;
        const lotName = lObj?.lot_name || (item as unknown as { lot_name?: string }).lot_name || "Main Storage / Unassigned Lot";

        const bObj = typeof item.inventory_lot_id === "object" && item.inventory_lot_id !== null ? item.inventory_lot_id : null;
        const batchNo = item.batch_no || bObj?.batch_no || "General Stock / No Batch";

        const mfgDateRaw = item.manufacturing_date || bObj?.manufacturing_date || "—";
        const expDateRaw = item.expiration_date || (item as unknown as { expiry_date?: string }).expiry_date || bObj?.expiry_date || bObj?.expiration_date || "—";

        const mfgDate = mfgDateRaw !== "—" ? mfgDateRaw.split("T")[0] : "—";
        const expDate = expDateRaw !== "—" ? expDateRaw.split("T")[0] : "—";

        if (!lotMap.has(lotName)) {
            lotMap.set(lotName, new Map());
        }
        const batchMap = lotMap.get(lotName)!;

        if (!batchMap.has(batchNo)) {
            batchMap.set(batchNo, { mfgDate, expDate, items: [] });
        }
        batchMap.get(batchNo)!.items.push(item);
    }

    const result: GroupedLot[] = [];
    lotMap.forEach((batchMap, lotName) => {
        const batches: GroupedBatch[] = [];
        batchMap.forEach((batchData, batchNo) => {
            batches.push({
                batchNo,
                mfgDate: batchData.mfgDate,
                expDate: batchData.expDate,
                items: batchData.items,
            });
        });
        result.push({ lotName, batches });
    });

    return result;
}

export interface PDFExportOptions {
    showPhysicalCount?: boolean;
    targetLot?: number | string | null;
}

function matchesLot(item: MmPhysicalInventoryDetail, targetLot: number | string): boolean {
    const lObj = typeof item.lot_id === "object" && item.lot_id !== null ? (item.lot_id as { lot_id?: number; id?: number; lot_name?: string }) : null;
    const lId = lObj?.lot_id || lObj?.id || (typeof item.lot_id === "number" ? item.lot_id : null);
    const lName = lObj?.lot_name || (item as unknown as { lot_name?: string }).lot_name || "";

    if (typeof targetLot === "number") {
        return lId === targetLot;
    }
    if (typeof targetLot === "string") {
        return lName.toLowerCase() === targetLot.toLowerCase();
    }
    return true;
}

export function generateManufacturingCountSheetPDF(
    sheet: MmPhysicalInventorySheet,
    options?: PDFExportOptions
): jsPDF {
    const showPhysicalCount = options?.showPhysicalCount ?? false;
    const targetLot = options?.targetLot ?? null;

    // 1. PORTRAIT Orientation & Paper-Saving Compact Dimensions
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
    const margin = 10; // 10mm compact margins

    // Top Header (Pure Neutral Black & Gray Styling)
    doc.setTextColor(0, 0, 0); // Pure Black
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("MAMA PINAS MANUFACTURING", margin, 9);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81); // gray-700
    doc.text("MANUFACTURING PHYSICAL INVENTORY AUDIT COUNT SHEET", margin, 14);

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128); // gray-500
    let subtitle = showPhysicalCount
        ? "Official Manufacturing Floor Audit & Physical Count Verification Document"
        : "Official Manufacturing Floor Blind Audit & Batch Verification Document";
    if (targetLot) {
        subtitle += ` [LOT FILTERED]`;
    }
    doc.text(subtitle, margin, 18);

    // Right-side Sheet Metadata
    const piNo = sheet.pi_no || `PI-${sheet.physical_inventory_id}`;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`#${piNo}`, pageWidth - margin, 9, { align: "right" });

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(75, 85, 99); // gray-600
    doc.text(`Status: ${sheet.status || "DRAFT"}`, pageWidth - margin, 13.5, { align: "right" });

    doc.setFontSize(6.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`Printed: ${formatDate(new Date().toISOString())}`, pageWidth - margin, 17.5, { align: "right" });

    // Header Separator line
    doc.setDrawColor(229, 231, 235); // gray-200
    doc.setLineWidth(0.3);
    doc.line(margin, 20, pageWidth - margin, 20);

    let currentY = 22;

    // Extract facility / branch name
    const branchName = typeof sheet.branch_id === "object" && sheet.branch_id !== null
        ? (sheet.branch_id.branch_name || sheet.branch_id.branchName || "Main Branch")
        : "Main Branch";

    // Extract product type name
    let productTypeName = "Finished Goods";
    if (sheet.product_type_id) {
        if (typeof sheet.product_type_id === "object" && sheet.product_type_id !== null) {
            productTypeName = (sheet.product_type_id as { name?: string; type_name?: string }).name ||
                (sheet.product_type_id as { name?: string; type_name?: string }).type_name || "Finished Goods";
        }
    }

    // Extract encoder name
    let encoderName = "Plant Auditor";
    if (sheet.encoder_id) {
        if (typeof sheet.encoder_id === "object" && sheet.encoder_id !== null) {
            const fname = sheet.encoder_id.user_fname || "";
            const lname = sheet.encoder_id.user_lname || "";
            encoderName = `${fname} ${lname}`.trim() || "Plant Auditor";
        } else {
            encoderName = String(sheet.encoder_id);
        }
    }

    // 2. Compact Neutral Metadata Box (16mm Height)
    doc.setFillColor(249, 250, 251); // gray-50 neutral
    doc.setDrawColor(229, 231, 235); // gray-200 border
    doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 16, 1.5, 1.5, "FD");

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");

    const colWidth = (pageWidth - (margin * 2) - 6) / 3;

    // Col 1
    doc.setTextColor(107, 114, 128); // gray-500
    doc.text("BRANCH / FACILITY", margin + 4, currentY + 4.5);
    doc.setTextColor(0, 0, 0); // Pure Black
    doc.text(String(branchName), margin + 4, currentY + 8.5);

    doc.setTextColor(107, 114, 128);
    doc.text("AUDITOR IN-CHARGE", margin + 4, currentY + 12);
    doc.setTextColor(0, 0, 0);
    doc.text(String(encoderName), margin + 4, currentY + 15);

    // Col 2
    const col2X = margin + colWidth + 3;
    doc.setTextColor(107, 114, 128);
    doc.text("STOCK CLASSIFICATION", col2X, currentY + 4.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`${sheet.stock_type || "REGULAR"} STOCK`, col2X, currentY + 8.5);

    doc.setTextColor(107, 114, 128);
    doc.text("START TIMESTAMP", col2X, currentY + 12);
    doc.setTextColor(0, 0, 0);
    doc.text(formatDate(sheet.starting_date), col2X, currentY + 15);

    // Col 3
    const col3X = margin + (colWidth * 2) + 3;
    doc.setTextColor(107, 114, 128);
    doc.text("PRODUCT TYPE SCOPE", col3X, currentY + 4.5);
    doc.setTextColor(0, 0, 0);
    doc.text(String(productTypeName), col3X, currentY + 8.5);

    doc.setTextColor(107, 114, 128);
    doc.text("CUT-OFF BENCHMARK", col3X, currentY + 12);
    doc.setTextColor(0, 0, 0);
    doc.text(formatDate(sheet.cutoff_date), col3X, currentY + 15);

    currentY += 19;

    // 3. Compact Grouped Lot & Batch Layout (Solid Black & Gray Neutral Styling)
    const details: MmPhysicalInventoryDetail[] = sheet.details || [];
    const filteredDetails = targetLot ? details.filter((item) => matchesLot(item, targetLot)) : details;
    const groupedLots = groupDetailsByLotAndBatch(filteredDetails);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableBody: any[] = [];
    let itemSeq = 1;

    const physColHeader = showPhysicalCount ? "RECORDED PHYSICAL COUNT" : "PHYSICAL COUNT (PEN ENTRY)";

    for (const lotGroup of groupedLots) {
        const totalLotSkus = lotGroup.batches.reduce((acc, b) => acc + b.items.length, 0);

        // Lot Header Banner (Solid Pure Black #000000)
        tableBody.push([
            {
                content: `STORAGE LOCATION / LOT: ${lotGroup.lotName.toUpperCase()}                                                                                                                                           ${totalLotSkus} SKU(s)`,
                colSpan: 5,
                styles: {
                    fillColor: [0, 0, 0], // Pure Solid Black
                    textColor: [255, 255, 255],
                    fontStyle: "bold",
                    fontSize: 7.5,
                    halign: "left",
                    cellPadding: 2,
                },
            },
        ]);

        for (const batchGroup of lotGroup.batches) {
            // Batch Sub-Header Bar (Light Neutral Gray #F3F4F6)
            tableBody.push([
                {
                    content: `BATCH NO: ${batchGroup.batchNo}                                                                                                                              MFG: ${batchGroup.mfgDate}    EXP: ${batchGroup.expDate}`,
                    colSpan: 5,
                    styles: {
                        fillColor: [243, 244, 246], // Light Gray (gray-100)
                        textColor: [31, 41, 55], // Dark Gray (gray-800)
                        fontStyle: "bold",
                        fontSize: 7,
                        halign: "left",
                        cellPadding: 1.5,
                    },
                },
            ]);

            // Per-Batch Column Header Row
            tableBody.push([
                { content: "#", styles: { fontStyle: "bold", fillColor: [255, 255, 255], textColor: [75, 85, 99], fontSize: 6.5, halign: "center" } },
                { content: "SKU CODE & PRODUCT DESCRIPTION", styles: { fontStyle: "bold", fillColor: [255, 255, 255], textColor: [75, 85, 99], fontSize: 6.5, halign: "left" } },
                { content: "UOM", styles: { fontStyle: "bold", fillColor: [255, 255, 255], textColor: [75, 85, 99], fontSize: 6.5, halign: "center" } },
                { content: "SYSTEM QTY", styles: { fontStyle: "bold", fillColor: [255, 255, 255], textColor: [75, 85, 99], fontSize: 6.5, halign: "right" } },
                { content: physColHeader, styles: { fontStyle: "bold", fillColor: [255, 255, 255], textColor: [75, 85, 99], fontSize: 6.5, halign: "center" } },
            ]);

            // Item Rows for this Batch
            for (const item of batchGroup.items) {
                const pObj = typeof item.product_id === "object" && item.product_id !== null ? item.product_id : null;
                const pName = pObj?.product_name || (item as unknown as { product_name?: string }).product_name || "Product";
                const pCode = pObj?.product_code || (item as unknown as { product_code?: string }).product_code || "";

                let desc = pName;
                if (pCode) desc += `\nCODE: ${pCode}`;

                const uObj = typeof item.unit_id === "object" && item.unit_id !== null ? item.unit_id : null;
                const uom = uObj?.unit_shortcut || uObj?.unit_name || (item as unknown as { uom?: string }).uom || "PCS";

                let physValue = "........................................................................";
                if (showPhysicalCount) {
                    if (item.physical_count !== null && item.physical_count !== undefined) {
                        physValue = formatQty(item.physical_count);
                    } else {
                        physValue = "—";
                    }
                }

                tableBody.push([
                    String(itemSeq++),
                    desc,
                    uom.toUpperCase(),
                    formatQty(item.system_count),
                    physValue,
                ]);
            }
        }
    }

    autoTable(doc, {
        body: tableBody,
        startY: currentY,
        margin: { left: margin, right: margin },
        styles: {
            fontSize: 7,
            cellPadding: 1.5,
            textColor: [0, 0, 0],
            lineColor: [229, 231, 235], // gray-200 border
            lineWidth: 0.1,
        },
        columnStyles: {
            0: { cellWidth: 8, halign: "center" },
            1: { cellWidth: 82 },
            2: { cellWidth: 15, halign: "center" },
            3: { cellWidth: 25, halign: "right", fontStyle: "bold" },
            4: { cellWidth: 60, halign: showPhysicalCount ? "right" : "center", textColor: showPhysicalCount ? [0, 0, 0] : [156, 163, 175], fontStyle: showPhysicalCount ? "bold" : "normal" },
        },
        alternateRowStyles: {
            fillColor: [255, 255, 255],
        },
    });

    // 4. Compact Neutral Sign-Off Authorization Block
    // @ts-expect-error lastAutoTable injected by jspdf-autotable
    const finalY = (doc.lastAutoTable?.finalY || 140) + 6;

    let signY = finalY;
    if (signY > pageHeight - 24) {
        doc.addPage();
        signY = 18;
    }

    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, signY - 2, pageWidth - margin, signY - 2);

    const signColW = (pageWidth - (margin * 2) - 12) / 3;

    // Sign Column 1: Auditor
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81); // gray-700
    doc.text("1. COUNTED & AUDITED BY:", margin, signY + 3);
    doc.setDrawColor(0, 0, 0); // Pure Black Line
    doc.line(margin, signY + 12, margin + signColW, signY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(107, 114, 128);
    doc.text("Plant Floor Auditor Signature & Date", margin, signY + 15);

    // Sign Column 2: Supervisor
    const col2SignX = margin + signColW + 6;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text("2. VERIFIED & CHECKED BY:", col2SignX, signY + 3);
    doc.setDrawColor(0, 0, 0);
    doc.line(col2SignX, signY + 12, col2SignX + signColW, signY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(107, 114, 128);
    doc.text("Warehouse Supervisor Signature & Date", col2SignX, signY + 15);

    // Sign Column 3: Operations Manager
    const col3SignX = col2SignX + signColW + 6;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text("3. APPROVED BY:", col3SignX, signY + 3);
    doc.setDrawColor(0, 0, 0);
    doc.line(col3SignX, signY + 12, col3SignX + signColW, signY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(107, 114, 128);
    doc.text("Plant Operations Manager Signature & Date", col3SignX, signY + 15);

    // Page Numbers Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(6.5);
        doc.setTextColor(156, 163, 175);
        doc.text(
            `Mama Pinas Manufacturing • Manufacturing Physical Inventory Count Sheet #${piNo} • Page ${i} of ${totalPages}`,
            pageWidth / 2,
            pageHeight - 4,
            { align: "center" }
        );
    }

    return doc;
}

export function downloadManufacturingCountSheetPDF(sheet: MmPhysicalInventorySheet, options?: PDFExportOptions) {
    const doc = generateManufacturingCountSheetPDF(sheet, options);
    const piNo = sheet.pi_no || `PI-${sheet.physical_inventory_id}`;
    const modeSuffix = options?.showPhysicalCount ? "WithPhysicalCount" : "BlindCount";
    doc.save(`Mfg_CountSheet_${piNo}_${modeSuffix}.pdf`);
}
