"use client";

import React, { useState, useEffect } from "react";
import { 
    ClipboardCheck, 
    TrendingUp, 
    TrendingDown, 
    Search, 
    Calendar, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    DollarSign, 
    RefreshCw, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    Layers, 
    AlertCircle, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    DollarSign as PesoIcon,
    ChevronRight,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    ArrowRight
} from "lucide-react";
import { toast } from "sonner";

interface Customer {
    id: number | string;
    customer_name: string;
    customer_code: string;
}

interface QuotationHeader {
    id: number;
    quote_number: string;
    quote_date: string;
    customer_id: Customer | null;
    total_selling_price: number;
    total_simulated_cost: number;
    forex_rate_used?: number | null;
    remarks?: string;
    project_name?: string;
}

interface QuotationSnapshotNode {
    id: number | string;
    product_id: number;
    version_id: number;
    node_name: string;
    node_type: string;
    quantity: number;
    uom: string;
    frozen_unit_cost_php: number;
    frozen_total_cost_php: number; // Represents agreed target selling price
}

interface AuditedSnapshotItem extends QuotationSnapshotNode {
    live_unit_cost_php: number;
    variance_php: number;
    variance_percent: number;
}

export default function CostSnapshotsModule() {
    const [quotes, setQuotes] = useState<QuotationHeader[]>([]);
    const [selectedQuote, setSelectedQuote] = useState<QuotationHeader | null>(null);
    const [auditedItems, setAuditedItems] = useState<AuditedSnapshotItem[]>([]);
    
    const [loadingQuotes, setLoadingQuotes] = useState(false);
    const [loadingAudits, setLoadingAudits] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Load recent quotations
    const loadQuotes = async () => {
        setLoadingQuotes(true);
        try {
            const res = await fetch("/api/manufacturing/finished-goods/quotes");
            if (!res.ok) throw new Error("Failed to load quotations");
            const data = await res.json();
            setQuotes(data || []);
        } catch (err) {
            console.error("Error loading quotes:", err);
            toast.error("Failed to fetch quotations list");
        } finally {
            setLoadingQuotes(false);
        }
    };

    useEffect(() => {
        loadQuotes();
    }, []);

    // Perform audit variance calculations for the selected quote
    const auditQuoteCosts = async (quote: QuotationHeader) => {
        setLoadingAudits(true);
        try {
            // 1. Fetch frozen snapshots
            const snapRes = await fetch(`/api/manufacturing/finished-goods/quotes/snapshots?quoteId=${quote.id}`);
            if (!snapRes.ok) throw new Error("Failed to load quotation snapshots");
            const snapshots: QuotationSnapshotNode[] = await snapRes.json();

            // 2. Fetch current live rolled up standard costs for each product in parallel
            const audited = await Promise.all(snapshots.map(async (snap) => {
                let liveCost = 0;
                try {
                    const forexQuery = quote.forex_rate_used ? `&forexRate=${Number(quote.forex_rate_used)}` : "";
                    const costRes = await fetch(
                        `/api/manufacturing/finished-goods/bom-cost?productId=${snap.product_id}&versionId=${snap.version_id}${forexQuery}`
                    );
                    if (costRes.ok) {
                        const costData = await costRes.json();
                        liveCost = Number(costData.cost || 0);
                    }
                } catch (e) {
                    console.error(`Error loading live cost for product ID ${snap.product_id}:`, e);
                }

                const frozenUnitCost = Number(snap.frozen_unit_cost_php || 0);
                const frozenTotalCost = Number(snap.frozen_total_cost_php || 0);
                const quantity = Number(snap.quantity || 1);

                const variance = liveCost - frozenUnitCost;
                const variancePct = frozenUnitCost > 0 
                    ? (variance / frozenUnitCost) * 100 
                    : 0;

                return {
                    ...snap,
                    quantity,
                    frozen_unit_cost_php: frozenUnitCost,
                    frozen_total_cost_php: frozenTotalCost,
                    live_unit_cost_php: liveCost,
                    variance_php: variance,
                    variance_percent: variancePct
                };
            }));

            setAuditedItems(audited);
        } catch (err) {
            console.error("Error auditing cost snapshot:", err);
            toast.error("Failed to calculate cost variance audits");
        } finally {
            setLoadingAudits(false);
        }
    };

    // Trigger audit when quote selection changes
    useEffect(() => {
        if (selectedQuote) {
            auditQuoteCosts(selectedQuote);
        } else {
            setAuditedItems([]);
        }
    }, [selectedQuote]);

    // Filtering logic for quotations list
    const filteredQuotes = quotes.filter(q => {
        const query = searchQuery.toLowerCase();
        return (
            q.quote_number.toLowerCase().includes(query) ||
            (q.project_name || "").toLowerCase().includes(query) ||
            (q.customer_id?.customer_name || "").toLowerCase().includes(query)
        );
    });

    // Roll up summary aggregates
    const quoteTotalCost = auditedItems.reduce((acc, item) => acc + (item.frozen_unit_cost_php * item.quantity), 0);
    const liveTotalCost = auditedItems.reduce((acc, item) => acc + (item.live_unit_cost_php * item.quantity), 0);
    const netCostVariance = liveTotalCost - quoteTotalCost;
    const netVariancePercent = quoteTotalCost > 0 ? (netCostVariance / quoteTotalCost) * 100 : 0;

    // Selling margin tracking
    const quoteTotalSellingPrice = Number(selectedQuote?.total_selling_price || 0);
    const originalMarginPercent = quoteTotalSellingPrice > 0 
        ? ((quoteTotalSellingPrice - quoteTotalCost) / quoteTotalSellingPrice) * 100 
        : 0;
    const currentMarginPercent = quoteTotalSellingPrice > 0 
        ? ((quoteTotalSellingPrice - liveTotalCost) / quoteTotalSellingPrice) * 100 
        : 0;
    const marginDilution = originalMarginPercent - currentMarginPercent;

    return (
        <div className="space-y-6 max-w-6xl mx-auto p-1 sm:p-2 relative h-full flex flex-col">
            {/* Header section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/10 p-5 border rounded-xl shrink-0">
                <div className="space-y-1">
                    <h2 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                        <ClipboardCheck className="h-4.5 w-4.5 text-primary" />
                        Cost Snapshots & Auditing
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                        Audit dynamic recipe price variations by comparing frozen historical costs locked during quotation issuance against current raw landed costs.
                    </p>
                </div>
                <button
                    onClick={loadQuotes}
                    disabled={loadingQuotes}
                    className="inline-flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-muted bg-background transition-all disabled:opacity-50 cursor-pointer"
                >
                    <RefreshCw className={`h-3 w-3 ${loadingQuotes ? "animate-spin" : ""}`} />
                    Refresh Logs
                </button>
            </div>

            {/* Main Double-Column Layout */}
            <div className="grid gap-6 md:grid-cols-3 flex-1 min-h-0">
                {/* Left Side: Quotations Registry Selector */}
                <div className="md:col-span-1 border rounded-xl bg-card shadow-sm flex flex-col max-h-[70dvh] overflow-hidden">
                    <div className="p-4 border-b space-y-3 shrink-0">
                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">1. Quotations List</span>
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
                            <input
                                placeholder="Search quote # or client..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-background border rounded-lg pl-9 pr-4 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-semibold"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y">
                        {loadingQuotes ? (
                            <div className="flex flex-col items-center justify-center py-10 space-y-2">
                                <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                                <span className="text-[10px] text-muted-foreground font-semibold">Loading Quotes...</span>
                            </div>
                        ) : filteredQuotes.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground text-xs font-medium">
                                No quotations found.
                            </div>
                        ) : (
                            filteredQuotes.map((q) => {
                                const isSelected = selectedQuote?.id === q.id;
                                return (
                                    <button
                                        key={q.id}
                                        onClick={() => setSelectedQuote(q)}
                                        className={`w-full text-left p-4 transition-all flex justify-between items-center hover:bg-muted/10 border-l-2 ${
                                            isSelected 
                                                ? "bg-primary/5 border-l-primary" 
                                                : "border-l-transparent"
                                        }`}
                                    >
                                        <div className="space-y-1 min-w-0 pr-2">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-bold text-foreground truncate">{q.quote_number}</span>
                                                {q.project_name && (
                                                    <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded font-bold uppercase tracking-wider truncate max-w-[100px]">
                                                        {q.project_name}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-muted-foreground block truncate">
                                                {q.customer_id?.customer_name || "Unknown Customer"}
                                            </span>
                                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-mono">
                                                <Calendar className="h-2.5 w-2.5 text-primary" />
                                                {new Date(q.quote_date).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isSelected ? "text-primary translate-x-1" : "text-muted-foreground/30"}`} />
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Side: Snapshot Viewer & Auditing Console */}
                <div className="md:col-span-2 border rounded-xl bg-card shadow-sm flex flex-col min-h-[50dvh] overflow-hidden">
                    {selectedQuote ? (
                        <div className="flex-1 flex flex-col min-h-0">
                            {/* Selected Quote Meta Header */}
                            <div className="p-5 border-b bg-muted/5 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div>
                                    <h3 className="text-sm font-bold text-foreground">
                                        Audit: {selectedQuote.quote_number}
                                    </h3>
                                    <span className="text-[10px] text-muted-foreground block font-semibold mt-0.5">
                                        Client: {selectedQuote.customer_id?.customer_name || "N/A"} ({selectedQuote.customer_id?.customer_code || "N/A"})
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-muted-foreground font-mono">
                                    <span className="bg-background border px-2 py-1 rounded">
                                        Forex: {selectedQuote.forex_rate_used ? `₱${Number(selectedQuote.forex_rate_used).toFixed(2)}` : "None (PHP)"}
                                    </span>
                                    <span className="bg-background border px-2 py-1 rounded">
                                        Quote Date: {new Date(selectedQuote.quote_date).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>

                            {loadingAudits ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-3">
                                    <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                                    <span className="text-xs text-muted-foreground font-bold">Auditing Cost Snapshots and Live Cost Trees...</span>
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                                    {/* Summary Cards */}
                                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                                        <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                                            <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Frozen Quote cost</span>
                                            <div className="flex items-baseline gap-0.5 text-lg font-black text-foreground">
                                                <span className="text-xs font-semibold">₱</span>
                                                {quoteTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                            <span className="text-[9px] text-muted-foreground block leading-tight">
                                                Locked recipe cost standard at quotation issuance
                                            </span>
                                        </div>

                                        <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                                            <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Current Live Cost</span>
                                            <div className="flex items-baseline gap-0.5 text-lg font-black text-foreground">
                                                <span className="text-xs font-semibold">₱</span>
                                                {liveTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                            <span className="text-[9px] text-muted-foreground block leading-tight">
                                                Dynamically calculated based on recent landed costs
                                            </span>
                                        </div>

                                        <div className={`border p-4 rounded-xl space-y-1 ${
                                            netCostVariance <= 0 
                                                ? "bg-emerald-500/5 border-emerald-500/15" 
                                                : "bg-destructive/5 border-destructive/15"
                                        }`}>
                                            <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Net Variance</span>
                                            <div className={`flex items-baseline gap-1 text-lg font-black ${
                                                netCostVariance <= 0 ? "text-emerald-600" : "text-destructive"
                                            }`}>
                                                <span className="text-xs font-semibold">₱</span>
                                                {netCostVariance > 0 ? "+" : ""}
                                                {netCostVariance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                <span className="text-xs font-bold font-mono">
                                                    ({netCostVariance > 0 ? "+" : ""}{netVariancePercent.toFixed(1)}%)
                                                </span>
                                            </div>
                                            <span className="text-[9px] text-muted-foreground block leading-tight">
                                                {netCostVariance <= 0 
                                                    ? "Recipe costs have dropped or remained stable"
                                                    : "Recipe costs spiked, diluting profit margins"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Margin Dilution Alert Panel */}
                                    <div className={`p-4 rounded-xl border flex gap-3 items-start text-xs ${
                                        marginDilution > 0
                                            ? "bg-amber-500/5 border-amber-500/15 text-amber-800 dark:text-amber-300"
                                            : "bg-emerald-500/5 border-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                                    }`}>
                                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <div className="space-y-1 leading-relaxed">
                                            <span className="font-bold block">Auditor Analysis & Margin Summary</span>
                                            <p className="text-[11px] font-medium text-muted-foreground">
                                                At quote time, this project had a simulated gross margin of <strong className="text-foreground">{originalMarginPercent.toFixed(2)}%</strong>. 
                                                Due to dynamic raw ingredient fluctuations, the current simulated margin stands at <strong className="text-foreground">{currentMarginPercent.toFixed(2)}%</strong>.
                                            </p>
                                            {marginDilution > 0 ? (
                                                <p className="text-[11px] font-bold text-destructive flex items-center gap-1">
                                                    <TrendingUp className="h-3 w-3" />
                                                    Warning: Profit margin has diluted by {marginDilution.toFixed(2)}% since issuance!
                                                </p>
                                            ) : (
                                                <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                                                    <TrendingDown className="h-3 w-3" />
                                                    Success: Margin improved by {Math.abs(marginDilution).toFixed(2)}% due to cost reductions.
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Audited Items Table Grid */}
                                    <div className="space-y-3">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">2. Item Variance Breakdown</span>
                                        <div className="border rounded-xl bg-card overflow-hidden">
                                            <table className="w-full text-left border-collapse text-xs">
                                                <thead>
                                                    <tr className="bg-muted/30 border-b text-muted-foreground font-bold uppercase tracking-wider select-none">
                                                        <th className="p-3 font-semibold">SKU / Product Name</th>
                                                        <th className="p-3 font-semibold text-center w-16">Version</th>
                                                        <th className="p-3 font-semibold text-right w-24">Frozen Cost</th>
                                                        <th className="p-3 font-semibold text-right w-24">Live Cost</th>
                                                        <th className="p-3 font-semibold text-right w-24">Variance</th>
                                                        <th className="p-3 font-semibold text-right w-24">Agreed Price</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y font-medium text-muted-foreground">
                                                    {auditedItems.map((item) => {
                                                        const isSpike = item.variance_php > 0.01;
                                                        const isStable = Math.abs(item.variance_php) <= 0.01;
                                                        
                                                        return (
                                                            <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                                                                <td className="p-3 font-bold text-foreground">
                                                                    {item.node_name}
                                                                </td>
                                                                <td className="p-3 text-center font-mono font-bold text-[10px] text-foreground">
                                                                    v{item.version_id}
                                                                </td>
                                                                <td className="p-3 text-right font-mono font-bold">
                                                                    ₱{item.frozen_unit_cost_php.toFixed(2)}
                                                                </td>
                                                                <td className="p-3 text-right font-mono font-bold text-foreground">
                                                                    ₱{item.live_unit_cost_php.toFixed(2)}
                                                                </td>
                                                                <td className={`p-3 text-right font-mono font-bold ${
                                                                    isStable ? "text-muted-foreground/50" : isSpike ? "text-destructive" : "text-emerald-600"
                                                                }`}>
                                                                    {isStable ? (
                                                                        "—"
                                                                    ) : (
                                                                        <>
                                                                            {isSpike ? "+" : ""}
                                                                            {item.variance_php.toFixed(2)}
                                                                            <span className="text-[9px] block">
                                                                                ({isSpike ? "+" : ""}{item.variance_percent.toFixed(1)}%)
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </td>
                                                                <td className="p-3 text-right font-mono font-bold text-primary">
                                                                    ₱{item.frozen_total_cost_php.toFixed(2)}
                                                                </td>
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
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center p-5 space-y-3">
                            <ClipboardCheck className="h-12 w-12 text-muted-foreground/35 animate-bounce duration-1000" />
                            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">No Selected Quotation</h4>
                            <p className="text-[10px] text-muted-foreground max-w-xs leading-relaxed">
                                Select a confirmed quotation log from the left sidebar list to execute variance calculations and audit historical cost structures.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
