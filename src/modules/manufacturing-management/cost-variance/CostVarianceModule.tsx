"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { TrendingUp, TrendingDown, ClipboardList, Hammer, AlertTriangle, CheckCircle, BarChart3, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isJobOrderStatus, JOB_ORDER_STATUS } from "../job-order-status";

interface CostVarianceJobOrder {
    jo_id: string;
    product_id: string | number;
    product_name?: string;
    quantity?: string | number;
    status: string;
    branch_id?: string | number;
    allocationResults?: unknown[];
    components?: unknown[];
}

interface CostVarianceFinishedGood {
    id: number;
    jo_id: string;
    product_name?: string;
    quantity_produced?: string | number;
    unit_cost?: string | number;
    date_received?: string;
}

interface CostVarianceCatalogProduct {
    product_id: number;
    cost_per_unit?: number | string;
}

export default function CostVarianceModule() {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    
    // Database states
    const [jobOrders, setJobOrders] = useState<CostVarianceJobOrder[]>([]);
    const [finishedGoods, setFinishedGoods] = useState<CostVarianceFinishedGood[]>([]);
    const [catalogProducts, setCatalogProducts] = useState<CostVarianceCatalogProduct[]>([]);
    
    // Selection state for form
    const [selectedJoId, setSelectedJoId] = useState("");
    const [selectedJO, setSelectedJO] = useState<CostVarianceJobOrder | null>(null);

    // Logging form state
    const [form, setForm] = useState({
        expectedQty: "",
        actualQty: "",
        lotNumber: "",
        expirationDate: "",
        actualLaborHours: "",
        actualMaterialUsedKg: ""
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [joRes, fgRes, prodRes] = await Promise.all([
                fetch("/api/manufacturing/planning-engineering"),
                fetch("/api/manufacturing/production/finished-goods"),
                fetch("/api/manufacturing/finished-goods/products?limit=250")
            ]);

            if (joRes.ok && fgRes.ok) {
                const jos = await joRes.json();
                const fgs = await fgRes.json();
                setJobOrders(jos || []);
                setFinishedGoods(fgs || []);

                if (prodRes.ok) {
                    const prods = await prodRes.json();
                    setCatalogProducts(prods || []);
                }
            } else {
                throw new Error("Failed to load production cost data.");
            }
        } catch (e) {
            const err = e as { message?: string };
            console.error("Fetch cost variance error:", err);
            toast.error(err.message || "Failed to fetch cost variance data.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Map database receipts to cost variance logs list
    const logs = useMemo(() => {
        return finishedGoods.map((fg: CostVarianceFinishedGood) => {
            const jo = jobOrders.find(j => j.jo_id === fg.jo_id);
            const expectedQty = Number(jo?.quantity || fg.quantity_produced || 0);
            const actualQty = Number(fg.quantity_produced || 0);
            
            const variance = expectedQty > 0 ? ((actualQty - expectedQty) / expectedQty) * 100 : 0;
            const standardCost = Number(fg.unit_cost || 0);
            const actualCost = actualQty > 0 ? (standardCost * (expectedQty / actualQty)) : standardCost;

            return {
                id: fg.id,
                joNumber: fg.jo_id,
                productName: fg.product_name,
                date: fg.date_received ? fg.date_received.split("T")[0] : new Date().toISOString().split("T")[0],
                expectedQty,
                actualQty,
                variancePercent: Number(variance.toFixed(2)),
                status: Math.abs(variance) > 1.5 ? "Variance Flagged" : "Optimal Run",
                standardCost,
                actualCost
            };
        });
    }, [finishedGoods, jobOrders]);

    // Calculate real-time KPI metrics from database logs
    const kpis = useMemo(() => {
        if (logs.length === 0) {
            return {
                avgVariance: 0,
                flaggedCount: 0,
                optimalCount: 0
            };
        }

        const totalVariance = logs.reduce((sum, log) => sum + log.variancePercent, 0);
        const avgVariance = totalVariance / logs.length;
        const flaggedCount = logs.filter(log => log.status === "Variance Flagged").length;
        const optimalCount = logs.filter(log => log.status === "Optimal Run").length;

        return {
            avgVariance,
            flaggedCount,
            optimalCount
        };
    }, [logs]);

    // Filter job orders currently eligible for shopfloor log submissions
    const activeJOs = useMemo(() => {
        return jobOrders.filter(jo => isJobOrderStatus(
            jo.status,
            JOB_ORDER_STATUS.ONGOING,
            JOB_ORDER_STATUS.IN_PROGRESS,
            JOB_ORDER_STATUS.PROCEED,
            JOB_ORDER_STATUS.RELEASED,
            JOB_ORDER_STATUS.ON_HOLD,
            JOB_ORDER_STATUS.QA_HOLD
        ));
    }, [jobOrders]);

    // Handle Job Order selection inside form
    const handleJOSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const joId = e.target.value;
        setSelectedJoId(joId);

        if (!joId) {
            setSelectedJO(null);
            setForm({
                expectedQty: "",
                actualQty: "",
                lotNumber: "",
                expirationDate: "",
                actualLaborHours: "",
                actualMaterialUsedKg: ""
            });
            return;
        }

        const jo = activeJOs.find(j => j.jo_id === joId);
        setSelectedJO(jo || null);

        if (jo) {
            const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            setForm({
                expectedQty: String(jo.quantity || 0),
                actualQty: String(jo.quantity || 0),
                lotNumber: `LOT-SF-${jo.jo_id}`,
                expirationDate: oneYearFromNow,
                actualLaborHours: "",
                actualMaterialUsedKg: ""
            });
        }
    };

    const handleLogSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedJO || !form.actualQty) {
            toast.error("Please select a Job Order and input the actual produced quantity");
            return;
        }

        setSubmitting(true);
        try {
            const prodId = Number(selectedJO.product_id);
            const catalogProduct = catalogProducts.find(cp => Number(cp.product_id) === prodId);
            const unitCost = catalogProduct?.cost_per_unit || 45.50;

            const payload = {
                joId: selectedJO.jo_id,
                productId: prodId,
                productName: selectedJO.product_name,
                quantityProduced: Number(form.actualQty),
                branchId: Number(selectedJO.branch_id) || 182, // Default fallback branch
                lotNumber: form.lotNumber || `LOT-SF-${selectedJO.jo_id}`,
                expirationDate: form.expirationDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                unitCost: Number(unitCost),
                componentsConsumed: selectedJO.allocationResults || selectedJO.components || []
            };

            const res = await fetch("/api/manufacturing/production/finished-goods", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to release finished goods.");
            }

            toast.success(`Production Run for ${selectedJO.jo_id} completed and stock released successfully!`);
            
            // Reset states
            setSelectedJoId("");
            setSelectedJO(null);
            setForm({
                expectedQty: "",
                actualQty: "",
                lotNumber: "",
                expirationDate: "",
                actualLaborHours: "",
                actualMaterialUsedKg: ""
            });

            // Re-load data to sync tables and stats
            loadData();
        } catch (e) {
            const err = e as { message?: string };
            console.error("Submit shopfloor run error:", err);
            toast.error(err.message || "Failed to submit production run.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto p-1">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/10 p-5 border rounded-xl">
                <div className="space-y-1">
                    <h2 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                        <BarChart3 className="h-4.5 w-4.5 text-primary" />
                        Production Shopfloor Logs & Cost Variance
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                        Compare standard recipe yields against actual raw execution inputs. Log batches to track cost deviations.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="space-y-4 py-16 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                    <p className="text-xs text-muted-foreground font-semibold">Syncing cost variance reports...</p>
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="border rounded-xl bg-card p-5 shadow-sm flex justify-between items-center">
                            <div className="space-y-1">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Average Yield Variance</span>
                                <h3 className={`text-xl font-black ${kpis.avgVariance < 0 ? "text-red-500" : "text-emerald-500"}`}>
                                    {kpis.avgVariance > 0 ? "+" : ""}{kpis.avgVariance.toFixed(2)}%
                                </h3>
                            </div>
                            {kpis.avgVariance < 0 ? (
                                <TrendingDown className="h-8 w-8 text-red-500 bg-red-500/10 p-1.5 rounded-lg border border-red-500/20" />
                            ) : (
                                <TrendingUp className="h-8 w-8 text-emerald-500 bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20" />
                            )}
                        </div>
                        
                        <div className="border rounded-xl bg-card p-5 shadow-sm flex justify-between items-center">
                            <div className="space-y-1">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Batches Flagged</span>
                                <h3 className="text-xl font-black text-amber-500">{kpis.flaggedCount} Run{kpis.flaggedCount !== 1 ? "s" : ""}</h3>
                            </div>
                            <AlertTriangle className="h-8 w-8 text-amber-500 bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20" />
                        </div>

                        <div className="border rounded-xl bg-card p-5 shadow-sm flex justify-between items-center">
                            <div className="space-y-1">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Optimal Runs</span>
                                <h3 className="text-xl font-black text-emerald-500">{kpis.optimalCount} Run{kpis.optimalCount !== 1 ? "s" : ""}</h3>
                            </div>
                            <CheckCircle className="h-8 w-8 text-emerald-500 bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20" />
                        </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-3">
                        {/* Logs Table */}
                        <div className="md:col-span-2 border rounded-xl bg-card overflow-hidden shadow-sm flex flex-col">
                            <div className="p-4 border-b bg-muted/5">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <ClipboardList className="h-4 w-4 text-primary" />
                                    Production History & Cost Variance Logs
                                </h3>
                            </div>

                            <div className="divide-y overflow-y-auto max-h-[50dvh]">
                                {logs.length === 0 ? (
                                    <div className="p-12 text-center text-muted-foreground">
                                        <ClipboardList className="h-10 w-10 opacity-30 mx-auto mb-2" />
                                        <p className="text-xs font-bold">No completed runs recorded.</p>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">Submit a production log using the panel on the right to start tracking.</p>
                                    </div>
                                ) : (
                                    logs.map((log) => (
                                        <div key={log.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/10 transition-colors">
                                            <div className="space-y-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-extrabold text-xs text-foreground">{log.joNumber}</span>
                                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                                        log.status === "Optimal Run" 
                                                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
                                                            : "bg-red-500/10 text-red-600 border-red-500/20"
                                                    }`}>
                                                        {log.status}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground truncate">{log.productName}</p>
                                                <div className="flex gap-2 text-[10px] text-muted-foreground font-semibold">
                                                    <span>Target: {log.expectedQty.toLocaleString()} units</span>
                                                    <span>•</span>
                                                    <span>Actual: {log.actualQty.toLocaleString()} units</span>
                                                </div>
                                            </div>

                                            <div className="flex sm:flex-col items-end justify-between gap-1">
                                                <span className="text-[10px] text-muted-foreground font-mono">{log.date}</span>
                                                <div className="text-xs font-bold font-mono">
                                                    <span className="text-muted-foreground text-[10px]">Std: ₱{log.standardCost.toFixed(2)}</span>
                                                    <span className="text-muted-foreground mx-1">/</span>
                                                    <span className={log.actualCost > log.standardCost ? "text-red-500" : "text-emerald-500"}>
                                                        Act: ₱{log.actualCost.toFixed(2)}
                                                    </span>
                                                </div>
                                                <span className={`text-[10px] font-mono font-bold ${log.variancePercent < 0 ? "text-red-500" : "text-emerald-500"}`}>
                                                    {log.variancePercent > 0 ? "+" : ""}{log.variancePercent}% yield
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Shopfloor logger form */}
                        <div className="border rounded-xl bg-card p-5 shadow-sm space-y-4 flex flex-col h-fit">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b pb-2">
                                <Hammer className="h-4 w-4 text-primary" />
                                Log Actual Production Run
                            </h3>
                            
                            <form onSubmit={handleLogSubmit} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">JO Reference Number</label>
                                    <select
                                        required
                                        value={selectedJoId}
                                        onChange={handleJOSelectChange}
                                        className="w-full bg-background border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-semibold text-foreground"
                                    >
                                        <option value="">-- Select Active Job Order --</option>
                                        {activeJOs.map(jo => (
                                            <option key={jo.jo_id} value={jo.jo_id}>
                                                {jo.jo_id} - {jo.product_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {selectedJO && (
                                    <div className="space-y-1 bg-primary/5 p-3 rounded-lg border text-[11px] font-semibold text-muted-foreground">
                                        <p className="text-foreground font-bold">{selectedJO.product_name}</p>
                                        <p>Target Quantity: <strong className="text-foreground">{Number(form.expectedQty).toLocaleString()}</strong></p>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Actual Output Yield</label>
                                        <input
                                            type="number"
                                            required
                                            disabled={!selectedJO}
                                            placeholder="Quantity Produced"
                                            value={form.actualQty}
                                            onChange={e => setForm({...form, actualQty: e.target.value})}
                                            className="w-full bg-background border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-bold text-foreground"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Lot Number</label>
                                        <input
                                            type="text"
                                            disabled={!selectedJO}
                                            placeholder="Lot code"
                                            value={form.lotNumber}
                                            onChange={e => setForm({...form, lotNumber: e.target.value})}
                                            className="w-full bg-background border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-mono text-foreground"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Expiration Date</label>
                                        <input
                                            type="date"
                                            disabled={!selectedJO}
                                            value={form.expirationDate}
                                            onChange={e => setForm({...form, expirationDate: e.target.value})}
                                            className="w-full bg-background border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Actual Labor (Hrs)</label>
                                        <input
                                            type="number"
                                            disabled={!selectedJO}
                                            placeholder="Actual hours"
                                            value={form.actualLaborHours}
                                            onChange={e => setForm({...form, actualLaborHours: e.target.value})}
                                            className="w-full bg-background border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Raw Material (Kg)</label>
                                        <input
                                            type="number"
                                            disabled={!selectedJO}
                                            placeholder="Consumed kg"
                                            value={form.actualMaterialUsedKg}
                                            onChange={e => setForm({...form, actualMaterialUsedKg: e.target.value})}
                                            className="w-full bg-background border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={!selectedJO || submitting}
                                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all shadow-sm disabled:opacity-50"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Releasing & Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="h-3.5 w-3.5" />
                                            Submit Production Run
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
