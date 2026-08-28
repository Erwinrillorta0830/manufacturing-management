// src/modules/financial-management/accounting/customers-memo/components/CustomersMemoCreationModule.tsx

"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Save, Loader2, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    fetchSuppliers,
    fetchCustomers,
    fetchSalesmen,
    fetchCOAs,
    fetchNextMemoNumber,
    saveMemo
} from "../service";
import {
    Supplier,
    Customer,
    Salesman,
    ChartOfAccount
} from "../types";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// Optimized Sub-components
import { HeaderForm } from "./HeaderForm";

export default function CustomersMemoCreationModule() {
    // 1. Master Data State
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [salesmen, setSalesmen] = useState<Salesman[]>([]);
    const [coas, setCoas] = useState<ChartOfAccount[]>([]);
    const [loadingInitial, setLoadingInitial] = useState(true);

    // 2. Form State
    const [selectedSupplier, setSelectedSupplier] = useState<string>("");
    const [selectedCustomer, setSelectedCustomer] = useState<string>("");
    const [selectedSalesman, setSelectedSalesman] = useState<string>("");
    const [selectedCOA, setSelectedCOA] = useState<string>("");
    const [balanceType, setBalanceType] = useState<number>(1);
    const [amount, setAmount] = useState<number>(0);
    const [memoNumber, setMemoNumber] = useState<string>("(Auto-generated)");
    const [reason, setReason] = useState<string>("");

    // 3. (Removed Lookup results & Allocation states)

    // 5. Initial Data Loading
    useEffect(() => {
        const load = async () => {
            try {
                const [s, c, sl, co] = await Promise.all([
                    fetchSuppliers(), fetchCustomers(), fetchSalesmen(), fetchCOAs()
                ]);
                setSuppliers(s);
                setCustomers(c);
                setSalesmen(sl);
                setCoas(co);
            } catch {
                toast.error("Lookup data sync failed.");
            } finally {
                setLoadingInitial(false);
            }
        };
        load();
    }, []);

    // 6. Memo Number Calculation
    useEffect(() => {
        if (!selectedSupplier) {
            setMemoNumber("(Auto-generated)");
            return;
        }
        const s = suppliers.find(x => x.id === Number(selectedSupplier));
        if (s?.supplier_shortcut) {
            fetchNextMemoNumber(s.supplier_shortcut).then(setMemoNumber);
        }
    }, [selectedSupplier, suppliers]);

    // 10. (Removed allocation logic, grouping, and handlers)
    const isBalanced = amount > 0 && selectedSupplier && selectedCustomer && selectedSalesman && selectedCOA;

    // 11. Orchestrated Submission
    const [submitting, setSubmitting] = useState(false);
    const handleSave = async () => {
        if (!isBalanced) return;
        if (!selectedSupplier || !selectedCustomer || !selectedSalesman || !selectedCOA) {
            toast.error("Please ensure all header fields are complete.");
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                header: {
                    memo_number: memoNumber,
                    supplier_id: Number(selectedSupplier),
                    customer_id: Number(selectedCustomer),
                    salesman_id: Number(selectedSalesman),
                    chart_of_account: Number(selectedCOA),
                    amount: amount,
                    reason,
                    status: "FOR APPROVAL",
                    type: balanceType
                },
                history: []
            };

            const res = await saveMemo(payload);
            if (res.success) {
                toast.success("Customer Credit Memo has been created for approval.");
                setAmount(0);
                setReason("");
                setSelectedSupplier("");
                setSelectedCustomer("");
                setSelectedSalesman("");
                setSelectedCOA("");
                setBalanceType(1);
                setMemoNumber("(Auto-generated)");
            } else {
                toast.error(res.error || "Save operation failed.");
            }
        } catch {
            toast.error("Network or Gateway Error during save.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingInitial) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-16 w-1/2 rounded-3xl" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Skeleton className="h-48 w-full rounded-3xl" />
                    <Skeleton className="h-48 w-full rounded-3xl" />
                    <Skeleton className="h-48 w-full rounded-3xl" />
                    <Skeleton className="h-48 w-full rounded-3xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 p-6 lg:p-10 max-w-[1700px] mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* Page Action Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 pb-6 border-b border-muted/50">
                <div className="space-y-2">
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[1.25rem] flex items-center justify-center text-white shadow-xl shadow-blue-500/20 ring-4 ring-blue-50">
                            <CreditCard className="h-7 w-7" />
                        </div>
                        <div>
                            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-foreground bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
                                Customers Memo Creation
                            </h1>
                            <p className="text-muted-foreground font-bold text-xs uppercase tracking-[0.2em] mt-1 opacity-70">
                                Creation Engine
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden lg:flex flex-col items-right text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">System Status</p>
                        <p className="text-sm font-black text-amber-600">FOR APPROVAL</p>
                    </div>
                    <Button
                        size="lg"
                        className={cn(
                            "group relative h-16 px-12 rounded-[1.5rem] font-black text-lg shadow-2xl transition-all duration-500 overflow-hidden border-none",
                            isBalanced
                                ? "bg-blue-600 hover:bg-blue-700 hover:scale-[1.05] active:scale-95 text-white shadow-blue-500/40"
                                : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed grayscale"
                        )}
                        disabled={!isBalanced || submitting}
                        onClick={handleSave}
                    >
                        <div className="relative z-10 flex items-center gap-3">
                            {submitting ? (
                                <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                                <Save className="h-7 w-7 group-hover:rotate-12 transition-transform duration-300" />
                            )}
                            <span className="tracking-tighter">Create Memo</span>
                        </div>
                        {isBalanced && (
                            <>
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-transparent to-indigo-400 opacity-0 group-hover:opacity-20 transition-opacity duration-500" />
                                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/30 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                {/* Main Form Area */}
                <div className="xl:col-span-8">
                    <HeaderForm
                        suppliers={suppliers}
                        customers={customers}
                        salesmen={salesmen}
                        coas={coas}
                        selectedSupplier={selectedSupplier}
                        onSupplierChange={setSelectedSupplier}
                        selectedCustomer={selectedCustomer}
                        onCustomerChange={setSelectedCustomer}
                        selectedSalesman={selectedSalesman}
                        onSalesmanChange={setSelectedSalesman}
                        selectedCOA={selectedCOA}
                        onCOAChange={setSelectedCOA}
                        balanceType={balanceType}
                        onBalanceTypeChange={setBalanceType}
                        amount={amount}
                        onAmountChange={setAmount}
                        memoNumber={memoNumber}
                        reason={reason}
                        onReasonChange={setReason}
                    />
                </div>

                {/* Sidebar Summary Area */}
                <div className="xl:col-span-4 sticky top-10 space-y-6">
                    <div className="bg-white rounded-[2rem] p-8 shadow-2xl border-t-8 border-blue-600 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform duration-700">
                            <CreditCard className="h-24 w-24 text-blue-600" />
                        </div>

                        <div className="relative z-10 space-y-8">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Memo Value Estimate</p>
                                <div className="flex items-baseline gap-2 w-full">
                                    <span className="text-2xl font-black text-blue-600 shrink-0">₱</span>
                                    <h2 className="text-4xl font-black tracking-tighter text-foreground tabular-nums break-all">
                                        {amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </h2>
                                </div>
                            </div>

                            <div className="space-y-4 pt-6 border-t border-dashed">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-muted-foreground uppercase tracking-widest">Document ID</span>
                                    <span className="font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{memoNumber}</span>
                                </div>

                                {selectedSupplier && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Selected Supplier</p>
                                        <p className="text-sm font-bold truncate leading-tight">
                                            {suppliers.find(s => String(s.id) === selectedSupplier)?.supplier_name}
                                        </p>
                                    </div>
                                )}

                                <div className="pt-4">
                                    <div className={cn(
                                        "flex items-center gap-3 p-4 rounded-2xl transition-all duration-500",
                                        isBalanced ? "bg-green-50 border border-green-100" : "bg-muted/30 border border-muted"
                                    )}>
                                        <div className={cn(
                                            "h-3 w-3 rounded-full animate-pulse",
                                            isBalanced ? "bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]" : "bg-muted-foreground/30"
                                        )} />
                                        <span className={cn(
                                            "text-[10px] font-black uppercase tracking-widest",
                                            isBalanced ? "text-green-700" : "text-muted-foreground/60"
                                        )}>
                                            {isBalanced ? "Ready for Submission" : "Awaiting Data Entry"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2rem] p-8 text-white shadow-2xl relative overflow-hidden">
                        <div className="relative z-10 space-y-2">
                            <h3 className="text-lg font-black tracking-tighter">Draft Submission</h3>
                            <p className="text-xs text-slate-400 font-bold leading-relaxed italic opacity-80 uppercase tracking-widest">
                                Transaction will be moved to the approval queue upon submission.
                            </p>
                        </div>
                        <div className="absolute -bottom-10 -right-10 opacity-20 rotate-12">
                            <Save className="h-40 w-40 text-white" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
