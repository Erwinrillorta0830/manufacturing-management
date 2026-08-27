"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart as RechartsPieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import {
    Search, Loader2, CreditCard, FileText,
    Building2, Wallet, CalendarDays, PieChart, SlidersHorizontal,
    Paperclip, ExternalLink, Download, TrendingUp, FileSpreadsheet
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCashIssuanceDashboard } from "../hooks/useCashIssuanceDashboard";
import { VoucherSummary } from "../types";
import { disbursementProvider } from "../providers/fetchProvider";
import { StickyTableWrapper } from "./StickyTableWrapper";
import { generateReportPDF } from "../utils/reportPdfGenerator";
import { generateReportExcel } from "../utils/reportExcelGenerator";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AiInsightsPanel } from "./AiInsightsPanel";

const PIE_COLORS = [
    "hsl(var(--primary))",
    "hsl(221.2 83.2% 53.3%)", // blue
    "hsl(262.1 83.3% 57.8%)", // purple
    "hsl(142.1 76.2% 36.3%)", // emerald
    "hsl(346.8 77.2% 49.8%)", // rose
    "hsl(47.9 95.8% 53.1%)",  // amber
    "hsl(173.4 80.4% 40%)",   // teal
    "hsl(25.2 95% 53.1%)",    // orange
    "hsl(198.6 88.7% 48.4%)", // sky
    "hsl(326.5 81.2% 50.2%)"  // pink
];

function AttachmentPreview({ docUrl }: { docUrl: string }) {
    const [contentType, setContentType] = useState<string>("");
    const [imgError, setImgError] = useState(false);
    const fileId = docUrl.split(/[/?#]/).filter(Boolean).pop() || "";
    const viewUrl = `/api/manufacturing/financial-management/cash-issuance/disbursements/attachments/${encodeURIComponent(fileId)}`;

    useEffect(() => {
        setImgError(false);
        if (!viewUrl) return;
        const controller = new AbortController();
        fetch(viewUrl, { method: "HEAD", signal: controller.signal })
            .then((res) => {
                if (!res.ok) return;
                const type = res.headers.get("content-type");
                if (type) setContentType(type.toLowerCase());
            })
            .catch(() => {
                if (!controller.signal.aborted) setContentType("");
            });
        return () => controller.abort();
    }, [viewUrl]);

    const isPdf = docUrl.toLowerCase().endsWith(".pdf") || viewUrl.toLowerCase().endsWith(".pdf") || contentType.includes("pdf");

    return (
        <div className="space-y-3">
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Paperclip className="w-4 h-4" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Attachment / Supporting Docs</p>
                        <p className="text-xs font-bold text-foreground truncate max-w-[200px]">
                            {docUrl.split("/").pop() || "view_attachment"}
                        </p>
                    </div>
                </div>
                <Button variant="outline" size="sm" asChild className="text-[10px] font-black uppercase tracking-widest h-8 px-3">
                    <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                        View <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                    </a>
                </Button>
            </div>

            {/* Inline Preview */}
            <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
                <div className="px-4 py-2 bg-muted/50 border-b border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center justify-between">
                    <span>Attachment Preview</span>
                </div>
                <div className="p-3 flex justify-center items-center bg-card max-h-[320px] overflow-hidden">
                    {isPdf ? (
                        <iframe 
                            src={viewUrl} 
                            className="w-full h-[280px] border-0 rounded-lg" 
                            title="Supporting Document PDF" 
                        />
                    ) : imgError ? (
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground p-4 text-center">Preview not available. Click "View" above to open.</div>
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                            src={viewUrl} 
                            alt="Supporting Document" 
                            className="max-h-[280px] max-w-full object-contain rounded-lg shadow-sm"
                            onError={() => setImgError(true)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export function CashIssuanceDashboardTab() {
    const { data, filters, setFilters, isLoading, handleApplyFilters } = useCashIssuanceDashboard();
    const [selectedVoucher, setSelectedVoucher] = useState<VoucherSummary | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showAiInsights, setShowAiInsights] = useState(false);

    const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
    const [payees, setPayees] = useState<{ id: number; name: string }[]>([]);
    const [coas, setCoas] = useState<{ coaId: number; glCode: string; accountTitle: string }[]>([]);
    const [divisions, setDivisions] = useState<{ divisionId: number; divisionName: string }[]>([]);

    const activeEncoders = useMemo(() => {
        const activeIds = data?.activeEncoderIds;
        if (!activeIds) return users;
        const activeSet = new Set(activeIds);
        return users.filter(u => activeSet.has(u.id));
    }, [users, data?.activeEncoderIds]);

    useEffect(() => {
        // Fetch users
        fetch("/api/manufacturing/financial-management/cash-issuance/users")
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setUsers(data.map((u: { id: number; firstName?: string; lastName?: string }) => ({
                        id: u.id,
                        name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || `User #${u.id}`
                    })));
                }
            })
            .catch(err => console.warn("Failed to fetch users for filter:", err));

        // Fetch suppliers/payees
        Promise.all([
            disbursementProvider.getSuppliers("Trade"),
            disbursementProvider.getSuppliers("Non-Trade")
        ])
            .then(([trade, nonTrade]) => {
                const combined = [...(trade || []), ...(nonTrade || [])];
                const seen = new Set();
                const list: { id: number; name: string }[] = [];
                combined.forEach(s => {
                    if (s && s.id && !seen.has(s.id)) {
                        seen.add(s.id);
                        list.push({ id: s.id, name: s.supplier_name });
                    }
                });
                setPayees(list);
            })
            .catch(err => console.warn("Failed to fetch payees for filter:", err));

        // Fetch COAs
        disbursementProvider.getCOAs()
            .then(data => {
                if (Array.isArray(data)) {
                    setCoas(data);
                }
            })
            .catch(err => console.warn("Failed to fetch COAs for filter:", err));

        // Fetch divisions
        disbursementProvider.getDivisions()
            .then(data => {
                if (Array.isArray(data)) {
                    setDivisions(data);
                }
            })
            .catch(err => console.warn("Failed to fetch divisions for filter:", err));
    }, []);

    const formatMoney = (amount: number) => `₱${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const reportSummary = useMemo(() => {
        const summary: Record<string, { count: number; total: number }> = {
            "Draft": { count: 0, total: 0 },
            "Submitted": { count: 0, total: 0 },
            "Approved": { count: 0, total: 0 },
            "Released": { count: 0, total: 0 },
            "Posted": { count: 0, total: 0 }
        };

        (data?.vouchers || []).forEach(v => {
            const status = v.status || "Draft";
            if (!summary[status]) {
                summary[status] = { count: 0, total: 0 };
            }
            summary[status].count += 1;
            summary[status].total += v.totalAmount || 0;
        });

        return Object.entries(summary).map(([status, stats]) => ({
            status,
            ...stats
        }));
    }, [data?.vouchers]);

    // 🚀 FIX: Prevent chart overlap by only taking the Top 10 highest expenses, and resolve titles client-side
    const topPaymentExpenses = useMemo(() => {
        return (data?.paymentCoaExpenses || []).map(item => {
            const matched = coas.find(c => c.coaId === item.coaId);
            return {
                ...item,
                accountTitle: matched ? matched.accountTitle : `Payment Account #${item.coaId}`
            };
        }).slice(0, 10);
    }, [data?.paymentCoaExpenses, coas]);

    const topPayableExpenses = useMemo(() => {
        return (data?.payableCoaExpenses || []).map(item => {
            const matched = coas.find(c => c.coaId === item.coaId);
            return {
                ...item,
                accountTitle: matched ? matched.accountTitle : `Payable Account #${item.coaId}`
            };
        }).slice(0, 10);
    }, [data?.payableCoaExpenses, coas]);

    const topDivisionExpenses = useMemo(() => {
        return (data?.divisionExpenses || []).slice(0, 10);
    }, [data?.divisionExpenses]);

    const cashFlowTimeline = useMemo(() => {
        const dateMap = new Map<string, number>();
        (data?.vouchers || []).forEach(v => {
            const dateStr = v.transactionDate || "No Date";
            dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + (v.paidAmount || 0));
        });

        return Array.from(dateMap.entries())
            .map(([date, amount]) => ({ date, amount }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [data?.vouchers]);

    // 🚀 FIX: Smart text truncator for the Y-Axis
    const truncateText = (text: string, maxLength: number = 22) => {
        if (!text) return "";
        return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
    };

    const handleQuickRange = (range: string) => {
        const today = new Date();
        let start = new Date();
        let end = new Date();

        switch (range) {
            case "today":
                break;
            case "this_week":
                start.setDate(today.getDate() - today.getDay());
                break;
            case "this_month":
                start = new Date(today.getFullYear(), today.getMonth(), 1);
                end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                break;
            case "this_year":
                start = new Date(today.getFullYear(), 0, 1);
                end = new Date(today.getFullYear(), 11, 31);
                break;
            case "all_time":
                start = new Date(2020, 0, 1);
                end = new Date(today.getFullYear() + 1, 11, 31);
                break;
            default: return;
        }

        setFilters({
            ...filters,
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        });
    };

    return (
        <div className="flex min-h-full min-w-0 flex-col space-y-3.5 animate-in fade-in duration-500">
            {/* 1. PREMIUM FILTER BAR */}
            <Card className="shadow-sm border-border/50 bg-card rounded-2xl overflow-hidden">
                <CardContent className="p-5 space-y-4 bg-muted/10">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
                                <CalendarDays className="w-3.5 h-3.5 text-primary"/> Quick Range
                            </label>
                            <Select onValueChange={handleQuickRange}>
                                <SelectTrigger className="h-10 text-xs font-bold uppercase bg-background shadow-sm border-border/50">
                                    <SelectValue placeholder="Custom" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="today" className="text-xs font-bold uppercase">Today</SelectItem>
                                    <SelectItem value="this_week" className="text-xs font-bold uppercase">This Week</SelectItem>
                                    <SelectItem value="this_month" className="text-xs font-bold uppercase">This Month</SelectItem>
                                    <SelectItem value="this_year" className="text-xs font-bold uppercase">This Year</SelectItem>
                                    <SelectItem value="all_time" className="text-xs font-bold uppercase">All Time</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Start Date</label>
                            <Input type="date" className="h-10 text-xs font-bold uppercase bg-background shadow-sm border-border/50" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">End Date</label>
                            <Input type="date" className="h-10 text-xs font-bold uppercase bg-background shadow-sm border-border/50" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
                        </div>

                        <div className="flex gap-2 w-full">
                            <Button onClick={handleApplyFilters} disabled={isLoading} className="flex-1 h-10 text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-md hover:shadow-lg rounded-xl">
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                                Generate
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => generateReportPDF(data, filters)}
                                disabled={!data || isLoading}
                                className="h-10 px-3 rounded-xl border-border/50 shrink-0 hover:bg-muted text-muted-foreground hover:text-foreground"
                                title="Export Report to PDF"
                            >
                                <Download className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => generateReportExcel(data, filters)}
                                disabled={!data || isLoading}
                                className="h-10 px-3 rounded-xl border-border/50 shrink-0 hover:bg-muted text-muted-foreground hover:text-foreground"
                                title="Export Report to Excel"
                            >
                                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                            </Button>
                            <Button
                                variant={showAdvanced ? "secondary" : "outline"}
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className={cn(
                                    "h-10 px-3 rounded-xl transition-all border-border/50 shrink-0",
                                    showAdvanced ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                                title="Toggle Advanced Filters"
                            >
                                <SlidersHorizontal className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    <div className={cn(
                        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-border/30 transition-all duration-300 ease-in-out overflow-hidden",
                        showAdvanced ? "opacity-100 max-h-[500px]" : "opacity-0 max-h-0 pt-0 pb-0 border-transparent pointer-events-none"
                    )}>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Trans Type</label>
                            <Select value={filters.transactionType?.toString() || "ALL"} onValueChange={(val) => setFilters({ ...filters, transactionType: val === "ALL" ? "" : Number(val) })}>
                                <SelectTrigger className="h-10 text-xs font-bold uppercase bg-background shadow-sm border-border/50"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL" className="text-xs font-bold uppercase">All Types</SelectItem>
                                    <SelectItem value="1" className="text-xs font-bold uppercase text-blue-600">Trade</SelectItem>
                                    <SelectItem value="2" className="text-xs font-bold uppercase text-purple-600">Non-Trade</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Status</label>
                            <Select value={filters.status} onValueChange={(val) => setFilters({ ...filters, status: val })}>
                                <SelectTrigger className="h-10 text-xs font-bold uppercase bg-background shadow-sm border-border/50"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL" className="text-xs font-bold uppercase text-primary">All Statuses (Pipeline)</SelectItem>
                                    <SelectItem value="Draft" className="text-xs font-bold uppercase">Draft Only</SelectItem>
                                    <SelectItem value="Submitted" className="text-xs font-bold uppercase">Submitted Only</SelectItem>
                                    <SelectItem value="Approved" className="text-xs font-bold uppercase">Approved Only</SelectItem>
                                    <SelectItem value="Released" className="text-xs font-bold uppercase">Released Only</SelectItem>
                                    <SelectItem value="Posted" className="text-xs font-bold uppercase">Posted Only</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Encoder</label>
                            <SearchableSelect
                                value={filters.encoderId?.toString() || "ALL"}
                                onValueChange={(val) => setFilters({ ...filters, encoderId: val === "ALL" ? "" : Number(val) })}
                                options={[
                                    { value: "ALL", label: "All Encoders" },
                                    ...activeEncoders.map(u => ({ value: u.id.toString(), label: u.name }))
                                ]}
                                placeholder="Select Encoder"
                                className="h-10 text-xs font-bold uppercase bg-background shadow-sm border-border/50 justify-between"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Supplier / Payee</label>
                            <SearchableSelect
                                value={filters.payeeId?.toString() || "ALL"}
                                onValueChange={(val) => setFilters({ ...filters, payeeId: val === "ALL" ? "" : Number(val) })}
                                options={[
                                    { value: "ALL", label: "All Payees" },
                                    ...payees.map(p => ({ value: p.id.toString(), label: p.name }))
                                ]}
                                placeholder="Select Payee"
                                className="h-10 text-xs font-bold uppercase bg-background shadow-sm border-border/50 justify-between"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">GL COA</label>
                            <SearchableSelect
                                value={filters.coaId?.toString() || "ALL"}
                                onValueChange={(val) => setFilters({ ...filters, coaId: val === "ALL" ? "" : Number(val) })}
                                options={[
                                    { value: "ALL", label: "All COAs" },
                                    ...coas.map(c => ({ value: c.coaId.toString(), label: `${c.glCode} - ${c.accountTitle}` }))
                                ]}
                                placeholder="Select COA"
                                className="h-10 text-xs font-bold uppercase bg-background shadow-sm border-border/50 justify-between"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Division</label>
                            <Select value={filters.divisionId?.toString() || "ALL"} onValueChange={(val) => setFilters({ ...filters, divisionId: val === "ALL" ? "" : Number(val) })}>
                                <SelectTrigger className="h-10 text-xs font-bold uppercase bg-background shadow-sm border-border/50"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL" className="text-xs font-bold uppercase text-primary">All Divisions</SelectItem>
                                    {divisions.map(d => (
                                        <SelectItem key={d.divisionId} value={d.divisionId.toString()} className="text-xs font-bold uppercase">{d.divisionName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Min Amount</label>
                            <Input
                                type="number"
                                placeholder="Min"
                                className="h-10 text-xs font-bold bg-background shadow-sm border-border/50"
                                value={filters.amount || ""}
                                onChange={(e) => setFilters({ ...filters, amount: e.target.value === "" ? "" : Number(e.target.value) })}
                            />
                        </div>

                        <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Remarks / Particulars</label>
                            <Input
                                type="text"
                                placeholder="Search by remarks or particulars..."
                                className="h-10 text-xs font-bold bg-background shadow-sm border-border/50 placeholder:text-muted-foreground/40"
                                value={filters.remarks || ""}
                                onChange={(e) => setFilters({ ...filters, remarks: e.target.value })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 2. KPI METRIC CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="shadow-sm border-none bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-black uppercase text-indigo-700/70 dark:text-indigo-400/70 flex items-center justify-between">
                            Total Liabilities Incurred <CreditCard className="w-4 h-4 text-indigo-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-indigo-700 dark:text-indigo-400">{formatMoney(data?.totalDisbursed || 0)}</div>
                        <p className="text-[10px] uppercase font-bold text-indigo-700/50 dark:text-indigo-400/50 mt-1 tracking-widest">Gross Vouchered Commitments</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-none bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-black uppercase text-blue-700/70 dark:text-blue-400/70 flex items-center justify-between">
                            Total Cash Outflow (Paid) <Wallet className="w-4 h-4 text-blue-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-blue-700 dark:text-blue-400">{formatMoney(data?.totalPaid || 0)}</div>
                        <p className="text-[10px] uppercase font-bold text-blue-700/50 dark:text-blue-400/50 mt-1 tracking-widest">Released & Posted Payments</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-none bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-black uppercase text-amber-700/70 dark:text-amber-400/70 flex items-center justify-between">
                            Outstanding Backlog <FileText className="w-4 h-4 text-amber-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-amber-700 dark:text-amber-400">{formatMoney(data?.totalUnpaidPayables || 0)}</div>
                        <p className="text-[10px] uppercase font-bold text-amber-700/50 dark:text-amber-400/50 mt-1 tracking-widest">Unpaid Vouchers in Pipeline</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-none bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-black uppercase text-emerald-700/70 dark:text-emerald-400/70 flex items-center justify-between">
                            Treasury Payout Rate <TrendingUp className="w-4 h-4 text-emerald-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                            {data && data.totalDisbursed > 0 
                                ? `${((data.totalPaid / data.totalDisbursed) * 100).toFixed(1)}%` 
                                : "0.0%"}
                        </div>
                        <p className="text-[10px] uppercase font-bold text-emerald-700/50 dark:text-emerald-400/50 mt-1 tracking-widest">Release Rate of Liabilities</p>
                    </CardContent>
                </Card>
            </div>

            {/* Collapsible AI Insights Panel */}
            <Card className="shadow-sm border border-border/50 rounded-xl overflow-hidden bg-card">
                <CardHeader 
                    className="py-2.5 px-4 bg-muted/10 border-b border-border/30 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/20 transition-all" 
                    onClick={() => setShowAiInsights(!showAiInsights)}
                >
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-primary animate-pulse" />
                        <span className="text-xs font-black uppercase tracking-wider text-foreground">AI Treasury Co-Pilot Insights</span>
                    </div>
                    <Badge variant="secondary" className="text-[9px] uppercase font-bold">
                        {showAiInsights ? "Hide Insights" : "Show Insights"}
                    </Badge>
                </CardHeader>
                {showAiInsights && (
                    <CardContent className="p-0 animate-in fade-in duration-300">
                        <AiInsightsPanel data={data} isLoading={isLoading} />
                    </CardContent>
                )}
            </Card>

            <div className="grid min-w-0 grid-cols-1 items-stretch gap-6 lg:flex-1 lg:min-h-0 lg:grid-cols-3">

                {/* COLUMN 1: CHARTS AND SUMMARIES */}
                <div className="min-w-0 lg:col-span-1 space-y-6 flex flex-col">
                    {/* 3. 🚀 DYNAMIC CHART: EXPENSE DISTRIBUTION (Tabs for COA vs Division) */}
                    <Card className="shadow-sm flex flex-col rounded-2xl border-border/50">
                        <CardHeader className="border-b bg-muted/10 pb-4">
                            <CardTitle className="text-sm font-black uppercase text-foreground flex items-center gap-2">
                                <PieChart className="w-4 h-4 text-primary" /> Outflow Analysis
                            </CardTitle>
                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Top 10 Breakdown of actual outflows</p>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 min-h-[340px] flex flex-col">
                            <Tabs defaultValue="payment" className="w-full h-full flex flex-col">
                                <TabsList className="w-full rounded-none border-b bg-transparent h-12 flex">
                                    <TabsTrigger value="payment" className="flex-1 data-[state=active]:border-b-2 border-primary rounded-none h-full font-bold uppercase text-[9px] tracking-wider truncate">
                                        Payment Accounts
                                    </TabsTrigger>
                                    <TabsTrigger value="payable" className="flex-1 data-[state=active]:border-b-2 border-primary rounded-none h-full font-bold uppercase text-[9px] tracking-wider truncate">
                                        Payable Accounts
                                    </TabsTrigger>
                                    <TabsTrigger value="division" className="flex-1 data-[state=active]:border-b-2 border-primary rounded-none h-full font-bold uppercase text-[9px] tracking-wider truncate">
                                        Divisions & Depts
                                    </TabsTrigger>
                                    <TabsTrigger value="timeline" className="flex-1 data-[state=active]:border-b-2 border-primary rounded-none h-full font-bold uppercase text-[9px] tracking-wider truncate">
                                        Cash Timeline
                                    </TabsTrigger>
                                </TabsList>

                                {/* CHART A: BY PAYMENT ACCOUNT */}
                                <TabsContent value="payment" className="flex-1 p-4 m-0">
                                    {topPaymentExpenses.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={180}>
                                            <BarChart data={topPaymentExpenses} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--muted))" />
                                                <XAxis type="number" tickFormatter={(val) => `₱${val/1000}k`} className="text-[9px] font-bold" />
                                                <YAxis dataKey="accountTitle" type="category" className="text-[9px] font-bold uppercase" width={120} tickFormatter={(val) => truncateText(val, 18)} tick={{fill: 'hsl(var(--foreground))'}} />
                                                <Tooltip
                                                    formatter={(value: number) => [formatMoney(value), "Outflow"]}
                                                    labelFormatter={(label) => <span className="font-black uppercase text-xs">{label}</span>}
                                                    cursor={{fill: 'hsl(var(--muted))'}}
                                                    contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}
                                                />
                                                <Bar dataKey="totalExpense" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-48 flex flex-col items-center justify-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">No Payment Data Available</div>
                                    )}
                                </TabsContent>

                                {/* CHART B: BY PAYABLE ACCOUNT */}
                                <TabsContent value="payable" className="flex-1 p-4 m-0">
                                    {topPayableExpenses.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={180}>
                                            <BarChart data={topPayableExpenses} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--muted))" />
                                                <XAxis type="number" tickFormatter={(val) => `₱${val/1000}k`} className="text-[9px] font-bold" />
                                                <YAxis dataKey="accountTitle" type="category" className="text-[9px] font-bold uppercase" width={120} tickFormatter={(val) => truncateText(val, 18)} tick={{fill: 'hsl(var(--foreground))'}} />
                                                <Tooltip
                                                    formatter={(value: number) => [formatMoney(value), "Outflow"]}
                                                    labelFormatter={(label) => <span className="font-black uppercase text-xs">{label}</span>}
                                                    cursor={{fill: 'hsl(var(--muted))'}}
                                                    contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}
                                                />
                                                <Bar dataKey="totalExpense" fill="hsl(262.1 83.3% 57.8%)" radius={[0, 4, 4, 0]} barSize={20} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-48 flex flex-col items-center justify-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">No Payable Data Available</div>
                                    )}
                                </TabsContent>

                                {/* CHART C: BY DIVISION & DEPARTMENT */}
                                <TabsContent value="division" className="flex-1 p-4 m-0 space-y-4">
                                    {topDivisionExpenses.length > 0 ? (
                                        <>
                                            <div className="h-32">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <RechartsPieChart>
                                                        <Tooltip
                                                            formatter={(value: number) => [formatMoney(value), "Outflow"]}
                                                            contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}
                                                        />
                                                        <Pie
                                                            data={topDivisionExpenses}
                                                            dataKey="totalExpense"
                                                            nameKey="divisionName"
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={40}
                                                            outerRadius={60}
                                                            paddingAngle={3}
                                                            label={({ name, percent }) => `${truncateText(name, 8)} (${(percent * 100).toFixed(0)}%)`}
                                                            labelLine={false}
                                                        >
                                                            {topDivisionExpenses.map((entry, index) => (
                                                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                                            ))}
                                                        </Pie>
                                                    </RechartsPieChart>
                                                </ResponsiveContainer>
                                            </div>

                                            {/* Department Breakdown list */}
                                            <div className="space-y-2.5 overflow-y-auto max-h-[160px] pr-1.5 custom-scrollbar">
                                                {topDivisionExpenses.map((div, i) => (
                                                    <div key={div.divisionId} className="border border-border/40 rounded-xl p-3 bg-muted/5">
                                                        <div className="flex justify-between items-center mb-1.5">
                                                            <span className="text-[10px] font-black uppercase text-foreground flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                                                {div.divisionName}
                                                            </span>
                                                            <span className="text-[10px] font-black text-primary">{formatMoney(div.totalExpense)}</span>
                                                        </div>
                                                        {div.departments && div.departments.length > 0 ? (
                                                            <div className="pl-3.5 space-y-1 border-l border-border/70 border-dashed">
                                                                {div.departments.map(dept => (
                                                                    <div key={dept.departmentId} className="flex justify-between items-center text-[9px] font-bold text-muted-foreground uppercase py-0.5">
                                                                        <span>{dept.departmentName}</span>
                                                                        <span className="font-mono">{formatMoney(dept.totalExpense)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="pl-3.5 text-[8px] text-muted-foreground uppercase font-bold">No departments hit</div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="h-48 flex flex-col items-center justify-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">No Division Data Available</div>
                                    )}
                                </TabsContent>

                                {/* CHART D: CASH FLOW TIMELINE */}
                                <TabsContent value="timeline" className="flex-1 p-4 m-0">
                                    {cashFlowTimeline.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={180}>
                                            <AreaChart data={cashFlowTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                                                <defs>
                                                    <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                                                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.01}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                                                <XAxis dataKey="date" className="text-[9px] font-bold" tickFormatter={(val) => {
                                                    try {
                                                        const date = new Date(val);
                                                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                                    } catch {
                                                        return val;
                                                    }
                                                }} />
                                                <YAxis className="text-[9px] font-bold" tickFormatter={(val) => `₱${val/1000}k`} />
                                                <Tooltip
                                                    formatter={(value: number) => [formatMoney(value), "Outflow"]}
                                                    labelFormatter={(label) => <span className="font-black uppercase text-xs">Date: {label}</span>}
                                                    contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}
                                                />
                                                <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPaid)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-48 flex flex-col items-center justify-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">No Timeline Data Available</div>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>

                    {/* DISBURSEMENT REPORT SUMMARY */}
                    <Card className="shadow-sm rounded-2xl border-border/50 overflow-hidden">
                        <CardHeader className="border-b bg-muted/10 py-4">
                            <CardTitle className="text-sm font-black uppercase text-foreground">
                                Outflow Summary by Status
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-muted/80 backdrop-blur-md sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
                                    <TableRow>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-muted-foreground pl-4">Status</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-muted-foreground text-center">Vouchers</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-muted-foreground text-right pr-4">Total Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportSummary.map((row) => (
                                        <TableRow key={row.status} className="hover:bg-muted/10 border-border">
                                            <TableCell className="pl-4 py-2.5 font-bold text-xs">
                                                <Badge variant="secondary" className="text-[9px] uppercase tracking-wider bg-muted/60">{row.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-center py-2.5 font-mono text-xs font-bold text-foreground">
                                                {row.count}
                                            </TableCell>
                                            <TableCell className="text-right pr-4 py-2.5 font-mono text-xs font-black text-foreground">
                                                {formatMoney(row.total)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-muted/20 border-t font-black">
                                        <TableCell className="pl-4 py-3 text-xs uppercase tracking-wider">Total</TableCell>
                                        <TableCell className="text-center py-3 font-mono text-xs">
                                            {reportSummary.reduce((sum, r) => sum + r.count, 0)}
                                        </TableCell>
                                        <TableCell className="text-right pr-4 py-3 font-mono text-xs text-primary">
                                            {formatMoney(reportSummary.reduce((sum, r) => sum + r.total, 0))}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* 4. MASTER TABLE */}
                <Card className="min-w-0 lg:col-span-2 lg:h-full min-h-0 p-0 shadow-sm flex flex-col gap-0 rounded-2xl border-border/50">
                    <CardHeader className="shrink-0 border-b bg-muted/10 flex flex-row items-center justify-between py-4">
                        <CardTitle className="text-sm font-black uppercase text-foreground">Outflow Register</CardTitle>
                        <Badge variant="outline" className="font-mono bg-background shadow-sm">{data?.vouchers?.length || 0} Records</Badge>
                    </CardHeader>
                    <CardContent className="min-w-0 min-h-0 flex flex-1 flex-col p-0 relative">
                        <StickyTableWrapper className="w-full max-h-[55vh] min-h-0 overflow-auto custom-scrollbar lg:flex-1 lg:max-h-none [&>[data-slot=table-container]]:h-full">
                            <Table className="min-w-[720px] table-fixed">
                                <TableHeader className="bg-muted/80 backdrop-blur-md sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
                                    <TableRow>
                                        <TableHead className="w-[170px] whitespace-nowrap text-[9px] font-black uppercase tracking-widest text-muted-foreground pl-6">Doc No</TableHead>
                                        <TableHead className="min-w-[260px] text-[9px] font-black uppercase tracking-widest text-muted-foreground">Payee & Date</TableHead>
                                        <TableHead className="w-[140px] whitespace-nowrap text-[9px] font-black uppercase tracking-widest text-muted-foreground text-right">Total Amt</TableHead>
                                        <TableHead className="w-[140px] whitespace-nowrap text-[9px] font-black uppercase tracking-widest text-muted-foreground text-right pr-6">Paid Amt</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={4} className="h-48 text-center"><Loader2 className="animate-spin mx-auto text-primary/50" /></TableCell></TableRow>
                                    ) : data?.vouchers?.length === 0 ? (
                                        <TableRow><TableCell colSpan={4} className="h-32 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest">No matching records found.</TableCell></TableRow>
                                    ) : data?.vouchers?.map((v) => (
                                        <TableRow
                                            key={v.id}
                                            onClick={() => setSelectedVoucher(v)}
                                            className="cursor-pointer hover:bg-primary/[0.04] transition-all duration-200 even:bg-muted/15"
                                        >
                                            <TableCell className="whitespace-nowrap font-black text-xs text-primary pl-6 py-4">{v.docNo}</TableCell>
                                            <TableCell className="py-4">
                                                <div className="font-black text-xs uppercase text-foreground">{v.payeeName}</div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] font-mono text-muted-foreground">{v.transactionDate}</span>
                                                    <Badge variant="secondary" className="text-[8px] uppercase tracking-wider px-1.5 py-0 bg-muted/50">{v.status}</Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-right font-black text-xs py-4">
                                                {formatMoney(v.totalAmount)}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-right font-black text-xs text-emerald-600 dark:text-emerald-500 pr-6 py-4">
                                                {formatMoney(v.paidAmount)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </StickyTableWrapper>
                    </CardContent>
                </Card>
            </div>

            {/* 5. DRILL-DOWN SLIDE-OVER (SHEET) */}
            <Sheet open={!!selectedVoucher} onOpenChange={(open) => !open && setSelectedVoucher(null)}>
                <SheetContent className="sm:max-w-md w-full border-l shadow-2xl flex flex-col p-0 bg-background/95 backdrop-blur-xl">
                    <div className="bg-primary/5 p-6 border-b border-primary/10">
                        <SheetHeader>
                            <div className="flex justify-between items-start">
                                <div>
                                    <SheetTitle className="text-2xl font-black text-primary uppercase tracking-tight">{selectedVoucher?.docNo}</SheetTitle>
                                    <SheetDescription className="text-xs font-bold uppercase tracking-widest mt-1">
                                        Disbursement Drill-down
                                    </SheetDescription>
                                </div>
                                <Badge className="uppercase text-[10px] font-black tracking-widest shadow-sm">{selectedVoucher?.status}</Badge>
                            </div>
                        </SheetHeader>
                    </div>

                    <div className="p-6 space-y-8 flex-1 overflow-auto custom-scrollbar">
                        <div className="space-y-2">
                            <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2"><Building2 size={14} className="text-primary/70"/> Payee Info</h4>
                            <p className="text-sm font-black uppercase text-foreground">{selectedVoucher?.payeeName}</p>
                            <p className="text-xs font-bold text-muted-foreground">Trans Date: <span className="font-mono text-foreground">{selectedVoucher?.transactionDate}</span></p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 p-5 bg-card rounded-2xl border shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                            <div>
                                <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Total Amount</p>
                                <p className="text-xl font-black text-foreground mt-1">{formatMoney(selectedVoucher?.totalAmount || 0)}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Amount Paid</p>
                                <p className="text-xl font-black text-emerald-600 dark:text-emerald-500 mt-1">{formatMoney(selectedVoucher?.paidAmount || 0)}</p>
                            </div>
                        </div>

                        {selectedVoucher?.supportingDocumentsUrl ? (
                            <AttachmentPreview docUrl={selectedVoucher.supportingDocumentsUrl} />
                        ) : null}

                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2"><Wallet size={14} className="text-emerald-500"/> Payment Details (Credits)</h4>
                            <div className="text-xs font-medium space-y-3">
                                <div className="p-4 border rounded-xl shadow-sm bg-card">
                                    <span className="font-bold uppercase block mb-1.5 text-[10px] text-muted-foreground tracking-widest">Source Banks</span>
                                    <span className="font-black uppercase">{selectedVoucher?.bankNames || 'No banks attached'}</span>
                                </div>
                                <div className="p-4 border rounded-xl shadow-sm bg-card">
                                    <span className="font-bold uppercase block mb-1.5 text-[10px] text-muted-foreground tracking-widest">Check Numbers</span>
                                    <span className="font-mono text-primary font-bold">{selectedVoucher?.checkNumbers || 'No checks issued'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2"><FileText size={14} className="text-orange-500"/> Expense Allocation (Debits)</h4>
                            <div className="p-4 border rounded-xl shadow-sm bg-muted/30">
                                <span className="font-bold uppercase block mb-3 text-[10px] text-muted-foreground tracking-widest">Chart of Accounts Hit</span>
                                <div className="flex flex-wrap gap-2">
                                    {selectedVoucher?.expenseAccountsHit?.split(',').map((acc, i) => (
                                        <Badge key={i} variant="outline" className="text-[10px] uppercase border-border bg-background shadow-sm py-1 px-3">{acc.trim()}</Badge>
                                    )) || <span className="text-xs text-muted-foreground italic font-medium">No expenses allocated</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
