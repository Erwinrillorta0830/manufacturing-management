"use client";

import React from "react";
import { ShoppingCart } from "lucide-react";
import { CreatableSelect } from "@/modules/manufacturing-management/finished-goods/components/CreatableSelect";

import { PurchaseOrderHeader } from "./types";
import type { IncomingShipment } from "@/modules/manufacturing-management/procurement/types";
import {
    LANDED_COST_INVENTORY_STATUS
} from "@/modules/manufacturing-management/procurement/landed-cost-eligibility";

export type EligibleOrder = IncomingShipment & Partial<PurchaseOrderHeader> & {
    supplier_name?: string | { supplier_name?: string } | null;
    total_amount?: number | string;
    is_import?: number;
};

interface POSelectionCardProps {
    eligibleOrders: EligibleOrder[];
    selectedShipment: EligibleOrder | null;
    onSelectPO: (po: EligibleOrder) => void;
}

export default function POSelectionCard({
    eligibleOrders,
    selectedShipment,
    onSelectPO
}: POSelectionCardProps) {
    return (
        <div className="p-4 bg-muted/20 border rounded-xl space-y-2">
            <div className="flex items-center justify-between">
                <label htmlFor="po-select" className="text-xs font-extrabold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    Select Purchase Order (Received / Awaiting Payment)
                </label>
                <span className="text-[11px] text-muted-foreground font-bold bg-muted px-2 py-0.5 rounded">
                    {eligibleOrders.length} order{eligibleOrders.length === 1 ? "" : "s"} eligible
                </span>
            </div>
            <CreatableSelect
                id="po-select"
                options={eligibleOrders.map((po, idx) => {
                    const idVal = String(po.purchase_order_id || po.shipment_id || `po-${idx}`);
                    const poNo = po.purchase_order_no || po.reference_number || `PO #${idVal}`;
                    const suppName = typeof po.supplier_name === "object" ? po.supplier_name?.supplier_name : (po.supplier_name || "Supplier");
                    const curr = String(po.currency_code || (po.is_import === 1 ? "USD" : "PHP")).toUpperCase();
                    const amount = curr === "PHP" ? po.total_amount ?? po.total_php_value : po.total_foreign_currency;
                    const amt = Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
                    const forceClosed = Boolean(po.isForceReceived || po.forceReceivedAt);
                    const statusLabel = Number(po.inventory_status) === LANDED_COST_INVENTORY_STATUS ? "Received" : "Not eligible";
                    return {
                        value: idVal,
                        label: `${poNo} — ${suppName} | Status: ${statusLabel}${forceClosed ? " | Force Received" : ""} | Payment: Awaiting Payment | Currency: ${curr} | Total: ${curr === "USD" ? "$" : "₱"}${amt}`
                    };
                })}
                value={selectedShipment ? String(selectedShipment.purchase_order_id || selectedShipment.shipment_id) : ""}
                onValueChange={(val) => {
                    const match = eligibleOrders.find(o => String(o.purchase_order_id || o.shipment_id) === val);
                    if (match) onSelectPO(match);
                }}
                placeholder="Search Received Purchase Order..."
                className="h-10 text-xs w-full bg-background font-bold"
            />
            {selectedShipment && (() => {
                const supplier = typeof selectedShipment.supplier_name === "object"
                    ? selectedShipment.supplier_name?.supplier_name
                    : selectedShipment.supplier_name;
                const currency = String(selectedShipment.currency_code || (selectedShipment.is_import === 1 ? "USD" : "PHP")).toUpperCase();
                const amount = currency === "PHP"
                    ? selectedShipment.total_amount ?? selectedShipment.total_php_value
                    : selectedShipment.total_foreign_currency;
                return (
                    <div className="grid grid-cols-2 gap-2 rounded-lg border bg-background p-3 text-[11px] sm:grid-cols-3 lg:grid-cols-6">
                        <div><div className="text-muted-foreground">PO Number</div><div className="font-bold">{selectedShipment.purchase_order_no || selectedShipment.reference_number || "—"}</div></div>
                        <div><div className="text-muted-foreground">Supplier</div><div className="truncate font-bold" title={String(supplier || "Unknown supplier")}>{supplier || "Unknown supplier"}</div></div>
                        <div><div className="text-muted-foreground">Status</div><div className="font-bold">{selectedShipment.status || "Received"}</div></div>
                        <div><div className="text-muted-foreground">Payment</div><div className="font-bold">{Number(selectedShipment.payment_status) === 2 ? "Awaiting Payment" : String(selectedShipment.payment_status || "Unavailable")}</div></div>
                        <div><div className="text-muted-foreground">Currency</div><div className="font-bold">{currency}</div></div>
                        <div><div className="text-muted-foreground">Total Value</div><div className="font-bold">{currency === "USD" ? "$" : "₱"}{Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                    </div>
                );
            })()}
        </div>
    );
}
