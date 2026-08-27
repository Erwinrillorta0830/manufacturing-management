import { createHash } from "node:crypto";
import { DIRECTUS_URL, procurementDirectusFetch, procurementDirectusHeaders } from "../../procurement/_directus";
import type { PurchaseOrderPrintableSnapshot } from "./types";

const ARCHIVE_COLLECTION = "purchase_order_print_documents";

export const PURCHASE_ORDER_ARCHIVE_CORE_DOCUMENT_TYPES = [
    "PURCHASE_ORDER",
    "QA_GOODS_RECEIPT",
    "LANDED_COST"
] as const;

export type PurchaseOrderArchiveCoreDocumentType = typeof PURCHASE_ORDER_ARCHIVE_CORE_DOCUMENT_TYPES[number];

export class PurchaseOrderPrintArchiveError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = "PurchaseOrderPrintArchiveError";
    }
}

interface ArchiveRecord {
    id?: number | string;
    archive_key?: string | null;
    purchase_order_id?: number | string | null;
    document_type?: string | null;
    source_history_id?: number | string | null;
    source_receiving_header_id?: number | string | null;
    source_computation_id?: number | string | null;
    workflow_revision?: number | string | null;
    directus_file_id?: string | { id?: string } | null;
    content_sha256?: string | null;
    file_name?: string | null;
    page_count?: number | string | null;
    generated_by?: string | null;
    generated_at?: string | null;
}

function archiveFileId(value: ArchiveRecord["directus_file_id"]): string {
    return typeof value === "object" && value ? String(value.id || "") : String(value || "");
}

function safeFileName(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "purchase-order";
}

async function responseData<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => ({}));
    return body.data as T;
}

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
    requiredDocumentTypes: PurchaseOrderArchiveCoreDocumentType[];
    archivedDocumentTypes: string[];
    missingDocumentTypes: PurchaseOrderArchiveCoreDocumentType[];
    documents: PurchaseOrderArchiveDocument[];
}

export async function loadPurchaseOrderArchiveStatus(purchaseOrderId: number): Promise<PurchaseOrderArchiveStatus> {
    const fields = [
        "id",
        "archive_key",
        "purchase_order_id",
        "document_type",
        "workflow_revision",
        "directus_file_id",
        "file_name",
        "page_count",
        "generated_by",
        "generated_at"
    ].join(",");
    const response = await procurementDirectusFetch(
        `/items/${ARCHIVE_COLLECTION}?filter[purchase_order_id][_eq]=${encodeURIComponent(purchaseOrderId)}&fields=${encodeURIComponent(fields)}&sort=-generated_at,-id&limit=-1`
    );
    if (!response.ok) {
        throw new PurchaseOrderPrintArchiveError(
            response.status === 404 ? 503 : response.status >= 500 ? 503 : response.status,
            response.status === 404
                ? "Printable archive storage is not configured. Apply the purchase-order print archive migration first."
                : "Unable to load the purchase-order printable archive."
        );
    }

    const records = (await responseData<ArchiveRecord[]>(response)) || [];
    const documents = records
        .map(record => ({
            archiveId: String(record.id || ""),
            documentType: String(record.document_type || ""),
            fileId: archiveFileId(record.directus_file_id),
            fileName: String(record.file_name || ""),
            workflowRevision: Number(record.workflow_revision) || 0,
            generatedBy: String(record.generated_by || ""),
            generatedAt: String(record.generated_at || ""),
            pageCount: Number(record.page_count) || 0
        }))
        .filter(document => document.archiveId && document.documentType && document.fileId);
    const archivedDocumentTypes = [...new Set(documents.map(document => document.documentType))];
    const missingDocumentTypes = PURCHASE_ORDER_ARCHIVE_CORE_DOCUMENT_TYPES.filter(
        documentType => !archivedDocumentTypes.includes(documentType)
    );
    const complete = missingDocumentTypes.length === 0;

    return {
        purchaseOrderId,
        status: complete
            ? "ARCHIVED"
            : documents.length > 0
                ? "PARTIALLY_ARCHIVED"
                : "NOT_ARCHIVED",
        complete,
        requiredDocumentTypes: [...PURCHASE_ORDER_ARCHIVE_CORE_DOCUMENT_TYPES],
        archivedDocumentTypes,
        missingDocumentTypes,
        documents
    };
}

function stableSnapshotHash(data: PurchaseOrderPrintableSnapshot): string {
    const snapshot = {
        documentType: data.documentType,
        generatedBy: data.generatedBy,
        company: {
            name: data.company.name,
            address: data.company.address,
            contact: data.company.contact,
            email: data.company.email,
            logoSha256: data.company.logoDataUrl
                ? createHash("sha256").update(data.company.logoDataUrl).digest("hex")
                : null
        },
        template: data.template,
        purchaseOrder: data.purchaseOrder,
        lines: data.lines,
        approvals: data.approvals,
        selectedApproval: data.selectedApproval,
        receivingHeaders: data.receivingHeaders,
        receivingRecords: data.receivingRecords,
        movements: data.movements,
        allocations: data.allocations,
        landedCost: data.landedCost,
        sourceReceivingHeaderId: data.sourceReceivingHeaderId
    };
    return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function purchaseOrderPrintArchiveKey(data: PurchaseOrderPrintableSnapshot): string {
    const source = data.documentType === "FINANCE_DECISION"
        ? data.selectedApproval?.historyId || 0
        : data.documentType === "LANDED_COST"
            ? data.landedCost?.computationId || 0
            : data.sourceReceivingHeaderId || 0;
    return [
        data.purchaseOrder.id,
        data.documentType,
        source,
        data.purchaseOrder.workflowRevision,
        data.template.version,
        stableSnapshotHash(data)
    ].join(":");
}

export async function archivePurchaseOrderPdf(input: {
    data: PurchaseOrderPrintableSnapshot;
    pdf: Buffer;
    pageCount: number;
}) {
    const contentSha256 = createHash("sha256").update(input.pdf).digest("hex");
    const idempotencyKey = purchaseOrderPrintArchiveKey(input.data);
    const existingResponse = await procurementDirectusFetch(
        `/items/${ARCHIVE_COLLECTION}?filter[archive_key][_eq]=${encodeURIComponent(idempotencyKey)}&fields=id,directus_file_id,content_sha256,file_name&limit=1`
    );
    if (!existingResponse.ok) {
        throw new PurchaseOrderPrintArchiveError(
            existingResponse.status === 404 ? 503 : existingResponse.status >= 500 ? 503 : existingResponse.status,
            existingResponse.status === 404
                ? "Printable archive storage is not configured. Apply the purchase-order print archive migration first."
                : "Unable to verify the purchase-order printable archive."
        );
    }
    const existing = (await responseData<ArchiveRecord[]>(existingResponse))?.[0];
    if (existing && archiveFileId(existing.directus_file_id)) {
        return {
            archiveId: String(existing.id || ""),
            fileId: archiveFileId(existing.directus_file_id),
            contentSha256,
            reused: true
        };
    }

    const fileName = safeFileName(`${input.data.purchaseOrder.purchaseOrderNumber}_${input.data.documentType}_${input.data.purchaseOrder.workflowRevision}.pdf`);
    const uploadForm = new FormData();
    const pdfBuffer = new ArrayBuffer(input.pdf.byteLength);
    new Uint8Array(pdfBuffer).set(input.pdf);
    uploadForm.set("file", new File([pdfBuffer], fileName, { type: "application/pdf" }));
    uploadForm.set("title", fileName);
    const uploadResponse = await fetch(`${DIRECTUS_URL}/files`, {
        method: "POST",
        headers: { Authorization: procurementDirectusHeaders().Authorization },
        body: uploadForm
    });
    if (!uploadResponse.ok) {
        throw new PurchaseOrderPrintArchiveError(503, "The generated printable could not be stored in Directus file storage.");
    }
    const uploadBody = await uploadResponse.json().catch(() => ({}));
    const fileId = String(uploadBody?.data?.id || "");
    if (!fileId) throw new PurchaseOrderPrintArchiveError(503, "Directus did not return a file identifier for the printable archive.");

    try {
        const archiveResponse = await procurementDirectusFetch(`/items/${ARCHIVE_COLLECTION}`, {
            method: "POST",
            body: JSON.stringify({
                archive_key: idempotencyKey,
                purchase_order_id: input.data.purchaseOrder.id,
                document_type: input.data.documentType,
                source_history_id: input.data.selectedApproval?.historyId || null,
                source_receiving_header_id: input.data.sourceReceivingHeaderId,
                source_computation_id: input.data.landedCost?.computationId || null,
                workflow_revision: input.data.purchaseOrder.workflowRevision,
                directus_file_id: fileId,
                file_name: fileName,
                template_name: input.data.template.name,
                template_version: input.data.template.version,
                content_sha256: contentSha256,
                page_count: input.pageCount,
                generated_by: input.data.generatedBy,
                generated_at: input.data.generatedAt
            })
        });
        if (!archiveResponse.ok) {
            throw new PurchaseOrderPrintArchiveError(503, "The printable file was uploaded, but its archive metadata could not be saved.");
        }
        const archive = await responseData<ArchiveRecord>(archiveResponse);
        return { archiveId: String(archive?.id || ""), fileId, contentSha256, reused: false };
    } catch (error) {
        await fetch(`${DIRECTUS_URL}/files/${encodeURIComponent(fileId)}`, {
            method: "DELETE",
            headers: procurementDirectusHeaders()
        }).catch(() => undefined);
        throw error;
    }
}
