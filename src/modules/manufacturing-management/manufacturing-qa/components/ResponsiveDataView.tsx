import type { ReactNode } from "react";

interface ResponsiveDataViewProps {
    table: ReactNode;
    cards: ReactNode;
    minTableWidth?: "wide" | "extraWide";
}

export function ResponsiveDataView({ table, cards, minTableWidth = "wide" }: ResponsiveDataViewProps) {
    const tableWidthClass = minTableWidth === "extraWide" ? "min-w-[1180px]" : "min-w-[900px]";
    const stickyColumnClasses = "[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-20 [&_th:first-child]:bg-card [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-card [&_th:last-child]:sticky [&_th:last-child]:right-0 [&_th:last-child]:z-20 [&_th:last-child]:bg-card [&_th:last-child]:shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.35)] [&_td:last-child]:sticky [&_td:last-child]:right-0 [&_td:last-child]:z-10 [&_td:last-child]:bg-card [&_td:last-child]:shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.35)]";

    return (
        <div className="w-full min-w-0">
            <div className="hidden w-full min-w-0 lg:block">
                <div className="mb-2 flex items-center justify-end text-sm font-medium text-muted-foreground xl:hidden">
                    <span aria-hidden="true">↔</span>
                    <span className="ml-1">Swipe to view more</span>
                </div>
                <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-2 scrollbar-thin">
                    <div className={`${tableWidthClass} w-full ${stickyColumnClasses} [&_[data-slot=table-container]]:overflow-visible`}>{table}</div>
                </div>
            </div>
            <div className="space-y-3 lg:hidden">{cards}</div>
        </div>
    );
}
