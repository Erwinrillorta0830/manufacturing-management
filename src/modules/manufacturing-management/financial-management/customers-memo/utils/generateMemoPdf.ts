// src/modules/financial-management/accounting/customers-memo/utils/generateMemoPdf.ts
import { DetailedMemo, CompanyProfile } from "../types";
import { PdfEngine } from "@/components/pdf-layout-design/PdfEngine";
import { PdfTemplate } from "@/components/pdf-layout-design/services/pdf-template";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PdfData } from "@/components/pdf-layout-design/types";

interface jsPDFWithAutoTable extends jsPDF {
    lastAutoTable: {
        finalY: number;
    };
}

interface MemoPdfOptions {
    company: CompanyProfile | null;
    selectedTemplate?: PdfTemplate;
}

function money(v: unknown): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "—";
    try {
        return new Date(dateStr).toLocaleDateString("en-PH", {
            year: "numeric", month: "short", day: "2-digit"
        });
    } catch {
        return dateStr;
    }
}

function formatDateTime(dateStr: string | null | undefined): string {
    if (!dateStr) return "—";
    try {
        return new Date(dateStr).toLocaleString("en-PH", {
            year: "numeric", month: "short", day: "2-digit",
            hour: "2-digit", minute: "2-digit"
        });
    } catch {
        return dateStr;
    }
}

export async function generateMemoPdf(details: DetailedMemo, options: MemoPdfOptions) {
    const { header } = details;
    const { company, selectedTemplate } = options;

    const memoNo = header.memo_number || "—";
    const memoType = header.type === 1 ? "Customer Credit Memo"
                   : header.type === 2 ? "Customer Debit Memo"
                   : "Customer Memo";

    const tplConfig = selectedTemplate?.config;
    const finalPaper = tplConfig?.paperSize.toLowerCase() || "a4";
    const finalOrientation = tplConfig?.orientation || "portrait";
    const finalMargins = tplConfig?.margins || { top: 12, left: 12, right: 12, bottom: 12 };

    const doc = new jsPDF({
        orientation: finalOrientation,
        unit: "mm",
        format: finalPaper
    });

    let y = 12;

    if (selectedTemplate) {
        // Apply the template header
        y = await PdfEngine.applyTemplate(doc, selectedTemplate.name, company as PdfData);
        y += 5; // Add some gap after template
    } else {
        // Standard Fallback Header
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(26, 26, 46); // Navy
        doc.text(company?.company_name?.toUpperCase() || "COMPANY NAME", finalMargins.left, y + 8);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        const addr = [company?.company_address, company?.company_city, company?.company_province].filter(Boolean).join(", ");
        doc.text(addr, finalMargins.left, y + 13);
        
        doc.setDrawColor(26, 26, 46);
        doc.setLineWidth(0.8);
        doc.line(finalMargins.left, y + 16, doc.internal.pageSize.getWidth() - finalMargins.right, y + 16);
        y += 22;
    }

    // --- Document Title & Meta ---
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 26, 46);
    doc.text(memoType.toUpperCase(), finalMargins.left, y);
    
    doc.setFontSize(14);
    doc.setFont("courier", "bold");
    const docNoWidth = doc.getTextWidth(memoNo);
    doc.text(memoNo, doc.internal.pageSize.getWidth() - finalMargins.right - docNoWidth, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text(`Date: ${formatDateTime(header.created_at)}`, doc.internal.pageSize.getWidth() - finalMargins.right, y, { align: "right" });
    doc.text(`GL Account: ${header.chart_of_account?.account_title || "—"}`, doc.internal.pageSize.getWidth() - finalMargins.right, y + 4, { align: "right" });
    y += 10;

    // --- Info Grid ---
    doc.setFontSize(9);
    doc.setTextColor(100);
    const infoY = y;
    const col1 = finalMargins.left;
    const col2 = col1 + 25;

    const infoRows = [
        ["Customer:", header.customer_id?.customer_name],
        ["Supplier:", header.supplier_id?.supplier_name],
        ["Salesman:", `${header.salesman_id?.salesman_code} — ${header.salesman_id?.salesman_name}`],
        ["Reason:", header.reason]
    ];

    infoRows.forEach((row, i) => {
        doc.setFont("helvetica", "bold");
        doc.text(row[0], col1, y + (i * 5));
        doc.setFont("helvetica", "normal");
        doc.text(String(row[1] || "—"), col2, y + (i * 5));
    });

    // Summary Box
    const summaryW = 65;
    const summaryX = doc.internal.pageSize.getWidth() - finalMargins.right - summaryW;
    const summaryY = infoY - 2;
    
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.roundedRect(summaryX, summaryY, summaryW, 28, 2, 2, "S");
    
    doc.setFillColor(26, 26, 46);
    doc.roundedRect(summaryX, summaryY, summaryW, 7, 2, 2, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255);
    doc.text("MEMO SUMMARY", summaryX + (summaryW / 2), summaryY + 4.5, { align: "center" });

    doc.setFontSize(9);
    doc.setTextColor(60);
    const sumCol1 = summaryX + 4;
    const sumCol2 = summaryX + summaryW - 4;
    
    const appliedToInvoices = (details.invoices || []).reduce((s, i) => s + (i.amount ?? 0), 0);
    const summaryData = [
        ["Memo Amount", money(header.amount)],
        ["Applied to Invoices", money(appliedToInvoices)],
        ["Linked to Collections", money(header.applied_amount)],
        ["Unapplied Balance", money(header.amount - (header.applied_amount || 0))]
    ];

    summaryData.forEach((row, i) => {
        const rowY = summaryY + 12 + (i * 5);
        if (i === 3) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(0);
            doc.line(summaryX + 2, rowY - 3, summaryX + summaryW - 2, rowY - 3);
        } else {
            doc.setFont("helvetica", "normal");
        }
        doc.text(row[0], sumCol1, rowY);
        doc.text(row[1], sumCol2, rowY, { align: "right" });
    });

    y = infoY + (infoRows.length * 5) + 8;

    // --- Tables ---
    // Applied Invoices
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 26, 46);
    doc.text("APPLIED TO INVOICES", finalMargins.left, y);
    y += 2;

    autoTable(doc, {
        startY: y,
        head: [[
            { content: "Invoice #", styles: { halign: "left" } },
            { content: "Invoice Date", styles: { halign: "left" } },
            { content: "Due Date", styles: { halign: "left" } },
            { content: "Original Amt", styles: { halign: "right" } },
            { content: "Open Bal", styles: { halign: "right" } },
            { content: "Applied Amt", styles: { halign: "right" } }
        ]],
        body: (details.invoices || []).map(inv => [
            inv.invoice_id?.invoice_no || "—",
            formatDate(inv.invoice_id?.invoice_date),
            formatDate(inv.invoice_id?.due_date),
            money(inv.invoice_id?.net_amount),
            "—",
            money(inv.amount)
        ]),
        theme: "striped",
        headStyles: { fillColor: [240, 240, 245], textColor: [50, 50, 50], fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
            3: { halign: "right" },
            4: { halign: "right" },
            5: { halign: "right" }
        },
        margin: finalMargins,
        didDrawPage: (data) => {
            y = data.cursor?.y || y;
        }
    });

    y = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 10;

    // Linked Collections
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 26, 46);
    doc.text("LINKED TO COLLECTIONS", finalMargins.left, y);
    y += 2;

    autoTable(doc, {
        startY: y,
        head: [[
            { content: "Collection Date", styles: { halign: "left" } },
            { content: "Ref / Check #", styles: { halign: "left" } },
            { content: "Total Collected", styles: { halign: "right" } },
            { content: "Unused Bal", styles: { halign: "right" } },
            { content: "Linked Amt", styles: { halign: "right" } }
        ]],
        body: (details.collections || []).map(c => [
            "—",
            c.collection_id?.docNo || "—",
            "—",
            "—",
            money(c.amount)
        ]),
        theme: "striped",
        headStyles: { fillColor: [240, 240, 245], textColor: [50, 50, 50], fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
            2: { halign: "right" },
            3: { halign: "right" },
            4: { halign: "right" }
        },
        margin: finalMargins,
        didDrawPage: (data) => {
            y = data.cursor?.y || y;
        }
    });

    y = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 15;

    // --- Signatures ---
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y > pageHeight - 40) {
        doc.addPage();
        y = 20;
    }

    const signW = (doc.internal.pageSize.getWidth() - finalMargins.left - finalMargins.right - 20) / 3;
    const signX1 = finalMargins.left;
    const signX2 = signX1 + signW + 10;
    const signX3 = signX2 + signW + 10;

    const drawSign = (x: number, label: string, name: string) => {
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100);
        doc.text(label.toUpperCase(), x, y);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text(name || " ", x, y + 10);
        
        doc.setDrawColor(100);
        doc.setLineWidth(0.2);
        doc.line(x, y + 11, x + signW, y + 11);
        
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120);
        doc.text("Signature over Printed Name / Date", x, y + 14);
    };

    let encoderName = "System";
    const enc = header.encoder_id;
    if (enc && typeof enc === 'object' && enc.user_fname) {
        encoderName = `${enc.user_fname} ${enc.user_lname || ""}`.trim();
    }

    drawSign(signX1, "Prepared By", encoderName);
    drawSign(signX2, "Checked By", "");
    drawSign(signX3, "Approved By", "");

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text("This document is system-generated and valid without a wet signature unless otherwise stated.", finalMargins.left, pageHeight - 10);
    doc.text(`Printed: ${formatDateTime(new Date().toISOString())}`, doc.internal.pageSize.getWidth() - finalMargins.right, pageHeight - 10, { align: "right" });

    doc.save(`${memoType}_${memoNo}_${Date.now()}.pdf`);
}
