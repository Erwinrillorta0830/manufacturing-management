import React from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableCell,
    TableHead
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Batch, InventoryMovement, Lot, Branch, ProductItem, UnitOfMeasure } from "../types";
import {
    ArrowDownLeft,
    ArrowUpRight,
    History,
    Layers,
    Package,
    Warehouse,
    Loader2,
    Building2,
    AlertTriangle,
    AlertCircle,
    ChevronDown,
    ChevronUp 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { resolveProductClassification } from "../services/lot-tracking.service";

interface BatchMovementsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    batch: Batch | null;
    movements: InventoryMovement[];
    lots?: Lot[];
    branches?: Branch[];
    products?: ProductItem[];
    uoms?: UnitOfMeasure[];
    loading?: boolean;
}

interface MismatchItem {
    id: string;
    category: "product" | "uom" | "batch" | "branch" | "rack" | "deficit" | "orphan";
    title: string;
    description: string;
    severity: "error" | "warning" | "info";
    badgeText?: string;
}

interface ConflictingMovement {
    key: string;
    refNo: string;
    date: string;
    sourceModule: string;
    transType: string;
    batchNo: string;
    productName: string;
    productId: number;
    unitName: string;
    unitId: number;
    branchName: string;
    branchId: number;
    lotName: string;
    qtyIn: number;
    qtyOut: number;
    unitCost: number;
    reasons: string[];
}

function isExpired(expirationDate?: string | null): boolean {
    if (!expirationDate) return false;
    const expTime = new Date(expirationDate).getTime();
    return !isNaN(expTime) && expTime <= new Date().setHours(23, 59, 59, 999);
}

export default function BatchMovementsDialog({
    isOpen,
    onClose,
    batch,
    movements,
    lots = [],
    branches = [],
    products = [],
    uoms = [],
    loading = false
}: BatchMovementsDialogProps) {
    const [showMismatches, setShowMismatches] = React.useState(false);

    const matchedLot = React.useMemo(() => {
        if (!batch) return undefined;
        return lots.find((l) => Number(l.lotId) === Number(batch.lotId));
    }, [batch, lots]);

    const targetBranchId = Number(batch?.branchId || matchedLot?.branchId || 0);
    const targetInvId = Number(batch?.inventoryLotId || (batch && batch.batchId > 0 ? batch.batchId : 0));
    const targetLotName = batch?.lotName || matchedLot?.lotName || "Storage Rack";

    // Filter movements specifically for this batch and branch
    const batchMovements = React.useMemo(() => {
        if (!batch) return [];

        const normalizeDate = (d?: string | null): string => {
            if (!d) return "";
            const str = String(d).trim();
            if (!str) return "";
            if (str.length >= 10 && str.includes("-")) return str.slice(0, 10);
            const dt = new Date(str);
            if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
            return str.slice(0, 10);
        };

        const rawBNo = (batch.rawBatchNumber || batch.batchNumber || "").toLowerCase().trim();
        const bNo = batch.batchNumber.toLowerCase().trim();
        const pId = Number(batch.productId || 0);
        const lId = Number(batch.lotId || 0);
        const bMfgNorm = normalizeDate(batch.manufacturingDate);
        const bExpNorm = normalizeDate(batch.expirationDate);
        const targetInvId = Number(batch.inventoryLotId || (batch.batchId > 0 ? batch.batchId : 0));

        return movements.filter((m) => {
            // Strictly isolate movements to the batch's designated branch
            const mBranchId = Number(m.branchId ?? m.branch_id ?? 0);
            if (targetBranchId > 0 && mBranchId > 0 && mBranchId !== targetBranchId) {
                return false;
            }

            const mInvId = Number(m.inventoryLotId ?? m.inventory_lot_id ?? m.batchId ?? m.batch_id ?? 0);
            const mBNo = String(m.batchNo ?? m.batch_no ?? "").toLowerCase().trim();
            const matchesBatchNo = mBNo === bNo || mBNo === rawBNo;

            const matchesInvId = targetInvId > 0 && mInvId > 0 && mInvId === targetInvId && (!mBNo || matchesBatchNo);

            const mPId = Number(m.productId ?? m.product_id ?? 0);
            const mLId = Number(m.mmLotId ?? m.mm_lot_id ?? m.lotId ?? m.lot_id ?? 0);
            const matchesProd = pId === 0 || mPId === 0 || mPId === pId;
            const matchesLot = lId === 0 || mLId === 0 || mLId === lId;

            const mMfgNorm = normalizeDate((m.manufacturingDate ?? m.manufacturing_date) as string);
            const mExpNorm = normalizeDate((m.expirationDate ?? m.expiration_date ?? m.expiryDate ?? m.expiry_date) as string);

            const mfgMatch = !bMfgNorm || !mMfgNorm || bMfgNorm === mMfgNorm;
            const expMatch = !bExpNorm || !mExpNorm || bExpNorm === mExpNorm;
            const matchesDates = mfgMatch && expMatch;

            if (matchesInvId) return true;
            return matchesBatchNo && matchesProd && matchesLot && matchesDates;
        }).sort((a, b) => {
            const dateA = (a.postedAt || a.posted_at || a.transactionDate || a.transaction_date || 0) as string | number;
            const dateB = (b.postedAt || b.posted_at || b.transactionDate || b.transaction_date || 0) as string | number;
            const timeA = new Date(dateA).getTime();
            const timeB = new Date(dateB).getTime();
            return timeB - timeA;
        });
    }, [batch, movements, targetBranchId]);

    const classification = React.useMemo(() => {
        if (!batch) return { code: "OTHER", label: "General", className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" };
        const cls = resolveProductClassification(batch.productType, batch.productCategory, batch.itemCode, batch.productName);
        let className = "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
        if (cls.code === "RM") className = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
        if (cls.code === "PKG") className = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
        if (cls.code === "FG") className = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
        return { ...cls, className };
    }, [batch]);

    // Compute stats from actual movement ledger
    const totalIn = batchMovements.reduce((sum: number, m) => sum + Number(m.quantityIn ?? m.quantity_in ?? 0), 0);
    const totalOut = batchMovements.reduce((sum: number, m) => sum + Number(m.quantityOut ?? m.quantity_out ?? 0), 0);
    const netOnhand = totalIn - totalOut;
    const unitLabel = batch?.uomShortcut || batch?.uomName || "";
    // When movement audit records exist, live on-hand is strictly computed from totalIn - totalOut
    const liveQuantity = batchMovements.length > 0 ? netOnhand : Number(batch?.quantity || 0);
    const totalValue = liveQuantity * (batch?.unitCost || 0);

    // ─── Dynamic Discrepancy & Mismatch Analyzer ─────────────────────────────────
    const discrepancies = React.useMemo(() => {
        if (!batch) return { list: [] as MismatchItem[], conflictingMovements: [] as ConflictingMovement[], otherBranchCount: 0 };

        const list: MismatchItem[] = [];
        const conflictingMap = new Map<string, ConflictingMovement>();

        const targetBNo = (batch.batchNumber || "").trim().toLowerCase();
        const targetRawBNo = (batch.rawBatchNumber || "").trim().toLowerCase();
        const targetPId = Number(batch.productId || 0);
        const targetUomId = Number(batch.uomId || matchedLot?.uomId || 0);
        const targetLotId = Number(batch.lotId || 0);

        const currentBranchObj = branches.find((b) => Number(b.id) === targetBranchId);
        const currentBranchLabel = currentBranchObj ? `${currentBranchObj.branchName} (${currentBranchObj.branchCode})` : (batch.branchName || "Current Branch");
        const currentProductObj = products.find((p) => Number(p.productId) === targetPId);
        const currentProductLabel = batch.productName || currentProductObj?.productName || "Product";
        const currentUomObj = uoms.find((u) => Number(u.unitId) === targetUomId);
        const currentUomLabel = batch.uomShortcut || batch.uomName || currentUomObj?.unitShortcut || currentUomObj?.unitName || "";

        // 1. Ghost Rack cross-branch analysis
        if (targetLotId === 0 || (batch.lotName && batch.lotName.toLowerCase().includes("ghost rack"))) {
            if (matchedLot && Number(matchedLot.branchId) > 0 && Number(matchedLot.branchId) !== targetBranchId) {
                const originBranch = branches.find((b) => Number(b.id) === Number(matchedLot.branchId));
                const originBranchLabel = originBranch ? `${originBranch.branchName} (${originBranch.branchCode})` : "Origin Branch";
                list.push({
                    id: "ghost-rack-cross-branch",
                    category: "rack",
                    title: "Cross-Branch Storage Rack Conflict (Ghost Rack)",
                    description: `The master storage rack "${matchedLot.lotName}" is located in ${originBranchLabel}. Because this stock allocation belongs to ${currentBranchLabel}, it is safely isolated in Ghost Rack to prevent physical inventory rack contamination.`,
                    severity: "warning",
                    badgeText: "Ghost Rack"
                });
            }
        }

        // 2. Scan all movements sharing this inventoryLotId or matching batch number
        movements.forEach((m) => {
            const mInvId = Number(m.inventoryLotId ?? m.inventory_lot_id ?? 0);
            const mBNo = String(m.batchNo ?? m.batch_no ?? "").trim();
            const mBNoNorm = mBNo.toLowerCase();
            const mPId = Number(m.productId ?? m.product_id ?? 0);
            const mUnitId = Number(m.unitId ?? m.unit_id ?? 0);
            const mBranchId = Number(m.branchId ?? m.branch_id ?? 0);
            const mLotId = Number(m.mmLotId ?? m.mm_lot_id ?? m.lotId ?? m.lot_id ?? 0);

            const isSameInv = targetInvId > 0 && mInvId === targetInvId;
            const isSameBatch = Boolean(targetBNo && (mBNoNorm === targetBNo || mBNoNorm === targetRawBNo));

            // Only inspect movements related either by inventoryLotId or by batchNumber
            if (!isSameInv && !isSameBatch) return;

            const reasons: string[] = [];

            const mProdObj = products.find((p) => Number(p.productId) === mPId);
            const mProdName = (m.productName ?? m.product_name ?? mProdObj?.productName ?? "Product") as string;
            const mUomObj = uoms.find((u) => Number(u.unitId) === mUnitId);
            const mUomName = mUomObj?.unitShortcut || mUomObj?.unitName || "";
            const mBranchObj = branches.find((b) => Number(b.id) === mBranchId);
            const mBranchName = mBranchObj ? `${mBranchObj.branchName} (${mBranchObj.branchCode})` : "";
            const mLotObj = lots.find((l) => Number(l.lotId) === mLotId);
            const mLotName = (m.lotName ?? mLotObj?.lotName ?? "Storage Rack") as string;

            // Check Batch Number Mismatch
            if (isSameInv && mBNo && mBNoNorm !== targetBNo && mBNoNorm !== targetRawBNo) {
                reasons.push(`Batch No: Transacted as "${mBNo}" (catalog expects "${batch.batchNumber}")`);
            }

            // Check Product Mismatch
            if (mPId > 0 && targetPId > 0 && mPId !== targetPId) {
                reasons.push(`Product Conflict: Transacted under "${mProdName}", conflicting with catalog product "${currentProductLabel}"`);
            }

            // Check UOM Mismatch
            if (mUnitId > 0 && targetUomId > 0 && mUnitId !== targetUomId) {
                reasons.push(`UOM Mismatch: Transacted in "${mUomName || "unspecified unit"}", conflicting with catalog unit "${currentUomLabel || "unspecified unit"}"`);
            }

            // Check Branch Mismatch
            if (mBranchId > 0 && targetBranchId > 0 && mBranchId !== targetBranchId) {
                reasons.push(`Branch Conflict: Logged at ${mBranchName || "another branch"}, differing from batch branch ${currentBranchLabel}`);
            }

            // Check Storage Rack Mismatch
            if (mLotId > 0 && targetLotId > 0 && mLotId !== targetLotId) {
                reasons.push(`Storage Rack Conflict: Recorded under "${mLotName}", differing from batch storage rack "${targetLotName}"`);
            }

            // Check Storage Rack Allocation Conflict
            if (isSameBatch && targetInvId > 0 && mInvId > 0 && mInvId !== targetInvId) {
                reasons.push(`Storage Rack Conflict: Transacted under storage rack "${mLotName}" instead of "${targetLotName}"`);
            }

            if (reasons.length > 0) {
                const qIn = Number(m.quantityIn ?? m.quantity_in ?? 0);
                const qOut = Number(m.quantityOut ?? m.quantity_out ?? 0);
                const cost = Number(m.unitCost ?? m.unit_cost ?? 0);
                const refNo = (m.referenceNo ?? m.reference_no ?? m.movementKey ?? m.movement_key ?? "-") as string;
                const dateStr = (m.transactionDate ?? m.transaction_date ?? m.postedAt ?? m.posted_at ?? "") as string;
                const sourceMod = (m.sourceModule ?? m.source_module ?? "") as string;
                const transType = (m.transactionType ?? m.transaction_type ?? "") as string;
                const key = String(m.movementKey ?? m.movement_key ?? `${refNo}-${mInvId}-${dateStr}`);

                conflictingMap.set(key, {
                    key,
                    refNo,
                    date: dateStr,
                    sourceModule: sourceMod,
                    transType,
                    batchNo: mBNo,
                    productName: mProdName,
                    productId: mPId,
                    unitName: mUomName,
                    unitId: mUnitId,
                    branchName: mBranchName,
                    branchId: mBranchId,
                    lotName: mLotName,
                    qtyIn: qIn,
                    qtyOut: qOut,
                    unitCost: cost,
                    reasons
                });
            }
        });

        const conflictingMovements = Array.from(conflictingMap.values());

        // Summary items for detected conflicts
        if (conflictingMovements.length > 0) {
            const batchMismatches = conflictingMovements.filter((cm) => cm.reasons.some((r) => r.startsWith("Batch No:")));
            const productMismatches = conflictingMovements.filter((cm) => cm.reasons.some((r) => r.startsWith("Product Conflict:")));
            const uomMismatches = conflictingMovements.filter((cm) => cm.reasons.some((r) => r.startsWith("UOM Mismatch:")));
            const branchMismatches = conflictingMovements.filter((cm) => cm.reasons.some((r) => r.startsWith("Branch Conflict:")));
            const rackMismatches = conflictingMovements.filter((cm) => cm.reasons.some((r) => r.startsWith("Storage Rack Conflict:")));

            if (batchMismatches.length > 0) {
                const sample = batchMismatches[0];
                list.push({
                    id: "batch-number-mismatch",
                    category: "batch",
                    title: "Batch Number Reference Mismatch",
                    description: `Storage Rack "${targetLotName}" has ${batchMismatches.length} transaction(s) logged under batch "${sample.batchNo}" from module ${sample.sourceModule || sample.transType || "N/A"} (Doc: ${sample.refNo || "N/A"}), while master catalog expects "${batch.batchNumber}".`,
                    severity: "error",
                    badgeText: "Batch No Conflict"
                });
            }

            if (productMismatches.length > 0) {
                const sample = productMismatches[0];
                list.push({
                    id: "product-mismatch",
                    category: "product",
                    title: "Product Item Mismatch",
                    description: `Transaction ${sample.refNo || ""} originated from module ${sample.sourceModule || sample.transType || "N/A"} under product "${sample.productName}" instead of catalog product "${currentProductLabel}".`,
                    severity: "error",
                    badgeText: "Product Conflict"
                });
            }

            if (uomMismatches.length > 0) {
                const sample = uomMismatches[0];
                list.push({
                    id: "uom-mismatch",
                    category: "uom",
                    title: "Unit of Measure (UOM) Mismatch",
                    description: `Transaction ${sample.refNo || ""} (Module: ${sample.sourceModule || sample.transType || "N/A"}) was transacted in unit "${sample.unitName || "unspecified unit"}", which conflicts with batch's registered unit "${currentUomLabel}".`,
                    severity: "warning",
                    badgeText: "UOM Conflict"
                });
            }

            if (branchMismatches.length > 0) {
                const sample = branchMismatches[0];
                list.push({
                    id: "branch-mismatch",
                    category: "branch",
                    title: "Branch Assignment Conflict",
                    description: `Transaction ${sample.refNo || ""} originated from ${sample.branchName || "another branch"} (Module: ${sample.sourceModule || sample.transType || "System"}), differing from the active branch ${currentBranchLabel}.`,
                    severity: "warning",
                    badgeText: "Branch Conflict"
                });
            }

            if (rackMismatches.length > 0) {
                const sample = rackMismatches[0];
                list.push({
                    id: "rack-mismatch",
                    category: "rack",
                    title: "Storage Rack Conflict",
                    description: `Transactions matching batch "${batch.batchNumber}" were booked under storage rack "${sample.lotName || "Unassigned"}" instead of "${targetLotName}" (Module: ${sample.sourceModule || sample.transType || "System"}, Doc: ${sample.refNo}).`,
                    severity: "warning",
                    badgeText: "Rack Conflict"
                });
            }
        }

        // 3. Cross-Branch Activity for this batch number
        let otherBranchCount = 0;
        const otherBranchNames = new Set<string>();
        movements.forEach((m) => {
            const mBNo = String(m.batchNo ?? m.batch_no ?? "").trim().toLowerCase();
            const matchesB = mBNo === targetBNo || mBNo === targetRawBNo;
            const mBranchId = Number(m.branchId ?? m.branch_id ?? 0);
            if (matchesB && mBranchId > 0 && targetBranchId > 0 && mBranchId !== targetBranchId) {
                otherBranchCount += 1;
                const bObj = branches.find((b) => Number(b.id) === mBranchId);
                otherBranchNames.add(bObj ? `${bObj.branchName} (${bObj.branchCode})` : "Another Branch");
            }
        });

        if (otherBranchCount > 0) {
            list.push({
                id: "cross-branch-activity",
                category: "branch",
                title: "Cross-Branch Activity Notice",
                description: `${otherBranchCount} movement record(s) matching batch "${batch.batchNumber}" exist in ${Array.from(otherBranchNames).join(", ")}. This dialog strictly audits transactions for ${currentBranchLabel}.`,
                severity: "info",
                badgeText: "Cross-Branch Activity"
            });
        }

        // 4. Ledger Gap: 0 Direct movements but non-zero on-hand quantity
        if (batchMovements.length === 0 && Number(batch.quantity || 0) !== 0) {
            const originModules = Array.from(new Set(conflictingMovements.map((cm) => cm.sourceModule || cm.transType).filter(Boolean)));
            list.push({
                id: "ledger-gap",
                category: "orphan",
                title: "Unlinked Balance / Audit Ledger Gap",
                description: conflictingMovements.length > 0
                    ? `This batch displays a recorded balance of ${batch.quantity.toLocaleString()} ${currentUomLabel}, which originated from ${conflictingMovements.length} mismatched transaction(s) in ${originModules.join(", ") || "the system"} (see details below).`
                    : `This batch holds a recorded balance of ${batch.quantity.toLocaleString()} ${currentUomLabel} in master catalog, but has 0 direct matching movement records in this branch.`,
                severity: "warning",
                badgeText: "Unlinked Balance"
            });
        }

        // 5. Deficit / Negative balance
        if (liveQuantity < 0) {
            list.push({
                id: "deficit-stock",
                category: "deficit",
                title: "Negative Stock Deficit",
                description: `Live on-hand is currently in deficit (${liveQuantity.toLocaleString()} ${currentUomLabel}). Outbound sales, adjustments, or reconciliations exceed recorded inbound stock.`,
                severity: "error",
                badgeText: "Stock Deficit"
            });
        }

        return { list, conflictingMovements, otherBranchCount };
    }, [batch, movements, lots, branches, products, uoms, targetBranchId, targetInvId, targetLotName, matchedLot, batchMovements.length, liveQuantity]);

    if (!batch) return null;

    const matchedBranch = branches.find((br) => Number(br.id) === Number(batch.branchId || matchedLot?.branchId));

    const branchName = matchedLot?.branchName || matchedBranch?.branchName || batch.branchName || "";
    const branchCode = matchedLot?.branchCode || matchedBranch?.branchCode;
    const branchDisplay = branchName ? (branchCode ? `${branchName} (${branchCode})` : branchName) : "";

    const isBadStock = Boolean(
        matchedLot?.isBadStock ||
        matchedLot?.branchIsBadStock ||
        batch.qaStatus === "DAMAGED" ||
        batch.qaStatus === "QUARANTINED" ||
        batch.qaStatus === "EXPIRED" ||
        batch.status === "DAMAGED" ||
        batch.status === "QUARANTINED" ||
        batch.status === "EXPIRED"
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="!max-w-[1400px] !w-[95vw] sm:!max-w-[1400px] md:!max-w-[1400px] lg:!max-w-[1400px] xl:!max-w-[1400px] max-h-[88vh] flex flex-col p-0 overflow-hidden bg-card border-border shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                style={{ maxWidth: "1400px", width: "95vw" }}
            >
                {/* Header */}
                <DialogHeader className="p-6 pr-14 border-b border-border/80 bg-muted/20">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <div className="flex items-center gap-2">
                                <History className="h-5 w-5 text-primary" />
                                <DialogTitle className="text-lg font-bold text-foreground">
                                    Inventory Movement History
                                </DialogTitle>
                            </div>
                            <DialogDescription className="text-xs text-muted-foreground mt-1">
                                Audit ledger of all inbound and outbound transactions for Batch{" "}
                                <strong className="text-foreground">{batch.batchNumber}</strong>
                            </DialogDescription>
                        </div>

                        {/* Clean Badges: Branch, Product Type, Stock Quality, Batch No */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {branchDisplay && (
                                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-foreground border border-border">
                                    {branchDisplay}
                                </span>
                            )}

                            <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${classification.className}`}>
                                {classification.label}
                            </span>

                            {isBadStock ? (
                                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                    Bad Stock
                                </span>
                            ) : (
                                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                    Good Stock
                                </span>
                            )}

                            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                                {batch.batchNumber}
                            </span>
                        </div>
                    </div>

                    {/* Metadata chips */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 mt-3 pt-3 border-t border-border/40">
                        <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="truncate">
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Product / SKU</p>
                                <p className="text-xs font-bold text-foreground truncate">
                                    {batch.productName || "-"}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Warehouse className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="truncate">
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Storage Rack</p>
                                <p className="text-xs font-bold text-foreground truncate">
                                    {batch.lotName}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="truncate">
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Branch</p>
                                <p className="text-xs font-bold text-foreground truncate">
                                    {branchDisplay || "-"}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="truncate">
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Mfg Date</p>
                                <p className="text-xs font-bold text-foreground truncate">
                                    {batch.manufacturingDate ? String(batch.manufacturingDate).substring(0, 10) : "N/A"}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-amber-500 shrink-0" />
                            <div className="truncate">
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Expiry Date</p>
                                <p className={`text-xs font-bold truncate ${isExpired(batch.expirationDate) ? "text-rose-600 dark:text-rose-400 font-black" : "text-foreground"}`}>
                                    {batch.expirationDate ? String(batch.expirationDate).substring(0, 10) : "N/A"}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="truncate">
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Live On-Hand</p>
                                <p className={`text-xs font-black ${liveQuantity < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                    {liveQuantity.toLocaleString()} {unitLabel}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="truncate">
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Valuation</p>
                                <p className="text-xs font-bold text-foreground">
                                    ₱{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                {/* Summary Banner */}
                <div className="grid grid-cols-3 gap-3 px-5 py-3 bg-muted/40 border-b border-border text-xs font-medium">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                        </span>
                        <div>
                            <span className="text-[10px] text-muted-foreground block">Total Inbound</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                +{totalIn.toLocaleString()} {unitLabel}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </span>
                        <div>
                            <span className="text-[10px] text-muted-foreground block">Total Outbound</span>
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                                -{totalOut.toLocaleString()} {unitLabel}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div>
                            <span className="text-[10px] text-muted-foreground block">Movements Count</span>
                            <span className="font-bold text-foreground">
                                {batchMovements.length} Record{batchMovements.length === 1 ? "" : "s"}
                            </span>
                        </div>
                    </div>
                </div>
                {/* Movements & Diagnostics Container */}
                <div className="flex-1 overflow-y-auto p-6 max-h-[500px] flex flex-col gap-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center p-12 gap-2 text-muted-foreground">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span className="text-xs">Loading movements...</span>
                        </div>
                    ) : (
                        <>
                            {/* ─── Dynamic Audit & Discrepancy Diagnostics Card ─────────────────── */}
                            {discrepancies.list.length > 0 && (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 p-4 text-xs flex flex-col gap-3 shadow-sm transition-all duration-200">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-amber-500/20">
                                        <div className="flex items-center gap-2">
                                            {discrepancies.list.some((d) => d.severity === "error") ? (
                                                <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                                            ) : (
                                                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                                            )}
                                            <span className="font-bold text-foreground text-sm">
                                                Audit Ledger & Data Integrity Diagnostics
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {discrepancies.list.map((d) => {
                                                const badgeColors =
                                                    d.severity === "error"
                                                        ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30"
                                                        : d.severity === "warning"
                                                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                                                        : "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
                                                return (
                                                    <span
                                                        key={d.id}
                                                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColors}`}
                                                    >
                                                        {d.badgeText || d.title}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Discrepancy Items List */}
                                    <div className="grid grid-cols-1 gap-2">
                                        {discrepancies.list.map((item) => {
                                            const borderClass =
                                                item.severity === "error"
                                                    ? "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200"
                                                    : item.severity === "warning"
                                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                                                    : "border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-200";

                                            return (
                                                <div
                                                    key={item.id}
                                                    className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1 ${borderClass}`}
                                                >
                                                    <div className="flex items-center gap-1.5 font-bold">
                                                        <span>• {item.title}</span>
                                                    </div>
                                                    <p className="text-[11px] leading-relaxed opacity-90 pl-3">
                                                        {item.description}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Conflicting Movements Toggle */}
                                    {discrepancies.conflictingMovements.length > 0 && (
                                        <div className="pt-1 flex flex-col gap-2 border-t border-amber-500/20 mt-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-muted-foreground">
                                                    Identified <strong>{discrepancies.conflictingMovements.length}</strong> related transaction(s) with conflicting metadata linked to Storage Rack &quot;{targetLotName}&quot;.
                                                </span>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-xs gap-1.5 font-semibold border-amber-500/30 hover:bg-amber-500/10 text-foreground"
                                                    onClick={() => setShowMismatches((prev) => !prev)}
                                                >
                                                    {showMismatches ? (
                                                        <>
                                                            <ChevronUp className="h-3.5 w-3.5" />
                                                            Hide Conflicting Transactions
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ChevronDown className="h-3.5 w-3.5" />
                                                            Inspect Conflicting Transactions ({discrepancies.conflictingMovements.length})
                                                        </>
                                                    )}
                                                </Button>
                                            </div>

                                            {/* Collapsible Sub-Table of Conflicting Transactions */}
                                            <AnimatePresence>
                                                {showMismatches && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: "auto" }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="rounded-lg border border-border bg-card overflow-x-auto mt-2">
                                                            <div className="px-3 py-2 bg-muted/60 border-b border-border text-[11px] font-bold text-foreground flex items-center justify-between">
                                                                <span>Conflicting Reference Transactions Ledger</span>
                                                                <span className="text-[10px] text-muted-foreground font-normal">
                                                                    Logged transactions that caused master balance discrepancies
                                                                </span>
                                                            </div>
                                                            <Table className="min-w-[950px] text-xs">
                                                                <TableHeader>
                                                                    <TableRow className="bg-muted/30">
                                                                        <TableHead className="w-[150px]">Ref / Key</TableHead>
                                                                        <TableHead className="w-[140px]">Source Module</TableHead>
                                                                        <TableHead className="w-[130px]">Transacted Batch</TableHead>
                                                                        <TableHead className="min-w-[150px]">Transacted Product</TableHead>
                                                                        <TableHead className="w-[90px]">UOM</TableHead>
                                                                        <TableHead className="w-[120px]">Branch / Rack</TableHead>
                                                                        <TableHead className="text-right w-[90px]">Qty Delta</TableHead>
                                                                        <TableHead className="w-[140px]">Date</TableHead>
                                                                        <TableHead className="min-w-[180px]">Discrepancy Reasons</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {discrepancies.conflictingMovements.map((cm) => (
                                                                        <TableRow key={cm.key} className="hover:bg-muted/30">
                                                                            <TableCell className="py-2.5 font-bold">
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-foreground">{cm.refNo}</span>
                                                                                    {cm.key !== cm.refNo && (
                                                                                        <span className="font-mono text-[9px] text-muted-foreground">
                                                                                            {cm.key}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </TableCell>
                                                                            <TableCell className="py-2.5">
                                                                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-muted text-foreground uppercase border border-border">
                                                                                    {cm.sourceModule || cm.transType || "-"}
                                                                                </span>
                                                                            </TableCell>
                                                                            <TableCell className="py-2.5">
                                                                                <span className="font-mono font-bold text-foreground">
                                                                                    {cm.batchNo || "-"}
                                                                                </span>
                                                                            </TableCell>
                                                                            <TableCell className="py-2.5">
                                                                                <div className="flex flex-col">
                                                                                    <span className="font-medium text-foreground">{cm.productName || "-"}</span>
                                                                                </div>
                                                                            </TableCell>
                                                                            <TableCell className="py-2.5 font-medium">
                                                                                {cm.unitName || "-"}
                                                                            </TableCell>
                                                                            <TableCell className="py-2.5">
                                                                                <div className="flex flex-col text-[10px]">
                                                                                    <span className="font-medium text-foreground">{cm.branchName || "-"}</span>
                                                                                    {cm.lotName && (
                                                                                        <span className="text-muted-foreground">{cm.lotName}</span>
                                                                                    )}
                                                                                </div>
                                                                            </TableCell>
                                                                            <TableCell className="py-2.5 text-right font-bold">
                                                                                {cm.qtyIn > 0 && (
                                                                                    <span className="text-emerald-600 dark:text-emerald-400">
                                                                                        +{cm.qtyIn.toLocaleString()}
                                                                                    </span>
                                                                                )}
                                                                                {cm.qtyOut > 0 && (
                                                                                    <span className="text-rose-600 dark:text-rose-400">
                                                                                        -{cm.qtyOut.toLocaleString()}
                                                                                    </span>
                                                                                )}
                                                                                {cm.qtyIn === 0 && cm.qtyOut === 0 && "-"}
                                                                            </TableCell>
                                                                            <TableCell className="py-2.5 text-[11px] text-muted-foreground whitespace-nowrap">
                                                                                {cm.date ? String(cm.date).replace("T", " ").slice(0, 16) : "-"}
                                                                            </TableCell>
                                                                            <TableCell className="py-2.5">
                                                                                <div className="flex flex-col gap-1">
                                                                                    {cm.reasons.map((r, rIdx) => (
                                                                                        <span
                                                                                            key={rIdx}
                                                                                            className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20"
                                                                                        >
                                                                                            {r}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ─── Direct Movements Section ────────────────────────────────────── */}
                            {batchMovements.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground rounded-xl border border-dashed border-border bg-muted/10">
                                    {discrepancies.conflictingMovements.length > 0 ? (
                                        <>
                                            <AlertTriangle className="h-9 w-9 text-amber-500/70 mb-2" />
                                            <span className="text-sm font-bold text-foreground">
                                                Direct Movement Records Filtered Out
                                            </span>
                                            <p className="text-xs max-w-md mt-1 text-muted-foreground">
                                                Zero direct movements strictly match batch <strong className="text-foreground">&quot;{batch.batchNumber}&quot;</strong> for product <strong className="text-foreground">&quot;{batch.productName}&quot;</strong>.
                                            </p>
                                            <p className="text-xs max-w-md mt-1 text-muted-foreground">
                                                The recorded balance of <strong className="text-foreground">{batch.quantity.toLocaleString()} {unitLabel}</strong> originated from the {discrepancies.conflictingMovements.length} conflicting transaction(s) documented in the diagnostics card above.
                                            </p>
                                            {!showMismatches && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="mt-3 text-xs gap-1.5 border-border hover:bg-muted"
                                                    onClick={() => setShowMismatches(true)}
                                                >
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                    Inspect Conflicting Transactions ({discrepancies.conflictingMovements.length})
                                                </Button>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <History className="h-10 w-10 text-muted-foreground/30 mb-2" />
                                            <span className="text-sm font-semibold">No direct movement records found</span>
                                            <p className="text-xs max-w-xs mt-1">
                                                This batch was registered in Directus master catalog. Inbound/outbound stock adjustments will record here.
                                            </p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between px-1">
                                        <span className="text-xs font-bold text-foreground">
                                            Direct Audit Movement Ledger ({batchMovements.length})
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                            Verified movements matching {batch.batchNumber} in this branch
                                        </span>
                                    </div>
                                    <div className="rounded-lg border border-border bg-card overflow-x-auto">
                                        <Table className="min-w-[1000px]">
                                            <TableHeader>
                                                <TableRow className="bg-muted/40">
                                                    <TableHead className="w-[50px] pl-4">No.</TableHead>
                                                    <TableHead className="min-w-[160px]">Ref / Key</TableHead>
                                                    <TableHead className="min-w-[150px]">Type / Module</TableHead>
                                                    <TableHead className="w-[110px]">Direction</TableHead>
                                                    <TableHead className="text-right w-[110px]">Qty In</TableHead>
                                                    <TableHead className="text-right w-[110px]">Qty Out</TableHead>
                                                    <TableHead className="text-right w-[100px]">Unit Cost</TableHead>
                                                    <TableHead className="w-[110px]">Condition</TableHead>
                                                    <TableHead className="w-[160px]">Date & Time</TableHead>
                                                    <TableHead className="min-w-[180px] pr-4">Remarks</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {batchMovements.map((m, idx) => {
                                                    const isDirectionIn = String(m.movementDirection ?? m.movement_direction ?? "").toUpperCase() === "IN";
                                                    const refNo = (m.referenceNo ?? m.reference_no ?? m.movementKey ?? m.movement_key ?? "-") as string;
                                                    const keyNo = (m.movementKey ?? m.movement_key) as string | undefined;
                                                    const transType = (m.transactionType ?? m.transaction_type ?? m.sourceModule ?? m.source_module ?? "MOVEMENT") as string;
                                                    const qIn = Number(m.quantityIn ?? m.quantity_in ?? 0);
                                                    const qOut = Number(m.quantityOut ?? m.quantity_out ?? 0);
                                                    const cost = Number(m.unitCost ?? m.unit_cost ?? 0);
                                                    const cond = (m.inventoryCondition ?? m.inventory_condition ?? "GOOD") as string;
                                                    const dateStr = (m.transactionDate ?? m.transaction_date ?? m.postedAt ?? m.posted_at ?? "") as string;

                                                    return (
                                                        <TableRow key={keyNo || idx}>
                                                            <TableCell className="text-xs text-muted-foreground font-medium pl-4 py-3">{idx + 1}</TableCell>
                                                            <TableCell className="py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-xs text-foreground">
                                                                        {refNo}
                                                                    </span>
                                                                    {keyNo && keyNo !== refNo && (
                                                                        <span className="font-mono text-[10px] text-muted-foreground">
                                                                            {keyNo}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="py-3">
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted text-foreground uppercase border border-border">
                                                                    {transType}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="py-3">
                                                                {isDirectionIn ? (
                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                                        <ArrowDownLeft className="h-3 w-3" />
                                                                        IN
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                                                        <ArrowUpRight className="h-3 w-3" />
                                                                        OUT
                                                                    </span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400 text-xs py-3">
                                                                {qIn > 0 ? `+${qIn.toLocaleString()}` : "-"}
                                                            </TableCell>
                                                            <TableCell className="text-right font-bold text-rose-600 dark:text-rose-400 text-xs py-3">
                                                                {qOut > 0 ? `-${qOut.toLocaleString()}` : "-"}
                                                            </TableCell>
                                                            <TableCell className="text-right text-xs py-3">
                                                                ₱{cost.toFixed(2)}
                                                            </TableCell>
                                                            <TableCell className="py-3">
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                                                    {cond}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-3">
                                                                {dateStr ? String(dateStr).replace("T", " ").slice(0, 19) : "-"}
                                                            </TableCell>
                                                            <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate pr-4 py-3" title={m.remarks || ""}>
                                                                {m.remarks || "-"}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3.5 border-t border-border bg-muted/10 flex justify-end">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
