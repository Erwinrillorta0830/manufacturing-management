"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
    RefreshCw,
    TrendingUp,
    TrendingDown,
    Calendar,
    History,
    Calculator,
    Edit3,
    CheckCircle2,
    AlertCircle,
    X,
    Search,
    ShieldCheck,
    Coins,
    Globe,
    Loader2
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type { ForexConfig, ForexRateHistory } from "@/app/api/manufacturing/procurement/forex/route";

export default function ForexManagementModule() {
    const [activeRates, setActiveRates] = useState<ForexConfig[]>([]);
    const [rateHistory, setRateHistory] = useState<ForexRateHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Modal state
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
    const [selectedConfig, setSelectedConfig] = useState<ForexConfig | null>(null);
    const [newRate, setNewRate] = useState<string>("");
    const [effectiveDate, setEffectiveDate] = useState<string>(
        new Date().toISOString().split("T")[0]
    );
    const [changeReason, setChangeReason] = useState<string>("");
    const [reasonError, setReasonError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [fetchingCloudRate, setFetchingCloudRate] = useState(false);
    const [isCloudSourcedRate, setIsCloudSourcedRate] = useState(false);

    // History filter & search state
    const [historySearch, setHistorySearch] = useState("");
    const [currencyFilter, setCurrencyFilter] = useState("ALL");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Interactive Converter & Simulator State
    const [convertCurrency, setConvertCurrency] = useState("USD");
    const [convertAmount, setConvertAmount] = useState<string>("10000");
    const [simulatedFluctuation, setSimulatedFluctuation] = useState<number>(0);

    const loadForexData = async (showToast = false) => {
        if (showToast) setRefreshing(true);
        else setLoading(true);

        try {
            const res = await fetch("/api/manufacturing/procurement/forex");
            if (!res.ok) throw new Error("Failed to fetch FOREX rate data");
            const data = await res.json();
            if (data.success) {
                setActiveRates(data.activeRates || []);
                setRateHistory(data.rateHistory || []);
                if (showToast) toast.success("FOREX rates & audit history refreshed");
            }
        } catch (e) {
            console.error("Error loading FOREX data:", e);
            toast.error("Error loading exchange rate data");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadForexData();
    }, []);

    const handleOpenUpdateModal = (config: ForexConfig) => {
        setSelectedConfig(config);
        setNewRate(config.exchange_rate.toString());
        setEffectiveDate(new Date().toISOString().split("T")[0]);
        setChangeReason("");
        setReasonError(null);
        setIsCloudSourcedRate(false);
        setIsUpdateModalOpen(true);
    };

    const handleCloseUpdateModal = () => {
        setIsUpdateModalOpen(false);
        setSelectedConfig(null);
        setReasonError(null);
        setIsCloudSourcedRate(false);
    };

    const handleFetchCloudRate = async () => {
        if (!selectedConfig) return;
        setFetchingCloudRate(true);
        try {
            const code = selectedConfig.currency_code.toUpperCase();
            const res = await fetch(`https://open.er-api.com/v6/latest/${code}`);
            if (!res.ok) throw new Error(`Cloud API HTTP error ${res.status}`);
            const data = await res.json();
            
            if (data && data.rates && typeof data.rates.PHP === "number") {
                const cloudPhpRate = Number(data.rates.PHP).toFixed(4);
                setNewRate(cloudPhpRate);
                setIsCloudSourcedRate(true);
                if (!changeReason.trim()) {
                    setChangeReason(`Live market sync via Open Exchange Rates Cloud API (${new Date().toLocaleDateString()})`);
                }
                toast.success(`Live cloud rate fetched: ₱${cloudPhpRate} per 1 ${code}`);
            } else {
                throw new Error("Invalid response format from Cloud FX API");
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Cloud rate fetch failed";
            console.error("Cloud FX fetch error:", err);
            toast.error(`Cloud FX Fetch Failed: ${msg}`);
        } finally {
            setFetchingCloudRate(false);
        }
    };

    const handleRateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setReasonError(null);

        if (!selectedConfig) return;

        const parsedRate = parseFloat(newRate);
        if (isNaN(parsedRate) || parsedRate <= 0) {
            toast.error("Please enter a valid exchange rate greater than 0");
            return;
        }

        if (!changeReason.trim()) {
            setReasonError("A change reason is mandatory for rate audit logging.");
            toast.error("Change reason is mandatory");
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch("/api/manufacturing/procurement/forex", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    forex_id: selectedConfig.forex_id,
                    currency_code: selectedConfig.currency_code,
                    new_rate: parsedRate,
                    effective_date: effectiveDate,
                    change_reason: changeReason.trim(),
                    changed_by_user_id: 1
                })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || "Failed to update FOREX rate");
            }

            toast.success(`Exchange rate for ${selectedConfig.currency_code} updated to ₱${parsedRate.toFixed(4)}`);
            if (data.activeRates) setActiveRates(data.activeRates);
            if (data.rateHistory) setRateHistory(data.rateHistory);
            handleCloseUpdateModal();
        } catch (e) {
            console.error(e);
            toast.error((e as Error).message || "Failed to submit exchange rate update");
        } finally {
            setSubmitting(false);
        }
    };

    // Derived delta calculation for Modal preview
    const rateDeltaPreview = useMemo(() => {
        if (!selectedConfig) return null;
        const current = selectedConfig.exchange_rate;
        const next = parseFloat(newRate);
        if (isNaN(next) || current <= 0) return null;

        const diff = next - current;
        const percent = (diff / current) * 100;
        return {
            diff,
            percent,
            isIncrease: diff > 0,
            isDecrease: diff < 0
        };
    }, [selectedConfig, newRate]);

    // Converter Calculations
    const activeRateForSelectedCurrency = useMemo(() => {
        const match = activeRates.find(r => r.currency_code === convertCurrency);
        return match ? match.exchange_rate : convertCurrency === "EUR" ? 63.2 : convertCurrency === "JPY" ? 0.385 : 58.5;
    }, [activeRates, convertCurrency]);

    const convertedBasePhp = useMemo(() => {
        const amt = parseFloat(convertAmount) || 0;
        return amt * activeRateForSelectedCurrency;
    }, [convertAmount, activeRateForSelectedCurrency]);

    const simulatedRate = useMemo(() => {
        return activeRateForSelectedCurrency * (1 + simulatedFluctuation / 100);
    }, [activeRateForSelectedCurrency, simulatedFluctuation]);

    const simulatedPhpTotal = useMemo(() => {
        const amt = parseFloat(convertAmount) || 0;
        return amt * simulatedRate;
    }, [convertAmount, simulatedRate]);

    const simulatedCostDifference = useMemo(() => {
        return simulatedPhpTotal - convertedBasePhp;
    }, [simulatedPhpTotal, convertedBasePhp]);

    // Filtered Audit History
    const filteredHistory = useMemo(() => {
        return rateHistory.filter(item => {
            const matchesCurrency = currencyFilter === "ALL" || item.currency_code === currencyFilter;
            const searchLower = historySearch.toLowerCase();
            const userName = item.changed_by_user_name ? item.changed_by_user_name.toLowerCase() : (item.changed_by_user_id ? `user #${item.changed_by_user_id}` : "system (cloud api)");
            const matchesSearch = !historySearch ||
                item.currency_code.toLowerCase().includes(searchLower) ||
                item.change_reason.toLowerCase().includes(searchLower) ||
                item.effective_date.includes(searchLower) ||
                userName.includes(searchLower);
                
            let logDate: Date;
            if (item.created_at) {
                // Remove time portion if any, or just parse to compare with dateFrom/To
                logDate = new Date(item.created_at.split(' ')[0] + 'T00:00:00');
            } else {
                logDate = new Date(item.effective_date);
            }
            
            const isAfterFrom = !dateFrom || logDate >= new Date(dateFrom);
            const isBeforeTo = !dateTo || logDate <= new Date(dateTo);

            return matchesCurrency && matchesSearch && isAfterFrom && isBeforeTo;
        });
    }, [rateHistory, currencyFilter, historySearch, dateFrom, dateTo]);

    // Pagination slice
    const paginatedHistory = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredHistory.slice(start, start + rowsPerPage);
    }, [filteredHistory, currentPage, rowsPerPage]);

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [currencyFilter, historySearch, dateFrom, dateTo, rowsPerPage]);

    if (loading) {
        return (
            <div className="space-y-6 flex flex-col h-full min-h-0 pr-1">
                {/* Header Banner Skeleton */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-5 border rounded-xl shadow-sm shrink-0">
                    <div className="space-y-2">
                        <Skeleton className="h-6 w-80" />
                        <Skeleton className="h-4 w-[28rem]" />
                    </div>
                    <Skeleton className="h-9 w-32 self-end sm:self-auto" />
                </div>

                {/* Active Rates Grid Skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 shrink-0">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
                            <div className="flex justify-between items-center">
                                <Skeleton className="h-5 w-24" />
                                <Skeleton className="h-6 w-16 rounded-full" />
                            </div>
                            <Skeleton className="h-10 w-48" />
                            <div className="flex justify-between items-center pt-2">
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-8 w-24 rounded-lg" />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Converter & Simulator Skeleton */}
                <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 shrink-0">
                    <div className="space-y-1 mb-6">
                        <Skeleton className="h-5 w-72" />
                        <Skeleton className="h-4 w-96" />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                        <div className="space-y-4">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-10 w-full rounded-lg" />
                            <Skeleton className="h-4 w-full mt-6" />
                        </div>
                        <div className="space-y-4 lg:border-l lg:pl-8">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-8 w-40 mt-4" />
                            <Skeleton className="h-4 w-32 mt-6" />
                        </div>
                        <div className="space-y-4 lg:border-l lg:pl-8">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-8 w-40 mt-4" />
                            <Skeleton className="h-4 w-24 mt-6" />
                        </div>
                    </div>
                </div>

                {/* Table Skeleton */}
                <div className="bg-card border rounded-xl shadow-sm flex flex-col flex-1 min-h-0">
                    <div className="p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="space-y-1">
                            <Skeleton className="h-5 w-64" />
                            <Skeleton className="h-4 w-80" />
                        </div>
                        <div className="flex gap-2 self-end sm:self-auto">
                            <Skeleton className="h-9 w-32 rounded-lg" />
                            <Skeleton className="h-9 w-48 rounded-lg" />
                        </div>
                    </div>
                    <div className="p-4 space-y-3">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 flex flex-col h-full min-h-0 overflow-y-auto pr-1">
            {/* Header Banner */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-5 border rounded-xl shadow-sm shrink-0">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Globe className="h-5 w-5" />
                        </div>
                        <h2 className="text-base font-extrabold text-foreground tracking-tight">
                            Foreign Exchange (FOREX) Rates & Audit Management
                        </h2>
                    </div>
                    <p className="text-xs text-muted-foreground pl-9">
                        Manage baseline exchange rates against Philippine Peso (PHP), perform landed cost simulations, and inspect immutable change audit logs.
                    </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                        onClick={() => loadForexData(true)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-background hover:bg-muted text-xs font-semibold text-foreground transition-all shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                        Refresh Rates
                    </button>
                </div>
            </div>

            {/* Active FOREX Rates Cards */}
            <div className="space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Coins className="h-4 w-4 text-primary" />
                        Active Exchange Rates Against PHP (Base Currency)
                    </h3>
                    <span className="text-[11px] text-muted-foreground">
                        {activeRates.length} Foreign Currencies Configured
                    </span>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-40 rounded-xl border bg-card/50 animate-pulse p-5" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {activeRates.map((config) => (
                            <div
                                key={config.forex_id}
                                className="group relative border rounded-xl bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all flex flex-col justify-between"
                            >
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary font-bold text-sm flex items-center justify-center font-mono">
                                                {config.symbol}
                                            </span>
                                            <div>
                                                <h4 className="text-sm font-extrabold text-foreground flex items-center gap-1">
                                                    {config.currency_code}
                                                    <span className="text-xs font-normal text-muted-foreground">/ PHP</span>
                                                </h4>
                                                <span className="text-[11px] text-muted-foreground block font-medium">
                                                    {config.currency_name}
                                                </span>
                                            </div>
                                        </div>

                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                            <ShieldCheck className="h-3 w-3" />
                                            Active
                                        </span>
                                    </div>

                                    <div className="pt-2">
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="text-3xl font-black text-foreground font-mono tracking-tight">
                                                ₱{config.exchange_rate.toFixed(4)}
                                            </span>
                                            <span className="text-xs text-muted-foreground font-medium">
                                                PHP per 1 {config.currency_code}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 pt-3 border-t flex items-center justify-between text-xs">
                                    <div className="space-y-0.5">
                                        <span className="text-[10px] text-muted-foreground block font-semibold">Effective Date</span>
                                        <span className="text-foreground font-mono text-[11px] flex items-center gap-1">
                                            <Calendar className="h-3 w-3 text-muted-foreground" />
                                            {config.effective_date}
                                        </span>
                                    </div>

                                    <button
                                        onClick={() => handleOpenUpdateModal(config)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground text-xs font-semibold transition-all"
                                    >
                                        <Edit3 className="h-3.5 w-3.5" />
                                        Update Rate
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Interactive Converter / Simulator Widget */}
            <div className="border rounded-xl bg-card p-6 shadow-sm space-y-5 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Calculator className="h-4 w-4 text-primary" />
                            Interactive Forex Converter & Volatility Simulator
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                            Simulate total PHP procurement expenditures against custom FX rate fluctuations (+/- %).
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
                    {/* Input Controls */}
                    <div className="md:col-span-5 space-y-4 bg-muted/20 p-4 border rounded-xl">
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                                Target Currency & Amount
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <select
                                    value={convertCurrency}
                                    onChange={(e) => setConvertCurrency(e.target.value)}
                                    className="col-span-1 bg-background border rounded-lg px-2.5 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                                >
                                    {activeRates.map(r => (
                                        <option key={r.currency_code} value={r.currency_code}>
                                            {r.currency_code} ({r.symbol})
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    min="0"
                                    value={convertAmount}
                                    onChange={(e) => setConvertAmount(e.target.value)}
                                    placeholder="Enter Amount"
                                    className="col-span-2 bg-background border rounded-lg px-3 py-2 text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t">
                            <div className="flex justify-between items-center text-xs">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                                    Simulate Rate Fluctuation (%)
                                </label>
                                <span className={`font-mono font-bold ${simulatedFluctuation > 0 ? "text-amber-500" : simulatedFluctuation < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                                    {simulatedFluctuation > 0 ? `+${simulatedFluctuation}%` : `${simulatedFluctuation}%`}
                                </span>
                            </div>
                            <input
                                type="range"
                                min="-10"
                                max="10"
                                step="0.5"
                                value={simulatedFluctuation}
                                onChange={(e) => setSimulatedFluctuation(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                                <span>-10% (Favorable)</span>
                                <button
                                    onClick={() => setSimulatedFluctuation(0)}
                                    className="text-primary hover:underline font-semibold"
                                >
                                    Reset (0%)
                                </button>
                                <span>+10% (Unfavorable)</span>
                            </div>
                        </div>
                    </div>

                    {/* Results Display */}
                    <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Baseline Box */}
                        <div className="bg-muted/10 border rounded-xl p-4 flex flex-col justify-between space-y-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Active Standard Rate Conversion
                            </span>

                            <div>
                                <span className="text-xs text-muted-foreground block font-medium">
                                    {convertAmount} {convertCurrency} @ ₱{activeRateForSelectedCurrency.toFixed(4)}
                                </span>
                                <span className="text-2xl font-black text-foreground font-mono tracking-tight block">
                                    ₱{convertedBasePhp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>

                            <span className="text-[10px] text-muted-foreground">Standard Landed Cost Value</span>
                        </div>

                        {/* Simulated Volatility Box */}
                        <div className={`border rounded-xl p-4 flex flex-col justify-between space-y-3 ${simulatedFluctuation !== 0 ? "bg-primary/5 border-primary/30" : "bg-muted/10"}`}>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                    Simulated FX Rate
                                </span>
                                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-muted">
                                    ₱{simulatedRate.toFixed(4)}
                                </span>
                            </div>

                            <div>
                                <span className="text-[11px] text-muted-foreground block font-medium">
                                    Simulated PHP Value
                                </span>
                                <span className="text-2xl font-black text-foreground font-mono tracking-tight block">
                                    ₱{simulatedPhpTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>

                            <div className="flex items-center justify-between text-xs font-semibold pt-1 border-t">
                                <span className="text-[10px] text-muted-foreground">Projected Impact:</span>
                                <span className={`font-mono text-xs ${simulatedCostDifference > 0 ? "text-red-500 font-extrabold" : simulatedCostDifference < 0 ? "text-emerald-500 font-extrabold" : "text-muted-foreground"}`}>
                                    {simulatedCostDifference > 0 ? `+₱${simulatedCostDifference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₱${simulatedCostDifference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Historical Audit Log Timeline Table */}
            <div className="border rounded-xl bg-card p-6 shadow-sm space-y-4 shrink-0">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="space-y-0.5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <History className="h-4 w-4 text-primary" />
                            Exchange Rate Historical Audit Log
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                            Chronological history of rate adjustments, recorded previous vs updated values, and change reasons.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        {/* Date Range filters */}
                        <div className="relative flex items-center gap-2">
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="bg-background border rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary w-32"
                                title="Date From"
                            />
                            <span className="text-muted-foreground text-xs font-semibold">to</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="bg-background border rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary w-32"
                                title="Date To"
                            />
                        </div>

                        {/* Currency filter */}
                        <div className="relative">
                            <select
                                value={currencyFilter}
                                onChange={(e) => setCurrencyFilter(e.target.value)}
                                className="bg-background border rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="ALL">All Currencies</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="JPY">JPY</option>
                            </select>
                        </div>

                        {/* Search input */}
                        <div className="relative flex-1 sm:w-56">
                            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search history..."
                                value={historySearch}
                                onChange={(e) => setHistorySearch(e.target.value)}
                                className="w-full bg-background border rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    </div>
                </div>

                <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 border-b text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                            <tr>
                                <th className="p-3">Timestamp / Effective</th>
                                <th className="p-3">Currency</th>
                                <th className="p-3">Previous Rate</th>
                                <th className="p-3">New Rate</th>
                                <th className="p-3">Delta (%)</th>
                                <th className="p-3">Updated By</th>
                                <th className="p-3">Change Reason Note</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y font-medium">
                            {paginatedHistory.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-muted-foreground text-xs">
                                        No historical audit logs match your search filter.
                                    </td>
                                </tr>
                            ) : (
                                paginatedHistory.map((log) => {
                                    const diff = log.new_rate - log.previous_rate;
                                    const percent = log.previous_rate > 0 ? (diff / log.previous_rate) * 100 : 0;

                                    return (
                                        <tr key={log.history_id} className="hover:bg-muted/10 transition-colors">
                                            <td className="p-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                                                {log.created_at ? new Date(log.created_at).toLocaleString() : log.effective_date}
                                            </td>
                                            <td className="p-3 font-bold text-foreground">
                                                <span className="px-2 py-0.5 rounded bg-muted text-[11px] font-mono">
                                                    {log.currency_code}
                                                </span>
                                            </td>
                                            <td className="p-3 font-mono text-muted-foreground">
                                                ₱{log.previous_rate.toFixed(4)}
                                            </td>
                                            <td className="p-3 font-mono font-bold text-foreground">
                                                ₱{log.new_rate.toFixed(4)}
                                            </td>
                                            <td className="p-3 font-mono whitespace-nowrap">
                                                {diff === 0 ? (
                                                    <span className="text-muted-foreground font-semibold">0.00%</span>
                                                ) : diff > 0 ? (
                                                    <span className="inline-flex items-center gap-0.5 text-amber-500 font-extrabold">
                                                        <TrendingUp className="h-3 w-3" />
                                                        +{percent.toFixed(2)}% (+₱{diff.toFixed(2)})
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-0.5 text-emerald-500 font-extrabold">
                                                        <TrendingDown className="h-3 w-3" />
                                                        {percent.toFixed(2)}% (₱{diff.toFixed(2)})
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-muted-foreground">
                                                {!log.changed_by_user_id ? (
                                                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 font-semibold text-[10px]">
                                                        System (Cloud API)
                                                    </span>
                                                ) : (
                                                    <span>
                                                        {log.changed_by_user_name || `User #${log.changed_by_user_id}`}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-foreground font-normal max-w-xs truncate" title={log.change_reason}>
                                                {log.change_reason}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Rows per page:</span>
                        <select
                            value={rowsPerPage}
                            onChange={(e) => {
                                setRowsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="bg-background border rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">
                            Page {currentPage} of {Math.max(1, Math.ceil(filteredHistory.length / rowsPerPage))} ({filteredHistory.length} total)
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 border rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredHistory.length / rowsPerPage), p + 1))}
                                disabled={currentPage >= Math.ceil(filteredHistory.length / rowsPerPage)}
                                className="px-3 py-1 border rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Rate Update Modal */}
            {isUpdateModalOpen && selectedConfig && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-card border rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between p-4 border-b bg-muted/20">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    <Edit3 className="h-4 w-4" />
                                </div>
                                <h3 className="text-sm font-bold text-foreground">
                                    Update FOREX Rate: {selectedConfig.currency_code}
                                </h3>
                            </div>
                            <button
                                onClick={handleCloseUpdateModal}
                                className="p-1 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <form onSubmit={handleRateSubmit} className="p-5 space-y-4">
                            {/* Current rate indicator */}
                            <div className="p-3 border rounded-lg bg-muted/10 flex justify-between items-center text-xs">
                                <span className="text-muted-foreground font-medium">Current Standard Rate</span>
                                <span className="font-mono font-bold text-foreground">
                                    ₱{selectedConfig.exchange_rate.toFixed(4)} PHP
                                </span>
                            </div>

                            {/* New Rate Input */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                                        New Exchange Rate (PHP) <span className="text-red-500">*</span>
                                    </label>
                                    <button
                                        type="button"
                                        disabled={fetchingCloudRate}
                                        onClick={handleFetchCloudRate}
                                        className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-2.5 py-1 rounded-md transition-all cursor-pointer disabled:opacity-50"
                                        title="Fetch live market exchange rate from Cloud API (open.er-api.com)"
                                    >
                                        {fetchingCloudRate ? (
                                            <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                                        ) : (
                                            <Globe className="h-3 w-3 text-blue-600" />
                                        )}
                                        {fetchingCloudRate ? "Fetching Cloud..." : "Fetch Cloud Rate"}
                                    </button>
                                </div>
                                <div className="relative">
                                    <span className="absolute left-3 top-2 text-xs text-muted-foreground font-semibold">₱</span>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        min="0.0001"
                                        required
                                        value={newRate}
                                        onChange={(e) => {
                                            setNewRate(e.target.value);
                                            if (isCloudSourcedRate) {
                                                setIsCloudSourcedRate(false);
                                                setChangeReason("");
                                            }
                                        }}
                                        placeholder="58.5000"
                                        className="w-full bg-background border rounded-lg pl-7 pr-3 py-2 text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                            </div>

                            {/* Delta Preview */}
                            {rateDeltaPreview && (
                                <div className="text-xs flex items-center justify-between p-2.5 rounded-lg border bg-muted/5 font-mono">
                                    <span className="text-[11px] text-muted-foreground font-sans">Calculated Variance:</span>
                                    <span className={`font-bold ${rateDeltaPreview.isIncrease ? "text-amber-500" : rateDeltaPreview.isDecrease ? "text-emerald-500" : "text-muted-foreground"}`}>
                                        {rateDeltaPreview.percent > 0 ? `+${rateDeltaPreview.percent.toFixed(2)}%` : `${rateDeltaPreview.percent.toFixed(2)}%`}
                                        {" "}({rateDeltaPreview.diff > 0 ? `+₱${rateDeltaPreview.diff.toFixed(4)}` : `₱${rateDeltaPreview.diff.toFixed(4)}`})
                                    </span>
                                </div>
                            )}

                            {/* Effective Date Picker */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                                    Effective Date <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={effectiveDate}
                                    onChange={(e) => setEffectiveDate(e.target.value)}
                                    className="w-full bg-background border rounded-lg px-3 py-2 text-xs font-mono font-semibold outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            {/* Change Reason (Mandatory) */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block flex justify-between items-center">
                                    <span>Change Reason Note <span className="text-red-500">*</span></span>
                                    <span className="text-[10px] text-muted-foreground font-normal">Mandatory Audit Log</span>
                                </label>
                                <textarea
                                    rows={3}
                                    required
                                    value={changeReason}
                                    onChange={(e) => {
                                        setChangeReason(e.target.value);
                                        if (e.target.value.trim()) setReasonError(null);
                                    }}
                                    placeholder="e.g. BSP Daily Central Bank Adjustment, Monthly Treasury Sync, Freight Volatility Adjustment..."
                                    className={`w-full bg-background border rounded-lg p-3 text-xs outline-none focus:ring-1 ${reasonError ? "border-red-500 focus:ring-red-500" : "focus:ring-primary"}`}
                                />
                                {reasonError && (
                                    <p className="text-[11px] text-red-500 font-semibold flex items-center gap-1 mt-1">
                                        <AlertCircle className="h-3 w-3" />
                                        {reasonError}
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-2 pt-2 border-t">
                                <button
                                    type="button"
                                    onClick={handleCloseUpdateModal}
                                    className="flex-1 py-2 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/95 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    {submitting ? (
                                        <>
                                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                            Saving Audit Log...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            Confirm & Update
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
