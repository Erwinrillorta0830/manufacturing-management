import { procurementDirectusFetch } from "../procurement/_directus";
import { formatPhtDateTime } from "../services/core-api.service";

export const ATTACHMENT_COLLECTION = "purchase_order_receiving_attachments";
export const DIRECTUS_QA_RECEIVING_FOLDER_ID = "f127ca8c-7127-4260-a82c-ad6c5ff21330";
export const MAX_ATTACHMENT_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
export const MAX_ATTACHMENTS_PER_RECEIPT = 20;

export interface QaReceivingAttachment {
    id: number;
    receiving_header_id?: number | null;
    purchase_order_id: number;
    purchase_order_product_id?: number | null;
    directus_file_id: string;
    file_name: string;
    mime_type: string | null;
    file_size: number;
    remarks?: string | null;
    created_by?: number | null;
    created_at: string;
    updated_at?: string | null;
}

export class QaAttachmentError extends Error {
    constructor(message: string, readonly status = 400, readonly code = "QA_ATTACHMENT_ERROR") {
        super(message);
    }
}

export function isQaAttachmentError(error: unknown): error is QaAttachmentError {
    return error instanceof QaAttachmentError;
}

function rows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray((body as { data: unknown }).data)
        ? (body as { data: Record<string, unknown>[] }).data
        : [];
}

function singleRow(body: unknown): Record<string, unknown> | null {
    return body && typeof body === "object" && "data" in body && (body as { data: unknown }).data && typeof (body as { data: unknown }).data === "object"
        ? (body as { data: Record<string, unknown> }).data
        : null;
}

export function mapAttachmentRecord(row: Record<string, unknown>): QaReceivingAttachment {
    return {
        id: Number(row.id),
        receiving_header_id: row.receiving_header_id != null ? Number(row.receiving_header_id) : null,
        purchase_order_id: Number(row.purchase_order_id),
        purchase_order_product_id: row.purchase_order_product_id != null ? Number(row.purchase_order_product_id) : null,
        directus_file_id: String(row.directus_file_id || ""),
        file_name: String(row.file_name || ""),
        mime_type: row.mime_type != null ? String(row.mime_type) : null,
        file_size: Number(row.file_size || 0),
        remarks: row.remarks != null ? String(row.remarks) : null,
        created_by: row.created_by != null ? Number(row.created_by) : null,
        created_at: String(row.created_at || ""),
        updated_at: row.updated_at != null ? String(row.updated_at) : null,
    };
}

export async function getQaReceivingAttachments(options: {
    purchaseOrderId: number;
    receivingHeaderId?: number | null;
}): Promise<QaReceivingAttachment[]> {
    const params = new URLSearchParams({
        "filter[purchase_order_id][_eq]": String(options.purchaseOrderId),
        sort: "-created_at,-id",
        limit: "-1"
    });

    if (options.receivingHeaderId != null && options.receivingHeaderId > 0) {
        params.set("filter[receiving_header_id][_eq]", String(options.receivingHeaderId));
    }

    const res = await procurementDirectusFetch(`/items/${ATTACHMENT_COLLECTION}?${params.toString()}`);
    if (!res.ok) {
        throw new QaAttachmentError("Failed to fetch QA receiving attachments.", res.status, "FETCH_FAILED");
    }

    const data = await res.json();
    return rows(data).map(mapAttachmentRecord);
}

export async function uploadQaReceivingAttachment(input: {
    purchaseOrderId: number;
    receivingHeaderId?: number | null;
    purchaseOrderProductId?: number | null;
    file: File;
    remarks?: string | null;
    actorId?: number | null;
}): Promise<QaReceivingAttachment> {
    const { purchaseOrderId, receivingHeaderId, purchaseOrderProductId, file, remarks, actorId } = input;

    if (!file || !(file instanceof File)) {
        throw new QaAttachmentError("No valid file provided.", 400, "FILE_REQUIRED");
    }

    if (file.size <= 0) {
        throw new QaAttachmentError("File is empty (0 bytes).", 400, "FILE_EMPTY");
    }

    if (file.size > MAX_ATTACHMENT_FILE_SIZE) {
        throw new QaAttachmentError(
            `File size exceeds the 20 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB uploaded).`,
            413,
            "FILE_TOO_LARGE"
        );
    }

    // Check count constraint
    const existing = await getQaReceivingAttachments({
        purchaseOrderId,
        receivingHeaderId: receivingHeaderId || null
    });

    if (existing.length >= MAX_ATTACHMENTS_PER_RECEIPT) {
        throw new QaAttachmentError(
            `Maximum limit of ${MAX_ATTACHMENTS_PER_RECEIPT} attachments per receipt reached.`,
            422,
            "ATTACHMENT_LIMIT_EXCEEDED"
        );
    }

    // 1. Upload binary file to Directus /files
    const formData = new FormData();
    if (DIRECTUS_QA_RECEIVING_FOLDER_ID) {
        formData.append("folder", DIRECTUS_QA_RECEIVING_FOLDER_ID);
    }
    formData.set("file", file, file.name);
    formData.set("title", file.name);

    const token = process.env.DIRECTUS_STATIC_TOKEN || "";
    const directusBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.DIRECTUS_URL || "").replace(/\/+$/, "");
    const fileRes = await fetch(`${directusBaseUrl}/files`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formData
    });

    const fileBody = await fileRes.json().catch(() => ({}));
    if (!fileRes.ok) {
        const message = fileBody?.errors?.[0]?.message || fileBody?.message || "Failed to store file asset.";
        throw new QaAttachmentError(message, fileRes.status, "FILE_STORAGE_FAILED");
    }

    const directusFileId = fileBody?.data?.id;
    if (!directusFileId || typeof directusFileId !== "string") {
        throw new QaAttachmentError("File storage did not return a valid file ID.", 502, "FILE_ID_MISSING");
    }

    // 2. Persist record into purchase_order_receiving_attachments with Philippine Local Time (PHT)
    const nowPht = formatPhtDateTime(new Date());

    const insertPayload: Record<string, unknown> = {
        purchase_order_id: purchaseOrderId,
        receiving_header_id: receivingHeaderId && receivingHeaderId > 0 ? receivingHeaderId : null,
        purchase_order_product_id: purchaseOrderProductId && purchaseOrderProductId > 0 ? purchaseOrderProductId : null,
        directus_file_id: directusFileId,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
        remarks: remarks?.trim() || null,
        created_by: actorId ?? null,
        created_at: nowPht,
        updated_at: nowPht
    };

    const recordRes = await procurementDirectusFetch(`/items/${ATTACHMENT_COLLECTION}`, {
        method: "POST",
        body: JSON.stringify(insertPayload)
    });

    const recordBody = await recordRes.json().catch(() => ({}));
    if (!recordRes.ok) {
        // Rollback uploaded file from directus
        try {
            await fetch(`${directusBaseUrl}/files/${directusFileId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (cleanupErr) {
            console.error("Failed to clean up orphaned Directus file after record creation failed:", cleanupErr);
        }
        const message = recordBody?.errors?.[0]?.message || recordBody?.message || "Failed to create attachment record.";
        throw new QaAttachmentError(message, recordRes.status, "RECORD_CREATION_FAILED");
    }

    const createdRow = singleRow(recordBody);
    if (!createdRow) {
        throw new QaAttachmentError("Directus did not return the created attachment row.", 502, "INVALID_RESPONSE");
    }

    return mapAttachmentRecord(createdRow);
}

export async function deleteQaReceivingAttachment(attachmentId: number): Promise<void> {
    if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) {
        throw new QaAttachmentError("Invalid attachment ID.", 400, "INVALID_ID");
    }

    // 1. Fetch record to get directus_file_id
    const fetchRes = await procurementDirectusFetch(`/items/${ATTACHMENT_COLLECTION}/${attachmentId}`);
    if (!fetchRes.ok) {
        if (fetchRes.status === 404) return; // Already gone
        throw new QaAttachmentError("Failed to find attachment record.", fetchRes.status, "NOT_FOUND");
    }

    const recordData = await fetchRes.json();
    const row = singleRow(recordData);
    const directusFileId = row ? String(row.directus_file_id || "") : "";

    // 2. Delete metadata row
    const deleteRes = await procurementDirectusFetch(`/items/${ATTACHMENT_COLLECTION}/${attachmentId}`, {
        method: "DELETE"
    });
    if (!deleteRes.ok && deleteRes.status !== 404) {
        throw new QaAttachmentError("Failed to delete attachment record.", deleteRes.status, "DELETE_FAILED");
    }

    // 3. Delete underlying file from Directus
    if (directusFileId) {
        const token = process.env.DIRECTUS_STATIC_TOKEN || "";
        const directusBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.DIRECTUS_URL || "").replace(/\/+$/, "");
        try {
            await fetch(`${directusBaseUrl}/files/${encodeURIComponent(directusFileId)}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (fileErr) {
            console.warn("Could not delete Directus file during attachment removal:", fileErr);
        }
    }
}
