"use client";

import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    AlertTriangle, FilterX, CheckCircle2, Loader2, Hourglass, Search, Activity, ChevronRight, ChevronLeft,
    CircleDashed, ArrowUp, ArrowDown, ArrowUpDown, User, CalendarDays, Database, ChevronsUpDown, Check
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, isValid } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

import { useSettlementQueue } from "../hooks/useSettlementQueue";
import SettlementCommandCenter from "./SettlementCommandCenter";
import { useSearchParams } from "next/navigation";

const parseSpecificDate = (val: string | number[] | undefined | null): Date | null => {
    if (!val) return null;
    if (Array.isArray(val)) return new Date(val[0], val[1] - 1, val[2], val[3] || 0, val[4] || 0);
    const d = new Date(val as string | number);
    return isValid(d) ? d : null;
};

export default function SettlementMasterList() {
    const searchParams = useSearchParams();
    const qInvoiceNo = searchParams.get("invoiceNo");
    const qSalesman = searchParams.get("salesman");

    const [searchTerm, setSearchTerm] = useState("");
    const [debounceSearch, setDebounceSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [collectorFilter, setCollectorFilter] = useState("all");
    const [collectorOpen, setCollectorOpen] = useState(false);

    const [sortField, setSortField] = useState("collectionDate");
    const [sortDirection, setSortDirection] = useState("desc");

    const [page, setPage] = useState(1);
    const [size, setSize] = useState(15);

    const [isCommandCenterOpen, setIsCommandCenterOpen] = useState(false);
    const [selectedPouchId, setSelectedPouchId] = useState<number | null>(null);

    // 🚀 Server-Side Execution Hook
    const { data, isLoading, queueError, users, fetchQueue } = useSettlementQueue(
        debounceSearch, statusFilter, collectorFilter, page, size, sortField, sortDirection
    );

    const handleOpenSettlement = (id: number) => {
        setSelectedPouchId(id);
        setIsCommandCenterOpen(true);
    };

    // Auto-apply filters when redirected from AR
    React.useEffect(() => {
        if (qSalesman) {
            setSearchTerm(qSalesman);
            setDebounceSearch(qSalesman);
        }
    }, [qSalesman]);

    // Auto-open matching pending/in-progress pouch if it matches salesman
    React.useEffect(() => {
        if (!isLoading && qSalesman && data?.content && data.content.length > 0 && !isCommandCenterOpen && selectedPouchId === null) {
            const match = data.content.find(col => 
                (col.status === "Pending" || col.status === "In Progress") &&
                (col.salesmanName?.toLowerCase().includes(qSalesman.toLowerCase()) || 
                 col.collectedByName?.toLowerCase().includes(qSalesman.toLowerCase()))
            );
            if (match) {
                handleOpenSettlement(match.id);
            }
        }
    }, [isLoading, qSalesman, data, isCommandCenterOpen, selectedPouchId]);

    // Trigger debounced search
    React.useEffect(() => {
        const timeout = setTimeout(() => { setDebounceSearch(searchTerm); setPage(1); }, 400);
        return () => clearTimeout(timeout);
    }, [searchTerm]);

    const handleSort = (field: string) => {
        if (sortField === field) setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        else { setSortField(field); setSortDirection("desc"); }
        setPage(1);
    };

    return (
        <div className="h-[calc(100vh-80px)] flex flex-col bg-muted/10 p-4 space-y-4 overflow-hidden">
            {/* COMPACT SERVER HEADER */}
            <div className="bg-card border border-border p-3 rounded-xl shadow-sm flex flex-wrap gap-3 items-center shrink-0 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary" />

                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <Input placeholder="Search Doc No, CR No, or Route..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-9 pl-8 bg-background text-xs font-bold shadow-inner border-muted-foreground/20"/>
                </div>

                <div className="w-auto relative">
                    <Popover open={collectorOpen} onOpenChange={setCollectorOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={collectorOpen} className="h-9 bg-background text-xs font-bold border-muted-foreground/20 justify-between w-[190px]">
                                <div className="flex items-center truncate">
                                    <User size={12} className="mr-1.5 text-muted-foreground shrink-0" />
                                    <span className="truncate">{collectorFilter === "all" ? "All Remitters" : collectorFilter}</span>
                                </div>
                                <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[240px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search user..." className="h-9 text-xs" />
                                <CommandList className="max-h-[220px] overflow-y-auto scrollbar-thin">
                                    <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">No remitter found.</CommandEmpty>
                                    <CommandGroup>
                                        <CommandItem value="all" onSelect={() => { setCollectorFilter("all"); setCollectorOpen(false); setPage(1); }} className="text-xs cursor-pointer">
                                            <Check className={cn("mr-2 h-3 w-3", collectorFilter === "all" ? "opacity-100" : "opacity-0")} />
                                            All Remitters
                                        </CommandItem>
                                        {users.map(u => {
                                            const fullName = `${u.firstName} ${u.lastName}`.trim();
                                            return (
                                                <CommandItem key={u.id} value={fullName} onSelect={() => { setCollectorFilter(fullName); setCollectorOpen(false); setPage(1); }} className="text-xs cursor-pointer">
                                                    <Check className={cn("mr-2 h-3 w-3", collectorFilter.toUpperCase() === fullName.toUpperCase() ? "opacity-100" : "opacity-0")} />
                                                    {fullName}
                                                </CommandItem>
                                            );
                                        })}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="w-[140px] relative">
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                        <SelectTrigger className="h-9 bg-background text-xs font-bold border-muted-foreground/20"><Activity size={12} className="mr-1.5 text-muted-foreground" /><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="Pending">Pending</SelectItem><SelectItem value="In Progress">In Progress</SelectItem><SelectItem value="Balanced">Balanced</SelectItem></SelectContent>
                    </Select>
                </div>

                <Button variant="ghost" size="icon" onClick={() => { setSearchTerm(""); setDebounceSearch(""); setStatusFilter("all"); setCollectorFilter("all"); setPage(1); }} className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Clear Filters"><FilterX size={16}/></Button>
            </div>

            {queueError && (
                <div role="alert" aria-live="polite" className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                    <div className="flex items-start gap-3 text-sm font-semibold">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0"/>
                        <div className="space-y-1">
                            <p>{queueError}</p>
                            {data.content.length > 0 && (
                                <p className="text-xs font-normal text-red-700/80 dark:text-red-300/80">
                                    Showing the last successful results; they may be stale.
                                </p>
                            )}
                        </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={isLoading} onClick={() => void fetchQueue()} className="shrink-0">
                        Retry
                    </Button>
                </div>
            )}

            {/* SERVER LIST TABLE */}
            <div className="flex-1 bg-card rounded-xl border border-border shadow-md overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto scrollbar-thin relative">
                    <Table className="relative min-w-[950px]">
                        <TableHeader className="bg-muted/90 backdrop-blur-md sticky top-0 z-20 shadow-sm outline outline-1 outline-border">
                            <TableRow>
                                <TableHead className="font-black text-[10px] uppercase pl-6 py-3 cursor-pointer hover:bg-muted/80 whitespace-nowrap w-[140px]" onClick={() => handleSort("docNo")}>
                                    <div className="flex items-center gap-1"><span>Reference</span>{sortField === "docNo" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />}</div>
                                </TableHead>
                                <TableHead className="font-black text-[10px] uppercase cursor-pointer hover:bg-muted/80 whitespace-nowrap w-[200px]" onClick={() => handleSort("salesmanName")}>
                                    <div className="flex items-center gap-1"><span>Personnel</span>{sortField === "salesmanName" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />}</div>
                                </TableHead>
                                <TableHead className="font-black text-[10px] uppercase cursor-pointer hover:bg-muted/80 whitespace-nowrap w-[140px]" onClick={() => handleSort("collectionDate")}>
                                    <div className="flex items-center gap-1"><span>Collected</span>{sortField === "collectionDate" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />}</div>
                                </TableHead>
                                <TableHead className="font-black text-[10px] uppercase cursor-pointer hover:bg-muted/80 whitespace-nowrap w-[140px]" onClick={() => handleSort("encodedDate")}>
                                    <div className="flex items-center gap-1"><span>Encoded</span>{sortField === "encodedDate" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />}</div>
                                </TableHead>
                                <TableHead className="font-black text-[10px] uppercase text-center whitespace-nowrap" onClick={() => handleSort("discrepancy")}>Status</TableHead>
                                <TableHead className="text-right font-black text-[10px] uppercase cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort("pouchAmount")}>
                                    <div className="flex items-center gap-1 justify-end"><span>Pouch Value</span>{sortField === "pouchAmount" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />}</div>
                                </TableHead>
                                <TableHead className="text-right font-black text-[10px] uppercase pr-8 cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => handleSort("discrepancy")}>
                                    <div className="flex items-center gap-1 justify-end"><span>Rem. Float</span>{sortField === "discrepancy" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />}</div>
                                </TableHead>
                                <TableHead className="w-[40px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && data.content.length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="h-[40vh] text-center"><div className="flex flex-col items-center justify-center text-muted-foreground gap-2"><Loader2 className="animate-spin text-primary" size={24} /><p className="font-bold tracking-widest uppercase text-[10px] animate-pulse">Syncing Database...</p></div></TableCell></TableRow>
                            ) : data.content.length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="h-[40vh] text-center"><div className="flex flex-col items-center justify-center text-muted-foreground gap-2 opacity-60"><CircleDashed size={32} /><p className="font-bold tracking-widest uppercase text-xs text-foreground">No records found</p></div></TableCell></TableRow>
                            ) : data.content.map((col) => {
                                const pouchTotal = col.pouchAmount || 0;
                                const remaining = Math.abs(col.discrepancy || 0);

                                let statusColor = "bg-slate-100 text-slate-600 border-slate-200";
                                let rowBg = "hover:bg-muted/50";
                                let icon = <Hourglass size={10} className="mr-1"/>;

                                if (col.status === "Balanced") {
                                    statusColor = "bg-emerald-50 border-emerald-200 text-emerald-700";
                                    rowBg = "bg-emerald-50/10 hover:bg-emerald-50/30 dark:bg-emerald-950/5 dark:hover:bg-emerald-950/15";
                                    icon = <CheckCircle2 size={10} className="mr-1 text-emerald-600" strokeWidth={3}/>;
                                } else if (col.status === "In Progress") {
                                    statusColor = "bg-orange-50 border-orange-200 text-orange-700";
                                    rowBg = "bg-orange-50/10 hover:bg-orange-50/30 dark:bg-orange-950/5 dark:hover:bg-orange-950/15";
                                    icon = <Loader2 size={10} className="mr-1 animate-spin text-orange-600" strokeWidth={3}/>;
                                }

                                const actualRemitter = (col.collectedByName && !col.collectedByName.includes("N/A")) ? col.collectedByName : "Encoder Fallback";

                                return (
                                    <TableRow key={col.id} className={`transition-all group border-b border-border/40 ${rowBg} cursor-pointer`} onClick={() => handleOpenSettlement(col.id)}>
                                        <TableCell className="pl-6 py-2.5">
                                            <div className="flex flex-col items-start gap-1">
                                                <span className="font-mono font-black text-primary text-xs tracking-tight">{col.docNo}</span>
                                                {col.crNo ? <Badge variant="outline" className="bg-muted text-[8px] font-mono tracking-widest text-muted-foreground px-1 h-4 py-0 leading-none">CR: {col.crNo}</Badge> : <span className="text-[9px] text-muted-foreground/40 italic pl-1">No CR Attached</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-1.5"><Badge variant="secondary" className="text-[7px] w-12 justify-center tracking-widest px-0 h-4 py-0 leading-none">Route</Badge><span className="font-bold text-xs text-foreground uppercase truncate max-w-[150px]">{col.salesmanName || "Unassigned"}</span></div>
                                                <div className="flex items-center gap-1.5"><Badge variant="outline" className="text-[7px] w-12 justify-center tracking-widest px-0 h-4 py-0 leading-none bg-background">Remitter</Badge><span className="font-bold text-xs text-foreground/80 uppercase truncate max-w-[150px]">{actualRemitter}</span></div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2.5"><div className="flex items-center gap-1.5 text-foreground"><CalendarDays size={12} className="text-blue-500 opacity-70" /><span className="text-[11px] font-bold tracking-wide">{parseSpecificDate(col.collectionDate) ? format(parseSpecificDate(col.collectionDate)!, "MMM dd, yyyy") : "-"}</span></div></TableCell>
                                        <TableCell className="py-2.5"><div className="flex items-center gap-1.5 text-muted-foreground"><Database size={12} className="opacity-50" /><span className="text-[11px] font-medium tracking-wide">{parseSpecificDate(col.encodedDate) ? format(parseSpecificDate(col.encodedDate)!, "MMM dd, yyyy") : "-"}</span></div></TableCell>
                                        <TableCell className="py-2.5 text-center"><Badge variant="outline" className={`font-black uppercase text-[9px] px-2 py-0.5 tracking-widest leading-none ${statusColor}`}>{icon} {col.status}</Badge></TableCell>
                                        <TableCell className="text-right py-2.5 font-mono font-black text-xs text-foreground">₱{pouchTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                        <TableCell className="text-right py-2.5 pr-8 font-mono font-black text-xs"><span className={col.status === 'Balanced' ? 'text-emerald-600' : 'text-orange-600'}>₱{remaining.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></TableCell>
                                        <TableCell className="pr-4 py-2.5"><ChevronRight size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" strokeWidth={3}/></TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    {isLoading && data.content.length > 0 && (
                        <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
                            <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-xs font-bold text-muted-foreground shadow-sm">
                                <Loader2 size={14} className="animate-spin"/> Updating queue...
                            </div>
                        </div>
                    )}
                </div>

                {/* 🚀 SERVER-DRIVEN PAGINATION FOOTER */}
                {!isLoading && data.totalElements > 0 && (
                    <div className="flex items-center justify-between px-4 py-2 bg-card border-t border-border shrink-0">
                        <div className="text-xs text-muted-foreground font-medium">
                            Showing <span className="font-bold text-foreground">{(page - 1) * size + 1}</span> to <span className="font-bold text-foreground">{Math.min(page * size, data.totalElements)}</span> of <span className="font-bold text-foreground">{data.totalElements}</span> entries
                        </div>
                        <div className="flex items-center gap-3">
                            <Select value={size.toString()} onValueChange={(val) => { setSize(Number(val)); setPage(1); }}>
                                <SelectTrigger className="h-8 text-xs font-bold w-[110px] border-muted-foreground/20"><SelectValue placeholder="Per page" /></SelectTrigger>
                                <SelectContent><SelectItem value="10">10 per page</SelectItem><SelectItem value="15">15 per page</SelectItem><SelectItem value="30">30 per page</SelectItem><SelectItem value="50">50 per page</SelectItem></SelectContent>
                            </Select>

                            <div className="flex items-center gap-1 bg-muted/30 border border-border/50 rounded-md p-0.5">
                                <Button variant="ghost" size="icon" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 text-muted-foreground hover:text-foreground"><ChevronLeft size={14} /></Button>
                                <div className="text-xs font-black px-2 min-w-[60px] text-center">{page} / {data.totalPages}</div>
                                <Button variant="ghost" size="icon" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="h-7 w-7 text-muted-foreground hover:text-foreground"><ChevronRight size={14} /></Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 🚀 THE FIX IS RIGHT HERE! */}
            <Dialog
                open={isCommandCenterOpen}
                onOpenChange={(open) => {
                    setIsCommandCenterOpen(open);
                    // No fetchQueue() here!
                }}
            >
                <DialogContent className="!p-0 !rounded-xl !border !border-border !bg-background !flex !flex-col !shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] !overflow-hidden transition-all duration-300" style={{ width: '98vw', maxWidth: '1800px', height: '96vh', maxHeight: '98vh' }} showCloseButton={false}>
                    <DialogTitle className="sr-only">Settlement Command Center</DialogTitle>
                    {selectedPouchId && (
                        <SettlementCommandCenter
                            id={selectedPouchId}
                            autoAddInvoiceNo={qInvoiceNo || undefined}
                            onChanged={fetchQueue}
                            onClose={(hasSaved) => {
                                setIsCommandCenterOpen(false);
                                // 🚀 Only refresh the queue if a save successfully occurred!
                                if (hasSaved === true) {
                                    fetchQueue();
                                }
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
