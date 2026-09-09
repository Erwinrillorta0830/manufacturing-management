"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Lot } from "../types";

interface SearchableLotSelectProps<T extends number[] | number | "ALL" | "" = number[] | number | "ALL" | ""> {
    lots: Lot[];
    value: T;
    onValueChange: (val: T) => void;
    disabled?: boolean;
    hasError?: boolean;
    placeholder?: string;
    allowAll?: boolean;
    className?: string;
    loading?: boolean;
}

export function SearchableLotSelect<T extends number[] | number | "ALL" | "" = number[] | number | "ALL" | "">({
    lots,
    value,
    onValueChange,
    disabled = false,
    hasError = false,
    placeholder = "Select storage lot...",
    allowAll = true,
    className,
    loading = false
}: SearchableLotSelectProps<T>) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

    const isArrayMode = Array.isArray(value);

    const selectedLotIds = React.useMemo(() => {
        if (Array.isArray(value)) return value;
        if (value === "" || value === "ALL") return [];
        return [Number(value)];
    }, [value]);

    const isAllSelected = selectedLotIds.length === 0 || value === "ALL";

    const selectedSingleLot = React.useMemo(() => {
        if (selectedLotIds.length === 1) {
            return lots.find((l) => Number(l.lotId) === Number(selectedLotIds[0]));
        }
        return null;
    }, [lots, selectedLotIds]);

    const filteredLots = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return lots;
        return lots.filter((l) => {
            const nameMatch = l.lotName?.toLowerCase().includes(query);
            const branchMatch = l.branchName?.toLowerCase().includes(query) || l.branchCode?.toLowerCase().includes(query);
            const uomMatch = l.uomName?.toLowerCase().includes(query) || l.uomShortcut?.toLowerCase().includes(query);
            const idMatch = String(l.lotId).includes(query);
            return nameMatch || branchMatch || uomMatch || idMatch;
        });
    }, [lots, searchQuery]);

    const handleSelectOption = (lotId: number) => {
        if (isArrayMode) {
            const next = selectedLotIds.includes(lotId)
                ? selectedLotIds.filter((id) => id !== lotId)
                : [...selectedLotIds, lotId];
            onValueChange(next as unknown as T);
        } else {
            onValueChange(lotId as unknown as T);
            setOpen(false);
            setSearchQuery("");
        }
    };

    const handleSelectAll = () => {
        if (isArrayMode) {
            onValueChange([] as unknown as T);
        } else {
            onValueChange("ALL" as unknown as T);
            setOpen(false);
            setSearchQuery("");
        }
    };

    return (
        <Popover
            open={open}
            onOpenChange={(isOpen) => {
                setOpen(isOpen);
                if (!isOpen) setSearchQuery("");
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        "w-full justify-between font-normal text-left h-9 px-3 bg-background border-border shadow-2xs hover:bg-accent/40",
                        isAllSelected && "text-foreground font-bold text-xs",
                        hasError && "border-rose-500 ring-rose-500/20 text-rose-500",
                        className
                    )}
                >
                    <span className="truncate flex items-center gap-1.5 min-w-0">
                        {isAllSelected ? (
                            <span className="font-bold text-foreground text-xs truncate">All Storage Lots</span>
                        ) : selectedLotIds.length === 1 ? (
                            <span className="flex items-center gap-1.5 truncate">
                                <span className="font-semibold text-foreground text-xs truncate">
                                    {selectedSingleLot ? selectedSingleLot.lotName : `Lot #${selectedLotIds[0]}`}
                                </span>
                            </span>
                        ) : selectedLotIds.length > 1 ? (
                            <span className="flex items-center gap-1.5 truncate">
                                <span className="font-bold text-primary text-xs truncate">
                                    {selectedLotIds.length} Storage Lots Selected
                                </span>
                            </span>
                        ) : (
                            <span className="text-xs">{placeholder}</span>
                        )}
                    </span>
                    <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[280px] p-0 shadow-xl border border-border bg-popover z-[9999] rounded-xl overflow-hidden"
                align="start"
                sideOffset={6}
                onWheel={(e) => e.stopPropagation()}
            >
                {/* Search Input Bar */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search storage rack or lot..."
                        className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                        autoFocus
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="text-[11px] text-muted-foreground hover:text-foreground font-medium px-1"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Selection Reset Action Bar below searchbar */}
                {selectedLotIds.length > 0 && (
                    <div className="flex items-center justify-between px-3 py-1.5 bg-primary/5 border-b border-border/80 text-xs">
                        <span className="text-[11px] font-semibold text-primary">
                            {selectedLotIds.length} {selectedLotIds.length === 1 ? "lot" : "lots"} selected
                        </span>
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 flex items-center gap-1 cursor-pointer transition-colors"
                            title="Clear all selections and reset filter"
                        >
                            <RotateCcw className="h-3 w-3" />
                            Reset All
                        </button>
                    </div>
                )}

                {/* Scrollable List */}
                <div
                    className="max-h-60 overflow-y-auto overscroll-contain p-1 space-y-0.5 text-xs"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {loading ? (
                        <div className="p-1 space-y-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div
                                    key={i}
                                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-md bg-muted/40 animate-pulse"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="h-3.5 w-3.5 rounded bg-muted-foreground/20" />
                                        <div className="h-4 w-32 rounded bg-muted-foreground/20" />
                                    </div>
                                    <div className="h-3.5 w-16 rounded bg-muted-foreground/20" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <>
                            {allowAll && (
                                <button
                                    type="button"
                                    onClick={handleSelectAll}
                                    className={cn(
                                        "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors cursor-pointer",
                                        isAllSelected
                                            ? "bg-primary/10 text-primary font-bold border border-primary/20"
                                            : "text-foreground hover:bg-muted/70"
                                    )}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <Check
                                            className={cn(
                                                "h-3.5 w-3.5 shrink-0",
                                                isAllSelected ? "opacity-100 text-primary" : "opacity-0"
                                            )}
                                        />
                                        <span className="font-bold">All Storage Lots</span>
                                    </div>
                                </button>
                            )}

                            {filteredLots.length === 0 ? (
                                <div className="py-5 text-center text-xs text-muted-foreground">
                                    No storage racks found matching &quot;{searchQuery}&quot;
                                </div>
                            ) : (
                                filteredLots.map((lot) => {
                                    const isSelected = selectedLotIds.includes(lot.lotId);
                                    return (
                                        <button
                                            key={lot.lotId}
                                            type="button"
                                            onClick={() => handleSelectOption(lot.lotId)}
                                            className={cn(
                                                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors cursor-pointer",
                                                isSelected
                                                    ? "bg-primary/10 text-primary font-bold border border-primary/20"
                                                    : "text-foreground hover:bg-muted/70"
                                            )}
                                        >
                                            <div className="flex items-center gap-2 truncate">
                                                <Check
                                                    className={cn(
                                                        "h-3.5 w-3.5 shrink-0",
                                                        isSelected ? "opacity-100 text-primary" : "opacity-0"
                                                    )}
                                                />
                                                <div className="truncate">
                                                    <div className="font-semibold text-foreground truncate">{lot.lotName}</div>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right ml-2">
                                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-muted text-muted-foreground uppercase border border-border/50">
                                                    Cap: {lot.maxBatchCapacity.toLocaleString()}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

