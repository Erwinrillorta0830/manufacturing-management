"use client";

import React, { useState } from "react";
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

export interface Option {
  value: string | number;
  label: string;
  subLabel?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  options: Option[];
  value: string | number | null | undefined;
  onChange: (val: string | number) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  emptyText = "No items found.",
  disabled = false,
  className,
  triggerClassName,
}) => {
  const [open, setOpen] = useState(false);

  const selectedOption = options.find(
    (opt) => String(opt.value) === String(value)
  );

  return (
    <div className={cn("relative w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            title={
              selectedOption
                ? selectedOption.subLabel
                  ? `${selectedOption.label}\n${selectedOption.subLabel}`
                  : selectedOption.label
                : placeholder
            }
            className={cn(
              "w-full justify-between font-normal text-left h-9",
              !selectedOption && "text-muted-foreground",
              triggerClassName
            )}
          >
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) min-w-(--radix-popover-trigger-width) max-w-(--radix-popover-trigger-width) p-0"
          style={{ width: "var(--radix-popover-trigger-width)" }}
          align="start"
        >
          <Command className="w-full">
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList className="w-full">
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = String(option.value) === String(value);
                  return (
                    <CommandItem
                      key={String(option.value)}
                      value={`${option.label} ${option.subLabel || ""}`}
                      disabled={option.disabled}
                      onSelect={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      title={
                        option.subLabel
                          ? `${option.label}\n${option.subLabel}`
                          : option.label
                      }
                      className="cursor-pointer py-2 px-3 items-start"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0 mt-0.5",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                        <span className="text-sm font-medium leading-snug whitespace-normal break-words">
                          {option.label}
                        </span>
                        {option.subLabel && (
                          <span className="text-xs text-muted-foreground leading-snug whitespace-normal break-words">
                            {option.subLabel}
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
    </div>
  );
};
