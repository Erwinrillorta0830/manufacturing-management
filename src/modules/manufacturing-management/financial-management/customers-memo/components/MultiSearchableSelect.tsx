"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export interface MultiSearchableSelectProps {
    options: { value: string; label: string; subLabel?: string }[];
    value?: string[];
    onValueChange: (value: string[]) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export function MultiSearchableSelect({
    options,
    value = [],
    onValueChange,
    placeholder = "Select options...",
    disabled = false,
    className,
}: MultiSearchableSelectProps) {
    const [open, setOpen] = React.useState(false);

    const toggleOption = (optValue: string) => {
        const newValues = value.includes(optValue)
            ? value.filter((v) => v !== optValue)
            : [...value, optValue];
        onValueChange(newValues);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full justify-between h-auto min-h-[2.5rem] py-2 px-3",
                        value.length === 0 && "text-muted-foreground",
                        className
                    )}
                    disabled={disabled}
                >
                    <div className="flex flex-wrap gap-1 items-center flex-1 pr-2 text-left">
                        {value.length > 0 ? (
                            value.map((v) => {
                                const opt = options.find((o) => o.value === v);
                                return (
                                    <Badge
                                        key={v}
                                        variant="secondary"
                                        className="bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 px-1.5 py-0 rounded text-[10px]"
                                    >
                                        {opt?.label || v}
                                    </Badge>
                                );
                            })
                        ) : (
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-none px-1.5 py-0 rounded text-[10px] uppercase font-black">ALL</Badge>
                                <span className="truncate text-xs text-muted-foreground">{placeholder}</span>
                            </div>
                        )}
                    </div>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem
                                value="ALL"
                                onSelect={() => {
                                    onValueChange([]);
                                    setOpen(false);
                                }}
                                className="font-bold text-amber-600"
                            >
                                <Check
                                    className={cn(
                                        "mr-2 h-4 w-4",
                                        value.length === 0 ? "opacity-100" : "opacity-0"
                                    )}
                                />
                                ALL (Clear Selection)
                            </CommandItem>
                            {options.map((opt) => {
                                const isSelected = value.includes(opt.value);
                                return (
                                    <CommandItem
                                        key={opt.value}
                                        value={`${opt.label} ${opt.subLabel || ""}`}
                                        onSelect={() => toggleOption(opt.value)}
                                        className="flex items-center py-2"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-3.5 w-3.5 shrink-0",
                                                isSelected ? "opacity-100" : "opacity-0"
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
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
