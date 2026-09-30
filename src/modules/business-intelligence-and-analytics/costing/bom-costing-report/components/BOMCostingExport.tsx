"use client";

import React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { BOMCostNode, BOMCostingReportData } from "../types";
import { formatUomQuantity, formatStandardCurrency } from "./BOMCostingTreeTable";

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
        "Level & Route",
        "Component Name",
        "Product Code",
        "Type",
        "Rule",
        "UOM",
        "Base Qty",
        "Req. Qty",
        "Scrap",
        "Unit Cost (PHP)",
        "Gross (Eff.) Qty",
        "Ext. Total Cost (PHP)",
        "Share %",
    ];

    const defaultMinWidths = [24, 36, 18, 16, 10, 10, 14, 14, 16, 18, 18, 20, 12];

    const handleExportExcel = () => {
        try {
            const { targetProduct, tree, summary } = data;
            const flatNodes = flattenTree(tree);

            const effectiveTotal = summary.totalBatchCost > 0 ? summary.totalBatchCost : summary.totalMaterialCost;

            const tableRows = flatNodes.map((n) => {
                const share = effectiveTotal > 0
                    ? ((n.totalLineCost / effectiveTotal) * 100).toFixed(4)
                    : "0.0000";

                const routeDisplay = `L${n.level} • ${n.operationName || (n.routeSequence ? `Step #${n.routeSequence}` : "Unknown")}`;
                const scrapDisplay = n.wastagePercent > 0
                    ? `+${n.wastagePercent.toFixed(4)}% (+${formatUomQuantity(n.wastageQty, n.uomName)} ${n.uomName})`
                    : "0.0000%";

                return [
                    routeDisplay,
                    n.productName,
                    n.productCode || "",
                    n.materialClassification || "",
                    n.inventoryRule || "-",
                    n.uomName || "",
                    formatUomQuantity(n.baseRequiredQty, n.uomName),
                    formatUomQuantity(n.scaledRequiredQty, n.uomName),
                    scrapDisplay,
                    formatStandardCurrency(n.unitCost, 4),
                    formatUomQuantity(n.effectiveQty, n.uomName),
                    formatStandardCurrency(n.totalLineCost, 4),
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
                return { wch: Math.max(maxLen + 3, minW) };
            });

            const metaRows = [
                [`BOM Standard Costing Report: ${targetProduct.product_name}`],
                [`Revision: ${targetProduct.version_name}`],
                [`Batch Size: ${formatUomQuantity(targetProduct.target_quantity, targetProduct.uom_name)} ${targetProduct.uom_name} (Base: ${formatUomQuantity(targetProduct.base_quantity, targetProduct.uom_name)} ${targetProduct.uom_name})`],
                [`Total Batch Standard Cost: PHP ${formatStandardCurrency(effectiveTotal, 4)}`],
                [`Per Piece Unit Cost: PHP ${formatStandardCurrency(summary.costPerUnit, 4)} / ${targetProduct.uom_name}`],
                [`Direct Materials: PHP ${formatStandardCurrency(summary.totalMaterialCost, 4)} (${summary.materialsSharePct.toFixed(4)}%)`],
                [`Process Direct Labor: PHP ${formatStandardCurrency(summary.directLaborCost, 4)} (${summary.laborSharePct.toFixed(4)}%)`],
                [`Mfg Overhead: PHP ${formatStandardCurrency(summary.mfgOverheadCost, 4)} (${summary.overheadSharePct.toFixed(4)}%)`],
                [`Generated At: ${new Date().toLocaleString()}`],
                [], // blank row before table header
            ];

            const aoa = [...metaRows, headers, ...tableRows];
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(aoa);

            // Pass explicit column widths to Excel worksheet
            ws["!cols"] = colWidths;

            XLSX.utils.book_append_sheet(wb, ws, "BOM Standard Costing");

            const safeName = targetProduct.product_name.replace(/[^a-zA-Z0-9_-]/g, "_");
            const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
            const blob = new Blob([wbout], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            saveAs(blob, `BOM_Standard_Costing_${safeName}_v${targetProduct.version_id}.xlsx`);

            toast.success("BOM Standard Costing Excel (.xlsx) exported successfully.");
        } catch (err: unknown) {
            console.error("Export Excel error:", err);
            toast.error("Failed to export BOM Standard Costing Excel.");
        }
    };

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="h-8 text-xs font-medium bg-background text-foreground hover:bg-muted"
        >
            <Download className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            Export Excel/CSV
        </Button>
    );
}
