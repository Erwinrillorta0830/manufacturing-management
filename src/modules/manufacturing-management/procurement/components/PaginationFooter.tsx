import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationFooterProps {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    itemLabel: string;
}

function pageNumbers(page: number, totalPages: number): number[] {
    if (totalPages <= 1) return [1];

    const first = Math.max(1, Math.min(page - 2, totalPages - 4));
    const last = Math.min(totalPages, first + 4);
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export default function PaginationFooter({
    page,
    pageSize,
    total,
    totalPages,
    onPageChange,
    onPageSizeChange,
    itemLabel
}: PaginationFooterProps) {
    const safeTotalPages = Math.max(1, totalPages);
    const safePage = Math.min(Math.max(1, page), safeTotalPages);
    const firstItem = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const lastItem = total === 0 ? 0 : Math.min(safePage * pageSize, total);
    const disabled = total === 0 || safeTotalPages <= 1;

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-2">
                <span>
                    Showing {firstItem}–{lastItem} of {total} {itemLabel}
                </span>
                <label className="flex items-center gap-1.5">
                    <span className="sr-only">Items per page</span>
                    <select
                        aria-label={`Items per page for ${itemLabel}`}
                        value={String(pageSize)}
                        onChange={event => onPageSizeChange(Number(event.target.value))}
                        className="h-7 rounded-md border bg-background px-1.5 text-[10px] font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                    >
                        {[10, 25, 50].map(size => (
                            <option key={size} value={size}>{size} / page</option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="flex items-center gap-1" aria-label={`${itemLabel} pagination`}>
                <button
                    type="button"
                    aria-label="First page"
                    title="First page"
                    disabled={disabled || safePage === 1}
                    onClick={() => onPageChange(1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    aria-label="Previous page"
                    title="Previous page"
                    disabled={disabled || safePage === 1}
                    onClick={() => onPageChange(Math.max(1, safePage - 1))}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {pageNumbers(safePage, safeTotalPages).map(pageNumber => (
                    <button
                        key={pageNumber}
                        type="button"
                        aria-label={`Page ${pageNumber}`}
                        aria-current={pageNumber === safePage ? "page" : undefined}
                        onClick={() => onPageChange(pageNumber)}
                        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 font-semibold transition-colors ${
                            pageNumber === safePage
                                ? "border-primary bg-primary text-primary-foreground"
                                : "bg-background text-foreground hover:bg-muted"
                        }`}
                    >
                        {pageNumber}
                    </button>
                ))}
                <button
                    type="button"
                    aria-label="Next page"
                    title="Next page"
                    disabled={disabled || safePage === safeTotalPages}
                    onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                >
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    aria-label="Last page"
                    title="Last page"
                    disabled={disabled || safePage === safeTotalPages}
                    onClick={() => onPageChange(safeTotalPages)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                >
                    <ChevronsRight className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}
