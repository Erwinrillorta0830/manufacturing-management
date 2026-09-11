import { SalesInvoiceHeader, SalesInvoiceDetail, SalesmanOption, PaginationMeta } from "../types";

const API_BASE = "/api/manufacturing/invoicing-and-billing/sales-invoices";

export interface FetchSalesInvoicesParams {
    includeDetails?: boolean;
    page?: number;
    limit?: number;
}

export async function fetchSalesInvoices(params: FetchSalesInvoicesParams | boolean = false): Promise<{
    data: SalesInvoiceHeader[];
    salesmen?: SalesmanOption[];
    detailsMap: Record<number, SalesInvoiceDetail[]>;
    pagination?: PaginationMeta;
}> {
    const opts: FetchSalesInvoicesParams = typeof params === "boolean" ? { includeDetails: params } : params;
    const query = new URLSearchParams();
    if (opts.includeDetails) query.set("includeDetails", "true");
    if (opts.page) query.set("page", String(opts.page));
    if (opts.limit) query.set("limit", String(opts.limit));

    const res = await fetch(`${API_BASE}?${query.toString()}`, { cache: "no-store" });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch FM sales invoice report data (HTTP ${res.status}).`);
    }
    return res.json();
}

export async function fetchSalesInvoiceDetails(invoiceId: number): Promise<SalesInvoiceDetail[]> {
    const res = await fetch(`${API_BASE}?invoiceId=${invoiceId}`, { cache: "no-store" });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch details for Invoice #${invoiceId} (HTTP ${res.status}).`);
    }
    const json = await res.json();
    return json.details || [];
}
