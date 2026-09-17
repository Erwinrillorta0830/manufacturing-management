"use client";

import React, { useState } from "react";
import {
    ChevronDown,
    ChevronRight,
    ChevronsDownUp,
    ChevronsUpDown,
    Layers,
    Boxes,
    Package,
    AlertCircle,
    Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { BOMCostNode, BOMCostingReportData, MaterialClassification } from "../types";

interface BOMCostingTreeTableProps {
    data: BOMCostingReportData;
}

const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
    }).format(val || 0);
};

const formatNumber = (val: number) => {
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
    }).format(val || 0);
};

export default function BOMCostingTreeTable({ data }: BOMCostingTreeTableProps) {
    const { tree, summary, targetProduct } = data;
    // Map of expanded node IDs
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
        const initial = new Set<string>();
        // Expand top level by default
        tree.forEach(node => {
            if (node.children && node.children.length > 0) {
                initial.add(node.id);
            }
        });
        return initial;
    });

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const expandAll = () => {
        const allIds = new Set<string>();
        const traverse = (nodes: BOMCostNode[]) => {
            nodes.forEach(n => {
                if (n.children && n.children.length > 0) {
                    allIds.add(n.id);
                    traverse(n.children);
                }
            });
        };
        traverse(tree);
        setExpandedIds(allIds);
    };

    const collapseAll = () => {
        setExpandedIds(new Set());
    };

    const renderClassificationBadge = (type: MaterialClassification, isSub: boolean) => {
        if (isSub || type === "sub_assembly") {
            return (
                <Badge variant="outline" className="text-[10px] font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300">
                    <Layers className="mr-1 h-3 w-3" />
                    Sub-Assembly
                </Badge>
            );
        }
        if (type === "packaging") {
            return (
                <Badge variant="outline" className="text-[10px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300">
                    <Package className="mr-1 h-3 w-3" />
                    Packaging
                </Badge>
            );
        }
        return (
            <Badge variant="outline" className="text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300">
                <Boxes className="mr-1 h-3 w-3" />
                Raw Material
            </Badge>
        );
    };

    const renderInventoryRuleBadge = (rule: string) => {
        if (rule === "FEFO") {
            return (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300/60 cursor-help">
                                FEFO
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-xs">
                            First Expired, First Out: Components consume nearest-expiry lots first.
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            );
        }
        if (rule === "FIFO") {
            return (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-300/60 cursor-help">
                                FIFO
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-xs">
                            First In, First Out: Packaging materials consume earliest receipt/inward date first.
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            );
        }
        return <span className="text-xs text-muted-foreground">-</span>;
    };

    // Recursive row renderer
    const renderNodeRows = (node: BOMCostNode, depth: number = 0): React.ReactNode => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
        const costShare = summary.totalMaterialCost > 0
            ? ((node.totalLineCost / summary.totalMaterialCost) * 100).toFixed(1)
            : "0.0";

        return (
            <React.Fragment key={node.id}>
                <tr
                    className={`border-b transition-colors hover:bg-muted/40 text-xs ${
                        node.isSubAssembly ? "bg-muted/20 font-medium" : ""
                    }`}
                >
                    {/* Level & Component Name */}
                    <td className="py-2.5 px-3">
                        <div
                            className="flex items-center gap-1.5"
                            style={{ paddingLeft: `${depth * 20}px` }}
                        >
                            {hasChildren ? (
                                <button
                                    type="button"
                                    onClick={() => toggleExpand(node.id)}
                                    className="p-1 -ml-1 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 transition-transform"
                                    aria-label={isExpanded ? "Collapse node" : "Expand node"}
                                >
                                    {isExpanded ? (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                    ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    )}
                                </button>
                            ) : (
                                <span className="w-4 shrink-0 text-center text-muted-foreground/40 font-mono text-[11px]">
                                    •
                                </span>
                            )}

                            <span className="font-mono text-[10px] px-1 py-0 rounded bg-muted text-muted-foreground font-semibold shrink-0">
                                L{node.level}
                            </span>

                            <div className="truncate">
                                <div className="font-semibold text-foreground truncate">
                                    {node.productName}
                                </div>
                                {node.productCode && (
                                    <div className="text-[10px] text-muted-foreground font-mono">
                                        {node.productCode}
                                    </div>
                                )}
                            </div>
                        </div>
                    </td>

                    {/* Classification */}
                    <td className="py-2.5 px-3">
                        {renderClassificationBadge(node.materialClassification, node.isSubAssembly)}
                    </td>

                    {/* Inventory Dispatch Rule (FEFO/FIFO) */}
                    <td className="py-2.5 px-3 text-center">
                        {renderInventoryRuleBadge(node.inventoryRule)}
                    </td>

                    {/* Route Step / Operation */}
                    <td className="py-2.5 px-3 text-muted-foreground">
                        <span className="truncate max-w-[130px] inline-block font-normal">
                            {node.operationName || `Step #${node.routeSequence || 1}`}
                        </span>
                    </td>

                    {/* Scaled Batch Qty */}
                    <td className="py-2.5 px-3 text-right font-mono">
                        {formatNumber(node.scaledRequiredQty)}{" "}
                        <span className="text-[10px] text-muted-foreground">{node.uomName}</span>
                    </td>

                    {/* Wastage / Scrap % */}
                    <td className="py-2.5 px-3 text-right">
                        {node.wastagePercent > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-mono text-[11px]">
                                +{node.wastagePercent}%
                                <span className="block text-[9px] text-muted-foreground">
                                    (+{formatNumber(node.wastageQty)} {node.uomName})
                                </span>
                            </span>
                        ) : (
                            <span className="text-muted-foreground text-[11px]">0.00%</span>
                        )}
                    </td>

                    {/* Effective Quantity */}
                    <td className="py-2.5 px-3 text-right font-mono font-medium">
                        {formatNumber(node.effectiveQty)}{" "}
                        <span className="text-[10px] text-muted-foreground font-normal">{node.uomName}</span>
                    </td>

                    {/* Unit Material Cost */}
                    <td className="py-2.5 px-3 text-right font-mono">
                        {formatCurrency(node.unitCost)}
                    </td>

                    {/* Line Total Cost */}
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-foreground">
                        {formatCurrency(node.totalLineCost)}
                    </td>

                    {/* Cost Contribution % */}
                    <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                        {costShare}%
                    </td>
                </tr>

                {/* Render children if expanded */}
                {hasChildren && isExpanded && (
                    node.children.map(child => renderNodeRows(child, depth + 1))
                )}
            </React.Fragment>
        );
    };

    return (
        <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
            {/* Header bar with controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b bg-muted/20">
                <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <span>Multi-Level BOM Cost Tree</span>
                        <Badge variant="secondary" className="text-[10px] font-normal">
                            {targetProduct.product_name} • {targetProduct.version_name}
                        </Badge>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Batch Quantity: <strong className="text-foreground">{formatNumber(targetProduct.target_quantity)} {targetProduct.uom_name}</strong> (Base: {targetProduct.base_quantity} {targetProduct.uom_name})
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={expandAll}
                        className="h-7 text-xs px-2.5 font-normal"
                    >
                        <ChevronsUpDown className="mr-1 h-3.5 w-3.5" />
                        Expand All
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={collapseAll}
                        className="h-7 text-xs px-2.5 font-normal"
                    >
                        <ChevronsDownUp className="mr-1 h-3.5 w-3.5" />
                        Collapse All
                    </Button>
                </div>
            </div>

            {/* Tree Table */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr className="border-b bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            <th className="py-2.5 px-3 min-w-[240px]">Component Name / Level</th>
                            <th className="py-2.5 px-3 min-w-[110px]">Type</th>
                            <th className="py-2.5 px-3 min-w-[80px] text-center">Rule</th>
                            <th className="py-2.5 px-3 min-w-[130px]">Route Operation</th>
                            <th className="py-2.5 px-3 min-w-[110px] text-right">Net Req. Qty</th>
                            <th className="py-2.5 px-3 min-w-[90px] text-right">Scrap %</th>
                            <th className="py-2.5 px-3 min-w-[120px] text-right">Gross (Eff.) Qty</th>
                            <th className="py-2.5 px-3 min-w-[100px] text-right">Unit Cost</th>
                            <th className="py-2.5 px-3 min-w-[110px] text-right">Ext. Total Cost</th>
                            <th className="py-2.5 px-3 min-w-[70px] text-right">Share %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tree.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="py-12 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                                        <div className="text-sm font-medium">No BOM line items defined</div>
                                        <p className="text-xs max-w-sm text-muted-foreground">
                                            This manufacturing version does not currently contain active components or routes in the database.
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            tree.map(node => renderNodeRows(node, 0))
                        )}
                    </tbody>
                    {tree.length > 0 && (
                        <tfoot>
                            <tr className="border-t-2 bg-muted/30 font-semibold text-xs text-foreground">
                                <td colSpan={4} className="py-3 px-3">
                                    Total Product Material Cost Rollup ({targetProduct.product_name})
                                </td>
                                <td colSpan={4} className="py-3 px-3 text-right font-normal text-muted-foreground">
                                    Unit Material Cost: <strong className="text-foreground font-mono">{formatCurrency(summary.costPerUnit)}</strong> / {targetProduct.uom_name}
                                </td>
                                <td className="py-3 px-3 text-right font-mono text-sm font-bold text-primary">
                                    {formatCurrency(summary.totalMaterialCost)}
                                </td>
                                <td className="py-3 px-3 text-right font-mono">
                                    100%
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {/* Explanatory footer notes */}
            <div className="p-3.5 border-t bg-muted/10 space-y-1.5 text-[11px] text-muted-foreground">
                <div className="flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                    <div>
                        <strong className="text-foreground">Valuation Policy:</strong> Gross quantities include applicable production scrap allowances. Material costs are calculated using the current standard/unit cost associated with each BOM component. Extended costs and category rollups reconcile exactly with the displayed rows.
                    </div>
                </div>
                <div className="flex items-start gap-2 pl-5">
                    <div>
                        <strong className="text-foreground">Inventory Allocation Strategy:</strong> Raw materials and perishable ingredients follow <strong>FEFO</strong> (First Expired, First Out) batch consumption, while packaging materials adhere to inward <strong>FIFO</strong> (First In, First Out) warehouse rotation.
                    </div>
                </div>
            </div>
        </div>
    );
}
