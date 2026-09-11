import React from "react";
import Link from "next/link";
import { Anchor, Plus, Search, X, Globe, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IncomingShipment, Supplier } from "../../types";
import { formatMoney, getStatusBadge, displayShipmentStatus } from "./ShipmentBadges";
import { ModuleStatePanel } from "../../../shared/components/ModuleStatePanel";

export interface ShipmentListSidebarProps {
    fullWidth?: boolean;
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
    listError?: string | null;
    onRetry?: () => void;
    hasListFilters: boolean;
    canonicalDrafting: boolean;
    paginatedShipments: IncomingShipment[];
    suppliers: Supplier[];
    activeShipment: IncomingShipment | null;
    setSelectedShipment: (s: IncomingShipment | null) => void;
    getShipmentHref?: (shipmentId: number) => string;
    createHref?: string;
    isSupplierForeign: (s: Supplier | null | undefined) => boolean;
    onOpenCreateModal: () => void;
}

export function ShipmentListSidebar({
    fullWidth = false,
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
    listError = null,
    onRetry,
    hasListFilters,
    canonicalDrafting,
    paginatedShipments,
    suppliers,
    activeShipment,
    setSelectedShipment,
    getShipmentHref,
    createHref,
    isSupplierForeign,
    onOpenCreateModal
}: ShipmentListSidebarProps) {
    return (
        <div className={`${fullWidth ? "w-full flex-1" : "w-full lg:w-2/5"} flex min-h-0 flex-col border rounded-xl bg-card overflow-hidden shadow-sm`}>
            <div className="p-4 border-b space-y-3 shrink-0 bg-muted/20">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5 min-w-0">
                        <Anchor className="h-4 w-4 text-primary shrink-0" />
                        <span className="truncate">Procurement Registry</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">({totalItems})</span>
                    </h3>
                    {createHref ? (
                        <Button asChild size="sm">
                            <Link href={createHref}>
                                <Plus className="h-3.5 w-3.5" /> Create PO
                            </Link>
                        </Button>
                    ) : (
                        <Button size="sm" onClick={onOpenCreateModal}>
                            <Plus className="h-3.5 w-3.5" /> {canonicalDrafting ? "Create PO" : "Log Cargo"}
                        </Button>
                    )}
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
                        <option value="Warehouse Receiving">Warehouse Receiving</option>
                        <option value="Awaiting Payment">Awaiting Payment</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="Receiving (QA)">Receiving (QA)</option>
                        <option value="Partially Received">Partially Received</option>
                        <option value="Received">Received</option>
                        <option value="Rejected">Rejected</option>
                    </select>
                </div>
            </div>

            <div className="relative flex-1 overflow-y-auto divide-y">
                {listLoading ? (
                    <ModuleStatePanel state="loading" title="Loading purchase orders..." skeletonRows={4} />
                ) : listError ? (
                    <ModuleStatePanel
                        state="error"
                        title="Unable to load purchase orders."
                        description={listError}
                        onRetry={onRetry}
                        className="min-h-48"
                    />
                ) : paginatedShipments.length === 0 ? (
                    <ModuleStatePanel
                        state="empty"
                        icon={Search}
                        title={hasListFilters
                            ? "No purchase orders match the current filters."
                            : canonicalDrafting ? "No purchase orders found yet." : "No shipments logged yet."}
                        description={hasListFilters
                            ? undefined
                            : canonicalDrafting ? "Click Create PO to add one." : "Click Log Cargo to add one."}
                        action={hasListFilters ? (
                            <Button
                                variant="link"
                                className="h-auto p-0"
                                onClick={() => {
                                    setSearch("");
                                    setStatusFilter("All");
                                    setCurrentPage(1);
                                }}
                            >
                                Clear filters
                            </Button>
                        ) : undefined}
                        className="min-h-48"
                    />
                ) : (
                    paginatedShipments.map(s => {
                        const supId = typeof s.supplier_id === "object" && s.supplier_id !== null
                            ? (s.supplier_id as { id: number }).id
                            : Number(s.supplier_id);
                        const matchedSupplier = suppliers.find(sup => sup.id === supId)
                            || (typeof s.supplier_id === "object" ? s.supplier_id : null);
                        const supName = matchedSupplier ? (matchedSupplier as Supplier).supplier_name || `Supplier #${supId}` : `Supplier ID: ${s.supplier_id}`;
                        const rowClassName = `w-full text-left p-4 hover:bg-muted/40 transition-all flex flex-col gap-2 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] focus:bg-primary/5 active:translate-y-0 ${
                            activeShipment?.shipment_id === s.shipment_id ? "bg-primary/5 border-l-2 border-primary" : ""
                        }`;
                        const rowContent = (
                            <>
                                <div className="flex items-start justify-between gap-2">
                                    <span className="min-w-0 truncate font-bold text-xs text-foreground">{canonicalDrafting ? `PO: ${s.purchase_order_no || s.reference_number}` : `BL/PO: ${s.reference_number}`}</span>
                                    {getStatusBadge(displayShipmentStatus(s, canonicalDrafting))}
                                </div>
                                <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground font-semibold">
                                    <div className="flex min-w-0 items-center gap-1.5 truncate">
                                        {matchedSupplier && (
                                            isSupplierForeign(matchedSupplier) ? (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-info/10 text-info border border-info/20 uppercase shrink-0" title="Foreign Supplier">
                                                    <Globe className="h-2.5 w-2.5" /> Foreign
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-success/10 text-success border border-success/20 uppercase shrink-0" title="Local Supplier">
                                                    <MapPin className="h-2.5 w-2.5" /> Local
                                                </span>
                                            )
                                        )}
                                        <span className="truncate">{supName}</span>
                                    </div>
                                    <span className="shrink-0 font-mono">{formatMoney(s.total_php_value)}</span>
                                </div>
                                <div className="flex justify-between gap-3 text-[10px] text-muted-foreground">
                                    <span>{s.created_at ? `Created: ${new Date(s.created_at).toLocaleDateString()}` : "Purchase order"}</span>
                                    <span>
                                        {s.status === "Received"
                                            ? `Received: ${s.date_received ? new Date(s.date_received).toLocaleDateString() : "N/A"}`
                                            : `ETA: ${s.lead_time_receiving ? new Date(s.lead_time_receiving).toLocaleDateString() : "Pending"}`}
                                    </span>
                                </div>
                            </>
                        );
                        return getShipmentHref ? (
                            <Link
                                key={s.shipment_id}
                                href={getShipmentHref(s.shipment_id)}
                                aria-label={`Open ${s.purchase_order_no || s.reference_number}`}
                                className={rowClassName}
                            >
                                {rowContent}
                            </Link>
                        ) : (
                            <button
                                key={s.shipment_id}
                                type="button"
                                onClick={() => setSelectedShipment(s)}
                                aria-current={activeShipment?.shipment_id === s.shipment_id ? "true" : undefined}
                                className={rowClassName}
                            >
                                {rowContent}
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
                            className="min-h-9 rounded border bg-background px-2 py-1 outline-none font-semibold text-foreground focus:ring-1 focus:ring-primary text-[11px]"
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                        </select>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            >
                                Prev
                            </Button>
                            <span className="text-[11px] text-muted-foreground font-semibold">
                                Page {currentPage} / {totalPages}
                            </span>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
