// src/app/api/scm/accounting/customers-memo/route.ts

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


const COOKIE_NAME = "vos_access_token";

type DirectusListResponse<T> = {
    data?: T[];
};

type DirectusItemResponse<T> = {
    data: T;
};

type SupplierRow = {
    id: number;
    supplier_name: string;
    supplier_shortcut: string | null;
};

type CustomerRow = {
    id: number;
    customer_name: string;
    customer_code: string;
    store_name?: string;
    brgy?: string;
    city?: string;
    province?: string;
};

type SalesmanRow = {
    id: number;
    salesman_code: string;
    salesman_name: string;
};

type ChartOfAccountRow = {
    coa_id: number;
    gl_code: string;
    account_title: string;
    balance_type: number;
};

type CustomersMemoRow = {
    id: number;
    memo_number: string;
    encoder_id: number | { user_fname: string; user_lname: string };
    collection_references?: string[];
};

type UserRow = {
    user_id: number;
    user_fname: string;
    user_lname: string;
};

type CollectionMemoItem = {
    collection_id: {
        id: number;
        docNo: string;
    };
    amount: number;
};

type CustomersMemoInsertPayload = {
    memo_number: string;
    supplier_reference?: string | null;
    customer_reference?: string | null;
    supplier_id: number;
    customer_id: number;
    salesman_id: number;
    amount: number;
    applied_amount?: number;
    reason?: string | null;
    status?: string;
    encoder_id: number | null;
    type: number;
    isPending: boolean;
    isClaimed: boolean;
    created_at: string;
};

type CollectionMemoInsertPayload = {
    memo_id: number;
    collection_id: number;
    amount: number;
    date_linked: string;
};

type CollectionInvoiceInsertPayload = {
    collection_id: number;
    invoice_id: number;
    date_linked: string;
};

type MemoHeaderInput = {
    memo_number: string;
    supplier_reference?: string | null;
    customer_reference?: string | null;
    supplier_id: number;
    customer_id: number;
    salesman_id: number;
    amount: number;
    applied_amount?: number;
    reason?: string | null;
    type: number;
};

type MemoInvoiceHistoryInput = {
    invoiceId: number;
    amount: number;
};

type MemoCollectionHistoryInput = {
    collectionId: number;
    amount: number;
    invoices: MemoInvoiceHistoryInput[];
};

type MemoPostBody = {
    header: MemoHeaderInput;
    history?: MemoCollectionHistoryInput[];
};

/**
 * Inline Directus helpers
 * Required .env.local variables:
 * - DIRECTUS_URL
 * - DIRECTUS_STATIC_TOKEN
 */
function getDirectusBase(): string {
    const raw =
        process.env.DIRECTUS_URL ||
        process.env.NEXT_PUBLIC_DIRECTUS_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        "";

    const cleaned = raw.trim().replace(/\/$/, "");
    if (!cleaned) {
        throw new Error(
            "DIRECTUS_URL is not set. Add it to .env.local and restart the dev server."
        );
    }

    return /^https?:\/\//i.test(cleaned) ? cleaned : `http://${cleaned}`;
}

function getDirectusToken(): string {
    const token = (process.env.DIRECTUS_STATIC_TOKEN || process.env.DIRECTUS_TOKEN || "").trim();
    if (!token) {
        throw new Error(
            "DIRECTUS_STATIC_TOKEN is not set. Add it to .env.local and restart the dev server."
        );
    }
    return token;
}

function directusHeaders(): Record<string, string> {
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getDirectusToken()}`,
    };
}

async function directusFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: {
            ...directusHeaders(),
            ...(init?.headers as Record<string, string> | undefined),
        },
        cache: "no-store",
    });

    const json: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
        const parsed = json as
            | { errors?: Array<{ message?: string }>; error?: string }
            | undefined;

        const msg =
            parsed?.errors?.[0]?.message ||
            parsed?.error ||
            `Directus responded ${res.status} ${res.statusText}`;

        throw new Error(msg);
    }

    return json as T;
}

/**
 * Decode JWT payload (No Verify) and extract numeric userId from 'sub'.
 */
function decodeUserIdFromJwtCookie(req: NextRequest): number | null {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length < 2) return null;

    try {
        const payloadPart = parts[1];
        const pad = "=".repeat((4 - (payloadPart.length % 4)) % 4);
        const b64 = (payloadPart + pad).replace(/-/g, "+").replace(/_/g, "/");
        const jsonStr = Buffer.from(b64, "base64").toString("utf8");

        const payload = JSON.parse(jsonStr) as { sub?: string | number };
        const userId = Number(payload.sub);
        return Number.isFinite(userId) ? userId : null;
    } catch {
        return null;
    }
}

// Helper to normalize data for frontend consumption
function normalizeMemoData(m: any) {
    if (!m) return m;
    const isObj = (val: any) => val && typeof val === 'object';
    
    let created_at = m.created_at;
    if (created_at) {
        if (!created_at.includes('T') && !created_at.includes('Z')) {
            created_at = created_at.replace(' ', 'T') + 'Z';
        } else if (created_at.includes('T') && !created_at.endsWith('Z')) {
            created_at = created_at + 'Z';
        }
    }

    return {
        ...m,
        created_at,
        supplier_id: isObj(m.supplier_id) ? m.supplier_id : { id: 0, supplier_name: "Unknown Supplier" },
        customer_id: isObj(m.customer_id) ? m.customer_id : { id: 0, customer_name: "Unknown Customer" },
        salesman_id: isObj(m.salesman_id) ? m.salesman_id : { id: 0, salesman_code: "N/A", salesman_name: "Unknown Salesman" },
        chart_of_account: isObj(m.chart_of_account) ? m.chart_of_account : { coa_id: 0, account_title: "Unknown Account" }
    };
}

export async function GET(req: NextRequest) {
    const DIRECTUS_URL = getDirectusBase();
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    try {
        switch (action) {
            case "suppliers": {
                const result = await directusFetch<DirectusListResponse<SupplierRow>>(
                    `${DIRECTUS_URL}/items/suppliers?fields=id,supplier_name,supplier_shortcut&filter[isActive][_eq]=1&filter[supplier_type][_eq]=TRADE&limit=-1&sort=supplier_name`
                );
                return NextResponse.json(result);
            }

            case "customers": {
                const result = await directusFetch<DirectusListResponse<CustomerRow>>(
                    `${DIRECTUS_URL}/items/customer?fields=id,customer_name,customer_code,store_name,brgy,city,province&filter[isActive][_eq]=1&limit=-1&sort=customer_name`
                );
                return NextResponse.json(result);
            }

            case "salesmen": {
                const result = await directusFetch<DirectusListResponse<SalesmanRow>>(
                    `${DIRECTUS_URL}/items/salesman?fields=id,salesman_code,salesman_name&filter[isActive][_eq]=1&limit=-1&sort=salesman_name`
                );
                return NextResponse.json(result);
            }

            case "chart-of-accounts": {
                const result = await directusFetch<DirectusListResponse<ChartOfAccountRow>>(
                    `${DIRECTUS_URL}/items/chart_of_accounts?fields=coa_id,gl_code,account_title,balance_type&filter[account_type][account_name][_in]=Cost of Sales,Cost of Service,General and Administrative Expenses,Finance Cost,Other Income&limit=-1&sort=account_title`
                );
                return NextResponse.json(result);
            }

            case "next-memo-number": {
                const shortcut = searchParams.get("shortcut");
                if (!shortcut) {
                    return NextResponse.json({ error: "Shortcut is required" }, { status: 400 });
                }

                const encodedShortcut = encodeURIComponent(shortcut);

                const allRes = await directusFetch<DirectusListResponse<CustomersMemoRow>>(
                    `${DIRECTUS_URL}/items/customers_memo?filter[memo_number][_starts_with]=${encodedShortcut}&limit=-1&fields=id,memo_number`
                );

                let nextNum = 1;
                let maxNum = 0;

                if (allRes.data) {
                    for (const row of allRes.data) {
                        const memoNum = row.memo_number;
                        if (memoNum && memoNum.startsWith(shortcut)) {
                            const numericPart = memoNum.substring(shortcut.length);
                            if (/^\d+$/.test(numericPart)) {
                                const val = parseInt(numericPart, 10);
                                if (!Number.isNaN(val) && val > maxNum) {
                                    maxNum = val;
                                }
                            }
                        }
                    }
                }

                if (maxNum > 0) {
                    nextNum = maxNum + 1;
                }

                return NextResponse.json({ memo_number: `${shortcut}${nextNum}` });
            }

            case "collection-lookup": {
                const supplierName = searchParams.get("supplierName");
                const salesmanCode = searchParams.get("salesmanCode");
                const customerName = searchParams.get("customerName");

                if (!supplierName || !salesmanCode || !customerName) {
                    return NextResponse.json({ data: [] });
                }

                // Temporary fallback using Directus since Spring Boot endpoint isn't ready
                const fields = [
                    "id",
                    "collection_id.id",
                    "collection_id.docNo",
                    "collection_id.totalAmount",
                    "collection_id.amount",
                    "collection_id.isPosted",
                    "invoice_id.invoice_no",
                    "invoice_id.net_amount",
                    "invoice_id.invoice_date",
                    "invoice_id.customer_id.customer_name",
                    "invoice_id.salesman_id.salesman_name",
                    "invoice_id.supplier_id.supplier_name"
                ].join(",");

                const filter = {
                    invoice_id: {
                        supplier_id: { supplier_name: { _eq: supplierName } },
                        salesman_id: { salesman_code: { _eq: salesmanCode } },
                        customer_id: { customer_name: { _eq: customerName } }
                    }
                };

                const filterStr = encodeURIComponent(JSON.stringify(filter));

                type FallbackRow = {
                    id?: number;
                    collection_id?: { id?: number; docNo?: string; totalAmount?: number; amount?: number; isPosted?: boolean };
                    invoice_id?: {
                        invoice_no?: string;
                        net_amount?: number;
                        invoice_date?: string;
                        customer_id?: { customer_name?: string };
                        salesman_id?: { salesman_name?: string };
                        supplier_id?: { supplier_name?: string };
                    };
                };
                try {
                    const result = await directusFetch<{ data?: FallbackRow[] }>(
                        `${DIRECTUS_URL}/items/collection_invoices?fields=${fields}&filter=${filterStr}&limit=-1`
                    );

                    const mappedData = (result.data || []).map(row => {
                        const coll = row.collection_id || {};
                        const inv = row.invoice_id || {};
                        const cust = inv.customer_id || {};
                        const sales = inv.salesman_id || {};
                        const supp = inv.supplier_id || {};
                        
                        return {
                            collectionDetailId: row.id,
                            collectionId: coll.id || 0,
                            collectionNo: coll.docNo || "UNKNOWN",
                            totalAmount: coll.totalAmount ?? coll.amount ?? 0,
                            isPosted: coll.isPosted ? 1 : 0,
                            invoiceNo: inv.invoice_no || "UNKNOWN",
                            netAmount: inv.net_amount || 0,
                            invoiceDate: inv.invoice_date || "",
                            customerName: cust.customer_name || "",
                            salesmanName: sales.salesman_name || "",
                            supplierName: supp.supplier_name || ""
                        };
                    });

                    return NextResponse.json({ data: mappedData });
                } catch (err: unknown) {
                    console.warn("[Customers Memo API] Directus collection-lookup fallback failed:", err);
                    return NextResponse.json({ data: [] });
                }
            }

            case "list": {
                const status = searchParams.get("status") || "FOR APPROVAL";
                // Fetch memos with enriched joined data
                const fields = [
                    "id", "memo_number", "amount", "applied_amount", "reason", "status", "created_at", "type",
                    "supplier_id.id", "supplier_id.supplier_name",
                    "customer_id.id", "customer_id.customer_name", "customer_id.store_name", "customer_id.brgy", "customer_id.city", "customer_id.province",
                    "salesman_id.id", "salesman_id.salesman_code", "salesman_id.salesman_name",
                    "chart_of_account.coa_id", "chart_of_account.gl_code", "chart_of_account.account_title",
                    "encoder_id", "encoder_id.user_fname", "encoder_id.user_lname"
                ].join(",");
                
                const filterStr = status === "ALL" ? "" : `&filter[status][_eq]=${status}`;
                
                const result = await directusFetch<DirectusListResponse<CustomersMemoRow>>(
                    `${DIRECTUS_URL}/items/customers_memo?fields=${fields}${filterStr}&limit=-1&sort=-created_at`
                );

                // Enrich with Encoder Names and Collection References
                if (result.data && result.data.length > 0) {
                    const memoIds = result.data.map(m => m.id);
                    const encoderIds = Array.from(new Set(result.data.map(m => typeof m.encoder_id === 'number' ? m.encoder_id : null).filter((id): id is number => id !== null && id > 0)));
                    let userMap = new Map();
                    let collectionsMap = new Map<number, string[]>();

                    try {
                        const [userRes, collectionsRes] = await Promise.all([
                            encoderIds.length > 0 ? directusFetch<DirectusListResponse<UserRow>>(
                                `${DIRECTUS_URL}/items/user?fields=user_id,user_fname,user_lname&filter[user_id][_in]=${encoderIds.join(",")}`
                            ) : Promise.resolve({ data: [] }),
                            directusFetch<DirectusListResponse<any>>(
                                `${DIRECTUS_URL}/items/collection_memos?fields=memo_id,collection_id.docNo&filter[memo_id][_in]=${memoIds.join(",")}`
                            )
                        ]);

                        if (userRes.data) {
                            userMap = new Map(userRes.data.map(u => [u.user_id, u]));
                        }
                        if (collectionsRes.data) {
                            collectionsRes.data.forEach((c: any) => {
                                if (!collectionsMap.has(c.memo_id)) collectionsMap.set(c.memo_id, []);
                                if (c.collection_id && c.collection_id.docNo) {
                                    collectionsMap.get(c.memo_id)!.push(c.collection_id.docNo);
                                }
                            });
                        }
                    } catch (e) {
                        console.warn("[Customers Memo API] Enrichment failed:", e);
                    }

                    result.data = result.data.map(m => {
                        const mEnriched = {
                            ...m,
                            encoder_id: typeof m.encoder_id === 'number' ? userMap.get(m.encoder_id) || m.encoder_id : m.encoder_id,
                            collection_references: collectionsMap.get(m.id) || []
                        };
                        return normalizeMemoData(mEnriched);
                    });
                }

                return NextResponse.json(result);
            }

            case "memo-details": {
                const id = searchParams.get("id");
                if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

                // Fetch header with joined names
                const headerFields = [
                    "id", "memo_number", "amount", "applied_amount", "reason", "status", "created_at", "type",
                    "supplier_id.id", "supplier_id.supplier_name",
                    "customer_id.id", "customer_id.customer_name", "customer_id.store_name", "customer_id.brgy", "customer_id.city", "customer_id.province",
                    "salesman_id.id", "salesman_id.salesman_code", "salesman_id.salesman_name",
                    "chart_of_account.coa_id", "chart_of_account.gl_code", "chart_of_account.account_title",
                    "encoder_id", "encoder_id.user_fname", "encoder_id.user_lname"
                ].join(",");

                const headerRes = await directusFetch<DirectusItemResponse<CustomersMemoRow>>(
                    `${DIRECTUS_URL}/items/customers_memo/${id}?fields=${headerFields}`
                );

                let header = headerRes.data;

                // Enrich Header with Encoder Name manually
                if (header && typeof header.encoder_id === 'number') {
                    try {
                        const userRes = await directusFetch<DirectusItemResponse<UserRow>>(
                            `${DIRECTUS_URL}/items/user/${header.encoder_id}?fields=user_id,user_fname,user_lname`
                        );
                        if (userRes.data) {
                            header.encoder_id = userRes.data;
                        }
                    } catch (e) {
                        console.warn("[Customers Memo API] Detail encoder enrichment failed:", e);
                    }
                }
                
                header = normalizeMemoData(header);
                
                // Fetch linked collections (only fields exposed in Directus)
                const collectionFields = [
                    "amount",
                    "collection_id.id",
                    "collection_id.docNo",
                ].join(",");
                let collectionsData: CollectionMemoItem[] = [];
                try {
                    const collections = await directusFetch<DirectusListResponse<CollectionMemoItem>>(
                        `${DIRECTUS_URL}/items/collection_memos?filter[memo_id][_eq]=${id}&fields=${collectionFields}`
                    );
                    collectionsData = collections.data || [];
                    
                    if (header) {
                        header.collection_references = collectionsData
                            .map(c => c.collection_id?.docNo)
                            .filter(Boolean);
                    }
                } catch (e) {
                    console.warn("[Customers Memo API] Collection fetch failed:", e);
                }

                // Fetch applied invoices from customer_memo_invoices
                const invoiceFields = [
                    "amount",
                    "date_applied",
                    "invoice_id.invoice_no",
                    "invoice_id.invoice_date",
                    "invoice_id.due_date",
                    "invoice_id.net_amount",
                ].join(",");
                let invoicesData: Record<string, unknown>[] = [];
                try {
                    const invoices = await directusFetch<DirectusListResponse<Record<string, unknown>>>(
                        `${DIRECTUS_URL}/items/customer_memo_invoices?filter[memo_id][_eq]=${id}&fields=${invoiceFields}`
                    );
                    invoicesData = invoices.data || [];
                } catch (e) {
                    console.warn("[Customers Memo API] Invoices fetch failed:", e);
                }

                return NextResponse.json({
                    header: header,
                    collections: collectionsData,
                    invoices: invoicesData,
                });
            }

            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }
    } catch (error: unknown) {
        console.error("[Customers Memo API] GET Error:", error);

        const message =
            error instanceof Error ? error.message : "An unexpected error occurred.";

        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const DIRECTUS_URL = getDirectusBase();
        const userId = decodeUserIdFromJwtCookie(req);
        const body = (await req.json()) as MemoPostBody;

        const { header, history = [] } = body;

        const nowIso = new Date().toISOString();
        
        const memoPayload: CustomersMemoInsertPayload = {
            ...header,
            encoder_id: userId,
            status: "FOR APPROVAL",
            isPending: false, // Set to 0 as requested
            isClaimed: false,
            created_at: nowIso
        };

        // 1. Save Header
        const memoRes = await directusFetch<DirectusItemResponse<CustomersMemoRow>>(
            `${DIRECTUS_URL}/items/customers_memo`,
            {
                method: "POST",
                body: JSON.stringify(memoPayload),
            }
        );

        const memoId = memoRes.data.id;

        // 2. Save Collection Memos (History)
        if (history.length > 0) {
            const nowIso = new Date().toISOString();

            const collectionMemos: CollectionMemoInsertPayload[] = history.map((item) => ({
                memo_id: memoId,
                collection_id: item.collectionId,
                amount: item.amount,
                date_linked: nowIso,
            }));

            await directusFetch<DirectusItemResponse<CollectionMemoInsertPayload[]>>(
                `${DIRECTUS_URL}/items/collection_memos`,
                {
                    method: "POST",
                    body: JSON.stringify(collectionMemos),
                }
            );

            // 3. Save Collection Invoices
            const invoiceLinksRaw: CollectionInvoiceInsertPayload[] = history.flatMap((item) =>
                item.invoices.map((invoice) => ({
                    collection_id: item.collectionId,
                    invoice_id: invoice.invoiceId,
                    date_linked: nowIso,
                }))
            );

            const uniqueInvoiceLinks = Array.from(
                new Map(
                    invoiceLinksRaw.map((link) => [
                        `${link.collection_id}-${link.invoice_id}`,
                        link,
                    ])
                ).values()
            );

            if (uniqueInvoiceLinks.length > 0) {
                try {
                    await directusFetch<DirectusItemResponse<CollectionInvoiceInsertPayload[]>>(
                        `${DIRECTUS_URL}/items/collection_invoices`,
                        {
                            method: "POST",
                            body: JSON.stringify(uniqueInvoiceLinks),
                        }
                    );
                } catch (err: unknown) {
                    console.warn(
                        "[Customers Memo API] Some collection_invoices might already exist, proceeding...",
                        err
                    );
                }
            }
        }

        return NextResponse.json({ success: true, memoId });
    } catch (error: unknown) {
        console.error("[Customers Memo API] POST Error:", error);

        const message =
            error instanceof Error ? error.message : "An unexpected error occurred.";

        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const DIRECTUS_URL = getDirectusBase();
        const body = await req.json();
        const { id, ids, status } = body;

        if (!status) {
            return NextResponse.json({ error: "Status required" }, { status: 400 });
        }

        if (ids && Array.isArray(ids)) {
            // Bulk update status and ensure isPending stays 0
            await directusFetch(`${DIRECTUS_URL}/items/customers_memo`, {
                method: "PATCH",
                body: JSON.stringify({ 
                    keys: ids,
                    data: {
                        status,
                        isPending: false
                    }
                }),
            });
        } else if (id) {
            // Single update status and ensure isPending stays 0
            await directusFetch(`${DIRECTUS_URL}/items/customers_memo/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ 
                    status,
                    isPending: false 
                }),
            });
        } else {
            return NextResponse.json({ error: "ID or IDs required" }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error("[Customers Memo API] PATCH Error:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}