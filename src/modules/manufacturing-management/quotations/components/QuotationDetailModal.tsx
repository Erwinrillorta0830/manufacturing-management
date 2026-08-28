import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowRight, Printer } from "lucide-react";
import { QuotationHeader, QuotationSnapshotNode } from "../types";
import { formatCurrency } from "@/lib/utils";

interface QuotationDetailModalProps {
    isDetailModalOpen: boolean;
    selectedQuote: QuotationHeader | null;
    snapshots: QuotationSnapshotNode[];
    loadingSnapshots: boolean;
    setIsDetailModalOpen: (open: boolean) => void;
    reviseQuotation: (quote: QuotationHeader) => void;
    handlePrintQuotation: () => void;
    loadQuotes?: () => void;
    projectQuoteHistory?: QuotationHeader[];
}

export function QuotationDetailModal({
    isDetailModalOpen,
    selectedQuote,
    snapshots,
    loadingSnapshots,
    setIsDetailModalOpen,
    reviseQuotation,
    handlePrintQuotation,
    loadQuotes,
    projectQuoteHistory = []
}: QuotationDetailModalProps) {
    const router = useRouter();
    const [rejecting, setRejecting] = useState(false);
    const [routing, setRouting] = useState(false);
    const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);

    const [activeHistoryQuoteId, setActiveHistoryQuoteId] = useState<number | null>(null);
    const [historySnapshots, setHistorySnapshots] = useState<QuotationSnapshotNode[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    React.useEffect(() => {
        if (selectedQuote) {
            setActiveHistoryQuoteId(selectedQuote.id);
            setHistorySnapshots([]);
        }
    }, [selectedQuote]);

    React.useEffect(() => {
        if (!activeHistoryQuoteId || !selectedQuote) return;
        if (activeHistoryQuoteId === selectedQuote.id) return; // We use the passed `snapshots` prop

        let isMounted = true;
        setLoadingHistory(true);
        fetch(`/api/manufacturing/finished-goods/quotes/snapshots?quoteId=${activeHistoryQuoteId}`)
            .then(res => res.json())
            .then(data => {
                if (isMounted) {
                    setHistorySnapshots(data);
                    setLoadingHistory(false);
                }
            })
            .catch(err => {
                console.error("Failed to load historical snapshots", err);
                if (isMounted) setLoadingHistory(false);
            });
        return () => { isMounted = false; };
    }, [activeHistoryQuoteId, selectedQuote]);

    const handleRejectProject = async () => {
        if (!selectedQuote) return;
        setIsRejectConfirmOpen(true);
    };

    const confirmRejectProject = async () => {
        if (!selectedQuote) return;

        setRejecting(true);
        try {
            const projectId = selectedQuote.project_id && typeof selectedQuote.project_id === "object"
                ? (selectedQuote.project_id as { id: number }).id
                : selectedQuote.project_id;

            const res = await fetch("/api/manufacturing/finished-goods/quotes", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    quoteId: selectedQuote.id,
                    projectId: projectId,
                    status: "Rejected"
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to reject quote");

            toast.success("Quote rejected successfully");
            setIsRejectConfirmOpen(false);
            setIsDetailModalOpen(false);
            if (loadQuotes) loadQuotes();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || "Failed to reject quote");
        } finally {
            setRejecting(false);
        }
    };

    const handleApproveAndRoute = () => {
        if (!selectedQuote) return;
        setRouting(true);
        try {
            const payload = {
                customer: typeof selectedQuote.customer_id === 'object' && selectedQuote.customer_id !== null
                    ? (selectedQuote.customer_id as { id: number }).id
                    : selectedQuote.customer_id,
                quoteId: selectedQuote.id,
                quoteNumber: selectedQuote.quote_number,
                snapshots: snapshots.map(s => ({
                    productId: s.product_id,
                    parentId: s.parent_id,
                    productTypeId: s.product_type_id,
                    versionId: s.version_id,
                    productName: s.node_name,
                    quantity: s.quantity,
                    uom: s.uom,
                    frozenBaseCost: s.frozen_unit_cost_php,
                    agreedTargetPrice: s.frozen_total_cost_php
                }))
            };
            sessionStorage.setItem("pending_so_conversion", JSON.stringify(payload));
            router.push("/mm/sales-order");
        } catch (e) {
            console.error(e);
            toast.error("Failed to route to Sales Order module");
            setRouting(false);
        }
    };

    if (!isDetailModalOpen || !selectedQuote) return null;

    const displayQuote = activeHistoryQuoteId && activeHistoryQuoteId !== selectedQuote.id
        ? projectQuoteHistory.find(q => q.id === activeHistoryQuoteId) || selectedQuote
        : selectedQuote;
    
    const displaySnapshots = activeHistoryQuoteId && activeHistoryQuoteId !== selectedQuote.id
        ? historySnapshots
        : snapshots;
    
    const isHistoryView = displayQuote.id !== selectedQuote.id;

    const simulatedCost = Number(displayQuote.total_simulated_cost || 0);
    const sellingPrice = Number(displayQuote.total_selling_price || 0);
    const netMargin = sellingPrice - simulatedCost;
    const marginPct = sellingPrice > 0 ? (netMargin / sellingPrice) * 100 : 0;

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-card border rounded-xl shadow-xl w-full max-w-[90vw] h-[90vh] max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b flex justify-between items-center bg-muted/10">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-base font-bold text-foreground">Quote Snapshot Detail</h3>
                            {displayQuote.status === "Converted to SO" && (
                                <span className="text-[10px] bg-teal-500/10 text-teal-600 px-2 py-0.5 rounded-full font-bold border border-teal-500/20">
                                    🔒 Approved & Converted
                                </span>
                            )}
                            {isHistoryView && (
                                <span className="text-[10px] bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full font-bold border border-amber-500/20">
                                    Viewing Previous Revision (Read-only)
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <p className="text-xs text-muted-foreground">Quote Number: <strong className="text-foreground">{displayQuote.quote_number}</strong> | Status: <span className="font-bold text-primary">{displayQuote.status || "Draft"}</span></p>
                            {projectQuoteHistory.length > 1 && (
                                <select 
                                    value={activeHistoryQuoteId || selectedQuote.id}
                                    onChange={(e) => setActiveHistoryQuoteId(Number(e.target.value))}
                                    className="text-[10px] border border-slate-200 dark:border-slate-800 rounded px-2 py-1 bg-background text-foreground cursor-pointer font-bold outline-none focus:ring-1 focus:ring-primary shadow-sm"
                                >
                                    {projectQuoteHistory.map(q => (
                                        <option key={q.id} value={q.id}>
                                            {q.quote_number} {q.id === selectedQuote.id ? "(Latest)" : ""} - {q.status || "Draft"}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isHistoryView && displayQuote.status !== "Converted to SO" && displayQuote.status !== "Rejected" && (
                            <>
                                <button
                                    disabled={rejecting || routing}
                                    onClick={handleRejectProject}
                                    className="bg-destructive hover:bg-destructive/90 text-white text-xs font-bold rounded-lg px-3 py-1.5 transition-colors shadow-xs flex items-center gap-1 disabled:opacity-50"
                                >
                                    {rejecting && <Loader2 className="h-3 w-3 animate-spin" />}
                                    Reject Project
                                </button>
                                <button
                                    disabled={rejecting || routing}
                                    onClick={handleApproveAndRoute}
                                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg px-3 py-1.5 transition-colors shadow-xs flex items-center gap-1 animate-pulse"
                                >
                                    {routing ? (
                                        <>
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            Routing...
                                        </>
                                    ) : (
                                        <>
                                            Approve & Convert to SO
                                            <ArrowRight className="h-3 w-3" />
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                        <button
                            onClick={handlePrintQuotation}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors shadow-xs flex items-center gap-1.5"
                        >
                            <Printer className="w-3.5 h-3.5" />
                            Print Report
                        </button>
                        {!isHistoryView && displayQuote.status !== "Converted to SO" && displayQuote.status !== "Rejected" && (
                            <button
                                onClick={() => {
                                    reviseQuotation(displayQuote);
                                    setIsDetailModalOpen(false);
                                }}
                                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors shadow-xs"
                            >
                                Revise Quote
                            </button>
                        )}
                        <button
                            onClick={() => setIsDetailModalOpen(false)}
                            className="text-muted-foreground hover:text-foreground text-xs font-semibold rounded-lg border px-3 py-1.5 hover:bg-muted"
                        >
                            Close
                        </button>
                    </div>
                </div>

                {/* Summary Grid */}
                <div className="flex-1 overflow-y-auto p-6 bg-background space-y-6">
                    {loadingSnapshots ? (
                        <div className="flex justify-center items-center h-32">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-4 gap-4">
                                <div className="rounded-lg border bg-card p-4 flex flex-col justify-center items-center shadow-sm">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Simulated Cost (₱)</span>
                                    <span className="text-xl font-extrabold text-foreground font-mono">{formatCurrency(simulatedCost)}</span>
                                </div>
                                <div className="rounded-lg border bg-card p-4 flex flex-col justify-center items-center shadow-sm">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Target Price (₱)</span>
                                    <span className="text-xl font-extrabold text-primary font-mono">{formatCurrency(sellingPrice)}</span>
                                </div>
                                <div className="rounded-lg border bg-card p-4 flex flex-col justify-center items-center shadow-sm">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Net Margin (₱)</span>
                                    <span className={`text-xl font-extrabold font-mono ${netMargin >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                                        {formatCurrency(netMargin)}
                                    </span>
                                </div>
                                <div className="rounded-lg border bg-card p-4 flex flex-col justify-center items-center shadow-sm">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Margin %</span>
                                    <span className={`text-xl font-extrabold font-mono ${marginPct >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                                        {marginPct.toFixed(2)}%
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-xl border shadow-sm overflow-hidden">
                                <div className="bg-muted/30 px-4 py-3 border-b flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-foreground">Frozen Quotation Items</h4>
                                    <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{displaySnapshots.length} item(s)</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-muted/20 text-muted-foreground font-bold">
                                            <tr>
                                                <th className="p-2.5 uppercase">Product / Node Name</th>
                                                <th className="p-2.5 uppercase">Qty</th>
                                                <th className="p-2.5 uppercase">UOM</th>
                                                <th className="p-2.5 uppercase text-right">Unit Cost (₱)</th>
                                                <th className="p-2.5 uppercase text-right">Ext Cost (₱)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {displaySnapshots.map((item) => {
                                                const unitCost = Number(item.frozen_unit_cost_php || 0);
                                                const totalCost = Number(item.frozen_total_cost_php || 0);
                                                return (
                                                    <tr key={item.id} className="hover:bg-muted/10">
                                                        <td className="p-2.5 font-medium text-foreground">{item.node_name}</td>
                                                        <td className="p-2.5 text-right font-medium">{item.quantity}</td>
                                                        <td className="p-2.5 text-muted-foreground">{item.uom}</td>
                                                        <td className="p-2.5 text-right font-semibold text-muted-foreground">{formatCurrency(unitCost)}</td>
                                                        <td className="p-2.5 text-right font-bold text-primary">{formatCurrency(totalCost)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Custom Reject Confirmation Modal */}
            {isRejectConfirmOpen && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
                    <div className="bg-card border rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b bg-destructive/10 text-destructive">
                            <h3 className="text-base font-bold">Confirm Rejection</h3>
                        </div>
                        <div className="p-6">
                            <p className="text-sm text-foreground/80 mb-6">
                                Are you sure you want to reject this quote? This action cannot be undone and will mark the quotation as voided.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setIsRejectConfirmOpen(false)}
                                    disabled={rejecting}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmRejectProject}
                                    disabled={rejecting}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-destructive hover:bg-destructive/90 text-white transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {rejecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                    Confirm Rejection
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
