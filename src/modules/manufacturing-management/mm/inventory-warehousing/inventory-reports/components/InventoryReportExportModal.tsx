"use client";

import React, { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { FileDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { InventoryReportProduct, BranchLookup } from "../types";

interface InventoryReportExportModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    products: InventoryReportProduct[];
    branches: BranchLookup[];
    selectedBranchId: number | null;
}

export function InventoryReportExportModal({
    open,
    onOpenChange,
    products,
    branches,
    selectedBranchId,
}: InventoryReportExportModalProps) {
    const [exportFormat, setExportFormat] = useState<"pdf" | "excel">("pdf");
    const [isExporting, setIsExporting] = useState(false);

    const activeBranchName = branches.find((b) => b.id === selectedBranchId)?.name || "All Branches";

    const handleExport = async () => {
        if (products.length === 0) {
            toast.warning("No products available to export.");
            return;
        }

        setIsExporting(true);
        try {
            if (exportFormat === "pdf") {
                generatePDF();
                toast.success("Printable PDF report generated successfully.");
            } else {
                generateExcel();
                toast.success("CSV / Excel report exported successfully with auto-fit column widths.");
            }
            onOpenChange(false);
        } catch (error) {
            console.error("[ExportModal] Export failed:", error);
            toast.error("Failed to generate export file. Please try again.");
        } finally {
            setIsExporting(false);
        }
    };

    const generateExcel = () => {
        const headers = [
            "Product SKU",
            "Product Name",
            "Product Type",
            "Category",
            "UOM",
            "Usable On-Hand",
            "Expired Qty",
            "Maintaining Qty",
            "Deficit Qty",
            "Stock Status",
            "Standard Unit Cost (PHP)",
            "Est. Replenishment Cost (PHP)",
        ];

        const defaultMinWidths = [18, 45, 22, 26, 12, 18, 14, 18, 16, 18, 24, 26];

        const tableRows = products.map((p) => {
            const statusLabel =
                p.stockStatus === "out_of_stock"
                    ? "Out of Stock"
                    : p.stockStatus === "low_stock"
                        ? "Low Stock"
                        : p.stockStatus === "zero_threshold"
                            ? "Zero Limit"
                            : "Healthy Stock";

            return [
                p.productCode,
                p.productName,
                p.productTypeName || "Unspecified",
                p.categoryName || "Uncategorized",
                p.uomShortcut,
                p.onHandQuantity,
                p.expiredQuantity || 0,
                p.maintainingQuantity,
                p.deficitQuantity,
                statusLabel,
                p.unitCost,
                p.estimatedReplenishmentCost,
            ];
        });

        // Calculate auto-fit column widths using header and data rows with safety padding
        const colWidths = headers.map((header, colIdx) => {
            let maxLen = header.length;
            tableRows.forEach((row) => {
                const cellVal = row[colIdx];
                const str = cellVal != null ? String(cellVal) : "";
                if (str.length > maxLen) {
                    maxLen = str.length;
                }
            });
            const minW = defaultMinWidths[colIdx] || 15;
            return { wch: Math.max(maxLen + 5, minW) };
        });

        const metaRows = [
            ["INVENTORY MAINTAINING QUANTITY & LOW STOCK REPORT"],
            [`Scope / Branch: ${activeBranchName}`],
            [`Generated At: ${new Date().toLocaleString()}`],
            [`Total Qualifying Items: ${products.length}`],
            [], // blank row before table header
        ];

        const aoa = [...metaRows, headers, ...tableRows];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // Pass explicit column widths to Excel worksheet
        ws["!cols"] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, "Maintaining Quantity");

        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([wbout], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        saveAs(blob, `Inventory_Maintaining_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };


    const generatePDF = () => {
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
        const nowStr = new Date().toLocaleString();

        // Header Title
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("INVENTORY MAINTAINING QUANTITY & LOW STOCK REPORT", 14, 14);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(`Branch: ${activeBranchName}  |  Generated: ${nowStr}  |  Total Items: ${products.length}`, 14, 20);

        // Multi-line Product Details with UOM and Category placed underneath Product Name
        const tableBody = products.map((p) => [
            p.productCode,
            `${p.productName}\nCategory: ${p.categoryName || "Uncategorized"}  |  UOM: ${p.uomShortcut}`,
            p.productTypeName || "—",
            p.expiredQuantity && p.expiredQuantity > 0
                ? `${p.onHandQuantity.toLocaleString()}\n(+${p.expiredQuantity.toLocaleString()} exp)`
                : p.onHandQuantity.toLocaleString(),
            p.maintainingQuantity > 0 ? p.maintainingQuantity.toLocaleString() : "—",
            p.deficitQuantity > 0 ? `-${p.deficitQuantity.toLocaleString()}` : "0",
            p.stockStatus === "out_of_stock"
                ? "Out of Stock"
                : p.stockStatus === "low_stock"
                    ? "Low Stock"
                    : p.stockStatus === "zero_threshold"
                        ? "Zero Limit"
                        : "Healthy Stock",
            p.estimatedReplenishmentCost > 0
                ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(p.estimatedReplenishmentCost)
                : p.deficitQuantity > 0 && p.unitCost === 0
                    ? "No Cost Set"
                    : "—",
        ]);

        // Printable landscape page width: 279.4mm (margins: 14mm left & right -> 251.4mm total available width)
        // Balanced column widths: 26 + 80 + 28 + 22 + 22 + 20 + 24 + 29 = 251mm (zero page overflow)
        autoTable(doc, {
            startY: 25,
            margin: { left: 14, right: 14 },
            head: [[
                "SKU",
                "Product Details (Category & UOM)",
                "Type",
                "Usable On-Hand",
                "Maintaining",
                "Deficit",
                "Status",
                "Est. Replenishment",
            ]],
            body: tableBody,
            theme: "grid",
            headStyles: {
                fillColor: [30, 41, 59],
                textColor: [255, 255, 255],
                fontSize: 8,
                fontStyle: "bold",
            },
            bodyStyles: {
                fontSize: 7.5,
                cellPadding: 2,
            },
            columnStyles: {
                0: { cellWidth: 26 },
                1: { cellWidth: 80 },
                2: { cellWidth: 28 },
                3: { cellWidth: 22, halign: "right" },
                4: { cellWidth: 22, halign: "right" },
                5: { cellWidth: 20, halign: "right" },
                6: { cellWidth: 24, halign: "center" },
                7: { cellWidth: 29, halign: "right" },
            },
        });

        doc.save(`Inventory_Maintaining_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] text-xs">
                <DialogHeader>
                    <DialogTitle className="text-base flex items-center gap-2">
                        <FileDown className="w-4 h-4 text-primary" />
                        Export Inventory Report
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Export {products.length} listed products with maintaining quantities, on-hand counts, and replenishment deficits.
                    </DialogDescription>
                </DialogHeader>

                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4 py-2"
                >
                    {/* Format Selection */}
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold">Choose File Format</Label>
                        <RadioGroup
                            value={exportFormat}
                            onValueChange={(val) => setExportFormat(val as "pdf" | "excel")}
                            className="grid grid-cols-2 gap-2.5"
                        >
                            {/* PDF Option */}
                            <div
                                onClick={() => setExportFormat("pdf")}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                    exportFormat === "pdf"
                                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                        : "border-border hover:bg-muted/30"
                                }`}
                            >
                                <RadioGroupItem value="pdf" id="pdf" className="sr-only" />
                                <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                                <div className="text-left">
                                    <div className="font-semibold text-xs text-foreground">PDF Document</div>
                                    <div className="text-[10px] text-muted-foreground">Printable view</div>
                                </div>
                            </div>

                            {/* CSV / Excel Option */}
                            <div
                                onClick={() => setExportFormat("excel")}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                    exportFormat === "excel"
                                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                        : "border-border hover:bg-muted/30"
                                }`}
                            >
                                <RadioGroupItem value="excel" id="excel" className="sr-only" />
                                <FileSpreadsheet className="w-5 h-5 text-emerald-500 shrink-0" />
                                <div className="text-left">
                                    <div className="font-semibold text-xs text-foreground">CSV / Excel</div>
                                    <div className="text-[10px] text-muted-foreground">Auto-fit columns</div>
                                </div>
                            </div>
                        </RadioGroup>
                    </div>

                    {/* Summary Info */}
                    <div className="text-[11px] text-muted-foreground space-y-1 rounded-lg border bg-muted/20 p-2.5">
                        <div className="flex justify-between">
                            <span>Selected Branch Scope:</span>
                            <span className="font-semibold text-foreground">{activeBranchName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Total Qualifying Items:</span>
                            <span className="font-semibold text-foreground">{products.length} Products</span>
                        </div>
                    </div>
                </motion.div>

                <DialogFooter className="flex gap-2 sm:justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        disabled={isExporting}
                        className="text-xs h-8"
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleExport}
                        disabled={isExporting}
                        className="text-xs h-8 bg-primary text-primary-foreground"
                    >
                        {isExporting ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                                Download File
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
