"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { UnitOfMeasure } from "../types";

interface SearchableUomSelectProps {
    uoms?: UnitOfMeasure[];
    value: number | "ALL" | "";
    onValueChange: (val: number | "ALL") => void;
    disabled?: boolean;
    hasError?: boolean;
    placeholder?: string;
    allowAll?: boolean;
    allLabel?: string;
    className?: string;
}

export function SearchableUomSelect({
    uoms = [],
    value,
    onValueChange,
    disabled = false,
    hasError = false,
    placeholder = "All Units (UOM)",
    allowAll = true,
    allLabel = "All Units (UOM)",
    className
}: SearchableUomSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

    const selectedUom = React.useMemo(() => {
        if (value === "" || value === "ALL") return null;
        return uoms.find((u) => Number(u.unitId) === Number(value));
    }, [uoms, value]);

    const filteredUoms = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return uoms;
        return uoms.filter((u) => {
            const nameMatch = u.unitName?.toLowerCase().includes(query);
            const shortcutMatch = u.unitShortcut?.toLowerCase().includes(query);
            const idMatch = String(u.unitId).includes(query);
            return nameMatch || shortcutMatch || idMatch;
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
                        "w-full justify-between font-normal text-left h-8.5 px-3 bg-background border-border shadow-2xs hover:bg-accent/40",
                        !selectedUom && value !== "ALL" && "text-muted-foreground",
                        hasError && "border-destructive focus-visible:ring-destructive text-destructive",
                        className
                    )}
                >
                    <span className="truncate flex items-center gap-2 min-w-0">
                        <Scale className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {value === "ALL" ? (
                            <span className="font-bold text-foreground text-xs truncate">{allLabel}</span>
                        ) : selectedUom ? (
                            <span className="flex items-center gap-1.5 truncate">
                                <span className="font-medium text-foreground text-xs truncate">
                                    {selectedUom.unitName}
                                </span>
                                {selectedUom.unitShortcut && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold uppercase bg-muted text-muted-foreground border border-border/60 shrink-0">
                                        {selectedUom.unitShortcut}
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
                className="w-[240px] p-0 shadow-xl border border-border bg-popover z-[9999] rounded-xl overflow-hidden"
                align="start"
                sideOffset={6}
            >
                <div className="p-2 border-b border-border/60 bg-muted/20">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search UOM..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary text-foreground"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="max-h-[220px] overflow-y-auto p-1 space-y-0.5">
                    {allowAll && (
                        <button
                            type="button"
                            onClick={() => {
                                onValueChange("ALL");
                                setOpen(false);
                            }}
                            className={cn(
                                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left",
                                value === "ALL"
                                    ? "bg-primary/10 text-primary font-bold"
                                    : "hover:bg-muted text-foreground"
                            )}
                        >
                            <span>{allLabel}</span>
                            {value === "ALL" && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </button>
                    )}

                    {filteredUoms.length === 0 ? (
                        <div className="p-3 text-center text-xs text-muted-foreground">
                            No units found matching &quot;{searchQuery}&quot;
                        </div>
                    ) : (
                        filteredUoms.map((u) => {
                            const isSelected = Number(value) === Number(u.unitId);
                            return (
                                <button
                                    key={u.unitId}
                                    type="button"
                                    onClick={() => {
                                        onValueChange(u.unitId);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left",
                                        isSelected
                                            ? "bg-primary/10 text-primary font-bold"
                                            : "hover:bg-muted text-foreground"
                                    )}
                                >
                                    <div className="flex items-center gap-2 truncate min-w-0">
                                        <span className="truncate">{u.unitName}</span>
                                        {u.unitShortcut && (
                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-muted text-muted-foreground border border-border/60 shrink-0">
                                                {u.unitShortcut}
                                            </span>
                                        )}
                                    </div>
                                    {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-1.5" />}
                                </button>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
