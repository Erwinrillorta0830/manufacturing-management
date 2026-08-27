import { procurementDirectusFetch } from "../procurement/_directus";

export const RECEIVING_DOCUMENT_TYPE_DEFINITIONS = [
    { code: "SI", label: "Sales Invoice (SI)" },
    { code: "OR", label: "Official Receipt (OR)" },
    { code: "DR", label: "Delivery Receipt (DR)" }
] as const;

export type ReceivingDocumentTypeCode = typeof RECEIVING_DOCUMENT_TYPE_DEFINITIONS[number]["code"];

export interface ReceivingDocumentTypeOption {
    id: number;
    code: ReceivingDocumentTypeCode;
    label: string;
}

export class ReceivingDocumentTypeError extends Error {
    constructor(message: string, readonly statusCode: number = 503) {
        super(message);
    }
}

function rows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray(body.data)
        ? body.data as Record<string, unknown>[]
        : [];
}

function positiveId(value: unknown): number | null {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function fetchReceivingDocumentTypes(): Promise<ReceivingDocumentTypeOption[]> {
    const params = new URLSearchParams({
        fields: "id,type,shortcut",
        limit: "-1"
    });
    const response = await procurementDirectusFetch(`/items/sales_invoice_type?${params.toString()}`);
    if (!response.ok) throw new ReceivingDocumentTypeError("Unable to load supplier document types.");

    const byCode = new Map<ReceivingDocumentTypeCode, ReceivingDocumentTypeOption>();
    for (const row of rows(await response.json())) {
        const id = positiveId(row.id);
        const code = String(row.shortcut || "").trim().toUpperCase() as ReceivingDocumentTypeCode;
        if (!id || !RECEIVING_DOCUMENT_TYPE_DEFINITIONS.some(definition => definition.code === code) || byCode.has(code)) continue;
        const definition = RECEIVING_DOCUMENT_TYPE_DEFINITIONS.find(item => item.code === code)!;
        byCode.set(code, { id, code, label: definition.label });
    }

    const missing = RECEIVING_DOCUMENT_TYPE_DEFINITIONS
        .map(definition => definition.code)
        .filter(code => !byCode.has(code));
    if (missing.length > 0) {
        throw new ReceivingDocumentTypeError(
            `Supplier document types are not configured: ${missing.join(", ")}.`,
            503
        );
    }

    return RECEIVING_DOCUMENT_TYPE_DEFINITIONS.map(definition => byCode.get(definition.code)!);
}

export async function validateReceivingDocumentType(
    id: number | null | undefined,
    replacementFlow = false
): Promise<ReceivingDocumentTypeOption | null> {
    if (!id) {
        if (replacementFlow) return null;
        throw new ReceivingDocumentTypeError("Supplier Document Type is required.", 422);
    }

    const documentType = (await fetchReceivingDocumentTypes()).find(option => option.id === id);
    if (!documentType) {
        throw new ReceivingDocumentTypeError("The selected Supplier Document Type is not available.", 422);
    }
    return documentType;
}
