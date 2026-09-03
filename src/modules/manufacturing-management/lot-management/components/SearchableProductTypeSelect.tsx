"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

export interface ProductTypeOption {
    value: string;
    label: string;
    dotColor?: string;
}

const PRODUCT_TYPE_OPTIONS: ProductTypeOption[] = [
    { value: "ALL", label: "All Product Types" },
    { value: "RM", label: "Raw Material (RM)", dotColor: "bg-blue-500" },
    { value: "PKG", label: "Packaging (PKG)", dotColor: "bg-amber-500" },
    { value: "FG", label: "Finished Good (FG)", dotColor: "bg-emerald-500" },
];

interface SearchableProductTypeSelectProps {
    value: string | "ALL";
    onValueChange: (val: string | "ALL") => void;
    disabled?: boolean;
    hasError?: boolean;
    placeholder?: string;
    className?: string;
}

export function SearchableProductTypeSelect({
    value,
    onValueChange,
    disabled = false,
    hasError = false,
    placeholder = "All Product Types",
    className
}: SearchableProductTypeSelectProps) {
    const [open, setOpen] = React.useState(false);

    const selectedOption = React.useMemo(() => {
        return PRODUCT_TYPE_OPTIONS.find((opt) => opt.value === value) || PRODUCT_TYPE_OPTIONS[0];
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
                        "w-full justify-between font-normal text-left h-8.5 px-3 bg-background border-border shadow-2xs hover:bg-accent/40",
                        hasError && "border-destructive focus-visible:ring-destructive text-destructive",
                        className
                    )}
                >
                    <span className="truncate flex items-center gap-2 min-w-0">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[220px] p-1.5 shadow-xl border border-border bg-popover z-[9999] rounded-xl overflow-hidden"
                align="start"
                sideOffset={6}
            >
                <div className="space-y-1">
                    {PRODUCT_TYPE_OPTIONS.map((opt) => {
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
                                    "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left",
                                    isSelected
                                        ? "bg-primary/10 text-primary font-bold"
                                        : "hover:bg-muted text-foreground"
                                )}
                            >
                                <div className="flex items-center gap-2 truncate">
                                    {opt.dotColor && (
                                        <span className={cn("h-2 w-2 rounded-full shrink-0", opt.dotColor)} />
                                    )}
                                    <span className="truncate">{opt.label}</span>
                                </div>
                                {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-2" />}
                            </button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}
