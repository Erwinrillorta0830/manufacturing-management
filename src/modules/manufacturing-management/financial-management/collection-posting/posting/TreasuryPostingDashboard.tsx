"use client";

import React, {useEffect, useState} from "react";
import {
    AlertTriangle,
    Calendar as CalendarIcon,
    Check,
    ChevronsLeft,
    ChevronsRight,
    ChevronsUpDown,
    FilterX,
    Layers,
    Loader2,
    Search,
} from "lucide-react";
import {usePosting, type PostingQueueItem, type PostingSortField} from "./hooks/usePosting";
import {Header} from "./components/Header";
import {QueueTable} from "./components/QueueTable";
import {ReviewSheet} from "./components/ReviewSheet";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command";
import {cn} from "@/lib/utils";

interface TreasuryPostingDashboardProps {
    currentUser: {
        name: string;
        email: string;
        avatar: string;
        id: string;
    };
}

export default function TreasuryPostingDashboard({}: TreasuryPostingDashboardProps) {
    const {
        queue,
        isLoading,
        isFetching,
        queueError,
        options,
        query,
        updateQuery,
        totalElements,
        totalPages,
        currentPage,
        refreshQueue,
        selectedPouch,
        detailError,
        isLoadingDetails,
        isReviewSheetOpen,
        setIsReviewSheetOpen,
        openReviewSheet,
        handlePostPouch,
        isPosting,
        companyProfile,
        companyProfileStatus,
    } = usePosting();

    const [searchInput, setSearchInput] = useState(query.search);
    const [salesmanOpen, setSalesmanOpen] = useState(false);
    const [cashierOpen, setCashierOpen] = useState(false);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            if (searchInput !== query.search) updateQuery({search: searchInput, page: 1});
        }, 300);

        return () => window.clearTimeout(timeout);
    }, [query.search, searchInput, updateQuery]);

    const updateFilter = (patch: Partial<typeof query>) => updateQuery({...patch, page: 1});

    const handleSort = (field: keyof PostingQueueItem) => {
        const sortField = field as PostingSortField;
        updateQuery({
            sortField,
            sortDir: query.sortField === sortField && query.sortDir === "asc" ? "desc" : "asc",
            page: 1,
        });
    };

    const clearFilters = () => {
        setSearchInput("");
        updateQuery({
            search: "",
            operation: "all",
            salesman: "all",
            cashier: "all",
            dateFrom: "",
            dateTo: "",
            page: 1,
        });
    };

    const firstResult = totalElements === 0 ? 0 : (currentPage - 1) * query.size + 1;
    const lastResult = Math.min(currentPage * query.size, totalElements);
    const hasOperationTabs = options.operations.length > 0 || totalElements > 0;

    if (isLoading && queue.length === 0) {
        return (
            <div className="p-10 flex flex-col items-center justify-center text-muted-foreground min-h-[50vh] gap-4">
                <Loader2 className="animate-spin" size={32}/>
                <span className="font-black uppercase tracking-widest text-xs">Loading Audit Queue...</span>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <Header onRefresh={() => void refreshQueue()}/>

            <div className="bg-card border border-border p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary"/>

                <div className="relative xl:col-span-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14}/>
                    <Input
                        placeholder="Search Doc No or Amount..."
                        value={searchInput}
                        onChange={event => setSearchInput(event.target.value)}
                        className="h-9 pl-9 bg-background text-xs font-bold shadow-inner"
                    />
                </div>

                <div className="relative xl:col-span-2">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14}/>
                    <Input
                        type="date"
                        value={query.dateFrom}
                        onChange={event => updateFilter({dateFrom: event.target.value})}
                        className="h-9 pl-9 bg-background text-xs font-bold shadow-inner text-muted-foreground"
                    />
                </div>

                <div className="relative xl:col-span-2">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14}/>
                    <Input
                        type="date"
                        value={query.dateTo}
                        onChange={event => updateFilter({dateTo: event.target.value})}
                        className="h-9 pl-9 bg-background text-xs font-bold shadow-inner text-muted-foreground"
                    />
                </div>

                <Popover open={salesmanOpen} onOpenChange={setSalesmanOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="h-9 justify-between text-xs font-bold bg-background xl:col-span-2 text-muted-foreground truncate">
                            <span className="truncate">{query.salesman === "all" ? "All Route Codes" : query.salesman}</span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search code..." className="text-xs"/>
                            <CommandList className="max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-foreground/20">
                                <CommandEmpty>No route found.</CommandEmpty>
                                <CommandGroup>
                                    <CommandItem onSelect={() => {updateFilter({salesman: "all"}); setSalesmanOpen(false);}} className="text-xs font-bold">
                                        <Check className={cn("mr-2 h-4 w-4", query.salesman === "all" ? "opacity-100 text-primary" : "opacity-0")}/>
                                        All Route Codes
                                    </CommandItem>
                                    {options.salesmen.map(salesman => (
                                        <CommandItem key={salesman} onSelect={() => {updateFilter({salesman}); setSalesmanOpen(false);}} className="text-xs font-bold">
                                            <Check className={cn("mr-2 h-4 w-4", query.salesman === salesman ? "opacity-100 text-primary" : "opacity-0")}/>
                                            {salesman}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                <Popover open={cashierOpen} onOpenChange={setCashierOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="h-9 justify-between text-xs font-bold bg-background xl:col-span-2 text-muted-foreground truncate">
                            <span className="truncate">{query.cashier === "all" ? "All Cashiers" : query.cashier}</span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search cashier..." className="text-xs"/>
                            <CommandList className="max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-foreground/20">
                                <CommandEmpty>No cashier found.</CommandEmpty>
                                <CommandGroup>
                                    <CommandItem onSelect={() => {updateFilter({cashier: "all"}); setCashierOpen(false);}} className="text-xs font-bold">
                                        <Check className={cn("mr-2 h-4 w-4", query.cashier === "all" ? "opacity-100 text-primary" : "opacity-0")}/>
                                        All Cashiers
                                    </CommandItem>
                                    {options.cashiers.map(cashier => (
                                        <CommandItem key={cashier} onSelect={() => {updateFilter({cashier}); setCashierOpen(false);}} className="text-xs font-bold">
                                            <Check className={cn("mr-2 h-4 w-4", query.cashier === cashier ? "opacity-100 text-primary" : "opacity-0")}/>
                                            {cashier}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                <Button variant="ghost" size="icon" onClick={clearFilters} className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors xl:col-span-1 ml-auto" title="Clear Filters">
                    <FilterX size={16}/>
                </Button>
            </div>

            {queueError && (
                <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                    <div className="flex items-center gap-3 text-sm font-semibold">
                        <AlertTriangle size={18} className="shrink-0"/>
                        <span>{queueError}</span>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => void refreshQueue()} className="shrink-0">Retry</Button>
                </div>
            )}

            {hasOperationTabs && (
                <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
                    <div className="flex items-center gap-2 text-muted-foreground pr-2 border-r border-border shrink-0">
                        <Layers size={16}/>
                        <span className="text-[10px] font-black uppercase tracking-widest">Filter by Operation:</span>
                    </div>

                    <Button
                        variant={query.operation === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateFilter({operation: "all"})}
                        className="rounded-full h-8 text-xs font-bold tracking-wide shrink-0 transition-all"
                    >
                        All Operations ({totalElements})
                    </Button>

                    {options.operations.map(operation => (
                        <Button
                            key={operation}
                            variant={query.operation === operation ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateFilter({operation})}
                            className={`rounded-full h-8 text-xs font-bold tracking-wide shrink-0 transition-all ${query.operation !== operation ? "bg-background hover:bg-muted text-muted-foreground" : ""}`}
                        >
                            {operation}
                        </Button>
                    ))}
                </div>
            )}

            <div className="relative">
                <QueueTable
                    queue={queue}
                    onReview={openReviewSheet}
                    sortField={query.sortField}
                    sortDir={query.sortDir}
                    onSort={handleSort}
                />
                {isFetching && !isLoading && (
                    <div className="absolute inset-0 flex items-start justify-center pt-8 bg-background/35 pointer-events-none">
                        <div className="rounded-full bg-card border border-border shadow-sm px-3 py-2 flex items-center gap-2 text-xs font-bold text-muted-foreground">
                            <Loader2 size={14} className="animate-spin"/> Updating queue...
                        </div>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="font-semibold">Showing {firstResult}-{lastResult} of {totalElements}</span>
                <div className="flex items-center gap-2">
                    <label htmlFor="posting-page-size" className="font-semibold">Rows</label>
                    <select
                        id="posting-page-size"
                        value={query.size}
                        onChange={event => updateQuery({size: Number(event.target.value), page: 1})}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-semibold"
                    >
                        {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
                    </select>
                    <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1 || isFetching} onClick={() => updateQuery({page: currentPage - 1})}>
                        <ChevronsLeft size={14}/>
                        <span className="sr-only">Previous page</span>
                    </Button>
                    <span className="min-w-24 text-center font-semibold">Page {currentPage} of {Math.max(totalPages, 1)}</span>
                    <Button type="button" variant="outline" size="sm" disabled={totalPages === 0 || currentPage >= totalPages || isFetching} onClick={() => updateQuery({page: currentPage + 1})}>
                        <ChevronsRight size={14}/>
                        <span className="sr-only">Next page</span>
                    </Button>
                </div>
            </div>

            <ReviewSheet
                isOpen={isReviewSheetOpen}
                onOpenChange={setIsReviewSheetOpen}
                isLoading={isLoadingDetails}
                error={detailError}
                pouch={selectedPouch}
                isPosting={isPosting}
                onPost={handlePostPouch}
                companyProfile={companyProfile}
                companyProfileStatus={companyProfileStatus}
            />
        </div>
    );
}
