"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
        <Combobox
          value={accountTitle || "All"}
          onValueChange={(val: any) => setAccountTitle(val === "All" ? "" : val)}
        >
          <ComboboxInput placeholder="Search title..." className="h-9 bg-background w-full" />
          <ComboboxContent>
            <ComboboxEmpty>No results found.</ComboboxEmpty>
            <ComboboxList>
              <ComboboxItem key="all" value="All">All</ComboboxItem>
              {accountTitlesLookup.map((title) => (
                <ComboboxItem key={title} value={title}>
                  {title}
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Account Type</label>
        <Select
          value={accountType || "all"}
          onValueChange={(val) => setAccountType(val === "all" ? "" : val)}
        >
          <SelectTrigger className="h-9 w-full bg-background">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {accountTypes.map((type) => (
              <SelectItem key={type.id} value={String(type.id)}>
                {type.account_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Balance Type</label>
        <Select
          value={balanceType || "all"}
          onValueChange={(val) => setBalanceType(val === "all" ? "" : val)}
        >
          <SelectTrigger className="h-9 w-full bg-background">
            <SelectValue placeholder="All balances" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All balances</SelectItem>
            {balanceTypes.map((type) => (
              <SelectItem key={type.id} value={String(type.id)}>
                {type.balance_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-end gap-2 w-full">
        <Button variant="outline" onClick={clearFilters} className="h-9 w-full cursor-pointer lg:w-auto">
          Clear
        </Button>
        <Button onClick={applyFilters} className="h-9 w-full cursor-pointer lg:w-auto">
          Apply Filters
        </Button>
      </div>
    </div>
  );
}
