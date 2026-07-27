import { FormEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, Calendar, CheckCircle, FileCheck2, FileText, Loader2, Printer, RefreshCw, Settings2, X } from "lucide-react";
import { archiveInvoiceDocument, fetchPrintableInvoice, fetchReceiptTemplate, fetchReceiptTypes, fetchSalesOrderAvailability } from "../services/invoicing-api";
import { AvailabilityLine, CreateInvoicePayload, CreatedInvoiceResult, InvoicingCandidate, ORTemplate, PrintableInvoice, ReceiptType } from "../types";
import { generateInvoiceReceiptPdf } from "../utils/generateInvoiceReceiptPdf";
import { DEFAULT_RECEIPT_TEMPLATE, normalizeReceiptTemplate } from "../receipt-template";
import { ReceiptPreview } from "./ReceiptPreview";
import ReceiptTemplateEditor from "./ReceiptTemplateEditor";

interface Props {
    candidate: InvoicingCandidate;
    submitting: boolean;
    onClose: () => void;
    onSubmit: (payload: CreateInvoicePayload) => Promise<CreatedInvoiceResult | null>;
}

export default function CreateInvoiceModal({ candidate, submitting, onClose, onSubmit }: Props) {
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const [invoiceNo, setInvoiceNo] = useState(`INV-${candidate.order_no.replace(/^SO-/, "")}`);
    const [invoiceDate, setInvoiceDate] = useState(today);
    const [dueDate, setDueDate] = useState(due.toISOString().slice(0, 10));
    const [remarks, setRemarks] = useState(`Billing for Sales Order ${candidate.order_no}`);
    const [receiptTypes, setReceiptTypes] = useState<ReceiptType[]>([]);
    const [invoiceTypeId, setInvoiceTypeId] = useState(0);
    const [createdResult, setCreatedResult] = useState<CreatedInvoiceResult | null>(null);
    const [printable, setPrintable] = useState<PrintableInvoice | null>(null);
    const [previewUrl, setPreviewUrl] = useState("");
    const [loadingPrint, setLoadingPrint] = useState(false);
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const [pdfError, setPdfError] = useState("");
    const [printError, setPrintError] = useState("");
    const [archiveStatus, setArchiveStatus] = useState<"idle" | "saved" | "failed">("idle");
    const [availability, setAvailability] = useState<{ lines: AvailabilityLine[]; overallStockStatus: string } | null>(null);
    const [loadingAvailability, setLoadingAvailability] = useState(true);
    const [previewingBeforeCreate, setPreviewingBeforeCreate] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(false);
    const [template, setTemplate] = useState<ORTemplate>(DEFAULT_RECEIPT_TEMPLATE);
    const [loadingTemplate, setLoadingTemplate] = useState(false);
    const [printingDirectly, setPrintingDirectly] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmationNotes, setConfirmationNotes] = useState("");
    const pdfBlobRef = useRef<Blob | null>(null);
    const prevPreviewUrlRef = useRef("");
    const printingDirectlyRef = useRef(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const selectedType = receiptTypes.find((type) => type.id === invoiceTypeId);
    const hasShortage = availability?.lines.some((l) => l.shortage > 0);

    useEffect(() => {
        void fetchReceiptTypes().then((types) => {
            setReceiptTypes(types);
            setInvoiceTypeId(types[0]?.id || 0);
        });
    }, []);

    useEffect(() => {
        if (!invoiceTypeId) return;
        let cancelled = false;
        setLoadingTemplate(true);
        void fetchReceiptTemplate(invoiceTypeId).then(result => {
            if (!cancelled) setTemplate(normalizeReceiptTemplate(result));
        }).catch(() => {
            if (!cancelled) setTemplate(normalizeReceiptTemplate());
        }).finally(() => {
            if (!cancelled) setLoadingTemplate(false);
        });
        return () => { cancelled = true; };
    }, [invoiceTypeId]);

    useEffect(() => {
        if (!printable) return;
        let cancelled = false;
        setGeneratingPdf(true);
        setPdfError("");
        generateInvoiceReceiptPdf(printable).then((doc) => {
            if (cancelled) return;
            const blob = doc.output("blob");
            pdfBlobRef.current = blob;
            if (prevPreviewUrlRef.current) URL.revokeObjectURL(prevPreviewUrlRef.current);
            const url = URL.createObjectURL(blob);
            prevPreviewUrlRef.current = url;
            setPreviewUrl(url);
            archiveInvoiceDocument(printable.invoiceId, blob, printable.invoiceNo, printable.templateConfig?.width || 210, printable.templateConfig?.height || 265)
                .then(() => setArchiveStatus("saved"))
                .catch(() => setArchiveStatus("failed"))
                .finally(async () => {
                    setGeneratingPdf(false);
                    if (printingDirectlyRef.current) {
                        try {
                            await downloadReceipt(printable);
                            onCloseRef.current();
                        } catch (error) {
                            printingDirectlyRef.current = false;
                            setPrintingDirectly(false);
                            setPdfError(error instanceof Error ? error.message : "Failed to download receipt");
                        }
                    }
                });
        }).catch((err) => {
            if (cancelled) return;
            setPdfError(err instanceof Error ? err.message : "Failed to generate PDF");
            setGeneratingPdf(false);
        });
        return () => { cancelled = true; };
    }, [printable]);

    useEffect(() => () => {
        if (prevPreviewUrlRef.current) URL.revokeObjectURL(prevPreviewUrlRef.current);
    }, []);

    const retryPdf = () => {
        if (!printable) return;
        setPdfError("");
        pdfBlobRef.current = null;
        setPreviewUrl("");
        if (prevPreviewUrlRef.current) URL.revokeObjectURL(prevPreviewUrlRef.current);
        prevPreviewUrlRef.current = "";
        setGeneratingPdf(true);
        generateInvoiceReceiptPdf(printable).then((doc) => {
            const blob = doc.output("blob");
            pdfBlobRef.current = blob;
            const url = URL.createObjectURL(blob);
            prevPreviewUrlRef.current = url;
            setPreviewUrl(url);
            archiveInvoiceDocument(printable.invoiceId, blob, printable.invoiceNo, printable.templateConfig?.width || 210, printable.templateConfig?.height || 265)
                .then(() => setArchiveStatus("saved"))
                .catch(() => setArchiveStatus("failed"))
                .finally(() => setGeneratingPdf(false));
        }).catch((err) => {
            setPdfError(err instanceof Error ? err.message : "Failed to generate PDF");
            setGeneratingPdf(false);
        });
    };

    useEffect(() => {
        setLoadingAvailability(true);
        void fetchSalesOrderAvailability(candidate.order_id).then((result) => {
            setAvailability(result);
        }).catch(() => {
            setAvailability(null);
        }).finally(() => {
            setLoadingAvailability(false);
        });
    }, [candidate.order_id]);

    const loadInvoicePrint = async (result: CreatedInvoiceResult) => {
        setLoadingPrint(true);
        setPrintError("");
        try {
            const invoice = await fetchPrintableInvoice(result.invoiceId);
            setPrintable(invoice);
        } catch (err) {
            setPrintError(err instanceof Error ? err.message : "Failed to load printable invoice");
        } finally {
            setLoadingPrint(false);
        }
    };

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        setConfirmationNotes(remarks);
        setShowConfirmModal(true);
    };

    const create = async (notesToUse?: string) => {
        const finalRemarks = (notesToUse !== undefined ? notesToUse : remarks).trim();
        const created = await onSubmit({ salesOrderId: candidate.order_id, invoiceTypeId, invoiceNo: invoiceNo.trim(), invoiceDate, dueDate, remarks: finalRemarks || undefined });
        if (!created) return;
        setPreviewingBeforeCreate(false);
        setCreatedResult(created);
        await loadInvoicePrint(created);
    };

    const downloadReceipt = async (invoice: PrintableInvoice) => {
        const doc = await generateInvoiceReceiptPdf(invoice, { includeBackground: false });
        const blob = doc.output("blob");
        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `${invoice.invoiceNo}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const print = async () => {
        if (!printable) return;
        setGeneratingPdf(true);
        try {
            await downloadReceipt(printable);
            onClose();
        } catch (error) {
            setPdfError(error instanceof Error ? error.message : "Failed to prepare physical receipt");
        } finally {
            setGeneratingPdf(false);
        }
    };

    const gross = candidate.details.reduce((sum, line) => sum + Number(line.unit_price || 0) * Number(line.ordered_quantity || 0), 0);
    const net = Number(candidate.net_amount ?? candidate.total_amount ?? gross);
    const provisional: PrintableInvoice = {
        invoiceId: 0,
        invoiceNo: invoiceNo.trim() || "PREVIEW",
        invoiceDate,
        dueDate,
        transactionStatus: "Preview",
        receiptType: selectedType || { id: invoiceTypeId, type: "Sales Invoice", isOfficial: true, maxLength: 0 },
        orderNo: candidate.order_no,
        poNo: candidate.po_no,
        customerName: candidate.customer_name,
        storeName: candidate.customer_name,
        customerTin: "N/A",
        customerAddress: "",
        salesmanName: "N/A",
        paymentTermName: "N/A",
        lines: candidate.details.map(line => {
            const product = typeof line.product_id === "object" ? line.product_id : null;
            const lineGross = Number(line.unit_price || 0) * Number(line.ordered_quantity || 0);
            return { detailId: line.detail_id, productCode: product?.product_code || "", productName: product?.product_name || `Product #${line.product_id}`, quantity: Number(line.ordered_quantity), unit: product?.uom || "PCS", unitPrice: Number(line.unit_price), discountAmount: 0, grossAmount: lineGross, netAmount: Number(line.net_amount ?? lineGross) };
        }),
        totals: { gross, discount: Math.max(0, gross - net), vat: 0, net },
        templateConfig: template,
    };
    const showOverlay = previewingBeforeCreate || (!!createdResult && !printingDirectly) || (loadingPrint && !printingDirectly);

    return <div className={showOverlay ? "fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-2 backdrop-blur-sm sm:p-4" : "min-w-0"}>
        <div className={`flex w-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm ${showOverlay ? `h-[94dvh] ${printable || previewingBeforeCreate ? "max-w-7xl" : "max-w-3xl"} shadow-xl sm:h-auto sm:max-h-[94dvh]` : "max-h-[78dvh]"}`}>
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-5">
                <div><h3 className="text-sm font-black uppercase tracking-wide">{printable ? `${printable.receiptType.type} Ready` : "Convert To Invoice"}</h3><p className="mt-0.5 text-[10px] text-muted-foreground">{candidate.order_no} · {candidate.customer_name}</p></div>
                <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            {printingDirectly && createdResult ? <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /><div><p className="text-xs font-black uppercase">Preparing Receipt</p><p className="mt-1 text-[10px] text-muted-foreground">The download will start automatically.</p></div></div> : loadingPrint ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : previewingBeforeCreate ? <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row">
                <div className="min-h-[65vh] flex-1 overflow-auto rounded-xl border bg-muted/50 p-6"><div className="mx-auto" style={{ width: `${template.width * 0.72}mm`, height: `${template.height * 0.72}mm` }}><ReceiptPreview invoice={provisional} template={template} scale={0.72} /></div></div>
                <div className="w-full shrink-0 space-y-3 md:w-72 lg:w-80"><div className="rounded-xl border bg-primary/5 p-4"><p className="text-[9px] font-black uppercase text-primary">Receipt Preview</p><p className="mt-1 font-black">{provisional.invoiceNo}</p><p className="mt-2 text-[10px] text-muted-foreground">The scanned background is for alignment. Print physical forms at 100% or Actual Size.</p></div><button type="button" onClick={() => setEditingTemplate(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black"><Settings2 className="h-4 w-4" />Configure Layout</button><button type="button" onClick={() => setPreviewingBeforeCreate(false)} className="w-full rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground">Close Preview</button></div>
            </div> : printable ? pdfError ? <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-6">
                <div className="rounded-xl border bg-emerald-500/5 p-4 text-center">
                    <p className="text-[9px] font-black uppercase text-emerald-600">Invoice Created</p>
                    <p className="mt-1 font-black">{printable.invoiceNo}</p>
                    <p className="text-[10px] text-muted-foreground">Status: {printable.transactionStatus}</p>
                </div>
                <div className="rounded-xl border border-amber-300 bg-amber-500/10 px-4 py-3 text-center text-[10px] font-bold text-amber-700">{pdfError}</div>
                <button type="button" disabled={generatingPdf} onClick={retryPdf} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-50">
                    {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Retry Generate PDF
                </button>
            </div> : <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row">
                <iframe title="Invoice receipt preview" src={previewUrl} className="min-h-[65vh] flex-1 rounded-xl border bg-white" />
                <div className="w-full space-y-3 md:w-64">
                    <div className="rounded-xl border bg-emerald-500/5 p-4"><p className="text-[9px] font-black uppercase text-emerald-600">Invoice Created</p><p className="mt-1 font-black">{printable.invoiceNo}</p><p className="text-[10px] text-muted-foreground">Status: {printable.transactionStatus}</p><p className={`mt-2 text-[9px] ${archiveStatus === "failed" ? "text-amber-600" : "text-muted-foreground"}`}>{archiveStatus === "saved" ? "PDF archived" : archiveStatus === "failed" ? "PDF archive failed; printing is still available" : "Archiving PDF..."}</p></div>
                    <button type="button" disabled={generatingPdf} onClick={print} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-50">
                        {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        {generatingPdf ? "Preparing PDF..." : "Print Receipt"}
                    </button>
                </div>
            </div> : createdResult && printError ? <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-6">
                <div className="rounded-xl border bg-emerald-500/5 p-4 text-center">
                    <p className="text-[9px] font-black uppercase text-emerald-600">Invoice Created</p>
                    <p className="mt-1 font-black">{createdResult.invoiceNo}</p>
                    <p className="text-[10px] text-muted-foreground">Status: {createdResult.transactionStatus}</p>
                </div>
                <div className="rounded-xl border border-amber-300 bg-amber-500/10 px-4 py-3 text-center text-[10px] font-bold text-amber-700">
                    {printError}
                </div>
                <button type="button" disabled={loadingPrint} onClick={() => loadInvoicePrint(createdResult)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-50">
                    {loadingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Retry Load Receipt
                </button>
            </div> : <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
                <div className="rounded-xl border bg-muted/20 px-3 py-2.5 text-xs"><span className="font-bold">{candidate.po_no || "No PO number"}</span><span className="mx-2 text-muted-foreground">·</span>{candidate.branch_name || `Branch #${candidate.branch_id}`}</div>

                <div className="overflow-hidden rounded-xl border">
                    <div className="border-b bg-muted/30 px-4 py-2 text-[9px] font-extrabold uppercase text-muted-foreground">Sales Order Items</div>
                    <div className="max-h-32 divide-y overflow-y-auto">{candidate.details.map(line => {
                        const product = typeof line.product_id === "object" ? line.product_id : null;
                        return <div key={line.detail_id} className="flex items-center justify-between gap-4 px-4 py-1.5 text-xs"><div className="min-w-0"><p className="truncate font-bold">{product?.product_name || `Product #${line.product_id}`}</p><p className="text-[9px] text-muted-foreground">{product?.product_code || ""} · {line.bom_version_name || "No version"}</p></div><div className="shrink-0 text-right"><p className="font-bold">{line.ordered_quantity} {product?.uom || ""}</p><p className="text-[9px] text-muted-foreground">{line.net_amount != null ? `₱${Number(line.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ""}</p></div></div>;
                    })}</div>
                    <div className="flex justify-between border-t bg-muted/20 px-4 py-2 text-xs font-black"><span>Total</span><span>₱{Number(candidate.net_amount || candidate.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                </div>

                {loadingAvailability ? <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /><span className="ml-2 text-[10px] text-muted-foreground">Checking available FG stock...</span></div> : availability ? <div className={`overflow-hidden rounded-xl border ${hasShortage ? "border-amber-300" : "border-emerald-300"}`}>
                    <div className={`flex items-center gap-2 border-b px-4 py-2 text-[9px] font-extrabold uppercase ${hasShortage ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700"}`}>
                        {hasShortage ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                        Available Finished Goods (On Hand − Reserved)
                    </div>
                    <div className="divide-y">{availability.lines.map(line => {
                        const product = typeof candidate.details.find(d => d.detail_id === line.detailId)?.product_id === "object"
                            ? candidate.details.find(d => d.detail_id === line.detailId)!.product_id as { uom?: string }
                            : null;
                        return <div key={line.detailId} className={`space-y-0.5 px-4 py-1.5 ${line.shortage > 0 ? "bg-amber-500/5" : ""}`}>
                            <div className="flex items-center justify-between text-xs"><span className="truncate font-bold">{line.productName}</span><span className="shrink-0 font-bold">{line.required} {product?.uom || ""}</span></div>
                            <div className="flex gap-3 text-[9px] text-muted-foreground"><span>On Hand: {line.onHand}</span><span>Reserved: {line.reserved}</span><span>Available: {line.available}</span>{line.shortage > 0 ? <span className="font-bold text-amber-600">Shortage: {line.shortage}</span> : null}</div>
                        </div>;
                    })}</div>
                    {hasShortage ? <div className="border-t bg-amber-500/10 px-4 py-2 text-[10px] font-bold text-amber-700">Insufficient FG stock to cover all order items</div> : <div className="border-t bg-emerald-500/10 px-4 py-2 text-[10px] font-bold text-emerald-700">Sufficient FG stock available</div>}
                </div> : <div className="rounded-xl border border-amber-300 bg-amber-500/10 px-4 py-2 text-[10px] font-bold text-amber-700">Unable to verify FG stock availability</div>}

                <label className="block space-y-1.5"><span className="text-[10px] font-extrabold uppercase text-muted-foreground">Receipt Type</span><select required value={invoiceTypeId || ""} onChange={e => setInvoiceTypeId(Number(e.target.value))} className="w-full rounded-xl border bg-background px-3.5 py-2 text-xs outline-none focus:border-primary"><option value="" disabled>Select receipt type</option>{receiptTypes.map(type => <option key={type.id} value={type.id}>{type.type}</option>)}</select></label>
                <label className="block space-y-1.5"><span className="text-[10px] font-extrabold uppercase text-muted-foreground">Invoice / Receipt Number</span><div className="relative"><FileText className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input required maxLength={selectedType?.maxLength || undefined} value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="w-full rounded-xl border bg-background py-2 pl-9 pr-3.5 text-xs outline-none focus:border-primary" /></div></label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{[{ label: "Invoice Date", value: invoiceDate, set: setInvoiceDate }, { label: "Payment Due Date", value: dueDate, set: setDueDate }].map(field => <label key={field.label} className="space-y-1.5"><span className="text-[10px] font-extrabold uppercase text-muted-foreground">{field.label}</span><div className="relative"><Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input required type="date" value={field.value} onChange={e => field.set(e.target.value)} className="w-full rounded-xl border bg-muted/40 py-2 pl-9 pr-3.5 text-xs outline-none focus:border-primary" /></div></label>)}</div>
                <label className="block space-y-1.5"><span className="text-[10px] font-extrabold uppercase text-muted-foreground">Remarks</span><textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} className="w-full resize-none rounded-xl border bg-muted/40 px-3.5 py-2 text-xs outline-none focus:border-primary" /></label>
                <div className="grid grid-cols-2 gap-3 border-t pt-3"><button type="button" disabled={!invoiceTypeId || loadingTemplate} onClick={() => setPreviewingBeforeCreate(true)} className="rounded-xl border px-4 py-2 text-xs font-bold disabled:opacity-50">Preview Receipt</button><button disabled={submitting || !invoiceTypeId || hasShortage || loadingAvailability || loadingTemplate} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-black text-primary-foreground disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}{submitting ? "Preparing Receipt..." : loadingTemplate ? "Loading Layout..." : hasShortage ? "Insufficient Stock" : "Print Receipt"}</button></div>
            </form>}
        </div>
        {showConfirmModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm sm:p-4">
                <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card p-4 shadow-2xl space-y-3.5 sm:p-5">
                    <div className="flex items-center justify-between border-b pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary">
                                <FileCheck2 className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-wide">Confirm Invoice Creation</h3>
                                <p className="text-[10px] text-muted-foreground">{candidate.order_no} · {candidate.customer_name}</p>
                            </div>
                        </div>
                        <button type="button" onClick={() => setShowConfirmModal(false)} aria-label="Close confirmation" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-2 gap-2.5 rounded-xl border bg-muted/20 p-3">
                            <div>
                                <span className="text-[9px] font-extrabold uppercase text-muted-foreground">Invoice No</span>
                                <p className="font-bold text-foreground">{invoiceNo.trim()}</p>
                            </div>
                            <div>
                                <span className="text-[9px] font-extrabold uppercase text-muted-foreground">Receipt Type</span>
                                <p className="font-bold text-foreground">{selectedType?.type || "Sales Invoice"}</p>
                            </div>
                            <div>
                                <span className="text-[9px] font-extrabold uppercase text-muted-foreground">Customer</span>
                                <p className="truncate font-bold text-foreground">{candidate.customer_name}</p>
                            </div>
                            <div>
                                <span className="text-[9px] font-extrabold uppercase text-muted-foreground">Total Amount</span>
                                <p className="font-black text-primary">₱{net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div>
                                <span className="text-[9px] font-extrabold uppercase text-muted-foreground">Invoice Date</span>
                                <p className="font-bold text-foreground">{invoiceDate}</p>
                            </div>
                            <div>
                                <span className="text-[9px] font-extrabold uppercase text-muted-foreground">Due Date</span>
                                <p className="font-bold text-foreground">{dueDate}</p>
                            </div>
                        </div>

                        <label className="block space-y-1.5">
                            <span className="text-[10px] font-extrabold uppercase text-muted-foreground">Confirmation Notes / Remarks</span>
                            <textarea
                                rows={3}
                                value={confirmationNotes}
                                onChange={e => setConfirmationNotes(e.target.value)}
                                placeholder="Add notes or remarks to include with this confirmation..."
                                className="w-full resize-none rounded-xl border bg-background px-3.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </label>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t pt-3">
                        <button
                            type="button"
                            onClick={() => setShowConfirmModal(false)}
                            className="rounded-xl border px-4 py-2 text-xs font-bold hover:bg-muted"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShowConfirmModal(false);
                                setRemarks(confirmationNotes);
                                printingDirectlyRef.current = true;
                                setPrintingDirectly(true);
                                void create(confirmationNotes);
                            }}
                            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-black text-primary-foreground hover:bg-primary/90"
                        >
                            <Printer className="h-4 w-4" />
                            Confirm & Create Invoice
                        </button>
                    </div>
                </div>
            </div>
        )}
        {editingTemplate ? <ReceiptTemplateEditor receiptTypeId={invoiceTypeId} initialTemplate={template} onClose={() => setEditingTemplate(false)} onSave={saved => { setTemplate(saved); setEditingTemplate(false); }} /> : null}
    </div>;
}
