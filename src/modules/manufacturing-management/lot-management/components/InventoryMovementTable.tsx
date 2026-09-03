import React, { useState, useMemo } from "react";
import {
    Search,
    Loader2,
    ArrowDownLeft,
    ArrowUpRight,
    ArrowLeftRight,
    ChevronsLeft,
    ChevronsRight,
    Warehouse,
    FilterX,
    AlertTriangle,
    RefreshCw
} from "lucide-react";
import { InventoryMovement, Lot, ProductItem } from "../types";
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
    products?: ProductItem[];
    loading: boolean;
    error?: string | null;
    searchQuery: string;
    onSearchChange: (val: string) => void;
    directionFilter: "ALL" | "IN" | "OUT";
    onDirectionFilterChange: (val: "ALL" | "IN" | "OUT") => void;
    transactionTypeFilter: string;
    onTransactionTypeFilterChange: (val: string) => void;
    lotFilter: number | "ALL";
    onLotFilterChange: (val: number | "ALL") => void;
    productFilter?: number | "ALL";
    onProductFilterChange?: (val: number | "ALL") => void;
    availableTransactionTypes: string[];
    onRefresh?: () => void;
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
    products,
    loading,
    error,
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

    const productMap = useMemo(() => {
        const map = new Map<number, ProductItem>();
        (products || []).forEach((p) => {
            if (p.productId) map.set(Number(p.productId), p);
        });
        return map;
    }, [products]);

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

                    <div className="flex items-center gap-2.5 px-2">
                        <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <ArrowDownLeft className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Total Stock In</p>
                            <p className="text-base font-black text-emerald-600 dark:text-emerald-400">+{stats.totalIn.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 px-2">
                        <div className="h-9 w-9 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                            <ArrowUpRight className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Total Stock Out</p>
                            <p className="text-base font-black text-rose-600 dark:text-rose-400">-{stats.totalOut.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 px-2">
                        <div className="h-9 w-9 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                            <Warehouse className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Net Flow Balance</p>
                            <p className={`text-base font-black ${stats.netQuantity >= 0 ? "text-foreground" : "text-rose-500"}`}>
                                {stats.netQuantity >= 0 ? "+" : ""}{stats.netQuantity.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Controls Bar */}
            <div className="flex flex-col md:flex-row gap-3 justify-between items-start md:items-center bg-card p-3 rounded-xl border border-border">
                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto flex-1">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search ref #, batch, product, or lot..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-9 h-9"
                        />
                    </div>

                    {/* Direction Filter */}
                    <Select value={directionFilter} onValueChange={(v) => onDirectionFilterChange(v as "ALL" | "IN" | "OUT")}>
                        <SelectTrigger className="w-[125px] h-9 bg-card">
                            <SelectValue placeholder="Direction" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border border-border">
                            <SelectItem value="ALL">All Flows</SelectItem>
                            <SelectItem value="IN">Inbound (IN)</SelectItem>
                            <SelectItem value="OUT">Outbound (OUT)</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Transaction Type Filter */}
                    <Select value={transactionTypeFilter} onValueChange={onTransactionTypeFilterChange}>
                        <SelectTrigger className="w-[170px] h-9 bg-card">
                            <SelectValue placeholder="Transaction Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border border-border max-h-56">
                            <SelectItem value="ALL">All Transaction Types</SelectItem>
                            {availableTransactionTypes.map((t) => (
                                <SelectItem key={t} value={t}>
                                    {t.replace(/_/g, " ")}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Lot / Rack Filter */}
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

                {onRefresh && (
                    <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
                        <Button variant="outline" size="icon" onClick={onRefresh} className="h-9 w-9" title="Refresh Movements">
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Movements Table */}
            <div className="rounded-md border border-border bg-card overflow-x-auto">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-sm font-medium">Loading inventory movements...</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center p-14 text-center">
                        <AlertTriangle className="h-12 w-12 text-rose-500 mb-3" />
                        <span className="text-base font-bold text-foreground">Failed to Load Inventory Movements</span>
                        <p className="text-xs text-rose-600 dark:text-rose-400 max-w-lg mt-1 mb-4 font-mono bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                            {error}
                        </p>
                        {onRefresh && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onRefresh}
                                className="gap-2 border-border text-foreground hover:bg-accent shadow-xs"
                            >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Retry Loading Movements
                            </Button>
                        )}
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
                    <Table className="min-w-[1350px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">No.</TableHead>
                                <TableHead className="min-w-[160px]">Movement Ref & Key</TableHead>
                                <TableHead className="w-[110px]">Direction</TableHead>
                                <TableHead className="min-w-[160px]">Transaction Type</TableHead>
                                <TableHead className="min-w-[150px]">Storage Rack (Lot)</TableHead>
                                <TableHead className="min-w-[200px]">Product / SKU</TableHead>
                                <TableHead className="min-w-[140px]">Batch No</TableHead>
                                <TableHead className="text-right w-[110px]">Quantity</TableHead>
                                <TableHead className="text-right w-[100px]">Unit Cost</TableHead>
                                <TableHead className="text-right w-[110px]">Diff Cost</TableHead>
                                <TableHead className="w-[110px]">Condition</TableHead>
                                <TableHead className="w-[160px]">Date & Time</TableHead>
                                <TableHead className="min-w-[160px]">Remarks</TableHead>
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
                                                {(() => {
                                                    const matchedProduct = m.productId ? productMap.get(Number(m.productId)) : undefined;
                                                    const displayDescription =
                                                        m.productDescription ||
                                                        m.description ||
                                                        matchedProduct?.description ||
                                                        m.productName ||
                                                        (m.productId ? `Product #${m.productId}` : "-");

                                                    return (
                                                        <span className="font-semibold text-xs text-foreground truncate" title={displayDescription}>
                                                            {displayDescription}
                                                        </span>
                                                    );
                                                })()}
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
