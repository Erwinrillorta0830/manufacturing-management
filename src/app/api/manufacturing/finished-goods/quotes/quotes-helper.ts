import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";

export async function fetchQuotations(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/quotation_header?limit=-1&sort=-quote_date`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        const quotes = ((await res.json()).data || []) as { id: number; customer_id: string | number | Record<string, unknown>; project_id: string | number | Record<string, unknown>; created_by: string | number; [key: string]: unknown }[];

        // Fetch active customers and users concurrently
        let customers: { id: string | number; customer_name: string; customer_code: string }[] = [];
        let users: { user_id: string | number; user_fname: string; user_lname: string }[] = [];
        
        const custIds = Array.from(new Set(quotes.map(q => q.customer_id).filter(Boolean)));
        
        const promises: Promise<void>[] = [];
        
        if (custIds.length > 0) {
            const custUrl = `${DIRECTUS_URL}/items/customer?filter[id][_in]=${custIds.join(",")}&limit=-1&fields=id,customer_code,customer_name,price_type_id,price_type_id.price_type_id,price_type_id.price_type_name,price_type`;
            promises.push(
                fetch(custUrl, { headers, cache: "no-store" }).then(async (custRes) => {
                    if (custRes.ok) {
                        customers = ((await custRes.json()).data || []) as { id: string | number; customer_name: string; customer_code: string }[];
                    }
                })
            );
        }

        promises.push(
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" })
                .then(async (userRes) => {
                    if (userRes.ok) {
                        users = ((await userRes.json()).data || []) as { user_id: string | number; user_fname: string; user_lname: string }[];
                    }
                })
                .catch(() => {})
        );

        await Promise.all(promises);

        // Fetch projects
        let projects: { id: string | number; project_name: string; customer_code: string; status?: string }[] = [];
        const projRes = await fetch(`${DIRECTUS_URL}/items/projects?limit=-1`, { headers, cache: "no-store" });
        if (projRes.ok) {
            projects = ((await projRes.json()).data || []) as { id: string | number; project_name: string; customer_code: string; status?: string }[];
        }

        return quotes.map(q => {
            const mapped = { ...q };
            const rawCustId = q.customer_id;
            if (rawCustId && (typeof rawCustId === "number" || typeof rawCustId === "string")) {
                const match = customers.find(c => String(c.id) === String(rawCustId));
                if (match) mapped.customer_id = match;
            }
            const rawProjId = q.project_id;
            if (rawProjId && (typeof rawProjId === "number" || typeof rawProjId === "string")) {
                const match = projects.find(p => String(p.id) === String(rawProjId));
                if (match) mapped.project_id = match;
            }
            
            let createdByName = "System Admin";
            if (q.created_by) {
                const createdById = typeof q.created_by === "object" ? (q.created_by as Record<string, unknown>)?.id || (q.created_by as Record<string, unknown>)?.user_id : q.created_by;
                const userMatch = users.find(u => Number(u.user_id) === Number(createdById));
                if (userMatch) {
                    createdByName = [userMatch.user_fname, userMatch.user_lname].filter(Boolean).join(" ");
                    if (!createdByName.trim()) createdByName = "System Admin";
                }
            }
            mapped.created_by_name = createdByName;

            return mapped;
        });
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed fetching quotations:", e);
        return [];
    }
}

export async function saveQuotation(
    quoteData: {
        quote_number: string;
        customer_id: number;
        project_id?: number;
        total_selling_price: number;
        total_simulated_cost: number;
        forex_rate_used: number;
        remarks?: string;
    },
    snapshots: Array<{
        product_id: number;
        parent_id?: number | null;
        parent_product_name?: string | null;
        product_type_id?: number | null;
        product_type_name?: string | null;
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
        const userId = await getUserIdFromToken().catch(() => null);

        // 0. Void preceding drafts for the same project
        if (quoteData.project_id) {
            const getDraftsUrl = `${DIRECTUS_URL}/items/quotation_header?filter[project_id][_eq]=${quoteData.project_id}&filter[status][_eq]=Draft`;
            const draftsRes = await fetch(getDraftsUrl, { headers, cache: "no-store" });
            if (draftsRes.ok) {
                const draftsJson = await draftsRes.json();
                const drafts = draftsJson.data || [];
                for (const draft of drafts) {
                    await fetch(`${DIRECTUS_URL}/items/quotation_header/${draft.id}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({ status: "Void", modified_by: userId })
                    }).catch(e => console.error("Failed to void preceding draft", e));
                }
            }
        }

        // 1. Post Header
        const finalQuoteData = { ...quoteData, created_by: userId };
        const headerRes = await fetch(`${DIRECTUS_URL}/items/quotation_header`, {
            method: "POST",
            headers,
            body: JSON.stringify(finalQuoteData)
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


