/* eslint-disable @typescript-eslint/no-explicit-any */
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

/**
 * Shared access to the `product_ledger` "Job Order Receipt" row so the shift
 * run and yield closing agree on the finished-goods receipt trail.
 */

export interface JobOrderReceiptQuery {
    productId: number;
    branchId: number;
    jobOrderNo: string;
    quantity: number;
    expectedLedgerId?: number;
}

export interface EnsureJobOrderReceiptInput extends Omit<JobOrderReceiptQuery, "expectedLedgerId"> {
    description?: string;
    documentDate?: string;
}

function ledgerRowId(row: any): number {
    const id = Number(row?.id ?? row?.ledger_id ?? 0);
    return Number.isFinite(id) ? id : 0;
}

async function findJobOrderReceiptRows(query: JobOrderReceiptQuery): Promise<any[]> {
    const filter = encodeURIComponent(JSON.stringify({
        _and: [
            { productId: { _eq: query.productId } },
            { branchId: { _eq: query.branchId } },
            { documentNo: { _eq: query.jobOrderNo } },
            { documentType: { _eq: "Job Order Receipt" } },
            { quantity: { _eq: query.quantity } }
        ]
    }));
    const response = await fetch(`${DIRECTUS_URL}/items/product_ledger?filter=${filter}&limit=-1`, {
        headers,
        cache: "no-store"
    });
    if (!response.ok) {
        throw new Error(`Existing finished-goods ledger lookup for ${query.jobOrderNo} failed with HTTP ${response.status}.`);
    }
    const payload = await response.json().catch(() => null);
    return Array.isArray(payload?.data) ? payload.data : [];
}

export async function hasJobOrderReceipt(query: JobOrderReceiptQuery): Promise<boolean> {
    const rows = await findJobOrderReceiptRows(query);
    return rows.some(row => query.expectedLedgerId === undefined || ledgerRowId(row) === query.expectedLedgerId);
}

/**
 * Idempotently create the finished-goods receipt ledger row. Returns the new
 * ledger row id, or null when a matching row already exists.
 */
export async function ensureJobOrderReceipt(input: EnsureJobOrderReceiptInput): Promise<number | null> {
    if (await hasJobOrderReceipt(input)) return null;

    const response = await fetch(`${DIRECTUS_URL}/items/product_ledger`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            branchId: input.branchId,
            productId: input.productId,
            quantity: input.quantity,
            documentType: "Job Order Receipt",
            documentNo: input.jobOrderNo,
            documentDescription: input.description || `MFG Run: ${input.jobOrderNo}`,
            documentDate: input.documentDate
        })
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Finished-goods product ledger insert for ${input.jobOrderNo} failed with HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
    const payload = await response.json().catch(() => null);
    return ledgerRowId(payload?.data) || null;
}
