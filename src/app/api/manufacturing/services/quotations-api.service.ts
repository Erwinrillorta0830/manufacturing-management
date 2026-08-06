// VOS ERP - Quotations Directus API Service

import { DIRECTUS_URL, headers } from "./core-api.service";

/**
 * Fetch all saved quotations, including populated customer details.
 */
export async function fetchQuotations(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/quotation_header?limit=-1&sort=-quote_date`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        const quotes = ((await res.json()).data || []) as { id: number; customer_id: string | number | Record<string, unknown>; [key: string]: unknown }[];

        const custIds = Array.from(new Set(quotes.map(q => q.customer_id).filter(Boolean)));
        let customers: { id: string | number; customer_name: string; customer_code: string }[] = [];
        if (custIds.length > 0) {
            const custUrl = `${DIRECTUS_URL}/items/customer?filter[id][_in]=${custIds.join(",")}&limit=-1`;
            const custRes = await fetch(custUrl, { headers, cache: "no-store" });
            if (custRes.ok) {
                customers = ((await custRes.json()).data || []) as { id: string | number; customer_name: string; customer_code: string }[];
            }
        }

        return quotes.map(q => {
            const rawCustId = q.customer_id;
            if (rawCustId && (typeof rawCustId === "number" || typeof rawCustId === "string")) {
                const match = customers.find(c => String(c.id) === String(rawCustId));
                if (match) return { ...q, customer_id: match };
            }
            return q;
        });
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed fetching quotations:", e);
        return [];
    }
}

/**
 * Saves a quotation and its line snapshots.
 */
export async function saveQuotation(
    quoteData: {
        quote_number: string;
        customer_id: number;
        total_selling_price: number;
        total_simulated_cost: number;
        forex_rate_used: number;
        remarks?: string;
    },
    snapshots: Array<{
        product_id: number;
        version_id: number;
        node_name: string;
        node_type: string;
        quantity: number;
        uom: string;
        frozen_unit_cost_php: number;
        frozen_total_cost_php: number;
    }>
): Promise<unknown> {
    let quoteId: number | null = null;
    const createdSnapshotIds: number[] = [];
    try {
        // 1. Post Header
        const headerRes = await fetch(`${DIRECTUS_URL}/items/quotation_header`, {
            method: "POST",
            headers,
            body: JSON.stringify(quoteData)
        });
        if (!headerRes.ok) {
            const errText = await headerRes.text();
            throw new Error(`Failed to create quote header: ${headerRes.status} - ${errText}`);
        }
        const headerJson = await headerRes.json();
        quoteId = headerJson.data.id;

        // 2. Post Snapshot nodes
        for (const node of snapshots) {
            const nodePayload = {
                ...node,
                quotation_id: quoteId
            };
            const nodeRes = await fetch(`${DIRECTUS_URL}/items/quotation_snapshots`, {
                method: "POST",
                headers,
                body: JSON.stringify(nodePayload)
            });
            if (!nodeRes.ok) throw new Error(`Failed to save quote node: ${nodeRes.status}`);
            const nodeJson = await nodeRes.json();
            createdSnapshotIds.push(nodeJson.data.id);
        }

        return { success: true, quoteId };
    } catch (e) {
        console.error("Failed to transactional save quotation. Rolling back...", e);
        // Rollback snapshot nodes
        for (const sId of createdSnapshotIds) {
            await fetch(`${DIRECTUS_URL}/items/quotation_snapshots/${sId}`, { method: "DELETE", headers }).catch(() => {});
        }
        // Rollback header
        if (quoteId) {
            await fetch(`${DIRECTUS_URL}/items/quotation_header/${quoteId}`, { method: "DELETE", headers }).catch(() => {});
        }
        throw e;
    }
}

/**
 * Fetch detailed cost snapshot nodes for a specific quote.
 */
export async function fetchQuotationSnapshots(quoteId: number): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/quotation_snapshots?filter[quotation_id][_eq]=${quoteId}&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch quotation snapshots:", e);
        return [];
    }
}
