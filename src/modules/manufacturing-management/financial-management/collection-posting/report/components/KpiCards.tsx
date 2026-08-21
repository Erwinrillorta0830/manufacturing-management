import React from "react";
import { Banknote, Landmark, FileText, Scale } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CollectionSummaryReportDto } from "../hooks/useCollectionReport";

export function KpiCards({ data }: { data: CollectionSummaryReportDto }) {
    const netVariance = (data.globalOverages || 0) - (data.globalShortages || 0);

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Cash Card */}
            <Card className="border-border/50 shadow-sm rounded-xl overflow-hidden bg-card">
                <CardContent className="p-4 flex flex-col gap-2 relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none text-emerald-500"><Banknote size={48}/></div>
                    <div className="flex items-center gap-2 z-10">
                        <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Cash</span>
                    </div>
                    <span className="text-2xl font-black font-mono tracking-tight text-foreground z-10">
                        {/* 🚀 FIXED: maximumFractionDigits: 2 prevents .483 */}
                        ₱{data.globalCash.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                </CardContent>
            </Card>

            {/* Checks Card */}
            <Card className="border-border/50 shadow-sm rounded-xl overflow-hidden bg-card">
                <CardContent className="p-4 flex flex-col gap-2 relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none text-blue-500"><Landmark size={48}/></div>
                    <div className="flex items-center gap-2 z-10">
                        <span className="flex h-2 w-2 rounded-full bg-blue-500"></span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Checks</span>
                    </div>
                    <span className="text-2xl font-black font-mono tracking-tight text-foreground z-10">
                        ₱{data.globalChecks.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                </CardContent>
            </Card>

            {/* Net Invoices Card */}
            <Card className="border-border/50 shadow-sm rounded-xl overflow-hidden bg-primary/5">
                <CardContent className="p-4 flex flex-col gap-2 relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none text-primary"><FileText size={48}/></div>
                    <div className="flex items-center gap-2 z-10">
                        <span className="flex h-2 w-2 rounded-full bg-primary"></span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary/80">Net Invoices Settled</span>
                    </div>
                    <span className="text-2xl font-black font-mono tracking-tight text-primary z-10">
                        ₱{data.globalNetInvoice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                </CardContent>
            </Card>

            {/* Variance Card */}
            <Card className={`border-border/50 shadow-sm rounded-xl overflow-hidden ${netVariance < 0 ? 'bg-red-500/5' : netVariance > 0 ? 'bg-purple-500/5' : 'bg-card'}`}>
                <CardContent className="p-4 flex flex-col gap-2 relative">
                    <div className={`absolute top-0 right-0 p-4 opacity-10 pointer-events-none ${netVariance < 0 ? 'text-red-500' : netVariance > 0 ? 'text-purple-500' : 'text-muted-foreground'}`}><Scale size={48}/></div>
                    <div className="flex items-center gap-2 z-10">
                        <span className={`flex h-2 w-2 rounded-full ${netVariance < 0 ? 'bg-red-500' : netVariance > 0 ? 'bg-purple-500' : 'bg-muted'}`}></span>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${netVariance < 0 ? 'text-red-500' : netVariance > 0 ? 'text-purple-500' : 'text-muted-foreground'}`}>Global Net Variance</span>
                    </div>
                    <span className={`text-2xl font-black font-mono tracking-tight z-10 ${netVariance < 0 ? 'text-red-500' : netVariance > 0 ? 'text-purple-500' : 'text-foreground'}`}>
                        {netVariance < 0 ? '-' : netVariance > 0 ? '+' : ''}₱{Math.abs(netVariance).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                </CardContent>
            </Card>
        </div>
    );
}