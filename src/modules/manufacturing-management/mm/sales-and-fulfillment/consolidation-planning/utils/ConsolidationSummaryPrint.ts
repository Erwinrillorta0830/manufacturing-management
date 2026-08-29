interface PrintInvoiceProduct {
    productName: string;
    productCode: string;
    quantity: number;
}

interface PrintInvoice {
    invoiceNo: string;
    customerName: string;
    products: PrintInvoiceProduct[];
}

interface PrintDetail {
    productId: number;
    productCode: string;
    productName: string;
    brand: string;
    category: string;
    unit: string;
    orderedQuantity: number;
    pickedQuantity: number;
}

interface PrintLotAllocation {
    productId: number;
    productName: string;
    lotName: string;
    batchNo: string;
    manufacturingDate: string | null;
    expiryDate: string | null;
    quantity: number;
}

interface PrintData {
    consolidatorNo: string;
    branchName: string;
    status: string;
    createdAt: string;
    details: PrintDetail[];
    invoices: PrintInvoice[];
    totalInvoices: number;
    allocations: PrintLotAllocation[];
}

export async function generateConsolidationPDF(data: PrintData) {
    const jsPDFModule = await import("jspdf");
    const JsPDFClass = (jsPDFModule.default || jsPDFModule.jsPDF) as unknown as typeof import("jspdf").jsPDF;

    const autoTableModule = await import("jspdf-autotable");
    const autoTable = (autoTableModule.default || autoTableModule) as unknown as typeof import("jspdf-autotable").default;

    const doc = new JsPDFClass({ orientation: "landscape", unit: "mm", format: "a4" });

    const pageWidth = doc.internal.pageSize.width;

    // ── Header ──
    doc.setFontSize(12).setFont("helvetica", "bold");
    doc.text("WAREHOUSE PICK LIST", pageWidth / 2, 10, { align: "center" });

    doc.setFontSize(7).setFont("helvetica", "normal");
    doc.text("Vertex Terminal - Manufacturing", pageWidth / 2, 14, { align: "center" });

    // ── Batch Info Block ──
    doc.setFontSize(8).setFont("helvetica", "bold");
    doc.text(`Batch No:`, 8, 21);
    doc.setFont("helvetica", "normal");
    doc.text(data.consolidatorNo, 27, 21);

    doc.setFont("helvetica", "bold");
    doc.text(`Branch:`, 108, 21);
    doc.setFont("helvetica", "normal");
    doc.text(data.branchName, 124, 21);

    doc.setFont("helvetica", "bold");
    doc.text(`Status:`, 8, 26);
    doc.setFont("helvetica", "normal");
    doc.text(data.status, 27, 26);

    doc.setFont("helvetica", "bold");
    doc.text(`Created:`, 108, 26);
    doc.setFont("helvetica", "normal");
    doc.text(new Date(data.createdAt).toLocaleDateString(), 124, 26);

    doc.setFont("helvetica", "bold");
    doc.text(`Invoices:`, 8, 31);
    doc.setFont("helvetica", "normal");
    doc.text(`${data.totalInvoices}`, 27, 31);

    doc.setFont("helvetica", "bold");
    doc.text(`Products:`, 108, 31);
    doc.setFont("helvetica", "normal");
    doc.text(`${data.details.length}`, 124, 31);

    doc.setFont("helvetica", "bold");
    doc.text("Printed:", pageWidth - 63, 31);
    doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleString(), pageWidth - 46, 31);

    // ── Product Lines Table ──
    const sortedDetails = [...data.details].sort((a, b) =>
        a.brand.localeCompare(b.brand, undefined, { sensitivity: "base" }) ||
        a.category.localeCompare(b.category, undefined, { sensitivity: "base" }) ||
        a.productName.localeCompare(b.productName, undefined, { sensitivity: "base" })
    );
    const detailByProduct = new Map(sortedDetails.map((detail) => [detail.productId, detail]));
    const bodyRows = data.allocations.map((allocation) => {
        const detail = detailByProduct.get(allocation.productId);
        return [
            detail?.productCode || "-",
            detail?.productName || allocation.productName,
            `${detail?.brand || "Unbranded"}\n${detail?.category || "Uncategorized"}`,
            allocation.lotName,
            allocation.batchNo,
            allocation.manufacturingDate || "-",
            allocation.expiryDate || "-",
            detail?.unit || "-",
            String(allocation.quantity),
            "",
        ];
    });

    autoTable(doc, {
        startY: 35,
        margin: { left: 8, right: 8 },
        head: [["CODE", "PRODUCT", "BRAND / CATEGORY", "STORAGE LOT", "BATCH", "MFG DATE", "EXPIRY", "UOM", "PLAN QTY", "ACTUAL"]],
        body: bodyRows,
        theme: "grid",
        headStyles: {
            textColor: [0, 0, 0],
            fontStyle: "bold",
            fontSize: 7,
            fillColor: [240, 240, 240],
            cellPadding: 1,
            halign: "center",
        },
        styles: {
            fontSize: 7,
            cellPadding: 1.2,
            textColor: [0, 0, 0],
        },
        columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: "auto" },
            2: { cellWidth: 38 },
            3: { cellWidth: 27 },
            4: { cellWidth: 30 },
            5: { cellWidth: 23, halign: "center" },
            6: { cellWidth: 23, halign: "center" },
            7: { cellWidth: 14, halign: "center" },
            8: { cellWidth: 18, halign: "center" },
            9: { cellWidth: 18, halign: "center" },
        },
        didDrawPage: (d: { pageNumber: number }) => {
            doc.setFontSize(7).setTextColor(161, 161, 170);
            doc.text(
                `${data.consolidatorNo} | Page ${d.pageNumber}`,
                14,
                doc.internal.pageSize.height - 8
            );
        },
    });

    const extDoc = doc as unknown as { lastAutoTable: { finalY: number } };
    let currentY = extDoc.lastAutoTable.finalY + 6;

    // ── Invoice Summary Section ──
    currentY = currentY + 2;

    if (currentY > 165) {
        doc.addPage();
        currentY = 20;
    }

    doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(0, 0, 0);
    doc.text("INVOICE SUMMARY", 8, currentY);
    currentY += 2;

    const invoiceRows = data.invoices.flatMap((invoice) => {
        if (invoice.products.length === 0) {
            return [[invoice.invoiceNo, invoice.customerName, "No product details", "-", "-"]];
        }

        return invoice.products.map((product, index) => [
            index === 0 ? invoice.invoiceNo : "",
            index === 0 ? invoice.customerName : "",
            product.productName,
            product.productCode || "-",
            String(product.quantity),
        ]);
    });

    autoTable(doc, {
        startY: currentY,
        margin: { left: 8, right: 8, bottom: 10 },
        head: [["INVOICE", "CUSTOMER", "PRODUCT", "CODE", "QTY"]],
        body: invoiceRows,
        theme: "grid",
        headStyles: {
            textColor: [0, 0, 0],
            fontStyle: "bold",
            fontSize: 5.5,
            fillColor: [245, 245, 245],
            cellPadding: 0.6,
        },
        styles: {
            fontSize: 5.5,
            cellPadding: 0.5,
            textColor: [0, 0, 0],
            lineColor: [210, 210, 210],
            lineWidth: 0.1,
            overflow: "linebreak",
        },
        columnStyles: {
            0: { cellWidth: 38 },
            1: { cellWidth: 45 },
            2: { cellWidth: "auto" },
            3: { cellWidth: 35 },
            4: { cellWidth: 18, halign: "center" },
        },
        didDrawPage: (pageData: { pageNumber: number }) => {
            doc.setFontSize(7).setTextColor(161, 161, 170);
            doc.text(
                `${data.consolidatorNo} | Page ${pageData.pageNumber}`,
                14,
                doc.internal.pageSize.height - 8
            );
        },
    });

    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

    // ── Signature Lines ──
    currentY = Math.max(currentY + 8, extDoc.lastAutoTable.finalY + 10);
    if (currentY > 180) {
        doc.addPage();
        currentY = 20;
    }

    doc.setDrawColor(0, 0, 0).setLineWidth(0.3);

    // Prepared by
    doc.line(14, currentY, 130, currentY);
    doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(0, 0, 0);
    doc.text("PREPARED BY", 14, currentY + 4);
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(80, 80, 80);
    doc.text("Name & Signature", 14, currentY + 8);
    doc.text("Date:", 14, currentY + 12);

    // Checked by
    doc.line(160, currentY, 283, currentY);
    doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(0, 0, 0);
    doc.text("CHECKED BY", 160, currentY + 4);
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(80, 80, 80);
    doc.text("Name & Signature", 160, currentY + 8);
    doc.text("Date:", 160, currentY + 12);

    currentY += 18;

    // Approved by
    if (currentY + 18 < doc.internal.pageSize.height - 10) {
        doc.line(14, currentY, 130, currentY);
        doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(0, 0, 0);
        doc.text("APPROVED BY", 14, currentY + 4);
        doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(80, 80, 80);
        doc.text("Name & Signature", 14, currentY + 8);
        doc.text("Date:", 14, currentY + 12);

        doc.line(160, currentY, 283, currentY);
        doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(0, 0, 0);
        doc.text("RECEIVED BY", 160, currentY + 4);
        doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(80, 80, 80);
        doc.text("Name & Signature", 160, currentY + 8);
        doc.text("Date:", 160, currentY + 12);
    }

    doc.save(`WORKSHEET_${data.consolidatorNo}.pdf`);
}
