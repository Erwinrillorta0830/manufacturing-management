const ALLOWED_PRODUCT_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
]);

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function validateProductImage(file: File): string | null {
    if (!file.type || !ALLOWED_PRODUCT_IMAGE_TYPES.has(file.type.toLowerCase())) {
        return "Product images must be PNG, JPG, or WEBP files.";
    }

    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
        return "Product images must be 5 MB or smaller.";
    }

    return null;
}

function getUploadErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;

    const record = payload as { error?: unknown; message?: unknown; detail?: unknown };
    for (const value of [record.error, record.message, record.detail]) {
        if (typeof value === "string" && value.trim()) return value.trim();
    }

    return null;
}

export async function uploadProductImage(file: File): Promise<string> {
    const validationError = validateProductImage(file);
    if (validationError) throw new Error(validationError);

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/manufacturing/files", {
        method: "POST",
        body: formData,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const message = getUploadErrorMessage(payload) || `Image upload failed (HTTP ${response.status}: ${response.statusText || 'Server Error'}). Please verify image file format or server connection.`;
        throw new Error(message);
    }

    const fileId = payload && typeof payload === "object"
        ? (payload as { data?: { id?: unknown } }).data?.id
        : undefined;

    if ((typeof fileId !== "string" && typeof fileId !== "number") || !String(fileId).trim()) {
        throw new Error("The image upload returned no file ID. Please try again.");
    }

    return String(fileId);
}

export function getProductImageUrl(fileId: string | number): string {
    return `/api/manufacturing/files?id=${encodeURIComponent(String(fileId))}`;
}
