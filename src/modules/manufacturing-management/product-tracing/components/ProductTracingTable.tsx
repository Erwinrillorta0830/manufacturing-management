"use client";

import * as React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "./Table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ArrowUpDown,
    ChevronUp,
    ChevronDown,
    FileSearch,
    Download,
    Eye,
    ArrowUpRight,
    ArrowDownRight,
    Copy,
    Check,
    Layers,
    ListFilter,
    Calendar,
    AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { MovementDetailModal } from "./MovementDetailModal";
import { BatchMovementsModal, BatchGroupData } from "./BatchMovementsModal";
import { generateProductTracingHtml } from "../utils/printProductTracingReport";
import { TracingReportPreviewModal } from "./TracingReportPreviewModal";
import {
    MMInventoryMovement,
    BranchLookup,
    ProductTypeLookup,
    ProductLookup,
    LotLookup
} from "../types";
import { UserLookup } from "../providers/fetchProvider";

type ViewMode = "flat" | "by-doc" | "by-batch";

type Props = {
    data: MMInventoryMovement[];
    isLoading?: boolean;
    branchName?: string | null;
    productTypeName?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    branches?: BranchLookup[];
    products?: ProductLookup[];
    lots?: LotLookup[];
    productTypes?: ProductTypeLookup[];
    users?: UserLookup[];
    className?: string;
};

export function ProductTracingTable({
    data,
    isLoading,
    branchName,
    productTypeName,
    startDate,
    endDate,
    branches = [],
    products = [],
    lots = [],
    productTypes = [],
    users = [],
    className
}: Props) {
    const [selectedMovement, setSelectedMovement] = React.useState<MMInventoryMovement | null>(null);
    const [isDetailOpen, setIsDetailOpen] = React.useState(false);
    const [selectedBatch, setSelectedBatch] = React.useState<BatchGroupData | null>(null);
    const [isBatchModalOpen, setIsBatchModalOpen] = React.useState(false);
    const [viewMode, setViewMode] = React.useState<ViewMode>("flat");
    const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
    const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);

    const [sortConfig, setSortConfig] = React.useState<{ key: string | null; direction: "asc" | "desc" | null }>({
        key: "transactionDate",
        direction: "desc"
    });

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current.key === key) {
                if (current.direction === "asc") return { key, direction: "desc" };
                return { key: null, direction: null };
            }
            return { key, direction: "asc" };
        });
    };

    const SortIcon = ({ columnKey }: { columnKey: string }) => {
        if (sortConfig.key !== columnKey) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30 group-hover:opacity-100 transition-opacity" />;
        return sortConfig.direction === "asc"
            ? <ChevronUp className="ml-1 h-3 w-3 text-primary font-bold" />
            : <ChevronDown className="ml-1 h-3 w-3 text-primary font-bold" />;
    };

    const copyToClipboard = async (text: string, id: string) => {
        if (!text) return;
        let success = false;
        try {
            if (typeof window !== "undefined" && navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                success = true;
            }
        } catch {
            // fallback below
        }

        if (!success && typeof document !== "undefined") {
            try {
                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.style.position = "fixed";
                textarea.style.left = "-999999px";
                textarea.style.top = "-999999px";
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                success = document.execCommand("copy");
                document.body.removeChild(textarea);
            } catch {
                success = false;
            }
        }

        if (success) {
            setCopiedKey(id);
            toast.success("Copied to clipboard!");
            setTimeout(() => setCopiedKey(null), 2000);
        } else {
            toast.info(`Reference: ${text}`);
        }
    };

    // Sorting
    const sortedData = React.useMemo(() => {
        if (!sortConfig.key || !sortConfig.direction) return data;

        return [...data].sort((a, b) => {
            let valA: string | number = 0;
            let valB: string | number = 0;

            switch (sortConfig.key) {
                case "transactionDate":
                    valA = new Date(a.transactionDate || a.postedAt || 0).getTime();
                    valB = new Date(b.transactionDate || b.postedAt || 0).getTime();
                    break;
                case "referenceNo":
                    valA = a.referenceNo || "";
                    valB = b.referenceNo || "";
                    break;
                case "productName":
                    valA = a.productName || "";
                    valB = b.productName || "";
                    break;
                case "batchNo":
                    valA = a.batchNo || "";
                    valB = b.batchNo || "";
                    break;
                case "transactionType":
                    valA = a.transactionType || "";
                    valB = b.transactionType || "";
                    break;
                case "quantityIn":
                    valA = Number(a.quantityIn || 0);
                    valB = Number(b.quantityIn || 0);
                    break;
                case "quantityOut":
                    valA = Number(a.quantityOut || 0);
                    valB = Number(b.quantityOut || 0);
                    break;
                case "runningBalance":
                    valA = Number(a.runningBalance || 0);
                    valB = Number(b.runningBalance || 0);
                    break;
                case "unitCost":
                    valA = Number(a.unitCost || 0);
                    valB = Number(b.unitCost || 0);
                    break;
                case "differenceCost":
                    valA = Number(a.differenceCost || 0);
                    valB = Number(b.differenceCost || 0);
                    break;
                default:
                    return 0;
            }

            if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
            if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
            return 0;
        });
    }, [data, sortConfig]);

    // Grouping by Reference Document
    const groupedByDoc = React.useMemo(() => {
        const groups = new Map<string, MMInventoryMovement[]>();
        data.forEach(item => {
            const key = item.referenceNo || "NO-REF";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(item);
        });
        return Array.from(groups.entries()).map(([refNo, items]) => ({
            refNo,
            items,
            main: items[0],
            totalIn: items.reduce((sum, i) => sum + Number(i.quantityIn || 0), 0),
            totalOut: items.reduce((sum, i) => sum + Number(i.quantityOut || 0), 0),
            lastDate: items[items.length - 1].transactionDate
        }));
    }, [data]);

    // Grouping by Batch
    const groupedByBatch = React.useMemo(() => {
        const groups = new Map<string, MMInventoryMovement[]>();
        data.forEach(item => {
            const key = `${item.productId}-${item.batchNo || "NO-BATCH"}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(item);
        });
        return Array.from(groups.entries()).map(([key, items]) => ({
            key,
            items,
            main: items[0],
            totalIn: items.reduce((sum, i) => sum + Number(i.quantityIn || 0), 0),
            totalOut: items.reduce((sum, i) => sum + Number(i.quantityOut || 0), 0),
            balance: items.reduce((sum, i) => sum + Number(i.quantityIn || 0) - Number(i.quantityOut || 0), 0),
            lastDate: items[items.length - 1].transactionDate
        }));
    }, [data]);

    // Export to CSV
    const handleExportCsv = () => {
        if (data.length === 0) {
            toast.error("No movements to export.");
            return;
        }

        const headers = [
            "Movement Key",
            "Transaction Date",
            "Reference No",
            "Transaction Type",
            "Direction",
            "Source Module",
            "Product ID",
            "Product Code",
            "Product Name",
            "Product Type",
            "Batch No",
            "Lot ID",
            "Condition",
            "Mfg Date",
            "Exp Date",
            "Qty In",
            "Qty Out",
            "Running Balance",
            "Unit Cost",
            "Difference Cost",
            "Status",
            "Remarks"
        ];

        const rows = data.map(m => [
            `"${m.movementKey || ""}"`,
            `"${m.transactionDate || m.postedAt || ""}"`,
            `"${m.referenceNo || ""}"`,
            `"${m.transactionType || ""}"`,
            `"${m.movementDirection || ""}"`,
            `"${m.sourceModule || ""}"`,
            m.productId || "",
            `"${m.productCode || ""}"`,
            `"${(m.productName || "").replace(/"/g, '""')}"`,
            `"${m.productTypeName || ""}"`,
            `"${m.batchNo || ""}"`,
            m.lotId || "",
            `"${m.inventoryCondition || ""}"`,
            `"${m.manufacturingDate || ""}"`,
            `"${m.expirationDate || ""}"`,
            m.quantityIn || 0,
            m.quantityOut || 0,
            m.runningBalance || 0,
            m.unitCost || 0,
            m.differenceCost || 0,
            `"${m.sourceStatus || ""}"`,
            `"${(m.remarks || "").replace(/"/g, '""')}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Product_Tracing_Ledger_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("CSV export downloaded successfully!");
    };

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div key={i} className="h-14 w-full animate-pulse bg-muted/40 rounded-2xl border border-muted" />
                ))}
            </div>
        );
    }

    return (
        <div className={cn("space-y-4", className)}>
            {/* Table Header Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                        View Mode:
                    </span>
                    <div className="inline-flex rounded-xl bg-muted/60 p-1">
                        <button
                            type="button"
                            onClick={() => setViewMode("flat")}
                            className={cn(
                                "px-3 py-1 text-xs font-bold rounded-lg transition-all",
                                viewMode === "flat" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Ledger View
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode("by-doc")}
                            className={cn(
                                "px-3 py-1 text-xs font-bold rounded-lg transition-all",
                                viewMode === "by-doc" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            By Document ({groupedByDoc.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode("by-batch")}
                            className={cn(
                                "px-3 py-1 text-xs font-bold rounded-lg transition-all",
                                viewMode === "by-batch" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            By Batch ({groupedByBatch.length})
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:text-foreground gap-1.5"
                        onClick={handleExportCsv}
                        disabled={data.length === 0}
                    >
                        <Download className="h-3.5 w-3.5" />
                        Export CSV
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-xl px-3 text-xs font-bold border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary gap-1.5"
                        onClick={() => {
                            const html = generateProductTracingHtml({
                                movements: data,
                                branchName: branchName || "Selected Branch",
                                productTypeName: productTypeName || "All Products",
                                startDate: startDate || null,
                                endDate: endDate || null
                            });
                            setPreviewHtml(html);
                            setIsPreviewOpen(true);
                        }}
                        disabled={data.length === 0}
                    >
                        <FileSearch className="h-3.5 w-3.5" />
                        Preview & Print
                    </Button>
                </div>
            </div>

            {/* Flat Ledger Table */}
            {viewMode === "flat" && (
                <Card className="rounded-[1.75rem] border shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <Table noWrapper>
                            <TableHeader className="bg-muted/40 border-b sticky top-0 z-20 backdrop-blur-md">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead
                                        className="w-[110px] h-11 text-[10px] font-black uppercase tracking-widest pl-5 cursor-pointer group select-none"
                                        onClick={() => handleSort("transactionDate")}
                                    >
                                        <div className="flex items-center">
                                            Date / Time
                                            <SortIcon columnKey="transactionDate" />
                                        </div>
                                    </TableHead>

                                    <TableHead
                                        className="w-[150px] h-11 text-[10px] font-black uppercase tracking-widest cursor-pointer group select-none"
                                        onClick={() => handleSort("referenceNo")}
                                    >
                                        <div className="flex items-center">
                                            Reference No
                                            <SortIcon columnKey="referenceNo" />
                                        </div>
                                    </TableHead>

                                    <TableHead
                                        className="h-11 text-[10px] font-black uppercase tracking-widest text-center cursor-pointer group select-none"
                                        onClick={() => handleSort("transactionType")}
                                    >
                                        <div className="flex items-center justify-center">
                                            Type / Module
                                            <SortIcon columnKey="transactionType" />
                                        </div>
                                    </TableHead>

                                    <TableHead
                                        className="min-w-[200px] h-11 text-[10px] font-black uppercase tracking-widest cursor-pointer group select-none"
                                        onClick={() => handleSort("productName")}
                                    >
                                        <div className="flex items-center">
                                            Product & Item
                                            <SortIcon columnKey="productName" />
                                        </div>
                                    </TableHead>

                                    <TableHead
                                        className="w-[140px] h-11 text-[10px] font-black uppercase tracking-widest cursor-pointer group select-none"
                                        onClick={() => handleSort("batchNo")}
                                    >
                                        <div className="flex items-center">
                                            Batch & Condition
                                            <SortIcon columnKey="batchNo" />
                                        </div>
                                    </TableHead>

                                    <TableHead className="w-[80px] h-11 text-[10px] font-black uppercase tracking-widest text-center">
                                        Direction
                                    </TableHead>

                                    <TableHead
                                        className="w-[90px] text-right h-11 text-[10px] font-black uppercase tracking-widest cursor-pointer group select-none"
                                        onClick={() => handleSort("quantityIn")}
                                    >
                                        <div className="flex items-center justify-end">
                                            Qty In
                                            <SortIcon columnKey="quantityIn" />
                                        </div>
                                    </TableHead>

                                    <TableHead
                                        className="w-[90px] text-right h-11 text-[10px] font-black uppercase tracking-widest cursor-pointer group select-none"
                                        onClick={() => handleSort("quantityOut")}
                                    >
                                        <div className="flex items-center justify-end">
                                            Qty Out
                                            <SortIcon columnKey="quantityOut" />
                                        </div>
                                    </TableHead>

                                    <TableHead
                                        className="w-[110px] text-right h-11 text-[10px] font-black uppercase tracking-widest font-black px-4 bg-muted/20 border-l border-muted/30 cursor-pointer group select-none"
                                        onClick={() => handleSort("runningBalance")}
                                    >
                                        <div className="flex items-center justify-end">
                                            Run. Balance
                                            <SortIcon columnKey="runningBalance" />
                                        </div>
                                    </TableHead>

                                    <TableHead
                                        className="w-[100px] text-right h-11 text-[10px] font-black uppercase tracking-widest cursor-pointer group select-none"
                                        onClick={() => handleSort("unitCost")}
                                    >
                                        <div className="flex items-center justify-end">
                                            Unit Cost
                                            <SortIcon columnKey="unitCost" />
                                        </div>
                                    </TableHead>

                                    <TableHead
                                        className="w-[110px] text-right h-11 text-[10px] font-black uppercase tracking-widest cursor-pointer group select-none"
                                        onClick={() => handleSort("differenceCost")}
                                    >
                                        <div className="flex items-center justify-end">
                                            Diff Cost
                                            <SortIcon columnKey="differenceCost" />
                                        </div>
                                    </TableHead>

                                    <TableHead className="w-[60px] text-center h-11 text-[10px] font-black uppercase tracking-widest pr-4">
                                        Action
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedData.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={12} className="text-center py-16 text-muted-foreground">
                                            <div className="flex flex-col items-center justify-center space-y-2">
                                                <Layers className="h-8 w-8 text-muted-foreground/40" />
                                                <p className="text-sm font-semibold">No movement records found</p>
                                                <p className="text-xs text-muted-foreground/70">
                                                    Try adjusting your search criteria, branch, or date filters.
                                                </p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    sortedData.map((row, idx) => {
                                        const isOut = row.movementDirection === "OUT" || Number(row.quantityOut) > 0;
                                        const isGood = row.inventoryCondition?.toUpperCase() === "GOOD";
                                        const isExpired = row.inventoryCondition?.toUpperCase() === "EXPIRED";
                                        const isDamaged = row.inventoryCondition?.toUpperCase() === "DAMAGED";
                                        const isQuarantined = row.inventoryCondition?.toUpperCase() === "QUARANTINED";

                                        return (
                                            <TableRow
                                                key={`${row.movementKey || row.referenceNo}-${idx}`}
                                                className="group hover:bg-muted/30 transition-colors border-muted/40 cursor-pointer"
                                                onClick={() => {
                                                    setSelectedMovement(row);
                                                    setIsDetailOpen(true);
                                                }}
                                            >
                                                {/* Date & Time */}
                                                <TableCell className="py-3.5 pl-5">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-foreground">
                                                            {row.transactionDate ? format(new Date(row.transactionDate), "MMM dd, yyyy") : "N/A"}
                                                        </span>
                                                        <span className="text-[10px] font-semibold text-muted-foreground opacity-70">
                                                            {row.transactionDate ? format(new Date(row.transactionDate), "HH:mm:ss") : ""}
                                                        </span>
                                                    </div>
                                                </TableCell>

                                                {/* Reference No */}
                                                <TableCell className="py-3.5">
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-mono text-xs font-bold text-foreground truncate max-w-[130px]" title={row.referenceNo}>
                                                            {row.referenceNo || "—"}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                copyToClipboard(row.referenceNo, `ref-${idx}`);
                                                            }}
                                                            className="text-muted-foreground/50 hover:text-foreground transition-opacity"
                                                        >
                                                            {copiedKey === `ref-${idx}` ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                                                        </button>
                                                    </div>
                                                    <span className="text-[10px] font-mono text-muted-foreground/60 block">
                                                        {row.movementKey}
                                                    </span>
                                                </TableCell>

                                                {/* Type & Module */}
                                                <TableCell className="text-center py-3.5">
                                                    <Badge variant="outline" className={cn(
                                                        "text-[9px] font-black uppercase tracking-wider py-0.5 px-2 rounded-full border shadow-2xs",
                                                        row.transactionType === "STOCK_TRANSFER" ? "border-blue-500/20 bg-blue-500/10 text-blue-600" :
                                                        row.transactionType === "STOCK_ADJUSTMENT" ? "border-purple-500/20 bg-purple-500/10 text-purple-600" :
                                                        row.transactionType === "PHYSICAL_INVENTORY" ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-600" :
                                                        "border-slate-500/20 bg-slate-500/10 text-slate-600"
                                                    )}>
                                                        {row.transactionType?.replace(/_/g, " ") || "MOVEMENT"}
                                                    </Badge>
                                                    <span className="text-[9px] font-mono text-muted-foreground/60 block mt-0.5">
                                                        {row.sourceModule}
                                                    </span>
                                                </TableCell>

                                                {/* Product */}
                                                <TableCell className="py-3.5">
                                                    <div className="flex flex-col max-w-[260px]">
                                                        <span className="text-xs font-bold text-foreground truncate" title={row.productName}>
                                                            {row.productName || "Unknown Product"}
                                                        </span>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                                            {row.productCode && <span className="font-mono">{row.productCode}</span>}
                                                            {row.productTypeName && (
                                                                <span className="opacity-70">• {row.productTypeName}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>

                                                {/* Batch & Condition */}
                                                <TableCell className="py-3.5">
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className="font-mono text-xs font-black text-foreground">
                                                            {row.batchNo || "N/A"}
                                                        </span>
                                                        <Badge className={cn(
                                                            "text-[9px] font-bold uppercase tracking-tight py-0 px-1.5 rounded-md border",
                                                            isGood ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                                            isExpired ? "bg-destructive/10 text-destructive border-destructive/20" :
                                                            isDamaged ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                                                            "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
                                                        )}>
                                                            {row.inventoryCondition || "GOOD"}
                                                        </Badge>
                                                    </div>
                                                </TableCell>

                                                {/* Direction */}
                                                <TableCell className="text-center py-3.5">
                                                    <Badge className={cn(
                                                        "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border shadow-2xs gap-0.5",
                                                        isOut ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                                    )}>
                                                        {isOut ? <ArrowDownRight className="h-2.5 w-2.5" /> : <ArrowUpRight className="h-2.5 w-2.5" />}
                                                        {isOut ? "OUT" : "IN"}
                                                    </Badge>
                                                </TableCell>

                                                {/* Qty In */}
                                                <TableCell className="text-right py-3.5 font-bold tabular-nums text-xs">
                                                    {Number(row.quantityIn) > 0 ? (
                                                        <span className="text-emerald-600 font-black">
                                                            +{Number(row.quantityIn).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground/40">—</span>
                                                    )}
                                                </TableCell>

                                                {/* Qty Out */}
                                                <TableCell className="text-right py-3.5 font-bold tabular-nums text-xs">
                                                    {Number(row.quantityOut) > 0 ? (
                                                        <span className="text-rose-600 font-black">
                                                            -{Number(row.quantityOut).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground/40">—</span>
                                                    )}
                                                </TableCell>

                                                {/* Running Balance */}
                                                <TableCell className="text-right py-3.5 font-black tabular-nums text-xs text-foreground bg-muted/20 px-4 border-l border-muted/30">
                                                    {row.runningBalance !== undefined ? (
                                                        <span>{Number(row.runningBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    ) : (
                                                        <span>—</span>
                                                    )}
                                                </TableCell>

                                                {/* Unit Cost */}
                                                <TableCell className="text-right py-3.5 font-medium tabular-nums text-xs text-muted-foreground">
                                                    ₱{Number(row.unitCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>

                                                {/* Difference Cost */}
                                                <TableCell className="text-right py-3.5 font-bold tabular-nums text-xs text-foreground">
                                                    ₱{Number(row.differenceCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>

                                                {/* Action */}
                                                <TableCell className="text-center py-3.5 pr-4">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedMovement(row);
                                                            setIsDetailOpen(true);
                                                        }}
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            )}

            {/* Grouped by Document View */}
            {viewMode === "by-doc" && (
                <div className="space-y-3">
                    {groupedByDoc.map((group, gIdx) => (
                        <Card key={group.refNo + gIdx} className="rounded-2xl border shadow-sm bg-card p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                                <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="font-mono text-xs font-black px-2.5 py-1">
                                        {group.refNo}
                                    </Badge>
                                    <Badge className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border-primary/20">
                                        {group.items.length} Movement{group.items.length > 1 ? "s" : ""}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {group.lastDate ? format(new Date(group.lastDate), "MMM dd, yyyy HH:mm") : ""}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-xs font-bold">
                                    {group.totalIn > 0 && <span className="text-emerald-600">In: +{group.totalIn.toLocaleString()}</span>}
                                    {group.totalOut > 0 && <span className="text-rose-600">Out: -{group.totalOut.toLocaleString()}</span>}
                                </div>
                            </div>

                            <div className="divide-y divide-muted/40">
                                {group.items.map((m, mIdx) => (
                                    <div
                                        key={mIdx}
                                        className="py-2.5 flex items-center justify-between text-xs hover:bg-muted/20 px-2 rounded-lg cursor-pointer"
                                        onClick={() => {
                                            setSelectedMovement(m);
                                            setIsDetailOpen(true);
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-foreground">{m.productName}</span>
                                            <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0">
                                                Batch: {m.batchNo || "N/A"}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className={cn("font-bold tabular-nums", m.movementDirection === "OUT" ? "text-rose-600" : "text-emerald-600")}>
                                                {m.movementDirection === "OUT" ? `-${m.quantityOut}` : `+${m.quantityIn}`}
                                            </span>
                                            <span className="text-muted-foreground font-mono">₱{m.unitCost}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Grouped by Batch View */}
            {viewMode === "by-batch" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {groupedByBatch.map((group, bIdx) => (
                        <Card
                            key={group.key + bIdx}
                            className="rounded-2xl border shadow-sm bg-card p-4 space-y-3 cursor-pointer hover:border-primary/50 hover:shadow-md hover:bg-muted/10 transition-all active:scale-[0.99] group select-none"
                            onClick={() => {
                                setSelectedBatch(group);
                                setIsBatchModalOpen(true);
                            }}
                        >
                            <div className="flex items-start justify-between">
                                <div className="space-y-0.5">
                                    <h4 className="text-xs font-black text-foreground group-hover:text-primary transition-colors">
                                        {group.main.productName}
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-[11px] font-black text-primary">
                                            Batch #{group.main.batchNo || "NO-BATCH"}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                            • {group.items.length} transaction{group.items.length > 1 ? "s" : ""}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Badge className={cn(
                                        "text-[9px] font-bold uppercase",
                                        group.main.inventoryCondition === "GOOD" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-destructive/10 text-destructive"
                                    )}>
                                        {group.main.inventoryCondition || "GOOD"}
                                    </Badge>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-muted/30 text-xs border">
                                <div>
                                    <span className="text-[10px] font-bold text-muted-foreground block">Inflow</span>
                                    <span className="font-black text-emerald-600">+{group.totalIn.toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-muted-foreground block">Outflow</span>
                                    <span className="font-black text-rose-600">-{group.totalOut.toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-muted-foreground block">Net Bal</span>
                                    <span className="font-black text-foreground">{group.balance.toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 group-hover:text-primary transition-colors pt-0.5 font-bold">
                                <span>Click to inspect batch ledger</span>
                                <span>View {group.items.length} records →</span>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Batch Movements History Modal */}
            <BatchMovementsModal
                batchGroup={selectedBatch}
                isOpen={isBatchModalOpen}
                onClose={() => {
                    setIsBatchModalOpen(false);
                    setSelectedBatch(null);
                }}
                onSelectMovement={(m) => {
                    setSelectedMovement(m);
                    setIsDetailOpen(true);
                }}
                branches={branches}
                products={products}
                lots={lots}
            />

            {/* Movement Detail Modal */}
            <MovementDetailModal
                movement={selectedMovement}
                isOpen={isDetailOpen}
                onClose={() => {
                    setIsDetailOpen(false);
                    setSelectedMovement(null);
                }}
                branches={branches}
                products={products}
                lots={lots}
                productTypes={productTypes}
                users={users}
            />

            {/* Report Preview Modal */}
            <TracingReportPreviewModal
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                html={previewHtml || ""}
                title="Product Movement Ledger Report"
                subtitle={productTypeName || branchName || "Manufacturing Inventory"}
            />
        </div>
    );
}
