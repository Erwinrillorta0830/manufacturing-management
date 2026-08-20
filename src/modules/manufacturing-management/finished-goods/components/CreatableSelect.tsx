"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "./ui/local-command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
    PopoverAnchor,
} from "./ui/local-popover";

export interface CreatableSelectProps {
    options: { value: string; label: string; labelNode?: React.ReactNode }[];
    value?: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    id?: string;
    "aria-invalid"?: boolean | "true" | "false";
    "aria-describedby"?: string;
    onCreateOption?: (name: string) => Promise<void> | void;
    onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
    "data-index"?: number;
    popoverClassName?: string;
    variant?: "popover" | "inline";
}

export function CreatableSelect({
    options,
    value,
    onValueChange,
    placeholder = "Select option...",
    disabled = false,
    className,
    id,
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedBy,
    onCreateOption,
    onKeyDown,
    "data-index": dataIndex,
    popoverClassName,
    variant = "popover",
}: CreatableSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

    // Find the selected option object for the current value
    const selectedOption = React.useMemo(() => {
        return options.find((opt) => opt.value === value);
    }, [options, value]);

    const handleCreate = async () => {
        if (!onCreateOption || !searchQuery.trim()) return;
        await onCreateOption(searchQuery.trim());
        setSearchQuery("");
        setOpen(false);
    };

    const filteredOptions = React.useMemo(() => {
        if (!searchQuery.trim()) return options;
        return options.filter((opt) =>
            opt.label.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [options, searchQuery]);

    return (
        <Popover 
            open={open} 
            onOpenChange={(newOpen) => {
                setOpen(newOpen);
                if (!newOpen) {
                    setSearchQuery("");
                }
            }}
        >
            {variant === "inline" ? (
                <PopoverAnchor asChild>
                    <input
                        id={id}
                        type="text"
                        disabled={disabled}
                        placeholder={placeholder}
                        value={open ? searchQuery : (selectedOption?.label || "")}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setOpen(true);
                        }}
                        onFocus={() => {
                            setOpen(true);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                setOpen(false);
                            }
                            if (e.key === "Enter") {
                                if (open) {
                                    if (filteredOptions.length > 0) {
                                        e.preventDefault();
                                        onValueChange(filteredOptions[0].value);
                                        setOpen(false);
                                        setSearchQuery("");
                                    }
                                }
                            }
                            if (onKeyDown) {
                                onKeyDown(e);
                            }
                        }}
                        className={cn(
                            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                            className
                        )}
                        aria-invalid={ariaInvalid}
                        aria-describedby={ariaDescribedBy}
                        data-index={dataIndex}
                    />
                </PopoverAnchor>
            ) : (
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        aria-invalid={ariaInvalid}
                        aria-describedby={ariaDescribedBy}
                        className={cn("w-full justify-between", !value && "text-muted-foreground", className)}
                        disabled={disabled}
                        onKeyDown={onKeyDown}
                        data-index={dataIndex}
                    >
                        <span className="truncate w-full text-left">
                            {selectedOption ? (selectedOption.labelNode || selectedOption.label) : placeholder}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
            )}
            <PopoverContent
                className={cn("w-[--radix-popover-trigger-width] p-0 z-[100]", popoverClassName)}
                align="start"
                sideOffset={4}
                onOpenAutoFocus={variant === "inline" ? (e) => e.preventDefault() : undefined}
            >
                <Command shouldFilter={false}>
                    {variant !== "inline" && (
                        <CommandInput
                            placeholder={`Search ${placeholder.toLowerCase()}...`}
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                        />
                    )}
                    <CommandList className="max-h-64 overflow-x-hidden overflow-y-auto">
                        {filteredOptions.length === 0 && (
                            <CommandEmpty className="py-2 px-3 text-xs flex flex-col gap-2">
                                <span>No results found.</span>
                                {onCreateOption && searchQuery.trim() !== "" && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        className="w-full text-[10px] inline-flex items-center gap-1 justify-center py-1 h-auto"
                                        onClick={handleCreate}
                                    >
                                        <Plus className="h-3 w-3" /> Create &quot;{searchQuery}&quot;
                                    </Button>
                                )}
                            </CommandEmpty>
                        )}
                        <CommandGroup>
                            {filteredOptions.map((opt, idx) => {
                                const itemKey = (opt.value != null && opt.value !== "") ? opt.value : `opt-${idx}`;
                                const searchValue = `${opt.label} ${opt.value ?? ""}`;
                                return (
                                    <CommandItem
                                        key={itemKey}
                                        value={searchValue}
                                        onSelect={() => {
                                            onValueChange(opt.value);
                                            setOpen(false);
                                            setSearchQuery("");
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4 shrink-0",
                                                value === opt.value ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        <div className="w-full truncate">
                                            {opt.labelNode || opt.label}
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
