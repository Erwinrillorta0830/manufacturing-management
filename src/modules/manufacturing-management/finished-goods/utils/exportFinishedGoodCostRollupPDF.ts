import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Product, BOMItem } from "../types";
import { CostingBreakdown, OverheadSummary } from "../costing";

interface ExportPDFParams {
    selectedProduct: Product;
    versionName?: string;
    standardPrice: number;
    standardCogs: number;
    standardBreakdown: CostingBreakdown;
    standardOverheads: OverheadSummary;
    standardGrossProfit: number;
    standardGrossMarginPercent: number;
    standardNetProfit: number;
    standardNetMarginPercent: number;
    editedBOM: BOMItem[];
    versionOverheadItems?: Record<string, unknown>[];
}

export function generateFinishedGoodCostRollupPDF({
    selectedProduct,
    versionName = "v1.0 (Active)",
    standardPrice,
    standardCogs,
    standardBreakdown,
    standardGrossProfit,
    standardGrossMarginPercent,
    standardNetProfit,
    standardNetMarginPercent,
    editedBOM,
    versionOverheadItems = []
}: ExportPDFParams) {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    const getFinalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // Header Banner (Dark Slate Blue)
    doc.setFillColor(30, 41, 59); // #1E293B
    doc.rect(0, 0, pageWidth, 28, "F");

    // Company & Document Title
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("MANUFACTURING MANAGEMENT SYSTEM", margin, 12);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("FINISHED GOODS STANDARD COSTING & RECIPE REPORT", margin, 18);

    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text("CONFIDENTIAL • FINANCIAL & PRODUCTION AUDIT", margin, 23);

    // Document Metadata Right-aligned
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    doc.setFontSize(8);
    doc.text(`Ref: FG-${selectedProduct.sku || "PROD"}-${Date.now().toString().slice(-4)}`, pageWidth - margin, 12, { align: "right" });
    doc.text(`Generated: ${dateStr}`, pageWidth - margin, 18, { align: "right" });
    doc.text(`Base Currency: PHP (PHP)`, pageWidth - margin, 23, { align: "right" });

    let currentY = 34;

    // Product Identity Box
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 22, 2, 2, "FD");

    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("PRODUCT METADATA", margin + 4, currentY + 6);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139); // slate-500

    // Meta Column 1
    doc.text("Product Name:", margin + 4, currentY + 12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(String(selectedProduct.title || "Finished Good"), margin + 26, currentY + 12);

    // Meta Column 2
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("SKU / Code:", margin + 95, currentY + 12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(String(selectedProduct.sku || "N/A"), margin + 115, currentY + 12);

    // Meta Row 2
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Base UOM:", margin + 4, currentY + 17);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(String(selectedProduct.baseUom || "PCS"), margin + 26, currentY + 17);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("BOM Version:", margin + 95, currentY + 17);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(String(versionName), margin + 115, currentY + 17);

    currentY += 27;

    const fmtCurrency = (val: number | string | null | undefined): string => {
        const num = Number(val || 0);
        return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Financial Profitability Rollup Summary Table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text("EXECUTIVE FINANCIAL & MARGIN SUMMARY", margin, currentY);
    currentY += 3;

    autoTable(doc, {
        startY: currentY,
        head: [["Target Selling Price", "Unit COGS", "Gross Profit / Unit", "Gross Margin %", "Net Profit / Unit", "Net Margin %"]],
        body: [[
            `PHP ${fmtCurrency(standardPrice)}`,
            `PHP ${fmtCurrency(standardCogs)}`,
            `PHP ${fmtCurrency(standardGrossProfit)}`,
            `${standardGrossMarginPercent.toFixed(1)}%`,
            `PHP ${fmtCurrency(standardNetProfit)}`,
            `${standardNetMarginPercent.toFixed(1)}%`
        ]],
        theme: "grid",
        headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 8,
            halign: "center"
        },
        bodyStyles: {
            fontSize: 9,
            fontStyle: "bold",
            halign: "center",
            textColor: [15, 23, 42]
        },
        margin: { left: margin, right: margin }
    });

    currentY = getFinalY() + 8;

    // Cost Composition Breakdown Table
    const matCost = standardBreakdown.materialsCost || 0;
    const labCost = standardBreakdown.directLaborCost || 0;
    const macCost = standardBreakdown.machineOverheadCost || 0;
    const cusCost = standardBreakdown.customOverheadCost || 0;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text("UNIT COST COMPOSITION BREAKDOWN", margin, currentY);
    currentY += 3;

    autoTable(doc, {
        startY: currentY,
        head: [["Raw Materials Cost", "Direct Labor Cost", "Machine Overhead Cost", "Custom & Allocated Overhead"]],
        body: [[
            `PHP ${fmtCurrency(matCost)}`,
            `PHP ${fmtCurrency(labCost)}`,
            `PHP ${fmtCurrency(macCost)}`,
            `PHP ${fmtCurrency(cusCost)}`
        ]],
        theme: "plain",
        headStyles: {
            fillColor: [241, 245, 249],
            textColor: [71, 85, 105],
            fontStyle: "bold",
            fontSize: 7.5,
            halign: "center"
        },
        bodyStyles: {
            fontSize: 8.5,
            fontStyle: "bold",
            halign: "center",
            textColor: [15, 23, 42]
        },
        margin: { left: margin, right: margin }
    });

    currentY = getFinalY() + 8;

    // Bill of Materials (BOM) Recipe Table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text("1. BILL OF MATERIALS (BOM) & COMPONENT INGREDIENTS", margin, currentY);
    currentY += 3;

    const bomRows = editedBOM.map(item => {
        const itemObj = item as Record<string, unknown>;
        const qty = Number(item.quantity || 0);
        const wastage = Number(item.wastagePercent ?? itemObj.wastageFactor ?? 0);
        const landed = Number(item.landedCost ?? itemObj.unitCost ?? itemObj.costPerUnit ?? 0);
        const extCost = qty * (1 + (wastage / 100)) * landed;
        return [
            item.name || "Ingredient",
            String(item.type || "ingredient").toUpperCase(),
            qty.toString(),
            item.uom || "PCS",
            `${wastage}%`,
            `PHP ${fmtCurrency(landed)}`,
            `PHP ${fmtCurrency(extCost)}`
        ];
    });

    autoTable(doc, {
        startY: currentY,
        head: [["Component Name", "Type", "Qty", "UOM", "Wastage %", "Landed Unit Cost", "Extended Cost"]],
        body: bomRows.length > 0 ? bomRows : [["No ingredients registered in active BOM recipe", "-", "-", "-", "-", "-", "-"]],
        theme: "striped",
        headStyles: {
            fillColor: [51, 65, 85],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 7.5
        },
        columnStyles: {
            0: { fontStyle: "bold", cellWidth: 50 },
            1: { halign: "center", fontSize: 7 },
            2: { halign: "right" },
            3: { halign: "center" },
            4: { halign: "right" },
            5: { halign: "right" },
            6: { halign: "right", fontStyle: "bold" }
        },
        bodyStyles: {
            fontSize: 8
        },
        margin: { left: margin, right: margin }
    });

    currentY = getFinalY() + 8;

    // Overhead Management Items Table (If any exist)
    if (versionOverheadItems && versionOverheadItems.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.text("2. OVERHEAD MANAGEMENT ALLOCATION ITEMS", margin, currentY);
        currentY += 3;

        const ohRows = versionOverheadItems.map(oh => {
            const ohObj = oh as Record<string, unknown>;
            return [
                (ohObj.overhead_name as string) || "Overhead",
                (ohObj.remarks as string) || "—",
                ohObj.is_active !== false ? "Active" : "Inactive",
                `PHP ${fmtCurrency(Number(ohObj.cost_per_unit || ohObj.cost || 0))}`
            ];
        });

        autoTable(doc, {
            startY: currentY,
            head: [["Overhead Item Name", "Remarks / Description", "Status", "Cost Per Unit"]],
            body: ohRows,
            theme: "striped",
            headStyles: {
                fillColor: [71, 85, 105],
                textColor: [255, 255, 255],
                fontStyle: "bold",
                fontSize: 7.5
            },
            columnStyles: {
                0: { fontStyle: "bold" },
                1: { fontSize: 7.5 },
                2: { halign: "center", fontSize: 7.5 },
                3: { halign: "right", fontStyle: "bold" }
            },
            bodyStyles: {
                fontSize: 8
            },
            margin: { left: margin, right: margin }
        });

        currentY = getFinalY() + 12;
    } else {
        currentY += 6;
    }

    // Sign-off / Approval Block (Ensure it fits or push if near page end)
    if (currentY + 30 > pageHeight) {
        doc.addPage();
        currentY = 20;
    }

    doc.setDrawColor(203, 213, 225);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);

    const colWidth = (pageWidth - (margin * 2)) / 3;

    // Prepared By
    doc.text("PREPARED BY (Costing Engineer):", margin, currentY);
    doc.line(margin, currentY + 14, margin + colWidth - 8, currentY + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Signature over Printed Name & Date", margin, currentY + 18);

    // Reviewed By
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text("REVIEWED BY (Plant Manager):", margin + colWidth, currentY);
    doc.line(margin + colWidth, currentY + 14, margin + (colWidth * 2) - 8, currentY + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Signature over Printed Name & Date", margin + colWidth, currentY + 18);

    // Approved By
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text("APPROVED BY (Finance Director / VP):", margin + (colWidth * 2), currentY);
    doc.line(margin + (colWidth * 2), currentY + 14, pageWidth - margin, currentY + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Signature over Printed Name & Date", margin + (colWidth * 2), currentY + 18);

    // Trigger Browser Download
    const cleanFileName = `Cost_Rollup_${(selectedProduct.sku || "FG").replace(/[^a-zA-Z0-9_-]/g, "")}_${Date.now()}.pdf`;
    doc.save(cleanFileName);
}
