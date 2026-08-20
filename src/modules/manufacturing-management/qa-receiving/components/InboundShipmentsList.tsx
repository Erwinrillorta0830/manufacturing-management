import React from "react";
import { Shipment } from "../types";

function formatShipmentCreatedAt(value: string | null | undefined): string {
    const rawValue = value?.trim();
    if (!rawValue) return "N/A";

    // Date-only values do not contain a real time and must not be rendered as midnight.
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return rawValue;

    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) return "N/A";

    return new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila"
    }).format(date);
}

interface InboundShipmentsListProps {
    loadingShipments: boolean;
    filteredShipments: Shipment[];
    selectedShipment: Shipment | null;
    showReceived: boolean;
    setShowReceived: (show: boolean) => void;
    onSelectShipment: (s: Shipment) => void;
    searchPO: string;
    setSearchPO: (val: string) => void;
    searchStatus: string;
    setSearchStatus: (val: string) => void;
    startDate: string;
    setStartDate: (val: string) => void;
    endDate: string;
    setEndDate: (val: string) => void;
}

export default function InboundShipmentsList({
    loadingShipments,
    filteredShipments,
    selectedShipment,
    showReceived,
    setShowReceived,
    onSelectShipment,
    searchPO,
    setSearchPO,
    searchStatus,
    setSearchStatus,
    startDate,
    setStartDate,
    endDate,
    setEndDate
}: InboundShipmentsListProps) {
    return (
        <div className="md:col-span-1 border rounded-xl bg-card overflow-hidden flex flex-col max-h-[75dvh]">
            {/* Header */}
            <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
                <h3 className="text-xs font-bold text-foreground">Pending Inspection Logs</h3>
                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-muted-foreground select-none font-bold">
                    <input
                        type="checkbox"
                        checked={showReceived}
                        onChange={e => setShowReceived(e.target.checked)}
                        className="rounded border-border accent-primary"
                    />
                    Show Received
                </label>
            </div>

            {/* Filter Section */}
            <div className="p-3 border-b bg-muted/5 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                    {/* PO# / Ref search */}
                    <div className="space-y-1">
                        <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider block">PO# / Ref</label>
                        <input
                            type="text"
                            placeholder="Search PO..."
                            value={searchPO}
                            onChange={e => setSearchPO(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-2 py-1 text-[11px] font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    {/* Status filter */}
                    <div className="space-y-1">
                        <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider block">Status</label>
                        <select
                            value={searchStatus}
                            onChange={e => setSearchStatus(e.target.value)}
                            className="w-full h-7 rounded-lg border border-border bg-background text-foreground text-[11px] font-semibold px-2 py-0.5 outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                        >
                            <option value="">All Statuses</option>
                            <option value="Receiving (QA)">QA (Receiving)</option>
                            <option value="Approved">Finance Approved</option>
                            <option value="Partially Received">Partially Received / Receiving (QA)</option>
                            <option value="Received">Received</option>
                        </select>
                    </div>
                </div>

                {/* Date range inputs */}
                <div className="space-y-1">
                    <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider block">Date Range</label>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-2 py-1 text-[10px] font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                        />
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-2 py-1 text-[10px] font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="p-3 overflow-y-auto space-y-2.5 flex-1">
                {loadingShipments ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">Loading shipments...</div>
                ) : filteredShipments.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground italic">No matching shipments found</div>
                ) : (
                    filteredShipments.map(s => (
                        <button
                            key={s.shipment_id}
                            type="button"
                            onClick={() => onSelectShipment(s)}
                            className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer select-none space-y-2.5 ${
                                selectedShipment?.shipment_id === s.shipment_id
                                    ? "bg-primary/5 border-primary shadow-sm"
                                    : "bg-background border-border hover:bg-muted/10"
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <span className="font-extrabold text-xs text-foreground block">
                                    {s.reference_number}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-extrabold border ${
                                    s.isForceReceived
                                        ? "bg-violet-500/10 text-violet-600 border-violet-500/20"
                                        : s.status === "Receiving (QA)" || s.status === "For Pickup" || s.status === "Approved"
                                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                        : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                }`}>
                                    {s.isForceReceived ? "Force Received" : s.status === "For Pickup" ? "QA (Receiving)" : s.status}
                                </span>
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Value: ₱{Number(s.total_php_value || 0).toLocaleString()}</span>
                                <span>Created: {formatShipmentCreatedAt(s.created_at)}</span>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
