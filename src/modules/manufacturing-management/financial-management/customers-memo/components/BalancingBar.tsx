// src/modules/financial-management/accounting/customers-memo/components/BalancingBar.tsx

"use client";

import React from "react";
import { CheckCircle2, CircleAlert, ArrowRightLeft, Target, Sigma } from "lucide-react";
import { cn } from "@/lib/utils";

interface BalancingBarProps {
    isBalanced: boolean;
    amount: number;
    totalApplied: number;
}

export const BalancingBar = React.memo(function BalancingBar({
    isBalanced, amount, totalApplied
}: BalancingBarProps) {
    const difference = Math.abs(amount - totalApplied);
    
    return (
        <div className={cn(
            "relative overflow-hidden rounded-[2.5rem] border p-2 transition-all duration-700 shadow-2xl",
            isBalanced 
                ? "bg-emerald-500/5 border-emerald-500/20 shadow-emerald-500/10" 
                : "bg-amber-500/5 border-amber-500/20 shadow-amber-500/10"
        )}>
            {/* Background Decorative Glow */}
            <div className={cn(
                "absolute -right-24 -top-24 h-64 w-64 rounded-full blur-[100px] opacity-20 transition-colors duration-700",
                isBalanced ? "bg-emerald-500" : "bg-amber-500"
            )} />

            <div className="relative flex flex-col xl:flex-row items-stretch xl:items-center gap-4">
                {/* Status Indicator Section */}
                <div className={cn(
                    "flex items-center gap-6 px-6 md:px-10 py-6 rounded-[2rem] transition-all duration-700",
                    isBalanced 
                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30" 
                        : "bg-amber-500 text-white shadow-lg shadow-amber-500/30"
                )}>
                    <div className="flex-shrink-0 bg-white/20 p-3 rounded-2xl">
                        {isBalanced 
                            ? <CheckCircle2 className="h-10 w-10 animate-in zoom-in spin-in-90 duration-700" /> 
                            : <CircleAlert className="h-10 w-10 animate-pulse" />
                        }
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 leading-tight">
                            System Status
                        </span>
                        <h3 className="text-3xl font-black tracking-tighter leading-none mt-1">
                            {isBalanced ? "Balanced" : "Review Req."}
                        </h3>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-2">
                    {/* Memo Target */}
                    <div className="group flex items-center gap-4 bg-white/60 dark:bg-white/5 border border-white/80 dark:border-white/10 px-6 py-5 rounded-[1.75rem] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                        <div className="h-12 w-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                            <Target className="h-6 w-6" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 transition-colors group-hover:text-blue-600">Memo Target</span>
                            <span className="text-xl font-black tabular-nums tracking-tighter text-foreground">
                                ₱{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>

                    {/* Applied Total */}
                    <div className="group flex items-center gap-4 bg-white/60 dark:bg-white/5 border border-white/80 dark:border-white/10 px-6 py-5 rounded-[1.75rem] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                        <div className="h-12 w-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                            <Sigma className="h-6 w-6" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 transition-colors group-hover:text-indigo-600">Applied Total</span>
                            <span className="text-xl font-black tabular-nums tracking-tighter text-foreground">
                                ₱{totalApplied.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>

                    {/* Difference Card */}
                    <div className={cn(
                        "group flex items-center gap-4 px-6 py-5 rounded-[1.75rem] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border",
                        isBalanced 
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700" 
                            : "bg-orange-500/10 border-orange-500/20 text-orange-700"
                    )}>
                        <div className={cn(
                            "h-12 w-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform",
                            isBalanced ? "bg-emerald-500/20" : "bg-orange-500/20"
                        )}>
                            <ArrowRightLeft className="h-6 w-6" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Difference</span>
                            <span className="text-xl font-black tabular-nums tracking-tighter">
                                ₱{difference.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

