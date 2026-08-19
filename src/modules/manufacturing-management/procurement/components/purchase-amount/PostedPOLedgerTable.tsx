"use client";

import React, { useState } from "react";
import {
    FileText,
    Search,
    DollarSign,
    Eye,
    CheckCircle2,
    Layers,
    X,
    TrendingUp,
    ShieldCheck,
    Printer,
    Loader2
} from "lucide-react";
import { toast } from "sonner";
import { fetchPurchaseAmountDetails } from "../../services/purchase-amount-api";
import { ChartOfAccount, POLineItem, LandedExpenseRow, PurchaseOrderHeader } from "./types";
import type { IncomingShipment } from "@/modules/manufacturing-management/procurement/types";
import LandedCostAuditSummary from "../LandedCostAuditSummary";
import {
    downloadPurchaseOrderPrintable,
    fetchPurchaseOrderArchiveStatus,
    type PurchaseOrderArchiveStatus
} from "../../../purchase-order/services/purchase-order-print-api";

export type PostedOrder = IncomingShipment & Partial<PurchaseOrderHeader> & {
    id?: number;
    supplier_name?: string | { supplier_name?: string } | null;
    total_amount?: number | string;
    total_foreign_currency?: number | string;
    currency_code?: string;
    is_import?: number;
};

export interface PODetails {
    purchaseOrder?: PostedOrder;
    importExpenses?: LandedExpenseRow[];
    chartOfAccounts?: ChartOfAccount[];
    lineItems?: POLineItem[];
}

interface PostedPOLedgerTableProps {
    postedOrders: PostedOrder[];
}

export default function PostedPOLedgerTable({ postedOrders }: PostedPOLedgerTableProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDetailPo, setSelectedDetailPo] = useState<PostedOrder | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [poDetails, setPoDetails] = useState<PODetails | null>(null);
    const [archiveStatus, setArchiveStatus] = useState<PurchaseOrderArchiveStatus | null>(null);
    const [printLoading, setPrintLoading] = useState(false);

    const filteredOrders = postedOrders.filter(po => {
        const poNo = String(po.purchase_order_no || po.reference_number || po.purchase_order_id || "").toLowerCase();
        const suppName = typeof po.supplier_name === "object" ? (po.supplier_name?.supplier_name || "") : String(po.supplier_name || "");
        const query = searchQuery.toLowerCase();
        return poNo.includes(query) || suppName.toLowerCase().includes(query);
    });

    const totalPostedValue = postedOrders.reduce((sum, po) => sum + (Number(po.total_amount) || 0), 0);
    const totalForeignValue = postedOrders.filter(po => po.currency_code === "USD" || po.is_import === 1).reduce((sum, po) => sum + (Number(po.total_foreign_currency) || 0), 0);

    const handleViewDetails = async (po: PostedOrder) => {
        setSelectedDetailPo(po);
        setLoadingDetails(true);
        setArchiveStatus(null);
        try {
            const poId = Number(po.purchase_order_id || po.shipment_id || po.id || 0);
            if (!poId) return;
            const [data, archive] = await Promise.all([
                fetchPurchaseAmountDetails(poId),
                fetchPurchaseOrderArchiveStatus(poId).catch(() => null)
            ]);
            setPoDetails(data);
            setArchiveStatus(archive);
        } catch {
            setPoDetails(null);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handlePrintLandedCost = async () => {
        if (!selectedDetailPo) return;
        const purchaseOrderId = Number(selectedDetailPo.purchase_order_id || selectedDetailPo.shipment_id || selectedDetailPo.id);
        if (!purchaseOrderId) return;
        try {
            setPrintLoading(true);
            await downloadPurchaseOrderPrintable({ purchaseOrderId, documentType: "LANDED_COST" });
            toast.success("Landed-cost printable downloaded.");
        } catch (error) {
            toast.error((error as Error).message || "Unable to generate the landed-cost printable.");
        } finally {
            setPrintLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border bg-card/60 backdrop-blur-xs flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                        <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-[11px] font-bold text-muted-foreground uppercase">Posted Purchase Orders</div>
                        <div className="text-lg font-black">{postedOrders.length}</div>
                    </div>
                </div>

                <div className="p-4 rounded-xl border bg-card/60 backdrop-blur-xs flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                        <TrendingUp className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-[11px] font-bold text-muted-foreground uppercase">Total Posted Value (PHP)</div>
                        <div className="text-lg font-black font-mono">
                            ₱{totalPostedValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                </div>

                <div className="p-4 rounded-xl border bg-card/60 backdrop-blur-xs flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-600">
                        <DollarSign className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-[11px] font-bold text-muted-foreground uppercase">Total Foreign USD Volume</div>
                        <div className="text-lg font-black font-mono">
                            ${totalForeignValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Search Bar */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search posted orders by PO # or supplier name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-background border rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    />
                </div>
            </div>

            {/* Ledger Table */}
            <div className="border rounded-xl overflow-hidden bg-background">
                <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 border-b text-[11px] font-bold text-muted-foreground uppercase">
                        <tr>
                            <th className="p-3">PO Number</th>
                            <th className="p-3">Supplier</th>
                            <th className="p-3">Type</th>
                            <th className="p-3 text-right">Forex Rate</th>
                            <th className="p-3 text-right">Posted Amount (PHP)</th>
                            <th className="p-3 text-center">Status</th>
                            <th className="p-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredOrders.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-8 text-center text-muted-foreground text-xs">
                                    No posted purchase orders found matching your search.
                                </td>
                            </tr>
                        ) : (
                            filteredOrders.map((po, index) => {
                                const isForeign = po.currency_code === "USD" || po.is_import === 1;
                                const poNo = po.purchase_order_no || po.reference_number || `PO #${po.purchase_order_id}`;
                                const suppName = typeof po.supplier_name === "object" ? (po.supplier_name?.supplier_name || `Supplier #${po.supplier_name?.id}`) : (po.supplier_name ? `Supplier #${po.supplier_name}` : "N/A");
                                const totalPhp = Number(po.total_amount) || 0;
                                const rate = Number(po.exchange_rate) || 58.50;
                                const rowKey = po.purchase_order_id || po.shipment_id || po.id || po.reference_number || `${poNo}-${index}`;

                                return (
                                    <tr key={rowKey} className="hover:bg-muted/30 transition-colors">
                                        <td className="p-3 font-bold text-foreground flex items-center gap-1.5">
                                            <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                                            {poNo}
                                        </td>
                                        <td className="p-3 font-medium">{suppName}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                isForeign 
                                                    ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" 
                                                    : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                            }`}>
                                                {isForeign ? "FOREIGN IMPORT" : "LOCAL PURCHASE"}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right font-mono text-muted-foreground">
                                            {isForeign ? `₱${rate.toFixed(2)}` : "1.00"}
                                        </td>
                                        <td className="p-3 text-right font-mono font-bold text-emerald-600">
                                            ₱{totalPhp.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                <ShieldCheck className="h-3 w-3 mr-1" /> Posted & Locked
                                            </span>
                                        </td>
                                        <td className="p-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => handleViewDetails(po)}
                                                className="px-2.5 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                                View Ledger
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Audit Details Modal */}
            {selectedDetailPo && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-background border rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        {/* Modal Header */}
                        <div className="p-4 border-b flex items-center justify-between bg-muted/30">
                            <div>
                                <h3 className="font-extrabold text-sm flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                    Posted Audit Ledger: {selectedDetailPo.purchase_order_no || selectedDetailPo.reference_number}
                                </h3>
                                <p className="text-[11px] text-muted-foreground">
                                    Historical breakdown of posted purchase amounts, GL code entries, and final landed unit costs.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => void handlePrintLandedCost()}
                                    disabled={printLoading}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-[10px] font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {printLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                                    Print landed cost
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedDetailPo(null); setPoDetails(null); }}
                                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto space-y-6">
                            {loadingDetails ? (
                                <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">
                                    Loading posted ledger records...
                                </div>
                            ) : poDetails ? (
                                <div className="space-y-5">
                                    {/* General Specs */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted/20 border rounded-xl text-xs">
                                        <div>
                                            <div className="text-muted-foreground text-[10px] font-bold">Exchange Rate</div>
                                            <div className="font-mono font-bold">₱{(Number(poDetails.purchaseOrder?.exchange_rate) || 58.50).toFixed(2)} / USD</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-[10px] font-bold">Total Foreign Currency</div>
                                            <div className="font-mono font-bold">${(Number(poDetails.purchaseOrder?.total_foreign_currency) || 0).toFixed(2)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-[10px] font-bold">Total PHP Amount</div>
                                            <div className="font-mono font-bold text-emerald-600">₱{(Number(poDetails.purchaseOrder?.total_amount) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-[10px] font-bold">Posting Status</div>
                                            <div className="font-bold text-emerald-600">Posted & Capitalized</div>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border bg-muted/20 p-3 text-xs">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Printable archive</div>
                                                <div className={`mt-1 font-bold ${archiveStatus?.complete ? "text-emerald-600" : "text-amber-600"}`}>
                                                    {archiveStatus?.status === "ARCHIVED"
                                                        ? "Archived and ready for audit"
                                                        : archiveStatus?.status === "PARTIALLY_ARCHIVED"
                                                            ? "Partially archived"
                                                            : "Archive pending"}
                                                </div>
                                            </div>
                                            <div className="text-right text-[10px] text-muted-foreground">
                                                {archiveStatus
                                                    ? `${archiveStatus.archivedDocumentTypes.length}/${archiveStatus.requiredDocumentTypes.length} core documents`
                                                    : "Status unavailable"}
                                            </div>
                                        </div>
                                        {archiveStatus && archiveStatus.missingDocumentTypes.length > 0 && (
                                            <div className="mt-2 text-[10px] text-muted-foreground">
                                                Missing: {archiveStatus.missingDocumentTypes.join(", ")}
                                            </div>
                                        )}
                                    </div>

                                    {/* Import Expenses Table if any */}
                                    {poDetails.importExpenses && poDetails.importExpenses.length > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                                <Layers className="h-3.5 w-3.5 text-primary" />
                                                Capitalized Import Expenses (Chart of Accounts)
                                            </h4>
                                            <div className="border rounded-xl overflow-hidden bg-background text-xs">
                                                <table className="w-full text-left">
                                                    <thead className="bg-muted/50 border-b text-[10px] font-bold text-muted-foreground uppercase">
                                                        <tr>
                                                            <th className="p-2.5">Chart of Account ID</th>
                                                            <th className="p-2.5 text-right">Fee Amount (PHP)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y">
                                                        {poDetails.importExpenses.map((exp: LandedExpenseRow, idx: number) => {
                                                            const coaObj = poDetails.chartOfAccounts?.find((c: ChartOfAccount) => (c.coa_id ?? c.id) === exp.chart_of_account_id);
                                                            const title = coaObj ? `[${coaObj.gl_code || "GL"}] ${coaObj.account_title || coaObj.account_name}` : `Account ID #${exp.chart_of_account_id}`;
                                                            return (
                                                                <tr key={idx}>
                                                                    <td className="p-2.5 font-semibold">{title}</td>
                                                                    <td className="p-2.5 text-right font-mono font-bold text-emerald-600">
                                                                        ₱{Number(exp.amount).toFixed(2)}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Line Items Breakdown */}
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <FileText className="h-3.5 w-3.5 text-primary" />
                                            Line Items Landed Cost Allocations
                                        </h4>
                                        <div className="border rounded-xl overflow-hidden bg-background text-xs">
                                            <table className="w-full text-left">
                                                <thead className="bg-muted/50 border-b text-[10px] font-bold text-muted-foreground uppercase">
                                                    <tr>
                                                        <th className="p-2.5">Product</th>
                                                        <th className="p-2.5 text-right">Received Qty</th>
                                                        <th className="p-2.5 text-right">Unit Price</th>
                                                        <th className="p-2.5 text-right">Allocated Fee / Unit</th>
                                                        <th className="p-2.5 text-right">Final Landed Unit Cost</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {poDetails.lineItems?.map((line: POLineItem) => {
                                                        const pName = typeof line.product_id === "object" ? line.product_id.product_name : `Product #${line.product_id}`;
                                                        const qty = Number(line.received_quantity) || 1;
                                                        const unitPrice = Number(line.unit_price) || 0;
                                                        const allocFee = Number(line.allocated_expense_php) || 0;
                                                        const finalCost = Number(line.final_landed_unit_cost) || 0;

                                                        return (
                                                            <tr key={line.purchase_order_product_id}>
                                                                <td className="p-2.5 font-semibold">{pName}</td>
                                                                <td className="p-2.5 text-right font-mono font-bold">{qty.toLocaleString()}</td>
                                                                <td className="p-2.5 text-right font-mono text-muted-foreground">${unitPrice.toFixed(2)}</td>
                                                                <td className="p-2.5 text-right font-mono text-emerald-600 font-bold">+₱{allocFee.toFixed(2)}</td>
                                                                <td className="p-2.5 text-right font-mono font-bold text-amber-600">₱{finalCost.toFixed(2)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <LandedCostAuditSummary
                                        purchaseOrderId={Number(selectedDetailPo.purchase_order_id || selectedDetailPo.shipment_id || selectedDetailPo.id || 0)}
                                        compact
                                    />
                                </div>
                            ) : (
                                <div className="p-8 text-center text-xs text-red-500 font-bold">
                                    Failed to load audit ledger details for this purchase order.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
