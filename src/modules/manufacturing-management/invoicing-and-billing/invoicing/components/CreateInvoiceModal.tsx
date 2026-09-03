import { FormEvent, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Boxes, Building2, Calendar, CheckCircle2, FileCheck2, FileText, Layers, Loader2, Package, PackageCheck, Printer, RefreshCw, Settings2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { archiveInvoiceDocument, fetchPrintableInvoice, fetchReceiptTemplate, fetchReceiptTypes, fetchSalesOrderAvailability } from "../services/invoicing-api";
import { BatchItem, CreateInvoicePayload, CreatedInvoiceResult, InvoicingCandidate, LineAvailability, ORTemplate, PrintableInvoice, ReceiptType, SalesOrderAvailability } from "../types";
import { generateInvoiceReceiptPdf } from "../utils/generateInvoiceReceiptPdf";
import { DEFAULT_RECEIPT_TEMPLATE, normalizeReceiptTemplate } from "../receipt-template";
import { ReceiptPreview } from "./ReceiptPreview";
import ReceiptTemplateEditor from "./ReceiptTemplateEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
    candidate: InvoicingCandidate;
    submitting: boolean;
    onClose: () => void;
    onSubmit: (payload: CreateInvoicePayload) => Promise<CreatedInvoiceResult | null>;
}

function getLocalPHDateString(d = new Date()): string {
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Manila",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(d);
        const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
        return `${map.year}-${map.month}-${map.day}`;
    } catch {
        return d.toISOString().slice(0, 10);
    }
}

function getLocalPHDueDateString(days = 30): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return getLocalPHDateString(d);
}

export default function CreateInvoiceModal({ candidate, submitting, onClose, onSubmit }: Props) {
    const [invoiceNo, setInvoiceNo] = useState(`INV-${candidate.order_no.replace(/^SO-/, "")}`);
    const [invoiceDate, setInvoiceDate] = useState(() => getLocalPHDateString());
    const [dueDate, setDueDate] = useState(() => getLocalPHDueDateString(30));
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
    const [availability, setAvailability] = useState<SalesOrderAvailability | null>(null);
    const [loadingAvailability, setLoadingAvailability] = useState(true);
    const [selectedBatchProduct, setSelectedBatchProduct] = useState<LineAvailability | null>(null);
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
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);
    const selectedType = receiptTypes.find((type) => type.id === invoiceTypeId);

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

    useEffect(() => {
        void fetchReceiptTypes().then((types) => {
            setReceiptTypes(types);
            setInvoiceTypeId(types[0]?.id || 0);
        });
    }, []);

    useEffect(() => {
        if (!invoiceTypeId) return;
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) setLoadingTemplate(true);
        });
        void fetchReceiptTemplate(invoiceTypeId).then(result => {
            if (!cancelled) setTemplate(normalizeReceiptTemplate(result));
        }).finally(() => {
            if (!cancelled) setLoadingTemplate(false);
        });
        return () => { cancelled = true; };
    }, [invoiceTypeId]);

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) setLoadingAvailability(true);
        });
        void fetchSalesOrderAvailability(candidate.order_id).then(data => {
            if (!cancelled) setAvailability(data);
        }).finally(() => {
            if (!cancelled) setLoadingAvailability(false);
        });
        return () => { cancelled = true; };
    }, [candidate.order_id]);

    useEffect(() => {
        return () => {
            if (prevPreviewUrlRef.current) URL.revokeObjectURL(prevPreviewUrlRef.current);
        };
    }, []);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        setShowConfirmModal(true);
    };

    const create = async (customRemarks?: string) => {
        const payload: CreateInvoicePayload = {
            salesOrderId: candidate.order_id,
            invoiceNo: invoiceNo.trim(),
            invoiceDate,
            dueDate,
            remarks: customRemarks ?? remarks,
            invoiceTypeId,
        };

        const result = await onSubmit(payload);
        if (!result) return;
        setCreatedResult(result);
        await loadInvoicePrint(result);
    };

    const loadInvoicePrint = async (created: CreatedInvoiceResult) => {
        setLoadingPrint(true);
        setPrintError("");
        setPdfError("");
        try {
            const data = await fetchPrintableInvoice(created.invoiceId);
            setPrintable(data);
            await createPdfPreview(data);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to load printable invoice";
            setPrintError(message);
            toast.error(message);
        } finally {
            setLoadingPrint(false);
        }
    };

    const createPdfPreview = async (invoice: PrintableInvoice) => {
        setGeneratingPdf(true);
        setPdfError("");
        setArchiveStatus("idle");
        try {
            const doc = await generateInvoiceReceiptPdf(invoice, { includeBackground: false });
            const blob = doc.output("blob");
            pdfBlobRef.current = blob;
            if (prevPreviewUrlRef.current) URL.revokeObjectURL(prevPreviewUrlRef.current);
            const url = URL.createObjectURL(blob);
            prevPreviewUrlRef.current = url;
            setPreviewUrl(url);

            if (printingDirectlyRef.current) {
                await downloadReceipt(invoice);
                toast.success("Receipt downloaded");
                onCloseRef.current();
                return;
            }

            try {
                await archiveInvoiceDocument(invoice.invoiceId, blob, invoice.invoiceNo, invoice.templateConfig?.width || 210, invoice.templateConfig?.height || 265);
                setArchiveStatus("saved");
            } catch {
                setArchiveStatus("failed");
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to generate receipt PDF";
            setPdfError(message);
            toast.error(message);
        } finally {
            setGeneratingPdf(false);
        }
    };

    const print = async () => {
        if (!printable) return;
        if (pdfBlobRef.current) {
            const a = document.createElement("a");
            const url = URL.createObjectURL(pdfBlobRef.current);
            a.href = url;
            a.download = `${printable.invoiceNo}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("Receipt downloaded");
            onClose();
            return;
        }
        await downloadReceipt(printable);
        toast.success("Receipt downloaded");
        onClose();
    };

    const retryPdf = async () => {
        if (!printable) return;
        setGeneratingPdf(true);
        setPdfError("");
        try {
            const doc = await generateInvoiceReceiptPdf(printable, { includeBackground: false });
            const blob = doc.output("blob");
            pdfBlobRef.current = blob;
            if (prevPreviewUrlRef.current) URL.revokeObjectURL(prevPreviewUrlRef.current);
            const url = URL.createObjectURL(blob);
            prevPreviewUrlRef.current = url;
            setPreviewUrl(url);
            try {
                await archiveInvoiceDocument(printable.invoiceId, blob, printable.invoiceNo, printable.templateConfig?.width || 210, printable.templateConfig?.height || 265);
                setArchiveStatus("saved");
            } catch {
                setArchiveStatus("failed");
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to generate receipt PDF";
            setPdfError(message);
            toast.error(message);
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm sm:p-5">
            <motion.div 
                initial={{ opacity: 0, scale: 0.96, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 15 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className={`flex w-full flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl ${
                    printable || previewingBeforeCreate 
                        ? "max-w-7xl h-[92dvh]" 
                        : "max-w-5xl h-[90dvh] max-h-[92dvh]"
                }`}
            >
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b bg-muted/20 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5 text-primary shadow-xs">
                            <FileCheck2 className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-wide">
                                {printable ? `${printable.receiptType.type} Ready` : "Create Invoice & Receipt"}
                            </h3>
                            <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
                                <span className="font-bold text-foreground">{candidate.order_no}</span>
                                <span>•</span>
                                <span>{candidate.customer_name}</span>
                                <span>•</span>
                                <span className="text-primary font-semibold">Advances to Dispatched</span>
                            </p>
                        </div>
                    </div>
                    <button 
                        type="button" 
                        onClick={onClose} 
                        aria-label="Close" 
                        className="rounded-lg border bg-background p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shadow-xs"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* KPI Top Cards */}
                {!printable && !previewingBeforeCreate && (
                    <div className="grid grid-cols-2 gap-3 border-b border-border/60 bg-muted/10 px-6 py-3 sm:grid-cols-4 shrink-0">
                        <div className="rounded-xl border border-border/50 bg-background p-2.5 shadow-xs">
                            <div className="flex items-center justify-between text-muted-foreground mb-0.5">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider">Sales Order</span>
                                <FileText className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <p className="text-xs font-black text-foreground truncate">{candidate.order_no}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{candidate.customer_name}</p>
                        </div>

                        <div className="rounded-xl border border-border/50 bg-background p-2.5 shadow-xs">
                            <div className="flex items-center justify-between text-muted-foreground mb-0.5">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider">Branch & PO</span>
                                <Building2 className="h-3.5 w-3.5 text-blue-500" />
                            </div>
                            <p className="text-xs font-black text-foreground truncate">{candidate.branch_name || `Branch #${candidate.branch_id}`}</p>
                            <p className="text-[10px] text-muted-foreground truncate">PO: {candidate.po_no || "—"}</p>
                        </div>

                        <div className="rounded-xl border border-border/50 bg-background p-2.5 shadow-xs">
                            <div className="flex items-center justify-between text-muted-foreground mb-0.5">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider">Picking Status</span>
                                <PackageCheck className="h-3.5 w-3.5 text-emerald-500" />
                            </div>
                            <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">✓ Fully Picked</p>
                            <p className="text-[10px] text-muted-foreground">{candidate.details.length} Line{candidate.details.length === 1 ? "" : "s"} Verified</p>
                        </div>

                        <div className="rounded-xl border border-border/50 bg-background p-2.5 shadow-xs">
                            <div className="flex items-center justify-between text-muted-foreground mb-0.5">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider">Total Payable</span>
                                <ShieldCheck className="h-3.5 w-3.5 text-violet-500" />
                            </div>
                            <p className="text-xs font-black text-primary truncate">₱{net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            <p className="text-[10px] text-muted-foreground">Net Invoice Total</p>
                        </div>
                    </div>
                )}

                {printingDirectly && createdResult ? (
                    <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <div>
                            <p className="text-sm font-black uppercase">Preparing Receipt</p>
                            <p className="mt-1 text-xs text-muted-foreground">The download will start automatically.</p>
                        </div>
                    </div>
                ) : loadingPrint ? (
                    <div className="flex min-h-80 flex-1 items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Loading receipt...</p>
                        </div>
                    </div>
                ) : previewingBeforeCreate ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row">
                        <div className="min-h-[65vh] flex-1 overflow-auto rounded-xl border bg-muted/50 p-6">
                            <div className="mx-auto" style={{ width: `${template.width * 0.72}mm`, height: `${template.height * 0.72}mm` }}>
                                <ReceiptPreview invoice={provisional} template={template} scale={0.72} />
                            </div>
                        </div>
                        <div className="w-full shrink-0 space-y-3 md:w-72 lg:w-80">
                            <div className="rounded-xl border bg-primary/5 p-4">
                                <p className="text-[9px] font-black uppercase text-primary">Receipt Preview</p>
                                <p className="mt-1 font-black">{provisional.invoiceNo}</p>
                                <p className="mt-2 text-[10px] text-muted-foreground">The scanned background is for alignment. Print physical forms at 100% or Actual Size.</p>
                            </div>
                            <button type="button" onClick={() => setEditingTemplate(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black hover:bg-muted transition-colors">
                                <Settings2 className="h-4 w-4" />Configure Layout
                            </button>
                            <button type="button" onClick={() => setPreviewingBeforeCreate(false)} className="w-full rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground hover:bg-primary/90 transition-colors">
                                Close Preview
                            </button>
                        </div>
                    </div>
                ) : printable ? (
                    pdfError ? (
                        <div className="flex min-h-80 flex-1 flex-col items-center justify-center gap-4 p-6">
                            <div className="rounded-xl border bg-emerald-500/5 p-4 text-center">
                                <p className="text-[9px] font-black uppercase text-emerald-600">Invoice Created</p>
                                <p className="mt-1 font-black">{printable.invoiceNo}</p>
                                <p className="text-[10px] text-muted-foreground">Status: {printable.transactionStatus}</p>
                            </div>
                            <div className="rounded-xl border border-amber-300 bg-amber-500/10 px-4 py-3 text-center text-[10px] font-bold text-amber-700">{pdfError}</div>
                            <button type="button" disabled={generatingPdf} onClick={retryPdf} className="flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-50">
                                {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                Retry Generate PDF
                            </button>
                        </div>
                    ) : (
                        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row">
                            <iframe title="Invoice receipt preview" src={previewUrl} className="min-h-[65vh] flex-1 rounded-xl border bg-white" />
                            <div className="w-full space-y-3 md:w-64">
                                <div className="rounded-xl border bg-emerald-500/5 p-4">
                                    <p className="text-[9px] font-black uppercase text-emerald-600">Invoice Created</p>
                                    <p className="mt-1 font-black">{printable.invoiceNo}</p>
                                    <p className="text-[10px] text-muted-foreground">Status: {printable.transactionStatus}</p>
                                    <p className={`mt-2 text-[9px] ${archiveStatus === "failed" ? "text-amber-600" : "text-muted-foreground"}`}>
                                        {archiveStatus === "saved" ? "PDF archived" : archiveStatus === "failed" ? "PDF archive failed; printing is still available" : "Archiving PDF..."}
                                    </p>
                                </div>
                                <button type="button" disabled={generatingPdf} onClick={print} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-50 shadow-sm transition-all hover:bg-primary/90">
                                    {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                                    {generatingPdf ? "Preparing PDF..." : "Print Receipt"}
                                </button>
                            </div>
                        </div>
                    )
                ) : createdResult && printError ? (
                    <div className="flex min-h-80 flex-1 flex-col items-center justify-center gap-4 p-6">
                        <div className="rounded-xl border bg-emerald-500/5 p-4 text-center">
                            <p className="text-[9px] font-black uppercase text-emerald-600">Invoice Created</p>
                            <p className="mt-1 font-black">{createdResult.invoiceNo}</p>
                            <p className="text-[10px] text-muted-foreground">Status: {createdResult.transactionStatus}</p>
                        </div>
                        <div className="rounded-xl border border-amber-300 bg-amber-500/10 px-4 py-3 text-center text-[10px] font-bold text-amber-700">
                            {printError}
                        </div>
                        <button type="button" disabled={loadingPrint} onClick={() => loadInvoicePrint(createdResult)} className="flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-50">
                            {loadingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Retry Load Receipt
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {/* Main Body Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start p-5 sm:p-6 overflow-y-auto flex-1">
                            {/* Left Column: Order Items & Picked Batches (span 7) */}
                            <div className="lg:col-span-7 space-y-4">
                                {/* Sales Order Items Card */}
                                <div className="overflow-hidden rounded-xl border bg-background shadow-xs">
                                    <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5 text-[10px] font-extrabold uppercase text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                            <Package className="h-3.5 w-3.5 text-primary" />
                                            <span>Sales Order Items</span>
                                        </div>
                                        <span className="rounded-full border bg-muted/60 px-2 py-0.5 font-bold">
                                            {candidate.details.length} {candidate.details.length === 1 ? "Line" : "Lines"}
                                        </span>
                                    </div>
                                    <div className="max-h-48 divide-y overflow-y-auto">
                                        {candidate.details.map(line => {
                                            const product = typeof line.product_id === "object" ? line.product_id : null;
                                            const displayName = product?.description || product?.product_name || `Product #${line.product_id}`;
                                            return (
                                                <div key={line.detail_id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs hover:bg-muted/10 transition-colors">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-bold text-foreground">{displayName}</p>
                                                        <p className="text-[9px] text-muted-foreground font-mono">
                                                            {product?.product_code || ""} · {line.bom_version_name || "No version"}
                                                        </p>
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        <p className="font-bold text-foreground">{line.ordered_quantity} {product?.uom || ""}</p>
                                                        <p className="text-[10px] font-mono font-semibold text-primary">
                                                            {line.net_amount != null ? `₱${Number(line.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ""}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex justify-between items-center border-t bg-muted/20 px-4 py-2.5 text-xs font-black">
                                        <span className="text-muted-foreground uppercase text-[10px] font-extrabold">Subtotal</span>
                                        <span className="text-sm font-black text-primary">
                                            ₱{Number(candidate.net_amount || candidate.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>

                                {/* Picked Inventory & Batch Details Card */}
                                {loadingAvailability ? (
                                    <div className="flex items-center justify-center rounded-xl border border-dashed py-8 bg-muted/5">
                                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                        <span className="ml-2.5 text-xs font-bold text-muted-foreground">Loading verified warehouse batches...</span>
                                    </div>
                                ) : availability ? (
                                    <div className="overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5 shadow-xs">
                                        <div className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-400">
                                            <div className="flex items-center gap-1.5">
                                                <PackageCheck className="h-4 w-4 text-emerald-600" />
                                                <span>Warehouse Picked Lots & Batches</span>
                                            </div>
                                            {availability.consolidatorNo && (
                                                <span className="rounded-md border border-emerald-500/30 bg-background px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-700 dark:text-emerald-300">
                                                    Batch: {availability.consolidatorNo}
                                                </span>
                                            )}
                                        </div>
                                        <div className="max-h-48 divide-y divide-emerald-500/10 overflow-y-auto">
                                            {availability.lines.map((line: LineAvailability) => {
                                                const product = typeof candidate.details.find(d => {
                                                    const pId = typeof d.product_id === "object" ? d.product_id?.product_id : d.product_id;
                                                    return pId === line.productId;
                                                })?.product_id === "object"
                                                    ? candidate.details.find(d => {
                                                        const pId = typeof d.product_id === "object" ? d.product_id?.product_id : d.product_id;
                                                        return pId === line.productId;
                                                    })!.product_id as { uom?: string }
                                                    : null;
                                                const uomStr = product?.uom || "PCS";
                                                const pickedQty = line.pickedQuantity ?? line.requiredQuantity;
                                                const primaryBatch = line.batches?.[0];

                                                return (
                                                    <div key={line.productId} className="space-y-1.5 px-4 py-2.5 bg-background/50">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="truncate font-bold text-foreground">{line.productName}</span>
                                                            <span className="shrink-0 font-bold text-emerald-600 dark:text-emerald-400">
                                                                {pickedQty} {uomStr} (Picked)
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2 text-[9px] text-muted-foreground">
                                                            {primaryBatch ? (
                                                                <span className="rounded-md border border-emerald-500/20 bg-background px-2 py-0.5 font-mono text-[9px] text-foreground">
                                                                    {primaryBatch.lotName || `Lot #${primaryBatch.lotId}`}{primaryBatch.batchNo ? ` · ${primaryBatch.batchNo}` : ""}
                                                                </span>
                                                            ) : (
                                                                <span className="rounded-md border border-emerald-500/20 bg-background px-2 py-0.5 font-mono text-[9px] text-foreground">
                                                                    Verified Picked Lot
                                                                </span>
                                                            )}
                                                            {primaryBatch?.expirationDate && (
                                                                <span>Exp: {new Date(primaryBatch.expirationDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "2-digit" })}</span>
                                                            )}
                                                            <span className="ml-auto inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                                                                <CheckCircle2 className="h-3 w-3" /> Fully Picked
                                                            </span>
                                                        </div>
                                                        {line.batches.length > 1 && (
                                                            <div className="mt-1 pt-0.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSelectedBatchProduct(line)}
                                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-bold text-primary hover:bg-primary/10 transition-colors"
                                                                >
                                                                    <Boxes className="h-3 w-3" />
                                                                    View All Picked Batches ({line.batches.length})
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                        ✓ Picked inventory verified
                                    </div>
                                )}
                            </div>

                            {/* Right Column: Invoice Setup Parameters (span 5) */}
                            <div className="lg:col-span-5 space-y-4">
                                <div className="space-y-3.5 rounded-xl border bg-muted/10 p-4 shadow-xs">
                                    <div className="flex items-center gap-1.5 pb-1 border-b text-[10px] font-extrabold uppercase text-muted-foreground">
                                        <FileText className="h-3.5 w-3.5 text-primary" />
                                        <span>Invoice & Receipt Parameters</span>
                                    </div>

                                    <div className="space-y-1">
                                        <span className="text-[10px] font-extrabold uppercase text-muted-foreground">Receipt Type</span>
                                        <Select
                                            value={invoiceTypeId ? String(invoiceTypeId) : ""}
                                            onValueChange={(val) => setInvoiceTypeId(Number(val))}
                                        >
                                            <SelectTrigger className="w-full h-9 rounded-xl border bg-background px-3.5 text-xs font-semibold shadow-none focus:ring-2 focus:ring-primary/20">
                                                <SelectValue placeholder="Select receipt type" />
                                            </SelectTrigger>
                                            <SelectContent className="rounded-xl">
                                                {receiptTypes.map(type => (
                                                    <SelectItem key={type.id} value={String(type.id)} className="text-xs font-medium">
                                                        {type.type}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <label className="block space-y-1">
                                        <span className="text-[10px] font-extrabold uppercase text-muted-foreground">Invoice / Receipt Number</span>
                                        <div className="relative">
                                            <FileText className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <input 
                                                required 
                                                maxLength={selectedType?.maxLength || undefined} 
                                                value={invoiceNo} 
                                                onChange={e => setInvoiceNo(e.target.value)} 
                                                className="w-full rounded-xl border bg-background py-2 pl-9 pr-3.5 text-xs font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" 
                                            />
                                        </div>
                                    </label>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <label className="space-y-1">
                                            <span className="text-[10px] font-extrabold uppercase text-muted-foreground">Invoice Date</span>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <input 
                                                    required 
                                                    type="date" 
                                                    value={invoiceDate} 
                                                    onChange={e => setInvoiceDate(e.target.value)} 
                                                    className="w-full rounded-xl border bg-background py-2 pl-9 pr-3.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" 
                                                />
                                            </div>
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-[10px] font-extrabold uppercase text-muted-foreground">Payment Due Date</span>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <input 
                                                    required 
                                                    type="date" 
                                                    value={dueDate} 
                                                    onChange={e => setDueDate(e.target.value)} 
                                                    className="w-full rounded-xl border bg-background py-2 pl-9 pr-3.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" 
                                                />
                                            </div>
                                        </label>
                                    </div>

                                    <label className="block space-y-1">
                                        <span className="text-[10px] font-extrabold uppercase text-muted-foreground">Remarks / Billing Notes</span>
                                        <textarea 
                                            rows={3} 
                                            value={remarks} 
                                            onChange={e => setRemarks(e.target.value)} 
                                            className="w-full resize-none rounded-xl border bg-background px-3.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" 
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Sticky Action Footer */}
                        <div className="flex items-center justify-between border-t bg-muted/20 px-6 py-3.5 shrink-0">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-xl border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shadow-xs"
                            >
                                Cancel
                            </button>
                            <div className="flex items-center gap-3">
                                <button 
                                    type="button" 
                                    disabled={!invoiceTypeId || loadingTemplate} 
                                    onClick={() => setPreviewingBeforeCreate(true)} 
                                    className="rounded-xl border bg-background px-4 py-2 text-xs font-bold shadow-xs hover:bg-muted disabled:opacity-50 transition-colors"
                                >
                                    Preview Receipt
                                </button>
                                <button 
                                    type="submit"
                                    disabled={submitting || !invoiceTypeId || loadingAvailability || loadingTemplate} 
                                    className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-black text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                                >
                                    {submitting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Printer className="h-4 w-4" />
                                    )}
                                    {submitting ? "Preparing Receipt..." : loadingTemplate ? "Loading Layout..." : "Print & Create Invoice"}
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </motion.div>
        <AnimatePresence>
            {selectedBatchProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm sm:p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.18 }}
                        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card p-4 shadow-2xl space-y-3 sm:p-5"
                    >
                        <div className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary">
                                    <Boxes className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-black uppercase tracking-wide truncate">Available Batches by Lot</h3>
                                    <p className="text-[10px] text-muted-foreground truncate">{selectedBatchProduct.productName} {selectedBatchProduct.productCode ? `(${selectedBatchProduct.productCode})` : ""}</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setSelectedBatchProduct(null)} aria-label="Close batches modal" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 rounded-xl border bg-muted/20 p-3 text-xs">
                            <div>
                                <span className="text-[9px] font-extrabold uppercase text-muted-foreground">Order Quantity</span>
                                <p className="font-bold text-foreground">{selectedBatchProduct.requiredQuantity}</p>
                            </div>
                            <div className="text-right">
                                <span className="text-[9px] font-extrabold uppercase text-muted-foreground">Total Picked</span>
                                <p className="font-black text-emerald-600 dark:text-emerald-400">
                                    {selectedBatchProduct.pickedQuantity || selectedBatchProduct.requiredQuantity}
                                </p>
                            </div>
                        </div>

                        <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                            {selectedBatchProduct.batches.length === 0 ? (
                                <p className="text-center py-6 text-xs text-muted-foreground italic">No specific batch reservation records found.</p>
                            ) : (
                                (() => {
                                    const lotMap = new Map<string, { lotId: number; lotName: string; totalPicked: number; batches: BatchItem[] }>();
                                    for (const b of selectedBatchProduct.batches) {
                                        const lotKey = b.lotName || `Lot #${b.lotId}`;
                                        const existing = lotMap.get(lotKey);
                                        const qty = b.pickedQuantity ?? b.onhandQuantity;
                                        if (existing) {
                                            existing.totalPicked += qty;
                                            existing.batches.push(b);
                                        } else {
                                            lotMap.set(lotKey, {
                                                lotId: b.lotId,
                                                lotName: b.lotName || `Lot #${b.lotId}`,
                                                totalPicked: qty,
                                                batches: [b],
                                            });
                                        }
                                    }
                                    return Array.from(lotMap.values()).sort((a, b) => b.totalPicked - a.totalPicked).map((group) => (
                                        <div key={group.lotId || group.lotName} className="rounded-xl border bg-muted/10 overflow-hidden">
                                            <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5 border-b text-xs font-bold text-foreground">
                                                <div className="flex items-center gap-1.5">
                                                    <Layers className="h-3.5 w-3.5 text-primary" />
                                                    <span>{group.lotName}</span>
                                                </div>
                                                <span className="text-[10px] font-mono text-muted-foreground">
                                                    Picked in Lot: <strong className="text-emerald-600 dark:text-emerald-400">{group.totalPicked}</strong>
                                                </span>
                                            </div>
                                            <div className="divide-y divide-border/30 text-[11px]">
                                                {group.batches.map((b, idx) => (
                                                    <div key={idx} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/20 transition-colors">
                                                        <div className="space-y-0.5">
                                                            <p className="font-mono font-bold text-foreground">{b.batchNo}</p>
                                                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                                <span>Condition: <strong className="text-foreground">{b.inventoryCondition || "GOOD"}</strong></span>
                                                                {b.expirationDate && (
                                                                    <span>Exp: {b.expirationDate.slice(0, 10)}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{b.pickedQuantity ?? b.onhandQuantity}</span>
                                                            <p className="text-[9px] text-muted-foreground">picked</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ));
                                })()
                            )}
                        </div>

                        <div className="flex items-center justify-end border-t pt-3">
                            <button
                                type="button"
                                onClick={() => setSelectedBatchProduct(null)}
                                className="rounded-xl bg-primary px-5 py-2 text-xs font-black text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        <AnimatePresence>
            {showConfirmModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm sm:p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.18 }}
                        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card p-4 shadow-2xl space-y-3.5 sm:p-5"
                    >
                        <div className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary">
                                    <FileCheck2 className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-wide">Confirm Invoice Creation</h3>
                                    <p className="text-[10px] text-muted-foreground">{candidate.order_no} · {candidate.customer_name} · Will advance to For Dispatched</p>
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
                                className="rounded-xl border px-4 py-2 text-xs font-bold hover:bg-muted transition-colors"
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
                                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-black text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                                <Printer className="h-4 w-4" />
                                Confirm & Create Invoice
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        {editingTemplate ? <ReceiptTemplateEditor receiptTypeId={invoiceTypeId} initialTemplate={template} onClose={() => setEditingTemplate(false)} onSave={saved => { setTemplate(saved); setEditingTemplate(false); }} /> : null}
        </div>
    );
}
