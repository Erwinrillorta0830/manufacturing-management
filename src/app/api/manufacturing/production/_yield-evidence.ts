import { DIRECTUS_URL, headers, formatPhtDateTime } from "@/app/api/manufacturing/directus-api";
import type { YieldEvidenceChannel } from "@/modules/manufacturing-management/manufacturing-job-order-inspection-qa/utils/yield-evidence";
import { validateManufacturingEvidenceChannelBatch } from "@/modules/manufacturing-management/production-workflow/services/production-yield-image";

export interface YieldEvidenceUpload {
    file: File;
    clientEvidenceKey: string;
}

export interface YieldEvidenceRow {
    evidence_id: number | string;
    ledger_id: number | string;
    directus_file_id: string | { id?: string };
    evidence_type: YieldEvidenceChannel;
    client_evidence_key: string;
    uploaded_by: number | string;
    uploaded_at: string;
    sort_order: number;
    file_size: number | string;
}

export class YieldEvidencePersistenceError extends Error {
    constructor(message: string, readonly status = 502, readonly upstreamStatus?: number) {
        super(message);
        this.name = "YieldEvidencePersistenceError";
    }
}

function directusFileHeaders(): Record<string, string> {
    return headers.Authorization ? { Authorization: headers.Authorization } : {};
}

export function validateYieldEvidenceUploads(
    files: File[],
    rawKeys: unknown,
    label: string,
    required: boolean,
    legacyKeyPrefix?: string
): { uploads: YieldEvidenceUpload[]; error: string | null } {
    if (required && files.length === 0) {
        return { uploads: [], error: `${label} is required.` };
    }
    if (Array.isArray(rawKeys) && rawKeys.length !== files.length) {
        return { uploads: [], error: `${label} files do not match their upload identifiers.` };
    }
    if (rawKeys !== undefined && !Array.isArray(rawKeys)) {
        return { uploads: [], error: `${label} identifiers are invalid. Please reselect the files and retry.` };
    }
    if (files.length === 0) return { uploads: [], error: null };

    const fileError = validateManufacturingEvidenceChannelBatch(0, 0, files, label);
    if (fileError) return { uploads: [], error: fileError };

    const keys = Array.isArray(rawKeys) ? rawKeys : [];
    const uploads: YieldEvidenceUpload[] = [];
    const seenKeys = new Set<string>();
    for (let index = 0; index < files.length; index += 1) {
        const key = String(keys[index] || (legacyKeyPrefix ? `${legacyKeyPrefix}-${index + 1}` : "")).trim();
        if (!key || key.length > 36 || seenKeys.has(key)) {
            return { uploads: [], error: `${label} identifiers are missing or invalid. Please reselect the files and retry.` };
        }
        seenKeys.add(key);
        uploads.push({ file: files[index], clientEvidenceKey: key });
    }
    return { uploads, error: null };
}

export async function uploadYieldEvidenceFile(file: File, title: string, signal?: AbortSignal): Promise<string> {
    const formData = new FormData();
    formData.set("file", file, file.name);
    formData.set("title", title.slice(0, 180));
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}/files`, {
            method: "POST",
            headers: directusFileHeaders(),
            body: formData,
            cache: "no-store",
            signal
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new YieldEvidencePersistenceError(
            `Evidence upload could not reach Directus: ${error instanceof Error ? error.message : "network error"}.`
        );
    }
    const payload = await response.json().catch(() => null) as { data?: { id?: unknown } } | null;
    if (!response.ok) {
        throw new YieldEvidencePersistenceError(`Evidence upload failed with HTTP ${response.status}.`, 502, response.status);
    }
    if (!payload?.data?.id) {
        throw new YieldEvidencePersistenceError("Evidence upload returned an invalid response.");
    }
    return String(payload.data.id);
}

export async function loadYieldEvidenceRows(
    ledgerId: number,
    channel: YieldEvidenceChannel,
    signal?: AbortSignal
): Promise<YieldEvidenceRow[]> {
    const query = new URLSearchParams({
        "filter[ledger_id][_eq]": String(ledgerId),
        "filter[evidence_type][_eq]": channel,
        fields: "evidence_id,ledger_id,directus_file_id,evidence_type,client_evidence_key,uploaded_by,uploaded_at,sort_order,file_size",
        limit: "-1",
        sort: "sort_order,evidence_id"
    });
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_evidence?${query}`, {
            headers,
            cache: "no-store",
            signal
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new YieldEvidencePersistenceError(
            `Load ${channel.toLowerCase()} could not reach Directus: ${error instanceof Error ? error.message : "network error"}.`
        );
    }
    const payload = await response.json().catch(() => null) as { data?: unknown } | null;
    if (!response.ok) {
        throw new YieldEvidencePersistenceError(`Load ${channel.toLowerCase()} failed with HTTP ${response.status}.`, 502, response.status);
    }
    if (!Array.isArray(payload?.data)) {
        throw new YieldEvidencePersistenceError(`Load ${channel.toLowerCase()} returned an invalid response.`);
    }
    return payload.data as YieldEvidenceRow[];
}

async function createYieldEvidenceRow(
    ledgerId: number,
    channel: YieldEvidenceChannel,
    clientEvidenceKey: string,
    fileId: string,
    sortOrder: number,
    fileSize: number,
    uploaderId: number,
    signal?: AbortSignal
): Promise<void> {
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_evidence`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                ledger_id: ledgerId,
                directus_file_id: fileId,
                evidence_type: channel,
                client_evidence_key: clientEvidenceKey,
                uploaded_by: uploaderId,
                uploaded_at: formatPhtDateTime(),
                sort_order: sortOrder,
                file_size: fileSize
            }),
            cache: "no-store",
            signal
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new YieldEvidencePersistenceError(
            `Save ${channel.toLowerCase()} record could not reach Directus: ${error instanceof Error ? error.message : "network error"}.`
        );
    }
    if (!response.ok) {
        throw new YieldEvidencePersistenceError(`Save ${channel.toLowerCase()} record failed with HTTP ${response.status}.`, 502, response.status);
    }
}

async function deleteUnlinkedYieldEvidenceFile(fileId: string): Promise<void> {
    try {
        await fetch(`${DIRECTUS_URL}/files/${encodeURIComponent(fileId)}`, {
            method: "DELETE",
            headers: directusFileHeaders(),
            cache: "no-store"
        });
    } catch (error) {
        console.warn(`Unable to clean up unlinked yield evidence ${fileId}:`, error);
    }
}

export async function persistYieldEvidenceUploads(options: {
    ledgerId: number;
    channel: YieldEvidenceChannel;
    uploads: YieldEvidenceUpload[];
    uploaderId: number;
    title: string;
    signal?: AbortSignal;
    primaryExistingFileId?: string | null;
    preuploadedFileIds?: Map<string, string>;
    existingRows?: YieldEvidenceRow[];
}): Promise<string[]> {
    const { ledgerId, channel, uploads, uploaderId, title, signal, primaryExistingFileId, preuploadedFileIds } = options;
    if (uploads.length === 0) return [];

    const existingRows = options.existingRows ?? await loadYieldEvidenceRows(ledgerId, channel, signal);
    const existingByKey = new Map(existingRows.map((row) => [row.client_evidence_key, row]));
    const newUploads = uploads.filter((upload) => !existingByKey.has(upload.clientEvidenceKey));
    const existingBytes = existingRows.reduce((total, row) => total + Math.max(0, Number(row.file_size) || 0), 0);
    const batchError = validateManufacturingEvidenceChannelBatch(
        existingRows.length,
        existingBytes,
        newUploads.map((upload) => upload.file),
        channel.toLowerCase()
    );
    if (batchError) {
        throw new YieldEvidencePersistenceError(batchError, 422);
    }
    const fileIds: string[] = [];
    for (let index = 0; index < uploads.length; index += 1) {
        const upload = uploads[index];
        const existing = existingByKey.get(upload.clientEvidenceKey);
        if (existing) {
            const id = typeof existing.directus_file_id === "object"
                ? String(existing.directus_file_id.id || "")
                : String(existing.directus_file_id || "");
            if (!id) throw new YieldEvidencePersistenceError("A saved evidence record has no file reference.");
            fileIds.push(id);
            continue;
        }

        const preuploadedFileId = preuploadedFileIds?.get(upload.clientEvidenceKey);
        const legacyFileId = index === 0 ? primaryExistingFileId || undefined : undefined;
        const uploadedHere = !preuploadedFileId && !legacyFileId;
        const fileId = preuploadedFileId
            || legacyFileId
            || await uploadYieldEvidenceFile(upload.file, `${title} · ${upload.file.name}`, signal);
        try {
            await createYieldEvidenceRow(ledgerId, channel, upload.clientEvidenceKey, fileId, index, upload.file.size, uploaderId, signal);
        } catch (error) {
            if (uploadedHere && error instanceof YieldEvidencePersistenceError) {
                await deleteUnlinkedYieldEvidenceFile(fileId);
            }
            throw error;
        }
        fileIds.push(fileId);
    }
    return fileIds;
}

