import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { QuotationHeader } from "../types";

export interface SkuHistoryItem {
    productId: number;
    productName: string;
    versions: Record<string, { price: number; cost: number }>;
    rawVersionsList: { price: number; cost: number }[];
}

interface ExportComparativePDFParams {
    projectName: string;
    historyQuotes: QuotationHeader[];
    skuHistoryList: SkuHistoryItem[];
}

export function generateComparativePDF({
    projectName,
    historyQuotes,
    skuHistoryList
}: ExportComparativePDFParams) {
    // Sort quotes identically to UI (ascending ID/Date)
    const sortedHistoryQuotes = [...historyQuotes].sort((a, b) => a.id - b.id);

    const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "letter"
    });

    const getFinalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    // Header Title
    doc.setTextColor(30, 25, 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Project SKU Comparative Pricing Sheet", margin, 20);

    // Meta Box
    doc.setFillColor(240, 240, 245);
    doc.rect(margin, 25, pageWidth - (margin * 2), 10, "F");
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 60);
    doc.text(`PROJECT NAME: ${projectName.toUpperCase()}`, margin + 5, 31.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Tracked over ${sortedHistoryQuotes.length} historical revision periods`, pageWidth - margin - 5, 31.5, { align: "right" });

    // Build Table Headers dynamically
    const headerRow1: unknown[] = [{ content: "FINISHED GOOD SKU", rowSpan: 2, styles: { halign: "left", cellWidth: 35 } }];
    const headerRow2: unknown[] = [];

    sortedHistoryQuotes.forEach(q => {
        // Extract the last part of the quote number (e.g., "REV1" from "QT-20260818-134539-REV1")
        const parts = q.quote_number.split('-');
        const revLabel = parts.length > 2 ? parts[parts.length - 1] : q.quote_number;

        headerRow1.push({ content: revLabel, colSpan: 2, styles: { halign: "center" } });
        headerRow2.push({ content: "PRICE", styles: { halign: "right" } });
        headerRow2.push({ content: "COST", styles: { halign: "right" } });
    });

    // Add Delta Columns
    headerRow1.push({ content: "CUMULATIVE DELTA", colSpan: 2, styles: { halign: "center", fillColor: [235, 230, 240], textColor: [120, 50, 200] } });
    headerRow2.push({ content: "PRICE \u0394", styles: { halign: "right", fillColor: [245, 240, 250], textColor: [120, 50, 200] } });
    headerRow2.push({ content: "COST \u0394", styles: { halign: "right", fillColor: [245, 240, 250], textColor: [120, 50, 200] } });

    // Build Table Body
    const tableBody = skuHistoryList.map(sku => {
        const firstVer = sku.rawVersionsList[0];
        const latestVer = sku.rawVersionsList[sku.rawVersionsList.length - 1];
        const priceDiff = latestVer.price - firstVer.price;
        const costDiff = latestVer.cost - firstVer.cost;

        const row: unknown[] = [
            { content: sku.productName, styles: { fontStyle: "bold", textColor: [30, 25, 45] } }
        ];

        sortedHistoryQuotes.forEach(q => {
            const verInfo = sku.versions[q.quote_number];
            if (verInfo) {
                row.push({ content: `P ${verInfo.price.toFixed(2)}`, styles: { halign: "right", fontStyle: "bold" } });
                row.push({ content: `P ${verInfo.cost.toFixed(2)}`, styles: { halign: "right", textColor: [100, 100, 100] } });
            } else {
                row.push({ content: "-", styles: { halign: "center", textColor: [180, 180, 180] } });
                row.push({ content: "-", styles: { halign: "center", textColor: [180, 180, 180] } });
            }
        });

        // Deltas
        const priceDiffStr = (priceDiff > 0 ? "+" : "") + priceDiff.toFixed(2);
        const costDiffStr = (costDiff > 0 ? "+" : "") + costDiff.toFixed(2);
        
        row.push({ 
            content: priceDiffStr, 
            styles: { 
                halign: "right", 
                fontStyle: "bold", 
                textColor: priceDiff > 0 ? [16, 185, 129] : priceDiff < 0 ? [239, 68, 68] : [150, 150, 150] 
            } 
        });
        row.push({ 
            content: costDiffStr, 
            styles: { 
                halign: "right", 
                fontStyle: "bold", 
                textColor: costDiff > 0 ? [217, 119, 6] : costDiff < 0 ? [16, 185, 129] : [150, 150, 150] 
            } 
        });

        return row;
    });

    autoTable(doc, {
        startY: 40,
        margin: { left: margin, right: margin },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        head: [headerRow1, headerRow2] as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: tableBody as any,
        theme: "plain",
        headStyles: {
            fillColor: [250, 250, 250],
            textColor: [80, 80, 90],
            fontStyle: "bold",
            fontSize: 6,
            cellPadding: 2,
            lineWidth: 0.1,
            lineColor: [220, 220, 220]
        },
        bodyStyles: {
            fontSize: 7,
            cellPadding: 2,
            lineWidth: 0.1,
            lineColor: [230, 230, 230]
        },
        alternateRowStyles: {
            fillColor: [252, 252, 252]
        },
        styles: {
            cellWidth: "auto",
            overflow: "linebreak"
        }
    });

    // Footer
    const finalY = getFinalY();
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Generated for internal system review. Confidential pricing details enclosed.", margin, finalY + 15);

    // Save PDF
    doc.save(`${projectName.replace(/[^a-z0-9]/gi, '_')}_Comparative_Pricing.pdf`);
}
