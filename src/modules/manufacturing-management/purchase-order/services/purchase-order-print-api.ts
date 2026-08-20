export type PurchaseOrderPrintDocumentType =
    | "PURCHASE_ORDER"
    | "FINANCE_DECISION"
    | "QA_GOODS_RECEIPT"
    | "STORAGE_LOT_ALLOCATION"
    | "LANDED_COST";

export interface PurchaseOrderArchiveDocument {
    archiveId: string;
    documentType: string;
    fileId: string;
    fileName: string;
    workflowRevision: number;
    generatedBy: string;
    generatedAt: string;
    pageCount: number;
}

export interface PurchaseOrderArchiveStatus {
    purchaseOrderId: number;
    status: "NOT_ARCHIVED" | "PARTIALLY_ARCHIVED" | "ARCHIVED";
    complete: boolean;
    requiredDocumentTypes: string[];
    archivedDocumentTypes: string[];
    missingDocumentTypes: string[];
    documents: PurchaseOrderArchiveDocument[];
}

function fileNameFromHeader(value: string | null, fallback: string): string {
    const match = value?.match(/filename="?([^";]+)"?/i);
    return match?.[1] || fallback;
}

export async function downloadPurchaseOrderPrintable(input: {
    purchaseOrderId: number;
    documentType: PurchaseOrderPrintDocumentType;
    historyId?: number | null;
    receivingHeaderId?: number | null;
}): Promise<{ archiveId: string; fileId: string; reused: boolean }> {
    const params = new URLSearchParams({ documentType: input.documentType });
    if (input.historyId) params.set("historyId", String(input.historyId));
    if (input.receivingHeaderId) params.set("receivingHeaderId", String(input.receivingHeaderId));
    const response = await fetch(`/api/manufacturing/purchase-orders/${input.purchaseOrderId}/print?${params.toString()}`, {
        cache: "no-store"
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "The printable document could not be generated.");
    }
    const blob = await response.blob();
    const fallback = `purchase-order-${input.purchaseOrderId}-${input.documentType}.pdf`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileNameFromHeader(response.headers.get("content-disposition"), fallback);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return {
        archiveId: response.headers.get("x-printable-archive-id") || "",
        fileId: response.headers.get("x-printable-archive-file-id") || "",
        reused: response.headers.get("x-printable-archive-reused") === "true"
    };
}

export async function fetchPurchaseOrderArchiveStatus(purchaseOrderId: number): Promise<PurchaseOrderArchiveStatus> {
    const response = await fetch(`/api/manufacturing/purchase-orders/${purchaseOrderId}/archive`, {
        cache: "no-store"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "The purchase-order archive status could not be loaded.");
    return body.data as PurchaseOrderArchiveStatus;
}
