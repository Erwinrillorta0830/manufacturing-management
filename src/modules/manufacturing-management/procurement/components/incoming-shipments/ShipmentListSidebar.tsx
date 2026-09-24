import React, { useMemo } from "react";
import Link from "next/link";
import { Anchor, Globe, MapPin, Plus, RotateCcw, Search, X } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { IncomingShipment, Supplier } from "../../types";
import {
    displayShipmentStatus,
    formatMoney,
    getInventoryStatusBadge,
    getPaymentStatusBadge,
    getStatusBadge,
    PAYMENT_STATUS_FILTER_OPTIONS
} from "./ShipmentBadges";
import { useInventoryStatusOptions } from "../../hooks/useInventoryStatusOptions";

export interface ShipmentListSidebarProps {
    fullWidth?: boolean;
    totalItems: number;
    search: string;
    setSearch: (s: string) => void;
    statusFilter: string;
    setStatusFilter: (sf: string) => void;
    supplierFilter: string;
    setSupplierFilter: (value: string) => void;
    inventoryStatusFilter: string;
    setInventoryStatusFilter: (value: string) => void;
    paymentStatusFilter: string;
    setPaymentStatusFilter: (value: string) => void;
    startDate: string;
    setStartDate: (value: string) => void;
    endDate: string;
    setEndDate: (value: string) => void;
    dateRangeError?: string | null;
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

function supplierDetails(shipment: IncomingShipment, suppliers: Supplier[]) {
    const relation = shipment.supplier_id && typeof shipment.supplier_id === "object"
        ? shipment.supplier_id as Supplier
        : null;
    const supplierId = relation ? Number(relation.id) : Number(shipment.supplier_id);
    const supplier = suppliers.find(item => item.id === supplierId) || relation;
    const name = supplier?.supplier_name
        || (Number.isSafeInteger(supplierId) && supplierId > 0 ? `Supplier #${supplierId}` : "Unknown supplier");
    return { supplier, name };
}

function formatRequestedDate(value?: string | null) {
    if (!value) return "—";
    const raw = String(value).trim();
    const phtWallClock = /^(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.exec(raw);
    const date = phtWallClock ? new Date(`${phtWallClock[1]}T00:00:00+08:00`) : new Date(raw);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        timeZone: "Asia/Manila"
    });
}

function transactionCurrency(shipment: IncomingShipment): "PHP" | "USD" {
    return String(shipment.currency_code || "PHP").toUpperCase() === "USD" ? "USD" : "PHP";
}

function transactionAmount(shipment: IncomingShipment) {
    const currency = transactionCurrency(shipment);
    const amount = currency === "USD" ? shipment.total_foreign_currency : shipment.total_php_value;
    return formatMoney(amount, currency);
}

export function ShipmentListSidebar({
    fullWidth = false,
    totalItems,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    supplierFilter,
    setSupplierFilter,
    inventoryStatusFilter,
    setInventoryStatusFilter,
    paymentStatusFilter,
    setPaymentStatusFilter,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dateRangeError = null,
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
    const inventoryStatusOptions = useInventoryStatusOptions();
    const supplierOptions = useMemo(() => [
        { value: "", label: "All Suppliers" },
        ...[...suppliers]
            .sort((left, right) => left.supplier_name.localeCompare(right.supplier_name))
            .map(supplier => ({ value: String(supplier.id), label: supplier.supplier_name }))
    ], [suppliers]);

    const clearFilters = () => {
        setSearch("");
        setSupplierFilter("");
        setInventoryStatusFilter("");
        setPaymentStatusFilter("");
        setStartDate("");
        setEndDate("");
        setCurrentPage(1);
    };

    const renderOrderLink = (shipment: IncomingShipment, className: string, children: React.ReactNode, key?: React.Key) => {
        if (getShipmentHref) {
            return (
                <Link
                    key={key}
                    href={getShipmentHref(shipment.shipment_id)}
                    aria-label={`Open ${shipment.purchase_order_no || shipment.reference_number}`}
                    className={className}
                >
                    {children}
                </Link>
            );
        }
        return (
            <button
                key={key}
                type="button"
                onClick={() => setSelectedShipment(shipment)}
                aria-current={activeShipment?.shipment_id === shipment.shipment_id ? "true" : undefined}
                className={className}
            >
                {children}
            </button>
        );
    };

    const renderQueueTable = () => {
        if (dateRangeError) {
            return (
                <div className="flex min-h-48 items-center justify-center p-8 text-center text-xs text-muted-foreground" role="alert">
                    Correct the date range to load purchase orders.
                </div>
            );
        }

        if (listLoading) {
            return (
                <div className="space-y-3 p-4" aria-label="Loading purchase orders" role="status">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="grid animate-pulse grid-cols-4 gap-4 rounded-lg border p-4 md:grid-cols-8">
                            {Array.from({ length: 8 }).map((__, cellIndex) => (
                                <div key={cellIndex} className="h-4 rounded bg-muted" />
                            ))}
                        </div>
                    ))}
                </div>
            );
        }

        if (listError) {
            return (
                <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center text-xs text-muted-foreground" role="alert">
                    <p className="font-semibold text-destructive">Unable to load purchase orders.</p>
                    <p className="max-w-md">{listError}</p>
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="min-h-9 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground hover:bg-primary/90"
                        >
                            Retry
                        </button>
                    )}
                </div>
            );
        }

        if (paginatedShipments.length === 0) {
            return (
                <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center text-xs text-muted-foreground">
                    <Search className="h-8 w-8 text-muted-foreground/30" />
                    <p className="font-semibold">
                        {hasListFilters ? "No purchase orders match the current filters." : "No purchase orders found yet."}
                    </p>
                    {hasListFilters ? (
                        <button type="button" onClick={clearFilters} className="text-primary font-semibold hover:underline">
                            Clear filters
                        </button>
                    ) : (
                        <p className="text-[11px]">Click Create PO to add one.</p>
                    )}
                </div>
            );
        }

        return (
            <div className="hidden min-h-0 flex-1 overflow-y-auto overflow-x-hidden md:block">
                <table className="w-full table-fixed border-collapse text-left text-xs" aria-label="Purchase orders">
                    <colgroup>
                        <col className="w-[16%]" />
                        <col className="w-[17%]" />
                        <col className="w-[12%]" />
                        <col className="w-[8%]" />
                        <col className="w-[13%]" />
                        <col className="w-[14%]" />
                        <col className="w-[10%]" />
                        <col className="w-[10%]" />
                    </colgroup>
                    <thead className="sticky top-0 z-10 border-b bg-muted/95 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                        <tr>
                            <th scope="col" className="p-3">PO Number</th>
                            <th scope="col" className="p-3">Supplier Name</th>
                            <th scope="col" className="p-3">Date Requested</th>
                            <th scope="col" className="p-3">Currency</th>
                            <th scope="col" className="p-3 text-right">Total Amount</th>
                            <th scope="col" className="p-3">Remarks</th>
                            <th scope="col" className="p-3">Inventory Status</th>
                            <th scope="col" className="p-3">Payment Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {paginatedShipments.map(shipment => {
                            const { name: supplierName } = supplierDetails(shipment, suppliers);
                            const orderLabel = shipment.purchase_order_no || shipment.reference_number || `PO ${shipment.shipment_id}`;
                            const currency = transactionCurrency(shipment);
                            return (
                                <tr key={shipment.shipment_id} className="align-top transition-colors hover:bg-muted/40">
                                    <td className="p-3 font-semibold">
                                        {renderOrderLink(shipment, "block min-w-0 break-words text-primary hover:underline", orderLabel)}
                                    </td>
                                    <td className="p-3">
                                        <span className="block min-w-0 break-words font-semibold text-foreground" title={supplierName}>{supplierName}</span>
                                    </td>
                                    <td className="whitespace-nowrap p-3 text-muted-foreground">{formatRequestedDate(shipment.created_at)}</td>
                                    <td className="p-3 font-semibold text-muted-foreground">{currency}</td>
                                    <td className="p-3 text-right font-mono font-bold text-foreground">{transactionAmount(shipment)}</td>
                                    <td className="p-3">
                                        <span className="block max-w-full truncate text-muted-foreground" title={shipment.remark?.trim() || "No remarks"}>
                                            {shipment.remark?.trim() || "—"}
                                        </span>
                                    </td>
                                    <td className="p-3">{getInventoryStatusBadge(shipment.inventory_status)}</td>
                                    <td className="p-3">{getPaymentStatusBadge(shipment.payment_status)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderQueueMobileRows = () => {
        if (dateRangeError || listLoading || listError || paginatedShipments.length === 0) return null;
        return (
            <div className="divide-y md:hidden">
                {paginatedShipments.map(shipment => {
                    const { name: supplierName } = supplierDetails(shipment, suppliers);
                    const orderLabel = shipment.purchase_order_no || shipment.reference_number || `PO ${shipment.shipment_id}`;
                    const currency = transactionCurrency(shipment);
                    return renderOrderLink(
                        shipment,
                        "block w-full p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                        <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <span className="min-w-0 break-words text-xs font-bold text-primary">{orderLabel}</span>
                                <span className="shrink-0 text-right font-mono text-xs font-bold">{transactionAmount(shipment)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                                <div className="min-w-0">
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Supplier Name</div>
                                    <div className="break-words font-semibold">{supplierName}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Date Requested</div>
                                    <div className="font-semibold">{formatRequestedDate(shipment.created_at)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Currency</div>
                                    <div className="font-semibold">{currency}</div>
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Remarks</div>
                                    <div className="truncate" title={shipment.remark?.trim() || "No remarks"}>{shipment.remark?.trim() || "—"}</div>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {getInventoryStatusBadge(shipment.inventory_status)}
                                {getPaymentStatusBadge(shipment.payment_status)}
                            </div>
                        </div>,
                        shipment.shipment_id
                    );
                })}
            </div>
        );
    };

    return (
        <div className={`${fullWidth ? "w-full flex-1" : "w-full lg:w-2/5"} flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm`}>
            <div className={`${fullWidth ? "space-y-4" : "space-y-3"} shrink-0 border-b bg-muted/20 p-4`}>
                <div className="flex items-center justify-between gap-3">
                    <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-foreground">
                        <Anchor className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">Procurement Registry</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">({totalItems})</span>
                    </h3>
                    {createHref ? (
                        <Link
                            href={createHref}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
                        >
                            <Plus className="h-3.5 w-3.5" /> Create PO
                        </Link>
                    ) : (
                        <button
                            onClick={onOpenCreateModal}
                            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
                        >
                            <Plus className="h-3.5 w-3.5" /> {canonicalDrafting ? "Create PO" : "Log Cargo"}
                        </button>
                    )}
                </div>

                {fullWidth ? (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                            <label className="space-y-1 sm:col-span-2 xl:col-span-2">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Search purchase orders</span>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Search PO, reference, or supplier..."
                                        aria-label="Search purchase orders"
                                        value={search}
                                        onChange={event => {
                                            setSearch(event.target.value);
                                            setCurrentPage(1);
                                        }}
                                        className="h-9 w-full rounded-lg border bg-background pl-9 pr-8 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                                    />
                                    {search && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearch("");
                                                setCurrentPage(1);
                                            }}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                            title="Clear Search"
                                            aria-label="Clear search"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            </label>
                            <label className="space-y-1 xl:col-span-2">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Supplier</span>
                                <SearchableSelect
                                    options={supplierOptions}
                                    value={supplierFilter}
                                    onValueChange={value => {
                                        setSupplierFilter(value);
                                        setCurrentPage(1);
                                    }}
                                    placeholder="All Suppliers"
                                    className="h-9 bg-background text-left text-xs font-semibold"
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Inventory Status</span>
                                <select
                                    value={inventoryStatusFilter}
                                    onChange={event => {
                                        setInventoryStatusFilter(event.target.value);
                                        setCurrentPage(1);
                                    }}
                                    aria-label="Filter by inventory status"
                                    className="h-9 w-full rounded-lg border bg-background px-2.5 text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                                >
                                    {inventoryStatusOptions.map(option => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                            <label className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Payment Status</span>
                                <select
                                    value={paymentStatusFilter}
                                    onChange={event => {
                                        setPaymentStatusFilter(event.target.value);
                                        setCurrentPage(1);
                                    }}
                                    aria-label="Filter by payment status"
                                    className="h-9 w-full rounded-lg border bg-background px-2.5 text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                                >
                                    {PAYMENT_STATUS_FILTER_OPTIONS.map(option => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                            <label className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">From</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={event => {
                                        setStartDate(event.target.value);
                                        setCurrentPage(1);
                                    }}
                                    aria-label="Requested date from"
                                    className="h-9 w-full rounded-lg border bg-background px-2.5 text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary dark:[color-scheme:dark]"
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">To</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={event => {
                                        setEndDate(event.target.value);
                                        setCurrentPage(1);
                                    }}
                                    aria-label="Requested date to"
                                    className="h-9 w-full rounded-lg border bg-background px-2.5 text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary dark:[color-scheme:dark]"
                                />
                            </label>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            {dateRangeError ? <p className="text-xs font-semibold text-destructive" role="alert">{dateRangeError}</p> : <span />}
                            <button
                                type="button"
                                onClick={clearFilters}
                                disabled={!hasListFilters}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <RotateCcw className="h-3.5 w-3.5" /> Clear filters
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search BL/Reference, Supplier..."
                                value={search}
                                onChange={event => {
                                    setSearch(event.target.value);
                                    setCurrentPage(1);
                                }}
                                className="h-9 w-full rounded-lg border bg-background pl-9 pr-8 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    title="Clear Search"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                        <select
                            value={statusFilter}
                            onChange={event => {
                                setStatusFilter(event.target.value);
                                setCurrentPage(1);
                            }}
                            className="h-9 w-32 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value="All">All Statuses</option>
                            <option value={canonicalDrafting ? "For Approval" : "Ordered"}>{canonicalDrafting ? "For Approval" : "Ordered"}</option>
                            <option value="Approved">Approved</option>
                            <option value="Warehouse Receiving">Warehouse Receiving</option>
                            <option value="Awaiting Payment">Awaiting Payment</option>
                            <option value="Cancelled">Cancelled</option>
                            <option value="QA Receiving">QA Receiving</option>
                            <option value="Partially Received">Partially Received</option>
                            <option value="Received">Received</option>
                            <option value="Rejected">Rejected</option>
                        </select>
                    </div>
                )}
            </div>

            {fullWidth ? (
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                    {renderQueueTable()}
                    {renderQueueMobileRows()}
                </div>
            ) : (
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
                    ) : listError ? (
                        <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center text-xs text-muted-foreground" role="alert">
                            <p className="font-semibold text-destructive">Unable to load purchase orders.</p>
                            <p className="max-w-md">{listError}</p>
                            {onRetry && (
                                <button
                                    type="button"
                                    onClick={onRetry}
                                    className="min-h-9 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground hover:bg-primary/90"
                                >
                                    Retry
                                </button>
                            )}
                        </div>
                    ) : paginatedShipments.length === 0 ? (
                        <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center text-xs text-muted-foreground">
                            <Search className="h-8 w-8 text-muted-foreground/30" />
                            <p className="font-semibold">
                                {hasListFilters ? "No purchase orders match the current filters." : canonicalDrafting ? "No purchase orders found yet." : "No shipments logged yet."}
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
                        paginatedShipments.map(shipment => {
                            const { supplier: matchedSupplier, name: supplierName } = supplierDetails(shipment, suppliers);
                            const rowClassName = `w-full text-left p-4 hover:bg-muted/40 transition-all flex flex-col gap-2 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] focus:bg-primary/5 active:translate-y-0 ${
                                activeShipment?.shipment_id === shipment.shipment_id ? "bg-primary/5 border-l-2 border-primary" : ""
                            }`;
                            const rowContent = (
                                <>
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="min-w-0 truncate text-xs font-bold text-foreground">{canonicalDrafting ? `PO: ${shipment.purchase_order_no || shipment.reference_number}` : `BL/PO: ${shipment.reference_number}`}</span>
                                        {getStatusBadge(displayShipmentStatus(shipment, canonicalDrafting))}
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-muted-foreground">
                                        <div className="flex min-w-0 items-center gap-1.5 truncate">
                                            {matchedSupplier && (
                                                isSupplierForeign(matchedSupplier) ? (
                                                    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.2 text-[9px] font-extrabold uppercase text-blue-600" title="Foreign Supplier">
                                                        <Globe className="h-2.5 w-2.5" /> Foreign
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-extrabold uppercase text-emerald-600" title="Local Supplier">
                                                        <MapPin className="h-2.5 w-2.5" /> Local
                                                    </span>
                                                )
                                            )}
                                            <span className="truncate">{supplierName}</span>
                                        </div>
                                        <span className="shrink-0 font-mono">{formatMoney(shipment.total_php_value)}</span>
                                    </div>
                                    <div className="flex justify-between gap-3 text-[10px] text-muted-foreground">
                                        <span>{shipment.created_at ? `Created: ${formatRequestedDate(shipment.created_at)}` : "Purchase order"}</span>
                                        <span>
                                            {shipment.status === "Received"
                                                ? `Received: ${shipment.date_received ? formatRequestedDate(shipment.date_received) : "N/A"}`
                                                : `ETA: ${shipment.lead_time_receiving ? formatRequestedDate(shipment.lead_time_receiving) : "Pending"}`}
                                        </span>
                                    </div>
                                </>
                            );
                            return getShipmentHref ? (
                                <Link
                                    key={shipment.shipment_id}
                                    href={getShipmentHref(shipment.shipment_id)}
                                    aria-label={`Open ${shipment.purchase_order_no || shipment.reference_number}`}
                                    className={rowClassName}
                                >
                                    {rowContent}
                                </Link>
                            ) : (
                                <button
                                    key={shipment.shipment_id}
                                    type="button"
                                    onClick={() => setSelectedShipment(shipment)}
                                    aria-current={activeShipment?.shipment_id === shipment.shipment_id ? "true" : undefined}
                                    className={rowClassName}
                                >
                                    {rowContent}
                                </button>
                            );
                        })
                    )}
                </div>
            )}

            {totalItems > 0 && !dateRangeError && (
                <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-muted/10 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <span>Show</span>
                        <select
                            value={itemsPerPage}
                            onChange={event => {
                                setItemsPerPage(Number(event.target.value));
                                setCurrentPage(1);
                            }}
                            className="min-h-9 rounded border bg-background px-2 py-1 text-[11px] font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
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
                                onClick={() => setCurrentPage(previous => Math.max(previous - 1, 1))}
                                className="min-h-9 min-w-16 rounded border px-2 py-1 text-xs font-semibold transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Prev
                            </button>
                            <span className="text-[11px] font-semibold text-muted-foreground">Page {currentPage} / {totalPages}</span>
                            <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(previous => Math.min(previous + 1, totalPages))}
                                className="min-h-9 min-w-16 rounded border px-2 py-1 text-xs font-semibold transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
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
