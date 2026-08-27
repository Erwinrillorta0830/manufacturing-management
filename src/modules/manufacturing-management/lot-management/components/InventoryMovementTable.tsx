import React, { useState, useMemo } from "react";
import {
    Search,
    RefreshCw,
    Loader2,
    ArrowDownLeft,
    ArrowUpRight,
    ArrowLeftRight,
    ChevronsLeft,
    ChevronsRight,
    Warehouse,
    FilterX
} from "lucide-react";
import { InventoryMovement, Lot } from "../types";
import { SearchableLotSelect } from "./SearchableLotSelect";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableCell,
    TableHead
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface InventoryMovementTableProps {
    movements: InventoryMovement[];
    lots: Lot[];
    loading: boolean;
    searchQuery: string;
    onSearchChange: (val: string) => void;
    directionFilter: "ALL" | "IN" | "OUT";
    onDirectionFilterChange: (val: "ALL" | "IN" | "OUT") => void;
    transactionTypeFilter: string;
    onTransactionTypeFilterChange: (val: string) => void;
    lotFilter: number | "ALL";
    onLotFilterChange: (val: number | "ALL") => void;
    availableTransactionTypes: string[];
    onRefresh: () => void;
    onResetFilters?: () => void;
    stats?: {
        totalCount: number;
        totalIn: number;
        totalOut: number;
        netQuantity: number;
        totalValueIn: number;
    };
}

export default function InventoryMovementTable({
    movements,
    lots,
    loading,
    searchQuery,
    onSearchChange,
    directionFilter,
    onDirectionFilterChange,
    transactionTypeFilter,
    onTransactionTypeFilterChange,
    lotFilter,
    onLotFilterChange,
    availableTransactionTypes,
    onRefresh,
    onResetFilters,
    stats
}: InventoryMovementTableProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const totalPages = Math.ceil(movements.length / pageSize);
    const safeCurrentPage = Math.min(currentPage, Math.max(1, totalPages || 1));
    const startIndex = (safeCurrentPage - 1) * pageSize;
    const paginatedMovements = useMemo(() => {
        return movements.slice(startIndex, startIndex + pageSize);
    }, [movements, startIndex, pageSize]);

    return (
        <div className="space-y-4">
            {/* Quick Flow Metric Strip */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-card p-3 rounded-xl border border-border shadow-2xs">
                    <div className="flex items-center gap-2.5 px-2">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <ArrowLeftRight className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Total Movements</p>
                            <p className="text-base font-black text-foreground">{stats.totalCount.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 px-2 border-l border-border/40">
                        <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <ArrowDownLeft className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Total Inbound</p>
                            <p className="text-base font-black text-emerald-600 dark:text-emerald-400">+{stats.totalIn.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 px-2 border-l border-border/40">
                        <div className="h-9 w-9 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                            <ArrowUpRight className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">Total Outbound</p>
                            <p className="text-base font-black text-rose-600 dark:text-rose-400">-{stats.totalOut.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 px-2 border-l border-border/40">
                        <div className="h-9 w-9 rounded-lg bg-muted text-foreground flex items-center justify-center shrink-0">
                            <Warehouse className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Net Stock Flow</p>
                            <p className={`text-base font-black ${stats.netQuantity >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                {stats.netQuantity >= 0 ? `+${stats.netQuantity.toLocaleString()}` : stats.netQuantity.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Toolbar */}
            <div className="flex flex-col md:flex-row gap-2.5 justify-between items-start md:items-center">
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto flex-1">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search ref #, batch, SKU, lot..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-9 h-9"
                        />
                    </div>

                    {/* Direction Filter */}
                    <Select value={directionFilter} onValueChange={(val) => onDirectionFilterChange(val as "ALL" | "IN" | "OUT")}>
                        <SelectTrigger className="w-[125px] h-9 bg-card">
                            <SelectValue placeholder="Direction" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border border-border">
                            <SelectItem value="ALL">All Directions</SelectItem>
                            <SelectItem value="IN">IN (Inbound)</SelectItem>
                            <SelectItem value="OUT">OUT (Outbound)</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Transaction Type Filter */}
                    <Select value={transactionTypeFilter} onValueChange={onTransactionTypeFilterChange}>
                        <SelectTrigger className="w-[170px] h-9 bg-card">
                            <SelectValue placeholder="Transaction Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border border-border max-h-[260px]">
                            <SelectItem value="ALL">All Transaction Types</SelectItem>
                            {availableTransactionTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                    {type.replace(/_/g, " ")}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Storage Lot Filter */}
                    <div className="w-[180px]">
                        <SearchableLotSelect
                            lots={lots}
                            value={lotFilter}
                            onValueChange={onLotFilterChange}
                            allowAll={true}
                            placeholder="All Storage Lots"
                            className="h-9 bg-card"
                        />
                    </div>

                    {onResetFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onResetFilters}
                            className="h-9 text-xs text-muted-foreground hover:text-foreground gap-1"
                            title="Clear Filters"
                        >
                            <FilterX className="h-3.5 w-3.5" />
                            Reset
                        </Button>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
                    <Button variant="outline" size="icon" onClick={onRefresh} className="h-9 w-9" title="Refresh Movements">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Movements Table */}
            <div className="rounded-md border border-border bg-card">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-sm font-medium">Loading inventory movements (/api/mm-inventory-movements/all)...</span>
                    </div>
                ) : movements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground">
                        <ArrowLeftRight className="h-12 w-12 text-muted-foreground/30 mb-2" />
                        <span className="text-sm font-semibold">No inventory movements found</span>
                        <p className="text-xs max-w-xs mt-1">
                            Movements posted from stock adjustments, production, or transfers will appear here in real-time.
                        </p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[45px]">No.</TableHead>
                                <TableHead>Movement Ref & Key</TableHead>
                                <TableHead>Direction</TableHead>
                                <TableHead>Transaction Type</TableHead>
                                <TableHead>Storage Rack (Lot)</TableHead>
                                <TableHead>Product / SKU</TableHead>
                                <TableHead>Batch No</TableHead>
                                <TableHead className="text-right">Quantity</TableHead>
                                <TableHead className="text-right">Unit Cost</TableHead>
                                <TableHead className="text-right">Diff Cost</TableHead>
                                <TableHead>Condition</TableHead>
                                <TableHead>Date & Time</TableHead>
                                <TableHead>Remarks</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedMovements.map((m) => {
                                const isDirectionIn = (m.movementDirection || "").toUpperCase() === "IN";
                                const matchedLot = lots.find((l) => Number(l.lotId) === Number(m.lotId));
                                const resolvedLotName = m.lotName || matchedLot?.lotName || (m.lotId ? `Lot #${m.lotId}` : "-");
                                const qty = isDirectionIn ? Number(m.quantityIn || 0) : Number(m.quantityOut || 0);

                                return (
                                    <TableRow key={m.movementKey || m.displayNumber}>
                                        <TableCell className="text-xs text-muted-foreground font-medium">{m.displayNumber}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col min-w-[130px]">
                                                <span className="font-bold text-xs text-foreground">
                                                    {m.referenceNo || m.movementKey || "-"}
                                                </span>
                                                {m.movementKey && m.movementKey !== m.referenceNo && (
                                                    <span className="font-mono text-[10px] text-muted-foreground">
                                                        {m.movementKey}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {isDirectionIn ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                    <ArrowDownLeft className="h-3 w-3" />
                                                    IN
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                                    <ArrowUpRight className="h-3 w-3" />
                                                    OUT
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted text-foreground uppercase border border-border">
                                                {m.transactionType || m.sourceModule || "MOVEMENT"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="font-semibold text-xs text-foreground">
                                            {resolvedLotName}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col min-w-[150px] max-w-[220px]">
                                                <span className="font-semibold text-xs text-foreground truncate" title={m.productName}>
                                                    {m.productName || (m.productId ? `Product #${m.productId}` : "-")}
                                                </span>
                                                {m.productCode && (
                                                    <span className="font-mono text-[10px] text-muted-foreground truncate">
                                                        {m.productCode}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-bold text-xs">
                                            {m.batchNo ? (
                                                <span className="px-1.5 py-0.5 rounded bg-primary/5 text-primary border border-primary/20 font-mono">
                                                    {m.batchNo}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-black text-xs">
                                            {isDirectionIn ? (
                                                <span className="text-emerald-600 dark:text-emerald-400">
                                                    +{qty.toLocaleString()}
                                                </span>
                                            ) : (
                                                <span className="text-rose-600 dark:text-rose-400">
                                                    -{qty.toLocaleString()}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right text-xs">
                                            {Number(m.unitCost || 0) > 0 ? `₱${Number(m.unitCost).toFixed(2)}` : "-"}
                                        </TableCell>
                                        <TableCell className="text-right text-xs font-semibold">
                                            {Number(m.differenceCost || 0) > 0
                                                ? `₱${Number(m.differenceCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                : "-"}
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded uppercase border bg-muted text-muted-foreground border-border">
                                                {m.inventoryCondition || "GOOD"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                            {m.transactionDate ? m.transactionDate.replace("T", " ").slice(0, 19) : (m.postedAt ? m.postedAt.replace("T", " ").slice(0, 19) : "-")}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate" title={m.remarks || ""}>
                                            {m.remarks || "-"}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Pagination Controls */}
            {!loading && movements.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 text-sm text-muted-foreground px-1">
                    <div className="flex items-center gap-2">
                        <span>Rows per page</span>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(val) => setPageSize(Number(val))}
                        >
                            <SelectTrigger className="w-[70px] h-8 bg-background border border-border">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper" sideOffset={4} className="bg-popover border border-border">
                                {[10, 20, 30, 50, 100].map((size) => (
                                    <SelectItem key={size} value={String(size)}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="ml-2 font-medium">
                            Showing {movements.length > 0 ? startIndex + 1 : 0}-
                            {Math.min(startIndex + pageSize, movements.length)} of {movements.length} items
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="h-8 w-8 p-0"
                        >
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="h-8 px-3"
                        >
                            Previous
                        </Button>

                        <div className="flex items-center gap-1 px-2 font-semibold text-xs">
                            <span>Page</span>
                            <span className="text-foreground">{currentPage}</span>
                            <span>of</span>
                            <span>{totalPages || 1}</span>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="h-8 px-3"
                        >
                            Next
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="h-8 w-8 p-0"
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
