import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

export interface WalletItem {
    id: string;
    type: "CASH" | "CHECK" | "MEMO" | "RETURN" | "ADJUSTMENT" | "EWT";
    label: string;
    originalAmount: number;
    dbId?: number;
    findingId?: number;
    customerName?: string;
    balanceTypeId?: number;
    isLocal?: boolean;
    invoiceId?: number;
}

export interface GeneralFinding {
    id: number;
    findingName: string;
    chartOfAccount?: { id?: number; coaId?: number; accountTitle: string; };
}

export interface Allocation {
    invoiceId: number;
    invoiceNo: string;
    customerName: string;
    sourceTempId: string;
    amountApplied: number;
}

export const generateAdjustmentPDF = (
    wallet: WalletItem[],
    findings: GeneralFinding[],
    allocations: Allocation[],
    docNo: string,
    salesmanName: string
) => {
    // Filter for shortage adjustments only (balanceTypeId === 2)
    const adjustments = wallet.filter(w => w.type === 'ADJUSTMENT' && w.balanceTypeId === 2);

    if (adjustments.length === 0) {
        alert("No shortage records found to print.");
        return;
    }

    // Initialize A4 document (Portrait, Points)
    const doc = new jsPDF("p", "pt", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = 40;

    // --- 1. HEADER (Letterhead) ---
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("MEN2 MARKETING CORPORATION", pageWidth / 2, currentY, { align: "center" });

    currentY += 20;
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Treasury Department - Settlement Adjustment Report", pageWidth / 2, currentY, { align: "center" });

    currentY += 30;
    doc.setFontSize(9);
    doc.text(`Document No: ${docNo}`, 40, currentY);
    doc.text(`Collector: ${salesmanName}`, pageWidth - 40, currentY, { align: "right" });
    doc.text(`Printed On: ${format(new Date(), "yyyy-MM-dd HH:mm")}`, pageWidth - 40, currentY + 15, { align: "right" });

    currentY += 35;

    // --- 2. SUMMARY BLOCK ---
    const shortageTotal = adjustments.reduce((sum, w) => sum + w.originalAmount, 0);

    autoTable(doc, {
        startY: currentY,
        head: [["Metric", "Value"]],
        body: [
            ["Total Shortage (Credit)", `P ${shortageTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`],
            ["Number of Shortages", adjustments.length.toString()]
        ],
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: 40, right: pageWidth - 200 },
        tableWidth: 'wrap'
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentY = (doc as any).lastAutoTable.finalY + 30;

    // --- 3. ADJUSTMENTS TABLE ---
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Shortage Details", 40, currentY);

    currentY += 10;

    const adjustmentRows = adjustments.map(adj => {
        // Look up the finding details using findingId
        const finding = findings.find(f => f.id === adj.findingId);
        const accountTitle = finding?.chartOfAccount?.accountTitle || finding?.findingName || adj.label || "Unknown";
        const remarks = adj.customerName || "-";

        // Look up allocation to get receipt and customer info
        const allocation = allocations.find(a => a.sourceTempId === adj.id);
        const receiptNo = allocation?.invoiceNo || "-";
        const customer = allocation?.customerName || "-";

        return [
            accountTitle,
            remarks,
            receiptNo,
            customer,
            `P ${adj.originalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}`
        ];
    });

    autoTable(doc, {
        startY: currentY,
        head: [["Account / Finding", "Remarks", "Receipt No.", "Customer", "Amount"]],
        body: adjustmentRows,
        theme: "grid",
        headStyles: { fillColor: [155, 89, 182] }, // Purple
        styles: { fontSize: 8 },
        columnStyles: {
            0: { fontStyle: 'bold' },
            4: { halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 40, right: 40 },
    });

    // --- 4. PAGINATION (Page X of Y footer) ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150);
        doc.text(
            `Page ${i} of ${pageCount}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 20,
            { align: "center" }
        );
    }

    // --- 5. EXPORT ---
    doc.save(`Settlement_Adjustments_${docNo}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
};
