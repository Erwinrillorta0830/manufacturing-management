'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  Check,
  ChevronsUpDown,
  Search,
  Plus,
  Tag,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { MMBatchOnhand } from '../services/lot-tracking.service';
import { QAStatus } from '../types/lot-tracking.types';

export interface BatchComboboxProps {
  value: string;
  onSelectBatch: (
    batchNo: string,
    meta?: {
      inventoryLotId?: number;
      mfgDate?: string | null;
      expDate?: string | null;
      qaStatus?: QAStatus;
      onhandQuantity?: number;
    }
  ) => void;
  existingBatches: MMBatchOnhand[];
  disabledBatchNumbers?: string[];
  productUomName?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function BatchCombobox({
  value,
  onSelectBatch,
  existingBatches = [],
  disabledBatchNumbers = [],
  productUomName = 'units',
  placeholder = 'Search or select batch...',
  disabled = false,
  className,
}: BatchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const disabledSet = useMemo(() => {
    return new Set(
      disabledBatchNumbers.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean)
    );
  }, [disabledBatchNumbers]);

  // Find if currently selected value matches an existing batch record
  const matchingExisting = useMemo(() => {
    if (!value || !value.trim()) return undefined;
    const clean = value.trim().toLowerCase();
    return existingBatches.find(
      (b) => String(b.batchNo || '').trim().toLowerCase() === clean
    );
  }, [value, existingBatches]);

  // Filter existing batches based on search query and excluded sibling selections
  const filteredBatches = useMemo(() => {
    const currentValClean = String(value || '').trim().toLowerCase();
    const available = existingBatches.filter((b) => {
      // Exclude batches that have zero on-hand quantity (only show batches with active stock > 0 or deficit < 0)
      const qty = Number(b.onhandQuantity ?? 0);
      if (qty === 0) {
        return false;
      }

      const bNoClean = String(b.batchNo || '').trim().toLowerCase();
      // Allow if it's the current selected value of this input, otherwise exclude if in disabledSet
      if (bNoClean !== currentValClean && disabledSet.has(bNoClean)) {
        return false;
      }
      return true;
    });

    if (!search.trim()) return available;
    const q = search.toLowerCase().trim();
    return available.filter(
      (b) =>
        String(b.batchNo || '').toLowerCase().includes(q) ||
        (b.inventoryCondition && b.inventoryCondition.toLowerCase().includes(q))
    );
  }, [existingBatches, disabledSet, search, value]);

  const exactMatchExists = useMemo(() => {
    if (!search.trim()) return false;
    const q = search.trim().toLowerCase();
    return filteredBatches.some(
      (b) => String(b.batchNo || '').trim().toLowerCase() === q
    );
  }, [filteredBatches, search]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearch('');
    }
  };

  const handleSelectExisting = (batch: MMBatchOnhand) => {
    const rawQA = String(batch.inventoryCondition || 'GOOD').toUpperCase();
    const parsedQA: QAStatus =
      rawQA === 'DAMAGED' || rawQA === 'QUARANTINED' || rawQA === 'EXPIRED'
        ? rawQA
        : 'GOOD';

    onSelectBatch(batch.batchNo, {
      inventoryLotId: batch.inventoryLotId ? Number(batch.inventoryLotId) : undefined,
      mfgDate: batch.manufacturingDate ? String(batch.manufacturingDate).substring(0, 10) : null,
      expDate: batch.expirationDate ? String(batch.expirationDate).substring(0, 10) : null,
      qaStatus: parsedQA,
      onhandQuantity: Number(batch.onhandQuantity || 0),
    });

    setOpen(false);
    setSearch('');
    setIsCustomMode(false);
  };

  const handleUseNewBatch = (newBatchNo: string) => {
    const trimmed = newBatchNo.trim();
    if (!trimmed) return;

    // Safeguard: Check if this "new" batch actually exists in existingBatches
    const matched = existingBatches.find(
      (b) => String(b.batchNo || '').trim().toLowerCase() === trimmed.toLowerCase()
    );

    if (matched) {
      handleSelectExisting(matched);
      return;
    }

    onSelectBatch(trimmed, { inventoryLotId: undefined });
    setOpen(false);
    setSearch('');
    setIsCustomMode(false);
  };

  const handleSwitchToCustom = () => {
    setIsCustomMode(true);
    setOpen(false);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };

  // If in custom direct typing mode, render full editable input with a switch button
  if (isCustomMode) {
    return (
      <div className={cn('relative flex items-center w-full', className)}>
        <Input
          ref={inputRef}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const val = e.target.value;
            // Safeguard: Check if typed text matches an existing batch record
            const matched = existingBatches.find(
              (b) => String(b.batchNo || '').trim().toLowerCase() === val.trim().toLowerCase()
            );
            if (matched) {
              const rawQA = String(matched.inventoryCondition || 'GOOD').toUpperCase();
              const parsedQA: QAStatus =
                rawQA === 'DAMAGED' || rawQA === 'QUARANTINED' || rawQA === 'EXPIRED'
                  ? rawQA
                  : 'GOOD';
              onSelectBatch(val, {
                inventoryLotId: matched.inventoryLotId ? Number(matched.inventoryLotId) : undefined,
                mfgDate: matched.manufacturingDate ? String(matched.manufacturingDate).substring(0, 10) : null,
                expDate: matched.expirationDate ? String(matched.expirationDate).substring(0, 10) : null,
                qaStatus: parsedQA,
                onhandQuantity: Number(matched.onhandQuantity || 0),
              });
            } else {
              onSelectBatch(val, { inventoryLotId: undefined });
            }
          }}
          placeholder="Type batch number..."
          className="h-9 text-xs font-medium pr-16"
        />
        <div className="absolute right-1 flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsCustomMode(false)}
            className="h-7 px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
            title="Switch back to Batch Selector Combobox"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Select</span>
          </Button>
        </div>
      </div>
    );
  }

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
            'w-full justify-between text-left font-normal h-9 px-2.5 text-xs bg-background hover:bg-muted/30 border-input cursor-pointer gap-2',
            !value && 'text-muted-foreground',
            matchingExisting && Number(matchingExisting.onhandQuantity) < 0 && 'border-sky-500/50 ring-1 ring-sky-500/20',
            className
          )}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
            <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate font-semibold text-foreground">
              {value || placeholder}
            </span>
          </div>
          {matchingExisting && (
            <span
              className={cn(
                'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0',
                Number(matchingExisting.onhandQuantity) < 0
                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                  : 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              )}
            >
              {Number(matchingExisting.onhandQuantity) < 0
                ? `${matchingExisting.onhandQuantity} ${productUomName}`
                : `${matchingExisting.onhandQuantity} ${productUomName}`}
            </span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[280px] max-w-[360px] p-0 shadow-xl border-border bg-popover z-[9999] overscroll-contain"
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={false} className="w-full">
          {/* SEARCH INPUT */}
          <div className="flex items-center border-b border-border px-2.5 py-1">
            <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            <input
              placeholder="Search or type batch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim()) {
                  e.preventDefault();
                  handleUseNewBatch(search.trim());
                }
              }}
              className="flex h-8 w-full rounded-md bg-transparent py-1 text-xs outline-none placeholder:text-muted-foreground font-medium"
            />
          </div>

          <CommandList className="max-h-64 overflow-y-auto overscroll-contain p-1">
            {/* EXISTING BATCHES GROUP */}
            {filteredBatches.length > 0 && (
              <CommandGroup heading={<span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Existing Batches</span>}>
                {filteredBatches.map((b, bIdx) => {
                  const isSelected = value.trim().toLowerCase() === String(b.batchNo || '').trim().toLowerCase();
                  const isDeficit = Number(b.onhandQuantity) < 0;

                  return (
                    <CommandItem
                      key={`batch-opt-${bIdx}`}
                      value={b.batchNo}
                      onSelect={() => handleSelectExisting(b)}
                      className={cn(
                        'flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-md transition-colors my-0.5',
                        isSelected ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted/60 text-foreground',
                        isDeficit && !isSelected && 'hover:bg-rose-500/5'
                      )}
                    >
                      <span className="font-mono font-bold text-foreground text-xs truncate mr-2">
                        {b.batchNo}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={cn(
                            'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border',
                            isDeficit
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40'
                              : 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                          )}
                        >
                          {isDeficit
                            ? `Deficit: ${b.onhandQuantity} ${productUomName}`
                            : `On-hand: ${b.onhandQuantity} ${productUomName}`}
                        </span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {filteredBatches.length === 0 && (
              <div className="py-3 text-center text-xs text-muted-foreground italic">
                {search.trim() ? `No batch matches "${search}"` : 'No batches in this lot.'}
              </div>
            )}

            <CommandSeparator className="my-1" />

            {/* ACTION TO USE CUSTOM SEARCH QUERY AS NEW BATCH */}
            {search.trim() && !exactMatchExists && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => handleUseNewBatch(search.trim())}
                  className="flex items-center gap-2 text-xs font-bold text-primary px-2.5 py-1.5 cursor-pointer rounded-md hover:bg-primary/10 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Use new: <strong className="font-mono text-foreground">&quot;{search.trim()}&quot;</strong></span>
                </CommandItem>
              </CommandGroup>
            )}

            {/* ACTION TO SWITCH TO FREE-TEXT INPUT */}
            <CommandGroup>
              <CommandItem
                onSelect={handleSwitchToCustom}
                className="flex items-center gap-2 text-xs font-semibold text-primary hover:text-primary px-2.5 py-1.5 cursor-pointer rounded-md hover:bg-primary/10 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Enter New Batch</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
