import React from "react";
import { CalendarDays, Search, Printer, Download, Scale, Clock } from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear, subMonths, subYears } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ReportHeaderProps {
    startDate: string; setStartDate: (v: string) => void;
    endDate: string; setEndDate: (v: string) => void;
    isLoading: boolean;
    hasData: boolean;
    onGenerate: () => void;
    onExportExcel: () => void;
    onPrint: () => void;
}

export function ReportHeader({
                                 startDate, setStartDate, endDate, setEndDate,
                                 isLoading, hasData, onGenerate, onExportExcel, onPrint
                             }: ReportHeaderProps) {

    // 🚀 The Quick Range Logic
    const handleQuickRange = (value: string) => {
        const today = new Date();

        switch (value) {
            case "today":
                setStartDate(format(today, "yyyy-MM-dd"));
                setEndDate(format(today, "yyyy-MM-dd"));
                break;
            case "yesterday":
                const yesterday = subDays(today, 1);
                setStartDate(format(yesterday, "yyyy-MM-dd"));
                setEndDate(format(yesterday, "yyyy-MM-dd"));
                break;
            case "last7":
                setStartDate(format(subDays(today, 7), "yyyy-MM-dd"));
                setEndDate(format(today, "yyyy-MM-dd"));
                break;
            case "last30":
                setStartDate(format(subDays(today, 30), "yyyy-MM-dd"));
                setEndDate(format(today, "yyyy-MM-dd"));
                break;
            case "last90":
                setStartDate(format(subDays(today, 90), "yyyy-MM-dd"));
                setEndDate(format(today, "yyyy-MM-dd"));
                break;
            case "thisWeek":
                setStartDate(format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
                setEndDate(format(today, "yyyy-MM-dd"));
                break;
            case "thisMonth":
                setStartDate(format(startOfMonth(today), "yyyy-MM-dd"));
                setEndDate(format(today, "yyyy-MM-dd"));
                break;
            case "lastMonth":
                const lastMonth = subMonths(today, 1);
                setStartDate(format(startOfMonth(lastMonth), "yyyy-MM-dd"));
                setEndDate(format(endOfMonth(lastMonth), "yyyy-MM-dd"));
                break;
            case "thisQuarter":
                setStartDate(format(startOfQuarter(today), "yyyy-MM-dd"));
                setEndDate(format(today, "yyyy-MM-dd"));
                break;
            case "lastQuarter":
                const lastQuarter = subMonths(today, 3);
                setStartDate(format(startOfQuarter(lastQuarter), "yyyy-MM-dd"));
                setEndDate(format(endOfQuarter(lastQuarter), "yyyy-MM-dd"));
                break;
            case "thisYear":
                setStartDate(format(startOfYear(today), "yyyy-MM-dd"));
                setEndDate(format(today, "yyyy-MM-dd"));
                break;
            case "lastYear":
                const lastYear = subYears(today, 1);
                setStartDate(format(startOfYear(lastYear), "yyyy-MM-dd"));
                setEndDate(format(endOfYear(lastYear), "yyyy-MM-dd"));
                break;
            case "ytd":
                setStartDate(format(startOfYear(today), "yyyy-MM-dd"));
                setEndDate(format(today, "yyyy-MM-dd"));
                break;
        }
    };

    return (
        <div className="bg-card border border-border/60 p-4 rounded-2xl shadow-sm flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between shrink-0 relative overflow-hidden z-10">
            {/* Subtle left accent */}
            <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-primary/80 to-primary/20" />

            <div className="flex w-full min-w-0 flex-col items-stretch gap-4 pl-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                <h1 className="text-xl font-black flex items-center gap-2.5 tracking-tight whitespace-nowrap">
                    <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                        <Scale size={18}/>
                    </div>
                    Collection Summary
                </h1>

                <div className="flex w-full min-w-0 flex-col gap-2 sm:ml-4 sm:w-auto sm:flex-row sm:items-center">
                    {/* 🚀 Modern Quick Range Dropdown */}
                    <Select onValueChange={handleQuickRange}>
                        <SelectTrigger className="h-10 w-[140px] rounded-xl bg-muted/40 border-border/50 text-xs font-bold focus:ring-primary/20">
                            <div className="flex items-center gap-2">
                                <Clock size={14} className="text-muted-foreground" />
                                <SelectValue placeholder="Quick Range" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            <SelectItem value="today" className="text-xs font-bold">Today</SelectItem>
                            <SelectItem value="yesterday" className="text-xs font-bold">Yesterday</SelectItem>
                            <SelectItem value="last7" className="text-xs font-bold">Last 7 Days</SelectItem>
                            <SelectItem value="last30" className="text-xs font-bold">Last 30 Days</SelectItem>
                            <SelectItem value="last90" className="text-xs font-bold">Last 90 Days</SelectItem>
                            <SelectItem value="thisWeek" className="text-xs font-bold">This Week</SelectItem>
                            <SelectItem value="thisMonth" className="text-xs font-bold">This Month</SelectItem>
                            <SelectItem value="lastMonth" className="text-xs font-bold">Last Month</SelectItem>
                            <SelectItem value="thisQuarter" className="text-xs font-bold">This Quarter</SelectItem>
                            <SelectItem value="lastQuarter" className="text-xs font-bold">Last Quarter</SelectItem>
                            <SelectItem value="thisYear" className="text-xs font-bold">This Year</SelectItem>
                            <SelectItem value="lastYear" className="text-xs font-bold">Last Year</SelectItem>
                            <SelectItem value="ytd" className="text-xs font-bold">Year to Date</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Modern Date Pill */}
                    <div className="flex w-full min-w-0 flex-col gap-2 bg-muted/40 border border-border/50 rounded-xl p-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all hover:bg-muted/60 sm:w-auto sm:flex-row sm:items-center sm:gap-2 sm:p-1.5">
                        <div className="flex w-full items-center gap-2 px-1 cursor-pointer sm:w-auto sm:px-2">
                            <span className="w-10 shrink-0 text-[10px] font-black uppercase text-muted-foreground sm:hidden">From</span>
                            <CalendarDays size={14} className="hidden text-muted-foreground sm:block" />
                            <Input id="collection-report-start-date" aria-label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-full min-w-0 text-xs font-bold border-none shadow-none bg-transparent cursor-pointer focus-visible:ring-0 px-0 sm:h-7 sm:w-[125px]" />
                        </div>
                        <div className="hidden h-px w-full bg-border/80 sm:block sm:h-4 sm:w-px sm:mx-1"></div>
                        <div className="flex w-full items-center gap-2 px-1 cursor-pointer sm:w-auto sm:px-2">
                            <span className="w-10 shrink-0 text-[10px] font-black uppercase text-muted-foreground sm:hidden">To</span>
                            <CalendarDays size={14} className="hidden text-muted-foreground sm:block" />
                            <Input id="collection-report-end-date" aria-label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 w-full min-w-0 text-xs font-bold border-none shadow-none bg-transparent cursor-pointer focus-visible:ring-0 px-0 sm:h-7 sm:w-[125px]" />
                        </div>
                    </div>
                </div>

                <Button onClick={onGenerate} disabled={isLoading} size="sm" className="h-10 self-start rounded-xl px-5 text-xs font-bold tracking-wider uppercase shadow-sm active:scale-95 transition-all sm:self-auto">
                    <Search size={14} className={`mr-2 ${isLoading ? "animate-spin" : ""}`}/> {isLoading ? "Crunching..." : "Generate"}
                </Button>
            </div>

            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                <Button onClick={onExportExcel} disabled={!hasData} variant="outline" size="sm" className="h-10 rounded-xl px-4 text-xs font-bold tracking-wider uppercase border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 active:scale-95 transition-all bg-background">
                    <Download size={14} className="mr-2"/> Excel
                </Button>
                <Button onClick={onPrint} disabled={!hasData} variant="default" size="sm" className="h-10 rounded-xl px-4 text-xs font-bold tracking-wider uppercase bg-blue-600 hover:bg-blue-700 text-white shadow-sm active:scale-95 transition-all">
                    <Printer size={14} className="mr-2"/> PDF Report
                </Button>
            </div>
        </div>
    );
}
