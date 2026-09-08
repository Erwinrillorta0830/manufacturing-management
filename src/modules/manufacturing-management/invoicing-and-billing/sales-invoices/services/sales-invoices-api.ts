import { SalesInvoiceHeader, SalesInvoiceDetail, SalesmanOption } from "../types";

const API_BASE = "/api/manufacturing/invoicing-and-billing/sales-invoices";

export async function fetchSalesInvoices(includeDetails: boolean = false): Promise<{
    data: SalesInvoiceHeader[];
    salesmen?: SalesmanOption[];
    detailsMap: Record<number, SalesInvoiceDetail[]>;
}> {
    const res = await fetch(`${API_BASE}?includeDetails=${includeDetails}`, { cache: "no-store" });
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
