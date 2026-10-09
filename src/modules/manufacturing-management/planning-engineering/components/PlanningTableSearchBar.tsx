import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface PlanningTableSearchBarProps {
    searchQuery: string;
    onSearchQueryChange: (query: string) => void;
    placeholder: string;
    filteredCount: number;
    totalCount: number;
    itemLabel: string;
}

export function PlanningTableSearchBar({
    searchQuery,
    onSearchQueryChange,
    placeholder,
    filteredCount,
    totalCount,
    itemLabel
}: PlanningTableSearchBarProps) {
    return (
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="text"
                    aria-label={placeholder}
                    placeholder={placeholder}
                    value={searchQuery}
                    onChange={(event) => onSearchQueryChange(event.target.value)}
                    className="h-9 border-input bg-card pl-9 text-xs"
                />
            </div>
            <div className="shrink-0 text-left text-[11px] font-medium text-muted-foreground sm:text-right" aria-live="polite">
                Showing <strong className="text-foreground">{filteredCount.toLocaleString()}</strong> of{" "}
                <strong className="text-foreground">{totalCount.toLocaleString()}</strong> {itemLabel}
            </div>
        </div>
    );
}
