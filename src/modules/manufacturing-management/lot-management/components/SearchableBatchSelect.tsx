"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Batch } from "../types";

interface SearchableBatchSelectProps {
    batches: Batch[];
    value: number | "ALL" | "";
    onValueChange: (val: number | "ALL") => void;
    disabled?: boolean;
    hasError?: boolean;
    placeholder?: string;
    allowAll?: boolean;
    allLabel?: string;
    className?: string;
}

export function SearchableBatchSelect({
    batches,
    value,
    onValueChange,
    disabled = false,
    hasError = false,
    placeholder = "Select inventory batch...",
    allowAll = false,
    allLabel = "All Batches",
    className
}: SearchableBatchSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

    const selectedBatch = React.useMemo(() => {
        if (value === "" || value === "ALL") return null;
        return batches.find((b) => Number(b.batchId) === Number(value));
    }, [batches, value]);

    const filteredBatches = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return batches;
        return batches.filter((b) => {
            const batchNoMatch = b.batchNumber?.toLowerCase().includes(query);
            const prodNameMatch = b.productName?.toLowerCase().includes(query);
            const skuMatch = b.itemCode?.toLowerCase().includes(query);
            const lotMatch = b.lotName?.toLowerCase().includes(query);
            const remarksMatch = b.remarks?.toLowerCase().includes(query);
            const idMatch = String(b.batchId).includes(query);
            return batchNoMatch || prodNameMatch || skuMatch || lotMatch || remarksMatch || idMatch;
        });
    }, [batches, searchQuery]);

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
                        !selectedBatch && value !== "ALL" && "text-muted-foreground",
                        hasError && "border-rose-500 ring-rose-500/20 text-rose-500",
                        className
                    )}
                >
                    <span className="truncate flex items-center gap-2 min-w-0">
                        <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                        {value === "ALL" ? (
                            <span className="font-bold text-foreground text-xs truncate">{allLabel}</span>
                        ) : selectedBatch ? (
                            <span className="flex items-center gap-1.5 truncate min-w-0">
                                <span className="font-mono font-bold text-foreground text-xs truncate">
                                    {selectedBatch.batchNumber}
                                </span>
                                {selectedBatch.productName && (
                                    <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                                        ({selectedBatch.productName})
                                    </span>
                                )}
                            </span>
                        ) : value ? (
                            <span className="font-semibold text-foreground text-xs">Batch #{value}</span>
                        ) : (
                            <span className="text-xs">{placeholder}</span>
                        )}
                    </span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[340px] sm:w-[380px] p-0 shadow-xl border border-border bg-popover z-[9999] rounded-xl overflow-hidden"
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
                        placeholder="Search batch #, SKU, product, or lot..."
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

                {/* Scrollable List */}
                <div
                    className="max-h-64 overflow-y-auto overscroll-contain p-1 space-y-0.5 text-xs"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {allowAll && (
                        <button
                            type="button"
                            onClick={() => {
                                onValueChange("ALL");
                                setOpen(false);
                                setSearchQuery("");
                            }}
                            className={cn(
                                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors cursor-pointer",
                                value === "ALL"
                                    ? "bg-primary/10 text-primary font-bold border border-primary/20"
                                    : "text-foreground hover:bg-muted/70"
                            )}
                        >
                            <div className="flex items-center gap-2 truncate">
                                <Check
                                    className={cn(
                                        "h-3.5 w-3.5 shrink-0",
                                        value === "ALL" ? "opacity-100 text-primary" : "opacity-0"
                                    )}
                                />
                                <span className="font-bold">{allLabel}</span>
                            </div>
                        </button>
                    )}

                    {filteredBatches.length === 0 ? (
                        <div className="py-5 text-center text-xs text-muted-foreground space-y-1">
                            <p>No batches found matching &quot;{searchQuery}&quot;</p>
                        </div>
                    ) : (
                        filteredBatches.map((b) => {
                            const isSelected = selectedBatch ? Number(selectedBatch.batchId) === Number(b.batchId) : false;
                            const unitLabel = b.uomShortcut || b.uomName || "";
                            return (
                                <button
                                    key={b.batchId}
                                    type="button"
                                    onClick={() => {
                                        onValueChange(Number(b.batchId));
                                        setOpen(false);
                                        setSearchQuery("");
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left transition-colors cursor-pointer",
                                        isSelected
                                            ? "bg-primary/10 text-primary font-bold border border-primary/20"
                                            : "text-foreground hover:bg-muted/70"
                                    )}
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <Check
                                            className={cn(
                                                "h-3.5 w-3.5 shrink-0",
                                                isSelected ? "opacity-100 text-primary" : "opacity-0"
                                            )}
                                        />
                                        <div className="truncate min-w-0">
                                            <div className="flex items-center gap-1.5 truncate">
                                                <span className="font-mono font-bold text-foreground text-xs">
                                                    {b.batchNumber}
                                                </span>
                                                {b.lotName && (
                                                    <span className="px-1 py-0.2 rounded text-[9px] bg-muted text-muted-foreground border border-border/60">
                                                        {b.lotName}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                                                {b.productName || `Product #${b.productId}`}
                                                {b.itemCode && <span className="font-mono text-[10px] ml-1">({b.itemCode})</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
                                        <span className="font-bold text-xs text-foreground">
                                            {b.quantity.toLocaleString()} {unitLabel}
                                        </span>
                                        {b.expirationDate && (
                                            <span className="text-[10px] text-muted-foreground">
                                                Exp: {b.expirationDate.slice(0, 10)}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
