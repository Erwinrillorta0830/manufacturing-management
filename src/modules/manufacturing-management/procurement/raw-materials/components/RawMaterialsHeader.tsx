import React from "react";
import { Layers } from "lucide-react";

interface RawMaterialsHeaderProps {
    count: number;
}

export function RawMaterialsHeader({ count }: RawMaterialsHeaderProps) {
    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 border p-4 rounded-xl">
            <div className="space-y-0.5">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5 shrink-0">
                    <Layers className="h-4.5 w-4.5 text-primary" />
                    Raw Materials & Packaging Master Catalog ({count})
                </h3>
                <p className="text-[10px] text-muted-foreground">Log incoming cargo, register raw materials, or inspect warehouse batches.</p>
            </div>
        </div>
    );
}
