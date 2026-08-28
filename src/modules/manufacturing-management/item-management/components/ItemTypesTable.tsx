import React from "react";
import { ChevronsLeft, ChevronsRight, Boxes, Edit } from "lucide-react";
import { ItemType } from "../types";
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

interface ItemTypesTableProps {
    types: ItemType[];
    onEdit: (type: ItemType) => void;
}

export default function ItemTypesTable({ types, onEdit }: ItemTypesTableProps) {
    const [currentPage, setCurrentPage] = React.useState(1);
    const [pageSize, setPageSize] = React.useState(10);

    // Reset page to 1 when search results change or page size changes
    React.useEffect(() => {
        queueMicrotask(() => {
            setCurrentPage(1);
        });
    }, [types.length, pageSize]);

    const totalPages = Math.ceil(types.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedTypes = React.useMemo(() => {
        return types.slice(startIndex, startIndex + pageSize);
    }, [types, startIndex, pageSize]);

    return (
        <div className="space-y-4">
            <div className="rounded-md border border-border bg-card">
                {types.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground">
                        <Boxes className="h-12 w-12 text-muted-foreground/30 mb-2" />
                        <span className="text-sm font-semibold">No item types found</span>
                        <p className="text-xs max-w-xs mt-1 text-muted-foreground">
                            Register a new item type to populate this table.
                        </p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">No.</TableHead>
                                <TableHead>Item Type Name</TableHead>
                                <TableHead>Created By</TableHead>
                                <TableHead>Updated By</TableHead>
                                <TableHead className="w-[80px] text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedTypes.map((type) => (
                                <TableRow key={type.id}>
                                    <TableCell className="font-medium text-muted-foreground">
                                        {type.displayNumber}
                                    </TableCell>
                                    <TableCell className="font-semibold text-foreground">
                                        {type.type_name}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs">
                                        {type.created_by_name || "N/A"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs">
                                        {type.updated_by_name || "N/A"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                            onClick={() => onEdit(type)}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Pagination Controls */}
            {types.length > 0 && (
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
                            Showing {types.length > 0 ? startIndex + 1 : 0}-
                            {Math.min(startIndex + pageSize, types.length)} of{" "}
                            {types.length} items
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
