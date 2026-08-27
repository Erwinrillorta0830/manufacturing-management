"use client";

import React, { useEffect, useState } from "react";
import {
    CheckCircle2,
    DollarSign,
    Eye,
    FileText,
    Layers,
    Loader2,
    Printer,
    Search,
    ShieldCheck,
    TrendingUp,
    X
} from "lucide-react";
import { toast } from "sonner";
import { fetchPurchaseAmountDetails } from "../../services/purchase-amount-api";
import LandedCostAuditSummary from "../LandedCostAuditSummary";
import {
    downloadPurchaseOrderPrintable,
    fetchPurchaseOrderArchiveStatus,
    type PurchaseOrderArchiveStatus
} from "../../../purchase-order/services/purchase-order-print-api";
import type { POLineItem, PurchaseAmountLandingRow, PurchaseOrderOption, ChartOfAccount } from "./types";

interface AuditExpense {
    id?: number | string;
    overhead_id?: number | string | null;
    expense_type?: string | null;
    amount?: number | string | null;
    amount_php?: number | string | null;
    chart_of_account_id?: number | string | null;
}

interface AuditPurchaseOrder extends PurchaseOrderOption {
    total_amount?: number | string;
    total_php_value?: number | string;
    total_foreign_currency?: number | string;
}

interface PODetails {
    purchaseOrder?: AuditPurchaseOrder;
    importExpenses?: AuditExpense[];
    chartOfAccounts?: ChartOfAccount[];
    lineItems?: POLineItem[];
    landedCost?: {
        computation?: {
            allocation_rule?: string | null;
            exchange_rate?: number | string | null;
        } | null;
        expenses?: AuditExpense[];
    };
}

interface PostedPOLedgerTableProps {
    orders: PurchaseAmountLandingRow[];
    loading?: boolean;
    errorMessage?: string | null;
    onEdit: (order: PurchaseAmountLandingRow) => void;
    onViewLedger: (order: PurchaseAmountLandingRow) => void;
}

function formatPhp(value: number): string {
    return `PHP ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PostedPOLedgerTable({
    orders,
    loading = false,
    errorMessage,
    onEdit,
    onViewLedger
}: PostedPOLedgerTableProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const query = searchQuery.trim().toLowerCase();
    const postedOrders = orders.filter(order => order.isPosted);
    const filteredOrders = orders.filter(order => [
        order.purchaseOrderNo,
        order.supplierName,
        order.purchaseType,
        order.currencyCode,
        order.status
    ].some(value => value.toLowerCase().includes(query)));
    const totalPostedValue = postedOrders.reduce((sum, order) => sum + order.totalAmountPhp, 0);
    const totalForeignValue = postedOrders.reduce((sum, order) => sum + order.totalForeignCurrency, 0);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="flex items-center gap-3 rounded-xl border bg-card/60 p-4 backdrop-blur-xs">
                    <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
                    <div><div className="text-[11px] font-bold uppercase text-muted-foreground">Posted Purchase Orders</div><div className="text-lg font-black">{postedOrders.length}</div></div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border bg-card/60 p-4 backdrop-blur-xs">
                    <div className="rounded-lg bg-primary/10 p-2.5 text-primary"><TrendingUp className="h-5 w-5" /></div>
                    <div><div className="text-[11px] font-bold uppercase text-muted-foreground">Total Posted Value (PHP)</div><div className="font-mono text-lg font-black">{formatPhp(totalPostedValue)}</div></div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border bg-card/60 p-4 backdrop-blur-xs">
                    <div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-600"><DollarSign className="h-5 w-5" /></div>
                    <div><div className="text-[11px] font-bold uppercase text-muted-foreground">Total Foreign USD Volume</div><div className="font-mono text-lg font-black">${totalForeignValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                    aria-label="Search purchase amount ledger"
                    type="search"
                    placeholder="Search PO no., supplier, type, or status..."
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    className="w-full rounded-lg border bg-background py-2 pl-9 pr-4 text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                />
            </div>

            <div className="overflow-hidden rounded-xl border bg-background">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-xs" aria-label="Purchase amount landing ledger">
                        <thead className="border-b bg-muted/50 text-[11px] font-bold uppercase text-muted-foreground">
                            <tr><th className="p-3">PO No.</th><th className="p-3">Supplier</th><th className="p-3">Type</th><th className="p-3 text-right">Total Amount</th><th className="p-3 text-center">Status</th><th className="p-3 text-right">Action</th></tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr><td colSpan={6} className="p-10 text-center text-muted-foreground"><span className="inline-flex items-center gap-2 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> Loading purchase amount ledger...</span></td></tr>
                            ) : errorMessage ? (
                                <tr><td colSpan={6} className="p-10 text-center font-semibold text-red-600">{errorMessage}</td></tr>
                            ) : filteredOrders.length === 0 ? (
                                <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No purchase orders found.</td></tr>
                            ) : filteredOrders.map(order => (
                                <tr key={`${order.purchaseOrderId}-${order.status}`} className="transition-colors hover:bg-muted/30">
                                    <td className="p-3 font-bold text-foreground"><span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-primary" />{order.purchaseOrderNo}</span></td>
                                    <td className="p-3 font-medium">{order.supplierName}</td>
                                    <td className="p-3"><span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${order.purchaseType === "FOREIGN IMPORT" ? "border-amber-500/20 bg-amber-500/10 text-amber-600" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"}`}>{order.purchaseType}</span></td>
                                    <td className="p-3 text-right font-mono font-bold text-emerald-600">{formatPhp(order.totalAmountPhp)}</td>
                                    <td className="p-3 text-center"><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${order.isPosted ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600" : "border-amber-500/20 bg-amber-500/10 text-amber-600"}`}>{order.isPosted && <ShieldCheck className="mr-1 h-3 w-3" />}{order.status}</span></td>
                                    <td className="p-3 text-right">
                                        {order.canEdit ? (
                                            <button type="button" onClick={() => onEdit(order)} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20"><FileText className="h-3.5 w-3.5" />Input / Edit Details</button>
                                        ) : order.canViewLedger ? (
                                            <button type="button" onClick={() => onViewLedger(order)} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20"><Eye className="h-3.5 w-3.5" />View Ledger</button>
                                        ) : <span className="text-muted-foreground">—</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

interface PurchaseAmountAuditDrawerProps {
    order: PurchaseAmountLandingRow;
    onClose: () => void;
}

export function PurchaseAmountAuditDrawer({ order, onClose }: PurchaseAmountAuditDrawerProps) {
    const [loadingDetails, setLoadingDetails] = useState(true);
    const [poDetails, setPoDetails] = useState<PODetails | null>(null);
    const [archiveStatus, setArchiveStatus] = useState<PurchaseOrderArchiveStatus | null>(null);
    const [printLoading, setPrintLoading] = useState(false);

    useEffect(() => {
        let active = true;
        setLoadingDetails(true);
        setPoDetails(null);
        setArchiveStatus(null);
        Promise.all([
            fetchPurchaseAmountDetails(order.purchaseOrderId, { includePosted: true }),
            fetchPurchaseOrderArchiveStatus(order.purchaseOrderId).catch(() => null)
        ])
            .then(([details, archive]) => {
                if (!active) return;
                setPoDetails(details as PODetails);
                setArchiveStatus(archive);
            })
            .catch(() => {
                if (active) setPoDetails(null);
            })
            .finally(() => {
                if (active) setLoadingDetails(false);
            });
        return () => { active = false; };
    }, [order.purchaseOrderId]);

    const handlePrintLandedCost = async () => {
        try {
            setPrintLoading(true);
            await downloadPurchaseOrderPrintable({ purchaseOrderId: order.purchaseOrderId, documentType: "LANDED_COST" });
            toast.success("Landed-cost printable downloaded.");
        } catch (error) {
            toast.error((error as Error).message || "Unable to generate the landed-cost printable.");
        } finally {
            setPrintLoading(false);
        }
    };

    const purchaseOrder = poDetails?.purchaseOrder;
    const currencyCode = String(purchaseOrder?.currency_code || order.currencyCode).toUpperCase();
    const exchangeRate = Number(poDetails?.landedCost?.computation?.exchange_rate ?? purchaseOrder?.exchange_rate);
    const totalForeign = Number(purchaseOrder?.total_foreign_currency ?? order.totalForeignCurrency) || 0;
    const totalPhp = Number(purchaseOrder?.total_amount ?? purchaseOrder?.total_php_value ?? order.totalAmountPhp) || 0;
    const expenses = (poDetails?.landedCost?.expenses?.length ? poDetails.landedCost.expenses : poDetails?.importExpenses) || [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-label="Posted purchase amount audit">
            <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between gap-3 border-b bg-muted/30 p-4">
                    <div><h3 className="flex items-center gap-2 text-sm font-extrabold"><ShieldCheck className="h-4 w-4 text-emerald-600" />Posted Audit Ledger: {order.purchaseOrderNo}</h3><p className="text-[11px] text-muted-foreground">Read-only posting logs, GL mappings, landed-cost adjustments, and valuation variance.</p></div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => void handlePrintLandedCost()} disabled={printLoading} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-[10px] font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50">{printLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}{printLoading ? "Preparing..." : "Print landed cost"}</button>
                        <button type="button" onClick={onClose} aria-label="Close posted audit ledger" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"><X className="h-4 w-4" /></button>
                    </div>
                </div>

                <div className="space-y-6 overflow-y-auto p-6">
                    {loadingDetails ? (
                        <div className="flex items-center justify-center gap-2 p-12 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading posted ledger records...</div>
                    ) : poDetails ? (
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-3 text-xs md:grid-cols-4">
                                <div><div className="text-[10px] font-bold text-muted-foreground">Exchange Rate</div><div className="font-mono font-bold">{Number.isFinite(exchangeRate) && exchangeRate > 0 ? `PHP ${exchangeRate.toFixed(4)} / ${currencyCode}` : "Unavailable — reconciliation required"}</div></div>
                                <div><div className="text-[10px] font-bold text-muted-foreground">Total Foreign Currency</div><div className="font-mono font-bold">{currencyCode} {totalForeign.toFixed(2)}</div></div>
                                <div><div className="text-[10px] font-bold text-muted-foreground">Total PHP Amount</div><div className="font-mono font-bold text-emerald-600">{formatPhp(totalPhp)}</div></div>
                                <div><div className="text-[10px] font-bold text-muted-foreground">Posting Status</div><div className="font-bold text-emerald-600">Posted &amp; Capitalized</div></div>
                            </div>

                            <div className="rounded-xl border bg-muted/20 p-3 text-xs"><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Printable archive</div><div className={`mt-1 font-bold ${archiveStatus?.complete ? "text-emerald-600" : "text-amber-600"}`}>{archiveStatus?.status === "ARCHIVED" ? "Archived and ready for audit" : archiveStatus?.status === "PARTIALLY_ARCHIVED" ? "Partially archived" : "Archive pending"}</div></div><div className="text-right text-[10px] text-muted-foreground">{archiveStatus ? `${archiveStatus.archivedDocumentTypes.length}/${archiveStatus.requiredDocumentTypes.length} core documents` : "Status unavailable"}</div></div>{archiveStatus && archiveStatus.missingDocumentTypes.length > 0 && <div className="mt-2 text-[10px] text-muted-foreground">Missing: {archiveStatus.missingDocumentTypes.join(", ")}</div>}</div>

                            {expenses.length > 0 && <div className="space-y-2"><h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Layers className="h-3.5 w-3.5 text-primary" />Capitalized Expenses and GL Mapping</h4><div className="overflow-hidden rounded-xl border bg-background text-xs"><table className="w-full text-left"><thead className="border-b bg-muted/50 text-[10px] font-bold uppercase text-muted-foreground"><tr><th className="p-2.5">Expense Type</th><th className="p-2.5">Chart of Account</th><th className="p-2.5 text-right">Fee Amount (PHP)</th></tr></thead><tbody className="divide-y">{expenses.map((expense, index) => { const coa = poDetails.chartOfAccounts?.find(account => String(account.coa_id ?? account.id) === String(expense.chart_of_account_id)); const coaTitle = coa ? `[${coa.gl_code || "GL"}] ${coa.account_title || coa.account_name || "Unnamed account"}` : expense.chart_of_account_id ? `Account ID #${expense.chart_of_account_id}` : "Mapped by expense type"; return <tr key={`${expense.id ?? expense.overhead_id ?? "expense"}-${index}`}><td className="p-2.5 font-semibold">{expense.expense_type || "Unclassified legacy expense"}</td><td className="p-2.5 text-muted-foreground">{coaTitle}</td><td className="p-2.5 text-right font-mono font-bold text-emerald-600">PHP {Number(expense.amount_php ?? expense.amount ?? 0).toFixed(2)}</td></tr>; })}</tbody></table></div></div>}

                            <div className="space-y-2"><h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"><FileText className="h-3.5 w-3.5 text-primary" />Line Items Landed Cost Allocations</h4><div className="overflow-hidden rounded-xl border bg-background text-xs"><table className="w-full text-left"><thead className="border-b bg-muted/50 text-[10px] font-bold uppercase text-muted-foreground"><tr><th className="p-2.5">Product</th><th className="p-2.5 text-right">Accepted Qty</th><th className="p-2.5 text-right">Invoice Unit Price ({currencyCode})</th><th className="p-2.5 text-right">Allocated Fee / Unit (PHP)</th><th className="p-2.5 text-right">Final Landed Unit Cost (PHP)</th></tr></thead><tbody className="divide-y">{poDetails.lineItems?.map((line, index) => { const productName = typeof line.product_id === "object" ? line.product_id.product_name : `Product #${line.product_id}`; const isForeign = currencyCode !== "PHP"; const quantity = Number(line.accepted_quantity ?? line.received_quantity) || 0; const unitPrice = Number(isForeign ? line.unit_price_foreign : line.base_unit_cost_php); return <tr key={`${line.purchase_order_product_id}-${index}`}><td className="p-2.5 font-semibold">{productName}</td><td className="p-2.5 text-right font-mono font-bold">{quantity.toLocaleString()}</td><td className="p-2.5 text-right font-mono text-muted-foreground">{Number.isFinite(unitPrice) ? `${isForeign ? currencyCode : "PHP"} ${unitPrice.toFixed(4)}` : "Unavailable"}</td><td className="p-2.5 text-right font-mono font-bold text-emerald-600">+PHP {(Number(line.allocated_expense_php) || 0).toFixed(2)}</td><td className="p-2.5 text-right font-mono font-bold text-amber-600">PHP {(Number(line.final_landed_unit_cost) || 0).toFixed(2)}</td></tr>; })}</tbody></table></div></div>

                            <LandedCostAuditSummary purchaseOrderId={order.purchaseOrderId} compact />
                        </div>
                    ) : <div className="p-8 text-center text-xs font-bold text-red-500">Failed to load audit ledger details for this purchase order.</div>}
                </div>
            </div>
        </div>
    );
}
