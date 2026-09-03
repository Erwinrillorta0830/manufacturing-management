"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountTypeRow, BalanceTypeRow } from "../types";

export default function ChartOfAccountsFilters(props: {
  glCode: string;
  setGlCode: (v: string) => void;
  accountTitle: string;
  setAccountTitle: (v: string) => void;
  accountType: string;
  setAccountType: (v: string) => void;
  balanceType: string;
  setBalanceType: (v: string) => void;

  accountTypes: AccountTypeRow[];
  balanceTypes: BalanceTypeRow[];
  accountTitlesLookup: string[];

  applyFilters: () => void;
  clearFilters: () => void;
}) {
  const {
    glCode,
    setGlCode,
    accountTitle,
    setAccountTitle,
    accountType,
    setAccountType,
    balanceType,
    setBalanceType,
    accountTypes,
    balanceTypes,
    accountTitlesLookup,
    applyFilters,
    clearFilters,
  } = props;

  const [openTitle, setOpenTitle] = React.useState(false);
  const [titleSearch, setTitleSearch] = React.useState("");

  const [openType, setOpenType] = React.useState(false);
  const [typeSearch, setTypeSearch] = React.useState("");

  const [openBal, setOpenBal] = React.useState(false);
  const [balSearch, setBalSearch] = React.useState("");

  const filteredTitles = React.useMemo(() => {
    if (!titleSearch) return accountTitlesLookup;
    return accountTitlesLookup.filter(t => t.toLowerCase().includes(titleSearch.toLowerCase()));
  }, [accountTitlesLookup, titleSearch]);

  const filteredTypes = React.useMemo(() => {
    if (!typeSearch) return accountTypes;
    return accountTypes.filter(t => t.account_name.toLowerCase().includes(typeSearch.toLowerCase()));
  }, [accountTypes, typeSearch]);

  const filteredBals = React.useMemo(() => {
    if (!balSearch) return balanceTypes;
    return balanceTypes.filter(t => t.balance_name.toLowerCase().includes(balSearch.toLowerCase()));
  }, [balanceTypes, balSearch]);

  const selectedTitleLabel = accountTitle || "All";
  const selectedTypeLabel = accountType ? accountTypes.find(t => String(t.id) === accountType)?.account_name || "All types" : "All types";
  const selectedBalLabel = balanceType ? balanceTypes.find(t => String(t.id) === balanceType)?.balance_name || "All balances" : "All balances";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5 items-end">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">GL Code</label>
        <Input
          value={glCode}
          onChange={(e) => setGlCode(e.target.value)}
          placeholder="Search GL Code..."
          className="h-9 bg-background"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Account Title</label>
        <Popover open={openTitle} onOpenChange={setOpenTitle}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="h-9 w-full justify-between bg-background font-normal px-3"
            >
              <span className="truncate">{selectedTitleLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search title..."
                value={titleSearch}
                onValueChange={setTitleSearch}
              />
              <CommandList className="max-h-[200px]">
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setAccountTitle("");
                      setOpenTitle(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        !accountTitle ? "opacity-100" : "opacity-0"
                      )}
                    />
                    All
                  </CommandItem>
                  {filteredTitles.map((title) => (
                    <CommandItem
                      key={title}
                      onSelect={() => {
                        setAccountTitle(title);
                        setOpenTitle(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          accountTitle === title ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {title}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Account Type</label>
        <Popover open={openType} onOpenChange={setOpenType}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="h-9 w-full justify-between bg-background font-normal px-3"
            >
              <span className="truncate">{selectedTypeLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search type..."
                value={typeSearch}
                onValueChange={setTypeSearch}
              />
              <CommandList className="max-h-[200px]">
                <CommandEmpty>No types found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setAccountType("");
                      setOpenType(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        !accountType ? "opacity-100" : "opacity-0"
                      )}
                    />
                    All types
                  </CommandItem>
                  {filteredTypes.map((type) => (
                    <CommandItem
                      key={type.id}
                      onSelect={() => {
                        setAccountType(String(type.id));
                        setOpenType(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          accountType === String(type.id) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {type.account_name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Balance Type</label>
        <Popover open={openBal} onOpenChange={setOpenBal}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="h-9 w-full justify-between bg-background font-normal px-3"
            >
              <span className="truncate">{selectedBalLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search balance..."
                value={balSearch}
                onValueChange={setBalSearch}
              />
              <CommandList className="max-h-[200px]">
                <CommandEmpty>No balances found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setBalanceType("");
                      setOpenBal(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        !balanceType ? "opacity-100" : "opacity-0"
                      )}
                    />
                    All balances
                  </CommandItem>
                  {filteredBals.map((type) => (
                    <CommandItem
                      key={type.id}
                      onSelect={() => {
                        setBalanceType(String(type.id));
                        setOpenBal(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          balanceType === String(type.id) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {type.balance_name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center justify-end gap-2 w-full">
        <Button variant="outline" onClick={() => {
            clearFilters();
            setTitleSearch("");
            setTypeSearch("");
            setBalSearch("");
        }} className="h-9 w-full cursor-pointer lg:w-auto">
          Clear
        </Button>
        <Button onClick={applyFilters} className="h-9 w-full cursor-pointer lg:w-auto">
          Apply Filters
        </Button>
      </div>
    </div>
  );
}
