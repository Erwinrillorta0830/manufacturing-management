import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";

export interface PlanningPaginationState {
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
}

interface PlanningPaginationControlsProps extends PlanningPaginationState {
    totalItems: number;
    itemLabel: string;
}

export function PlanningPaginationControls({
    page,
    pageSize,
    totalItems,
    itemLabel,
    onPageChange,
    onPageSizeChange
}: PlanningPaginationControlsProps) {
    if (totalItems === 0) return null;

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(page, totalPages);
    const firstItem = (safePage - 1) * pageSize + 1;
    const lastItem = Math.min(safePage * pageSize, totalItems);

    return (
        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground" aria-live="polite">
                Showing {firstItem.toLocaleString()}–{lastItem.toLocaleString()} of {totalItems.toLocaleString()} {itemLabel}
            </span>
            <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Per page</span>
                    <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
                        <SelectTrigger className="h-8 w-[76px]" aria-label={`${itemLabel} per page`}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[10, 25, 50].map((size) => (
                                <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
                <span className="min-w-[5rem] text-center text-xs font-medium text-muted-foreground" aria-label={`Page ${safePage} of ${totalPages}`}>
                    Page {safePage} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Previous ${itemLabel} page`}
                        disabled={safePage <= 1}
                        onClick={() => onPageChange(Math.max(1, safePage - 1))}
                    >
                        <ChevronLeft />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Next ${itemLabel} page`}
                        disabled={safePage >= totalPages}
                        onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
                    >
                        <ChevronRight />
                    </Button>
                </div>
            </div>
        </div>
    );
}
