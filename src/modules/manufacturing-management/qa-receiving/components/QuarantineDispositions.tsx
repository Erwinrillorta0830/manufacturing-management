"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, Ban, RefreshCw, RotateCcw, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { QuarantineDisposition, QuarantineStock } from "../types";

interface QuarantineDispositionsProps {
    stock: QuarantineStock[];
    dispositions: QuarantineDisposition[];
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    onCreate: (input: {
        sourceReceivingId: number;
        lotId: number;
        batchNo: string;
        dispositionType: "VENDOR_RETURN" | "REPLACEMENT";
        requestedQuantity: number;
        reason: string;
        supplierReference: string | null;
    }) => Promise<void>;
    onProcessReturn: (dispositionId: number, quantity: number) => Promise<void>;
    onCancel: (dispositionId: number) => Promise<void>;
    onStartReplacement: (disposition: QuarantineDisposition) => Promise<void>;
}

const terminalStatuses = new Set(["COMPLETED", "CANCELLED"]);

function formatQuantity(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function sourceLabel(stock: QuarantineStock | undefined, disposition: QuarantineDisposition): string {
    if (!stock) return `PO #${disposition.purchaseOrderId} / Product #${disposition.productId}`;
    return `${stock.purchaseOrderReference} / ${stock.productName}`;
}

function stockKey(stock: Pick<QuarantineStock, "sourceReceivingId" | "lotId" | "batchNo">): string {
    return `${stock.sourceReceivingId}:${stock.lotId}:${stock.batchNo}`;
}

export default function QuarantineDispositions({
    stock,
    dispositions,
    loading,
    error,
    onRefresh,
    onCreate,
    onProcessReturn,
    onCancel,
    onStartReplacement
}: QuarantineDispositionsProps) {
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [typeBySource, setTypeBySource] = useState<Record<string, "VENDOR_RETURN" | "REPLACEMENT">>({});
    const [quantityBySource, setQuantityBySource] = useState<Record<string, string>>({});
    const [reasonBySource, setReasonBySource] = useState<Record<string, string>>({});
    const [supplierReferenceBySource, setSupplierReferenceBySource] = useState<Record<string, string>>({});
    const [returnQuantityByDisposition, setReturnQuantityByDisposition] = useState<Record<number, string>>({});
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const filteredStock = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return stock.filter(item => !normalized || [
            item.supplierName,
            item.purchaseOrderReference,
            item.receiptNo,
            item.productName,
            item.productCode,
            item.batchNo,
            item.lotName,
            item.branchName
        ].some(value => value.toLowerCase().includes(normalized)));
    }, [query, stock]);

    const filteredDispositions = useMemo(() => dispositions.filter(item => {
        if (statusFilter && item.status !== statusFilter) return false;
        const normalized = query.trim().toLowerCase();
        if (!normalized) return true;
        const source = stock.find(candidate => candidate.sourceReceivingId === item.sourceReceivingId && candidate.lotId === item.lotId && candidate.batchNo === item.batchNo);
        return sourceLabel(source, item).toLowerCase().includes(normalized)
            || item.reason.toLowerCase().includes(normalized)
            || String(item.supplierReference || "").toLowerCase().includes(normalized);
    }), [dispositions, query, statusFilter, stock]);

    const create = async (source: QuarantineStock) => {
        const sourceKey = stockKey(source);
        const type = typeBySource[sourceKey] || "VENDOR_RETURN";
        const quantity = Number(quantityBySource[sourceKey] || source.availableQuantity);
        const reason = reasonBySource[sourceKey]?.trim() || "";
        if (!Number.isFinite(quantity) || quantity <= 0) {
            toast.error("Enter a positive disposition quantity.");
            return;
        }
        if (quantity > source.availableQuantity) {
            toast.error("The disposition quantity exceeds available quarantine stock.");
            return;
        }
        if (!reason) {
            toast.error("Enter a reason before creating the disposition.");
            return;
        }
        const busyKeyValue = `create-${sourceKey}`;
        setBusyKey(busyKeyValue);
        try {
            await onCreate({
                sourceReceivingId: source.sourceReceivingId,
                lotId: source.lotId,
                batchNo: source.batchNo,
                dispositionType: type,
                requestedQuantity: quantity,
                reason,
                supplierReference: supplierReferenceBySource[sourceKey]?.trim() || null
            });
            toast.success(type === "VENDOR_RETURN" ? "Vendor return requested." : "Replacement request created.");
        } catch (operationError) {
            toast.error((operationError as Error).message || "Failed to create the quarantine disposition.");
        } finally {
            setBusyKey(null);
        }
    };

    const processReturn = async (disposition: QuarantineDisposition) => {
        const quantity = Number(returnQuantityByDisposition[disposition.id] || disposition.remainingQuantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > disposition.remainingQuantity) {
            toast.error("Enter a valid vendor-return quantity within the remaining quantity.");
            return;
        }
        const key = `return-${disposition.id}`;
        setBusyKey(key);
        try {
            await onProcessReturn(disposition.id, quantity);
            toast.success("Vendor return processed and quarantine stock reduced.");
        } catch (operationError) {
            toast.error((operationError as Error).message || "Failed to process the vendor return.");
        } finally {
            setBusyKey(null);
        }
    };

    const cancel = async (disposition: QuarantineDisposition) => {
        const key = `cancel-${disposition.id}`;
        setBusyKey(key);
        try {
            await onCancel(disposition.id);
            toast.success("Quarantine disposition cancelled.");
        } catch (operationError) {
            toast.error((operationError as Error).message || "Failed to cancel the disposition.");
        } finally {
            setBusyKey(null);
        }
    };

    return (
        <div className="space-y-5">
            <div className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="flex items-center gap-2 text-sm font-extrabold">
                            <ShieldAlert className="h-4 w-4 text-amber-500" />
                            Quarantine Dispositions
                        </h3>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            Process rejected QA stock as a controlled vendor return or replacement request.
                        </p>
                    </div>
                    <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold hover:bg-muted" disabled={loading}>
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_180px]">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search supplier, PO, receipt, product, batch, lot..." className="h-8 w-full rounded-lg border bg-background pl-8 pr-2 text-[11px] outline-none focus:ring-1 focus:ring-primary" />
                    </label>
                    <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-8 rounded-lg border bg-background px-2 text-[11px] font-semibold outline-none focus:ring-1 focus:ring-primary">
                        <option value="">All disposition statuses</option>
                        <option value="REQUESTED">Requested</option>
                        <option value="PARTIALLY_PROCESSED">Partially Processed</option>
                        <option value="REPLACEMENT_PENDING">Replacement Pending</option>
                        <option value="REPLACEMENT_RECEIVED">Replacement Received</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                </div>
                {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive">{error}</div>}
            </div>

            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Eligible rejected stock</h4>
                    <span className="text-[10px] font-bold text-muted-foreground">{filteredStock.length} source record(s)</span>
                </div>
                {loading && stock.length === 0 ? <div className="rounded-xl border bg-card p-8 text-center text-xs text-muted-foreground">Loading quarantined stock...</div> : filteredStock.length === 0 ? <div className="rounded-xl border border-dashed bg-card p-8 text-center text-xs text-muted-foreground">No eligible rejected QA stock is available.</div> : filteredStock.map(source => {
                    const sourceKey = stockKey(source);
                    const selectedType = typeBySource[sourceKey] || "VENDOR_RETURN";
                    const busy = busyKey === `create-${sourceKey}`;
                    return (
                        <div key={sourceKey} className="rounded-xl border bg-card p-4 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="text-xs font-extrabold">{source.purchaseOrderReference} · {source.productName}</div>
                                    <div className="mt-1 text-[10px] text-muted-foreground">Supplier: {source.supplierName} · Receipt: {source.receiptNo || "N/A"} · Product code: {source.productCode}</div>
                                </div>
                                <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-right">
                                    <div className="text-[9px] font-bold uppercase text-amber-700 dark:text-amber-300">Available quarantine</div>
                                    <div className="text-sm font-extrabold text-amber-700 dark:text-amber-300">{formatQuantity(source.availableQuantity)}</div>
                                </div>
                            </div>
                            <div className="grid gap-2 text-[10px] text-muted-foreground md:grid-cols-4">
                                <div><span className="font-bold text-foreground">Location:</span> {source.branchName} ({source.branchCode})</div>
                                <div><span className="font-bold text-foreground">Lot:</span> {source.lotName} · {source.lotId}</div>
                                <div><span className="font-bold text-foreground">Batch:</span> {source.batchNo}</div>
                                <div><span className="font-bold text-foreground">Rejected:</span> {formatQuantity(source.rejectedQuantity)} · {source.rejectionReason || "No reason recorded"}</div>
                            </div>
                            <div className="grid gap-2 md:grid-cols-[160px_130px_1fr_180px_auto]">
                                <select value={selectedType} onChange={event => setTypeBySource(previous => ({ ...previous, [sourceKey]: event.target.value as "VENDOR_RETURN" | "REPLACEMENT" }))} className="h-8 rounded-lg border bg-background px-2 text-[11px] font-semibold">
                                    <option value="VENDOR_RETURN">Vendor Return</option>
                                    <option value="REPLACEMENT">Replacement</option>
                                </select>
                                <input type="number" min="0.000001" max={source.availableQuantity} step="any" value={quantityBySource[sourceKey] ?? source.availableQuantity} onChange={event => setQuantityBySource(previous => ({ ...previous, [sourceKey]: event.target.value }))} className="h-8 rounded-lg border bg-background px-2 text-[11px]" aria-label="Disposition quantity" />
                                <input value={reasonBySource[sourceKey] || ""} onChange={event => setReasonBySource(previous => ({ ...previous, [sourceKey]: event.target.value }))} placeholder="Reason / supplier action" className="h-8 rounded-lg border bg-background px-2 text-[11px]" />
                                <input value={supplierReferenceBySource[sourceKey] || ""} onChange={event => setSupplierReferenceBySource(previous => ({ ...previous, [sourceKey]: event.target.value }))} placeholder="Supplier reference (optional)" className="h-8 rounded-lg border bg-background px-2 text-[11px]" />
                                <button type="button" onClick={() => void create(source)} disabled={busy} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-bold text-primary-foreground disabled:opacity-50">
                                    <ArrowRightLeft className="h-3.5 w-3.5" />
                                    {busy ? "Saving..." : selectedType === "VENDOR_RETURN" ? "Request Return" : "Request Replacement"}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </section>

            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Disposition history</h4>
                    <span className="text-[10px] font-bold text-muted-foreground">{filteredDispositions.length} record(s)</span>
                </div>
                {filteredDispositions.length === 0 ? <div className="rounded-xl border border-dashed bg-card p-8 text-center text-xs text-muted-foreground">No quarantine dispositions match the current filters.</div> : filteredDispositions.map(disposition => {
                    const source = stock.find(item => item.sourceReceivingId === disposition.sourceReceivingId && item.lotId === disposition.lotId && item.batchNo === disposition.batchNo);
                    const isTerminal = terminalStatuses.has(disposition.status);
                    const canReturn = disposition.dispositionType === "VENDOR_RETURN" && !isTerminal;
                    const canReplace = disposition.dispositionType === "REPLACEMENT" && !isTerminal;
                    return (
                        <div key={disposition.id} className="rounded-xl border bg-card p-4 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="text-xs font-extrabold">{sourceLabel(source, disposition)}</div>
                                    <div className="mt-1 text-[10px] text-muted-foreground">{disposition.dispositionType === "VENDOR_RETURN" ? "Vendor Return" : "Replacement"} · Reason: {disposition.reason}</div>
                                </div>
                                <span className="rounded-full border px-2 py-1 text-[9px] font-extrabold uppercase">{disposition.status.replaceAll("_", " ")}</span>
                            </div>
                            <div className="grid gap-2 text-[10px] md:grid-cols-5">
                                <div><span className="text-muted-foreground">Requested</span><div className="font-extrabold">{formatQuantity(disposition.requestedQuantity)}</div></div>
                                <div><span className="text-muted-foreground">Processed</span><div className="font-extrabold">{formatQuantity(disposition.processedQuantity)}</div></div>
                                <div><span className="text-muted-foreground">Remaining</span><div className="font-extrabold">{formatQuantity(disposition.remainingQuantity)}</div></div>
                                <div><span className="text-muted-foreground">Supplier ref</span><div className="font-extrabold">{disposition.supplierReference || "N/A"}</div></div>
                                <div><span className="text-muted-foreground">Created</span><div className="font-extrabold">{disposition.createdAt ? new Date(disposition.createdAt).toLocaleString() : "N/A"}</div></div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {canReturn && <>
                                    <input type="number" min="0.000001" max={disposition.remainingQuantity} step="any" value={returnQuantityByDisposition[disposition.id] ?? disposition.remainingQuantity} onChange={event => setReturnQuantityByDisposition(previous => ({ ...previous, [disposition.id]: event.target.value }))} className="h-8 w-32 rounded-lg border bg-background px-2 text-[11px]" aria-label="Vendor return quantity" />
                                    <button type="button" onClick={() => void processReturn(disposition)} disabled={busyKey === `return-${disposition.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 text-[11px] font-bold text-amber-700 hover:bg-amber-500/10 disabled:opacity-50">
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        Process Return
                                    </button>
                                </>}
                                {canReplace && <button type="button" onClick={() => void onStartReplacement(disposition)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/40 px-3 text-[11px] font-bold text-primary hover:bg-primary/10">
                                    <ArrowRightLeft className="h-3.5 w-3.5" />
                                    Open Replacement QA
                                </button>}
                                {disposition.status === "REQUESTED" && disposition.processedQuantity <= 0 && <button type="button" onClick={() => void cancel(disposition)} disabled={busyKey === `cancel-${disposition.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-50">
                                    <Ban className="h-3.5 w-3.5" />
                                    Cancel
                                </button>}
                            </div>
                        </div>
                    );
                })}
            </section>
        </div>
    );
}
