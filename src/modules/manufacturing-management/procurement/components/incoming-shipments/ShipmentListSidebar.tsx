import React from "react";
import { Anchor, Plus, Search, X, Globe, MapPin } from "lucide-react";
import { IncomingShipment, Supplier } from "../../types";
import { formatMoney, getStatusBadge, displayShipmentStatus } from "./ShipmentBadges";

export interface ShipmentListSidebarProps {
    totalItems: number;
    search: string;
    setSearch: (s: string) => void;
    statusFilter: string;
    setStatusFilter: (sf: string) => void;
    itemsPerPage: number;
    setItemsPerPage: (n: number) => void;
    currentPage: number;
    setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
    totalPages: number;
    listLoading: boolean;
    hasListFilters: boolean;
    canonicalDrafting: boolean;
    paginatedShipments: IncomingShipment[];
    suppliers: Supplier[];
    activeShipment: IncomingShipment | null;
    setSelectedShipment: (s: IncomingShipment | null) => void;
    isSupplierForeign: (s: Supplier | null | undefined) => boolean;
    onOpenCreateModal: () => void;
}

export function ShipmentListSidebar({
    totalItems,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    itemsPerPage,
    setItemsPerPage,
    currentPage,
    setCurrentPage,
    totalPages,
    listLoading,
    hasListFilters,
    canonicalDrafting,
    paginatedShipments,
    suppliers,
    activeShipment,
    setSelectedShipment,
    isSupplierForeign,
    onOpenCreateModal
}: ShipmentListSidebarProps) {
    return (
        <div className="w-full lg:w-2/5 flex flex-col border rounded-xl bg-card overflow-hidden shadow-sm">
            <div className="p-4 border-b space-y-3 shrink-0 bg-muted/20">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5 min-w-0">
                        <Anchor className="h-4 w-4 text-primary shrink-0" />
                        <span className="truncate">Procurement Registry</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">({totalItems})</span>
                    </h3>
                    <button
                        onClick={onOpenCreateModal}
                        className="inline-flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-2.5 py-1.5 rounded-lg text-xs transition-all shadow-sm shrink-0 cursor-pointer"
                    >
                        <Plus className="h-3.5 w-3.5" /> {canonicalDrafting ? "Create PO" : "Log Cargo"}
                    </button>
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search BL/Reference, Supplier..."
                            value={search}
                            onChange={e => {
                                setSearch(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full pl-9 pr-8 py-2 border rounded-lg text-xs bg-background outline-none focus:ring-1 focus:ring-primary font-medium h-9"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 transition-colors hover:bg-muted rounded"
                                title="Clear Search"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => {
                            setStatusFilter(e.target.value);
                            setCurrentPage(1);
                        }}
                        className="rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-semibold text-foreground h-9 w-32"
                    >
                        <option value="All">All Statuses</option>
                        <option value={canonicalDrafting ? "For Approval" : "Ordered"}>{canonicalDrafting ? "For Approval" : "Ordered"}</option>
                        <option value="Approved">Approved</option>
                        <option value="Awaiting Payment">Awaiting Payment</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="Receiving (QA)">Receiving (QA)</option>
                        <option value="Receiving (QA)">Receiving (QA)</option>
                        <option value="Partially Received">Partially Received</option>
                        <option value="Received">Received</option>
                        <option value="Rejected">Rejected</option>
                    </select>
                </div>
            </div>

            <div className="relative flex-1 overflow-y-auto divide-y">
                {listLoading ? (
                    <div className="space-y-3 p-4" aria-label="Loading purchase orders" role="status">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="animate-pulse space-y-2 rounded-lg border p-3">
                                <div className="h-3 w-3/5 rounded bg-muted" />
                                <div className="h-3 w-4/5 rounded bg-muted" />
                                <div className="h-2 w-2/5 rounded bg-muted" />
                            </div>
                        ))}
                    </div>
                ) : paginatedShipments.length === 0 ? (
                    <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center text-xs text-muted-foreground">
                        <Search className="h-8 w-8 text-muted-foreground/30" />
                        <p className="font-semibold">
                            {hasListFilters
                                ? "No purchase orders match the current filters."
                                : canonicalDrafting ? "No purchase orders found yet." : "No shipments logged yet."}
                        </p>
                        {hasListFilters ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearch("");
                                    setStatusFilter("All");
                                    setCurrentPage(1);
                                }}
                                className="text-primary font-semibold hover:underline"
                            >
                                Clear filters
                            </button>
                        ) : (
                            <p className="text-[11px]">{canonicalDrafting ? "Click Create PO to add one." : "Click Log Cargo to add one."}</p>
                        )}
                    </div>
                ) : (
                    paginatedShipments.map(s => {
                        const supId = typeof s.supplier_id === "object" && s.supplier_id !== null
                            ? (s.supplier_id as { id: number }).id
                            : Number(s.supplier_id);
                        const matchedSupplier = suppliers.find(sup => sup.id === supId)
                            || (typeof s.supplier_id === "object" ? s.supplier_id : null);
                        const supName = matchedSupplier ? (matchedSupplier as Supplier).supplier_name || `Supplier #${supId}` : `Supplier ID: ${s.supplier_id}`;
                        return (
                            <button
                                key={s.shipment_id}
                                onClick={() => setSelectedShipment(s)}
                                aria-current={activeShipment?.shipment_id === s.shipment_id ? "true" : undefined}
                                className={`w-full text-left p-4 hover:bg-muted/40 transition-all flex flex-col gap-2 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] focus:bg-primary/5 active:translate-y-0 ${
                                    activeShipment?.shipment_id === s.shipment_id ? "bg-primary/5 border-l-2 border-primary" : ""
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span className="font-bold text-xs text-foreground truncate">{canonicalDrafting ? `PO: ${s.purchase_order_no || s.reference_number}` : `BL/PO: ${s.reference_number}`}</span>
                                    {getStatusBadge(displayShipmentStatus(s, canonicalDrafting))}
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
                                    <div className="flex items-center gap-1.5 truncate">
                                        {matchedSupplier && (
                                            isSupplierForeign(matchedSupplier) ? (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-500/10 text-blue-600 border border-blue-500/20 uppercase shrink-0" title="Foreign Supplier">
                                                    <Globe className="h-2.5 w-2.5" /> Foreign
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase shrink-0" title="Local Supplier">
                                                    <MapPin className="h-2.5 w-2.5" /> Local
                                                </span>
                                            )
                                        )}
                                        <span className="truncate">{supName}</span>
                                    </div>
                                    <span className="font-mono shrink-0">{formatMoney(s.total_php_value)}</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground flex justify-between">
                                    <span>{s.created_at ? `Created: ${new Date(s.created_at).toLocaleDateString()}` : "Purchase order"}</span>
                                    <span>
                                        {s.status === "Received" 
                                            ? `Received: ${s.date_received ? new Date(s.date_received).toLocaleDateString() : "N/A"}` 
                                            : `ETA: ${s.lead_time_receiving ? new Date(s.lead_time_receiving).toLocaleDateString() : "Pending"}`}
                                    </span>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>

            {/* Pagination Controls */}
            {totalItems > 0 && (
                <div className="p-3 border-t bg-muted/10 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                        <span>Show</span>
                        <select
                            value={itemsPerPage}
                            onChange={e => {
                                setItemsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="rounded border bg-background px-1.5 py-0.5 outline-none font-semibold text-foreground focus:ring-1 focus:ring-primary text-[11px]"
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                        </select>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                className="px-2 py-1 border rounded text-xs font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                Prev
                            </button>
                            <span className="text-[11px] text-muted-foreground font-semibold">
                                Page {currentPage} / {totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                className="px-2 py-1 border rounded text-xs font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
