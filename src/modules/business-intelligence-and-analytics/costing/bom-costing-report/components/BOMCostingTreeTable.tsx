"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
    ChevronDown,
    ChevronRight,
    ChevronsDownUp,
    ChevronsUpDown,
    Layers,
    Boxes,
    Package,
    AlertCircle,
    Info,
    Search,
    Wrench,
    Factory,
    ListTree
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    BOMCostNode,
    BOMCostingReportData,
    MaterialClassification,
    HierarchyRollupMode,
    ComponentCategoryFilter
} from "../types";

interface BOMCostingTreeTableProps {
    data: BOMCostingReportData;
}

// 1. Strict 4-decimal currency formatting
export const formatStandardCurrency = (val: number, decimals: number = 4): string => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(num);
};

// 2. Discrete vs Continuous Unit Formatting
export const isDiscreteUom = (uom: string): boolean => {
    const norm = (uom || "").trim().toUpperCase();
    return [
        "PCS",
        "PC",
        "PIECE",
        "PIECES",
        "PACK",
        "PACKS",
        "BOX",
        "BOXES",
        "CAN",
        "CANS",
        "BOTTLE",
        "BOTTLES",
        "UNIT",
        "UNITS",
        "TUB",
        "TUBS"
    ].includes(norm);
};

export const formatUomQuantity = (val: number, _uom?: string): string => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4
    }).format(num);
};

export default function BOMCostingTreeTable({ data }: BOMCostingTreeTableProps) {
    const { tree, summary, targetProduct } = data;

    // Filter and search state
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<ComponentCategoryFilter>("all");
    const [rollupMode, setRollupMode] = useState<HierarchyRollupMode>("multi-level");

    // Map of expanded node IDs
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
        const initial = new Set<string>();
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

    // Filter classification badges
    const renderClassificationBadge = (type: MaterialClassification, isSub: boolean) => {
        if (type === "labor") {
            return (
                <Badge variant="outline" className="text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300">
                    <Wrench className="mr-1 h-3 w-3" />
                    Labor
                </Badge>
            );
        }
        if (type === "overhead") {
            return (
                <Badge variant="outline" className="text-[10px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-300">
                    <Factory className="mr-1 h-3 w-3" />
                    Overhead
                </Badge>
            );
        }
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

    // Inventory Dispatch Rule Badge
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

    // Filter predicate for search and category
    const matchesFilter = (node: BOMCostNode): boolean => {
        if (selectedCategory !== "all") {
            if (node.materialClassification !== selectedCategory) {
                return false;
            }
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const nameMatch = node.productName.toLowerCase().includes(q);
            const codeMatch = (node.productCode || "").toLowerCase().includes(q);
            const opMatch = (node.operationName || "").toLowerCase().includes(q);
            return nameMatch || codeMatch || opMatch;
        }
        return true;
    };

    // Filter tree recursively or return flat list based on rollupMode
    const filteredNodes = useMemo(() => {
        if (rollupMode === "flattened") {
            const flat: BOMCostNode[] = [];
            const flatten = (nodes: BOMCostNode[]) => {
                nodes.forEach(n => {
                    if (matchesFilter(n)) {
                        flat.push(n);
                    }
                    if (n.children && n.children.length > 0) {
                        flatten(n.children);
                    }
                });
            };
            flatten(tree);
            return flat;
        }

        // Multi-level tree mode
        const filterTree = (nodes: BOMCostNode[]): BOMCostNode[] => {
            const result: BOMCostNode[] = [];
            nodes.forEach(n => {
                const selfMatches = matchesFilter(n);
                const filteredChildren = n.children ? filterTree(n.children) : [];
                if (selfMatches || filteredChildren.length > 0) {
                    result.push({
                        ...n,
                        children: filteredChildren
                    });
                }
            });
            return result;
        };

        return filterTree(tree);
    }, [tree, selectedCategory, searchQuery, rollupMode]);

    // Recursive row renderer for 12 columns
    const renderNodeRows = (node: BOMCostNode, depth: number = 0): React.ReactNode => {
        const hasChildren = rollupMode === "multi-level" && node.children && node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
        const effectiveDepth = rollupMode === "multi-level" ? depth : 0;

        const effectiveTotalCost = summary.totalBatchCost > 0 ? summary.totalBatchCost : summary.totalMaterialCost;
        const costShare = effectiveTotalCost > 0
            ? ((node.totalLineCost / effectiveTotalCost) * 100)
            : 0;
        const costShareStr = costShare.toFixed(4);

        return (
            <React.Fragment key={node.id}>
                <motion.tr
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                    className={`border-b transition-colors hover:bg-muted/40 text-xs ${
                        node.isSubAssembly ? "bg-muted/20 font-medium" : ""
                    }`}
                >
                    {/* 1. LEVEL & ROUTE */}
                    <td
                        className="py-2.5 px-3 min-w-[220px] whitespace-nowrap"
                        title={`Hierarchy Level L${node.level} • Operation: ${node.operationName || "Unknown"}`}
                    >
                        <div
                            className="flex items-center gap-1.5 whitespace-nowrap"
                            style={{ paddingLeft: `${effectiveDepth * 16}px` }}
                        >
                            {effectiveDepth > 0 && (
                                <span className="text-muted-foreground/60 font-mono text-xs select-none">
                                    ↳
                                </span>
                            )}

                            {hasChildren ? (
                                <button
                                    type="button"
                                    onClick={() => toggleExpand(node.id)}
                                    className="p-1 -ml-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                                    aria-label={isExpanded ? "Collapse branch" : "Expand branch"}
                                >
                                    {isExpanded ? (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                    ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    )}
                                </button>
                            ) : (
                                <span className="w-3.5 shrink-0 text-center text-muted-foreground/40 font-mono text-[11px] select-none">
                                    •
                                </span>
                            )}

                            <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-semibold shrink-0">
                                L{node.level}
                            </span>

                            <span className="text-[11px] font-medium text-foreground whitespace-nowrap" title={node.operationName || "Unknown"}>
                                • {node.operationName || (node.routeSequence ? `Step #${node.routeSequence}` : "Unknown")}
                            </span>
                        </div>
                    </td>

                    {/* 2. COMPONENT NAME */}
                    <td
                        className="py-2.5 px-3 min-w-[220px]"
                        title={`${node.productName}${node.productCode ? ` • ${node.productCode}` : ""}${node.description ? ` (${node.description})` : ""}`}
                    >
                        <div>
                            <div className="font-semibold text-foreground whitespace-nowrap" title={node.productName}>
                                {node.productName}
                            </div>
                            {node.productCode && (
                                <div className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                                    {node.productCode}
                                </div>
                            )}
                        </div>
                    </td>

                    {/* 3. TYPE */}
                    <td
                        className="py-2.5 px-3 min-w-[100px] whitespace-nowrap"
                        title={`Material Classification: ${node.materialClassification.replace('_', ' ').toUpperCase()}`}
                    >
                        {renderClassificationBadge(node.materialClassification, node.isSubAssembly)}
                    </td>

                    {/* 4. RULE */}
                    <td
                        className="py-2.5 px-3 min-w-[70px] text-center whitespace-nowrap"
                        title={node.inventoryRule === "FEFO" ? "First Expired, First Out (Perishable Lot Strategy)" : node.inventoryRule === "FIFO" ? "First In, First Out (Inward Receipt Strategy)" : "No inventory dispatch rule applicable"}
                    >
                        {renderInventoryRuleBadge(node.inventoryRule)}
                    </td>

                    {/* 5. UOM */}
                    <td
                        className="py-2.5 px-3 min-w-[60px] text-center font-mono text-[11px] text-muted-foreground whitespace-nowrap"
                        title={`Unit of Measurement: ${node.uomName}`}
                    >
                        {node.uomName}
                    </td>

                    {/* 6. BASE QTY */}
                    <td
                        className="py-2.5 px-3 min-w-[90px] text-right font-mono whitespace-nowrap"
                        title={`Base Recipe Quantity: ${formatUomQuantity(node.baseRequiredQty, node.uomName)} ${node.uomName}`}
                    >
                        {formatUomQuantity(node.baseRequiredQty, node.uomName)}
                    </td>

                    {/* 7. REQ. QTY */}
                    <td
                        className="py-2.5 px-3 min-w-[95px] text-right font-mono whitespace-nowrap"
                        title={`Net Scaled Quantity: ${formatUomQuantity(node.scaledRequiredQty, node.uomName)} ${node.uomName}`}
                    >
                        {formatUomQuantity(node.scaledRequiredQty, node.uomName)}
                    </td>

                    {/* 8. SCRAP */}
                    <td
                        className="py-2.5 px-3 min-w-[125px] text-right whitespace-nowrap"
                        title={node.wastagePercent > 0 ? `Scrap Allowance: +${node.wastagePercent.toFixed(4)}% (+${formatUomQuantity(node.wastageQty, node.uomName)} ${node.uomName})` : "Zero scrap allowance (0.0000%)"}
                    >
                        {node.wastagePercent > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-mono text-[11px]">
                                +{node.wastagePercent.toFixed(4)}%
                                <span className="block text-[9px] text-muted-foreground">
                                    (+{formatUomQuantity(node.wastageQty, node.uomName)} {node.uomName})
                                </span>
                            </span>
                        ) : (
                            <span className="text-muted-foreground text-[11px] font-mono">0.0000%</span>
                        )}
                    </td>

                    {/* 9. UNIT COST (Strict 4 Decimals) */}
                    <td
                        className="py-2.5 px-3 min-w-[105px] text-right font-mono whitespace-nowrap"
                        title={`Standard Unit Cost: ${formatStandardCurrency(node.unitCost, 4)} per ${node.uomName}`}
                    >
                        {formatStandardCurrency(node.unitCost, 4)}
                    </td>

                    {/* 10. GROSS (EFF.) QTY */}
                    <td
                        className="py-2.5 px-3 min-w-[105px] text-right font-mono font-medium whitespace-nowrap"
                        title={`Gross Effective Quantity: ${formatUomQuantity(node.effectiveQty, node.uomName)} ${node.uomName}`}
                    >
                        {formatUomQuantity(node.effectiveQty, node.uomName)}
                    </td>

                    {/* 11. EXT. TOTAL COST (Strict 4 Decimals) */}
                    <td
                        className="py-2.5 px-3 min-w-[120px] text-right font-mono font-semibold text-foreground whitespace-nowrap"
                        title={`Extended Line Total Cost: ${formatStandardCurrency(node.totalLineCost, 4)} (Gross Qty × Unit Cost)`}
                    >
                        {formatStandardCurrency(node.totalLineCost, 4)}
                    </td>

                    {/* 12. SHARE % with mini progress indicator */}
                    <td
                        className="py-2.5 px-3 min-w-[90px] text-right font-mono text-muted-foreground whitespace-nowrap"
                        title={`Cost Share: ${costShareStr}% of total batch standard cost`}
                    >
                        <div className="flex flex-col items-end gap-1">
                            <span>{costShareStr}%</span>
                            <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary rounded-full transition-all duration-300"
                                    style={{ width: `${Math.min(costShare, 100)}%` }}
                                />
                            </div>
                        </div>
                    </td>
                </motion.tr>

                {/* Render nested children if in multi-level mode and expanded */}
                {hasChildren && isExpanded && (
                    node.children.map(child => renderNodeRows(child, depth + 1))
                )}
            </React.Fragment>
        );
    };

    const hasCollapsibleBranches = useMemo(() => {
        return rollupMode === "multi-level" && tree.some(node => node.children && node.children.length > 0);
    }, [rollupMode, tree]);

    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-xl border bg-card shadow-xs overflow-hidden"
        >
            {/* Header controls & tabs strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b bg-muted/20">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <ListTree className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Standard Cost Tree Table</h3>
                        <Badge variant="secondary" className="text-[10px] font-normal">
                            {targetProduct.product_name} • {targetProduct.version_name}
                        </Badge>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Hierarchy Rollup Switch */}
                    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
                        <button
                            type="button"
                            onClick={() => setRollupMode("multi-level")}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                                rollupMode === "multi-level"
                                    ? "bg-background text-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Multi-Level
                        </button>
                        <button
                            type="button"
                            onClick={() => setRollupMode("flattened")}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                                rollupMode === "flattened"
                                    ? "bg-background text-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Flattened
                        </button>
                    </div>

                    {hasCollapsibleBranches && (
                        <div className="flex items-center gap-1.5 ml-2 border-l pl-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={expandAll}
                                className="h-7 text-xs px-2 font-normal"
                            >
                                <ChevronsUpDown className="mr-1 h-3 w-3" />
                                Expand
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={collapseAll}
                                className="h-7 text-xs px-2 font-normal"
                            >
                                <ChevronsDownUp className="mr-1 h-3 w-3" />
                                Collapse
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b bg-background">
                {/* Search input */}
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search operation, ingredient, code..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="h-8 pl-8 text-xs bg-muted/20"
                    />
                </div>

                {/* Filter Category Pills */}
                <div className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground mr-1">Filter Category:</span>
                    {(["all", "raw_material", "packaging", "labor", "overhead"] as ComponentCategoryFilter[]).map(cat => {
                        const labels: Record<ComponentCategoryFilter, string> = {
                            all: "All",
                            raw_material: "Raw Material",
                            packaging: "Packaging",
                            labor: "Labor",
                            overhead: "Overhead"
                        };
                        const isSelected = selectedCategory === cat;
                        return (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                                    isSelected
                                        ? "bg-primary text-primary-foreground shadow-xs"
                                        : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                            >
                                {labels[cat]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 12-Column Tree Table */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr className="border-b bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                            <th className="py-2.5 px-3 min-w-[220px]" title="BOM Hierarchy level (L1/L2) and manufacturing routing operation sequence">Level & Route</th>
                            <th className="py-2.5 px-3 min-w-[220px]" title="Component item name, code/SKU, and specifications">Component Name</th>
                            <th className="py-2.5 px-3 min-w-[100px]" title="Material classification: Raw Material, Packaging, Sub-Assembly, Labor, or Overhead">Type</th>
                            <th className="py-2.5 px-3 min-w-[70px] text-center" title="Inventory consumption dispatch rule: FEFO for perishables, FIFO for packaging materials">Rule</th>
                            <th className="py-2.5 px-3 min-w-[60px] text-center" title="Unit of Measurement (UOM)">UOM</th>
                            <th className="py-2.5 px-3 min-w-[90px] text-right" title="Standard recipe quantity required per base production batch">Base Qty</th>
                            <th className="py-2.5 px-3 min-w-[95px] text-right" title="Net required quantity scaled for target production batch">Req. Qty</th>
                            <th className="py-2.5 px-3 min-w-[125px] text-right" title="Planned scrap and process wastage allowance percentage and quantity">Scrap</th>
                            <th className="py-2.5 px-3 min-w-[105px] text-right" title="Standard unit cost / landed valuation rate per UOM (₱)">Unit Cost</th>
                            <th className="py-2.5 px-3 min-w-[105px] text-right" title="Gross effective quantity required after scrap allowance adjustment">Gross (Eff.) Qty</th>
                            <th className="py-2.5 px-3 min-w-[120px] text-right" title="Extended line total standard cost (Gross Effective Qty × Unit Cost)">Ext. Total Cost</th>
                            <th className="py-2.5 px-3 min-w-[90px] text-right" title="Percentage contribution to total standard batch production cost">Share %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredNodes.length === 0 ? (
                            <tr>
                                <td colSpan={12} className="py-12 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                                        <div className="text-sm font-medium">No matching BOM components found</div>
                                        <p className="text-xs max-w-sm text-muted-foreground">
                                            {searchQuery || selectedCategory !== "all"
                                                ? "Try clearing your search query or switching the category filter."
                                                : "This manufacturing version does not contain active components."}
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredNodes.map(node => renderNodeRows(node, 0))
                        )}
                    </tbody>
                    {filteredNodes.length > 0 && (
                        <tfoot>
                            <tr className="border-t-2 bg-muted/30 font-semibold text-xs text-foreground">
                                <td colSpan={5} className="py-3 px-3" title={`Total Standard Batch Cost Rollup for ${targetProduct.product_name}`}>
                                    Total Standard Batch Cost Rollup ({targetProduct.product_name})
                                </td>
                                <td colSpan={5} className="py-3 px-3 text-right font-normal text-muted-foreground" title={`Per Piece Unit Cost: ${formatStandardCurrency(summary.costPerUnit, 4)} per ${targetProduct.uom_name}`}>
                                    Per Piece Unit Cost: <strong className="text-foreground font-mono">{formatStandardCurrency(summary.costPerUnit, 4)}</strong> / {targetProduct.uom_name}
                                </td>
                                <td className="py-3 px-3 text-right font-mono text-sm font-bold text-primary" title={`Total Batch Cost: ${formatStandardCurrency(summary.totalBatchCost || summary.totalMaterialCost, 4)}`}>
                                    {formatStandardCurrency(summary.totalBatchCost || summary.totalMaterialCost, 4)}
                                </td>
                                <td className="py-3 px-3 text-right font-mono" title="100.0000% total standard cost rollup">
                                    100.0000%
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
                        <strong className="text-foreground">Standard Costing Policy:</strong> Gross quantities include applicable route scrap allowances. Unit costs and extended total valuations are standardized to 4 decimal precision. Direct labor and overhead are aggregated in accordance with routing sequences and version standards.
                    </div>
                </div>
                <div className="flex items-start gap-2 pl-5">
                    <div>
                        <strong className="text-foreground">Warehouse Inventory Strategy:</strong> Raw materials and perishable ingredients follow <strong>FEFO</strong> (First Expired, First Out) batch consumption, while packaging materials adhere to inward <strong>FIFO</strong> (First In, First Out) rotation.
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
