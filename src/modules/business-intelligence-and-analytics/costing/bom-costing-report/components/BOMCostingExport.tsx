"use client";

import React from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { BOMCostNode, BOMCostingReportData } from "../types";

interface BOMCostingExportProps {
    data: BOMCostingReportData | null;
}

export default function BOMCostingExport({ data }: BOMCostingExportProps) {
    if (!data) return null;

    const flattenTree = (tree: BOMCostNode[]): BOMCostNode[] => {
        const flatNodes: BOMCostNode[] = [];
        const traverse = (nodes: BOMCostNode[]) => {
            nodes.forEach((n) => {
                flatNodes.push(n);
                if (n.children && n.children.length > 0) {
                    traverse(n.children);
                }
            });
        };
        traverse(tree);
        return flatNodes;
    };

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
        "Cost Share %",
    ];

    const defaultMinWidths = [8, 36, 22, 18, 16, 22, 18, 10, 12, 20, 24, 22, 14];

    const handleExportExcel = () => {
        try {
            const { targetProduct, tree, summary } = data;
            const flatNodes = flattenTree(tree);

            const tableRows = flatNodes.map((n) => {
                const share = summary.totalMaterialCost > 0
                    ? ((n.totalLineCost / summary.totalMaterialCost) * 100).toFixed(2)
                    : "0.00";
                return [
                    `L${n.level}`,
                    n.productName,
                    n.productCode || "",
                    n.materialClassification || "",
                    n.inventoryRule || "",
                    n.operationName || "",
                    Number(n.scaledRequiredQty.toFixed(4)),
                    n.uomName || "",
                    `${n.wastagePercent.toFixed(2)}%`,
                    Number(n.effectiveQty.toFixed(4)),
                    Number(n.unitCost.toFixed(4)),
                    Number(n.totalLineCost.toFixed(4)),
                    `${share}%`,
                ];
            });

            // Calculate auto-fit column widths using header and data rows
            const colWidths = headers.map((header, colIdx) => {
                let maxLen = header.length;
                tableRows.forEach((row) => {
                    const cellVal = row[colIdx];
                    const str = cellVal != null ? String(cellVal) : "";
                    if (str.length > maxLen) {
                        maxLen = str.length;
                    }
                });
                const minW = defaultMinWidths[colIdx] || 12;
                return { wch: Math.max(maxLen + 4, minW) };
            });

            const metaRows = [
                [`BOM Costing Report: ${targetProduct.product_name}`],
                [`Version: ${targetProduct.version_name}`],
                [`Batch Size: ${targetProduct.target_quantity} ${targetProduct.uom_name} (Base: ${targetProduct.base_quantity} ${targetProduct.uom_name})`],
                [`Total Material Cost: PHP ${summary.totalMaterialCost.toFixed(2)}`],
                [`Material Cost Per Unit: PHP ${summary.costPerUnit.toFixed(4)} / ${targetProduct.uom_name}`],
                [`Generated At: ${new Date().toLocaleString()}`],
                [], // blank row before table header
            ];

            const aoa = [...metaRows, headers, ...tableRows];
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(aoa);

            // Pass explicit column widths to Excel worksheet
            ws["!cols"] = colWidths;

            XLSX.utils.book_append_sheet(wb, ws, "BOM Costing");

            const safeName = targetProduct.product_name.replace(/[^a-zA-Z0-9_-]/g, "_");
            const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
            const blob = new Blob([wbout], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            saveAs(blob, `BOM_Costing_${safeName}_v${targetProduct.version_id}.xlsx`);

            toast.success("BOM Costing Excel (.xlsx) exported successfully with custom column widths.");
        } catch (err: unknown) {
            console.error("Export Excel error:", err);
            toast.error("Failed to export BOM Costing Excel.");
        }
    };

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="h-8 text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border-emerald-500/30"
        >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Export CSV
        </Button>
    );
}
