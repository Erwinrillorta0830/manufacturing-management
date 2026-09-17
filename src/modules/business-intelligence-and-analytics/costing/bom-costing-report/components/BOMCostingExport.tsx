"use client";

import React from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BOMCostNode, BOMCostingReportData } from "../types";

interface BOMCostingExportProps {
    data: BOMCostingReportData | null;
}

export default function BOMCostingExport({ data }: BOMCostingExportProps) {
    if (!data) return null;

    const handlePrint = () => {
        window.print();
    };

    const handleExportCSV = () => {
        try {
            const { targetProduct, tree, summary } = data;

            const flatNodes: BOMCostNode[] = [];
            const traverse = (nodes: BOMCostNode[]) => {
                nodes.forEach(n => {
                    flatNodes.push(n);
                    if (n.children && n.children.length > 0) {
                        traverse(n.children);
                    }
                });
            };
            traverse(tree);

            const headers = [
                "Level",
                "Component Name",
                "Product Code",
                "Material Type",
                "Inventory Rule",
                "Route Operation",
                "Net Required Qty",
                "UOM",
                "Scrap %",
                "Gross Effective Qty",
                "Unit Material Cost (PHP)",
                "Ext Total Cost (PHP)",
                "Cost Share %"
            ];

            const rows = flatNodes.map(n => {
                const share = summary.totalMaterialCost > 0
                    ? ((n.totalLineCost / summary.totalMaterialCost) * 100).toFixed(2)
                    : "0.00";
                return [
                    `L${n.level}`,
                    `"${n.productName.replace(/"/g, '""')}"`,
                    `"${(n.productCode || "").replace(/"/g, '""')}"`,
                    n.materialClassification,
                    n.inventoryRule,
                    `"${(n.operationName || "").replace(/"/g, '""')}"`,
                    n.scaledRequiredQty.toFixed(4),
                    n.uomName,
                    `${n.wastagePercent.toFixed(2)}%`,
                    n.effectiveQty.toFixed(4),
                    n.unitCost.toFixed(4),
                    n.totalLineCost.toFixed(4),
                    `${share}%`
                ].join(",");
            });

            const metaRows = [
                `"BOM Costing Report: ${targetProduct.product_name.replace(/"/g, '""')}"`,
                `"Version: ${targetProduct.version_name.replace(/"/g, '""')}"`,
                `"Batch Size: ${targetProduct.target_quantity} ${targetProduct.uom_name} (Base: ${targetProduct.base_quantity} ${targetProduct.uom_name})"`,
                `"Total Material Cost: PHP ${summary.totalMaterialCost.toFixed(2)}"`,
                `"Material Cost Per Unit: PHP ${summary.costPerUnit.toFixed(4)} / ${targetProduct.uom_name}"`,
                `"Generated At: ${new Date().toLocaleString()}"`,
                ""
            ];

            const csvContent = "data:text/csv;charset=utf-8," + [metaRows.join("\n"), headers.join(","), ...rows].join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            const safeName = targetProduct.product_name.replace(/[^a-zA-Z0-9_-]/g, "_");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `BOM_Costing_${safeName}_v${targetProduct.version_id}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success("BOM Costing CSV exported successfully.");
        } catch (err: unknown) {
            console.error("Export CSV error:", err);
            toast.error("Failed to export BOM Costing CSV.");
        }
    };

    return (
        <div className="flex items-center gap-2">
            <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-8 text-xs font-medium"
            >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="h-8 text-xs font-medium"
            >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export CSV
            </Button>
        </div>
    );
}
