import { CreateInvoicePayload, CreatedInvoiceResult, InvoicingCandidate, InvoicingFilters, ORTemplate, PrintableInvoice, ReceiptType, SalesOrderAvailability } from "../types";

async function responseJson(response: Response, fallback: string) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || body.message || fallback);
    return body;
}

export async function fetchInvoicingCandidates(filters?: Partial<InvoicingFilters>): Promise<InvoicingCandidate[]> {
    const params = new URLSearchParams();
    if (filters?.search) params.set("search", filters.search);
    if (filters?.customerCode) params.set("customerCode", filters.customerCode);
    if (filters?.branchId) params.set("branchId", filters.branchId);
    if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters?.dateTo) params.set("dateTo", filters.dateTo);
    const qs = params.toString();
    const body = await responseJson(
        await fetch(`/api/manufacturing/invoicing/candidates${qs ? `?${qs}` : ""}`, { cache: "no-store" }),
        "Failed to load invoicing candidates"
    );
    return body.data || [];
}

export async function createInvoice(payload: CreateInvoicePayload): Promise<CreatedInvoiceResult> {
    return responseJson(await fetch("/api/manufacturing/invoicing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }), "Failed to create invoice");
}

export async function fetchReceiptTypes(): Promise<ReceiptType[]> {
    return responseJson(await fetch("/api/manufacturing/invoicing/receipt-types", { cache: "no-store" }), "Failed to load receipt types");
}

export async function fetchPrintableInvoice(invoiceId: number): Promise<PrintableInvoice> {
    return responseJson(await fetch(`/api/manufacturing/invoicing/${invoiceId}/print-data`, { cache: "no-store" }), "Failed to load printable invoice");
}

export async function fetchSalesOrderAvailability(salesOrderId: number): Promise<SalesOrderAvailability> {
    return responseJson(
        await fetch(`/api/manufacturing/invoicing/availability?salesOrderId=${salesOrderId}`, { cache: "no-store" }),
        "Failed to calculate stock availability"
    );
}

export async function archiveInvoiceDocument(invoiceId: number, file: Blob, invoiceNo: string, width: number, height: number): Promise<void> {
    const form = new FormData();
    form.set("file", file, `${invoiceNo}.pdf`);
    form.set("invoiceNo", invoiceNo);
    form.set("width", String(width));
    form.set("height", String(height));
    await responseJson(await fetch(`/api/manufacturing/invoicing/${invoiceId}/document`, { method: "POST", body: form }), "Failed to archive invoice PDF");
}

export async function fetchReceiptTemplate(receiptTypeId: number): Promise<ORTemplate | null> {
    const body = await responseJson(await fetch(`/api/manufacturing/invoicing/templates/${receiptTypeId}`, { cache: "no-store" }), "Failed to load receipt template");
    return body.templateConfig || null;
}

export async function saveReceiptTemplate(receiptTypeId: number, templateConfig: ORTemplate): Promise<ORTemplate> {
    const body = await responseJson(await fetch(`/api/manufacturing/invoicing/templates/${receiptTypeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateConfig }),
    }), "Failed to save receipt template");
    return body.templateConfig;
}

export async function uploadReceiptBackground(file: File): Promise<string> {
    const form = new FormData();
    form.set("file", file);
    const body = await responseJson(await fetch("/api/manufacturing/invoicing/template-background", { method: "POST", body: form }), "Failed to upload receipt background");
    return body.id;
}

export function receiptBackgroundUrl(fileId: string) {
    return `/api/manufacturing/invoicing/template-background?id=${encodeURIComponent(fileId)}`;
}
