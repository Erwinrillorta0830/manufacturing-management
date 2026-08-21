"use client";

import React, { useState, useMemo } from "react";
import { ArrowDownUp, ChevronDown, ChevronUp, FileText, Eye, Search, Filter, FilterX } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

import { useCollectionReport, PouchReportDto } from "../hooks/useCollectionReport";
import { ReportHeader } from "./ReportHeader";
import { KpiCards } from "./KpiCards";
import { PouchDetailSheet } from "./PouchDetailSheet";
import { exportCollectionReportToExcel } from "../utils/exportUtils";
import { generateCollectionPDF } from "../utils/pdf-generator";
import { fetchProvider } from "../../providers/fetchProvider";
import { toast } from "sonner";
import { mapRawPouchToSettlementPrintableData } from "../../settlement/utils/settlement-printable-data";
import type { RawTreasuryPouch } from "../../settlement/utils/settlement-printable-data";
import { printSettlementReceiptA4 } from "../../settlement/utils/printSettlementReceiptA4";

type SortKey = "docNo" | "date" | "status" | "totalCash" | "totalCheck" | "netVariance" | "invoiceNetTotal";
type SortDirection = "asc" | "desc";

type SortConfig = {
    key: SortKey;
    direction: SortDirection;
};

type VarianceFilter = "ALL" | "BALANCED" | "OVERAGE" | "SHORTAGE";
type PresenceFilter = "ALL" | "WITH" | "WITHOUT";

const REPORT_VARIANCE_EPSILON = 0.01;

function matchesPresenceFilter(filter: PresenceFilter, count: number) {
    if (filter === "ALL") return true;
    return filter === "WITH" ? count > 0 : count === 0;
}

export default function CollectionSummaryDashboard() {
    const {
        reportData,
        isLoading,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        fetchReport,
        companyProfile,
        salesmen,
    } = useCollectionReport();
    const [selectedPouch, setSelectedPouch] = useState<PouchReportDto | null>(null);
    const [printingPouchId, setPrintingPouchId] = useState<number | null>(null);

    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [varianceFilter, setVarianceFilter] = useState<VarianceFilter>("ALL");
    const [checksFilter, setChecksFilter] = useState<PresenceFilter>("ALL");
    const [invoicesFilter, setInvoicesFilter] = useState<PresenceFilter>("ALL");
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "date", direction: "desc" });

    const visiblePouches = useMemo(() => {
        if (!reportData?.pouches) return [];
        const filtered = reportData.pouches.filter(pouch => {
            const searchLower = searchQuery.trim().toLowerCase();
            const searchableValues = [
                pouch.docNo,
                ...pouch.invoices.flatMap(inv => [inv.invoiceNo, inv.customerName]),
                ...pouch.checks.flatMap(chk => [chk.checkNo, chk.customerName, chk.bankName]),
                ...pouch.variances.flatMap(variance => [variance.docNo, variance.invoiceNo, variance.customerName]),
            ].map(value => String(value ?? "").toLowerCase());
            const matchesSearch = searchLower === "" || searchableValues.some(value => value.includes(searchLower));

            const matchesStatus = statusFilter === "ALL" || (statusFilter === "POSTED" ? pouch.isPosted : !pouch.isPosted);
            const netVariance = pouch.overage - pouch.shortage;
            const matchesVariance =
                varianceFilter === "ALL" ||
                (varianceFilter === "BALANCED" && Math.abs(netVariance) <= REPORT_VARIANCE_EPSILON) ||
                (varianceFilter === "OVERAGE" && netVariance > REPORT_VARIANCE_EPSILON) ||
                (varianceFilter === "SHORTAGE" && netVariance < -REPORT_VARIANCE_EPSILON);
            const matchesChecks = matchesPresenceFilter(checksFilter, pouch.checks.length);
            const matchesInvoices = matchesPresenceFilter(invoicesFilter, pouch.invoices.length);

            return matchesSearch && matchesStatus && matchesVariance && matchesChecks && matchesInvoices;
        });

        return [...filtered].sort((a, b) => {
            let comparison = 0;

            switch (sortConfig.key) {
                case "docNo":
                    comparison = a.docNo.localeCompare(b.docNo, undefined, { numeric: true, sensitivity: "base" });
                    break;
                case "date":
                    comparison = (a.date ? new Date(a.date).getTime() : 0) - (b.date ? new Date(b.date).getTime() : 0);
                    break;
                case "status":
                    comparison = (a.isPosted ? "POSTED" : "DRAFT").localeCompare(b.isPosted ? "POSTED" : "DRAFT");
                    break;
                case "totalCash":
                    comparison = a.totalCash - b.totalCash;
                    break;
                case "totalCheck":
                    comparison = a.totalCheck - b.totalCheck;
                    break;
                case "netVariance":
                    comparison = (a.overage - a.shortage) - (b.overage - b.shortage);
                    break;
                case "invoiceNetTotal":
                    comparison = a.invoiceNetTotal - b.invoiceNetTotal;
                    break;
            }

            return sortConfig.direction === "asc" ? comparison : -comparison;
        });
    }, [reportData, searchQuery, sortConfig, statusFilter, varianceFilter, checksFilter, invoicesFilter]);

    const activeAdvancedFilterCount = [
        varianceFilter !== "ALL",
        checksFilter !== "ALL",
        invoicesFilter !== "ALL",
    ].filter(Boolean).length;
    const activeFilterCount = activeAdvancedFilterCount + [
        searchQuery.trim() !== "",
        statusFilter !== "ALL",
    ].filter(Boolean).length;

    const handlePrintRecord = async (pouch: PouchReportDto) => {
        if (printingPouchId !== null) return;

        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            toast.error("The printable window was blocked. Allow pop-ups and retry.");
            return;
        }

        setPrintingPouchId(pouch.id);
        try {
            const rawPouch = await fetchProvider.get<RawTreasuryPouch>(
                `/api/fm/treasury/collections/${pouch.id}`,
            );
            if (!rawPouch) {
                throw new Error("Collection details could not be loaded.");
            }
            const printableData = mapRawPouchToSettlementPrintableData(rawPouch);
            const salesman = salesmen.find((item) => item.id === rawPouch.salesmanId);
            const salesmanName = salesman?.salesmanName || `Owner ID: ${rawPouch.salesmanId ?? "N/A"}`;

            printSettlementReceiptA4(
                printableData.wallet,
                printableData.allocations,
                rawPouch.docNo || pouch.docNo,
                salesmanName,
                rawPouch.collectionDate || pouch.date,
                rawPouch.isPosted ?? pouch.isPosted,
                companyProfile,
                printWindow,
            );
        } catch (error) {
            printWindow.close();
            toast.error(error instanceof Error && error.message ? error.message : "Unable to prepare the collection printable.");
        } finally {
            setPrintingPouchId(null);
        }
    };

    const clearFilters = () => {
        setSearchQuery("");
        setStatusFilter("ALL");
        setVarianceFilter("ALL");
        setChecksFilter("ALL");
        setInvoicesFilter("ALL");
    };

    const handleSort = (key: SortKey) => {
        setSortConfig((current) => ({
            key,
            direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
        }));
    };

    const renderSortHeader = (key: SortKey, label: string, className = "") => {
        const isActive = sortConfig.key === key;
        const icon = isActive
            ? sortConfig.direction === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />
            : <ArrowDownUp size={12} className="opacity-40" />;

        return (
            <th
                aria-sort={isActive ? sortConfig.direction === "asc" ? "ascending" : "descending" : "none"}
                className={`h-11 font-bold uppercase tracking-wider text-[10px] text-muted-foreground ${className}`}
            >
                <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm"
                    aria-label={`Sort by ${label}${isActive ? `, currently ${sortConfig.direction}ending` : ""}`}
                    onClick={(event) => {
                        event.stopPropagation();
                        handleSort(key);
                    }}
                >
                    {label}
                    {icon}
                </button>
            </th>
        );
    };

    return (
        // 🚀 1. Make the outer wrapper fixed height so we can scroll internally
        <div className="h-full flex flex-col space-y-5 overflow-hidden">

            {/* The Top Header stays static */}
            <div className="shrink-0">
                <ReportHeader
                    startDate={startDate} setStartDate={setStartDate}
                    endDate={endDate} setEndDate={setEndDate}
                    isLoading={isLoading} hasData={!!reportData}
                    onGenerate={fetchReport}
                    onExportExcel={() => {
                        if (reportData) {
                            exportCollectionReportToExcel(reportData, startDate, endDate);
                        }
                    }}
                    onPrint={() => {
                        if (reportData) {
                            generateCollectionPDF(reportData, startDate, endDate, companyProfile);
                        }
                    }}
                />
            </div>

            {/* 🚀 2. The main content area */}
            {!reportData && !isLoading && (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-60">
                    <div className="p-6 bg-muted/50 rounded-full mb-4">
                        <FileText size={48} className="opacity-50 text-foreground"/>
                    </div>
                    <p className="font-bold tracking-widest uppercase text-sm text-foreground">No Report Generated</p>
                </div>
            )}

            {isLoading && !reportData && (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                    <span className="animate-pulse font-black tracking-widest uppercase text-sm">Aggregating Ledger...</span>
                </div>
            )}

            {reportData && (
                <div className="flex-1 flex flex-col space-y-5 min-h-0 animate-in fade-in duration-500">

                    {/* KPI Cards shrink to fit */}
                    <div className="shrink-0">
                        <KpiCards data={reportData} />
                    </div>

                    {/* 🚀 3. Master Table Card - Takes up remaining space */}
                    <Card className="flex-1 flex flex-col shadow-sm border-border/60 rounded-2xl overflow-hidden bg-background">

                        {/* 🚀 4. NEW HORIZONTAL FILTER TOOLBAR */}
                        <div className="shrink-0 p-3 bg-muted/10 border-b border-border/50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="relative w-full sm:max-w-[300px]">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        aria-label="Search collection report"
                                        placeholder="Search CP# / Invoice / Customer / Check / Bank..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 h-9 text-xs rounded-lg bg-background border-border/60 shadow-sm"
                                    />
                                </div>
                                <div className="w-full sm:w-[150px]">
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger id="collection-report-status-filter" aria-label="Status filter" className="h-9 text-xs rounded-lg font-bold bg-background shadow-sm border-border/60">
                                            <SelectValue placeholder="All Status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL" className="text-xs font-bold">All Status</SelectItem>
                                            <SelectItem value="POSTED" className="text-xs font-bold text-emerald-500">Posted</SelectItem>
                                            <SelectItem value="DRAFT" className="text-xs font-bold text-orange-500">Draft</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground" aria-live="polite">
                                    Showing {visiblePouches.length} of {reportData.pouches.length}
                                </span>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg text-xs font-bold gap-2 text-muted-foreground border-border/60 shadow-sm bg-background">
                                            <Filter size={14} /> Advanced Filters
                                            {activeAdvancedFilterCount > 0 && (
                                                <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-full px-1 text-[10px]">
                                                    {activeAdvancedFilterCount}
                                                </Badge>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-4">
                                        <div className="space-y-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <PopoverTitle className="text-sm font-black">Advanced Filters</PopoverTitle>
                                                    <PopoverDescription className="mt-1 text-xs">Refine the loaded report records.</PopoverDescription>
                                                </div>
                                                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters}>
                                                    Clear all
                                                </Button>
                                            </div>

                                            <div className="space-y-2">
                                                <label htmlFor="report-variance-filter" className="text-xs font-bold">Variance</label>
                                                <Select value={varianceFilter} onValueChange={(value) => setVarianceFilter(value as VarianceFilter)}>
                                                    <SelectTrigger id="report-variance-filter" aria-label="Variance filter" className="h-9 w-full text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="ALL" className="text-xs">All variances</SelectItem>
                                                        <SelectItem value="BALANCED" className="text-xs">Balanced</SelectItem>
                                                        <SelectItem value="OVERAGE" className="text-xs">Overage</SelectItem>
                                                        <SelectItem value="SHORTAGE" className="text-xs">Shortage</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-2">
                                                <label htmlFor="report-checks-filter" className="text-xs font-bold">Checks</label>
                                                <Select value={checksFilter} onValueChange={(value) => setChecksFilter(value as PresenceFilter)}>
                                                    <SelectTrigger id="report-checks-filter" aria-label="Checks filter" className="h-9 w-full text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="ALL" className="text-xs">Any checks</SelectItem>
                                                        <SelectItem value="WITH" className="text-xs">With checks</SelectItem>
                                                        <SelectItem value="WITHOUT" className="text-xs">Without checks</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-2">
                                                <label htmlFor="report-invoices-filter" className="text-xs font-bold">Settled invoices</label>
                                                <Select value={invoicesFilter} onValueChange={(value) => setInvoicesFilter(value as PresenceFilter)}>
                                                    <SelectTrigger id="report-invoices-filter" aria-label="Settled invoices filter" className="h-9 w-full text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="ALL" className="text-xs">Any invoices</SelectItem>
                                                        <SelectItem value="WITH" className="text-xs">With settled invoices</SelectItem>
                                                        <SelectItem value="WITHOUT" className="text-xs">Without settled invoices</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                                {activeFilterCount > 0 && (
                                    <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5 px-2 text-xs font-bold" onClick={clearFilters}>
                                        <FilterX size={14} /> Clear
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* 🚀 5. THE SCROLLABLE TABLE AREA WITH STICKY HEADER */}
                        <div className="flex-1 overflow-auto relative scrollbar-thin">
                            <table className="text-xs w-full border-collapse">
                                {/* 🚀 The sticky top-0 ensures this never leaves the view while scrolling */}
                                <thead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm shadow-sm">
                                    <tr className="border-b border-border/50">
                                        {renderSortHeader("docNo", "Doc No.", "pl-6 text-left")}
                                        {renderSortHeader("date", "Date", "text-left")}
                                        {renderSortHeader("status", "Status", "text-left")}
                                        {renderSortHeader("totalCash", "Total Cash", "text-right")}
                                        {renderSortHeader("totalCheck", "Total Checks", "text-right")}
                                        {renderSortHeader("netVariance", "Net Variance", "text-right")}
                                        {renderSortHeader("invoiceNetTotal", "Net Invoices", "text-right bg-primary/5 text-primary")}
                                        <th className="text-center w-[100px] pr-6 h-11 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visiblePouches.length === 0 ? (
                                        <tr><td colSpan={8} className="text-center italic text-muted-foreground py-12 text-sm">No pouches found matching your filters.</td></tr>
                                    ) : visiblePouches.map((pouch) => {
                                        const netVariance = pouch.overage - pouch.shortage;
                                        return (
                                            <tr key={pouch.docNo} className="hover:bg-muted/40 transition-colors group cursor-pointer border-b border-border/50" onClick={() => setSelectedPouch(pouch)}>
                                                <td className="font-bold text-foreground font-mono pl-6 py-3">{pouch.docNo}</td>
                                                <td className="font-medium text-muted-foreground">{pouch.date ? format(parseISO(pouch.date), "MMM dd, yyyy") : 'N/A'}</td>
                                                <td>
                                                    {pouch.isPosted ? (
                                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] px-2 py-0.5 rounded uppercase tracking-wider font-bold">POSTED</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-[9px] px-2 py-0.5 rounded uppercase tracking-wider font-bold">DRAFT</Badge>
                                                    )}
                                                </td>
                                                <td className="text-right font-mono font-medium text-foreground">₱{pouch.totalCash.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                                <td className="text-right font-mono font-medium text-blue-500">{pouch.totalCheck > 0 ? `₱${pouch.totalCheck.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'}</td>
                                                <td className="text-right font-mono font-bold">
                                                    {netVariance === 0 ? '-' : (
                                                        <span className={netVariance < 0 ? 'text-red-500' : 'text-purple-500'}>
                                                            {netVariance < 0 ? '-' : '+'}₱{Math.abs(netVariance).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="text-right font-mono font-black text-primary bg-primary/5">₱{pouch.invoiceNetTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                                <td className="text-center pr-6">
                                                    <Button size="sm" variant="ghost" className="h-7 rounded-md px-2 text-[10px] uppercase font-bold tracking-widest text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                                                        <Eye size={14} className="mr-1.5"/> Review
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            <PouchDetailSheet
                pouch={selectedPouch}
                isOpen={!!selectedPouch}
                onClose={() => setSelectedPouch(null)}
                onPrint={handlePrintRecord}
                isPrinting={printingPouchId === selectedPouch?.id}
            />
        </div>
    );
}
