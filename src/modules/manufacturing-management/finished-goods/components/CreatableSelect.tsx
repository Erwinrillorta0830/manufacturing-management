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
    options: { value: string; label: string; disabled?: boolean; labelNode?: React.ReactNode; triggerNode?: React.ReactNode }[];
    value?: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    disabled?: boolean;
    isLoading?: boolean;
    className?: string;
    id?: string;
    "aria-label"?: string;
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
    searchPlaceholder,
    disabled = false,
    isLoading = false,
    className,
    id,
    "aria-label": ariaLabel,
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
                        aria-label={ariaLabel}
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
                        aria-label={ariaLabel}
                        aria-invalid={ariaInvalid}
                        aria-describedby={ariaDescribedBy}
                        className={cn("w-full justify-between", !value && "text-muted-foreground", className)}
                        disabled={disabled}
                        onKeyDown={onKeyDown}
                        data-index={dataIndex}
                    >
                        <span className="truncate w-full text-left flex items-center">
                            {isLoading && !selectedOption ? (
                                <span className="inline-flex items-center gap-2 text-muted-foreground animate-pulse">
                                    <span className="h-3 w-32 bg-muted-foreground/20 rounded inline-block" />
                                </span>
                            ) : selectedOption ? (
                                selectedOption.triggerNode || selectedOption.labelNode || selectedOption.label
                            ) : (
                                placeholder
                            )}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
            )}
            <PopoverContent
                className={cn("w-[--radix-popover-trigger-width] p-0 shadow-lg border", popoverClassName)}
                align="start"
                onOpenAutoFocus={variant === "inline" ? (e) => e.preventDefault() : undefined}
            >
                <Command shouldFilter={false}>
                    {variant !== "inline" && (
                        <CommandInput
                            placeholder={searchPlaceholder || `Search ${placeholder.toLowerCase().replace(/^(select or search|select|search)\s*/i, "")}...`}
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                        />
                    )}
                    <CommandList>
                        {isLoading ? (
                            <div className="p-2.5 space-y-2" role="status" aria-label="Loading options">
                                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 animate-pulse">
                                    <div className="h-4 w-4 rounded-full bg-muted-foreground/20 shrink-0" />
                                    <div className="flex-1 space-y-1.5 min-w-0">
                                        <div className="h-3.5 w-3/4 bg-muted-foreground/20 rounded" />
                                        <div className="h-2.5 w-1/2 bg-muted-foreground/15 rounded" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 animate-pulse">
                                    <div className="h-4 w-4 rounded-full bg-muted-foreground/20 shrink-0" />
                                    <div className="flex-1 space-y-1.5 min-w-0">
                                        <div className="h-3.5 w-2/3 bg-muted-foreground/20 rounded" />
                                        <div className="h-2.5 w-1/3 bg-muted-foreground/15 rounded" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 animate-pulse">
                                    <div className="h-4 w-4 rounded-full bg-muted-foreground/20 shrink-0" />
                                    <div className="flex-1 space-y-1.5 min-w-0">
                                        <div className="h-3.5 w-4/5 bg-muted-foreground/20 rounded" />
                                        <div className="h-2.5 w-2/5 bg-muted-foreground/15 rounded" />
                                    </div>
                                </div>
                            </div>
                        ) : filteredOptions.length === 0 ? (
                            <CommandEmpty className="py-3 px-3 text-xs flex flex-col gap-2 text-center text-muted-foreground">
                                <span>No results found.</span>
                                {onCreateOption && searchQuery.trim() !== "" && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        className="w-full text-[10px] inline-flex items-center gap-1 justify-center py-1 h-auto cursor-pointer"
                                        onClick={handleCreate}
                                    >
                                        <Plus className="h-3 w-3" /> Create &quot;{searchQuery}&quot;
                                    </Button>
                                )}
                            </CommandEmpty>
                        ) : (
                            <CommandGroup>
                                {filteredOptions.map((opt, idx) => {
                                    const itemKey = (opt.value != null && opt.value !== "") ? opt.value : `opt-${idx}`;
                                    const searchValue = `${opt.label} ${opt.value ?? ""}`;
                                    return (
                                        <CommandItem
                                            key={itemKey}
                                            value={searchValue}
                                            disabled={opt.disabled}
                                            onSelect={() => {
                                                if (opt.disabled) return;
                                                onValueChange(opt.value);
                                                setOpen(false);
                                                setSearchQuery("");
                                            }}
                                            className={cn(opt.disabled && "opacity-50 cursor-not-allowed pointer-events-none")}
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
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
