import React from "react";
import { Search, Trash2, Loader2, Layers, ChevronsLeft, ChevronsRight, AlertTriangle, ShieldAlert, History } from "lucide-react";
import { Batch, Lot, type BatchStatus } from "../types";
import { getFefoPriorityMap } from "../utils/fefoEngine";
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

interface BatchTableProps {
    batches: Batch[];
    lots: Lot[];
    loading: boolean;
    searchQuery: string;
    onSearchChange: (value: string) => void;
    selectedLotFilter: number | "ALL";
    onLotFilterChange: (value: number | "ALL") => void;
    statusFilter: string;
    onStatusFilterChange: (value: string) => void;
    selectedProductId?: number | "ALL";
    onDelete: (batchId: number) => void;
    onRefresh?: () => void;
    onAddClick?: () => void;
    onViewMovements?: (batch: Batch) => void;
}

export default function BatchTable({
    batches,
    lots,
    loading,
    searchQuery,
    onSearchChange,
    selectedLotFilter,
    onLotFilterChange,
    statusFilter,
    onStatusFilterChange,
    selectedProductId = "ALL",
    onDelete,
    onAddClick,
    onViewMovements
}: BatchTableProps) {
    const [currentPage, setCurrentPage] = React.useState(1);
    const [pageSize, setPageSize] = React.useState(10);

    // Compute central FEFO Priority Map per product context
    const fefoMap = React.useMemo(() => {
        return getFefoPriorityMap(batches, selectedProductId);
    }, [batches, selectedProductId]);

    const totalPages = Math.ceil(batches.length / pageSize);
    const safeCurrentPage = Math.min(currentPage, Math.max(1, totalPages || 1));
    const startIndex = (safeCurrentPage - 1) * pageSize;
    const paginatedBatches = React.useMemo(() => {
        return batches.slice(startIndex, startIndex + pageSize);
    }, [batches, startIndex, pageSize]);

    return (
        <div className="space-y-4">
            {/* Header Controls & Filters */}
            <div className="flex flex-col md:flex-row gap-3 justify-between items-start md:items-center">
                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto flex-1">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search batch #, SKU, or lot..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-9 h-9"
                        />
                    </div>

                    {/* Searchable Storage Lot Filter Dropdown */}
                    <div className="w-[190px]">
                        <SearchableLotSelect
                            lots={lots}
                            value={selectedLotFilter}
                            onValueChange={onLotFilterChange}
                            allowAll={true}
                            placeholder="All Storage Lots"
                            className="h-9 bg-card"
                        />
                    </div>

                    {/* Status Filter Dropdown */}
                    <Select value={statusFilter} onValueChange={onStatusFilterChange}>
                        <SelectTrigger className="w-[140px] h-9 bg-card">
                            <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border border-border">
                            <SelectItem value="ALL">All Statuses</SelectItem>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="RELEASED">Released</SelectItem>
                            <SelectItem value="QUARANTINED">Quarantined</SelectItem>
                            <SelectItem value="HOLD">Hold</SelectItem>
                            <SelectItem value="EXPIRED">Expired</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {onAddClick && (
                    <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
                        <Button onClick={onAddClick} className="h-9 gap-1.5 shadow-md shadow-primary/15 shrink-0">
                            Register New Batch
                        </Button>
                    </div>
                )}
            </div>

            {/* Table Container */}
            <div className="rounded-md border border-border bg-card">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-sm font-medium">Loading registered batches...</span>
                    </div>
                ) : batches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground">
                        <Layers className="h-12 w-12 text-muted-foreground/30 mb-2" />
                        <span className="text-sm font-semibold">No batches found</span>
                        <p className="text-xs max-w-xs mt-1">
                            Adjust your search or product filter to view inventory batches.
                        </p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">No.</TableHead>
                                <TableHead>FEFO Priority</TableHead>
                                <TableHead>Batch Number</TableHead>
                                <TableHead>Storage Rack (Lot)</TableHead>
                                <TableHead>Item / SKU</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead>Mfg Date</TableHead>
                                <TableHead>Exp Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedBatches.map((batch) => {
                                const unitLabel = batch.uomShortcut || batch.uomName || "";
                                const statusConfig = getBatchStatusBadge(batch.status);
                                const isNearExpiry = checkNearExpiry(batch.expirationDate);
                                const fefoInfo = fefoMap.get(batch.batchId);

                                return (
                                    <TableRow
                                        key={batch.batchId}
                                        onClick={() => onViewMovements?.(batch)}
                                        className={`cursor-pointer transition-colors ${
                                            fefoInfo?.isFefoNext
                                                ? "bg-amber-500/5 hover:bg-amber-500/15"
                                                : "hover:bg-muted/50"
                                        }`}
                                    >
                                        <TableCell className="font-medium text-xs">{batch.displayNumber}</TableCell>
                                        
                                        {/* FEFO Priority Badge */}
                                        <TableCell>
                                            {fefoInfo?.isFefoNext ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40 shadow-xs animate-pulse">
                                                    ★ FEFO NEXT (#1)
                                                </span>
                                            ) : fefoInfo?.priority ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-muted text-foreground border border-border">
                                                    #{fefoInfo.priority} Priority
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                                    <ShieldAlert className="h-3 w-3" />
                                                    Exempt ({fefoInfo?.exclusionReason || "HOLD"})
                                                </span>
                                            )}
                                        </TableCell>

                                        <TableCell className="font-bold text-foreground" title={batch.batchNumber}>
                                            {batch.batchNumber}
                                        </TableCell>
                                        <TableCell className="font-semibold text-foreground" title={batch.lotName}>
                                            {batch.lotName}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col min-w-[180px] max-w-[360px]">
                                                <span
                                                    className="font-semibold text-xs text-foreground truncate"
                                                    title={batch.productName || `Product #${batch.productId}`}
                                                >
                                                    {batch.productName || `Product #${batch.productId}`}
                                                </span>
                                                <span
                                                    className="font-mono text-[10px] text-muted-foreground truncate"
                                                    title={batch.itemCode || `PROD-${batch.productId}`}
                                                >
                                                    {batch.itemCode || `PROD-${batch.productId}`}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-semibold">
                                            {batch.quantity.toLocaleString()}
                                            {unitLabel && (
                                                <span className="text-xs text-muted-foreground font-normal ml-1">
                                                    {unitLabel}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {batch.manufacturingDate ? batch.manufacturingDate.slice(0, 10) : "-"}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {batch.expirationDate ? (
                                                <div className="flex items-center gap-1">
                                                    {isNearExpiry && (
                                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                                    )}
                                                    <span className={isNearExpiry ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                                                        {batch.expirationDate.slice(0, 10)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${statusConfig.badgeClass}`}>
                                                {statusConfig.label}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                                {onViewMovements && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => onViewMovements(batch)}
                                                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                                                        title="View Movement History (/api/mm-inventory-movements/all)"
                                                    >
                                                        <History className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onDelete(batch.batchId)}
                                                    className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                                                    title="Delete Batch"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Pagination Controls */}
            {!loading && batches.length > 0 && (
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
                                {[10, 20, 30, 50].map((size) => (
                                    <SelectItem key={size} value={String(size)}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="ml-2 font-medium">
                            Showing {batches.length > 0 ? startIndex + 1 : 0}-
                            {Math.min(startIndex + pageSize, batches.length)} of {batches.length} items
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

function getBatchStatusBadge(status: BatchStatus) {
    switch (status) {
        case "ACTIVE":
            return { label: "ACTIVE", badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" };
        case "RELEASED":
            return { label: "RELEASED", badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" };
        case "QUARANTINED":
            return { label: "QUARANTINED", badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" };
        case "HOLD":
            return { label: "HOLD", badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" };
        case "EXPIRED":
            return { label: "EXPIRED", badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" };
        default:
            return { label: status || "ACTIVE", badgeClass: "bg-muted text-muted-foreground border-border" };
    }
}

function checkNearExpiry(expDate?: string): boolean {
    if (!expDate) return false;
    const expTime = new Date(expDate).getTime();
    if (isNaN(expTime)) return false;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return expTime - Date.now() <= thirtyDaysMs;
}
