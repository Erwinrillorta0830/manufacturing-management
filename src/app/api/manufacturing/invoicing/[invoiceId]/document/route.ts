import { NextResponse } from "next/server";
import { DIRECTUS_TOKEN, DIRECTUS_URL, headers } from "../../../directus-api";
import { getUserIdFromToken } from "../../../invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
    let fileId = "";
    try {
        const userId = await getUserIdFromToken();
        if (!userId) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
        const invoiceId = Number((await params).invoiceId);
        if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) return NextResponse.json({ error: "Invalid invoice ID." }, { status: 400 });
        const form = await request.formData();
        const file = form.get("file");
        const invoiceNo = String(form.get("invoiceNo") || "").trim();
        const width = Number(form.get("width"));
        const height = Number(form.get("height"));
        if (!(file instanceof File) || file.type !== "application/pdf" || !invoiceNo) return NextResponse.json({ error: "A PDF and invoice number are required." }, { status: 400 });
        if (file.size > 20 * 1024 * 1024 || width < 50 || width > 500 || height < 50 || height > 1000) return NextResponse.json({ error: "Invalid PDF size or page dimensions." }, { status: 400 });
        const existingResponse = await fetch(`${DIRECTUS_URL}/items/sales_invoice_pdf?filter[sales_invoice_id][_eq]=${invoiceId}&fields=id,pdf_file&limit=1`, { headers, cache: "no-store" });
        if (!existingResponse.ok) throw new Error(`PDF archive lookup returned ${existingResponse.status}`);
        const existing = (await existingResponse.json()).data?.[0];
        const uploadForm = new FormData();
        uploadForm.set("file", file, `${invoiceNo}.pdf`);
        uploadForm.set("title", `${invoiceNo}.pdf`);
        const uploadResponse = await fetch(`${DIRECTUS_URL}/files`, {
            method: "POST",
            headers: DIRECTUS_TOKEN ? { Authorization: `Bearer ${DIRECTUS_TOKEN}` } : undefined,
            body: uploadForm,
        });
        if (!uploadResponse.ok) throw new Error(`PDF upload returned ${uploadResponse.status}`);
        fileId = String((await uploadResponse.json()).data?.id || "");
        if (!fileId) throw new Error("PDF upload returned no file ID");

        const now = new Date().toISOString();
        const archiveResponse = await fetch(existing ? `${DIRECTUS_URL}/items/sales_invoice_pdf/${existing.id}` : `${DIRECTUS_URL}/items/sales_invoice_pdf`, {
            method: existing ? "PATCH" : "POST",
            headers,
            body: JSON.stringify({ sales_invoice_id: invoiceId, receipt_numbers: invoiceNo, pdf_file: fileId, page: 1, width_mm: width, height_mm: height, ...(existing ? {} : { created_at: now, created_by: userId }), updated_at: now, updated_by: userId }),
        });
        if (!archiveResponse.ok) throw new Error(`PDF archive returned ${archiveResponse.status}`);
        const archive = (await archiveResponse.json()).data;
        const oldFileId = typeof existing?.pdf_file === "object" ? existing.pdf_file?.id : existing?.pdf_file;
        if (oldFileId && String(oldFileId) !== fileId) await fetch(`${DIRECTUS_URL}/files/${oldFileId}`, { method: "DELETE", headers }).catch(() => undefined);
        return NextResponse.json({ id: archive?.id, fileId });
    } catch (error) {
        if (fileId) await fetch(`${DIRECTUS_URL}/files/${fileId}`, { method: "DELETE", headers }).catch(() => undefined);
        console.error("Invoice PDF archive error:", error);
        return NextResponse.json({ error: "Invoice was created, but its PDF could not be archived." }, { status: 500 });
    }
}
