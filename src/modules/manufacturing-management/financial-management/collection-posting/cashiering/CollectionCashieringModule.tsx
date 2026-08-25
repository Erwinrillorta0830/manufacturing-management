"use client";

import React, {useCallback, useState} from "react";
import {useDebounce} from "use-debounce";
import {Plus, Search, Filter, RefreshCcw, ChevronsUpDown, Check as CheckIcon, FilterX, AlertTriangle} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command";
import {CashieringListQuery, useCashiering} from "./hooks/useCashiering";
import CashieringSheet from "./components/CashieringSheet";
import CashieringMasterList from "./components/CashieringMasterList";
import {CollectionSummary, CurrentUser} from "./../types";
import {cn} from "@/lib/utils";

interface ModuleProps {
    currentUser: CurrentUser;
}

export default function CollectionCashieringModule({currentUser}: ModuleProps) {
    const [showFilters, setShowFilters] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const [searchQuery] = useDebounce(searchInput, 300);
    const [salesmanFilter, setSalesmanFilter] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [sortField, setSortField] = useState<keyof CollectionSummary>("encodedDate");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [refreshKey, setRefreshKey] = useState(0);
    const [openSalesmanFilter, setOpenSalesmanFilter] = useState(false);

    const handleCreated = useCallback(() => {
        setPage(1);
        setRefreshKey(previous => previous + 1);
    }, []);

    const listQuery: CashieringListQuery = {
        search: searchQuery,
        salesmanCode: salesmanFilter === "all" ? "" : salesmanFilter,
        dateFrom,
        dateTo,
        page,
        size: pageSize,
        sortField,
        sortDirection,
        refreshKey,
    };
    const state = useCashiering(currentUser, listQuery, handleCreated);

    const handleSort = (field: keyof CollectionSummary) => {
        setPage(1);
        if (sortField === field) {
            setSortDirection(previous => previous === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("asc");
        }
    };

    const clearFilters = () => {
        setSearchInput("");
        setSalesmanFilter("all");
        setDateFrom("");
        setDateTo("");
        setPage(1);
    };

    return (
        <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Collection Cashiering</h1>
                    <p className="text-sm text-muted-foreground">Receive and manage physical remittance pouches.</p>
                </div>
                <Button
                    onClick={() => {
                        state.resetForm();
                        state.setIsSheetOpen(true);
                        void state.loadModalLookups();
                    }}
                    className="gap-2 shadow-md bg-primary hover:bg-primary/90"
                >
                    <Plus size={16}/> Receive New Pouch
                </Button>
            </div>

            <div className="flex flex-col bg-card rounded-lg border border-border shadow-sm z-10 overflow-hidden">
                <div className="flex flex-col sm:flex-row items-center justify-between p-2 gap-2">
                    <div className="flex items-center flex-1 w-full relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/>
                        <Input
                            placeholder="Search by CP number or collector..."
                            value={searchInput}
                            onChange={event => {
                                setSearchInput(event.target.value);
                                setPage(1);
                            }}
                            className="pl-9 h-9 text-xs font-bold uppercase bg-transparent border-none shadow-none focus-visible:ring-0 w-full"
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Button variant={showFilters ? "secondary" : "ghost"} size="sm" onClick={() => setShowFilters(!showFilters)} className="h-9 text-[10px] font-bold uppercase tracking-widest">
                            <Filter className="w-3.5 h-3.5 mr-2"/> {showFilters ? "Hide Filters" : "Advanced Filters"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-[10px] font-bold uppercase tracking-widest">
                            <FilterX size={14} className="mr-2"/> Clear Filters
                        </Button>
                        <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => void state.refreshList()}>
                            <RefreshCcw size={14} className={state.isLoading ? "animate-spin" : ""}/>
                        </Button>
                    </div>
                </div>

                <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-4 pb-4 border-t border-border pt-4 transition-all duration-300", showFilters ? "block animate-in fade-in slide-in-from-top-2" : "hidden")}>
                    <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Collector</Label>
                        <Popover open={openSalesmanFilter} onOpenChange={setOpenSalesmanFilter}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" aria-expanded={openSalesmanFilter} className="w-full h-8 text-xs font-medium justify-between border-input bg-background hover:bg-muted px-2">
                                    <span className="truncate text-foreground">
                                        {salesmanFilter === "all" ? "All Collectors" : `${state.salesmen.find(s => s.salesmanCode === salesmanFilter)?.salesmanName || salesmanFilter} (${salesmanFilter})`}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50"/>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[300px] p-0 shadow-lg border-border" align="start">
                                <Command>
                                    <CommandInput placeholder="Type to filter..." className="h-8 text-xs"/>
                                    <CommandList className="max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-foreground/20">
                                        <CommandEmpty>No collector found.</CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem onSelect={() => { setSalesmanFilter("all"); setPage(1); setOpenSalesmanFilter(false); }} className="text-[10px] font-black uppercase text-muted-foreground cursor-pointer">-- All Collectors --</CommandItem>
                                            {state.salesmen.map(salesman => (
                                                <CommandItem key={salesman.id} value={salesman.salesmanName} onSelect={() => { setSalesmanFilter(salesman.salesmanCode); setPage(1); setOpenSalesmanFilter(false); }} className="text-xs font-medium cursor-pointer">
                                                    <CheckIcon className={cn("mr-2 h-4 w-4 text-primary", salesmanFilter === salesman.salesmanCode ? "opacity-100" : "opacity-0")}/>
                                                    {salesman.salesmanName} ({salesman.salesmanCode})
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-1.5 col-span-1 lg:col-span-2">
                        <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Date Range</Label>
                        <div className="flex items-center gap-1">
                            <Input type="date" className="h-8 text-xs font-medium bg-background border-input flex-1 px-1" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1); }}/>
                            <span className="text-[9px] font-black text-muted-foreground uppercase mx-1">TO</span>
                            <Input type="date" className="h-8 text-xs font-medium bg-background border-input flex-1 px-1" value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1); }}/>
                        </div>
                    </div>
                </div>
            </div>

            {state.listError && (
                <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                    <div className="flex items-start gap-3 text-sm font-semibold">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0"/>
                        <div className="space-y-1">
                            <p>{state.listError}</p>
                            {state.masterList.length > 0 && (
                                <p className="text-xs font-normal text-red-700/80 dark:text-red-300/80">
                                    The displayed results are from the last successful load and may not match the current filters.
                                </p>
                            )}
                        </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={state.isLoading} onClick={() => void state.refreshList()} className="shrink-0">
                        Retry
                    </Button>
                </div>
            )}

            <CashieringMasterList
                data={state.masterList}
                isLoading={state.isLoading}
                listError={state.listError}
                state={state}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
                currentPage={state.currentPage}
                totalElements={state.totalElements}
                totalPages={state.totalPages}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={nextSize => {
                    setPageSize(nextSize);
                    setPage(1);
                }}
            />

            <CashieringSheet state={state}/>
        </div>
    );
}
