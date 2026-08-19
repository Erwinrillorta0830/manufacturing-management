"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, CircleHelp, Loader2, ShieldCheck } from "lucide-react";
import { fetchLandedCostAudit } from "../services/procurement-api";
import type { LandedCostAuditResponse } from "../types";

interface LandedCostAuditSummaryProps {
    purchaseOrderId: number;
    refreshKey?: string | number;
    title?: string;
    compact?: boolean;
}

function formatPhp(value: number): string {
    return `₱${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function auditStatusLabel(status: LandedCostAuditResponse["auditStatus"]): string {
    if (status === "VERIFIED") return "Verified";
    if (status === "NOT_APPLICABLE") return "Not applicable";
    return "Not verified";
}

export default function LandedCostAuditSummary({
    purchaseOrderId,
    refreshKey,
    title = "Inventory Valuation & Accounting Variance Audit",
    compact = false
}: LandedCostAuditSummaryProps) {
    const [audit, setAudit] = useState<LandedCostAuditResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!purchaseOrderId) return;
        const controller = new AbortController();
        let active = true;
        void Promise.resolve().then(async () => {
            if (!active) return;
            setLoading(true);
            setError(null);
            try {
                const result = await fetchLandedCostAudit(purchaseOrderId, controller.signal);
                if (active) setAudit(result);
            } catch (reason) {
                if (active && (reason as Error)?.name !== "AbortError") {
                    setAudit(null);
                    setError((reason as Error).message || "Unable to load the landed-cost audit.");
                }
            } finally {
                if (active) setLoading(false);
            }
        });
        return () => {
            active = false;
            controller.abort();
        };
    }, [purchaseOrderId, refreshKey]);

    const status = audit?.auditStatus || "NOT_VERIFIED";
    const statusClass = status === "VERIFIED"
        ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
        : status === "NOT_APPLICABLE"
            ? "bg-muted text-muted-foreground border-border"
            : "bg-red-500/10 text-red-700 border-red-500/20";

    return (
        <section
            data-testid="landed-cost-audit-summary"
            className={`rounded-xl border bg-card shadow-sm ${compact ? "p-4 space-y-3" : "p-5 space-y-4"}`}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        {title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Read-only reconciliation of the finalized landed-cost posting.
                    </p>
                </div>
                {!loading && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass}`}>
                        {status === "VERIFIED" ? <CheckCircle2 className="h-3.5 w-3.5" /> : status === "NOT_APPLICABLE" ? <CircleHelp className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                        {auditStatusLabel(status)}
                    </span>
                )}
            </div>

            {loading ? (
                <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading valuation and variance audit...
                </div>
            ) : error ? (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs font-semibold text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            ) : audit ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] font-bold uppercase text-muted-foreground">Allocation reconciliation</div>
                            <div className={`mt-1 text-sm font-black ${audit.allocation.matchesTotal ? "text-emerald-600" : "text-red-600"}`}>
                                {formatPhp(audit.allocation.totalAllocatedFee)} / {formatPhp(audit.allocation.expectedFee)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">Persisted allocation / expected fee</div>
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] font-bold uppercase text-muted-foreground">Inventory valuation</div>
                            <div className={`mt-1 text-sm font-black ${audit.valuation.matches ? "text-emerald-600" : "text-red-600"}`}>
                                {audit.valuation.rowCount} row{audit.valuation.rowCount === 1 ? "" : "s"} · {formatPhp(audit.valuation.totalDelta)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                {audit.valuation.totalQuantity.toLocaleString()} units, total valuation delta
                                {audit.valuation.masterCostDriftCount > 0 ? ` · ${audit.valuation.masterCostDriftCount} later master-cost change${audit.valuation.masterCostDriftCount === 1 ? "" : "s"}` : ""}
                            </div>
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-[10px] font-bold uppercase text-muted-foreground">Accounting variance</div>
                            <div className={`mt-1 text-sm font-black ${audit.accountingVariance.status === "NOT_VERIFIED" ? "text-red-600" : "text-emerald-600"}`}>
                                {audit.accountingVariance.status === "NOT_APPLICABLE" ? "No journal required" : formatPhp(audit.accountingVariance.variance)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                {audit.accountingVariance.status === "POSTED" ? `${audit.accountingVariance.entry?.entryNo || "Journal posted"} · balanced` : audit.accountingVariance.status === "NOT_APPLICABLE" ? "Zero material rounding variance" : "Journal reconciliation failed"}
                            </div>
                        </div>
                    </div>

                    {audit.valuation.rows.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Valuation rows</h4>
                            <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full min-w-[620px] text-left text-[11px]">
                                    <thead className="border-b bg-muted/50 text-[10px] font-bold uppercase text-muted-foreground">
                                        <tr>
                                            <th className="p-2.5">Product</th>
                                            <th className="p-2.5 text-right">Qty</th>
                                            <th className="p-2.5 text-right">Before</th>
                                            <th className="p-2.5 text-right">After</th>
                                            <th className="p-2.5 text-right">Delta</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {audit.valuation.rows.map(row => (
                                            <tr key={row.id || `${row.productId}-${row.productName}`}>
                                                <td className="p-2.5 font-semibold">{row.productName}</td>
                                                <td className="p-2.5 text-right font-mono">{row.quantity.toLocaleString()}</td>
                                                <td className="p-2.5 text-right font-mono">{formatPhp(row.unitCostBefore)}</td>
                                                <td className="p-2.5 text-right font-mono font-bold text-emerald-600">{formatPhp(row.unitCostAfter)}</td>
                                                <td className="p-2.5 text-right font-mono font-bold">{formatPhp(row.valuationDelta)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {audit.accountingVariance.status === "POSTED" && audit.accountingVariance.entry && (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px]">
                            <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-emerald-700">
                                <span>Rounding variance journal {audit.accountingVariance.entry.entryNo}</span>
                                <span>Debit {formatPhp(audit.accountingVariance.debitTotal)} · Credit {formatPhp(audit.accountingVariance.creditTotal)}</span>
                            </div>
                            <div className="mt-1 text-muted-foreground">Posted {audit.accountingVariance.entry.postingDate || "without a posting date"}; both configured accounts are present.</div>
                        </div>
                    )}

                    {audit.reasons.length > 0 && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-[11px] text-red-700">
                            {audit.reasons.map(reason => <div key={reason}>• {reason}</div>)}
                        </div>
                    )}
                </div>
            ) : null}
        </section>
    );
}
