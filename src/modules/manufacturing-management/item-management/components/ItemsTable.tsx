import React from "react";
import { ChevronsLeft, ChevronsRight, Boxes, Edit } from "lucide-react";
import { CatalogItem } from "../types";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableCell,
    TableHead
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface ItemsTableProps {
    items: CatalogItem[];
    onEdit: (item: CatalogItem) => void;
}

export default function ItemsTable({ items, onEdit }: ItemsTableProps) {
    const [currentPage, setCurrentPage] = React.useState(1);
    const [pageSize, setPageSize] = React.useState(10);

    // Reset page to 1 when search results change or page size changes
    React.useEffect(() => {
        queueMicrotask(() => {
            setCurrentPage(1);
        });
    }, [items.length, pageSize]);

    const totalPages = Math.ceil(items.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedItems = React.useMemo(() => {
        return items.slice(startIndex, startIndex + pageSize);
    }, [items, startIndex, pageSize]);

    return (
        <div className="space-y-4">
            <div className="rounded-md border border-border bg-card">
                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground">
                        <Boxes className="h-12 w-12 text-muted-foreground/30 mb-2" />
                        <span className="text-sm font-semibold">No catalog items found</span>
                        <p className="text-xs max-w-xs mt-1 text-muted-foreground">
                            Register a new item to populate this table.
                        </p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">No.</TableHead>
                                <TableHead>Item Name</TableHead>
                                <TableHead>Item Type</TableHead>
                                <TableHead>Item Classification</TableHead>
                                <TableHead>Created By</TableHead>
                                <TableHead>Updated By</TableHead>
                                <TableHead className="w-[80px] text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedItems.map((item) => {
                                // Resolve type and classification names safely
                                const typeName =
                                    item.item_type && typeof item.item_type === "object"
                                        ? item.item_type.type_name
                                        : "N/A";
                                const classificationName =
                                    item.item_classification && typeof item.item_classification === "object"
                                        ? item.item_classification.classification_name
                                        : "N/A";

                                return (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium text-muted-foreground">
                                            {item.displayNumber}
                                        </TableCell>
                                        <TableCell className="font-semibold text-foreground">
                                            {item.item_name}
                                        </TableCell>
                                        <TableCell>
                                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-muted text-muted-foreground border border-transparent">
                                                {typeName}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-transparent">
                                                {classificationName}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {item.created_by_name || "N/A"}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {item.updated_by_name || "N/A"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                onClick={() => onEdit(item)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Pagination Controls */}
            {items.length > 0 && (
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
                            Showing {items.length > 0 ? startIndex + 1 : 0}-
                            {Math.min(startIndex + pageSize, items.length)} of{" "}
                            {items.length} items
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
