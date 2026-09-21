import React from "react";
import { Search, Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { JOB_ORDER_STATUS } from "../../job-order-status";

export interface JOFilterBarProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    statusFilter: string;
    setStatusFilter: (status: string) => void;
    totalCount: number;
    filteredCount: number;
    lockedStatus?: {
        value: string;
        label: string;
    };
}

export function JOFilterBar({
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    totalCount,
    filteredCount,
    lockedStatus
}: JOFilterBarProps) {
    const hasActiveFilters = searchQuery.trim() !== "" || (!lockedStatus && statusFilter !== "all");

    const handleClear = () => {
        setSearchQuery("");
        if (!lockedStatus) setStatusFilter("all");
    };

    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-3 rounded-xl border border-border/60">
            <div className="flex flex-1 flex-col sm:flex-row items-center gap-2.5">
                {/* Search input */}
                <div className="relative flex-1 w-full sm:max-w-xs">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search JO #, product, or notes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 text-xs bg-card border-input"
                    />
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Filter className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
                    {lockedStatus ? (
                        <div
                            role="status"
                            aria-label={`Status filter: ${lockedStatus.label}`}
                            className="flex h-9 w-full items-center rounded-md border border-input bg-card px-3 text-xs font-semibold text-foreground sm:w-[150px]"
                        >
                            <span className="mr-1 text-muted-foreground">Status:</span>
                            {lockedStatus.label}
                        </div>
                    ) : (
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-9 font-semibold text-xs bg-card border-input w-full sm:w-[200px]">
                                <SelectValue placeholder="Status Filter" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="Draft">Draft</SelectItem>
                                <SelectItem value={JOB_ORDER_STATUS.FOR_PICKING}>For Picking</SelectItem>
                                <SelectItem value={JOB_ORDER_STATUS.PICKED}>Picked</SelectItem>
                                <SelectItem value={JOB_ORDER_STATUS.IN_PRODUCTION}>In Production</SelectItem>
                                <SelectItem value={JOB_ORDER_STATUS.ON_HOLD}>On Hold</SelectItem>
                                <SelectItem value={JOB_ORDER_STATUS.QA_HOLD}>QA Hold</SelectItem>
                                <SelectItem value={JOB_ORDER_STATUS.PRODUCTION_COMPLETED}>Production Completed</SelectItem>
                                <SelectItem value={JOB_ORDER_STATUS.FOR_QA_RECONCILIATION}>For QA and Reconciliation</SelectItem>
                                <SelectItem value={JOB_ORDER_STATUS.CLOSED}>Closed</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                </div>

                {hasActiveFilters && (
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={handleClear}
                        className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
                    >
                        <X className="h-3.5 w-3.5" /> Clear Filters
                    </Button>
                )}
            </div>

            <div className="text-[11px] text-muted-foreground font-medium text-right shrink-0">
                Showing <strong className="text-foreground">{filteredCount}</strong> of <strong className="text-foreground">{totalCount}</strong> Job Orders
            </div>
        </div>
    );
}
