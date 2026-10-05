import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export interface DirectusFileMetadata {
    id: string;
    fileName: string | null;
    mimeType: string | null;
    fileSize: number | null;
}

export function directusFileId(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (!value || typeof value !== "object") return null;
    const id = (value as Record<string, unknown>).id;
    return typeof id === "string" && id.trim()
        ? id.trim()
        : typeof id === "number" && Number.isFinite(id)
            ? String(id)
            : null;
}

export function directusFileMetadata(value: unknown): DirectusFileMetadata | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const id = directusFileId(record);
    if (!id) return null;
    const fileSize = Number(record.filesize);
    return {
        id,
        fileName: typeof record.filename_download === "string"
            ? record.filename_download
            : typeof record.title === "string"
                ? record.title
                : null,
        mimeType: typeof record.type === "string" ? record.type : null,
        fileSize: Number.isFinite(fileSize) && fileSize >= 0 ? fileSize : null
    };
}

export async function fetchDirectusFileMetadata(fileIds: Array<string | null | undefined>): Promise<Map<string, DirectusFileMetadata>> {
    const ids = Array.from(new Set(fileIds.filter((id): id is string => Boolean(id))));
    if (!DIRECTUS_URL || ids.length === 0) return new Map();

    const idBatches: string[][] = [];
    for (let index = 0; index < ids.length; index += 100) {
        idBatches.push(ids.slice(index, index + 100));
    }
    const rowsByBatch = await Promise.all(idBatches.map(async (idBatch) => {
        const params = new URLSearchParams({
            fields: "id,filename_download,title,type,filesize",
            limit: "-1",
            "filter[id][_in]": idBatch.join(",")
        });
        try {
            const response = await fetch(`${DIRECTUS_URL}/files?${params.toString()}`, {
                headers,
                cache: "no-store"
            });
            if (!response.ok) return [];
            const payload = await response.json().catch(() => null) as { data?: unknown } | null;
            return Array.isArray(payload?.data) ? payload.data : [];
        } catch (error) {
            console.warn("Unable to load Directus evidence file metadata:", error);
            return [];
        }
    }));
    return new Map(rowsByBatch.flat().map(directusFileMetadata).filter((metadata): metadata is DirectusFileMetadata => Boolean(metadata)).map((metadata) => [metadata.id, metadata]));
}
