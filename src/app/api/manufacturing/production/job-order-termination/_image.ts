import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    manufacturingFileUrl,
    validateManufacturingImage
} from "@/modules/manufacturing-management/production-workflow/services/production-yield-image";

export class JobOrderTerminationImageError extends Error {
    constructor(
        message: string,
        readonly status = 502,
        readonly code = "TERMINATION_IMAGE_UPLOAD_FAILED"
    ) {
        super(message);
        this.name = "JobOrderTerminationImageError";
    }
}

function authorizationHeaders(): Record<string, string> {
    return headers.Authorization ? { Authorization: headers.Authorization } : {};
}

function fileId(value: unknown): string | null {
    if (!value || typeof value !== "object") {
        return typeof value === "string" && value.trim() ? value.trim() : null;
    }
    const record = value as Record<string, unknown>;
    const id = record.id ?? record.file_id;
    return typeof id === "string" && id.trim()
        ? id.trim()
        : typeof id === "number"
            ? String(id)
            : null;
}

async function responseMessage(response: Response): Promise<string> {
    const responseText = await response.text().catch(() => "");
    if (!responseText) return "No response body.";
    try {
        const payload = JSON.parse(responseText) as Record<string, unknown>;
        const errors = Array.isArray(payload.errors) ? payload.errors : [];
        const firstError = errors[0];
        if (firstError && typeof firstError === "object") {
            const message = (firstError as Record<string, unknown>).message;
            if (typeof message === "string" && message.trim()) return message.trim();
        }
        for (const value of [payload.error, payload.message, payload.detail]) {
            if (typeof value === "string" && value.trim()) return value.trim();
        }
    } catch {
        // Preserve the upstream text when Directus does not return JSON.
    }
    return responseText.slice(0, 500);
}

export function validateJobOrderTerminationImage(file: File): string | null {
    return validateManufacturingImage(file, "Termination evidence");
}

export async function uploadJobOrderTerminationImage(file: File, jobOrderNo: string): Promise<string> {
    if (!DIRECTUS_URL || !headers.Authorization) {
        throw new JobOrderTerminationImageError(
            "Manufacturing file storage is not configured.",
            503,
            "FILE_STORAGE_NOT_CONFIGURED"
        );
    }

    const formData = new FormData();
    formData.set("file", file, file.name);
    formData.set("title", `JO ${jobOrderNo} termination evidence`.slice(0, 180));

    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}/files`, {
            method: "POST",
            headers: authorizationHeaders(),
            body: formData,
            cache: "no-store"
        });
    } catch (error) {
        throw new JobOrderTerminationImageError(
            `Manufacturing file storage could not be reached: ${error instanceof Error ? error.message : String(error)}`,
            502,
            "FILE_STORAGE_UNAVAILABLE"
        );
    }

    if (!response.ok) {
        const message = await responseMessage(response);
        const forbidden = response.status === 401 || response.status === 403;
        throw new JobOrderTerminationImageError(
            `Termination evidence upload failed with HTTP ${response.status}: ${message}`,
            forbidden ? 503 : 502,
            forbidden ? "TERMINATION_IMAGE_UPLOAD_FORBIDDEN" : "TERMINATION_IMAGE_UPLOAD_FAILED"
        );
    }

    const payload = await response.json().catch(() => ({})) as { data?: unknown };
    const uploadedId = fileId(payload.data);
    if (!uploadedId) {
        throw new JobOrderTerminationImageError(
            "Termination evidence upload returned no file identifier.",
            502,
            "TERMINATION_IMAGE_UPLOAD_INVALID_RESPONSE"
        );
    }
    return uploadedId;
}

export async function deleteJobOrderTerminationImage(uploadedId: string): Promise<void> {
    try {
        const response = await fetch(`${DIRECTUS_URL}/files/${encodeURIComponent(uploadedId)}`, {
            method: "DELETE",
            headers: authorizationHeaders(),
            cache: "no-store"
        });
        if (!response.ok) {
            console.error(`Unable to clean up termination evidence image ${uploadedId}: HTTP ${response.status}`);
        }
    } catch (error) {
        console.error(`Unable to clean up termination evidence image ${uploadedId}:`, error);
    }
}

export function jobOrderTerminationImageUrl(uploadedId: string | null | undefined): string | null {
    return uploadedId ? manufacturingFileUrl(uploadedId) : null;
}
