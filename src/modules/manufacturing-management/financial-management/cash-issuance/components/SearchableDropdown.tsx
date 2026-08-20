"use client";

import * as React from "react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchableDropdownProps<T extends string | number> {
    options: { label: string; value: T }[];
    value: T | "";
    onSelect: (val: T) => void;
    placeholder: string;
    disabled?: boolean;
    className?: string;
    popoverWidth?: string;
    overrideLabel?: string;
    ariaInvalid?: boolean;
}

export function SearchableDropdown<T extends string | number>({
    options,
    value,
    onSelect,
    placeholder,
    disabled,
    className,
    popoverWidth = "w-[400px]",
    overrideLabel,
    ariaInvalid,
}: SearchableDropdownProps<T>) {
    const [open, setOpen] = useState(false);
    const listRef = React.useRef<HTMLDivElement>(null);
    const selectedLabel = options.find((o) => String(o.value) === String(value))?.label || overrideLabel || placeholder;
    
    const handlePopoverWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        const list = listRef.current;
        if (!list) return;

        event.stopPropagation();
        list.scrollTop += event.deltaY;
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled}
                        aria-invalid={ariaInvalid}
                        className={cn("justify-between font-normal px-3", className)}>
                    <span className="truncate">{selectedLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className={cn("p-0 shadow-lg border-border pointer-events-auto z-[100]", popoverWidth)}
                align="start"
                onWheelCapture={handlePopoverWheel}
            >
                <Command>
                    <CommandInput placeholder="Search..." className="h-9 text-xs"/>
                    <CommandList
                        ref={listRef}
                        className="max-h-[250px] overflow-y-auto overscroll-contain scrollbar-thin"
                    >
                        <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No results found.</CommandEmpty>
                        <CommandGroup>
                            {options.map((opt, index) => (
                                <CommandItem
                                    key={`${opt.value}-${index}`}
                                    value={opt.label || `Option-${index}`}
                                    onSelect={() => {
                                        onSelect(opt.value);
                                        setOpen(false);
                                    }}
                                    className="text-xs cursor-pointer"
                                >
                                    <Check
                                        className={cn("mr-2 h-4 w-4 text-primary", String(value) === String(opt.value) ? "opacity-100" : "opacity-0")}/>
                                    {opt.label || "Unnamed Option"}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
