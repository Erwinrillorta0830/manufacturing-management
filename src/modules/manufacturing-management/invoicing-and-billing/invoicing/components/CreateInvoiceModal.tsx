import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Building2, Calendar, FileCheck2, FileText, Loader2, Package, PackageCheck, Printer, RefreshCw, Settings2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { archiveInvoiceDocument, fetchPrintableInvoice, fetchReceiptTemplate, fetchReceiptTypes, fetchSalesOrderAvailability } from "../services/invoicing-api";
import { CreateInvoicePayload, CreatedInvoiceResult, InvoicingCandidate, LineAllocationPayload, LineBatchAllocation, LineAvailability, ORTemplate, PrintableInvoice, ReceiptType, SalesOrderAvailability, SiblingConsolidatedOrder } from "../types";
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
    const [previewingBeforeCreate, setPreviewingBeforeCreate] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(false);
    const [template, setTemplate] = useState<ORTemplate>(DEFAULT_RECEIPT_TEMPLATE);
    const [loadingTemplate, setLoadingTemplate] = useState(false);
    const [printingDirectly, setPrintingDirectly] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmationNotes, setConfirmationNotes] = useState("");
    const [lineInvoiceQtys, setLineInvoiceQtys] = useState<Record<number, number | string>>({});
    const pdfBlobRef = useRef<Blob | null>(null);
    const prevPreviewUrlRef = useRef("");
    const printingDirectlyRef = useRef(false);
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);
    const selectedType = receiptTypes.find((type) => type.id === invoiceTypeId);

    const getLineInvoiceQty = useCallback((productId: number, fallback: number): number => {
        const val = lineInvoiceQtys[productId];
        if (val === undefined || val === "") return fallback;
        return Number(val) || 0;
    }, [lineInvoiceQtys]);

    const handleLineInvoiceQtyChange = (productId: number, rawVal: string, maxQty: number) => {
        if (rawVal === "") {
            setLineInvoiceQtys((prev) => ({ ...prev, [productId]: "" }));
            return;
        }
        const num = Number(rawVal);
        if (!isNaN(num)) {
            const clamped = Math.max(0, Math.min(num, maxQty));
            setLineInvoiceQtys((prev) => ({ ...prev, [productId]: clamped }));
        }
    };

    const handleLineInvoiceQtyBlur = (productId: number, fallback: number) => {
        const val = lineInvoiceQtys[productId];
        if (val === "" || val === undefined || isNaN(Number(val))) {
            setLineInvoiceQtys((prev) => ({ ...prev, [productId]: fallback }));
        }
    };

    const lineTotals = useMemo(() => {
        const lineQtyMap = new Map<number, number>();
        let subtotal = 0;

        for (const detail of candidate.details) {
            const pId = typeof detail.product_id === "object" ? Number(detail.product_id?.product_id) : Number(detail.product_id);
            const orderedQty = Number(detail.ordered_quantity || 0);
            const lineAvail = availability?.lines.find((l) => l.productId === pId);
            const availPool = lineAvail?.totalPoolQuantity !== undefined
                ? lineAvail.totalPoolQuantity
                : (lineAvail?.pickedQuantity ?? orderedQty);
            const maxInvoiceable = Math.min(orderedQty, Math.max(0, availPool));
            const invoiceQty = Math.min(maxInvoiceable, getLineInvoiceQty(pId, maxInvoiceable));

            lineQtyMap.set(pId, invoiceQty);

            const unitPrice = Number(detail.unit_price || 0);
            subtotal += invoiceQty * unitPrice;
        }

        const discount = 0;
        const grandTotal = Math.max(0, subtotal - discount);

        return {
            subtotal,
            discount,
            grandTotal,
            lineQtyMap,
        };
    }, [candidate, availability, lineInvoiceQtys, getLineInvoiceQty]);

    const shortfallLines = useMemo(() => {
        if (!availability) return [];
        const list: Array<{
            productId: number;
            productName: string;
            uomStr: string;
            currentInvoiceQty: number;
            totalConsolidatedPool: number;
            remainingForSiblings: number;
            siblingDemand: number;
            siblingShortfall: number;
            unInvoicedSiblings: SiblingConsolidatedOrder[];
        }> = [];

        for (const detail of candidate.details) {
            const product = typeof detail.product_id === "object" ? detail.product_id : null;
            const pId = product ? Number(product.product_id) : Number(detail.product_id);
            const displayName = product?.description || product?.product_name || `Product #${detail.product_id}`;
            const uomStr = product?.uom || "PCS";
            const orderedQty = Number(detail.ordered_quantity || 0);

            const lineAvail = availability.lines.find((l) => l.productId === pId);
            const availPool = lineAvail?.totalPoolQuantity !== undefined
                ? lineAvail.totalPoolQuantity
                : (lineAvail?.pickedQuantity ?? orderedQty);
            const maxInvoiceable = Math.min(orderedQty, Math.max(0, availPool));
            const invoiceQty = Math.min(maxInvoiceable, getLineInvoiceQty(pId, maxInvoiceable));

            const siblingOrders = lineAvail?.siblingOrders || [];
            const unInvoicedSiblings = siblingOrders.filter((s) => !s.isInvoiced);
            const siblingDemand = unInvoicedSiblings.reduce((sum, s) => sum + Number(s.orderedQuantity || 0), 0);
            const detailReservations = (availability.rawReservations || []).filter(
                (r) => Number(r.sales_order_detail_id) === Number(detail.detail_id)
            );
            const rawDetailPickedQty = detailReservations.length > 0
                ? detailReservations.reduce((sum, r) => sum + Number(r.picked_quantity || 0), 0)
                : Number(lineAvail?.pickedQuantity ?? 0);
            const fallbackBatchPool = (lineAvail?.batches || []).reduce(
                (sum, b) => sum + Number(b.totalBatchPickedPool || b.pickedQuantity || b.onhandQuantity || 0),
                0
            ) || rawDetailPickedQty;

            const totalConsolidatedPool = (lineAvail?.totalPoolQuantity !== undefined && lineAvail.totalPoolQuantity > 0)
                ? lineAvail.totalPoolQuantity
                : fallbackBatchPool;

            const remainingForSiblings = Math.max(0, totalConsolidatedPool - invoiceQty);
            const siblingShortfall = Math.max(0, siblingDemand - remainingForSiblings);

            if (siblingDemand > 0 && siblingShortfall > 0) {
                list.push({
                    productId: pId,
                    productName: displayName,
                    uomStr,
                    currentInvoiceQty: invoiceQty,
                    totalConsolidatedPool,
                    remainingForSiblings,
                    siblingDemand,
                    siblingShortfall,
                    unInvoicedSiblings,
                });
            }
        }
        return list;
    }, [availability, candidate.details, lineInvoiceQtys, getLineInvoiceQty]);

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
            if (!cancelled) {
                console.group(`[Invoicing Debug] Availability & Picked Quantities for Order #${candidate.order_no} (ID: ${candidate.order_id})`);
                console.log("Consolidator Batch:", data?.consolidatorNo || "None (Standalone)");
                console.log("Raw Availability Payload:", data);
                if (data?.rawDetails && data.rawDetails.length > 0) {
                    console.group("Raw sales_order_details");
                    console.table(data.rawDetails);
                    console.groupEnd();
                }
                if (data?.rawReservations && data.rawReservations.length > 0) {
                    console.group("Raw sales_order_reservation");
                    console.table(data.rawReservations);
                    console.groupEnd();
                }
                if (data?.lines) {
                    console.table(data.lines.map((l) => ({
                        "Product ID": l.productId,
                        "Product Name": l.productName,
                        "Ordered Qty": l.requiredQuantity,
                        "Picked Qty": l.pickedQuantity,
                        "Consolidation Pool Qty": l.totalPoolQuantity,
                        "On-Hand Qty": l.onhandQuantity,
                        "Batches Count": l.batches?.length || 0,
                    })));
                    for (const l of data.lines) {
                        if (l.batches && l.batches.length > 0) {
                            console.group(`Batches for ${l.productName} (ID: ${l.productId})`);
                            console.table(l.batches.map((b) => ({
                                "Batch No": b.batchNo,
                                "Lot Name": b.lotName || `Lot #${b.lotId}`,
                                "Picked Qty (This Order)": b.pickedQuantity,
                                "Reserved (This Order)": b.thisOrderReserved,
                                "Total Batch Picked Pool": b.totalBatchPickedPool,
                                "Condition": b.inventoryCondition,
                                "Expiry": b.expirationDate,
                                "Shared Siblings": b.siblingOrders?.length || 0,
                            })));
                            console.groupEnd();
                        }
                    }
                }
                console.groupEnd();

                setAvailability(data);
                const initialMap: Record<number, number | string> = {};
                for (const detail of candidate.details) {
                    const pId = typeof detail.product_id === "object" ? Number(detail.product_id?.product_id) : Number(detail.product_id);
                    const orderedQty = Number(detail.ordered_quantity || 0);
                    const lineAvail = data.lines?.find((l: LineAvailability) => l.productId === pId);
                    const availPool = lineAvail?.totalPoolQuantity !== undefined
                        ? lineAvail.totalPoolQuantity
                        : (lineAvail?.pickedQuantity ?? orderedQty);
                    const maxInv = Math.min(orderedQty, Math.max(0, availPool));
                    initialMap[pId] = maxInv;
                }
                setLineInvoiceQtys(initialMap);
            }
        }).finally(() => {
            if (!cancelled) setLoadingAvailability(false);
        });
        return () => { cancelled = true; };
    }, [candidate.order_id, candidate.order_no, candidate.details]);

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
        const lineAllocations: LineAllocationPayload[] = candidate.details.map((detail) => {
            const pId = typeof detail.product_id === "object" ? Number(detail.product_id?.product_id) : Number(detail.product_id);
            const lineAvail = availability?.lines.find((l) => l.productId === pId);
            const orderedQty = Number(detail.ordered_quantity || 0);
            const availPool = lineAvail?.totalPoolQuantity !== undefined
                ? lineAvail.totalPoolQuantity
                : (lineAvail?.pickedQuantity ?? orderedQty);
            const maxInvoiceable = Math.min(orderedQty, Math.max(0, availPool));
            const targetInvoiceQty = Math.min(maxInvoiceable, getLineInvoiceQty(pId, maxInvoiceable));

            let remainingToAlloc = targetInvoiceQty;
            const batchAllocations: LineBatchAllocation[] = (lineAvail?.batches || []).map((b) => {
                const batchCap = Number(b.pickedQuantity || b.onhandQuantity || 0);
                const alloc = Math.min(remainingToAlloc, batchCap);
                remainingToAlloc = Math.max(0, remainingToAlloc - alloc);
                return {
                    inventoryLotId: b.inventoryLotId,
                    lotId: b.lotId,
                    batchNo: b.batchNo,
                    quantity: alloc,
                };
            });

            return {
                productId: pId,
                quantity: targetInvoiceQty,
                batchAllocations,
            };
        });

        const payload: CreateInvoicePayload = {
            salesOrderId: candidate.order_id,
            invoiceNo: invoiceNo.trim(),
            invoiceDate,
            dueDate,
            remarks: customRemarks ?? remarks,
            invoiceTypeId,
            lineAllocations,
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
            const pId = product ? Number(product.product_id) : Number(line.product_id);
            const orderedQty = Number(line.ordered_quantity || 0);
            const invoiceQty = getLineInvoiceQty(pId, orderedQty);
            const unitPrice = Number(line.unit_price || 0);
            const lineGross = unitPrice * invoiceQty;
            return {
                detailId: line.detail_id,
                productCode: product?.product_code || "",
                productName: product?.description || product?.product_name || `Product #${line.product_id}`,
                quantity: invoiceQty,
                unit: product?.uom || "PCS",
                unitPrice: unitPrice,
                discountAmount: 0,
                grossAmount: lineGross,
                netAmount: lineGross,
            };
        }),
        totals: { gross: lineTotals.subtotal, discount: lineTotals.discount, vat: 0, net: lineTotals.grandTotal },
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
                            <p className="text-xs font-black text-primary truncate">₱{lineTotals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
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
                            {/* Left Column: Order Items & Invoice Quantities (span 7) */}
                            <div className="lg:col-span-7 space-y-4">
                                {/* Sales Order Items & Invoicing Quantities Card */}
                                <div className="overflow-hidden rounded-xl border bg-background shadow-xs">
                                    <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5 text-[10px] font-extrabold uppercase text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                            <Package className="h-3.5 w-3.5 text-primary" />
                                            <span>Sales Order Items & Invoice Quantities</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="rounded-full border bg-muted/60 px-2 py-0.5 font-bold">
                                                {candidate.details.length} {candidate.details.length === 1 ? "Line" : "Lines"}
                                            </span>
                                        </div>
                                    </div>

                                    {loadingAvailability && (
                                        <div className="flex items-center justify-center gap-2 border-b bg-muted/10 py-2.5 text-[10px] font-medium text-muted-foreground">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                            <span>Verifying warehouse stock and picked quantities...</span>
                                        </div>
                                    )}

                                    <div className="max-h-[55vh] divide-y overflow-y-auto">
                                        {candidate.details.map(line => {
                                            const product = typeof line.product_id === "object" ? line.product_id : null;
                                            const pId = product ? Number(product.product_id) : Number(line.product_id);
                                            const displayName = product?.description || product?.product_name || `Product #${line.product_id}`;
                                            const uomStr = product?.uom || "PCS";
                                            const unitPrice = Number(line.unit_price || 0);
                                            const orderedQty = Number(line.ordered_quantity || 0);
                                            const lineAvail = availability?.lines.find((l) => l.productId === pId);
                                            const availablePool = lineAvail?.totalPoolQuantity !== undefined
                                                ? lineAvail.totalPoolQuantity
                                                : (lineAvail?.pickedQuantity ?? orderedQty);
                                            const maxInvoiceable = Math.min(orderedQty, Math.max(0, availablePool));
                                            const defaultQty = maxInvoiceable;
                                            const currentInvoiceQty = Math.min(maxInvoiceable, getLineInvoiceQty(pId, defaultQty));
                                            const rawInputValue = lineInvoiceQtys[pId] !== undefined ? lineInvoiceQtys[pId] : defaultQty;
                                            const lineBilledTotal = currentInvoiceQty * unitPrice;
                                            const lineShortfall = shortfallLines.find((s) => s.productId === pId);

                                            return (
                                                <div key={line.detail_id} className="p-4 space-y-3 hover:bg-muted/5 transition-colors">
                                                    {/* Top Row: Product Info & Line Total */}
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0 space-y-0.5">
                                                            <p className="font-bold text-foreground text-xs leading-snug">{displayName}</p>
                                                            <p className="text-[10px] text-muted-foreground font-mono">
                                                                {product?.product_code || `ID: ${pId}`} · {line.bom_version_name || "Standard Version"} · ₱{unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} / {uomStr}
                                                            </p>
                                                        </div>
                                                        <div className="shrink-0 text-right">
                                                            <span className="text-[9px] uppercase font-extrabold text-muted-foreground block">Line Total</span>
                                                            <span className="font-mono text-xs font-black text-primary">
                                                                ₱{lineBilledTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Middle Row: Demand Info Badge */}
                                                    <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                                        <span className="rounded-md border bg-muted/40 px-2 py-0.5 font-medium text-foreground">
                                                            Ordered: <strong>{orderedQty} {uomStr}</strong>
                                                        </span>
                                                        {maxInvoiceable < orderedQty && (
                                                            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                                                Available to Invoice: <strong>{maxInvoiceable} {uomStr}</strong> ({orderedQty - maxInvoiceable} {uomStr} consumed by linked order)
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Bottom Row: Sales Invoice Qty Controls */}
                                                    <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-2.5">
                                                        <div className="space-y-0.5">
                                                            <span className="text-[10px] font-extrabold uppercase text-foreground block">Sales Invoice Qty</span>
                                                            <span className="text-[9px] text-muted-foreground">
                                                                Billed quantity for this invoice (max: {maxInvoiceable} {uomStr})
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleLineInvoiceQtyChange(pId, String(Math.max(0, currentInvoiceQty - 1)), maxInvoiceable)}
                                                                disabled={currentInvoiceQty <= 0}
                                                                className="h-8 w-8 rounded-lg border bg-background font-bold hover:bg-muted text-xs flex items-center justify-center disabled:opacity-30 transition-colors shadow-2xs"
                                                                aria-label="Decrease quantity"
                                                            >
                                                                -
                                                            </button>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={maxInvoiceable}
                                                                value={rawInputValue}
                                                                onChange={(e) => handleLineInvoiceQtyChange(pId, e.target.value, maxInvoiceable)}
                                                                onBlur={() => handleLineInvoiceQtyBlur(pId, defaultQty)}
                                                                onFocus={(e) => e.currentTarget.select()}
                                                                onClick={(e) => e.currentTarget.select()}
                                                                className="h-8 w-16 rounded-lg border bg-background text-center font-mono text-xs font-black focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-2xs"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleLineInvoiceQtyChange(pId, String(Math.min(maxInvoiceable, currentInvoiceQty + 1)), maxInvoiceable)}
                                                                disabled={currentInvoiceQty >= maxInvoiceable}
                                                                className="h-8 w-8 rounded-lg border bg-background font-bold hover:bg-muted text-xs flex items-center justify-center disabled:opacity-30 transition-colors shadow-2xs"
                                                                aria-label="Increase quantity"
                                                            >
                                                                +
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleLineInvoiceQtyChange(pId, String(maxInvoiceable), maxInvoiceable)}
                                                                className="h-8 rounded-lg border bg-background px-2.5 text-[10px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shadow-2xs"
                                                            >
                                                                Max
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Dynamic Consolidation Shortfall Alert */}
                                                    <AnimatePresence>
                                                        {lineShortfall && (
                                                            <motion.div
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: "auto" }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                transition={{ duration: 0.18 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                                                                    <div className="flex items-start gap-2">
                                                                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                                                                        <div className="space-y-1">
                                                                            <div className="font-bold flex items-center gap-1.5">
                                                                                <span>Consolidation Shortfall Warning</span>
                                                                                <span className="rounded bg-amber-500/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-amber-700 dark:text-amber-300">
                                                                                    -{lineShortfall.siblingShortfall} {uomStr} Deficit
                                                                                </span>
                                                                            </div>
                                                                            <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                                                                                Invoicing <strong>{lineShortfall.currentInvoiceQty} {uomStr}</strong> leaves only <strong>{lineShortfall.remainingForSiblings} {uomStr}</strong> in the shared consolidation pool (Total Allocated: {lineShortfall.totalConsolidatedPool} {uomStr}).
                                                                                {lineShortfall.remainingForSiblings === 0 ? (
                                                                                    <span className="block mt-0.5 font-bold text-amber-700 dark:text-amber-300">
                                                                                        ⚠️ Other linked order(s) will have a 100% shortfall (0 {uomStr} left)!
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="block mt-0.5 font-medium text-amber-700 dark:text-amber-300">
                                                                                        ⚠️ Linked order(s) ({lineShortfall.unInvoicedSiblings.map((s) => s.orderNo).join(", ")}) requested {lineShortfall.siblingDemand} {uomStr} and will have an unfulfilled deficit of {lineShortfall.siblingShortfall} {uomStr}.
                                                                                    </span>
                                                                                )}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Card Summary Footer */}
                                    <div className="flex justify-between items-center border-t bg-muted/20 px-4 py-2.5 text-xs font-black">
                                        <span className="text-muted-foreground uppercase text-[10px] font-extrabold">Original Demand Subtotal</span>
                                        <span className="text-xs font-bold text-muted-foreground font-mono">
                                            ₱{Number(candidate.net_amount || candidate.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center border-t border-primary/20 bg-primary/5 px-4 py-2.5 text-xs font-black">
                                        <span className="text-primary uppercase text-[10px] font-extrabold">Billed Invoice Subtotal</span>
                                        <span className="text-sm font-black text-primary font-mono">
                                            ₱{lineTotals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Invoice Setup Parameters (span 5) */}
                            <div className="lg:col-span-5 space-y-4">
                                {/* Real-time Billed Financial Summary Card */}
                                <div className="rounded-xl border bg-card p-4 shadow-xs space-y-2.5">
                                    <div className="flex items-center justify-between pb-1.5 border-b text-[10px] font-extrabold uppercase text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                            <FileCheck2 className="h-3.5 w-3.5 text-primary" />
                                            <span>Invoice Financial Summary</span>
                                        </div>
                                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary font-mono">
                                            Allocated Billing
                                        </span>
                                    </div>
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between text-muted-foreground">
                                            <span>Original Demand:</span>
                                            <span className="font-mono font-medium">
                                                ₱{Number(candidate.net_amount || candidate.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="flex justify-between font-bold text-foreground">
                                            <span>Allocated Billed Subtotal:</span>
                                            <span className="font-mono text-primary">
                                                ₱{lineTotals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-muted-foreground">
                                            <span>Discount:</span>
                                            <span className="font-mono">₱0.00</span>
                                        </div>
                                        <div className="flex justify-between border-t pt-2 text-sm font-black text-foreground">
                                            <span>Net Invoice Payable:</span>
                                            <span className="font-mono text-primary">
                                                ₱{lineTotals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>
                                </div>

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
                                    <p className="font-black text-primary">₱{lineTotals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
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

                            {shortfallLines.length > 0 && (
                                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                                    <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                        <span>Consolidation Shortfall Notice</span>
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                                        Invoicing these quantities will leave an unfulfilled deficit for other linked order(s) in this consolidation:
                                    </p>
                                    <ul className="list-disc list-inside space-y-1 text-[11px] font-medium">
                                        {shortfallLines.map((s, idx) => (
                                            <li key={idx}>
                                                <strong>{s.productName}</strong>: -{s.siblingShortfall} {s.uomStr} deficit for {s.unInvoicedSiblings.map((sib) => sib.orderNo).join(", ")}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

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
