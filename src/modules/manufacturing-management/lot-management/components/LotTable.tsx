import React from "react";
import { Search, RefreshCw, Pencil, Loader2, Boxes, ChevronsLeft, ChevronsRight, Plus } from "lucide-react";
import { Lot } from "../types";
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

interface LotTableProps {
    filteredLots: Lot[];
    loading: boolean;
    searchQuery: string;
    onSearchChange: (value: string) => void;
    onEdit: (lot: Lot) => void;
    onRefresh: () => void;
    onAddClick?: () => void;
}

export default function LotTable({
    filteredLots,
    loading,
    searchQuery,
    onSearchChange,
    onEdit,
    onRefresh,
    onAddClick
}: LotTableProps) {
    const [currentPage, setCurrentPage] = React.useState(1);
    const [pageSize, setPageSize] = React.useState(10);

    const totalPages = Math.ceil(filteredLots.length / pageSize);
    const safeCurrentPage = Math.min(currentPage, Math.max(1, totalPages || 1));
    const startIndex = (safeCurrentPage - 1) * pageSize;
    const paginatedLots = React.useMemo(() => {
        return filteredLots.slice(startIndex, startIndex + pageSize);
    }, [filteredLots, startIndex, pageSize]);

    return (
        <div className="space-y-4">
            {/* Header / Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto flex-1 max-w-md">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search lots by name..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-9 h-9"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                    <Button variant="outline" size="icon" onClick={onRefresh} className="h-9 w-9">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    {onAddClick && (
                        <Button
                            onClick={onAddClick}
                            className="h-9 gap-1.5 shadow-md shadow-primary/15 shrink-0"
                        >
                            <Plus className="h-4 w-4" />
                            Add New Lot
                        </Button>
                    )}
                </div>
            </div>

            {/* Table Container */}
            <div className="rounded-md border border-border bg-card">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-sm font-medium">Loading storage lots...</span>
                    </div>
                ) : filteredLots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground">
                        <Boxes className="h-12 w-12 text-muted-foreground/30 mb-2" />
                        <span className="text-sm font-semibold">No storage lots found</span>
                        <p className="text-xs max-w-xs mt-1">
                            Adjust your search or add a new lot to register a storage location.
                        </p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[80px]">No.</TableHead>
                                <TableHead>Storage Location</TableHead>
                                <TableHead>UOM</TableHead>
                                <TableHead>Max Capacity</TableHead>
                                <TableHead>Created By</TableHead>
                                <TableHead className="text-right w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedLots.map((lot) => {
                                const unitLabel = lot.uomShortcut || lot.uomName || "";
                                return (
                                    <TableRow key={lot.lotId}>
                                        <TableCell className="font-medium">{lot.displayNumber}</TableCell>
                                        <TableCell className="font-semibold text-foreground">
                                            {lot.lotName}
                                        </TableCell>
                                        <TableCell>
                                            {unitLabel ? (
                                                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-muted text-muted-foreground border border-border uppercase">
                                                    {unitLabel}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    -
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {lot.maxBatchCapacity.toLocaleString()}
                                            {unitLabel && (
                                                <span className="text-xs text-muted-foreground font-normal ml-1">
                                                    {unitLabel}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {lot.createdBy || "System"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onEdit(lot)}
                                                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                                                >
                                                    <Pencil className="h-4 w-4" />
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
            {!loading && filteredLots.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 text-sm text-muted-foreground px-1">
                    <div className="flex items-center gap-2">
                        <span>Rows per page</span>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(val) => {
                                setPageSize(Number(val));
                            }}
                        >
                            <SelectTrigger className="w-[70px] h-8 bg-background border border-border">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper" sideOffset={4} className="bg-popover border border-border">
                                {[10, 20, 30, 40, 50].map((size) => (
                                    <SelectItem key={size} value={String(size)}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="ml-2 font-medium">
                            Showing {filteredLots.length > 0 ? startIndex + 1 : 0}-
                            {Math.min(startIndex + pageSize, filteredLots.length)} of{" "}
                            {filteredLots.length} items
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
