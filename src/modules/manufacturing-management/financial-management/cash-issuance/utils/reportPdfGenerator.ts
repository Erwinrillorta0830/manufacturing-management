import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { DisbursementDashboardData, DashboardFilters } from "../types";

export const generateReportPDF = (
    data: DisbursementDashboardData | null,
    filters: DashboardFilters
) => {
    if (!data) return;

    const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
    });

    const primaryColor: [number, number, number] = [15, 23, 42]; // Slate-900 / dark navy
    const accentColor: [number, number, number] = [22, 163, 74]; // Emerald-600

    // --- Header ---
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 297, 24, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("MEN2 MARKETING", 10, 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(200, 200, 200);
    doc.text("TREASURY OUTFLOWS EXECUTIVE DASHBOARD (ONE-PAGE REPORT)", 10, 15);

    // Date Generated & Filters info
    const nowStr = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    doc.setFontSize(7.5);
    doc.text(`Generated: ${nowStr}`, 235, 10);
    
    const startStr = filters.startDate ? format(new Date(filters.startDate), "MMM dd, yyyy") : "All Time";
    const endStr = filters.endDate ? format(new Date(filters.endDate), "MMM dd, yyyy") : "Present";
    doc.text(`Period: ${startStr} - ${endStr}`, 235, 15);

    // --- KPI Cards ---
    const startY = 28;
    const cardW = 89;
    const cardH = 15;
    const cardG = 5;
    const xOffsets = [10, 10 + cardW + cardG, 10 + (cardW + cardG) * 2];

    const formatMoney = (amount: number) => `PHP ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const kpis = [
        { title: "TOTAL CASH OUTFLOW", value: formatMoney(data.totalPaid), desc: "Released & Posted Payments", border: primaryColor },
        { title: "OUTFLOW TRANSACTIONS", value: String(data.vouchers?.length || 0), desc: "Volume of Outflow Vouchers", border: accentColor },
        { title: "AVERAGE OUTFLOW SIZE", value: formatMoney(data.vouchers?.length ? data.totalPaid / data.vouchers.length : 0), desc: "Average Value per Outflow", border: [147, 51, 234] }
    ];

    kpis.forEach((kpi, idx) => {
        const x = xOffsets[idx];
        doc.setFillColor(248, 250, 252);
        doc.rect(x, startY, cardW, cardH, "F");
        
        doc.setFillColor(kpi.border[0], kpi.border[1], kpi.border[2]);
        doc.rect(x, startY, 1.5, cardH, "F");

        doc.setTextColor(100, 116, 139);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.text(kpi.title, x + 4, startY + 4);

        doc.setTextColor(kpi.border[0], kpi.border[1], kpi.border[2]);
        doc.setFontSize(10.5);
        doc.text(kpi.value, x + 4, startY + 9);

        doc.setTextColor(148, 163, 184);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.text(kpi.desc, x + 4, startY + 13);
    });

    // --- Outflow Summary by Status Table (Col 1, Row 1) ---
    const summaryData: Record<string, { count: number; total: number }> = {
        "Released": { count: 0, total: 0 },
        "Posted": { count: 0, total: 0 }
    };
    (data.vouchers || []).forEach(v => {
        const status = v.status || "";
        if (status === "Released" || status === "Posted") {
            summaryData[status].count += 1;
            summaryData[status].total += v.paidAmount || 0;
        }
    });

    const summaryRows = Object.entries(summaryData).map(([status, stats]) => [
        status.toUpperCase(),
        String(stats.count),
        formatMoney(stats.total)
    ]);
    const totalCount = Object.values(summaryData).reduce((sum, r) => sum + r.count, 0);
    const totalSum = Object.values(summaryData).reduce((sum, r) => sum + r.total, 0);
    summaryRows.push(["TOTAL OUTFLOWS", String(totalCount), formatMoney(totalSum)]);

    autoTable(doc, {
        startY: 48,
        margin: { left: 10 },
        tableWidth: 89,
        head: [["STATUS", "COUNT", "TOTAL PAID"]],
        body: summaryRows,
        theme: "striped",
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold", cellPadding: 1.5 },
        bodyStyles: { fontSize: 6.5, textColor: [51, 65, 85], cellPadding: 1.2 },
        columnStyles: { 1: { halign: "center" }, 2: { halign: "right", fontStyle: "bold" } },
        didParseCell: (cellData) => {
            if (cellData.row.index === summaryRows.length - 1) {
                cellData.cell.styles.fontStyle = "bold";
                if (cellData.column.index === 2) {
                    cellData.cell.styles.textColor = accentColor;
                }
            }
        }
    });

    // --- Payment Accounts Outflows (Col 2, Row 1) ---
    const paymentRows = (data.paymentCoaExpenses || []).map(p => [
        `GL #${p.coaId}`,
        p.accountTitle || "N/A",
        formatMoney(p.totalExpense)
    ]);

    autoTable(doc, {
        startY: 48,
        margin: { left: 104 },
        tableWidth: 89,
        head: [["PAYMENT COA", "ACCOUNT TITLE", "TOTAL PAID"]],
        body: paymentRows.length > 0 ? paymentRows.slice(0, 3) : [["N/A", "No payment data available", "PHP 0.00"]],
        theme: "striped",
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold", cellPadding: 1.5 },
        bodyStyles: { fontSize: 6.5, textColor: [51, 65, 85], cellPadding: 1.2 },
        columnStyles: { 2: { halign: "right", fontStyle: "bold" } }
    });

    // --- Payable Expense Accounts (Col 3, Row 1) ---
    const payableRows = (data.payableCoaExpenses || []).map(p => [
        `GL #${p.coaId}`,
        p.accountTitle || "N/A",
        formatMoney(p.totalExpense)
    ]);

    autoTable(doc, {
        startY: 48,
        margin: { left: 198 },
        tableWidth: 89,
        head: [["PAYABLE COA", "ACCOUNT TITLE", "TOTAL ACCRUED"]],
        body: payableRows.length > 0 ? payableRows.slice(0, 3) : [["N/A", "No payable data available", "PHP 0.00"]],
        theme: "striped",
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold", cellPadding: 1.5 },
        bodyStyles: { fontSize: 6.5, textColor: [51, 65, 85], cellPadding: 1.2 },
        columnStyles: { 2: { halign: "right", fontStyle: "bold" } }
    });

    // --- Divisions & Departments (Col 1, Row 2) ---
    const divDeptRows: string[][] = [];
    (data.divisionExpenses || []).forEach(div => {
        divDeptRows.push([div.divisionName, "DIV TOTAL", formatMoney(div.totalExpense)]);
        if (div.departments && div.departments.length > 0) {
            div.departments.slice(0, 2).forEach(dept => {
                divDeptRows.push([`  - ${dept.departmentName}`, "DEPT", formatMoney(dept.totalExpense)]);
            });
        }
    });

    autoTable(doc, {
        startY: 84,
        margin: { left: 10 },
        tableWidth: 89,
        head: [["DIVISION / DEPARTMENT", "TYPE", "TOTAL AMOUNT"]],
        body: divDeptRows.length > 0 ? divDeptRows.slice(0, 10) : [["N/A", "N/A", "PHP 0.00"]],
        theme: "striped",
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold", cellPadding: 1.5 },
        bodyStyles: { fontSize: 6.5, textColor: [51, 65, 85], cellPadding: 1.2 },
        columnStyles: { 2: { halign: "right", fontStyle: "bold" } },
        didParseCell: (cellData) => {
            const rawVal = cellData.row.cells[1]?.text;
            const textStr = Array.isArray(rawVal) ? rawVal.join(" ") : String(rawVal || "");
            if (textStr === "DIV TOTAL") {
                cellData.cell.styles.fontStyle = "bold";
                cellData.cell.styles.textColor = primaryColor;
            } else if (textStr === "DEPT") {
                cellData.cell.styles.textColor = [100, 116, 139] as [number, number, number];
            }
        }
    });

    // --- Outflow Register Details (Cols 2 & 3, Row 2) ---
    const detailHeaders = [
        "DOC NO",
        "DATE",
        "PAYEE",
        "STATUS",
        "TOTAL AMOUNT",
        "AMOUNT PAID"
    ];

    const detailRows = (data.vouchers || []).map(v => [
        v.docNo,
        v.transactionDate ? format(new Date(v.transactionDate), "yyyy-MM-dd") : "N/A",
        v.payeeName || "N/A",
        (v.status || "Draft").toUpperCase(),
        v.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
        v.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })
    ]);

    autoTable(doc, {
        startY: 84,
        margin: { left: 104 },
        tableWidth: 183,
        head: [detailHeaders],
        body: detailRows.length > 0 ? detailRows.slice(0, 10) : [["N/A", "N/A", "N/A", "N/A", "0.00", "0.00"]],
        theme: "striped",
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold", cellPadding: 1.5 },
        bodyStyles: { fontSize: 6.5, textColor: [51, 65, 85], cellPadding: 1.2 },
        columnStyles: {
            0: { fontStyle: "bold", cellWidth: 20 },
            1: { cellWidth: 18 },
            2: { cellWidth: 55 },
            3: { halign: "center", cellWidth: 20 },
            4: { halign: "right", cellWidth: 35 },
            5: { halign: "right", fontStyle: "bold", cellWidth: 35 }
        }
    });

    // --- Footer ---
    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("CONFIDENTIAL - FOR INTERNAL USE ONLY. ONE-PAGE EXECUTIVE SUMMARY.", 10, 203);
    doc.text(`Report generated by Antigravity Core VOS - Page 1 of 1`, 240, 203);

    // Save document
    doc.save(`treasury-outflows-dashboard-${format(new Date(), "yyyyMMdd-HHmmss")}.pdf`);
};
