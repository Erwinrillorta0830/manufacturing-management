"use client";

import * as React from "react";
import { Check, ChevronsUpDown, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

export interface StatusOption {
    value: string;
    label: string;
    dotColor?: string;
}

export const STOCK_STATUS_OPTIONS: StatusOption[] = [
    { value: "ALL", label: "All Statuses" },
    { value: "NEGATIVE", label: "Negative Qty / Deficit", dotColor: "bg-rose-500" },
    { value: "EXPIRED", label: "Expired Batches", dotColor: "bg-rose-600" },
    { value: "QUARANTINED", label: "Quarantined / Hold", dotColor: "bg-amber-500" },
    { value: "DAMAGED", label: "Damaged Stock", dotColor: "bg-purple-500" },
    { value: "GOOD", label: "Good / Active Stock", dotColor: "bg-emerald-500" },
];

interface SearchableStatusSelectProps {
    value: string | "ALL";
    onValueChange: (val: string | "ALL") => void;
    disabled?: boolean;
    hasError?: boolean;
    placeholder?: string;
    className?: string;
}

export function SearchableStatusSelect({
    value,
    onValueChange,
    disabled = false,
    hasError = false,
    placeholder = "All Statuses",
    className
}: SearchableStatusSelectProps) {
    const [open, setOpen] = React.useState(false);

    const selectedOption = React.useMemo(() => {
        return STOCK_STATUS_OPTIONS.find((opt) => opt.value === value) || STOCK_STATUS_OPTIONS[0];
    }, [value]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        "w-full justify-between font-normal text-left h-8.5 px-2.5 bg-background border-border shadow-2xs hover:bg-accent/40 text-xs",
                        hasError && "border-destructive focus-visible:ring-destructive text-destructive",
                        className
                    )}
                >
                    <span className="truncate flex items-center gap-1.5 min-w-0">
                        <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {value === "ALL" ? (
                            <span className="font-bold text-foreground text-xs truncate">{placeholder}</span>
                        ) : (
                            <span className="flex items-center gap-1.5 truncate">
                                {selectedOption.dotColor && (
                                    <span className={cn("h-2 w-2 rounded-full shrink-0", selectedOption.dotColor)} />
                                )}
                                <span className="font-medium text-foreground text-xs truncate">
                                    {selectedOption.label}
                                </span>
                            </span>
                        )}
                    </span>
                    <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[230px] p-1.5 shadow-xl border border-border bg-popover z-[9999] rounded-xl overflow-hidden"
                align="start"
                sideOffset={6}
            >
                <div className="space-y-1">
                    {STOCK_STATUS_OPTIONS.map((opt) => {
                        const isSelected = opt.value === value;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                    onValueChange(opt.value);
                                    setOpen(false);
                                }}
                                className={cn(
                                    "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left cursor-pointer",
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
                                    {opt.dotColor && (
                                        <span className={cn("h-2 w-2 rounded-full shrink-0", opt.dotColor)} />
                                    )}
                                    <span className="truncate">{opt.label}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}
