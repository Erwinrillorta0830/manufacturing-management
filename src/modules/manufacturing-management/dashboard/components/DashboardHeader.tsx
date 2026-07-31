import React from "react";
import { Boxes } from "lucide-react";

export function DashboardHeader() {
    return (
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
    );
}
