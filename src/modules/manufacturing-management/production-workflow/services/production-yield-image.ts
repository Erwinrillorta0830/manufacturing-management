export const PRODUCTION_YIELD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const PRODUCTION_YIELD_IMAGE_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp"
] as const;

export type ProductionYieldImageType = typeof PRODUCTION_YIELD_IMAGE_TYPES[number];

export function validateManufacturingImage(file: File, label: string): string | null {
    if (!PRODUCTION_YIELD_IMAGE_TYPES.includes(file.type as ProductionYieldImageType)) {
        return `${label} images must be PNG, JPG, or WEBP files.`;
    }

    if (file.size <= 0 || file.size > PRODUCTION_YIELD_IMAGE_MAX_BYTES) {
        return `The ${label.toLowerCase()} image must be greater than 0 bytes and no larger than 5 MB.`;
    }

    return null;
}

export function validateProductionYieldImage(file: File): string | null {
    return validateManufacturingImage(file, "Shift evidence");
}

export function manufacturingFileUrl(fileId: string): string {
    return `/api/manufacturing/files?id=${encodeURIComponent(fileId)}`;
}

export function productionYieldImageUrl(fileId: string): string {
    return manufacturingFileUrl(fileId);
}
