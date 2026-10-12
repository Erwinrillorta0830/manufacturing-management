"use client";

import React from "react";
import { X } from "lucide-react";
import { ShipmentDetailView } from "./ShipmentDetailView";
import type { IncomingShipment, ShipmentLineItem, Supplier, PurchaseOrderPaymentMode } from "./types";

interface PurchaseOrderDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeShipment: IncomingShipment | null;
    loading: boolean;
    detailLoading: boolean;
    canonicalDrafting: boolean;
    paymentTerms?: Array<{
        id: number;
        payment_name: string;
        payment_days?: number | null;
        payment_description?: string | null;
    }>;
    paymentModes?: PurchaseOrderPaymentMode[];
    suppliers: Supplier[];
    branches: Array<{ id: number; branchName: string; branchCode: string }>;
    isSupplierForeign: (s: Supplier | null | undefined) => boolean;
    handleStartEdit: () => void;
    onPrintPurchaseOrder?: () => void;
    printLoading?: boolean;
    onCancelRejectedPurchaseOrder?: (shipmentId: number, workflowRevision: number, remarks?: string) => void | Promise<boolean>;
    lines: ShipmentLineItem[];
    detailError?: string | null;
    referenceError?: string | null;
    onRetryDetail?: () => void;
}

export default function PurchaseOrderDetailModal({
    isOpen,
    onClose,
    activeShipment,
    loading,
    detailLoading,
    canonicalDrafting,
    paymentTerms,
    paymentModes,
    suppliers,
    branches,
    isSupplierForeign,
    handleStartEdit,
    onPrintPurchaseOrder,
    printLoading,
    onCancelRejectedPurchaseOrder,
    lines,
    detailError,
    referenceError,
    onRetryDetail
}: PurchaseOrderDetailModalProps) {
    if (!isOpen || !activeShipment) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6 backdrop-blur-xs">
            <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-4">
                    <div className="min-w-0">
                        <h2 className="text-base font-black tracking-tight text-foreground">
                            Purchase Order Details · {String(activeShipment.purchase_order_no || activeShipment.reference_number || `PO #${activeShipment.shipment_id}`)}
                        </h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Inspect order specifications, supplier commercial terms, and items receiving history.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Close PO details modal"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    <ShipmentDetailView
                        loading={loading || detailLoading}
                        activeShipment={activeShipment}
                        canonicalDrafting={canonicalDrafting}
                        paymentTerms={paymentTerms}
                        paymentModes={paymentModes}
                        suppliers={suppliers}
                        branches={branches}
                        isSupplierForeign={isSupplierForeign}
                        handleStartEdit={handleStartEdit}
                        onPrintPurchaseOrder={onPrintPurchaseOrder}
                        printLoading={printLoading}
                        onCancelRejectedPurchaseOrder={onCancelRejectedPurchaseOrder}
                        lines={lines}
                        hasShipments={true}
                        detailError={detailError}
                        referenceError={referenceError}
                        onRetryDetail={onRetryDetail}
                    />
                </div>
            </div>
        </div>
    );
}
