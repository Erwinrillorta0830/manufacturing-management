import React from "react";
import { Loader2, Globe, Building2, Calendar, Layers, Info, Anchor, Edit, Trash2 } from "lucide-react";
import { IncomingShipment, ShipmentLineItem, Supplier } from "../../types";
import { formatMoney, getStatusBadge, displayShipmentStatus } from "./ShipmentBadges";
import { INVENTORY_STATUS } from "@/app/api/manufacturing/procurement/_domain";
import { UNIT_PRICE_DECIMAL_SCALE } from "@/modules/manufacturing-management/decimal";

export interface ShipmentDetailViewProps {
    loading: boolean;
    activeShipment: IncomingShipment | null;
    canonicalDrafting: boolean;
    suppliers: Supplier[];
    isSupplierForeign: (s: Supplier | null | undefined) => boolean;
    statusLoading: "en-route" | "arrived" | null;
    setStatusLoading: (s: "en-route" | "arrived" | null) => void;
    onUpdateShipmentStatus: (shipmentId: number, status: "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "En Route" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected") => void;
    handleStartEdit: () => void;
    onCancelRejectedPurchaseOrder?: (shipmentId: number, workflowRevision: number, remarks?: string) => void | Promise<boolean>;
    lines: ShipmentLineItem[];
    hasShipments: boolean;
}

export function ShipmentDetailView({
    loading,
    activeShipment,
    canonicalDrafting,
    suppliers,
    isSupplierForeign,
    statusLoading,
    setStatusLoading,
    onUpdateShipmentStatus,
    handleStartEdit,
    onCancelRejectedPurchaseOrder,
    lines,
    hasShipments
}: ShipmentDetailViewProps) {
    return (
        <div className="flex-1 border rounded-xl bg-card overflow-y-auto p-6 shadow-sm flex flex-col gap-6 relative min-h-[300px]">
            {loading && (
                <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] z-50 flex items-center justify-center rounded-xl">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            )}
            {activeShipment ? (
                <>
                    {/* Header Details */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b pb-5">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-extrabold text-foreground leading-tight">{canonicalDrafting ? `Purchase Order: ${activeShipment.purchase_order_no || activeShipment.reference_number}` : `Cargo Invoice / BL: ${activeShipment.reference_number}`}</h2>
                                {getStatusBadge(displayShipmentStatus(activeShipment))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Supplier Source:{" "}
                                <strong className="text-foreground font-semibold inline-flex items-center gap-1.5">
                                    {(() => {
                                        const supId = typeof activeShipment.supplier_id === "object" && activeShipment.supplier_id !== null
                                            ? (activeShipment.supplier_id as { id: number }).id
                                            : Number(activeShipment.supplier_id);
                                        const matchedSupplier = suppliers.find(sup => sup.id === supId)
                                            || (typeof activeShipment.supplier_id === "object" ? activeShipment.supplier_id : null);
                                        if (!matchedSupplier) return `ID: ${activeShipment.supplier_id}`;
                                        const foreign = isSupplierForeign(matchedSupplier);
                                        return (
                                            <>
                                                {foreign ? (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-blue-500/10 text-blue-600 border border-blue-500/20 uppercase tracking-wider">
                                                        <Globe className="h-2.5 w-2.5" /> Foreign
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider">
                                                        <Building2 className="h-2.5 w-2.5" /> Local
                                                    </span>
                                                )}
                                                <span>{matchedSupplier.supplier_name}</span>
                                            </>
                                        );
                                    })()}
                                </strong>
                            </p>
                            {activeShipment.status === "Rejected" && activeShipment.remark && (
                                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                    <strong>Rejection reason:</strong>{" "}{activeShipment.remark.replace(/^REJECTED:\s*/i, "")}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs mt-2.5 text-muted-foreground bg-muted/40 border p-3 rounded-lg max-w-fit font-sans">
                                <span>
                                    Destination Branch:{" "}
                                    <strong className="text-foreground font-bold">
                                        {(() => {
                                            const branchId = (activeShipment as IncomingShipment & { branch_id?: number | null }).branch_id;
                                            switch (Number(branchId)) {
                                                case 183: return "Main Branch";
                                                case 163: return "Urdaneta Branch";
                                                case 181: return "Bihon Branch";
                                                case 182: return "Bihon Bad Branch";
                                                default: return branchId ? `Branch #${branchId}` : "Unassigned Branch";
                                            }
                                        })()}
                                    </strong>
                                </span>
                                <span className="hidden sm:inline text-muted-foreground/30 font-light">|</span>
                                <span>
                                    Payment Type:{" "}
                                    <strong className="text-foreground font-bold">
                                        {(() => {
                                            const payType = (activeShipment as IncomingShipment & { payment_type?: number | null }).payment_type;
                                            switch (Number(payType)) {
                                                case 1: return "Advance Payment";
                                                case 2: return "Partial Payment";
                                                case 3: return "Full Payment";
                                                case 4: return "Refund";
                                                case 5: return "Installment";
                                                default: return payType ? `Payment Type #${payType}` : "N/A";
                                            }
                                        })()}
                                    </strong>
                                </span>
                                <span className="hidden sm:inline text-muted-foreground/30 font-light">|</span>
                                <span>
                                    Price Type:{" "}
                                    <strong className="text-foreground font-bold">
                                        {(activeShipment as IncomingShipment & { price_type?: string | null }).price_type || "Standard"}
                                    </strong>
                                </span>
                            </div>
                            {/* Status Progress Stepper (Read-Only) */}
                            <div className="mt-4 border bg-muted/20 rounded-xl p-4 space-y-3">
                                <div className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">{canonicalDrafting ? "Purchase Order Workflow Progress" : "Shipment Life Cycle Progress"}</div>
                                <div className="flex items-center w-full relative">
                                    {(activeShipment.status === "Rejected"
                                        ? ["Requested", "Approved", "Rejected"]
                                        : ["Requested", "Approved", "En Route", "Receiving (QA)", "Received"]
                                    ).map((st, idx, arr) => {
                                        const statuses = arr;
                                        const currentStatus = activeShipment.status === "Requested" || activeShipment.status === "Ordered"
                                            ? "Requested"
                                            : activeShipment.status === "For Pickup" || activeShipment.status === "Partially Received"
                                            ? "Receiving (QA)"
                                            : activeShipment.status === "Awaiting Payment"
                                            ? (Number(activeShipment.inventory_status) === INVENTORY_STATUS.APPROVED ? "Approved" : "Requested")
                                            : activeShipment.status;
                                        const currentIdx = statuses.indexOf(currentStatus);
                                        const stepIdx = statuses.indexOf(st);
                                        
                                        const isCompleted = stepIdx < currentIdx;
                                        const isActive = stepIdx === currentIdx;
                                        
                                        return (
                                            <React.Fragment key={st}>
                                                <div className="flex flex-col items-center flex-1 relative z-10">
                                                    <div className={`h-6 w-6 rounded-full flex items-center justify-center border-2 text-[10px] font-bold transition-all ${
                                                        isCompleted 
                                                            ? "bg-emerald-500 border-emerald-500 text-emerald-foreground" 
                                                            : isActive 
                                                                ? "bg-primary border-primary text-primary-foreground shadow-md scale-110" 
                                                                : "bg-background border-muted text-muted-foreground"
                                                    }`}>
                                                        {isCompleted ? "✓" : idx + 1}
                                                    </div>
                                                    <span className={`text-[9px] font-bold mt-1.5 truncate max-w-[70px] ${
                                                        isActive ? "text-primary animate-pulse" : "text-muted-foreground"
                                                    }`}>{st}</span>
                                                </div>
                                                {idx < arr.length - 1 && (
                                                    <div className={`flex-1 h-[2px] -mt-4 transition-all ${
                                                        stepIdx < currentIdx ? "bg-emerald-500" : "bg-muted"
                                                    }`} />
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>

                                {/* Explicit Action Buttons for status turnover */}
                                {(activeShipment.status === "Approved" || activeShipment.status === "Awaiting Payment") && Number(activeShipment.inventory_status) === INVENTORY_STATUS.APPROVED && (
                                    <button
                                        type="button"
                                        disabled={statusLoading !== null}
                                        onClick={() => {
                                            setStatusLoading("en-route");
                                            onUpdateShipmentStatus(activeShipment.shipment_id, "En Route");
                                            setTimeout(() => setStatusLoading(null), 3000);
                                        }}
                                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-wait text-white font-bold py-2 px-3 rounded-lg text-xs transition-all shadow-sm cursor-pointer mt-3 inline-flex items-center justify-center gap-1.5"
                                    >
                                        {statusLoading === "en-route" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing...</> : "Dispatch Cargo (Mark En Route)"}
                                    </button>
                                )}

                                {(activeShipment.status === "Requested" || activeShipment.status === "Ordered") && (
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        <button
                                            type="button"
                                            onClick={handleStartEdit}
                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-sm cursor-pointer inline-flex items-center justify-center gap-1.5"
                                        >
                                            Edit Purchase Order
                                        </button>
                                        {canonicalDrafting && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (window.confirm("Cancel this Requested purchase order? This action cannot be undone.")) {
                                                        onUpdateShipmentStatus(activeShipment.shipment_id, "Cancelled");
                                                    }
                                                }}
                                                className="w-full border border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 font-bold py-2.5 px-3 rounded-lg text-xs transition-all"
                                            >
                                                Cancel PO
                                            </button>
                                        )}
                                    </div>
                                )}

                                {activeShipment.status === "Rejected" && onCancelRejectedPurchaseOrder && (
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        <button
                                            type="button"
                                            disabled={loading}
                                            onClick={handleStartEdit}
                                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-sm cursor-pointer inline-flex items-center justify-center gap-1.5"
                                        >
                                            <Edit className="h-3.5 w-3.5" /> Revise &amp; Resubmit
                                        </button>
                                        <button
                                            type="button"
                                            disabled={loading}
                                            onClick={() => {
                                                if (window.confirm("Cancel this rejected purchase order? This action cannot be undone.")) {
                                                    onCancelRejectedPurchaseOrder(
                                                        activeShipment.shipment_id,
                                                        Number(activeShipment.workflow_revision || 0),
                                                        "Purchase order cancelled after rejection."
                                                    );
                                                }
                                            }}
                                            className="w-full border border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60 font-bold py-2.5 px-3 rounded-lg text-xs transition-all inline-flex items-center justify-center gap-1.5"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" /> Cancel PO
                                        </button>
                                    </div>
                                )}

                                {activeShipment.status === "En Route" && (
                                    <button
                                        type="button"
                                        disabled={statusLoading !== null}
                                        onClick={() => {
                                            setStatusLoading("arrived");
                                            onUpdateShipmentStatus(activeShipment.shipment_id, "Receiving (QA)");
                                            setTimeout(() => setStatusLoading(null), 3000);
                                        }}
                                        className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-60 disabled:cursor-wait text-white font-bold py-2 px-3 rounded-lg text-xs transition-all shadow-sm cursor-pointer mt-3 inline-flex items-center justify-center gap-1.5"
                                    >
                                        {statusLoading === "arrived" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing...</> : "Mark Cargo as Arrived (Proceed to QA Checklist)"}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Totals Summary */}
                    <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                        <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">{canonicalDrafting ? "Net Total" : "Raw FOB Cost"}</span>
                            <span className="text-xs font-extrabold text-foreground">
                                {formatMoney(activeShipment.total_php_value)}
                            </span>
                        </div>
                        <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Foreign Currency</span>
                            <span className="text-xs font-extrabold text-foreground">
                                {formatMoney(activeShipment.total_foreign_currency, activeShipment.currency_code || "PHP")}
                            </span>
                        </div>
                        <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Exchange Rate</span>
                            <span className="text-xs font-extrabold text-foreground">{formatMoney(activeShipment.exchange_rate)}</span>
                        </div>
                        <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                                {activeShipment.status === "Received" ? "Arrival Date" : "ETA / Expected"}
                            </span>
                            <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 text-primary" />
                                {activeShipment.status === "Received"
                                    ? (activeShipment.date_received && activeShipment.date_received !== "1970-01-01" 
                                        ? new Date(activeShipment.date_received).toLocaleDateString() 
                                        : "N/A")
                                    : (activeShipment.lead_time_receiving 
                                        ? new Date(activeShipment.lead_time_receiving).toLocaleDateString() 
                                        : "Pending")}
                            </span>
                        </div>
                    </div>

                    {activeShipment.remark && activeShipment.remark.startsWith("REJECTED:") && (
                        <div className="bg-red-500/5 border border-red-500/10 p-3.5 rounded-xl text-left space-y-1">
                            <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider block">Rejection Reason / Remarks</span>
                            <span className="text-xs font-semibold text-red-700 leading-relaxed block whitespace-pre-wrap">{activeShipment.remark.replace("REJECTED:", "").trim()}</span>
                        </div>
                    )}

                    {/* Shipment Cargo Lines List */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 border-b pb-2">
                            <Layers className="h-4 w-4 text-primary" />
                            {canonicalDrafting ? "Purchase Order Lines" : "Shipment Manifest & Contents"}
                        </h3>
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="bg-muted/50 border-b">
                                        <th className="p-3 font-semibold text-muted-foreground">Product Name</th>
                                        <th className="p-3 font-semibold text-muted-foreground">UOM</th>
                                        <th className="p-3 font-semibold text-muted-foreground text-right">Qty</th>
                                        <th className="p-3 font-semibold text-muted-foreground text-right">Unit Price</th>
                                        <th className="p-3 font-semibold text-muted-foreground text-right">ImpFreight Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {lines.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                                No items registered in this container.
                                            </td>
                                        </tr>
                                    ) : (
                                        lines.map(line => {
                                            const prod = line.product_id && typeof line.product_id === "object"
                                                ? line.product_id
                                                : { product_name: `ID: ${line.product_id}`, product_code: "N/A", unit_of_measurement: { unit_shortcut: "PCS" } };
                                            return (
                                                <tr key={line.line_id} className="hover:bg-muted/20">
                                                    <td className="p-3">
                                                        <div className="font-semibold text-foreground">{prod.product_name}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono">Code: {prod.product_code}</div>
                                                    </td>
                                                    <td className="p-3 text-muted-foreground font-semibold">
                                                        {prod.unit_of_measurement?.unit_shortcut || "PCS"}
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <div className="font-semibold text-foreground">
                                                            {line.quantity_received !== null && line.quantity_received !== undefined ? (
                                                                `${Number(line.quantity_received).toLocaleString()} / ${Number(line.quantity_ordered || 0).toLocaleString()}`
                                                            ) : (
                                                                `${Number(line.quantity_ordered || 0).toLocaleString()} (Ordered)`
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-[11px]">
                                                        {formatMoney(line.base_unit_cost_php, "PHP", UNIT_PRICE_DECIMAL_SCALE)}
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-[11px] text-muted-foreground">
                                                        +{formatMoney(line.allocated_expense_php || 0)}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Informative Note */}
                    {activeShipment.status !== "Received" && (
                        <div className="flex items-start gap-2.5 bg-blue-500/5 border border-blue-500/10 p-4 rounded-xl">
                            <Info className="h-4.5 w-4.5 text-blue-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <h5 className="text-xs font-bold text-blue-800 dark:text-blue-300">Pending Landed Cost Recalculation</h5>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    This cargo is currently marked as <strong className="text-foreground">{activeShipment.status}</strong>. Custom duties, ARR, brokerages, and shipping lines must be added/allocated. Marking this shipment as <strong>Received</strong> will commit the computed landed costs to the raw inventory database to update standard BOM prices.
                                </p>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground h-full">
                    <Anchor className="h-16 w-16 mb-4 text-muted-foreground/30" />
                    {hasShipments ? "Select a shipment from the list to view details." : "No incoming shipments logged."}
                </div>
            )}
        </div>
    );
}
