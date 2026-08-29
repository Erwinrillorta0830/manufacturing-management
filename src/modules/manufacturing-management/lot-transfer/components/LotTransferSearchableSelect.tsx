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
    disabled?: boolean;
    className?: string;
}

export function LotTransferSearchableSelect({
    options,
    value,
    onValueChange,
    placeholder = "Select option...",
    disabled = false,
    className,
}: LotTransferSearchableSelectProps) {
    const [open, setOpen] = React.useState(false);

    const selectedLabel = React.useMemo(() => {
        return options.find((opt) => opt.value === value)?.label;
    }, [options, value]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
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
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
                    <CommandList>
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
