"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

interface SearchableTransactionTypeSelectProps {
    value: string;
    onValueChange: (val: string) => void;
    availableTransactionTypes: string[];
    disabled?: boolean;
    hasError?: boolean;
    placeholder?: string;
    allowAll?: boolean;
    allLabel?: string;
    className?: string;
}

export function SearchableTransactionTypeSelect({
    value,
    onValueChange,
    availableTransactionTypes = [],
    disabled = false,
    hasError = false,
    placeholder = "Select transaction type...",
    allowAll = true,
    allLabel = "All Transaction Types",
    className,
}: SearchableTransactionTypeSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

    const isAllSelected = !value || value === "ALL";

    const filteredTypes = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return availableTransactionTypes;
        return availableTransactionTypes.filter((t) => {
            const formatted = t.replace(/_/g, " ").toLowerCase();
            const raw = t.toLowerCase();
            return formatted.includes(query) || raw.includes(query);
        });
    }, [availableTransactionTypes, searchQuery]);

    const displayLabel = React.useMemo(() => {
        if (isAllSelected) {
            return allLabel;
        }
        return value.replace(/_/g, " ");
    }, [isAllSelected, allLabel, value]);

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
                        "w-full justify-between font-normal text-left h-9 px-3 bg-card border-border shadow-2xs hover:bg-accent/40",
                        isAllSelected && "text-foreground font-bold text-xs",
                        hasError && "border-destructive focus-visible:ring-destructive text-destructive",
                        className
                    )}
                >
                    <span className="truncate flex items-center gap-2 min-w-0">
                        <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className={cn("text-xs truncate", isAllSelected ? "font-bold text-foreground" : "font-medium text-foreground")}>
                            {displayLabel || placeholder}
                        </span>
                    </span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[260px] sm:w-[280px] p-0 shadow-lg border border-border bg-popover z-[9999] rounded-xl overflow-hidden"
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
                        placeholder="Search transaction type..."
                        className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                        autoFocus
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="text-[10px] text-muted-foreground hover:text-foreground px-1 cursor-pointer"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Scrollable Options List */}
                <div
                    className="max-h-56 overflow-y-auto overscroll-contain p-1 space-y-0.5 text-xs"
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
                                "w-full flex items-center justify-between px-2.5 py-2 rounded-sm text-left transition-colors cursor-pointer",
                                isAllSelected
                                    ? "bg-primary/10 text-primary font-bold border border-primary/20"
                                    : "text-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                        >
                            <span className="font-bold truncate">{allLabel}</span>
                            {isAllSelected && (
                                <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-1.5" />
                            )}
                        </button>
                    )}

                    {filteredTypes.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                            {searchQuery ? `No transaction types found matching "${searchQuery}"` : "No transaction types available."}
                        </div>
                    ) : (
                        filteredTypes.map((t) => {
                            const isSelected = value === t;
                            const formattedName = t.replace(/_/g, " ");
                            return (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => {
                                        onValueChange(t);
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
                                    <span className="truncate">{formattedName}</span>
                                    {isSelected && (
                                        <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-1.5" />
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
