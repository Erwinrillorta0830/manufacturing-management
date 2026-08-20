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
import { UnitOfMeasure } from "../types";

interface SearchableUomSelectProps {
    uoms: UnitOfMeasure[];
    value: number | "";
    onValueChange: (val: number) => void;
    disabled?: boolean;
    hasError?: boolean;
    placeholder?: string;
}

export function SearchableUomSelect({
    uoms,
    value,
    onValueChange,
    disabled = false,
    hasError = false,
    placeholder = "Select unit of measure..."
}: SearchableUomSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

    const selectedUom = React.useMemo(() => {
        if (value === "") return null;
        return uoms.find((u) => u.unitId === Number(value));
    }, [uoms, value]);

    const filteredUoms = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return uoms;
        return uoms.filter((u) => {
            const nameMatch = u.unitName?.toLowerCase().includes(query);
            const shortcutMatch = u.unitShortcut?.toLowerCase().includes(query);
            const skuMatch = u.skuCode?.toLowerCase().includes(query);
            return nameMatch || shortcutMatch || skuMatch;
        });
    }, [uoms, searchQuery]);

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
                        "w-full justify-between font-normal text-left h-9 px-3",
                        !selectedUom && "text-muted-foreground",
                        hasError && "border-destructive focus-visible:ring-destructive text-destructive"
                    )}
                >
                    <span className="truncate">
                        {selectedUom ? (
                            <span className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{selectedUom.unitName}</span>
                                {selectedUom.unitShortcut && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-muted text-muted-foreground uppercase border border-border/60">
                                        {selectedUom.unitShortcut}
                                    </span>
                                )}
                            </span>
                        ) : (
                            placeholder
                        )}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0 shadow-lg border border-border bg-popover z-[9999]"
                style={{ width: "var(--radix-popover-trigger-width)" }}
                align="start"
                sideOffset={4}
                onWheel={(e) => e.stopPropagation()}
            >
                {/* Search Input Bar */}
                <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border bg-muted/30">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search unit name or shortcut..."
                        className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                        autoFocus
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="text-[10px] text-muted-foreground hover:text-foreground px-1"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Scrollable List */}
                <div
                    className="max-h-56 overflow-y-auto overscroll-contain p-1 space-y-0.5 text-xs"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {filteredUoms.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                            No unit of measure found.
                        </div>
                    ) : (
                        filteredUoms.map((u) => {
                            const isSelected = selectedUom?.unitId === u.unitId;
                            return (
                                <button
                                    key={u.unitId}
                                    type="button"
                                    onClick={() => {
                                        onValueChange(u.unitId);
                                        setOpen(false);
                                        setSearchQuery("");
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-2.5 py-2 rounded-sm text-left transition-colors cursor-pointer",
                                        isSelected
                                            ? "bg-primary/10 text-primary font-medium"
                                            : "text-foreground hover:bg-accent hover:text-accent-foreground"
                                    )}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <Check
                                            className={cn(
                                                "h-3.5 w-3.5 shrink-0",
                                                isSelected ? "opacity-100 text-primary" : "opacity-0"
                                            )}
                                        />
                                        <span className="truncate">{u.unitName}</span>
                                    </div>
                                    {u.unitShortcut && (
                                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground uppercase border border-border/50 ml-2">
                                            {u.unitShortcut}
                                        </span>
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
