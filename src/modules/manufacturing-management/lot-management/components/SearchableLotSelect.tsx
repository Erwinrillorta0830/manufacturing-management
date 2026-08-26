"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Lot } from "../types";

interface SearchableLotSelectProps {
    lots: Lot[];
    value: number | "ALL" | "";
    onValueChange: (val: number | "ALL") => void;
    disabled?: boolean;
    hasError?: boolean;
    placeholder?: string;
    allowAll?: boolean;
    className?: string;
}

export function SearchableLotSelect({
    lots,
    value,
    onValueChange,
    disabled = false,
    hasError = false,
    placeholder = "Select storage lot...",
    allowAll = false,
    className
}: SearchableLotSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

    const selectedLot = React.useMemo(() => {
        if (value === "" || value === "ALL") return null;
        return lots.find((l) => l.lotId === Number(value));
    }, [lots, value]);

    const filteredLots = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return lots;
        return lots.filter((l) => {
            const nameMatch = l.lotName?.toLowerCase().includes(query);
            const uomMatch = l.uomName?.toLowerCase().includes(query) || l.uomShortcut?.toLowerCase().includes(query);
            const idMatch = String(l.lotId).includes(query);
            return nameMatch || uomMatch || idMatch;
        });
    }, [lots, searchQuery]);

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
                        !selectedLot && value !== "ALL" && "text-muted-foreground",
                        hasError && "border-rose-500 ring-rose-500/20 text-rose-500",
                        className
                    )}
                >
                    <span className="truncate flex items-center gap-2">
                        {value === "ALL" ? (
                            <span className="font-bold text-foreground truncate">All Storage Lots</span>
                        ) : selectedLot ? (
                            <span className="flex items-center gap-2 truncate">
                                <span className="font-bold text-foreground truncate">{selectedLot.lotName}</span>
                                <span className="text-[11px] text-muted-foreground font-medium shrink-0">
                                    (Cap: {selectedLot.maxBatchCapacity.toLocaleString()} {selectedLot.uomShortcut || selectedLot.uomName})
                                </span>
                            </span>
                        ) : (
                            placeholder
                        )}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[240px] p-0 shadow-xl border border-border bg-popover z-[9999] rounded-xl overflow-hidden"
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

                {/* Scrollable List */}
                <div
                    className="max-h-60 overflow-y-auto overscroll-contain p-1 space-y-0.5 text-xs"
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
                            const isSelected = selectedLot?.lotId === lot.lotId;
                            return (
                                <button
                                    key={lot.lotId}
                                    type="button"
                                    onClick={() => {
                                        onValueChange(lot.lotId);
                                        setOpen(false);
                                        setSearchQuery("");
                                    }}
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
                </div>
            </PopoverContent>
        </Popover>
    );
}
