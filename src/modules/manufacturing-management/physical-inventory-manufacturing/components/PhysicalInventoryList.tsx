"use client";

import React, { useState, useMemo, useCallback } from "react";
import { MmPhysicalInventorySheet, Branch, ProductType } from "../types";
import {
    Search,
    Plus,
    Eye,
    CheckCircle2,
    RotateCcw,
    XCircle,
    Send,
    RefreshCw,
    Tag,
    Building2,
    Calendar,
    UserCheck,
    FileSpreadsheet,
    Clock,
    AlertCircle,
    Sparkles,
} from "lucide-react";

interface Props {
    sheets: MmPhysicalInventorySheet[];
    branches: Branch[];
    productTypes?: ProductType[];
    loading: boolean;
    onRefresh: () => void;
    onCreateNew: () => void;
    onView: (sheet: MmPhysicalInventorySheet) => void;
    onEdit: (sheet: MmPhysicalInventorySheet) => void;
    onSubmit: (sheet: MmPhysicalInventorySheet) => void;
    onReturnToDraft: (sheet: MmPhysicalInventorySheet) => void;
    onCommit: (sheet: MmPhysicalInventorySheet) => void;
    onCancel: (sheet: MmPhysicalInventorySheet) => void;
}

export function formatQty(val: number | string | null | undefined): string {
    const num = Number(val || 0);
    if (!Number.isFinite(num)) return "0";
    if (Number.isInteger(num)) return num.toLocaleString("en-US");
    return parseFloat(num.toFixed(6)).toString();
}

export function formatMoney(val: number | string | null | undefined): string {
    const num = Number(val || 0);
    if (!Number.isFinite(num)) return "₱0.00";
    return `₱${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PhysicalInventoryList({
    sheets,
    branches,
    productTypes = [],
    loading,
    onRefresh,
    onCreateNew,
    onView,
    onSubmit,
    onReturnToDraft,
    onCommit,
    onCancel,
}: Props) {
    const [search, setSearch] = useState("");
    const [branchFilter, setBranchFilter] = useState("");
    const [productTypeFilter, setProductTypeFilter] = useState("");
    const [stockTypeFilter, setStockTypeFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    // Calculate KPI summary stats
    const stats = useMemo(() => {
        const total = sheets.length;
        const drafts = sheets.filter((s) => s.status === "DRAFT").length;
        const pending = sheets.filter((s) => s.status === "PENDING_REVIEW").length;
        const committed = sheets.filter((s) => s.status === "COMMITTED" || (s.status as string) === "POSTED").length;
        return { total, drafts, pending, committed };
    }, [sheets]);

    const getProductTypeName = useCallback((s: MmPhysicalInventorySheet): string => {
        const pt = s.product_type_id;
        if (!pt) return "All Product Types";

        let targetId = 0;
        if (typeof pt === "object" && pt !== null) {
            const obj = pt as unknown as Record<string, unknown>;
            const nameVal = obj.name || obj.type_name || obj.product_type_name;
            if (nameVal && typeof nameVal === "string" && nameVal.trim() !== "") {
                return nameVal;
            }
            targetId = Number(obj.id || obj.product_type_id || 0);
        } else {
            targetId = Number(pt);
        }

        if (targetId > 0) {
            const found = productTypes.find((item) => Number(item.id || (item as unknown as Record<string, unknown>).product_type_id) === targetId);
            if (found) return found.name || found.type_name || `Type #${targetId}`;
            return `Type #${targetId}`;
        }
        return "All Product Types";
    }, [productTypes]);

    const getBranchName = useCallback((b: unknown): string => {
        if (typeof b === "object" && b !== null) {
            const obj = b as { branch_name?: string; branchName?: string };
            return obj.branch_name || obj.branchName || "N/A";
        }
        const found = branches.find((item) => item.id === Number(b));
        return found ? (found.branch_name || found.branchName || `Branch #${b}`) : `Branch #${b || "N/A"}`;
    }, [branches]);

    const getEncoderName = (e: unknown): string => {
        if (typeof e === "object" && e !== null) {
            const userObj = e as { user_fname?: string; user_lname?: string; username?: string };
            const fullName = [userObj.user_fname, userObj.user_lname].filter(Boolean).join(" ");
            return fullName || userObj.username || "Encoder";
        }
        return e ? `User #${e}` : "System";
    };

    const filteredSheets = useMemo(() => {
        return sheets.filter((s) => {
            if (search) {
                const query = search.toLowerCase();
                const piMatch = s.pi_no.toLowerCase().includes(query);
                const bName = getBranchName(s.branch_id).toLowerCase();
                const ptName = getProductTypeName(s).toLowerCase();
                if (!piMatch && !bName.includes(query) && !ptName.includes(query)) return false;
            }

            if (branchFilter) {
                const bId = typeof s.branch_id === "object" ? s.branch_id?.id : s.branch_id;
                if (String(bId) !== String(branchFilter)) return false;
            }

            if (productTypeFilter) {
                const pt = s.product_type_id;
                const ptId = typeof pt === "object" && pt !== null ? Number((pt as { id?: number; product_type_id?: number }).id || (pt as { id?: number; product_type_id?: number }).product_type_id || 0) : Number(pt || 0);
                if (String(ptId) !== String(productTypeFilter)) return false;
            }

            if (stockTypeFilter && s.stock_type !== stockTypeFilter) {
                return false;
            }

            if (statusFilter && s.status !== statusFilter) {
                return false;
            }

            return true;
        });
    }, [sheets, search, branchFilter, productTypeFilter, stockTypeFilter, statusFilter, getBranchName, getProductTypeName]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "DRAFT":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <Clock className="w-3 h-3" />
                        DRAFT
                    </span>
                );
            case "PENDING_REVIEW":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                        <AlertCircle className="w-3 h-3" />
                        PENDING REVIEW
                    </span>
                );
            case "COMMITTED":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        COMMITTED
                    </span>
                );
            case "CANCELLED":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                        <XCircle className="w-3 h-3" />
                        CANCELLED
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border">
                        {status}
                    </span>
                );
        }
    };

    return (
        <div className="space-y-5">
            {/* Top KPI Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                <div className="bg-card/80 backdrop-blur-xs p-4 rounded-xl border border-border/60 shadow-2xs hover:shadow-xs transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Sheets</span>
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <FileSpreadsheet className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-2 text-2xl font-bold text-foreground">{stats.total}</div>
                </div>

                <div className="bg-card/80 backdrop-blur-xs p-4 rounded-xl border border-border/60 shadow-2xs hover:shadow-xs transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Draft Sheets</span>
                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <Clock className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-2 text-2xl font-bold text-foreground">{stats.drafts}</div>
                </div>

                <div className="bg-card/80 backdrop-blur-xs p-4 rounded-xl border border-border/60 shadow-2xs hover:shadow-xs transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Pending Review</span>
                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            <AlertCircle className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-2 text-2xl font-bold text-foreground">{stats.pending}</div>
                </div>

                <div className="bg-card/80 backdrop-blur-xs p-4 rounded-xl border border-border/60 shadow-2xs hover:shadow-xs transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Committed Sheets</span>
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-2 text-2xl font-bold text-foreground">{stats.committed}</div>
                </div>
            </div>

            {/* Filter & Action Toolbar */}
            <div className="bg-card p-4 rounded-xl border shadow-2xs space-y-3">
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5 flex-1">
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search by PI #, Branch, or Product Type..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
                            />
                        </div>

                        {/* Branch Filter */}
                        <select
                            value={branchFilter}
                            onChange={(e) => setBranchFilter(e.target.value)}
                            className="px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-all min-w-[140px]"
                        >
                            <option value="">All Branches</option>
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.branch_name || b.branchName || `Branch #${b.id}`}
                                </option>
                            ))}
                        </select>

                        {/* Product Type Filter */}
                        <select
                            value={productTypeFilter}
                            onChange={(e) => setProductTypeFilter(e.target.value)}
                            className="px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-all min-w-[160px]"
                        >
                            <option value="">All Product Types</option>
                            {productTypes.map((pt) => (
                                <option key={pt.id} value={pt.id}>
                                    {pt.name || pt.type_name || `Type #${pt.id}`}
                                </option>
                            ))}
                        </select>

                        {/* Stock Count Type Filter */}
                        <select
                            value={stockTypeFilter}
                            onChange={(e) => setStockTypeFilter(e.target.value)}
                            className="px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-all min-w-[140px]"
                        >
                            <option value="">All Count Types</option>
                            <option value="OPENING">Opening Inventory</option>
                            <option value="REGULAR">Regular Inventory</option>
                        </select>

                        {/* Status Filter */}
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-all min-w-[130px]"
                        >
                            <option value="">All Statuses</option>
                            <option value="DRAFT">Draft</option>
                            <option value="PENDING_REVIEW">Pending Review</option>
                            <option value="COMMITTED">Committed</option>
                            <option value="CANCELLED">Cancelled</option>
                        </select>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={onRefresh}
                            disabled={loading}
                            className="p-2.5 text-muted-foreground hover:text-foreground border rounded-lg hover:bg-accent/60 transition-colors disabled:opacity-50"
                            title="Refresh list"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        </button>

                        <button
                            onClick={onCreateNew}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-all shadow-sm active:scale-[0.98]"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Create Physical Inventory</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Table Card */}
            <div className="bg-card border rounded-xl shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-muted/60 border-b text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3.5">PI Number</th>
                                <th className="px-4 py-3.5">Branch</th>
                                <th className="px-4 py-3.5">Product Type Scope</th>
                                <th className="px-4 py-3.5">Stock Count Type</th>
                                <th className="px-4 py-3.5">Cutoff Dates</th>
                                <th className="px-4 py-3.5 text-right">Net Variance</th>
                                <th className="px-4 py-3.5 text-center">Status</th>
                                <th className="px-4 py-3.5">Encoder</th>
                                <th className="px-4 py-3.5 text-right">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-border/60">
                            {loading ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                                            <span className="text-sm font-medium">Loading Physical Inventories...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredSheets.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Sparkles className="w-8 h-8 text-muted-foreground/40" />
                                            <p className="font-medium text-foreground">No Physical Inventory Records Found</p>
                                            <p className="text-xs text-muted-foreground">Try clearing or adjusting your search filters above.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredSheets.map((s) => {
                                    const variance = s.total_variance || 0;
                                    const productTypeName = getProductTypeName(s);
                                    const isOpening = s.stock_type === "OPENING";

                                    return (
                                        <tr key={s.physical_inventory_id} className="hover:bg-muted/40 transition-colors group">
                                            {/* PI Number */}
                                            <td className="px-4 py-3.5">
                                                <div className="inline-flex items-center gap-1.5 font-mono font-bold text-foreground text-sm group-hover:text-primary transition-colors">
                                                    <span>{s.pi_no}</span>
                                                </div>
                                            </td>

                                            {/* Branch */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-2 font-medium text-foreground">
                                                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                    <span>{getBranchName(s.branch_id)}</span>
                                                </div>
                                            </td>

                                            {/* Product Type Scope Badge */}
                                            <td className="px-4 py-3.5">
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                                                    <Tag className="w-3 h-3 shrink-0" />
                                                    <span>{productTypeName}</span>
                                                </span>
                                            </td>

                                            {/* Stock Count Type */}
                                            <td className="px-4 py-3.5">
                                                {isOpening ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                                                        OPENING
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                                        REGULAR
                                                    </span>
                                                )}
                                            </td>

                                            {/* Dates */}
                                            <td className="px-4 py-3.5 text-xs text-muted-foreground">
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                                                    <div>
                                                        <div>Start: {s.starting_date ? s.starting_date.replace("T", " ") : "N/A"}</div>
                                                        <div>Cutoff: {s.cutoff_date ? s.cutoff_date.replace("T", " ") : "N/A"}</div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Net Variance */}
                                            <td className="px-4 py-3.5 text-right">
                                                {variance > 0 ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                                        +{formatQty(variance)}
                                                    </span>
                                                ) : variance < 0 ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400">
                                                        {formatQty(variance)}
                                                    </span>
                                                ) : (
                                                    <span className="font-mono text-xs text-muted-foreground font-medium">0</span>
                                                )}
                                            </td>

                                            {/* Status */}
                                            <td className="px-4 py-3.5 text-center">{getStatusBadge(s.status)}</td>

                                            {/* Encoder */}
                                            <td className="px-4 py-3.5 text-xs text-muted-foreground">
                                                <div className="flex items-center gap-1.5">
                                                    <UserCheck className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                                                    <span className="truncate max-w-[120px]">{getEncoderName(s.encoder_id)}</span>
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-4 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => onView(s)}
                                                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                                                        title="View Document"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </button>

                                                    {s.status === "DRAFT" && (
                                                        <>
                                                            <button
                                                                onClick={() => onSubmit(s)}
                                                                className="p-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-md transition-colors"
                                                                title="Submit for Review"
                                                            >
                                                                <Send className="h-4 w-4" />
                                                            </button>

                                                            <button
                                                                onClick={() => onCancel(s)}
                                                                className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md transition-colors"
                                                                title="Cancel Sheet"
                                                            >
                                                                <XCircle className="h-4 w-4" />
                                                            </button>
                                                        </>
                                                    )}

                                                    {s.status === "PENDING_REVIEW" && (
                                                        <>
                                                            <button
                                                                onClick={() => onReturnToDraft(s)}
                                                                className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-md transition-colors"
                                                                title="Return to Draft"
                                                            >
                                                                <RotateCcw className="h-4 w-4" />
                                                            </button>

                                                            <button
                                                                onClick={() => onCommit(s)}
                                                                className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-md transition-colors"
                                                                title="Commit Physical Inventory"
                                                            >
                                                                <CheckCircle2 className="h-4 w-4" />
                                                            </button>

                                                            <button
                                                                onClick={() => onCancel(s)}
                                                                className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md transition-colors"
                                                                title="Cancel Sheet"
                                                            >
                                                                <XCircle className="h-4 w-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
