"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus, X, Clock, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { parseDateTimeSafe } from "../utils/lib";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
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

export interface SelectOption {
  value: string;
  label: string;
}

// 1. Searchable Select for Department, Employee, etc.
export function AssetSearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  disabled = false,
  allowClear = false,
  className,
}: {
  options: SelectOption[];
  value?: string | number | null;
  onValueChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const stringVal = value !== undefined && value !== null ? String(value) : "";

  const selectedLabel = React.useMemo(() => {
    if (!stringVal || stringVal === "0") return "";
    return options.find((opt) => opt.value === stringVal)?.label || "";
  }, [options, stringVal]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal text-left h-10 px-3 bg-background border-input",
            !selectedLabel && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {allowClear && selectedLabel && (
              <span
                role="button"
                tabIndex={0}
                className="rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onValueChange("");
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0 z-[100] pointer-events-auto"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        align="start"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
          <CommandList
            className="max-h-[220px] overflow-y-auto overscroll-contain pointer-events-auto"
            onWheel={(e) => e.stopPropagation()}
          >
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem
                  value="__unassigned__"
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                  className="text-muted-foreground italic cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      !stringVal || stringVal === "0" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Unassigned / None
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      stringVal === opt.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// 2. Creatable & Searchable Select for Item Type, Classification, etc.
export function AssetCreatableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select or type new...",
  disabled = false,
  className,
}: {
  options: SelectOption[];
  value?: string | null;
  onValueChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const currentVal = value || "";

  const filteredOptions = React.useMemo(() => {
    if (!searchQuery.trim()) return options;
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(searchQuery.toLowerCase().trim())
    );
  }, [options, searchQuery]);

  const hasExactMatch = React.useMemo(() => {
    if (!searchQuery.trim()) return true;
    return options.some(
      (opt) => opt.label.toLowerCase() === searchQuery.toLowerCase().trim()
    );
  }, [options, searchQuery]);

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) setSearchQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal text-left h-10 px-3 bg-background border-input",
            !currentVal && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{currentVal || placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0 z-[100] pointer-events-auto"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        align="start"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Search or type new...`}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList
            className="max-h-[220px] overflow-y-auto overscroll-contain pointer-events-auto"
            onWheel={(e) => e.stopPropagation()}
          >
            {searchQuery.trim() && !hasExactMatch && (
              <div
                role="button"
                tabIndex={0}
                className="flex items-center gap-2 px-3 py-2 text-sm text-primary font-medium cursor-pointer hover:bg-accent border-b"
                onClick={() => {
                  onValueChange(searchQuery.trim());
                  setSearchQuery("");
                  setOpen(false);
                }}
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span>
                  Add <span className="font-bold">&quot;{searchQuery.trim()}&quot;</span> as new
                </span>
              </div>
            )}
            {filteredOptions.length === 0 && hasExactMatch && (
              <CommandEmpty>No options found.</CommandEmpty>
            )}
            <CommandGroup>
              {filteredOptions.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onValueChange(opt.value);
                    setSearchQuery("");
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      currentVal.toLowerCase() === opt.value.toLowerCase()
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// 3. Date & Time Picker for Acquisition Date/Time
export function AssetDateTimePicker({
  value,
  onValueChange,
  placeholder = "Pick date & time",
  disabled = false,
  className,
}: {
  value?: Date | string | null;
  onValueChange: (date: Date) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const dateObj = React.useMemo(() => {
    return parseDateTimeSafe(value);
  }, [value]);

  const timeStr = React.useMemo(() => {
    if (!dateObj) return "00:00";
    const hours = String(dateObj.getHours()).padStart(2, "0");
    const minutes = String(dateObj.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }, [dateObj]);

  const handleDateSelect = (selectedDay: Date | undefined) => {
    if (!selectedDay) return;
    const newDate = new Date(selectedDay);
    if (dateObj) {
      newDate.setHours(dateObj.getHours(), dateObj.getMinutes(), 0, 0);
    } else {
      const now = new Date();
      newDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
    }
    onValueChange(newDate);
  };

  const handleTimeChange = (newTimeStr: string) => {
    if (!newTimeStr) return;
    const [h, m] = newTimeStr.split(":").map(Number);
    const baseDate = dateObj ? new Date(dateObj) : new Date();
    baseDate.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
    onValueChange(baseDate);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between h-10 px-3 font-normal text-left bg-background border-input",
            !dateObj && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {dateObj ? format(dateObj, "MMM d, yyyy, h:mm a") : placeholder}
          </span>
          <div className="flex items-center gap-1 opacity-50 shrink-0 ml-2">
            <CalendarIcon className="h-4 w-4" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto z-[100]" align="start">
        <Calendar
          mode="single"
          selected={dateObj || undefined}
          onSelect={handleDateSelect}
          disabled={(date) => date > new Date()}
          captionLayout="dropdown"
          fromYear={1900}
          toYear={new Date().getFullYear()}
          autoFocus
        />
        <div className="flex items-center justify-between px-3 py-2.5 border-t gap-2 bg-muted/20">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>Time:</span>
          </div>
          <Input
            type="time"
            value={timeStr}
            onChange={(e) => handleTimeChange(e.target.value)}
            className="h-8 w-28 text-xs font-medium bg-background"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

