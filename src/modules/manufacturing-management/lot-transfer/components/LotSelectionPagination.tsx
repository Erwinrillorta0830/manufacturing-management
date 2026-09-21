import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LotSelectionPaginationProps {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    label: string;
    onPageChange: (page: number) => void;
}

export function LotSelectionPagination({ currentPage, pageSize, totalItems, label, onPageChange }: LotSelectionPaginationProps) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (totalPages <= 1) return null;

    const page = Math.min(Math.max(currentPage, 0), totalPages - 1);
    const firstItem = page * pageSize + 1;
    const lastItem = Math.min((page + 1) * pageSize, totalItems);

    return (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border bg-background/70 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground" aria-live="polite">
                Showing <span className="font-semibold text-foreground">{firstItem}-{lastItem}</span> of <span className="font-semibold text-foreground">{totalItems}</span> {label.toLowerCase()} · Page <span className="font-semibold text-foreground">{page + 1}</span> of <span className="font-semibold text-foreground">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page === 0}
                    aria-label={`Previous ${label.toLowerCase()} page`}
                >
                    <ChevronLeft />
                    Previous
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages - 1}
                    aria-label={`Next ${label.toLowerCase()} page`}
                >
                    Next
                    <ChevronRight />
                </Button>
            </div>
        </div>
    );
}
