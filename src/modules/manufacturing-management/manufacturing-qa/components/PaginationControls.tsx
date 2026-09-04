import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import type { PageMeta } from "../types";

interface PaginationControlsProps {
    meta: PageMeta;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
}

export function PaginationControls({ meta, onPageChange, onPageSizeChange }: PaginationControlsProps) {
    if (meta.total === 0) return null;

    const firstRow = (meta.page - 1) * meta.pageSize + 1;
    const lastRow = Math.min(meta.page * meta.pageSize, meta.total);
    const canGoPrevious = meta.page > 1;
    const canGoNext = meta.totalPages > 0 && meta.page < meta.totalPages;

    return (
        <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
                Showing {firstRow.toLocaleString()}–{lastRow.toLocaleString()} of {meta.total.toLocaleString()}
            </p>
            <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground">
                    <span>Rows</span>
                    <Select value={String(meta.pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
                        <SelectTrigger className="h-11 w-[78px]" aria-label="Rows per page">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="25">25</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                    </Select>
                </label>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11"
                    onClick={() => onPageChange(meta.page - 1)}
                    disabled={!canGoPrevious}
                    aria-label="Previous page"
                >
                    <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className="min-w-20 text-center text-sm font-semibold" aria-label={`Page ${meta.page} of ${Math.max(meta.totalPages, 1)}`}>
                    Page {meta.page} / {Math.max(meta.totalPages, 1)}
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11"
                    onClick={() => onPageChange(meta.page + 1)}
                    disabled={!canGoNext}
                    aria-label="Next page"
                >
                    <ChevronRight className="h-5 w-5" />
                </Button>
            </div>
        </div>
    );
}
