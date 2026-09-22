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

    const doc = new JsPDFClass({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageWidth = doc.internal.pageSize.width;

    // ── Header ──
    doc.setFontSize(12).setFont("helvetica", "bold");
    doc.text("WAREHOUSE PICK LIST", pageWidth / 2, 10, { align: "center" });

    doc.setFontSize(7).setFont("helvetica", "normal");
    doc.text("Manufacturing", pageWidth / 2, 14, { align: "center" });

    // ── Batch Info Block ──
    doc.setFontSize(8).setFont("helvetica", "bold");
    doc.text(`Batch No:`, 10, 20);
    doc.setFont("helvetica", "normal");
    doc.text(data.consolidatorNo, 26, 20);

    doc.setFont("helvetica", "bold");
    doc.text(`Branch:`, 110, 20);
    doc.setFont("helvetica", "normal");
    doc.text(data.branchName, 126, 20);

    doc.setFont("helvetica", "bold");
    doc.text(`Status:`, 10, 24);
    doc.setFont("helvetica", "normal");
    doc.text(data.status, 26, 24);

    doc.setFont("helvetica", "bold");
    doc.text(`Created:`, 110, 24);
    doc.setFont("helvetica", "normal");
    doc.text(new Date(data.createdAt).toLocaleDateString(), 126, 24);

    doc.setFont("helvetica", "bold");
    doc.text(`Orders:`, 10, 28);
    doc.setFont("helvetica", "normal");
    doc.text(`${data.totalInvoices}`, 26, 28);

    doc.setFont("helvetica", "bold");
    doc.text(`Products:`, 110, 28);
    doc.setFont("helvetica", "normal");
    doc.text(`${data.details.length}`, 126, 28);

    doc.setFont("helvetica", "bold");
    doc.text("Printed:", pageWidth - 55, 28);
    doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleString(), pageWidth - 42, 28);

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
            `${detail?.brand || "-"}`,
            allocation.lotName,
            allocation.batchNo,
            allocation.expiryDate || "-",
            detail?.unit || "-",
            String(allocation.quantity),
            "",
        ];
    });

    autoTable(doc, {
        startY: 32,
        margin: { left: 10, right: 10 },
        head: [["CODE", "PRODUCT", "BRAND / CATEGORY", "LOT / RACK", "BATCH", "EXPIRY", "UOM", "PICKED QTY", "ACTUAL"]],
        body: bodyRows,
        theme: "grid",
        headStyles: {
            textColor: [0, 0, 0],
            fontStyle: "bold",
            fontSize: 6.5,
            fillColor: [240, 240, 240],
            cellPadding: 1,
            halign: "center",
        },
        styles: {
            fontSize: 6.5,
            cellPadding: 1,
            textColor: [0, 0, 0],
        },
        columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: "auto" },
            2: { cellWidth: 28 },
            3: { cellWidth: 24 },
            4: { cellWidth: 24 },
            5: { cellWidth: 18, halign: "center" },
            6: { cellWidth: 12, halign: "center" },
            7: { cellWidth: 16, halign: "center" },
            8: { cellWidth: 16, halign: "center" },
        },
        didDrawPage: (d: { pageNumber: number }) => {
            doc.setFontSize(7).setTextColor(161, 161, 170);
            doc.text(
                `${data.consolidatorNo} | Page ${d.pageNumber}`,
                10,
                doc.internal.pageSize.height - 6
            );
        },
    });

    const extDoc = doc as unknown as { lastAutoTable: { finalY: number } };
    let currentY = extDoc.lastAutoTable.finalY + 6;

    // ── Order Summary Section ──
    if (currentY > 230) {
        doc.addPage();
        currentY = 16;
    }

    doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(0, 0, 0);
    doc.text("ORDER SUMMARY", 10, currentY);
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
        margin: { left: 10, right: 10, bottom: 10 },
        head: [["ORDER", "CUSTOMER", "PRODUCT", "CODE", "QTY"]],
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
            0: { cellWidth: 32 },
            1: { cellWidth: 38 },
            2: { cellWidth: "auto" },
            3: { cellWidth: 28 },
            4: { cellWidth: 16, halign: "center" },
        },
        didDrawPage: (pageData: { pageNumber: number }) => {
            doc.setFontSize(7).setTextColor(161, 161, 170);
            doc.text(
                `${data.consolidatorNo} | Page ${pageData.pageNumber}`,
                10,
                doc.internal.pageSize.height - 6
            );
        },
    });

    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // ── Signature Lines ──
    if (currentY > 250) {
        doc.addPage();
        currentY = 20;
    }

    doc.setDrawColor(0, 0, 0).setLineWidth(0.3);

    // Prepared by
    doc.line(10, currentY, 95, currentY);
    doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(0, 0, 0);
    doc.text("PREPARED BY", 10, currentY + 3.5);
    doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(80, 80, 80);
    doc.text("Name & Signature", 10, currentY + 7);
    doc.text("Date:", 10, currentY + 10.5);

    // Checked by
    doc.line(115, currentY, 200, currentY);
    doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(0, 0, 0);
    doc.text("CHECKED BY", 115, currentY + 3.5);
    doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(80, 80, 80);
    doc.text("Name & Signature", 115, currentY + 7);
    doc.text("Date:", 115, currentY + 10.5);

    currentY += 15;

    // Approved by
    if (currentY + 15 < doc.internal.pageSize.height - 8) {
        doc.line(10, currentY, 95, currentY);
        doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(0, 0, 0);
        doc.text("APPROVED BY", 10, currentY + 3.5);
        doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(80, 80, 80);
        doc.text("Name & Signature", 10, currentY + 7);
        doc.text("Date:", 10, currentY + 10.5);

        doc.line(115, currentY, 200, currentY);
        doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(0, 0, 0);
        doc.text("RECEIVED BY", 115, currentY + 3.5);
        doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(80, 80, 80);
        doc.text("Name & Signature", 115, currentY + 7);
        doc.text("Date:", 115, currentY + 10.5);
    }

    doc.save(`PICKLIST_${data.consolidatorNo}.pdf`);
}
