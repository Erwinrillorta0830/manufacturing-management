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
import { MATERIAL_TYPE_OPTIONS, MaterialType } from "../material-types";

interface MaterialTypeSelectProps {
    value?: MaterialType | "";
    onChange: (value: MaterialType | "") => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export function MaterialTypeSelect({
    value,
    onChange,
    placeholder = "Select Material Type...",
    disabled = false,
    className
}: MaterialTypeSelectProps) {
    const [open, setOpen] = React.useState(false);

    const selectedOption = MATERIAL_TYPE_OPTIONS.find(opt => opt.value === value);

    const getBadgeStyle = (val?: string) => {
        switch (val) {
            case "raw_material":
                return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
            case "packaging":
                return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
            case "sub_assembly":
                return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
            case "finished_good":
                return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
            default:
                return "bg-muted text-muted-foreground border-border";
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        "w-full justify-between h-8 text-[11px] font-bold uppercase tracking-wide px-2.5 bg-background border-border hover:bg-accent hover:text-accent-foreground dark:bg-slate-900/60 dark:border-slate-800 dark:hover:bg-slate-800/80 transition-colors",
                        selectedOption && getBadgeStyle(selectedOption.value),
                        className
                    )}
                >
                    <span className="truncate">
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0 shadow-lg border-border bg-popover text-popover-foreground z-50" align="start">
                <Command className="bg-transparent">
                    <CommandInput placeholder="Search material type..." className="h-8 text-xs" />
                    <CommandList className="max-h-[220px]">
                        <CommandEmpty className="p-2 text-[11px] text-muted-foreground text-center">
                            No material type found.
                        </CommandEmpty>
                        <CommandGroup>
                            {MATERIAL_TYPE_OPTIONS.map((option) => {
                                const isSelected = option.value === value;
                                return (
                                    <CommandItem
                                        key={option.value}
                                        value={option.label}
                                        onSelect={() => {
                                            onChange(option.value);
                                            setOpen(false);
                                        }}
                                        className="flex items-center justify-between text-xs py-1.5 px-2 cursor-pointer hover:bg-accent hover:text-accent-foreground font-semibold"
                                    >
                                        <span className={cn(
                                            "px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border",
                                            getBadgeStyle(option.value)
                                        )}>
                                            {option.label}
                                        </span>
                                        <Check
                                            className={cn(
                                                "h-3.5 w-3.5 text-primary transition-opacity",
                                                isSelected ? "opacity-100" : "opacity-0"
                                            )}
                                        />
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
