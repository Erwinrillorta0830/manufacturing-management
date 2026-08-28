"use client";

import React, { useState } from "react";
import { 
    Search, RefreshCw, FileDown, Boxes, ChevronDown, ChevronRight, Loader2, Calendar, Layers, Package, ScrollText, MapPin
} from "lucide-react";
import { 
    ProductReportNode, MovementFilters, ProductLookup, BranchLookup, LotLookup 
} from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from "@/components/ui/table";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { 
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RawProduct, RawBatch } from "../services/inventory-reports-api";

interface InventoryMovementReportProps {
    filters: MovementFilters;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    loading: boolean;
    products: ProductLookup[];
    branches: BranchLookup[];
    lotsList: LotLookup[];
    loadMovements: () => Promise<void>;
    setSingleFilter: (key: keyof MovementFilters, value: unknown) => void;
    groupedData: ProductReportNode[];
    batches: RawBatch[];
    rawProducts: RawProduct[];
    activeProductType: number;
    setActiveProductType: (type: number) => void;
}

const getQAStatusBadgeStyles = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("pass")) {
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 dark:border-emerald-500/30";
    }
    if (s.includes("fail") || s.includes("hold")) {
        return "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 dark:border-rose-500/30";
    }
    return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 dark:border-amber-500/30";
};

export default function InventoryMovementReport({
    filters,
    searchQuery,
    setSearchQuery,
    loading,
    products,
    branches,
    lotsList,
    loadMovements,
    setSingleFilter,
    groupedData,
    batches,
    rawProducts,
    activeProductType,
    setActiveProductType
}: InventoryMovementReportProps) {
    // Multi-level Expansion States for Excel Spreadsheet Grid
    const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});
    const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({});
    const [expandedLots, setExpandedLots] = useState<Record<string, boolean>>({});

    // PDF Export Modal State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [pdfProductType, setPdfProductType] = useState<number>(388);
    const [pdfSearchQuery, setPdfSearchQuery] = useState("");
    const [pdfSelectedProductIds, setPdfSelectedProductIds] = useState<number[]>([]);
    const [pdfBranchId, setPdfBranchId] = useState<number | null>(null);
    const [pdfLotId, setPdfLotId] = useState<number | null>(null);
    const [pdfMfgDate, setPdfMfgDate] = useState<string>("");
    const [pdfExpiryDate, setPdfExpiryDate] = useState<string>("");

    // Filtered products list for main screen Product SKU dropdown
    const filteredProductsForMainScreen = React.useMemo(() => {
        return products.filter((p) => Number(p.productType) === activeProductType);
    }, [products, activeProductType]);

    // Product IDs that actually have inventory movement data
    const movementProductIds = React.useMemo(() => {
        return new Set(batches.map(b => b.product_id));
    }, [batches]);

    // Active products shown inside PDF Export dialog checklist (only products with movement data)
    const activeProducts = React.useMemo(() => {
        return products.filter((p) => Number(p.productType) === pdfProductType && movementProductIds.has(p.productId));
    }, [products, pdfProductType, movementProductIds]);

    // Filtered branches based on selected products in the modal
    const pdfActiveBranchIds = React.useMemo(() => {
        if (pdfSelectedProductIds.length === 0) return new Set<number>();
        return new Set(
            batches
                .filter(b => pdfSelectedProductIds.includes(b.product_id))
                .map(b => b.branch_id)
        );
    }, [batches, pdfSelectedProductIds]);

    const pdfActiveBranches = React.useMemo(() => {
        return branches.filter(b => pdfActiveBranchIds.has(b.branchId));
    }, [branches, pdfActiveBranchIds]);

    // Filtered lot locations based on selected products in the modal and selected branch
    const pdfLots = React.useMemo(() => {
        const filtered = batches.filter(b => 
            pdfSelectedProductIds.includes(b.product_id) &&
            (pdfBranchId === null || b.branch_id === pdfBranchId)
        );
        const lotLookupMap = new Map<number, string>();
        lotsList.forEach(l => lotLookupMap.set(l.lotId, l.lotName));

        const uniqueLots = new Map<number, string>();
        filtered.forEach(b => {
            if (b.lot_id) {
                const lotIdNum = Number(b.lot_id);
                const lotName = b.lot_name || lotLookupMap.get(lotIdNum) || `Lot #${lotIdNum}`;
                uniqueLots.set(lotIdNum, lotName);
            }
        });
        return Array.from(uniqueLots.entries()).map(([id, name]) => ({
            lotId: id,
            lotName: name
        }));
    }, [batches, pdfSelectedProductIds, pdfBranchId, lotsList]);

    // Reset Branch / Lot selection if they are no longer in the active lists
    React.useEffect(() => {
        if (pdfBranchId !== null && !pdfActiveBranchIds.has(pdfBranchId)) {
            queueMicrotask(() => {
                setPdfBranchId(null);
                setPdfLotId(null);
            });
        }
    }, [pdfActiveBranchIds, pdfBranchId]);

    React.useEffect(() => {
        const lotExists = pdfLots.some(l => l.lotId === pdfLotId);
        if (pdfLotId !== null && !lotExists) {
            queueMicrotask(() => {
                setPdfLotId(null);
            });
        }
    }, [pdfLots, pdfLotId]);

    const openExportModal = () => {
        setPdfProductType(activeProductType);
        setPdfBranchId(filters.branchId);
        setPdfLotId(filters.lotId);
        setPdfMfgDate(filters.startDate || "");
        setPdfExpiryDate(filters.endDate || "");

        const ids = products
            .filter((p) => Number(p.productType) === activeProductType && movementProductIds.has(p.productId))
            .map((p) => p.productId);

        setPdfSelectedProductIds(ids);
        setPdfSearchQuery("");
        setIsExportModalOpen(true);
    };

    const handlePdfProductTypeChange = (typeVal: number) => {
        setPdfProductType(typeVal);
        setPdfBranchId(null);
        setPdfLotId(null);

        const ids = products
            .filter((p) => Number(p.productType) === typeVal && movementProductIds.has(p.productId))
            .map((p) => p.productId);

        setPdfSelectedProductIds(ids);
    };

    const toggleProductRow = (productId: number) => {
        setExpandedProducts(prev => ({ ...prev, [productId]: !prev[productId] }));
    };

    const toggleVersionRow = (productId: number, versionId: number | null) => {
        const key = `${productId}-${versionId ?? "null"}`;
        setExpandedVersions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleLotRow = (productId: number, versionId: number | null, lotId: number | null, branchId: number) => {
        const key = `${productId}-${versionId ?? "null"}-${lotId ?? "null"}-${branchId}`;
        setExpandedLots(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const renderCapacityBar = (utilPercent: number) => {
        const clamped = Math.min(Math.max(utilPercent, 0), 100);
        let barColor = "hsl(var(--success))";
        if (clamped >= 90) barColor = "hsl(var(--destructive))";
        else if (clamped >= 70) barColor = "hsl(var(--warning))";
        else if (clamped >= 30) barColor = "hsl(var(--primary))";

        return (
            <div className="flex items-center gap-1.5 justify-end">
                <div className="bg-muted rounded-full h-1.5 w-12 overflow-hidden relative border border-border">
                    <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${clamped}%`, backgroundColor: barColor }}
                    />
                </div>
                <span className="text-[10px] font-semibold font-mono text-muted-foreground w-9 text-right">{clamped.toFixed(1)}%</span>
            </div>
        );
    };

    const handleExportPdf = async () => {
        if (pdfSelectedProductIds.length === 0) {
            toast.warning("Please select at least one product to export.");
            return;
        }

        const filteredBatches = batches.filter((b) => {
            if (!pdfSelectedProductIds.includes(b.product_id)) return false;
            if (pdfBranchId !== null && b.branch_id !== pdfBranchId) return false;
            if (pdfLotId !== null && b.lot_id !== pdfLotId) return false;

            const matchedProduct = rawProducts.find((p) => p.product_id === b.product_id);
            if (!matchedProduct || Number(matchedProduct.product_type) !== pdfProductType) return false;

            if (pdfMfgDate) {
                const createdDate = b.created_on ? b.created_on.split("T")[0] : null;
                if (createdDate !== pdfMfgDate) return false;
            }
            if (pdfExpiryDate) {
                const expDate = b.expiration_date ? b.expiration_date.split("T")[0] : null;
                if (expDate !== pdfExpiryDate) return false;
            }
            return true;
        });

        if (filteredBatches.length === 0) {
            toast.warning("No data found matching the selected PDF Export filters.");
            return;
        }

        const activeBranch = branches.find(b => b.branchId === pdfBranchId)?.branchName || "All Branches";
        toast.info("Generating report PDF...");

        try {
            const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            let currentY = 15;

            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text("PRODUCT INVENTORY MOVEMENT BREAKDOWN REPORT", 10, currentY, { baseline: "top" });
            currentY += 6;

            doc.setFontSize(7.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139);

            let selectedProductTypeName = "Finished Goods";
            if (pdfProductType === 389) selectedProductTypeName = "Raw Materials";
            else if (pdfProductType === 390) selectedProductTypeName = "Packaging Items";

            doc.text(`Branch: ${activeBranch} | Product Type: ${selectedProductTypeName}`, 10, currentY);
            doc.text(`Date Generated: ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (PST)`, pageW - 10, currentY, { align: "right" });
            currentY += 5;

            const mfgFilterText = pdfMfgDate ? `Mfg Date = ${pdfMfgDate}` : "Mfg Date: Any";
            const expFilterText = pdfExpiryDate ? `Expiry Date = ${pdfExpiryDate}` : "Expiry Date: Any";
            doc.text(`${mfgFilterText} | ${expFilterText}`, 10, currentY);
            currentY += 8;

            const printableW = pageW - 20;
            const colWidth = (parts: number) => (parts / 268) * printableW;

            // Generate report content based on Product Type hierarchy
            if (pdfProductType === 388) {
                // 4-Level Finished Goods PDF rendering
                const productNodesMap = new Map<number, ProductReportNode>();
                const branchMap = new Map<number, string>();
                branches.forEach((b) => branchMap.set(b.branchId, b.branchName));

                const lotMap = new Map<number, LotLookup>();
                lotsList.forEach((l) => lotMap.set(l.lotId, l));

                const productUOMMap = new Map<number, string>();
                rawProducts.forEach((p) => productUOMMap.set(p.product_id, p.unit_of_measurement?.unit_shortcut || "units"));

                filteredBatches.forEach((b) => {
                    let node = productNodesMap.get(b.product_id);
                    if (!node) {
                        const matchedProduct = rawProducts.find((p) => p.product_id === b.product_id);
                        node = {
                            productId: b.product_id,
                            productName: matchedProduct?.product_name || `Product #${b.product_id}`,
                            productCode: matchedProduct?.product_code || `SKU-${b.product_id}`,
                            uomShortcut: productUOMMap.get(b.product_id) || "units",
                            totalAvailable: 0,
                            versions: [],
                            lots: []
                        };
                        productNodesMap.set(b.product_id, node);
                    }

                    const versionId = b.version_id ? Number(b.version_id) : null;
                    const versionName = b.version_name || (versionId !== null ? `Version #${versionId}` : "Default Version");

                    let verNode = node.versions!.find(v => v.versionId === versionId || (v.versionId === null && versionId === null));
                    if (!verNode) {
                        verNode = { versionId, versionName, subtotalQuantity: 0, lots: [] };
                        node.versions!.push(verNode);
                    }

                    const lotId = b.lot_id ? Number(b.lot_id) : null;
                    const lotInfo = lotId !== null ? lotMap.get(lotId) : null;
                    const maxCapacity = lotInfo?.maxBatchCapacity || 10;
                    const branchName = branchMap.get(b.branch_id) || `Branch #${b.branch_id}`;
                    const lotName = b.lot_name || lotInfo?.lotName || (lotId !== null ? `Lot #${lotId}` : "Unassigned");

                    let lotNode = verNode.lots.find(l => l.lotId === lotId && l.branchId === b.branch_id);
                    if (!lotNode) {
                        lotNode = {
                            lotId,
                            lotName,
                            branchId: b.branch_id,
                            branchName,
                            maxBatchCapacity: maxCapacity,
                            subtotalQuantity: 0,
                            batches: []
                        };
                        verNode.lots.push(lotNode);
                    }

                    lotNode.batches.push({
                        lineId: b.line_id,
                        productId: b.product_id,
                        versionId,
                        versionName,
                        branchId: b.branch_id,
                        branchName,
                        lotId,
                        lotName,
                        maxBatchCapacity: maxCapacity,
                        sourceDocumentNo: b.source_reference || "N/A",
                        transactionType: b.transaction_type || (b.source_type ? String(b.source_type).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Legacy Stock"),
                        batchNo: b.batch_no || b.lot_number || "LOT-N/A",
                        quantity: Number(b.quantity_received || 0),
                        onHandQuantity: Number(b.on_hand_quantity ?? b.quantity_received ?? 0),
                        reservedQuantity: Number(b.reserved_quantity || 0),
                        unitCost: Number(b.final_landed_unit_cost || b.base_unit_cost_php || 0),
                        qaStatus: b.qa_status || "Passed",
                        remarks: b.remarks || b.rejection_reason || null,
                        expiryDate: b.expiration_date || null,
                        createdOn: b.created_on || null
                    });
                });

                const pdfDataArr = Array.from(productNodesMap.values());
                pdfDataArr.forEach(prod => {
                    prod.versions?.forEach(ver => {
                        ver.lots.forEach(lot => {
                            lot.subtotalQuantity = lot.batches.reduce((sum, item) => sum + item.quantity, 0);
                        });
                        ver.subtotalQuantity = ver.lots.reduce((sum, l) => sum + l.subtotalQuantity, 0);
                    });
                    prod.totalAvailable = prod.versions?.reduce((sum, v) => sum + v.subtotalQuantity, 0) || 0;
                });

                pdfDataArr.forEach((prod) => {
                    if (currentY > pageH - 30) {
                        doc.addPage();
                        currentY = 15;
                    }

                    doc.setFontSize(8.5);
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(15, 23, 42);
                    doc.text(`Product: ${prod.productCode} - ${prod.productName} | Total Available: ${prod.totalAvailable.toLocaleString("en-PH", { minimumFractionDigits: 2 })} ${prod.uomShortcut}`, 10, currentY, { baseline: "top" });
                    currentY += 5;

                    prod.versions?.forEach((ver) => {
                        if (currentY > pageH - 25) {
                            doc.addPage();
                            currentY = 15;
                        }
                        doc.setFontSize(7.5);
                        doc.setFont("helvetica", "bold");
                        doc.setTextColor(71, 85, 105);
                        doc.text(`  Recipe Version: ${ver.versionName} | Subtotal: ${ver.subtotalQuantity.toLocaleString("en-PH", { minimumFractionDigits: 2 })} ${prod.uomShortcut}`, 12, currentY);
                        currentY += 4;

                        ver.lots.forEach((lot) => {
                            if (currentY > pageH - 25) {
                                doc.addPage();
                                currentY = 15;
                            }
                            const lotSubtotal = lot.batches.reduce((sum, item) => sum + item.quantity, 0);
                            const spaceUtil = lot.maxBatchCapacity > 0 ? `${((lotSubtotal / lot.maxBatchCapacity) * 100).toFixed(1)}%` : "0.0%";

                            doc.setFontSize(7);
                            doc.setFont("helvetica", "bold");
                            doc.setTextColor(30, 41, 59);
                            doc.text(`    Storage Lot Location: ${lot.lotName} (${lot.branchName}) | Space Util: ${spaceUtil} | Subtotal: ${lotSubtotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })} ${prod.uomShortcut}`, 14, currentY);
                            currentY += 4;

                            const tableRows: string[][] = [];
                            lot.batches.forEach((b) => {
                                const cost = `PHP ${b.unitCost.toFixed(2)}`;
                                const qty = b.quantity.toLocaleString("en-PH", { minimumFractionDigits: 2 });
                                const mfgDate = b.createdOn ? b.createdOn.split("T")[0] : "—";
                                const expDate = b.expiryDate || "—";

                                tableRows.push([
                                    b.batchNo,
                                    b.sourceDocumentNo,
                                    b.transactionType,
                                    qty,
                                    cost,
                                    b.qaStatus,
                                    mfgDate,
                                    expDate,
                                    b.remarks || "—"
                                ]);
                            });

                            autoTable(doc, {
                                startY: currentY,
                                margin: { left: 16, right: 10 },
                                head: [["Batch No", "Source Doc No", "Txn Type", "Qty", "Unit Cost", "QA Status", "Mfg Date", "Expiry Date", "Remarks"]],
                                body: tableRows,
                                theme: "grid",
                                headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 5, lineColor: [203, 213, 225], lineWidth: 0.1 },
                                bodyStyles: { fontSize: 4.5 },
                                columnStyles: {
                                    0: { cellWidth: colWidth(30) },
                                    1: { cellWidth: colWidth(34) },
                                    2: { cellWidth: colWidth(28) },
                                    3: { cellWidth: colWidth(20), halign: "right" },
                                    4: { cellWidth: colWidth(24), halign: "right" },
                                    5: { cellWidth: colWidth(20), halign: "center" },
                                    6: { cellWidth: colWidth(22), halign: "center" },
                                    7: { cellWidth: colWidth(22), halign: "center" },
                                    8: { cellWidth: "auto" }
                                }
                            });

                            const lastAutoTable = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
                            currentY = (lastAutoTable?.finalY ?? currentY) + 6;
                        });
                    });
                    currentY += 4;
                });
            } else {
                // 3-Level Raw Materials & Packaging Items PDF rendering
                const productNodesMap = new Map<number, ProductReportNode>();
                const branchMap = new Map<number, string>();
                branches.forEach((b) => branchMap.set(b.branchId, b.branchName));

                const lotMap = new Map<number, LotLookup>();
                lotsList.forEach((l) => lotMap.set(l.lotId, l));

                const productUOMMap = new Map<number, string>();
                rawProducts.forEach((p) => productUOMMap.set(p.product_id, p.unit_of_measurement?.unit_shortcut || "units"));

                filteredBatches.forEach((b) => {
                    let node = productNodesMap.get(b.product_id);
                    if (!node) {
                        const matchedProduct = rawProducts.find((p) => p.product_id === b.product_id);
                        node = {
                            productId: b.product_id,
                            productName: matchedProduct?.product_name || `Product #${b.product_id}`,
                            productCode: matchedProduct?.product_code || `SKU-${b.product_id}`,
                            uomShortcut: productUOMMap.get(b.product_id) || "units",
                            totalAvailable: 0,
                            lots: []
                        };
                        productNodesMap.set(b.product_id, node);
                    }

                    const lotId = b.lot_id ? Number(b.lot_id) : null;
                    const lotInfo = lotId !== null ? lotMap.get(lotId) : null;
                    const maxCapacity = lotInfo?.maxBatchCapacity || 10;
                    const branchName = branchMap.get(b.branch_id) || `Branch #${b.branch_id}`;
                    const lotName = b.lot_name || lotInfo?.lotName || (lotId !== null ? `Lot #${lotId}` : "Unassigned");

                    if (!node.lots) node.lots = [];
                    let lotNode = node.lots.find(l => l.lotId === lotId && l.branchId === b.branch_id);
                    if (!lotNode) {
                        lotNode = {
                            lotId,
                            lotName,
                            branchId: b.branch_id,
                            branchName,
                            maxBatchCapacity: maxCapacity,
                            subtotalQuantity: 0,
                            batches: []
                        };
                        node.lots.push(lotNode);
                    }

                    lotNode.batches.push({
                        lineId: b.line_id,
                        productId: b.product_id,
                        branchId: b.branch_id,
                        branchName,
                        lotId,
                        lotName,
                        maxBatchCapacity: maxCapacity,
                        sourceDocumentNo: b.source_reference || "N/A",
                        transactionType: b.transaction_type || (b.source_type ? String(b.source_type).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Legacy Stock"),
                        batchNo: b.batch_no || b.lot_number || "LOT-N/A",
                        quantity: Number(b.quantity_received || 0),
                        onHandQuantity: Number(b.on_hand_quantity ?? b.quantity_received ?? 0),
                        reservedQuantity: Number(b.reserved_quantity || 0),
                        unitCost: Number(b.final_landed_unit_cost || b.base_unit_cost_php || 0),
                        qaStatus: b.qa_status || "Passed",
                        remarks: b.remarks || b.rejection_reason || null,
                        expiryDate: b.expiration_date || null,
                        createdOn: b.created_on || null
                    });
                });

                const pdfDataArr = Array.from(productNodesMap.values());
                pdfDataArr.forEach((prod) => {
                    prod.totalAvailable = prod.lots ? prod.lots.reduce((acc, lot) => acc + lot.batches.reduce((bSum, item) => bSum + item.quantity, 0), 0) : 0;

                    if (currentY > pageH - 30) {
                        doc.addPage();
                        currentY = 15;
                    }

                    doc.setFontSize(8.5);
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(15, 23, 42);
                    doc.text(`Product: ${prod.productCode} - ${prod.productName} | Total Available: ${prod.totalAvailable.toLocaleString("en-PH", { minimumFractionDigits: 2 })} ${prod.uomShortcut}`, 10, currentY, { baseline: "top" });
                    currentY += 5;

                    prod.lots?.forEach((lot) => {
                        if (currentY > pageH - 25) {
                            doc.addPage();
                            currentY = 15;
                        }
                        const lotSubtotal = lot.batches.reduce((sum, item) => sum + item.quantity, 0);
                        const spaceUtil = lot.maxBatchCapacity > 0 ? `${((lotSubtotal / lot.maxBatchCapacity) * 100).toFixed(1)}%` : "0.0%";

                        doc.setFontSize(7.5);
                        doc.setFont("helvetica", "bold");
                        doc.setTextColor(30, 41, 59);
                        doc.text(`  Storage Lot Location: ${lot.lotName} (${lot.branchName}) | Space Util: ${spaceUtil} | Subtotal: ${lotSubtotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })} ${prod.uomShortcut}`, 12, currentY);
                        currentY += 4;

                        const tableRows: string[][] = [];
                        lot.batches.forEach((b) => {
                            const cost = `PHP ${b.unitCost.toFixed(2)}`;
                            const qty = b.quantity.toLocaleString("en-PH", { minimumFractionDigits: 2 });
                            const mfgDate = b.createdOn ? b.createdOn.split("T")[0] : "—";
                            const expDate = b.expiryDate || "—";

                            tableRows.push([
                                b.batchNo,
                                b.sourceDocumentNo,
                                b.transactionType,
                                qty,
                                cost,
                                b.qaStatus,
                                mfgDate,
                                expDate,
                                b.remarks || "—"
                            ]);
                        });

                        autoTable(doc, {
                            startY: currentY,
                            margin: { left: 14, right: 10 },
                            head: [["Batch No", "Source Doc No", "Txn Type", "Qty", "Unit Cost", "QA Status", "Mfg Date", "Expiry Date", "Remarks"]],
                            body: tableRows,
                            theme: "grid",
                            headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 5, lineColor: [203, 213, 225], lineWidth: 0.1 },
                            bodyStyles: { fontSize: 4.5 },
                            columnStyles: {
                                0: { cellWidth: colWidth(30) },
                                1: { cellWidth: colWidth(34) },
                                2: { cellWidth: colWidth(28) },
                                3: { cellWidth: colWidth(20), halign: "right" },
                                4: { cellWidth: colWidth(24), halign: "right" },
                                5: { cellWidth: colWidth(20), halign: "center" },
                                6: { cellWidth: colWidth(22), halign: "center" },
                                7: { cellWidth: colWidth(22), halign: "center" },
                                8: { cellWidth: "auto" }
                            }
                        });

                        const lastAutoTable = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
                        currentY = (lastAutoTable?.finalY ?? currentY) + 6;
                    });
                    currentY += 4;
                });
            }

            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(7.5);
                doc.setFont("helvetica", "normal");
                doc.setTextColor(100, 116, 139);
                doc.text(
                    `Page ${i} of ${pageCount}`,
                    pageW - 10,
                    pageH - 10,
                    { align: "right" }
                );
            }

            doc.save(`Product_Inventory_Movement_Breakdown_Report_${activeBranch.replace(/\s+/g, "_")}.pdf`);
            toast.success("PDF generated and downloaded successfully!");
            setIsExportModalOpen(false);
        } catch (error) {
            console.error("PDF generation failed:", error);
            toast.error("Failed to generate PDF report.");
        }
    };

    return (
        <div className="space-y-4">
            {/* Filter Panel */}
            <Card className="border border-border/80 bg-card shadow-sm">
                <CardContent className="p-4 flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {/* Branch Selector */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-muted-foreground">Branch</label>
                            <SearchableSelect
                                options={[
                                    { value: "all", label: "All Branches" },
                                    ...branches.map((b) => ({ value: String(b.branchId), label: b.branchName }))
                                ]}
                                value={filters.branchId !== null ? String(filters.branchId) : "all"}
                                onValueChange={(val) => setSingleFilter("branchId", val === "all" ? null : Number(val))}
                                placeholder="All Branches"
                                className="h-9 bg-background border-border text-foreground font-normal hover:bg-muted/50 text-left justify-between w-full"
                            />
                        </div>

                        {/* Lot Location Selector */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-muted-foreground">Location Lot</label>
                            <SearchableSelect
                                options={[
                                    { value: "all", label: "All Locations" },
                                    ...lotsList.map((l) => ({ value: String(l.lotId), label: l.lotName }))
                                ]}
                                value={filters.lotId !== null ? String(filters.lotId) : "all"}
                                onValueChange={(val) => setSingleFilter("lotId", val === "all" ? null : Number(val))}
                                placeholder="All Locations"
                                className="h-9 bg-background border-border text-foreground font-normal hover:bg-muted/50 text-left justify-between w-full"
                            />
                        </div>

                        {/* Product Selector */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-muted-foreground">Product SKU</label>
                            <SearchableSelect
                                options={[
                                    { value: "all", label: "All Products" },
                                    ...filteredProductsForMainScreen.map((p) => ({ value: String(p.productId), label: `${p.productCode} - ${p.productName}` }))
                                ]}
                                value={filters.productId !== null ? String(filters.productId) : "all"}
                                onValueChange={(val) => setSingleFilter("productId", val === "all" ? null : Number(val))}
                                placeholder="All Products"
                                className="h-9 bg-background border-border text-foreground font-normal hover:bg-muted/50 text-left justify-between w-full"
                            />
                        </div>

                        {/* Connected Date Range Selector */}
                        <div className="flex flex-col gap-1.5 w-full col-span-1 sm:col-span-2 md:col-span-2 lg:col-span-2">
                            <div className="flex items-center gap-2 w-full">
                                <div className="flex flex-col gap-1.5 flex-1">
                                    <label className="text-xs font-semibold text-muted-foreground">Manufacturing Date</label>
                                    <div className="relative w-full">
                                        <input
                                            type="date"
                                            value={filters.startDate}
                                            onChange={(e) => setSingleFilter("startDate", e.target.value)}
                                            className="flex h-9 w-full rounded-md border border-border bg-background pl-2.5 pr-8 py-1.5 text-[11px] sm:text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                                            title="Manufacturing Date"
                                        />
                                        <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-muted-foreground/60" />
                                    </div>
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0 font-medium select-none self-end pb-2.5">to</span>
                                <div className="flex flex-col gap-1.5 flex-1">
                                    <label className="text-xs font-semibold text-muted-foreground">Expiry Date</label>
                                    <div className="relative w-full">
                                        <input
                                            type="date"
                                            value={filters.endDate}
                                            onChange={(e) => setSingleFilter("endDate", e.target.value)}
                                            className="flex h-9 w-full rounded-md border border-border bg-background pl-2.5 pr-8 py-1.5 text-[11px] sm:text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                                            title="Expiry Date"
                                        />
                                        <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-muted-foreground/60" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-border/50 pt-3 flex-wrap gap-2">
                        {/* Search Input */}
                        <div className="relative w-full sm:max-w-xs">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                            <Input
                                placeholder="Search products or lots..."
                                className="pl-9 h-9 bg-background border border-border"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-9 gap-1.5" 
                                onClick={openExportModal}
                                disabled={loading}
                            >
                                <FileDown className="h-4 w-4" />
                                Export PDF
                            </Button>
                            <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-9 w-9" 
                                onClick={() => loadMovements()}
                                disabled={loading}
                            >
                                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Excel Sheet-Style Tab Switcher */}
            <div className="flex bg-muted/60 border border-border p-1 rounded-lg w-fit shadow-xs">
                <button
                    type="button"
                    onClick={() => setActiveProductType(388)}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${activeProductType === 388 ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"}`}
                >
                    <Layers className="h-4 w-4" /> Finished Goods
                </button>
                <button
                    type="button"
                    onClick={() => setActiveProductType(389)}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${activeProductType === 389 ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"}`}
                >
                    <Boxes className="h-4 w-4" /> Raw Materials
                </button>
                <button
                    type="button"
                    onClick={() => setActiveProductType(390)}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${activeProductType === 390 ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"}`}
                >
                    <Package className="h-4 w-4" /> Packaging Items
                </button>
            </div>

            {/* High-Density Excel-Type Spreadsheet UI Data Grid Container */}
            <Card className="border border-border bg-card shadow-sm overflow-hidden rounded-lg">
                <div className="overflow-x-auto">
                    <Table className="border-collapse w-full">
                        <TableHeader className="bg-muted/80 backdrop-blur border-b border-border">
                            <TableRow className="border-b border-border hover:bg-transparent">
                                <TableHead className="w-[65%] pl-4 text-xs font-bold uppercase tracking-wider text-foreground border-r border-border">
                                    Product SKU / Recipe Version / Storage Bin & Batch Code
                                </TableHead>
                                <TableHead className="w-[35%] pr-4 text-right text-xs font-bold uppercase tracking-wider text-foreground">
                                    Available Stock Qty (On Hand - Reserved)
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border">
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={2} className="h-64 text-center">
                                        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                            <span className="text-sm font-medium">Fetching inventory records...</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : groupedData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={2} className="h-64 text-center">
                                        <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                                            <Boxes className="h-12 w-12 text-muted-foreground/30 mb-2" />
                                            <span className="text-sm font-semibold">No inventory records found</span>
                                            <p className="text-xs max-w-xs mt-1">
                                                No stock records match the selected filter criteria. Try choosing another branch or resetting filters.
                                            </p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                groupedData.map((prod) => {
                                    const isProdExpanded = !!expandedProducts[prod.productId];

                                    return (
                                        <React.Fragment key={prod.productId}>
                                            {/* LEVEL 1: PRODUCT ROW (Dark Shading) */}
                                            <TableRow 
                                                className="group/prod cursor-pointer bg-muted/60 dark:bg-muted/40 hover:bg-muted/80 transition-colors border-b border-border select-none"
                                                onClick={() => toggleProductRow(prod.productId)}
                                            >
                                                <TableCell className="font-bold text-foreground py-2 pl-3 border-r border-border">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-muted-foreground group-hover/prod:text-foreground transition-colors">
                                                            {isProdExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                        </span>
                                                        <Boxes className="h-4 w-4 text-primary shrink-0" />
                                                        <span className="text-xs font-mono font-bold bg-background text-foreground px-2 py-0.5 rounded border border-border shadow-xs">
                                                            {prod.productCode}
                                                        </span>
                                                        <span className="text-xs sm:text-sm font-bold text-foreground">{prod.productName}</span>
                                                        {activeProductType === 388 && prod.versions && (
                                                            <span className="text-[10px] font-semibold text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border ml-2">
                                                                {prod.versions.length} {prod.versions.length === 1 ? "Version" : "Versions"}
                                                            </span>
                                                        )}
                                                        {activeProductType !== 388 && prod.lots && (
                                                            <span className="text-[10px] font-semibold text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border ml-2">
                                                                {prod.lots.length} {prod.lots.length === 1 ? "Lot Location" : "Lot Locations"}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-black font-mono text-right pr-4 text-xs sm:text-sm text-foreground">
                                                    {prod.totalAvailable.toLocaleString("en-PH", { minimumFractionDigits: 2 })} {prod.uomShortcut}
                                                </TableCell>
                                            </TableRow>

                                            {/* LEVEL 2 & DEEPER BREAKDOWN */}
                                            {isProdExpanded && (
                                                activeProductType === 388 ? (
                                                    // 4-LEVEL FINISHED GOODS BREAKDOWN: Product ➔ Version ➔ Lot ➔ Batch
                                                    prod.versions?.map((ver) => {
                                                        const verKey = `${prod.productId}-${ver.versionId ?? "null"}`;
                                                        const isVerExpanded = !!expandedVersions[verKey];

                                                        return (
                                                            <React.Fragment key={verKey}>
                                                                {/* LEVEL 2: RECIPE VERSION ROW */}
                                                                <TableRow 
                                                                    className="group/ver cursor-pointer bg-muted/30 dark:bg-muted/20 hover:bg-muted/50 transition-colors border-b border-border pl-6 select-none"
                                                                    onClick={() => toggleVersionRow(prod.productId, ver.versionId)}
                                                                >
                                                                    <TableCell className="py-2 pl-8 border-r border-border">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-muted-foreground group-hover/ver:text-foreground">
                                                                                {isVerExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                                            </span>
                                                                            <ScrollText className="h-3.5 w-3.5 text-muted-foreground" />
                                                                            <span className="text-xs font-semibold text-foreground">
                                                                                {ver.versionName}
                                                                            </span>
                                                                            <span className="text-[10px] text-muted-foreground bg-background/80 px-1.5 py-0.2 rounded border border-border font-mono">
                                                                                {ver.lots.length} {ver.lots.length === 1 ? "Lot Location" : "Lot Locations"}
                                                                            </span>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="font-bold font-mono text-right pr-4 text-xs text-foreground/90">
                                                                        {ver.subtotalQuantity.toLocaleString("en-PH", { minimumFractionDigits: 2 })} {prod.uomShortcut}
                                                                    </TableCell>
                                                                </TableRow>

                                                                {/* LEVEL 3: LOT STORAGE LOCATION ROW */}
                                                                {isVerExpanded && ver.lots.map((lot) => {
                                                                    const lotKey = `${prod.productId}-${ver.versionId ?? "null"}-${lot.lotId ?? "null"}-${lot.branchId}`;
                                                                    const isLotExpanded = !!expandedLots[lotKey];

                                                                    const spaceUtil = lot.maxBatchCapacity > 0
                                                                        ? (lot.subtotalQuantity / lot.maxBatchCapacity) * 100
                                                                        : 0;

                                                                    return (
                                                                        <React.Fragment key={lotKey}>
                                                                            <TableRow 
                                                                                className="group/lot cursor-pointer bg-muted/10 dark:bg-muted/5 hover:bg-muted/30 transition-colors border-b border-border select-none"
                                                                                onClick={() => toggleLotRow(prod.productId, ver.versionId, lot.lotId, lot.branchId)}
                                                                            >
                                                                                <TableCell className="py-1.5 pl-14 border-r border-border">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="text-muted-foreground group-hover/lot:text-foreground">
                                                                                            {isLotExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                                                        </span>
                                                                                        <MapPin className="h-3.5 w-3.5 text-muted-foreground/70" />
                                                                                        <span className="text-xs font-semibold text-foreground">{lot.lotName}</span>
                                                                                        <span className="text-[10px] text-foreground font-semibold">({lot.branchName})</span>
                                                                                        <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.2 rounded border border-border font-mono ml-auto mr-4">
                                                                                            {lot.batches.length} {lot.batches.length === 1 ? "Batch" : "Batches"}
                                                                                        </span>
                                                                                    </div>
                                                                                </TableCell>
                                                                                <TableCell className="font-semibold font-mono text-right pr-4 text-xs text-foreground/80">
                                                                                    <div className="flex items-center justify-end gap-3">
                                                                                        {renderCapacityBar(spaceUtil)}
                                                                                        <span>{lot.subtotalQuantity.toLocaleString("en-PH", { minimumFractionDigits: 2 })} {prod.uomShortcut}</span>
                                                                                    </div>
                                                                                </TableCell>
                                                                            </TableRow>

                                                                            {/* LEVEL 4: BATCH DATA TABLE (Embedded Grid Sub-Table) */}
                                                                            {isLotExpanded && (
                                                                                <TableRow className="bg-background border-b border-border">
                                                                                    <TableCell colSpan={2} className="p-0 pl-16 pr-2 py-1">
                                                                                        <div className="border border-border rounded-md overflow-hidden bg-background shadow-2xs my-1">
                                                                                            <Table className="border-collapse w-full">
                                                                                                <TableHeader className="bg-muted/40 border-b border-border">
                                                                                                    <TableRow className="h-7 hover:bg-transparent">
                                                                                                        <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider pl-2.5 text-muted-foreground border-r border-border">Batch No</TableHead>
                                                                                                        <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-muted-foreground border-r border-border">Source Doc No</TableHead>
                                                                                                        <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-muted-foreground border-r border-border">Txn Type</TableHead>
                                                                                                        <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-right pr-2 text-muted-foreground border-r border-border">Available</TableHead>
                                                                                                        <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-right pr-2 text-muted-foreground border-r border-border">Unit Cost</TableHead>
                                                                                                        <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-center text-muted-foreground border-r border-border">QA Status</TableHead>
                                                                                                        <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-center text-muted-foreground border-r border-border">Mfg Date</TableHead>
                                                                                                        <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-center text-muted-foreground border-r border-border">Expiry Date</TableHead>
                                                                                                        <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider pl-2 text-muted-foreground">Remarks</TableHead>
                                                                                                    </TableRow>
                                                                                                </TableHeader>
                                                                                                <TableBody className="divide-y divide-border">
                                                                                                    {lot.batches.map((batch) => (
                                                                                                        <TableRow key={batch.lineId} className="h-7 hover:bg-muted/20 transition-colors font-mono text-[11px]">
                                                                                                            <TableCell className="py-1 pl-2.5 font-bold text-foreground border-r border-border">{batch.batchNo}</TableCell>
                                                                                                            <TableCell className="py-1 text-foreground font-semibold border-r border-border">{batch.sourceDocumentNo}</TableCell>
                                                                                                            <TableCell className="py-1 text-muted-foreground font-sans font-medium border-r border-border">{batch.transactionType}</TableCell>
                                                                                                            <TableCell className="py-1 text-right font-black text-foreground pr-2 border-r border-border">
                                                                                                                {batch.quantity.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                                                                                                                <span className="block text-[9px] font-normal text-muted-foreground">{batch.onHandQuantity.toLocaleString("en-PH", { minimumFractionDigits: 2 })} on hand - {batch.reservedQuantity.toLocaleString("en-PH", { minimumFractionDigits: 2 })} reserved</span>
                                                                                                            </TableCell>
                                                                                                            <TableCell className="py-1 text-right font-semibold text-muted-foreground pr-2 border-r border-border">
                                                                                                                ₱{batch.unitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                                                            </TableCell>
                                                                                                            <TableCell className="py-1 text-center font-sans border-r border-border">
                                                                                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${getQAStatusBadgeStyles(batch.qaStatus)}`}>
                                                                                                                    {batch.qaStatus.toUpperCase()}
                                                                                                                </span>
                                                                                                            </TableCell>
                                                                                                            <TableCell className="py-1 text-center text-muted-foreground border-r border-border">
                                                                                                                {batch.createdOn ? batch.createdOn.split("T")[0] : "—"}
                                                                                                            </TableCell>
                                                                                                            <TableCell className="py-1 text-center text-muted-foreground border-r border-border">
                                                                                                                {batch.expiryDate || <span className="italic text-[10px] text-muted-foreground/60">No Expiry</span>}
                                                                                                            </TableCell>
                                                                                                            <TableCell className="py-1 pl-2 text-muted-foreground/80 font-sans truncate max-w-[160px]">
                                                                                                                {batch.remarks || "—"}
                                                                                                            </TableCell>
                                                                                                        </TableRow>
                                                                                                    ))}
                                                                                                </TableBody>
                                                                                            </Table>
                                                                                        </div>
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            )}
                                                                        </React.Fragment>
                                                                    );
                                                                })}
                                                            </React.Fragment>
                                                        );
                                                    })
                                                ) : (
                                                    // 2-LEVEL RAW MATERIALS & PACKAGING ITEMS BREAKDOWN: Product ➔ Lot/Batch Grid
                                                    // 3-LEVEL RAW MATERIALS & PACKAGING ITEMS BREAKDOWN: Product ➔ Lot ➔ Batch Grid
                                                    prod.lots?.map((lot) => {
                                                        const lotKey = `${prod.productId}-null-${lot.lotId ?? "null"}-${lot.branchId}`;
                                                        const isLotExpanded = !!expandedLots[lotKey];

                                                        const spaceUtil = lot.maxBatchCapacity > 0
                                                            ? (lot.subtotalQuantity / lot.maxBatchCapacity) * 100
                                                            : 0;

                                                        return (
                                                            <React.Fragment key={lotKey}>
                                                                {/* LEVEL 2: STORAGE LOT LOCATION ROW */}
                                                                <TableRow 
                                                                    className="group/lot cursor-pointer bg-muted/20 dark:bg-muted/10 hover:bg-muted/40 transition-colors border-b border-border select-none"
                                                                    onClick={() => toggleLotRow(prod.productId, null, lot.lotId, lot.branchId)}
                                                                >
                                                                    <TableCell className="py-1.5 pl-8 border-r border-border">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-muted-foreground group-hover/lot:text-foreground">
                                                                                {isLotExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                                            </span>
                                                                            <MapPin className="h-3.5 w-3.5 text-muted-foreground/70" />
                                                                            <span className="text-xs font-semibold text-foreground">{lot.lotName}</span>
                                                                            <span className="text-[10px] text-foreground font-semibold">({lot.branchName})</span>
                                                                            <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.2 rounded border border-border font-mono ml-auto mr-4">
                                                                                {lot.batches.length} {lot.batches.length === 1 ? "Batch" : "Batches"}
                                                                            </span>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="font-semibold font-mono text-right pr-4 text-xs text-foreground/80">
                                                                        <div className="flex items-center justify-end gap-3">
                                                                            {renderCapacityBar(spaceUtil)}
                                                                            <span>{lot.subtotalQuantity.toLocaleString("en-PH", { minimumFractionDigits: 2 })} {prod.uomShortcut}</span>
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>

                                                                {/* LEVEL 3: BATCH DATA TABLE (Embedded Grid Sub-Table) */}
                                                                {isLotExpanded && (
                                                                    <TableRow className="bg-background border-b border-border">
                                                                        <TableCell colSpan={2} className="p-0 pl-12 pr-2 py-1">
                                                                            <div className="border border-border rounded-md overflow-hidden bg-background shadow-2xs my-1">
                                                                                <Table className="border-collapse w-full">
                                                                                    <TableHeader className="bg-muted/40 border-b border-border">
                                                                                        <TableRow className="h-7 hover:bg-transparent">
                                                                                            <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider pl-2.5 text-muted-foreground border-r border-border">Batch No</TableHead>
                                                                                            <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-muted-foreground border-r border-border">Source Doc No</TableHead>
                                                                                            <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-muted-foreground border-r border-border">Txn Type</TableHead>
                                                                                            <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-right pr-2 text-muted-foreground border-r border-border">Available</TableHead>
                                                                                            <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-right pr-2 text-muted-foreground border-r border-border">Unit Cost</TableHead>
                                                                                            <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-center text-muted-foreground border-r border-border">QA Status</TableHead>
                                                                                            <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-center text-muted-foreground border-r border-border">Mfg Date</TableHead>
                                                                                            <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider text-center text-muted-foreground border-r border-border">Expiry Date</TableHead>
                                                                                            <TableHead className="text-[10px] font-bold py-1 uppercase tracking-wider pl-2 text-muted-foreground">Remarks</TableHead>
                                                                                        </TableRow>
                                                                                    </TableHeader>
                                                                                    <TableBody className="divide-y divide-border">
                                                                                        {lot.batches.map((batch) => (
                                                                                            <TableRow key={batch.lineId} className="h-7 hover:bg-muted/20 transition-colors font-mono text-[11px]">
                                                                                                <TableCell className="py-1 pl-2.5 font-bold text-foreground border-r border-border">{batch.batchNo}</TableCell>
                                                                                                <TableCell className="py-1 text-foreground font-semibold border-r border-border">{batch.sourceDocumentNo}</TableCell>
                                                                                                <TableCell className="py-1 text-muted-foreground font-sans font-medium border-r border-border">{batch.transactionType}</TableCell>
                                                                                                <TableCell className="py-1 text-right font-black text-foreground pr-2 border-r border-border">
                                                                                                    {batch.quantity.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                                                                                                    <span className="block text-[9px] font-normal text-muted-foreground">{batch.onHandQuantity.toLocaleString("en-PH", { minimumFractionDigits: 2 })} on hand - {batch.reservedQuantity.toLocaleString("en-PH", { minimumFractionDigits: 2 })} reserved</span>
                                                                                                </TableCell>
                                                                                                <TableCell className="py-1 text-right font-semibold text-muted-foreground pr-2 border-r border-border">
                                                                                                    ₱{batch.unitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                                                </TableCell>
                                                                                                <TableCell className="py-1 text-center font-sans border-r border-border">
                                                                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${getQAStatusBadgeStyles(batch.qaStatus)}`}>
                                                                                                        {batch.qaStatus.toUpperCase()}
                                                                                                    </span>
                                                                                                </TableCell>
                                                                                                <TableCell className="py-1 text-center text-muted-foreground border-r border-border">
                                                                                                    {batch.createdOn ? batch.createdOn.split("T")[0] : "—"}
                                                                                                </TableCell>
                                                                                                <TableCell className="py-1 text-center text-muted-foreground border-r border-border">
                                                                                                    {batch.expiryDate || <span className="italic text-[10px] text-muted-foreground/60">No Expiry</span>}
                                                                                                </TableCell>
                                                                                                <TableCell className="py-1 pl-2 text-muted-foreground/80 font-sans truncate max-w-[160px]">
                                                                                                    {batch.remarks || "—"}
                                                                                                </TableCell>
                                                                                            </TableRow>
                                                                                        ))}
                                                                                    </TableBody>
                                                                                </Table>
                                                                            </div>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })
                                                )
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            {/* Export PDF Options Dialog */}
            <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
                <DialogContent 
                    className="sm:max-w-[500px] border border-border bg-card p-5 shadow-lg rounded-lg"
                    onPointerDownOutside={(e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                >
                    <DialogHeader className="space-y-1 text-left">
                        <DialogTitle className="text-base font-bold text-foreground">Export PDF Options</DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Select products and filters to customize the generated PDF report.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        {/* Product Type Selection */}
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Product Type</Label>
                            <SearchableSelect
                                options={[
                                    { value: "388", label: "Finished Goods" },
                                    { value: "389", label: "Raw Materials" },
                                    { value: "390", label: "Packaging Items" }
                                ]}
                                value={String(pdfProductType)}
                                onValueChange={(val) => handlePdfProductTypeChange(Number(val))}
                                placeholder="Select Product Type"
                                className="h-8 bg-background border-border text-foreground text-xs justify-between"
                            />
                        </div>

                        {/* Product Selection Checklist */}
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Product Selection</Label>
                            <Input
                                placeholder="Search products..."
                                value={pdfSearchQuery}
                                onChange={(e) => setPdfSearchQuery(e.target.value)}
                                className="h-8 text-xs bg-background border-border"
                            />
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="text-[10px] px-2 py-0.5 h-6 text-muted-foreground hover:text-foreground"
                                    onClick={() => setPdfSelectedProductIds(activeProducts.map(p => p.productId))}
                                >
                                    Select All
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="text-[10px] px-2 py-0.5 h-6 text-muted-foreground hover:text-foreground"
                                    onClick={() => setPdfSelectedProductIds([])}
                                >
                                    Clear All
                                </Button>
                            </div>
                            <div className="max-h-[140px] overflow-y-auto border border-border rounded-md p-2 bg-background/50 space-y-1">
                                {activeProducts
                                    .filter(p => 
                                        p.productName.toLowerCase().includes(pdfSearchQuery.toLowerCase()) || 
                                        p.productCode.toLowerCase().includes(pdfSearchQuery.toLowerCase())
                                    )
                                    .map(p => (
                                        <div key={p.productId} className="flex items-center gap-2 py-0.5">
                                            <Checkbox
                                                id={`pdf-prod-${p.productId}`}
                                                checked={pdfSelectedProductIds.includes(p.productId)}
                                                onCheckedChange={(checked) => {
                                                    if (checked) {
                                                        setPdfSelectedProductIds(prev => [...prev, p.productId]);
                                                    } else {
                                                        setPdfSelectedProductIds(prev => prev.filter(id => id !== p.productId));
                                                    }
                                                }}
                                            />
                                            <Label
                                                htmlFor={`pdf-prod-${p.productId}`}
                                                className="text-xs font-normal cursor-pointer select-none truncate text-foreground/80 hover:text-foreground"
                                            >
                                                {p.productCode} - {p.productName}
                                            </Label>
                                        </div>
                                    ))}
                            </div>
                        </div>

                        {/* Branch & Lot Location selectors */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground">Branch</Label>
                                <SearchableSelect
                                    options={[
                                        { value: "all", label: "All Branches" },
                                        ...pdfActiveBranches.map((b) => ({ value: String(b.branchId), label: b.branchName }))
                                    ]}
                                    value={pdfBranchId !== null ? String(pdfBranchId) : "all"}
                                    onValueChange={(val) => {
                                        setPdfBranchId(val === "all" ? null : Number(val));
                                        setPdfLotId(null);
                                    }}
                                    placeholder="All Branches"
                                    className="h-8 bg-background border-border text-foreground text-xs justify-between"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground">Location Lot</Label>
                                <SearchableSelect
                                    options={[
                                        { value: "all", label: "All Locations" },
                                        ...pdfLots.map((l) => ({ value: String(l.lotId), label: l.lotName }))
                                    ]}
                                    value={pdfLotId !== null ? String(pdfLotId) : "all"}
                                    onValueChange={(val) => setPdfLotId(val === "all" ? null : Number(val))}
                                    placeholder="All Locations"
                                    className="h-8 bg-background border-border text-foreground text-xs justify-between"
                                />
                            </div>
                        </div>

                        {/* Date selectors */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground">Mfg Date</Label>
                                <div className="relative w-full">
                                    <input
                                        type="date"
                                        value={pdfMfgDate}
                                        onChange={(e) => setPdfMfgDate(e.target.value)}
                                        className="flex h-8 w-full rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                                    />
                                    <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-muted-foreground/60" />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground">Expiry Date</Label>
                                <div className="relative w-full">
                                    <input
                                        type="date"
                                        value={pdfExpiryDate}
                                        onChange={(e) => setPdfExpiryDate(e.target.value)}
                                        className="flex h-8 w-full rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                                    />
                                    <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-muted-foreground/60" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="mt-4 flex gap-2 justify-end border-t border-border/40 pt-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsExportModalOpen(false)}
                            className="h-8 text-xs px-3"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleExportPdf}
                            className="h-8 text-xs px-3 font-semibold"
                        >
                            Generate PDF
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
