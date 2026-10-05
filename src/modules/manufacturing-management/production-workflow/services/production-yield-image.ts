export const PRODUCTION_YIELD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const MANUFACTURING_EVIDENCE_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

export const PRODUCTION_YIELD_IMAGE_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp"
] as const;

export type ProductionYieldImageType = typeof PRODUCTION_YIELD_IMAGE_TYPES[number];

export const MANUFACTURING_EVIDENCE_VIDEO_TYPES = [
    "video/mp4",
    "video/webm",
    "video/quicktime"
] as const;

export type ManufacturingEvidenceVideoType = typeof MANUFACTURING_EVIDENCE_VIDEO_TYPES[number];

export function normalizedMediaMimeType(mimeType: string | null | undefined): string {
    return String(mimeType || "").split(";", 1)[0].trim().toLowerCase();
}

export function isManufacturingEvidenceVideo(mimeType: string | null | undefined, fileName?: string | null): boolean {
    const normalizedMimeType = normalizedMediaMimeType(mimeType);
    if (MANUFACTURING_EVIDENCE_VIDEO_TYPES.includes(normalizedMimeType as ManufacturingEvidenceVideoType)) {
        return true;
    }
    return !normalizedMimeType && /\.(mp4|webm|mov)$/i.test(String(fileName || ""));
}

export function validateManufacturingEvidence(file: File, label: string): string | null {
    if (file.size <= 0) {
        return `The ${label.toLowerCase()} file must be greater than 0 bytes.`;
    }

    const mimeType = normalizedMediaMimeType(file.type);
    if (PRODUCTION_YIELD_IMAGE_TYPES.includes(mimeType as ProductionYieldImageType)) {
        return file.size > PRODUCTION_YIELD_IMAGE_MAX_BYTES
            ? `The ${label.toLowerCase()} image must be no larger than 5 MB.`
            : null;
    }

    if (MANUFACTURING_EVIDENCE_VIDEO_TYPES.includes(mimeType as ManufacturingEvidenceVideoType)) {
        return file.size > MANUFACTURING_EVIDENCE_VIDEO_MAX_BYTES
            ? `The ${label.toLowerCase()} video must be no larger than 100 MB.`
            : null;
    }

    return `${label} must be a PNG, JPG, or WEBP image, or an MP4, WEBM, or MOV video.`;
}

/** @deprecated Use validateManufacturingEvidence for image-or-video evidence. */
export function validateManufacturingImage(file: File, label: string): string | null {
    return validateManufacturingEvidence(file, label);
}

export function validateProductionYieldImage(file: File): string | null {
    return validateManufacturingEvidence(file, "Shift evidence");
}

export function manufacturingFileUrl(fileId: string): string {
    return `/api/manufacturing/files?id=${encodeURIComponent(fileId)}`;
}

export function productionYieldImageUrl(fileId: string): string {
    return manufacturingFileUrl(fileId);
}
