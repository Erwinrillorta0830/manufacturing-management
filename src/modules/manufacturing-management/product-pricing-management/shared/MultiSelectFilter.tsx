"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, X } from "lucide-react";

export type MultiSelectOption = {
    id: string;
    label: string;
    search?: string;
};

export function toggleMultiSelectId(list: string[], id: string): string[] {
    if (list.includes(id)) return list.filter((x) => x !== id);
    return [...list, id];
}

export function labelCount(title: string, count: number, emptyLabel: string): string {
    if (count <= 0) return emptyLabel;
    return `${title} (${count})`;
}

export function FilterField(props: {
    label: string;
    helper?: string;
    children: React.ReactNode;
    className?: string;
}) {
    const { label, helper, children, className } = props;

    return (
        <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
            <Label className="text-xs font-medium text-foreground">{label}</Label>
            {children}
            {helper ? <p className="text-[11px] leading-snug text-muted-foreground">{helper}</p> : null}
        </div>
    );
}

export function MultiSelectFilter(props: {
    label: string;
    helper?: string;
    triggerLabel: string;
    searchPlaceholder: string;
    emptyText: string;
    groupLabel: string;
    options: MultiSelectOption[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    clearTitle: string;
    footer?: React.ReactNode;
    limit?: number;
    contentMaxWidth?: string;
    className?: string;
    disabled?: boolean;
}) {
    const {
        label,
        helper,
        triggerLabel,
        searchPlaceholder,
        emptyText,
        groupLabel,
        options,
        selectedIds,
        onChange,
        clearTitle,
        footer,
        limit = 140,
        contentMaxWidth = "max-w-[360px]",
        className,
        disabled = false,
    } = props;

    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");

    const filteredOptions = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        const source = q
            ? options.filter((option) => {
                const search = `${option.label} ${option.id} ${option.search ?? ""}`.toLowerCase();
                return search.includes(q);
            })
            : options;

        return source.slice(0, limit);
    }, [limit, options, query]);

    return (
        <FilterField label={label} helper={helper} className={className}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="h-10 w-full justify-between gap-2 bg-background px-3 shadow-none"
                        type="button"
                        disabled={disabled}
                    >
                        <span className="truncate">{triggerLabel}</span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent
                    className={cn("w-[calc(100vw-2rem)] p-0", contentMaxWidth)}
                    align="start"
                >
                    <Command shouldFilter={false}>
                        <div className="flex items-center gap-2 px-2 pt-2">
                            <CommandInput
                                placeholder={searchPlaceholder}
                                value={query}
                                onValueChange={setQuery}
                            />
                            {selectedIds.length > 0 ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => onChange([])}
                                    title={clearTitle}
                                    type="button"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            ) : null}
                        </div>

                        <CommandList>
                            <CommandEmpty>{emptyText}</CommandEmpty>
                            <CommandGroup heading={groupLabel}>
                                {filteredOptions.map((option) => {
                                    const selected = selectedIds.includes(option.id);

                                    return (
                                        <CommandItem
                                            key={option.id}
                                            value={`${option.label} ${option.id}`}
                                            onSelect={() => onChange(toggleMultiSelectId(selectedIds, option.id))}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    selected ? "opacity-100" : "opacity-0",
                                                )}
                                            />
                                            <span className="truncate">{option.label}</span>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>

                    {footer ? <div className="border-t px-3 py-2 text-xs text-muted-foreground">{footer}</div> : null}
                </PopoverContent>
            </Popover>
        </FilterField>
    );
}
