"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

interface LotTransferSearchableSelectProps {
    options: { value: string; label: string }[];
    value?: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    disabled?: boolean;
    className?: string;
}

export function LotTransferSearchableSelect({
    options,
    value,
    onValueChange,
    placeholder = "Select option...",
    searchPlaceholder,
    disabled = false,
    className,
}: LotTransferSearchableSelectProps) {
    const [open, setOpen] = React.useState(false);

    const selectedLabel = React.useMemo(() => {
        return options.find((opt) => opt.value === value)?.label;
    }, [options, value]);

    return (
        <Popover modal={false} open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between", !value && "text-muted-foreground", className)}
                    disabled={disabled}
                >
                    <span className="min-w-0 truncate text-left">{selectedLabel || placeholder}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[--radix-popover-trigger-width] overscroll-contain p-0"
                align="start"
                data-radix-scroll-lock-ignore="true"
                onWheelCapture={(event) => event.stopPropagation()}
                onTouchMoveCapture={(event) => event.stopPropagation()}
            >
                <Command>
                    <CommandInput placeholder={searchPlaceholder || `Search ${placeholder.toLowerCase()}...`} />
                    <CommandList
                        className="max-h-64 overflow-y-auto overscroll-contain touch-pan-y"
                        data-radix-scroll-lock-ignore="true"
                        onWheelCapture={(event) => event.stopPropagation()}
                        onTouchMoveCapture={(event) => event.stopPropagation()}
                    >
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {options.map((opt) => (
                                <CommandItem
                                    key={opt.value}
                                    value={opt.label}
                                    onSelect={() => {
                                        onValueChange(opt.value);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === opt.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <span className="min-w-0 truncate">{opt.label}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
