"use client";

import React, { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { FileDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
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
    const [exportFormat, setExportFormat] = useState<"pdf" | "csv">("pdf");
    const [isExporting, setIsExporting] = useState(false);

    const activeBranchName = branches.find((b) => b.id === selectedBranchId)?.name || "All Branches";

    const handleExport = async () => {
        if (products.length === 0) {
            toast.warning("No products available to export.");
            return;
        }

        setIsExporting(true);
        try {
            if (exportFormat === "csv") {
                generateCSV();
            } else {
                generatePDF();
            }
            toast.success(`Report exported successfully as ${exportFormat.toUpperCase()}`);
            onOpenChange(false);
        } catch (error) {
            console.error("[ExportModal] Export failed:", error);
            toast.error("Failed to generate export file. Please try again.");
        } finally {
            setIsExporting(false);
        }
    };

    const generateCSV = () => {
        const headers = [
            "Product SKU",
            "Product Name",
            "Product Type",
            "Category",
            "UOM",
            "Live On-Hand",
            "Maintaining Qty",
            "Deficit Qty",
            "Stock Status",
            "Standard Unit Cost",
            "Est. Replenishment Cost",
        ];

        const rows = products.map((p) => {
            const row = [
                `"${p.productCode.replace(/"/g, '""')}"`,
                `"${p.productName.replace(/"/g, '""')}"`,
                `"${(p.productTypeName || "Unspecified").replace(/"/g, '""')}"`,
                `"${p.categoryName.replace(/"/g, '""')}"`,
                `"${p.uomShortcut}"`,
                p.onHandQuantity,
                p.maintainingQuantity,
                p.deficitQuantity,
                `"${p.stockStatus}"`,
                p.unitCost,
                p.estimatedReplenishmentCost,
            ];

            return row.join(",");
        });

        const csvContent = [headers.join(","), ...rows].join("\r\n");
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `Inventory_Maintaining_Report_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
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

        const tableBody = products.map((p) => [
            p.productCode,
            p.productName,
            p.productTypeName || "—",
            p.categoryName,
            p.uomShortcut,
            p.onHandQuantity.toLocaleString(),
            p.maintainingQuantity > 0 ? p.maintainingQuantity.toLocaleString() : "—",
            p.deficitQuantity > 0 ? `-${p.deficitQuantity.toLocaleString()}` : "0",
            p.stockStatus === "out_of_stock" ? "Out of Stock" : p.stockStatus === "low_stock" ? "Low Stock" : "Normal",
            p.estimatedReplenishmentCost > 0
                ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(p.estimatedReplenishmentCost)
                : "—",
        ]);

        autoTable(doc, {
            startY: 25,
            head: [["SKU", "Product Name", "Type", "Category", "UOM", "On-Hand", "Maintaining", "Deficit", "Status", "Est. Replenishment"]],
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
            },
            columnStyles: {
                0: { cellWidth: 24 },
                1: { cellWidth: 55 },
                2: { cellWidth: 25 },
                3: { cellWidth: 28 },
                4: { cellWidth: 14, halign: "center" },
                5: { cellWidth: 20, halign: "right" },
                6: { cellWidth: 22, halign: "right" },
                7: { cellWidth: 18, halign: "right" },
                8: { cellWidth: 22, halign: "center" },
                9: { cellWidth: "auto", halign: "right" },
            },
        });

        doc.save(`Inventory_Maintaining_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[440px] text-xs">
                <DialogHeader>
                    <DialogTitle className="text-base flex items-center gap-2">
                        <FileDown className="w-4 h-4 text-primary" />
                        Export Inventory Report
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Export {products.length} listed products with their maintaining quantity and replenishment deficit.
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
                            onValueChange={(val) => setExportFormat(val as "pdf" | "csv")}
                            className="grid grid-cols-2 gap-2.5"
                        >
                            <div className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                exportFormat === "pdf" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/30"
                            }`}>
                                <RadioGroupItem value="pdf" id="pdf" />
                                <Label htmlFor="pdf" className="cursor-pointer flex items-center gap-2 font-medium">
                                    <FileText className="w-4 h-4 text-rose-500" />
                                    PDF Document
                                </Label>
                            </div>

                            <div className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                exportFormat === "csv" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/30"
                            }`}>
                                <RadioGroupItem value="csv" id="csv" />
                                <Label htmlFor="csv" className="cursor-pointer flex items-center gap-2 font-medium">
                                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                                    CSV / Excel
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>


                    {/* Summary Info */}
                    <div className="text-[11px] text-muted-foreground space-y-1">
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
