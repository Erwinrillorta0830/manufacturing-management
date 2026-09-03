import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type RfidManifestRow = {
    productName: string;
    sku: string;
    rfid: string;
};

type RfidManifestData = {
    poNumber: string;
    supplierName: string;
    generatedAt: string;
    rows: RfidManifestRow[];
};

export function generateRfidManifestPdf(data: RfidManifestData) {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("RFID Receiving Manifest", 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Purchase Order: ${data.poNumber || "—"}`, 14, 24);
    doc.text(`Supplier: ${data.supplierName || "—"}`, 14, 30);
    doc.text(`Generated: ${data.generatedAt}`, pageWidth - 14, 24, { align: "right" });
    doc.text(`RFID tags: ${data.rows.length}`, pageWidth - 14, 30, { align: "right" });

    autoTable(doc, {
        startY: 38,
        head: [["#", "Product", "SKU", "RFID Tag"]],
        body: data.rows.map((row, index) => [String(index + 1), row.productName || "—", row.sku || "—", row.rfid]),
        theme: "grid",
        styles: { font: "helvetica", fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: "bold" },
        columnStyles: {
            0: { cellWidth: 14, halign: "center" },
            1: { cellWidth: 90 },
            2: { cellWidth: 65 },
            3: { cellWidth: "auto", font: "courier" },
        },
        didDrawPage: (page) => {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(`Page ${page.pageNumber}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
        },
    });

    doc.save(`RFID_Manifest_${data.poNumber || "receiving"}.pdf`);
}
