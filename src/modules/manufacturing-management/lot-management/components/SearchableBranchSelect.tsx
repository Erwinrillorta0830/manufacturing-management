"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Branch } from "../types";

interface SearchableBranchSelectProps {
    branches?: Branch[];
    value: number | "ALL" | "";
    onValueChange: (val: number | "ALL") => void;
    disabled?: boolean;
    hasError?: boolean;
    placeholder?: string;
    allowAll?: boolean;
    allLabel?: string;
    className?: string;
}

export function SearchableBranchSelect({
    branches = [],
    value,
    onValueChange,
    disabled = false,
    hasError = false,
    placeholder = "Select branch location...",
    allowAll = false,
    allLabel = "All Branches",
    className
}: SearchableBranchSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

    const selectedBranch = React.useMemo(() => {
        if (value === "" || value === "ALL") return null;
        return branches.find((b) => Number(b.id) === Number(value));
    }, [branches, value]);

    const filteredBranches = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return branches;
        return branches.filter((b) => {
            const nameMatch = b.branchName?.toLowerCase().includes(query);
            const codeMatch = b.branchCode?.toLowerCase().includes(query);
            const idMatch = String(b.id).includes(query);
            return nameMatch || codeMatch || idMatch;
        });
    }, [branches, searchQuery]);

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
                        !selectedBranch && value !== "ALL" && "text-muted-foreground",
                        hasError && "border-destructive focus-visible:ring-destructive text-destructive",
                        className
                    )}
                >
                    <span className="truncate flex items-center gap-2 min-w-0">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        {value === "ALL" ? (
                            <span className="font-bold text-foreground text-xs truncate">{allLabel}</span>
                        ) : selectedBranch ? (
                            <span className="flex items-center gap-2 truncate">
                                <span className="font-medium text-foreground text-xs truncate">{selectedBranch.branchName}</span>
                                {selectedBranch.branchCode && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-muted text-muted-foreground border border-border/60 shrink-0">
                                        {selectedBranch.branchCode}
                                    </span>
                                )}
                            </span>
                        ) : (
                            <span className="text-xs">{placeholder}</span>
                        )}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] min-w-[260px] max-w-[var(--radix-popover-trigger-width)] p-0 shadow-lg border border-border bg-popover z-[9999] rounded-xl overflow-hidden"
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
                        placeholder="Search branch name or code..."
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
                                value === "ALL"
                                    ? "bg-primary/10 text-primary font-bold border border-primary/20"
                                    : "text-foreground hover:bg-accent hover:text-accent-foreground"
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

                    {filteredBranches.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                            {searchQuery ? `No branches found matching "${searchQuery}"` : "No branches available."}
                        </div>
                    ) : (
                        filteredBranches.map((b) => {
                            const isSelected = selectedBranch?.id === b.id;
                            return (
                                <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => {
                                        onValueChange(b.id);
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
                                        <span className="truncate font-medium">{b.branchName}</span>
                                    </div>
                                    {b.branchCode && (
                                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-muted text-muted-foreground border border-border/50 ml-2">
                                            {b.branchCode}
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

