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

export interface SearchableSelectProps {
    options: { value: string; label: string; subLabel?: string }[];
    value?: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export function SearchableSelect({
    options,
    value,
    onValueChange,
    placeholder = "Select option...",
    disabled = false,
    className,
}: SearchableSelectProps) {
    const [open, setOpen] = React.useState(false);

    // Find the label for the current value
    const selectedOption = React.useMemo(() => {
        return options.find((opt) => opt.value === value);
    }, [options, value]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full h-auto py-1.5 justify-between", !value && "text-muted-foreground", className)}
                    disabled={disabled}
                >
                    <div className="flex flex-col items-start text-left overflow-hidden">
                        <span className="truncate w-full font-bold text-xs">
                            {selectedOption?.label || placeholder}
                        </span>
                        {selectedOption?.subLabel && (
                            <span className="text-[9px] text-muted-foreground truncate w-full uppercase tracking-tight">
                                {selectedOption.subLabel}
                            </span>
                        )}
                    </div>

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
                                    value={`${opt.label} ${opt.subLabel || ""}`} // Use both labels for searching
                                    onSelect={() => {
                                        onValueChange(opt.value);
                                        setOpen(false);
                                    }}
                                    className="flex items-center py-2"
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-3.5 w-3.5 shrink-0",
                                            value === opt.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col gap-0 overflow-hidden">
                                        <span className="font-bold text-xs truncate leading-tight">{opt.label}</span>
                                        {opt.subLabel && (
                                            <span className="text-[9px] text-muted-foreground truncate uppercase tracking-widest font-medium">
                                                {opt.subLabel}
                                            </span>
                                        )}
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
