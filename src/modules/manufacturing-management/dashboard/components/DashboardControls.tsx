import React from "react";
import { Search, RefreshCw } from "lucide-react";
import { PresetType } from "../types/dashboard.types";

interface DashboardControlsProps {
    startDate: string;
    setStartDate: (v: string) => void;
    endDate: string;
    setEndDate: (v: string) => void;
    activePreset: PresetType;
    handlePresetChange: (preset: PresetType) => void;
    handleCustomFilterSubmit: (e: React.FormEvent) => void;
    searchQuery: string;
    setSearchQuery: (v: string) => void;
    loading: boolean;
    onRefresh: () => void;
}

export function DashboardControls({
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    activePreset,
    handlePresetChange,
    handleCustomFilterSubmit,
    searchQuery,
    setSearchQuery,
    loading,
    onRefresh
}: DashboardControlsProps) {
    return (
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
                            onClick={() => handlePresetChange(p.id as PresetType)}
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
                    onClick={onRefresh}
                    disabled={loading}
                    title="Refresh Data"
                    className="bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-foreground p-2 rounded-xl flex items-center justify-center cursor-pointer transition-all disabled:opacity-50 shrink-0"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} />
                </button>
            </div>
        </div>
    );
}
