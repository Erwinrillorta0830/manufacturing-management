"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
  badgeClassName?: string;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  disabled = false,
  className,
  triggerClassName,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedOption = React.useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(q))
    );
  }, [options, search]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearch("");
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between text-left font-normal h-9 px-3 text-xs bg-background hover:bg-muted/30 border-input",
            !value && "text-muted-foreground",
            triggerClassName,
            className
          )}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[280px] p-0 shadow-xl border-border bg-popover z-50 overscroll-contain"
        align="start"
        sideOffset={4}
        data-radix-scroll-lock-ignore="true"
        onWheelCapture={(e) => e.stopPropagation()}
        onTouchMoveCapture={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} className="w-full">
          <div className="flex items-center border-b border-border px-2.5">
            <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            <input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-9 w-full rounded-md bg-transparent py-2 text-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <CommandList
            className="max-h-64 overflow-y-auto overscroll-contain p-1 touch-pan-y"
            data-radix-scroll-lock-ignore="true"
            onWheelCapture={(e) => e.stopPropagation()}
            onTouchMoveCapture={(e) => e.stopPropagation()}
          >
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground italic">
                {emptyMessage}
              </div>
            ) : (
              <CommandGroup>
                {filteredOptions.map((opt) => {
                  const isSelected = value === opt.value;
                  return (
                    <CommandItem
                      key={opt.value}
                      value={opt.value}
                      onSelect={() => {
                        onValueChange(opt.value);
                        setOpen(false);
                        setSearch("");
                      }}
                      className={cn(
                        "flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-md transition-colors",
                        isSelected
                          ? "bg-primary/10 text-primary font-bold"
                          : "hover:bg-muted/60 text-foreground"
                      )}
                    >
                      <div className="flex items-center justify-between w-full min-w-0 pr-2 gap-2">
                        <div className="flex flex-col truncate">
                          <span className="truncate">{opt.label}</span>
                          {opt.subLabel && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {opt.subLabel}
                            </span>
                          )}
                        </div>
                        {opt.badge && (
                          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0", opt.badgeClassName)}>
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          isSelected ? "opacity-100 text-primary" : "opacity-0"
                        )}
                      />
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
