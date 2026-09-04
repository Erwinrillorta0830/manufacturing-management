import { useMemo, useState } from "react";
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
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const pageCount = Math.max(1, Math.ceil(filteredShipments.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const visibleShipments = useMemo(
        () => filteredShipments.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [currentPage, filteredShipments]
    );

    return (
        <aside
            id="qa-receiving-pending-inspection-logs"
            aria-label="Pending Inspection Logs"
            className="w-full rounded-xl border bg-card"
        >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b bg-muted/20 p-4">
                <div className="flex min-w-0 items-center gap-1.5">
                    <h3 className="text-xs font-bold text-foreground">Pending Inspection Logs</h3>
                </div>
                <label className="flex min-h-10 shrink-0 cursor-pointer select-none items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                    <input
                        type="checkbox"
                        checked={showReceived}
                        onChange={e => {
                            setPage(1);
                            setShowReceived(e.target.checked);
                        }}
                        className="h-4 w-4 rounded border-border accent-primary"
                    />
                    Show Received
                </label>
            </div>

            {/* Filter Section */}
            <div className="space-y-2.5 border-b bg-muted/5 p-3 sm:p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {/* PO# / Ref search */}
                    <div className="space-y-1">
                        <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider block">PO# / Ref</label>
                        <input
                            type="text"
                            placeholder="Search PO..."
                            value={searchPO}
                            onChange={e => {
                                setPage(1);
                                setSearchPO(e.target.value);
                            }}
                            className="min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    {/* Status filter */}
                    <div className="space-y-1">
                        <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider block">Status</label>
                        <select
                            value={searchStatus}
                            onChange={e => {
                                setPage(1);
                                setSearchStatus(e.target.value);
                            }}
                            className="min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary cursor-pointer"
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
                <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                    <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider block">Date Range</label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => {
                                setPage(1);
                                setStartDate(e.target.value);
                            }}
                            className="min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-[10px] font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                        />
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => {
                                setPage(1);
                                setEndDate(e.target.value);
                            }}
                            className="min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-[10px] font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="space-y-2.5 p-3 sm:p-4">
                {loadingShipments ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">Loading shipments...</div>
                ) : filteredShipments.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground italic">No matching shipments found</div>
                ) : (
                    visibleShipments.map(s => (
                        <button
                            key={s.shipment_id}
                            type="button"
                            onClick={() => onSelectShipment(s)}
                            className="w-full space-y-2.5 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:bg-muted/10 cursor-pointer select-none"
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
            <div className="flex flex-col gap-2 border-t px-3 py-3 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <span>
                    {filteredShipments.length === 0
                        ? "No shipments to display"
                        : `Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredShipments.length)} of ${filteredShipments.length}`}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setPage(previous => Math.max(1, previous - 1))}
                        disabled={currentPage <= 1}
                        className="min-h-10 rounded-lg border px-3 font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Previous
                    </button>
                    <span className="min-w-16 text-center font-semibold">Page {currentPage} of {pageCount}</span>
                    <button
                        type="button"
                        onClick={() => setPage(previous => Math.min(pageCount, previous + 1))}
                        disabled={currentPage >= pageCount}
                        className="min-h-10 rounded-lg border px-3 font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Next
                    </button>
                </div>
            </div>
        </aside>
    );
}
