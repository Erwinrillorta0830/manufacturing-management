"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
    TrendingUp, 
    DollarSign, 
    Layers, 
    AlertTriangle,
    ClipboardList,
    Loader2,
    RefreshCw,
    Search,
    ChevronRight,
    Trash2,
    ShoppingBag,
    Boxes,
    Activity
} from "lucide-react";
import { 
    BarChart, 
    Bar, 
    Cell,
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    PieChart,
    Pie,
    Legend
} from "recharts";
import { toast } from "sonner";

interface ProducibleGood {
    product_id: number;
    product_name: string;
    uom_name?: string;
    product_code: string;
    category: string;
    bom_name: string;
    base_quantity: number;
    max_producible: number;
    producible_if_fulfilled?: number | null;
    estimated_time_hours?: number;
    estimated_time_hours_if_fulfilled?: number | null;
    components: Array<{
        product_id: number;
        component_name: string;
        component_code: string;
        unit: string;
        required_per_unit: number;
        available: number;
        max_producible_with_this: number;
    }>;
}

interface ProductionRun {
    jo_id: string;
    status: string;
    product_name: string;
    quantity: number;
    percentage: number;
    progress_text: string;
    due_date: string | null;
}

interface DashboardData {
    wastage: {
        totalQuantity: number;
        totalValue: number;
        items: Array<{ name: string; code: string; qty: number; value: number; reason: string }>;
    };
    production: {
        totalQuantity: number;
        totalValue: number;
        items: Array<{ name: string; code: string; qty: number; value: number }>;
    };
    inventory: {
        rawMaterials: {
            totalSKUs: number;
            totalStock: number;
            totalValue: number;
            items: Array<{
                product_id: number;
                product_name: string;
                product_code: string;
                category: string;
                unit: string;
                unit_shortcut: string;
                cost: number;
                price: number;
                stock: number;
                value: number;
            }>;
        };
        finishedGoods: {
            totalSKUs: number;
            totalStock: number;
            totalValue: number;
            items: Array<{
                product_id: number;
                product_name: string;
                product_code: string;
                category: string;
                unit: string;
                unit_shortcut: string;
                cost: number;
                price: number;
                stock: number;
                value: number;
            }>;
        };
    };
    sellout: {
        totalQuantity: number;
        totalRevenue: number;
        items: Array<{ name: string; code: string; qty: number; revenue: number }>;
    };
    producibleGoods?: ProducibleGood[];
    branches: Array<{ id: number; branch_name: string }>;
    ongoingProduction?: {
        overallPercentage: number;
        runs: ProductionRun[];
    };
}

export default function DashboardModule() {
    // 📅 Date Range States (default to This Month)
    const getFirstDayOfMonth = () => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    };
    const getToday = () => {
        return new Date().toISOString().split('T')[0];
    };

    const [startDate, setStartDate] = useState(getFirstDayOfMonth());
    const [endDate, setEndDate] = useState(getToday());
    const [activePreset, setActivePreset] = useState<"7d" | "30d" | "month" | "last_month" | "all">("month");
    
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"production" | "raw" | "finished" | "sellout" | "producible">("production");
    const [searchQuery, setSearchQuery] = useState("");

    // Expand states for tables
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

    const toggleRow = (key: string) => {
        setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Load data from BFF
    const loadDashboardData = async (start = startDate, end = endDate) => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            if (start) queryParams.append("startDate", start);
            if (end) queryParams.append("endDate", end);

            const res = await fetch(`/api/manufacturing/dashboard?${queryParams.toString()}`);
            if (res.ok) {
                const json = await res.json();
                setData(json);
            } else {
                throw new Error("Failed to load dashboard metrics from backend");
            }
        } catch (e) {
            const error = e as Error;
            console.error(error);
            toast.error(error.message || "Error loading dashboard metrics");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDashboardData(startDate, endDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Apply presets
    const handlePresetChange = (preset: "7d" | "30d" | "month" | "last_month" | "all") => {
        setActivePreset(preset);
        const today = new Date();
        let start = "";
        let end = getToday();

        if (preset === "7d") {
            const d = new Date();
            d.setDate(today.getDate() - 7);
            start = d.toISOString().split('T')[0];
        } else if (preset === "30d") {
            const d = new Date();
            d.setDate(today.getDate() - 30);
            start = d.toISOString().split('T')[0];
        } else if (preset === "month") {
            start = getFirstDayOfMonth();
        } else if (preset === "last_month") {
            const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const last = new Date(today.getFullYear(), today.getMonth(), 0);
            start = first.toISOString().split('T')[0];
            end = last.toISOString().split('T')[0];
        } else if (preset === "all") {
            start = "";
            end = "";
        }

        setStartDate(start);
        setEndDate(end);
        loadDashboardData(start, end);
    };

    const handleCustomFilterSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setActivePreset("all");
        loadDashboardData(startDate, endDate);
    };

    // Filter Raw Materials
    const filteredRaw = useMemo(() => {
        if (!data) return [];
        return data.inventory.rawMaterials.items.filter(item => {
            const query = searchQuery.toLowerCase();
            return item.product_name.toLowerCase().includes(query) || 
                   item.product_code.toLowerCase().includes(query) ||
                   item.category.toLowerCase().includes(query);
        });
    }, [data, searchQuery]);

    // Filter Finished Goods
    const filteredFG = useMemo(() => {
        if (!data) return [];
        return data.inventory.finishedGoods.items.filter(item => {
            const query = searchQuery.toLowerCase();
            return item.product_name.toLowerCase().includes(query) || 
                   item.product_code.toLowerCase().includes(query) ||
                   item.category.toLowerCase().includes(query);
        });
    }, [data, searchQuery]);

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center p-24 gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs font-semibold">Generating dashboard intelligence reports...</span>
            </div>
        );
    }

    // Colors for graphs
    const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

    // Format comparative data product-by-product for Top Products
    const productionWastageChartData = data ? (() => {
        const prodMap: Record<string, { name: string; Produced: number; Wasted: number }> = {};
        
        data.production.items.forEach(item => {
            const name = item.name.length > 15 ? item.name.substring(0, 15) + "..." : item.name;
            if (!prodMap[item.code]) {
                prodMap[item.code] = { name, Produced: 0, Wasted: 0 };
            }
            prodMap[item.code].Produced += item.value;
        });

        data.wastage.items.forEach(item => {
            const name = item.name.length > 15 ? item.name.substring(0, 15) + "..." : item.name;
            if (!prodMap[item.code]) {
                prodMap[item.code] = { name, Produced: 0, Wasted: 0 };
            }
            prodMap[item.code].Wasted += item.value;
        });

        return Object.values(prodMap)
            .sort((a, b) => (b.Produced + b.Wasted) - (a.Produced + a.Wasted))
            .slice(0, 6);
    })() : [];

    const yieldEfficiency = data ? (() => {
        const prod = data.production.totalValue || 0;
        const waste = data.wastage.totalValue || 0;
        const total = prod + waste;
        return total > 0 ? (prod / total) * 100 : 100;
    })() : 100;

    const selloutChartData = data ? data.sellout.items.slice(0, 5).map(item => ({
        name: item.name.length > 15 ? item.name.substring(0, 15) + "..." : item.name,
        value: item.revenue
    })) : [];

    return (
        <div className="space-y-6">
            {/* Header section */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
                <div>
                    <h1 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
                        <Boxes className="h-6 w-6 text-primary" />
                        Executive Dashboard & Reports
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Consolidated analysis of production values, scrap wastage rates, inventory valuations, and sellout volume records.
                    </p>
                </div>
            </div>

            {/* Filter and Presets Controls Card */}
            <div className="w-full bg-slate-100/30 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800/80 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xs">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Presets segment */}
                    <div className="flex bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-1 rounded-xl">
                        {[
                            { id: "7d", label: "7 Days" },
                            { id: "30d", label: "30 Days" },
                            { id: "month", label: "This Month" },
                            { id: "last_month", label: "Last Month" },
                            { id: "all", label: "All Time" }
                        ].map((p) => (
                            <button
                                key={p.id}
                                onClick={() => handlePresetChange(p.id as "7d" | "30d" | "month" | "last_month" | "all")}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border-none transition-all cursor-pointer ${
                                    activePreset === p.id 
                                        ? "bg-primary text-primary-foreground shadow-xs" 
                                        : "text-muted-foreground hover:text-foreground bg-transparent"
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Date Inputs form */}
                    <form onSubmit={handleCustomFilterSubmit} className="flex items-center gap-2 border border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/60 p-1 rounded-xl">
                        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider pl-1.5">From</span>
                        <input 
                            type="date" 
                            value={startDate} 
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-transparent border-none text-xs text-foreground font-semibold px-2 py-1 outline-none cursor-pointer"
                        />
                        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">To</span>
                        <input 
                            type="date" 
                            value={endDate} 
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-transparent border-none text-xs text-foreground font-semibold px-2 py-1 outline-none cursor-pointer"
                        />
                        <button 
                            type="submit"
                            className="bg-primary/10 hover:bg-primary/20 text-primary hover:text-primary/90 text-xs font-extrabold px-3 py-1.5 rounded-lg cursor-pointer transition-all border-none"
                        >
                            Apply Filter
                        </button>
                    </form>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    {/* Global Product Search */}
                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search products across dashboard..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary font-medium"
                        />
                    </div>

                    <button 
                        onClick={() => loadDashboardData(startDate, endDate)}
                        disabled={loading}
                        title="Refresh Data"
                        className="bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-foreground p-2 rounded-xl flex items-center justify-center cursor-pointer transition-all disabled:opacity-50 shrink-0"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} />
                    </button>
                </div>
            </div>

            {/* Top KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Production Value */}
                <div className="bg-card border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between shadow-xs hover:scale-[1.01] transition-transform duration-250">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Production Value</span>
                        <h4 className="text-xl font-black text-foreground mt-1.5">
                            ₱{data?.production.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
                        </h4>
                        <span className="text-[9px] text-primary block mt-1 font-semibold flex items-center gap-0.5">
                            Based on finished goods receipts
                        </span>
                    </div>
                    <div className="bg-primary/10 dark:bg-primary/20 p-3 rounded-lg border border-primary/20">
                        <DollarSign className="h-5 w-5 text-primary" />
                    </div>
                </div>

                {/* 2. Total Produced Volume */}
                <div className="bg-card border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between shadow-xs hover:scale-[1.01] transition-transform duration-250">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Total Produced</span>
                        <h4 className="text-xl font-black text-foreground mt-1.5">
                            {data?.production.totalQuantity.toLocaleString() || "0"} <span className="text-xs text-muted-foreground font-normal">Units</span>
                        </h4>
                        <span className="text-[9px] text-muted-foreground block mt-1 font-semibold">
                            Consolidated manufactured lots
                        </span>
                    </div>
                    <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-3 rounded-lg border border-emerald-500/20">
                        <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                </div>

                {/* 3. Wastage & Scrap Value */}
                <div className="bg-card border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between shadow-xs hover:scale-[1.01] transition-transform duration-250">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Wastage / Scrap</span>
                        <h4 className={`text-xl font-black mt-1.5 ${data && data.wastage.totalValue > 0 ? "text-rose-500" : "text-foreground"}`}>
                            ₱{data?.wastage.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
                        </h4>
                        <span className="text-[9px] text-rose-400 block mt-1 font-semibold flex items-center gap-0.5">
                            {data?.wastage.totalQuantity.toLocaleString() || 0} units lost in period
                        </span>
                    </div>
                    <div className="bg-rose-500/10 dark:bg-rose-500/20 p-3 rounded-lg border border-rose-500/20">
                        <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 animate-pulse" />
                    </div>
                </div>

                {/* 4. Sellout Revenue */}
                <div className="bg-card border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between shadow-xs hover:scale-[1.01] transition-transform duration-250">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Sellout (Sales Value)</span>
                        <h4 className="text-xl font-black text-amber-500 mt-1.5">
                            ₱{data?.sellout.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
                        </h4>
                        <span className="text-[9px] text-muted-foreground block mt-1 font-semibold">
                            Total invoiced customer sales
                        </span>
                    </div>
                    <div className="bg-amber-500/10 dark:bg-amber-500/20 p-3 rounded-lg border border-amber-500/20">
                        <ShoppingBag className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                </div>
            </div>

            {/* Ongoing Production Run Progress Breakdown */}
            {data?.ongoingProduction?.runs && data.ongoingProduction.runs.length > 0 && (
                <div className="bg-card border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div>
                            <h3 className="text-xs font-black text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                <Activity className="h-4 w-4 text-primary animate-pulse" />
                                Ongoing Production Run Progress
                            </h3>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                Real-time completion rates of active job orders compiled from shopfloor execution checklists.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase">Overall Completion:</span>
                            <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-black px-2.5 py-0.5 rounded-lg">
                                {data.ongoingProduction.overallPercentage}%
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {data.ongoingProduction.runs.map((run: ProductionRun) => (
                            <div key={run.jo_id} className="bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-200 dark:border-slate-800 transition-colors">
                                <div className="flex justify-between items-start gap-3">
                                    <div className="space-y-0.5">
                                        <span className="text-[10px] font-black text-primary uppercase tracking-wide">
                                            {run.jo_id}
                                        </span>
                                        <h4 className="text-xs font-bold text-foreground line-clamp-1 font-sans">
                                            {run.product_name}
                                        </h4>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                                            run.status === "Ongoing" 
                                                ? "bg-primary/10 border-primary/25 text-primary" 
                                                : run.status === "On Hold" 
                                                    ? "bg-amber-500/10 border-amber-500/25 text-amber-500" 
                                                    : "bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-muted-foreground"
                                        }`}>
                                            {run.status}
                                        </span>
                                        {run.due_date && (
                                            <span className="text-[8px] text-muted-foreground font-semibold">
                                                Due: {run.due_date}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-muted-foreground font-semibold">{run.progress_text}</span>
                                        <span className="font-extrabold text-foreground">{run.percentage}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-200 dark:border-slate-800">
                                        <div 
                                            className="bg-primary h-full rounded-full transition-all duration-500" 
                                            style={{ width: `${run.percentage}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* View navigation Tab Bar */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-card p-4 space-y-4">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div className="flex flex-wrap bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 p-1 rounded-lg gap-1 w-full lg:w-auto justify-start">
                        <button
                            onClick={() => { setActiveTab("production"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                                activeTab === "production" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                        >
                            <TrendingUp className="h-4 w-4" /> Production & Wastage
                        </button>
                        <button
                            onClick={() => { setActiveTab("raw"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                                activeTab === "raw" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                        >
                            <Layers className="h-4 w-4" /> Raw Materials Inventory
                        </button>
                        <button
                            onClick={() => { setActiveTab("finished"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                                activeTab === "finished" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                        >
                            <Boxes className="h-4 w-4" /> Finished Goods Inventory
                        </button>
                        <button
                            onClick={() => { setActiveTab("producible"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                                activeTab === "producible" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                        >
                            <ClipboardList className="h-4 w-4" /> Producible Right Now
                        </button>
                        <button
                            onClick={() => { setActiveTab("sellout"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                                activeTab === "sellout" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                        >
                            <ShoppingBag className="h-4 w-4" /> Sellout Reports
                        </button>
                    </div>
                </div>

                {/* Search Bar for inventory tabs */}
                {(activeTab === "raw" || activeTab === "finished") && (
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Filter inventory table by product name, code, or category..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-background border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                        />
                    </div>
                )}

                {/* 📊 Tab Content Area */}
                <div className="overflow-x-auto">
                    
                    {/* Tab 1: Production & Wastage Report */}
                    {activeTab === "production" && (
                        <div className="space-y-6">
                            {/* KPI Metrics row */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="bg-card border border-slate-200 dark:border-slate-800/80 p-4 rounded-xl space-y-1">
                                    <span className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Total Production Cost</span>
                                    <div className="text-lg font-black text-emerald-500">
                                        ₱{data?.production.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </div>
                                    <span className="text-[9px] text-muted-foreground block">{data?.production.totalQuantity.toLocaleString()} units produced</span>
                                </div>
                                <div className="bg-card border border-slate-200 dark:border-slate-800/80 p-4 rounded-xl space-y-1">
                                    <span className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Total Wastage Cost</span>
                                    <div className="text-lg font-black text-rose-500">
                                        ₱{data?.wastage.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </div>
                                    <span className="text-[9px] text-muted-foreground block">{data?.wastage.totalQuantity.toLocaleString()} units wasted</span>
                                </div>
                                <div className="bg-card border border-slate-200 dark:border-slate-800/80 p-4 rounded-xl space-y-1">
                                    <span className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Yield Efficiency Rate</span>
                                    <div className={`text-lg font-black ${yieldEfficiency >= 90 ? "text-emerald-500" : yieldEfficiency >= 75 ? "text-amber-500" : "text-rose-500"}`}>
                                        {yieldEfficiency.toFixed(1)}%
                                    </div>
                                    <span className="text-[9px] text-muted-foreground block">Cost balance ratio</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* chart */}
                                <div className="lg:col-span-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4 rounded-xl">
                                    <h3 className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider">Production vs. Wastage Valuation (Top Products)</h3>
                                    <div className="h-[260px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={productionWastageChartData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                                                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} />
                                                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(val) => `₱${(val / 1000).toFixed(0)}k`} />
                                                <Tooltip 
                                                    contentStyle={{ 
                                                        backgroundColor: "hsl(var(--popover))", 
                                                        borderColor: "hsl(var(--border))",
                                                        color: "hsl(var(--popover-foreground))",
                                                        borderRadius: "8px",
                                                        fontSize: "11px",
                                                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)"
                                                    }}
                                                    itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                                                    labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600, marginBottom: "4px" }}
                                                    formatter={(value: string | number) => [`₱${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, undefined]}
                                                />
                                                <Legend 
                                                    layout="horizontal" 
                                                    align="right" 
                                                    verticalAlign="top" 
                                                    iconSize={8}
                                                    wrapperStyle={{ fontSize: '10px', paddingBottom: '10px' }}
                                                />
                                                <Bar dataKey="Produced" fill="#10b981" radius={[3, 3, 0, 0]} name="Produced Cost" />
                                                <Bar dataKey="Wasted" fill="#ef4444" radius={[3, 3, 0, 0]} name="Wastage Cost" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Wastage Summary List */}
                                <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/5 p-4 rounded-xl flex flex-col justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold text-rose-500 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                                            <Trash2 className="h-4 w-4" /> Period Wastage Breakdown
                                        </h3>
                                        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                                            {data?.wastage.items && data.wastage.items.length > 0 ? (
                                                data.wastage.items.map((item, i) => (
                                                    <div key={i} className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800/60 pb-2 last:border-0 last:pb-0">
                                                        <div>
                                                            <span className="text-xs font-bold text-foreground block truncate max-w-[150px]">{item.name}</span>
                                                            <span className="text-[9px] text-muted-foreground">{item.code} • {item.reason}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-xs font-bold text-rose-400 block">₱{item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                            <span className="text-[9px] text-muted-foreground">{item.qty.toLocaleString()} units lost</span>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-xs text-muted-foreground italic text-center py-8">No scrap or wastage records registered in this time period.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Produced Items Table */}
                            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/10">
                                <div className="px-4 py-3 bg-slate-100 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800">
                                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Manufactured Output Items Log</h4>
                                </div>
                                <table className="w-full border-collapse text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-slate-800 text-muted-foreground bg-slate-50 dark:bg-slate-950/20 font-bold">
                                            <th className="py-2.5 px-4">Product Details</th>
                                            <th className="py-2.5 px-4 text-right">Quantity Manufactured</th>
                                            <th className="py-2.5 px-4 text-right">Production Cost Valuation</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data?.production.items && data.production.items.length > 0 ? (
                                            data.production.items.map((item, i) => (
                                                <tr key={i} className="border-b border-slate-200/30 dark:border-slate-800/30 last:border-0 hover:bg-slate-50/50 dark:bg-slate-950/10">
                                                    <td className="py-3 px-4">
                                                        <div>
                                                            <span className="font-bold text-foreground block">{item.name}</span>
                                                            <span className="text-[9px] text-muted-foreground">Code: {item.code}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-semibold text-foreground">
                                                        {item.qty.toLocaleString()} Units
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-extrabold text-primary">
                                                        ₱{item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={3} className="py-8 text-center text-muted-foreground italic">No job order output lots received in this range.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Tab 2: Raw Materials Inventory */}
                    {activeTab === "raw" && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950/20 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="text-xs text-muted-foreground font-bold">Valuation of Raw Stocks:</span>
                                <span className="text-xs font-black text-foreground">
                                    ₱{data?.inventory.rawMaterials.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({data?.inventory.rawMaterials.totalSKUs} active SKUs)
                                </span>
                            </div>

                            <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-800 text-muted-foreground font-bold bg-slate-50 dark:bg-slate-950/20">
                                        <th className="py-2.5 px-4">SKU Name / Category</th>
                                        <th className="py-2.5 px-4 text-right">Current Stock Level</th>
                                        <th className="py-2.5 px-4 text-right hidden sm:table-cell">Standard Unit Cost</th>
                                        <th className="py-2.5 px-4 text-right hidden md:table-cell font-bold">Total Stock Value</th>
                                        <th className="py-2.5 px-4">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRaw.map((item, idx) => {
                                        const isLow = item.stock < 100;
                                        const isRowExpanded = !!expandedRows[`raw-${item.product_id}`];
                                        return (
                                            <React.Fragment key={item.product_id || idx}>
                                                <tr 
                                                    className="border-b border-slate-200/30 dark:border-slate-800/30 last:border-b-0 hover:bg-slate-50/50 dark:bg-slate-950/10 cursor-pointer select-none"
                                                    onClick={() => toggleRow(`raw-${item.product_id}`)}
                                                >
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center gap-1.5">
                                                            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isRowExpanded ? "rotate-90 text-primary" : ""}`} />
                                                            <div>
                                                                <span className="font-bold text-foreground block">{item.product_name}</span>
                                                                <span className="text-[9px] text-muted-foreground font-mono">{item.product_code} • {item.category}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-semibold text-foreground">
                                                        {item.stock.toLocaleString()} {item.unit_shortcut}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-medium text-muted-foreground hidden sm:table-cell">
                                                        ₱{item.cost.toFixed(2)}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-bold text-foreground hidden md:table-cell">
                                                        ₱{item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${
                                                            item.stock < 0
                                                                ? "bg-red-500/10 text-red-500 border-red-500/20"
                                                                : isLow 
                                                                ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                                                                : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                        }`}>
                                                            {item.stock < 0 ? "Deficit" : isLow ? "Low Stock" : "Safe Stock"}
                                                        </span>
                                                    </td>
                                                </tr>
                                                {isRowExpanded && (
                                                    <tr className="bg-slate-50/50 dark:bg-slate-950/15 border-b border-slate-200/30 dark:border-slate-800/30">
                                                        <td colSpan={5} className="p-4">
                                                            <div className="border-l-2 border-primary/45 pl-4 py-1.5 space-y-2">
                                                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Raw Material Valuation Audit</div>
                                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                                                    <div className="p-2 rounded-lg bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                                                        <div className="text-[9px] text-muted-foreground uppercase font-bold">Standard Cost</div>
                                                                        <div className="text-xs font-semibold text-foreground mt-0.5">₱{item.cost.toFixed(2)} / {item.unit}</div>
                                                                    </div>
                                                                    <div className="p-2 rounded-lg bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                                                        <div className="text-[9px] text-muted-foreground uppercase font-bold">Suggested Base Selling Price</div>
                                                                        <div className="text-xs font-semibold text-foreground mt-0.5">₱{item.price.toFixed(2)}</div>
                                                                    </div>
                                                                    <div className="p-2 rounded-lg bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                                                        <div className="text-[9px] text-muted-foreground uppercase font-bold">Consolidated Valuation</div>
                                                                        <div className="text-xs font-semibold text-foreground mt-0.5">₱{item.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}

                                    {filteredRaw.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-muted-foreground">No raw materials matched search filters.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Tab 3: Finished Goods Inventory */}
                    {activeTab === "finished" && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950/20 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="text-xs text-muted-foreground font-bold">Valuation of Finished Lots:</span>
                                <span className="text-xs font-black text-primary">
                                    ₱{data?.inventory.finishedGoods.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({data?.inventory.finishedGoods.totalSKUs} manufactured products)
                                </span>
                            </div>

                            <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-800 text-muted-foreground font-bold bg-slate-50 dark:bg-slate-950/20">
                                        <th className="py-2.5 px-4">SKU Name / Category</th>
                                        <th className="py-2.5 px-4 text-right">Manufactured Stock Balance</th>
                                        <th className="py-2.5 px-4 text-right hidden sm:table-cell">Production Landed Cost</th>
                                        <th className="py-2.5 px-4 text-right hidden md:table-cell font-bold">Asset Inventory Value</th>
                                        <th className="py-2.5 px-4">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredFG.map((item, idx) => {
                                        const isLow = item.stock < 50;
                                        const isRowExpanded = !!expandedRows[`fg-${item.product_id}`];
                                        return (
                                            <React.Fragment key={item.product_id || idx}>
                                                <tr 
                                                    className="border-b border-slate-200/30 dark:border-slate-800/30 last:border-b-0 hover:bg-slate-50/50 dark:bg-slate-950/10 cursor-pointer select-none"
                                                    onClick={() => toggleRow(`fg-${item.product_id}`)}
                                                >
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center gap-1.5">
                                                            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isRowExpanded ? "rotate-90 text-primary" : ""}`} />
                                                            <div>
                                                                <span className="font-bold text-foreground block">{item.product_name}</span>
                                                                <span className="text-[9px] text-muted-foreground font-mono">{item.product_code} • {item.category}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-semibold text-foreground">
                                                        {item.stock.toLocaleString()} {item.unit_shortcut}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-medium text-muted-foreground hidden sm:table-cell">
                                                        ₱{item.cost.toFixed(2)}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-bold text-foreground hidden md:table-cell">
                                                        ₱{item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${
                                                            item.stock < 0
                                                                ? "bg-red-500/10 text-red-500 border-red-500/20"
                                                                : isLow 
                                                                ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                                                                : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                        }`}>
                                                            {item.stock < 0 ? "Shortage Deficit" : isLow ? "Low Stock" : "Available Safe"}
                                                        </span>
                                                    </td>
                                                </tr>
                                                {isRowExpanded && (
                                                    <tr className="bg-slate-50/50 dark:bg-slate-950/15 border-b border-slate-200/30 dark:border-slate-800/30">
                                                        <td colSpan={5} className="p-4">
                                                            <div className="border-l-2 border-primary/45 pl-4 py-1.5 space-y-2">
                                                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Manufactured Item Inventory Valuation</div>
                                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                                                    <div className="p-2 rounded-lg bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                                                        <div className="text-[9px] text-muted-foreground uppercase font-bold">Standard Cost</div>
                                                                        <div className="text-xs font-semibold text-foreground mt-0.5">₱{item.cost.toFixed(2)} / {item.unit}</div>
                                                                    </div>
                                                                    <div className="p-2 rounded-lg bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                                                        <div className="text-[9px] text-muted-foreground uppercase font-bold">Suggested Base Selling Price</div>
                                                                        <div className="text-xs font-semibold text-foreground mt-0.5">₱{item.price.toFixed(2)}</div>
                                                                    </div>
                                                                    <div className="p-2 rounded-lg bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                                                        <div className="text-[9px] text-muted-foreground uppercase font-bold">Consolidated Valuation</div>
                                                                        <div className="text-xs font-semibold text-foreground mt-0.5">₱{item.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}

                                    {filteredFG.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-muted-foreground">No finished goods matched search filters.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Tab 4: Sellout Reports */}
                    {activeTab === "sellout" && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Sellout Pie Chart */}
                                <div className="lg:col-span-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4 rounded-xl">
                                    <h3 className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider">Top-Selling Finished Goods Distribution</h3>
                                    <div className="h-[260px] w-full flex items-center justify-center">
                                        {selloutChartData.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={selloutChartData}
                                                        cx="50%"
                                                        cy="50%"
                                                        labelLine={false}
                                                        outerRadius={70}
                                                        fill="#8884d8"
                                                        dataKey="value"
                                                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                                                    >
                                                        {selloutChartData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip 
                                                        contentStyle={{ 
                                                            backgroundColor: "hsl(var(--popover))", 
                                                            borderColor: "hsl(var(--border))",
                                                            color: "hsl(var(--popover-foreground))",
                                                            borderRadius: "8px",
                                                            fontSize: "11px",
                                                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)"
                                                        }}
                                                        itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                                                        labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600 }}
                                                        formatter={(value: number | string) => `₱${Number(value).toLocaleString()}`}
                                                    />
                                                    <Legend 
                                                        layout="horizontal" 
                                                        align="center" 
                                                        verticalAlign="bottom" 
                                                        iconSize={8} 
                                                        wrapperStyle={{ fontSize: '9px', color: 'var(--muted-foreground)' }} 
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">No sellout transactions logged in period.</span>
                                        )}
                                    </div>
                                </div>

                                {/* Top products summary list */}
                                <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/5 p-4 rounded-xl flex flex-col justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold text-amber-500 mb-3 uppercase tracking-wider">Top Products by Revenue</h3>
                                        <div className="space-y-3">
                                            {data?.sellout.items && data.sellout.items.length > 0 ? (
                                                data.sellout.items.slice(0, 6).map((item, i) => (
                                                    <div key={i} className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800/60 pb-2 last:border-0 last:pb-0">
                                                        <div>
                                                            <span className="text-xs font-bold text-foreground block truncate max-w-[160px]">{item.name}</span>
                                                            <span className="text-[9px] text-muted-foreground">{item.code}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-xs font-bold text-foreground block">₱{item.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                            <span className="text-[9px] text-muted-foreground">{item.qty.toLocaleString()} units sold</span>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-xs text-muted-foreground italic text-center py-8">No sales data compiled.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Sales Detail Grid */}
                            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/10">
                                <div className="px-4 py-3 bg-slate-100 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800">
                                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Detailed Sellout Ledger Log</h4>
                                </div>
                                <table className="w-full border-collapse text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-slate-800 text-muted-foreground bg-slate-50 dark:bg-slate-950/20 font-bold">
                                            <th className="py-2.5 px-4">SKU Product</th>
                                            <th className="py-2.5 px-4 text-right">Units Sold</th>
                                            <th className="py-2.5 px-4 text-right">Total Net Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data?.sellout.items && data.sellout.items.length > 0 ? (
                                            data.sellout.items.map((item, i) => (
                                                <tr key={i} className="border-b border-slate-200/30 dark:border-slate-800/30 last:border-0 hover:bg-slate-50/50 dark:bg-slate-950/10">
                                                    <td className="py-3 px-4">
                                                        <div>
                                                            <span className="font-bold text-foreground block">{item.name}</span>
                                                            <span className="text-[9px] text-muted-foreground">Code: {item.code}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-semibold text-foreground">
                                                        {item.qty.toLocaleString()} Units
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-extrabold text-amber-500">
                                                        ₱{item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={3} className="py-8 text-center text-muted-foreground italic">No sellout transactions logged.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Tab 5: Producible Right Now */}
                    {activeTab === "producible" && (
                        <div className="space-y-6">
                            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/10">
                                <div className="px-4 py-4 bg-slate-100 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                    <div>
                                        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <TrendingUp className="h-4.5 w-4.5 text-primary" />
                                            Maximum Producible Quantities (MRP Engine)
                                        </h4>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                            Real-time inventory calculation analyzing active recipes (BOMs) against raw material stock levels.
                                        </p>
                                    </div>
                                    <div className="relative w-full sm:w-64">
                                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                        <input
                                            type="text"
                                            placeholder="Search finished goods..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="w-full bg-background border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground"
                                        />
                                    </div>
                                </div>
                                <div className="p-4 space-y-4">
                                    {(!data?.producibleGoods || data.producibleGoods.length === 0) ? (
                                        <div className="p-8 text-center text-xs text-muted-foreground italic">
                                            No active recipe formulas (BOMs) loaded to compute MRP potentials.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-card">
                                            <table className="w-full border-collapse text-left text-xs">
                                                <thead>
                                                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] text-muted-foreground uppercase font-black bg-slate-50 dark:bg-slate-900/50">
                                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80">Category</th>
                                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80">SKU Code</th>
                                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80">Product</th>
                                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80">UOM</th>
                                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80">Recipe Version</th>
                                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80 text-right">Producible RN</th>
                                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80 text-right text-blue-500">If Bottleneck Solved</th>
                                                        <th className="py-3 px-4 font-bold">Raw Mats Breakdown</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {data.producibleGoods
                                                        .filter(good => 
                                                            good.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                            good.product_code.toLowerCase().includes(searchQuery.toLowerCase())
                                                        )
                                                        .map((good: ProducibleGood, idx: number) => {
                                                            return (
                                                                <tr key={idx} className="border-b border-slate-200/60 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors font-mono">
                                                                    <td className="py-2.5 px-4 text-muted-foreground border-r border-slate-200/60 dark:border-slate-800/60 font-sans">{good.category}</td>
                                                                    <td className="py-2.5 px-4 text-muted-foreground border-r border-slate-200/60 dark:border-slate-800/60">{good.product_code}</td>
                                                                    <td className="py-2.5 px-4 font-bold text-foreground border-r border-slate-200/60 dark:border-slate-800/60 font-sans">{good.product_name}</td>
                                                                    <td className="py-2.5 px-4 text-muted-foreground border-r border-slate-200/60 dark:border-slate-800/60 font-sans">{good.uom_name || "-"}</td>
                                                                    <td className="py-2.5 px-4 text-primary font-bold border-r border-slate-200/60 dark:border-slate-800/60 font-sans">{good.bom_name}</td>
                                                                    <td className="py-2.5 px-4 text-right border-r border-slate-200/60 dark:border-slate-800/60">
                                                                        <div>
                                                                            {good.max_producible > 0 ? (
                                                                                <span className="text-emerald-500 font-extrabold">{good.max_producible.toLocaleString()} units</span>
                                                                            ) : (
                                                                                <span className="text-rose-500 font-extrabold">0 (Shortage)</span>
                                                                            )}
                                                                        </div>
                                                                        {good.max_producible > 0 && good.estimated_time_hours !== undefined && (
                                                                            <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
                                                                                Est: {good.estimated_time_hours.toLocaleString()} hrs
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2.5 px-4 text-right border-r border-slate-200/60 dark:border-slate-800/60 text-blue-500">
                                                                        <div>
                                                                            {good.producible_if_fulfilled !== undefined && good.producible_if_fulfilled !== null ? (
                                                                                good.producible_if_fulfilled === Infinity ? (
                                                                                    <span className="text-blue-500 font-extrabold">Unlimited</span>
                                                                                ) : (
                                                                                    <span className="text-blue-500 font-extrabold">{good.producible_if_fulfilled.toLocaleString()} units</span>
                                                                                )
                                                                            ) : (
                                                                                <span className="text-muted-foreground">-</span>
                                                                            )}
                                                                        </div>
                                                                        {good.producible_if_fulfilled !== undefined && good.producible_if_fulfilled !== null && good.estimated_time_hours_if_fulfilled !== undefined && good.estimated_time_hours_if_fulfilled !== null && (
                                                                            <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
                                                                                Est: {good.estimated_time_hours_if_fulfilled.toLocaleString()} hrs
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2.5 px-4">
                                                                        <div className="space-y-1 font-sans text-[10px] min-w-[240px]">
                                                                            {good.components.map((c, ci) => {
                                                                                const isBottleneck = c.max_producible_with_this === good.max_producible;
                                                                                return (
                                                                                    <div key={ci} className={`flex justify-between items-center gap-2 border-b border-slate-100 dark:border-slate-800/40 pb-0.5 last:border-0 last:pb-0 ${isBottleneck ? "text-rose-500 font-extrabold bg-rose-500/[0.03] px-1 rounded" : "text-muted-foreground"}`}>
                                                                                        <span className="truncate max-w-[120px] font-semibold" title={c.component_name}>{c.component_name}</span>
                                                                                        <span className="font-mono text-[9px] font-semibold">{c.available.toLocaleString()} / {c.required_per_unit.toFixed(2)} ({c.max_producible_with_this.toLocaleString()})</span>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
