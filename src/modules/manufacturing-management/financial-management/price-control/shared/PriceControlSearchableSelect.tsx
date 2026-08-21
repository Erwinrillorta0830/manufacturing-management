"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PriceControlSearchableSelectProps = {
    options: { value: string; label: string }[];
    value?: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
};

export function PriceControlSearchableSelect({
    options,
    value,
    onValueChange,
    placeholder = "Select option...",
    disabled = false,
    className,
}: PriceControlSearchableSelectProps) {
    const [open, setOpen] = React.useState(false);

    const selectedLabel = React.useMemo(
        () => options.find((option) => option.value === value)?.label,
        [options, value],
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    title={selectedLabel}
                    disabled={disabled}
                    className={cn(
                        "w-full min-w-0 justify-between overflow-hidden",
                        !value && "text-muted-foreground",
                        className,
                    )}
                >
                    <span className="min-w-0 flex-1 truncate text-left">
                        {selectedLabel || placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="min-w-[var(--radix-popover-trigger-width)] w-max max-w-[min(calc(100vw-2rem),28rem)] p-0"
                align="start"
            >
                <Command>
                    <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
                    <CommandList onWheelCapture={(event) => event.stopPropagation()}>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={option.label}
                                    className="items-start"
                                    onSelect={() => {
                                        onValueChange(option.value);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mt-0.5 mr-2 h-4 w-4 shrink-0",
                                            value === option.value ? "opacity-100" : "opacity-0",
                                        )}
                                    />
                                    <span
                                        className="min-w-0 flex-1 break-words leading-snug"
                                        title={option.label}
                                    >
                                        {option.label}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
