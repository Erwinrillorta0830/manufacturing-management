import React from "react";
import { Loader2, Layers, Info } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Branch, NetRequirementItem } from "../types";

interface NetRequirementsTableProps {
    loadingRequirements: boolean;
    netRequirements: NetRequirementItem[];
    selectedBranchId: number | null;
    branches: Branch[];
}

export function NetRequirementsTable({
    loadingRequirements,
    netRequirements,
    selectedBranchId,
    branches
}: NetRequirementsTableProps) {
    const selectedBranch = branches.find(b => b.id === selectedBranchId);

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/10">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                            <Layers className="h-5 w-5 text-primary" />
                            Net Requirements Calculator
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Active inventory checks and safety stock rollups in selected branch.
                        </CardDescription>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                        {selectedBranchId && selectedBranch
                            ? selectedBranch.branch_name
                            : "No Branch Selected"}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {loadingRequirements ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <Loader2 className="h-8 w-8 text-primary animate-spin" />
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
                            Calculating requirements...
                        </span>
                    </div>
                ) : netRequirements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-muted-foreground">
                        <Info className="h-8 w-8 text-muted-foreground/60 mb-2" />
                        <span className="text-sm font-semibold">No unfulfilled demand loaded.</span>
                        <span className="text-xs max-w-sm mt-1">
                            Add or approve Sales Orders to harvest production requirements.
                        </span>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/5">
                                <TableRow>
                                    <TableHead className="font-bold text-xs">Product Details</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Gross Demand</TableHead>
                                    <TableHead className="font-bold text-xs text-right">On Hand</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Safety Stock</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Net Shortfall</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-border">
                                {netRequirements.map((item) => {
                                    const hasShortfall = item.net_shortfall > 0;
                                    return (
                                        <TableRow
                                            key={item.product_id}
                                            className={
                                                item.is_sub_assembly 
                                                    ? "bg-muted/40 hover:bg-muted/60 border-l-2 border-l-sky-500" 
                                                    : (hasShortfall ? "bg-red-50/5 hover:bg-red-50/10" : "")
                                            }
                                        >
                                            <TableCell className="py-3">
                                                <div className="font-bold text-sm text-foreground flex items-center gap-2 flex-wrap">
                                                    {item.is_sub_assembly && (
                                                        <span className="text-[8px] bg-sky-500/10 dark:bg-sky-950 text-sky-600 dark:text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded uppercase font-black tracking-wider shrink-0">
                                                            Sub-Assembly
                                                        </span>
                                                    )}
                                                    <span className={item.is_sub_assembly ? "text-foreground" : ""}>{item.product_name}</span>
                                                    <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded shrink-0">
                                                        {item.uom_name || item.unit_of_measurement || "Pieces"}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                                                    {item.product_code}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold text-sm">
                                                {item.gross_demand.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{item.uom_name || item.uom_shortcut || "pcs"}</span>
                                            </TableCell>
                                            <TableCell className="text-right text-sm">
                                                {item.on_hand.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-muted-foreground">
                                                {item.safety_stock.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right py-3">
                                                {hasShortfall ? (
                                                    item.is_sub_assembly ? (
                                                        <Badge variant="outline" className="font-bold font-mono px-2 py-0.5 text-xs text-sky-400 border-sky-500/30 bg-sky-500/5">
                                                            {item.net_shortfall.toLocaleString()} Short
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="destructive" className="font-bold font-mono px-2 py-0.5 text-xs">
                                                            {item.net_shortfall.toLocaleString()} Short
                                                        </Badge>
                                                    )
                                                ) : (
                                                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50/10 font-mono px-2 py-0.5 text-xs">
                                                        Sufficient
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
