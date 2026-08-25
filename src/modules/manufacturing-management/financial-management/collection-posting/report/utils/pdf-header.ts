import type jsPDF from "jspdf";
import type { CompanyProfile } from "../../company-profile";

export const COLLECTION_PDF_MARGIN = 40;

export const getCollectionPdfTableWidth = (doc: jsPDF): number =>
    doc.internal.pageSize.getWidth() - (COLLECTION_PDF_MARGIN * 2);

export function drawCollectionPdfHeader(
    doc: jsPDF,
    companyProfile: CompanyProfile | null,
    title: string,
): number {
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = 40;

    const logoDataUrl = companyProfile?.logoDataUrl;
    const logoMatch = logoDataUrl?.match(/^data:image\/(png|jpe?g);base64,/i);
    if (logoDataUrl && logoMatch) {
        try {
            const imageFormat = logoMatch[1].toUpperCase() === "JPG"
                ? "JPEG"
                : logoMatch[1].toUpperCase();
            doc.addImage(logoDataUrl, imageFormat, COLLECTION_PDF_MARGIN, 24, 48, 48);
        } catch {
            // Keep the report usable when a configured logo cannot be embedded by jsPDF.
        }
    }

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(companyProfile?.companyName || "Company profile unavailable", pageWidth / 2, currentY, { align: "center" });

    currentY += 16;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    if (companyProfile?.address) {
        const addressLines = doc.splitTextToSize(companyProfile.address, pageWidth - 160);
        doc.text(addressLines, pageWidth / 2, currentY, { align: "center" });
        currentY += addressLines.length * 10;
    }
    if (companyProfile?.tin) {
        doc.setFont("helvetica", "bold");
        doc.text("TIN: " + companyProfile.tin, pageWidth / 2, currentY, { align: "center" });
        currentY += 12;
    }

    currentY += 8;
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(title, pageWidth / 2, currentY, { align: "center" });

    return currentY + 30;
}
