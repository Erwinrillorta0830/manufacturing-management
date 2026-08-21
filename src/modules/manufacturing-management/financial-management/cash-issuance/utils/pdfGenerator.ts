import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { Disbursement } from "../types";
import { sumLineAmounts } from "./disbursement-utils";

export const generateDisbursementPDF = (disbursement: Disbursement, paperSize: "A4" | "58mm") => {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: paperSize === "A4" ? "a4" : [58, 250] // 250mm length for thermal roll, will cut automatically
    });

    const isA4 = paperSize === "A4";
    const marginX = isA4 ? 15 : 3; // Ultra tight margins for 58mm
    const center = isA4 ? 105 : 29;
    const totalPayables = sumLineAmounts(disbursement.payables || []);
    const totalPayments = sumLineAmounts(disbursement.payments || []);
    const formatAmount = (amount: number) => amount.toLocaleString("en-US", { minimumFractionDigits: 2 });
    let startY = isA4 ? 15 : 8;

    // --- 1. HEADER ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(isA4 ? 14 : 8);
    doc.text("MEN2 MARKETING", center, startY, { align: "center" });

    startY += (isA4 ? 6 : 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(isA4 ? 10 : 7);
    doc.text("DISBURSEMENT VOUCHER", center, startY, { align: "center" });

    // --- 2. VOUCHER INFO (Ink Saving: Text Only) ---
    startY += (isA4 ? 12 : 6);
    doc.setFontSize(isA4 ? 9 : 6);

    const printLine = (label: string, value: string, x: number, y: number, valueOffsetX: number) => {
        doc.setFont("helvetica", "bold");
        doc.text(label, x, y);
        doc.setFont("helvetica", "normal");
        const textLines = doc.splitTextToSize(value || "N/A", isA4 ? 80 : 38);
        doc.text(textLines, x + valueOffsetX, y);
        return textLines.length;
    };

    if (isA4) {
        printLine("Voucher No:", disbursement.docNo, marginX, startY, 25);
        printLine("Status:", disbursement.status, 120, startY, 20);
        startY += 6;
        printLine("Date:", disbursement.transactionDate ? format(new Date(disbursement.transactionDate), "MMM dd, yyyy") : "N/A", marginX, startY, 25);
        printLine("Trans Type:", disbursement.transactionTypeName || "N/A", 120, startY, 20);
        startY += 6;
        printLine("Department:", disbursement.departmentName || "N/A", marginX, startY, 25);
        startY += 6;
        const linesUsed = printLine("Payee:", disbursement.payeeName || "N/A", marginX, startY, 25);
        startY += (linesUsed * 5) + 1;
        const remarkLines = printLine("Remarks:", disbursement.remarks || "None", marginX, startY, 25);
        startY += (remarkLines * 5) + 5;
    } else {
        // 58mm Stacked Layout
        printLine("No:", disbursement.docNo, marginX, startY, 8); startY += 4;
        printLine("Date:", disbursement.transactionDate ? format(new Date(disbursement.transactionDate), "MMM dd, yy") : "N/A", marginX, startY, 8); startY += 4;
        const lines = printLine("Payee:", disbursement.payeeName || "N/A", marginX, startY, 11); startY += (lines * 3) + 1;
    }

    // --- 3. PAYABLES TABLE (Debits) ---
    doc.setFont("helvetica", "bold");
    doc.text("PAYABLES (DEBIT)", marginX, startY);
    startY += (isA4 ? 3 : 2);

    autoTable(doc, {
        startY: startY,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
            fontSize: isA4 ? 8 : 5,
            textColor: 0,
            lineColor: [150, 150, 150],
            lineWidth: 0.1,
            cellPadding: isA4 ? 2 : 1 // 🚀 Tight padding for 58mm
        },
        headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', lineColor: 0, lineWidth: 0.2 },
        footStyles: { fillColor: [245, 245, 245], textColor: 0, fontStyle: 'bold', lineColor: 0, lineWidth: 0.2 },
        // 🚀 SMART LAYOUT: A4 gets 4 columns, 58mm gets 3 columns (Account and Remarks are merged!)
        head: isA4 ? [['Ref / PO', 'GL Account', 'Remarks', 'Amount']] : [['Ref', 'Account/Rem', 'Amount']],
        body: (disbursement.payables || []).map(p => {
            if (isA4) {
                return [p.referenceNo || 'N/A', p.accountTitle || `COA: ${p.coaId}`, p.remarks || '-', { content: p.amount.toLocaleString('en-US', {minimumFractionDigits: 2}), styles: { halign: 'right' } }];
            } else {
                // 58mm Column Merge
                const acctRem = `${p.accountTitle || `COA: ${p.coaId}`}\n${p.remarks ? `(${p.remarks})` : ''}`;
                return [p.referenceNo || '-', acctRem, { content: p.amount.toLocaleString('en-US', {minimumFractionDigits: 2}), styles: { halign: 'right' } }];
            }
        }),
        foot: isA4
            ? [[
                { content: 'TOTAL PAYABLES', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: formatAmount(totalPayables), styles: { halign: 'right', fontStyle: 'bold' } }
            ]]
            : [[
                { content: 'TOTAL PAYABLES', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: formatAmount(totalPayables), styles: { halign: 'right', fontStyle: 'bold' } }
            ]]
    });

    // @ts-expect-error - TypeScript doesn't recognize lastAutoTable property from jsPDF autotable plugin
    startY = doc.lastAutoTable.finalY + (isA4 ? 8 : 4);

    // --- 4. PAYMENTS TABLE (Credits) ---
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENTS (CREDIT)", marginX, startY);
    startY += (isA4 ? 3 : 2);

    autoTable(doc, {
        startY: startY,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: { fontSize: isA4 ? 8 : 5, textColor: 0, lineColor: [150, 150, 150], lineWidth: 0.1, cellPadding: isA4 ? 2 : 1 },
        headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', lineColor: 0, lineWidth: 0.2 },
        footStyles: { fillColor: [245, 245, 245], textColor: 0, fontStyle: 'bold', lineColor: 0, lineWidth: 0.2 },
        head: isA4 ? [['Check / Ref', 'Bank / GL Account', 'Amount']] : [['Check', 'Bank/GL', 'Amount']],
        body: (disbursement.payments || []).map(p => {
            if (isA4) {
                const bankInfo = p.bankName ? `${p.bankName}${p.bankAccountNumber ? ` (${p.bankAccountNumber})` : ''}` : '';
                const accountTitle = p.accountTitle || `COA: ${p.coaId}`;
                const bankAndAccount = bankInfo ? `${accountTitle}\n[Bank: ${bankInfo}]` : accountTitle;
                return [p.checkNo || 'N/A', bankAndAccount, { content: p.amount.toLocaleString('en-US', {minimumFractionDigits: 2}), styles: { halign: 'right' } }];
            } else {
                return [
                    p.checkNo || 'N/A',
                    p.accountTitle || `COA: ${p.coaId}`,
                    { content: p.amount.toLocaleString('en-US', {minimumFractionDigits: 2}), styles: { halign: 'right' } }
                ];
            }
        }),
        foot: [[
            { content: 'TOTAL PAYMENTS', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
            { content: formatAmount(totalPayments), styles: { halign: 'right', fontStyle: 'bold' } }
        ]]
    });

    // @ts-expect-error - TypeScript doesn't recognize lastAutoTable property from jsPDF autotable plugin
    startY = doc.lastAutoTable.finalY + (isA4 ? 8 : 5);

    // --- 5. TOTALS ---
    doc.setFontSize(isA4 ? 10 : 7);
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL AMOUNT: Php ${disbursement.totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`, marginX, startY);

    startY += (isA4 ? 20 : 10);

    // --- 6. SIGNATORIES ---
    doc.setFontSize(isA4 ? 8 : 5);
    if (isA4) {
        doc.setFont("helvetica", "normal");
        doc.text("Prepared By:", 20, startY); doc.text("Approved By:", 80, startY); doc.text("Posted By:", 140, startY);
        startY += 10;
        doc.setFont("helvetica", "bold");
        doc.text(disbursement.encoderName || "____________________", 20, startY); doc.text(disbursement.approverName || "____________________", 80, startY); doc.text(disbursement.postedByName || "____________________", 140, startY);
        startY += 4;
        doc.setFont("helvetica", "normal"); doc.setFontSize(7);
        doc.text("Accounting Dept", 20, startY); doc.text("Management", 80, startY); doc.text("Finance Dept", 140, startY);
        startY += 20;
        doc.setFontSize(8);
        doc.text("Received By (Print Name & Signature): ___________________________________   Date: _____________", 20, startY);
    } else {
        // Tight 58mm Signatures
        doc.setFont("helvetica", "normal"); doc.text("Prepared By:", marginX, startY); doc.setFont("helvetica", "bold"); doc.text(disbursement.encoderName || "System", marginX, startY + 3);
        startY += 7;
        doc.setFont("helvetica", "normal"); doc.text("Approved By:", marginX, startY); doc.setFont("helvetica", "bold"); doc.text(disbursement.approverName || "______________", marginX, startY + 3);
        startY += 7;
        doc.setFont("helvetica", "normal"); doc.text("Received By:", marginX, startY); doc.text("______________", marginX, startY + 4);
    }

    const pdfBlobUrl = doc.output('bloburl');
    window.open(pdfBlobUrl, '_blank');
};
