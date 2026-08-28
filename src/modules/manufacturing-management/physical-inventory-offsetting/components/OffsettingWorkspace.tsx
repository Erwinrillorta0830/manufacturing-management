"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
    ArrowLeft,
    Sparkles,
    Trash2,
    Link2,
    TrendingDown,
    TrendingUp,
    CheckCircle2,
    ArrowRight,
    ShieldCheck,
    Tag,
    Boxes,
    Save,
    Package,
    ChevronDown,
    ChevronUp,
    Printer,
    Scale,
    Layers,
    AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import OffsettingPrintModal from "./OffsettingPrintModal";
import {
    OffsettingSheetQueueItem,
    OffsettingPairing,
    Product,
    Unit,
    MmLot,
    MmInventoryLot
} from "../types";

interface OffsettingWorkspaceProps {
    sheet: OffsettingSheetQueueItem;
    onBack: () => void;
    onSavePairings: (pairings: OffsettingPairing[]) => Promise<void>;
    onCommitSheet: (pairings: OffsettingPairing[], auditNotes?: string) => Promise<void>;
}

const REASON_CODES = [
    "Lot Number Mix-up / Mislabeling",
    "Production Batch Pick Swap",
    "Wrong SKU Tagging",
    "Barcoding Error",
    "UOM Miscount",
    "Packaging Variation"
] as const;

function formatCurrency(val: number): string {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2
    }).format(val || 0);
}

function formatQty(val: number): string {
    return Number(val || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function OffsettingWorkspace({
    sheet,
    onBack,
    onSavePairings,
    onCommitSheet
}: OffsettingWorkspaceProps) {
    const isCommitted = sheet.isCommitted || sheet.status === "COMMITTED" || sheet.offsetting_status === "COMMITTED";
    const lineItems = useMemo(() => sheet.details || [], [sheet.details]);

    const [activePairings, setActivePairings] = useState<OffsettingPairing[]>(sheet.offset_pairings || []);

    // Checkbox multi-select state arrays
    const [selectedShortageProductIds, setSelectedShortageProductIds] = useState<number[]>([]);
    const [selectedSurplusProductIds, setSelectedSurplusProductIds] = useState<number[]>([]);
    const [selectedShortageDetailIds, setSelectedShortageDetailIds] = useState<number[]>([]);
    const [selectedSurplusDetailIds, setSelectedSurplusDetailIds] = useState<number[]>([]);

    const [linkQty, setLinkQty] = useState<string>("");
    const [linkReason, setLinkReason] = useState<string>(REASON_CODES[0]);
    const [linkNotes, setLinkNotes] = useState<string>("");
    const [auditSignoffNotes, setAuditSignoffNotes] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

    // View Mode & Accordion Expansion states
    const [groupingViewMode, setGroupingViewMode] = useState<"PRODUCT_GROUPED" | "LOT_GRANULAR">("PRODUCT_GROUPED");
    const [expandedShortageProducts, setExpandedShortageProducts] = useState<Record<number, boolean>>({});
    const [expandedSurplusProducts, setExpandedSurplusProducts] = useState<Record<number, boolean>>({});

    const toggleShortageExpand = (pId: number, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setExpandedShortageProducts(prev => ({ ...prev, [pId]: !prev[pId] }));
    };

    const toggleSurplusExpand = (pId: number, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setExpandedSurplusProducts(prev => ({ ...prev, [pId]: !prev[pId] }));
    };

    // Multi-select toggle helper functions
    const toggleShortageProduct = (pId: number, childDetailIds: number[]) => {
        const isProductSelected = selectedShortageProductIds.includes(pId);
        if (isProductSelected) {
            setSelectedShortageProductIds(prev => prev.filter(id => id !== pId));
            setSelectedShortageDetailIds(prev => prev.filter(id => !childDetailIds.includes(id)));
        } else {
            setSelectedShortageProductIds(prev => [...prev, pId]);
            setSelectedShortageDetailIds(prev => Array.from(new Set([...prev, ...childDetailIds])));
        }
    };

    const toggleSurplusProduct = (pId: number, childDetailIds: number[]) => {
        const isProductSelected = selectedSurplusProductIds.includes(pId);
        if (isProductSelected) {
            setSelectedSurplusProductIds(prev => prev.filter(id => id !== pId));
            setSelectedSurplusDetailIds(prev => prev.filter(id => !childDetailIds.includes(id)));
        } else {
            setSelectedSurplusProductIds(prev => [...prev, pId]);
            setSelectedSurplusDetailIds(prev => Array.from(new Set([...prev, ...childDetailIds])));
        }
    };

    const toggleShortageDetail = (detailId: number) => {
        setSelectedShortageDetailIds(prev =>
            prev.includes(detailId) ? prev.filter(id => id !== detailId) : [...prev, detailId]
        );
    };

    const toggleSurplusDetail = (detailId: number) => {
        setSelectedSurplusDetailIds(prev =>
            prev.includes(detailId) ? prev.filter(id => id !== detailId) : [...prev, detailId]
        );
    };

    // Calculate allocated offset quantity per detail line item from active pairings
    const allocatedOffsetMap = useMemo(() => {
        const map = new Map<number, number>();
        for (const pair of activePairings) {
            const shortDeduction = pair.shortage_containers_deducted !== undefined
                ? pair.shortage_containers_deducted
                : (pair.shortage_uom_count && pair.shortage_uom_count > 0 ? (pair.offset_pieces || pair.offset_qty) / pair.shortage_uom_count : pair.offset_qty);
            const shortAcc = map.get(pair.shortage_detail_id) || 0;
            map.set(pair.shortage_detail_id, shortAcc + shortDeduction);

            const surpDeduction = pair.surplus_containers_deducted !== undefined
                ? pair.surplus_containers_deducted
                : (pair.surplus_uom_count && pair.surplus_uom_count > 0 ? (pair.offset_pieces || pair.offset_qty) / pair.surplus_uom_count : pair.offset_qty);
            const surpAcc = map.get(pair.surplus_detail_id) || 0;
            map.set(pair.surplus_detail_id, surpAcc + surpDeduction);
        }
        return map;
    }, [activePairings]);

    // Separate Shortage line items (physical < system or variance < 0)
    const shortageItems = useMemo(() => {
        return lineItems
            .map(item => {
                const sys = Number(item.system_count || 0);
                const phys = Number(item.physical_count ?? sys);
                const rawVar = item.variance !== undefined ? Number(item.variance) : (phys - sys);

                if (rawVar >= -0.0001) return null;

                const totalShortage = Math.abs(rawVar);
                const detailId = item.physical_inventory_detail_id || item.id || 0;
                const allocated = allocatedOffsetMap.get(detailId) || 0;
                const remaining = Math.max(0, totalShortage - allocated);

                const prodObj = typeof item.product_id === "object" ? (item.product_id as Product) : null;
                const prodName = prodObj?.product_name || `Product #${item.product_id}`;
                const prodCode = prodObj?.product_code || "";

                const uomObj = typeof item.unit_id === "object"
                    ? (item.unit_id as Unit)
                    : (prodObj && typeof prodObj.unit_of_measurement === "object"
                        ? (prodObj.unit_of_measurement as Unit)
                        : null);
                const uomShortcut = uomObj?.unit_shortcut || uomObj?.unit_name || "";
                const uomCount = Number(prodObj?.unit_of_measurement_count || 0);
                const baseUom = uomShortcut || "units";
                const resolvedUom = uomCount > 1 && uomShortcut
                    ? `${uomShortcut} (${uomCount} pcs/${uomShortcut.toLowerCase()})`
                    : uomShortcut;
                const shortagePieces = remaining * (uomCount > 0 ? uomCount : 1);

                const lotObj = typeof item.lot_id === "object" ? (item.lot_id as MmLot) : null;
                const lotName = lotObj?.lot_name || `Lot #${item.lot_id}`;

                const invLotObj = typeof item.inventory_lot_id === "object" ? (item.inventory_lot_id as MmInventoryLot) : null;
                const batchNo = item.batch_no || invLotObj?.batch_no || "N/A";
                const unitCost = Number(item.unit_cost || prodObj?.cost_per_unit || 0);

                return {
                    ...item,
                    detailId,
                    resolvedName: prodName,
                    resolvedCode: prodCode,
                    resolvedUom,
                    baseUom,
                    uomCount,
                    shortagePieces,
                    resolvedLotName: lotName,
                    resolvedBatchNo: batchNo,
                    totalShortage,
                    remainingShortage: remaining,
                    unitCost,
                    shortageAmount: remaining * unitCost
                };
            })
            .filter((i): i is NonNullable<typeof i> => i !== null && i.remainingShortage > 0.0001);
    }, [lineItems, allocatedOffsetMap]);

    // Separate Surplus line items (physical > system or variance > 0)
    const surplusItems = useMemo(() => {
        return lineItems
            .map(item => {
                const sys = Number(item.system_count || 0);
                const phys = Number(item.physical_count ?? sys);
                const rawVar = item.variance !== undefined ? Number(item.variance) : (phys - sys);

                if (rawVar <= 0.0001) return null;

                const totalSurplus = rawVar;
                const detailId = item.physical_inventory_detail_id || item.id || 0;
                const allocated = allocatedOffsetMap.get(detailId) || 0;
                const remaining = Math.max(0, totalSurplus - allocated);

                const prodObj = typeof item.product_id === "object" ? (item.product_id as Product) : null;
                const prodName = prodObj?.product_name || `Product #${item.product_id}`;
                const prodCode = prodObj?.product_code || "";

                const uomObj = typeof item.unit_id === "object"
                    ? (item.unit_id as Unit)
                    : (prodObj && typeof prodObj.unit_of_measurement === "object"
                        ? (prodObj.unit_of_measurement as Unit)
                        : null);
                const uomShortcut = uomObj?.unit_shortcut || uomObj?.unit_name || "";
                const uomCount = Number(prodObj?.unit_of_measurement_count || 0);
                const baseUom = uomShortcut || "units";
                const resolvedUom = uomCount > 1 && uomShortcut
                    ? `${uomShortcut} (${uomCount} pcs/${uomShortcut.toLowerCase()})`
                    : uomShortcut;
                const surplusPieces = remaining * (uomCount > 0 ? uomCount : 1);

                const lotObj = typeof item.lot_id === "object" ? (item.lot_id as MmLot) : null;
                const lotName = lotObj?.lot_name || `Lot #${item.lot_id}`;

                const invLotObj = typeof item.inventory_lot_id === "object" ? (item.inventory_lot_id as MmInventoryLot) : null;
                const batchNo = item.batch_no || invLotObj?.batch_no || "N/A";
                const unitCost = Number(item.unit_cost || prodObj?.cost_per_unit || 0);

                return {
                    ...item,
                    detailId,
                    resolvedName: prodName,
                    resolvedCode: prodCode,
                    resolvedUom,
                    baseUom,
                    uomCount,
                    surplusPieces,
                    resolvedLotName: lotName,
                    resolvedBatchNo: batchNo,
                    totalSurplus,
                    remainingSurplus: remaining,
                    unitCost,
                    surplusAmount: remaining * unitCost
                };
            })
            .filter((i): i is NonNullable<typeof i> => i !== null && i.remainingSurplus > 0.0001);
    }, [lineItems, allocatedOffsetMap]);

    // Group shortage items by Product
    const groupedShortageProducts = useMemo(() => {
        const map = new Map<number, {
            productId: number;
            productName: string;
            productCode?: string;
            uomName?: string;
            baseUom?: string;
            uomCount?: number;
            totalShortageQty: number;
            totalShortagePieces: number;
            totalShortageCost: number;
            items: typeof shortageItems;
        }>();

        for (const item of shortageItems) {
            const pId = typeof item.product_id === "object" ? Number((item.product_id as Product).product_id) : Number(item.product_id);
            const existing = map.get(pId);
            if (existing) {
                existing.totalShortageQty += item.remainingShortage;
                existing.totalShortagePieces += item.shortagePieces;
                existing.totalShortageCost += item.shortageAmount;
                existing.items.push(item);
            } else {
                map.set(pId, {
                    productId: pId,
                    productName: item.resolvedName,
                    productCode: item.resolvedCode,
                    uomName: item.resolvedUom,
                    baseUom: item.baseUom,
                    uomCount: item.uomCount,
                    totalShortageQty: item.remainingShortage,
                    totalShortagePieces: item.shortagePieces,
                    totalShortageCost: item.shortageAmount,
                    items: [item]
                });
            }
        }
        return Array.from(map.values());
    }, [shortageItems]);

    // Group surplus items by Product
    const groupedSurplusProducts = useMemo(() => {
        const map = new Map<number, {
            productId: number;
            productName: string;
            productCode?: string;
            uomName?: string;
            baseUom?: string;
            uomCount?: number;
            totalSurplusQty: number;
            totalSurplusPieces: number;
            totalSurplusCost: number;
            items: typeof surplusItems;
        }>();

        for (const item of surplusItems) {
            const pId = typeof item.product_id === "object" ? Number((item.product_id as Product).product_id) : Number(item.product_id);
            const existing = map.get(pId);
            if (existing) {
                existing.totalSurplusQty += item.remainingSurplus;
                existing.totalSurplusPieces += item.surplusPieces;
                existing.totalSurplusCost += item.surplusAmount;
                existing.items.push(item);
            } else {
                map.set(pId, {
                    productId: pId,
                    productName: item.resolvedName,
                    productCode: item.resolvedCode,
                    uomName: item.resolvedUom,
                    baseUom: item.baseUom,
                    uomCount: item.uomCount,
                    totalSurplusQty: item.remainingSurplus,
                    totalSurplusPieces: item.surplusPieces,
                    totalSurplusCost: item.surplusAmount,
                    items: [item]
                });
            }
        }
        return Array.from(map.values());
    }, [surplusItems]);

    // Total quantity calculations from selected checkboxes
    const selectedShortageTotalQty = useMemo(() => {
        let total = 0;
        if (groupingViewMode === "PRODUCT_GROUPED") {
            for (const group of groupedShortageProducts) {
                if (selectedShortageProductIds.includes(group.productId)) {
                    total += group.totalShortageQty;
                } else {
                    for (const item of group.items) {
                        if (selectedShortageDetailIds.includes(item.detailId)) {
                            total += item.remainingShortage;
                        }
                    }
                }
            }
        } else {
            for (const item of shortageItems) {
                if (selectedShortageDetailIds.includes(item.detailId)) {
                    total += item.remainingShortage;
                }
            }
        }
        return total;
    }, [groupingViewMode, groupedShortageProducts, shortageItems, selectedShortageProductIds, selectedShortageDetailIds]);

    const selectedSurplusTotalQty = useMemo(() => {
        let total = 0;
        if (groupingViewMode === "PRODUCT_GROUPED") {
            for (const group of groupedSurplusProducts) {
                if (selectedSurplusProductIds.includes(group.productId)) {
                    total += group.totalSurplusQty;
                } else {
                    for (const item of group.items) {
                        if (selectedSurplusDetailIds.includes(item.detailId)) {
                            total += item.remainingSurplus;
                        }
                    }
                }
            }
        } else {
            for (const item of surplusItems) {
                if (selectedSurplusDetailIds.includes(item.detailId)) {
                    total += item.remainingSurplus;
                }
            }
        }
        return total;
    }, [groupingViewMode, groupedSurplusProducts, surplusItems, selectedSurplusProductIds, selectedSurplusDetailIds]);

    const selectedShortageTotalPieces = useMemo(() => {
        let pieces = 0;
        if (groupingViewMode === "PRODUCT_GROUPED") {
            for (const group of groupedShortageProducts) {
                if (selectedShortageProductIds.includes(group.productId)) {
                    pieces += group.totalShortagePieces;
                } else {
                    for (const item of group.items) {
                        if (selectedShortageDetailIds.includes(item.detailId)) {
                            pieces += item.shortagePieces;
                        }
                    }
                }
            }
        } else {
            for (const item of shortageItems) {
                if (selectedShortageDetailIds.includes(item.detailId)) {
                    pieces += item.shortagePieces;
                }
            }
        }
        return pieces;
    }, [groupingViewMode, groupedShortageProducts, shortageItems, selectedShortageProductIds, selectedShortageDetailIds]);

    const selectedSurplusTotalPieces = useMemo(() => {
        let pieces = 0;
        if (groupingViewMode === "PRODUCT_GROUPED") {
            for (const group of groupedSurplusProducts) {
                if (selectedSurplusProductIds.includes(group.productId)) {
                    pieces += group.totalSurplusPieces;
                } else {
                    for (const item of group.items) {
                        if (selectedSurplusDetailIds.includes(item.detailId)) {
                            pieces += item.surplusPieces;
                        }
                    }
                }
            }
        } else {
            for (const item of surplusItems) {
                if (selectedSurplusDetailIds.includes(item.detailId)) {
                    pieces += item.surplusPieces;
                }
            }
        }
        return pieces;
    }, [groupingViewMode, groupedSurplusProducts, surplusItems, selectedSurplusProductIds, selectedSurplusDetailIds]);

    // Auto-calculate suggested offset quantity in pieces on selection change
    React.useEffect(() => {
        if (selectedShortageTotalPieces > 0 && selectedSurplusTotalPieces > 0) {
            const maxPossible = Math.min(selectedShortageTotalPieces, selectedSurplusTotalPieces);
            setLinkQty(String(maxPossible));
        } else if (selectedShortageTotalPieces > 0) {
            setLinkQty(String(selectedShortageTotalPieces));
        } else if (selectedSurplusTotalPieces > 0) {
            setLinkQty(String(selectedSurplusTotalPieces));
        } else {
            setLinkQty("");
        }
    }, [selectedShortageTotalPieces, selectedSurplusTotalPieces]);

    // KPI Summary
    const summary = useMemo(() => {
        let totalShortageQty = 0;
        let totalShortagePieces = 0;
        let totalShortageCost = 0;
        let totalSurplusQty = 0;
        let totalSurplusPieces = 0;
        let totalSurplusCost = 0;

        for (const item of lineItems) {
            const sys = Number(item.system_count || 0);
            const phys = Number(item.physical_count ?? sys);
            const rawVar = item.variance !== undefined ? Number(item.variance) : (phys - sys);
            const unitCost = Number(item.unit_cost || 0);

            const prodObj = typeof item.product_id === "object" ? (item.product_id as Product) : null;
            const uomCount = Number(prodObj?.unit_of_measurement_count || 0);
            const multiplier = uomCount > 0 ? uomCount : 1;

            if (rawVar < 0) {
                const qty = Math.abs(rawVar);
                totalShortageQty += qty;
                totalShortagePieces += qty * multiplier;
                totalShortageCost += qty * unitCost;
            } else if (rawVar > 0) {
                totalSurplusQty += rawVar;
                totalSurplusPieces += rawVar * multiplier;
                totalSurplusCost += rawVar * unitCost;
            }
        }

        let totalOffsetQty = 0;
        let totalOffsetPieces = 0;
        let netImpact = 0;

        for (const p of activePairings) {
            totalOffsetQty += p.offset_qty;
            const sItem = shortageItems.find(i => i.detailId === p.shortage_detail_id);
            const uCount = sItem?.uomCount || 1;
            totalOffsetPieces += p.offset_qty * uCount;
            netImpact += p.net_financial_impact;
        }

        return {
            totalShortageQty,
            totalShortagePieces,
            totalShortageCost,
            totalSurplusQty,
            totalSurplusPieces,
            totalSurplusCost,
            totalOffsetQty,
            totalOffsetPieces,
            netImpact
        };
    }, [lineItems, activePairings, shortageItems]);

    // Audit Table View Mode & Row Expansion
    const [auditTableMode, setAuditTableMode] = useState<"GROUPED_PRODUCT" | "GRANULAR_LOT">("GROUPED_PRODUCT");
    const [expandedGroupRows, setExpandedGroupRows] = useState<Record<string, boolean>>({});

    const toggleGroupRow = (groupId: string) => {
        setExpandedGroupRows(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    const handleRemoveGroupPairings = useCallback((groupId: string) => {
        setActivePairings(prev => {
            return prev.filter(p => {
                const gId = p.group_link_id || `${p.shortage_product_id}-${p.surplus_product_id}-${p.reason_code}`;
                return gId !== groupId;
            });
        });
        toast.success("Offset pair group removed.");
    }, []);

    // Group active pairings for consolidated table view
    const groupedActivePairings = useMemo(() => {
        const map = new Map<string, {
            groupId: string;
            shortageProducts: Array<{ name: string; code?: string }>;
            surplusProducts: Array<{ name: string; code?: string }>;
            shortageLotsCount: number;
            surplusLotsCount: number;
            totalOffsetQty: number;
            totalOffsetPieces: number;
            totalNetImpact: number;
            reasonCode: string;
            notes?: string;
            pairs: OffsettingPairing[];
        }>();

        for (const pair of activePairings) {
            const gId = pair.group_link_id || `${pair.shortage_product_id}-${pair.surplus_product_id}-${pair.reason_code}`;
            const pieces = pair.offset_pieces || pair.offset_qty;
            const existing = map.get(gId);
            if (existing) {
                if (!existing.shortageProducts.some(p => p.name === pair.shortage_product_name)) {
                    existing.shortageProducts.push({ name: pair.shortage_product_name, code: pair.shortage_product_code });
                }
                if (!existing.surplusProducts.some(p => p.name === pair.surplus_product_name)) {
                    existing.surplusProducts.push({ name: pair.surplus_product_name, code: pair.surplus_product_code });
                }
                existing.totalOffsetQty += pair.offset_qty;
                existing.totalOffsetPieces += pieces;
                existing.totalNetImpact += pair.net_financial_impact;
                existing.pairs.push(pair);
            } else {
                map.set(gId, {
                    groupId: gId,
                    shortageProducts: [{ name: pair.shortage_product_name, code: pair.shortage_product_code }],
                    surplusProducts: [{ name: pair.surplus_product_name, code: pair.surplus_product_code }],
                    shortageLotsCount: 1,
                    surplusLotsCount: 1,
                    totalOffsetQty: pair.offset_qty,
                    totalOffsetPieces: pieces,
                    totalNetImpact: pair.net_financial_impact,
                    reasonCode: pair.reason_code,
                    notes: pair.notes,
                    pairs: [pair]
                });
            }
        }

        for (const grp of map.values()) {
            const sIds = new Set(grp.pairs.map(p => p.shortage_detail_id));
            const pSurpIds = new Set(grp.pairs.map(p => p.surplus_detail_id));
            grp.shortageLotsCount = sIds.size;
            grp.surplusLotsCount = pSurpIds.size;
        }

        return Array.from(map.values());
    }, [activePairings]);

    // Pairing handler supporting Multi-Checkbox Selection (One-to-Many, Many-to-One, Many-to-Many)
    const handleAddPairing = useCallback(() => {
        const pcsToAllocate = parseFloat(linkQty);
        if (isNaN(pcsToAllocate) || pcsToAllocate <= 0) {
            toast.error("Please enter a valid positive number of pieces to offset.");
            return;
        }

        const getProdId = (pId: number | Product) => typeof pId === "object" ? Number(pId.product_id) : Number(pId);
        const getLotId = (lId: number | MmLot) => typeof lId === "object" ? Number(lId.lot_id) : Number(lId);

        // Collect all checked shortage line items
        const checkedShortageItems: typeof shortageItems = [];
        if (groupingViewMode === "PRODUCT_GROUPED") {
            for (const group of groupedShortageProducts) {
                if (selectedShortageProductIds.includes(group.productId)) {
                    checkedShortageItems.push(...group.items);
                } else {
                    for (const item of group.items) {
                        if (selectedShortageDetailIds.includes(item.detailId) && !checkedShortageItems.some(i => i.detailId === item.detailId)) {
                            checkedShortageItems.push(item);
                        }
                    }
                }
            }
        } else {
            for (const item of shortageItems) {
                if (selectedShortageDetailIds.includes(item.detailId)) {
                    checkedShortageItems.push(item);
                }
            }
        }

        // Collect all checked surplus line items
        const checkedSurplusItems: typeof surplusItems = [];
        if (groupingViewMode === "PRODUCT_GROUPED") {
            for (const group of groupedSurplusProducts) {
                if (selectedSurplusProductIds.includes(group.productId)) {
                    checkedSurplusItems.push(...group.items);
                } else {
                    for (const item of group.items) {
                        if (selectedSurplusDetailIds.includes(item.detailId) && !checkedSurplusItems.some(i => i.detailId === item.detailId)) {
                            checkedSurplusItems.push(item);
                        }
                    }
                }
            }
        } else {
            for (const item of surplusItems) {
                if (selectedSurplusDetailIds.includes(item.detailId)) {
                    checkedSurplusItems.push(item);
                }
            }
        }

        if (checkedShortageItems.length === 0 || checkedSurplusItems.length === 0) {
            toast.error("Please select at least one shortage item/product and one surplus item/product via checkboxes.");
            return;
        }

        const maxPossiblePcs = Math.min(selectedShortageTotalPieces, selectedSurplusTotalPieces);
        if (pcsToAllocate > maxPossiblePcs + 0.0001) {
            toast.error(`Offset quantity cannot exceed ${maxPossiblePcs.toLocaleString()} pcs.`);
            return;
        }

        let remPiecesToAllocate = pcsToAllocate;
        const generatedPairs: OffsettingPairing[] = [];
        let matchCount = 0;
        const groupLinkId = `OFF-GRP-${Date.now().toString().slice(-6)}`;

        const sItems = checkedShortageItems.map(i => ({ ...i, remPcs: i.shortagePieces }));
        const pSurpItems = checkedSurplusItems.map(i => ({ ...i, remPcs: i.surplusPieces }));

        for (const sItem of sItems) {
            if (remPiecesToAllocate <= 0.0001) break;
            if (sItem.remPcs <= 0.0001) continue;
            const sUomCount = sItem.uomCount && sItem.uomCount > 0 ? sItem.uomCount : 1;

            for (const surpItem of pSurpItems) {
                if (remPiecesToAllocate <= 0.0001) break;
                if (surpItem.remPcs <= 0.0001) continue;
                const surpUomCount = surpItem.uomCount && surpItem.uomCount > 0 ? surpItem.uomCount : 1;

                const pairPieces = Math.min(remPiecesToAllocate, sItem.remPcs, surpItem.remPcs);
                if (pairPieces <= 0.0001) continue;

                const shortageDeducted = pairPieces / sUomCount;
                const surplusDeducted = pairPieces / surpUomCount;

                const shortageCostPerPiece = sItem.unitCost / sUomCount;
                const surplusCostPerPiece = surpItem.unitCost / surpUomCount;
                const unitCostVarPerPiece = surplusCostPerPiece - shortageCostPerPiece;
                const netFinancialImpact = pairPieces * unitCostVarPerPiece;

                const pair: OffsettingPairing = {
                    id: `OFF-${Date.now().toString().slice(-5)}-${matchCount + 1}`,
                    group_link_id: groupLinkId,
                    shortage_detail_id: sItem.detailId,
                    shortage_product_id: getProdId(sItem.product_id),
                    shortage_product_name: sItem.resolvedName,
                    shortage_product_code: sItem.resolvedCode,
                    shortage_lot_id: getLotId(sItem.lot_id),
                    shortage_lot_name: sItem.resolvedLotName,
                    shortage_batch_no: sItem.resolvedBatchNo,

                    surplus_detail_id: surpItem.detailId,
                    surplus_product_id: getProdId(surpItem.product_id),
                    surplus_product_name: surpItem.resolvedName,
                    surplus_product_code: surpItem.resolvedCode,
                    surplus_lot_id: getLotId(surpItem.lot_id),
                    surplus_lot_name: surpItem.resolvedLotName,
                    surplus_batch_no: surpItem.resolvedBatchNo,

                    offset_qty: pairPieces,
                    offset_pieces: pairPieces,
                    shortage_uom_count: sUomCount,
                    surplus_uom_count: surpUomCount,
                    shortage_containers_deducted: shortageDeducted,
                    surplus_containers_deducted: surplusDeducted,

                    shortage_unit_cost: sItem.unitCost,
                    surplus_unit_cost: surpItem.unitCost,
                    unit_cost_variance: unitCostVarPerPiece,
                    net_financial_impact: netFinancialImpact,
                    reason_code: linkReason,
                    notes: linkNotes.trim() || undefined,
                    created_at: new Date().toISOString()
                };

                generatedPairs.push(pair);
                sItem.remPcs -= pairPieces;
                surpItem.remPcs -= pairPieces;
                remPiecesToAllocate -= pairPieces;
                matchCount++;
            }
        }

        if (generatedPairs.length > 0) {
            setActivePairings(prev => [...prev, ...generatedPairs]);
            setSelectedShortageProductIds([]);
            setSelectedSurplusProductIds([]);
            setSelectedShortageDetailIds([]);
            setSelectedSurplusDetailIds([]);
            setLinkQty("");
            setLinkNotes("");
            toast.success(`Linked offset pair (${pcsToAllocate.toLocaleString()} pcs total)!`);
        }
    }, [
        linkQty,
        groupingViewMode,
        groupedShortageProducts,
        groupedSurplusProducts,
        shortageItems,
        surplusItems,
        selectedShortageProductIds,
        selectedSurplusProductIds,
        selectedShortageDetailIds,
        selectedSurplusDetailIds,
        selectedShortageTotalPieces,
        selectedSurplusTotalPieces,
        linkReason,
        linkNotes
    ]);

    const handleRemovePairing = useCallback((pairId: string) => {
        setActivePairings(prev => prev.filter(p => p.id !== pairId));
        toast.info("Offset pairing removed.");
    }, []);

    // 1-Click Auto Match Same Product (Piece-Based)
    const handleAutoMatchSameProduct = useCallback(() => {
        const generatedPairs: OffsettingPairing[] = [];
        let matchCount = 0;

        const sItems = shortageItems.map(i => ({ ...i, remPcs: i.shortagePieces }));
        const pSurpItems = surplusItems.map(i => ({ ...i, remPcs: i.surplusPieces }));

        const getProdId = (pId: number | Product) => typeof pId === "object" ? Number(pId.product_id) : Number(pId);
        const getLotId = (lId: number | MmLot) => typeof lId === "object" ? Number(lId.lot_id) : Number(lId);

        for (const sItem of sItems) {
            if (sItem.remPcs <= 0.0001) continue;
            const sProdId = getProdId(sItem.product_id);
            const sUomCount = sItem.uomCount && sItem.uomCount > 0 ? sItem.uomCount : 1;

            for (const surpItem of pSurpItems) {
                if (sItem.remPcs <= 0.0001) break;
                if (surpItem.remPcs <= 0.0001) continue;
                const surpProdId = getProdId(surpItem.product_id);

                if (sProdId === surpProdId) {
                    const surpUomCount = surpItem.uomCount && surpItem.uomCount > 0 ? surpItem.uomCount : 1;
                    const pairPieces = Math.min(sItem.remPcs, surpItem.remPcs);
                    if (pairPieces <= 0.0001) continue;

                    const shortageDeducted = pairPieces / sUomCount;
                    const surplusDeducted = pairPieces / surpUomCount;

                    const shortageCostPerPiece = sItem.unitCost / sUomCount;
                    const surplusCostPerPiece = surpItem.unitCost / surpUomCount;
                    const unitCostVarPerPiece = surplusCostPerPiece - shortageCostPerPiece;
                    const netFinancialImpact = pairPieces * unitCostVarPerPiece;

                    const autoGroupId = `OFF-GRP-AUTO-${Date.now().toString().slice(-5)}`;
                    const pair: OffsettingPairing = {
                        id: `OFF-AUTO-${Date.now().toString().slice(-5)}-${matchCount + 1}`,
                        group_link_id: autoGroupId,
                        shortage_detail_id: sItem.detailId,
                        shortage_product_id: sProdId,
                        shortage_product_name: sItem.resolvedName,
                        shortage_product_code: sItem.resolvedCode,
                        shortage_lot_id: getLotId(sItem.lot_id),
                        shortage_lot_name: sItem.resolvedLotName,
                        shortage_batch_no: sItem.resolvedBatchNo,

                        surplus_detail_id: surpItem.detailId,
                        surplus_product_id: surpProdId,
                        surplus_product_name: surpItem.resolvedName,
                        surplus_product_code: surpItem.resolvedCode,
                        surplus_lot_id: getLotId(surpItem.lot_id),
                        surplus_lot_name: surpItem.resolvedLotName,
                        surplus_batch_no: surpItem.resolvedBatchNo,

                        offset_qty: pairPieces,
                        offset_pieces: pairPieces,
                        shortage_uom_count: sUomCount,
                        surplus_uom_count: surpUomCount,
                        shortage_containers_deducted: shortageDeducted,
                        surplus_containers_deducted: surplusDeducted,

                        shortage_unit_cost: sItem.unitCost,
                        surplus_unit_cost: surpItem.unitCost,
                        unit_cost_variance: unitCostVarPerPiece,
                        net_financial_impact: netFinancialImpact,
                        reason_code: "Lot Number Mix-up / Mislabeling",
                        notes: "Auto-matched identical product across lots/batches",
                        created_at: new Date().toISOString()
                    };

                    generatedPairs.push(pair);
                    sItem.remPcs -= pairPieces;
                    surpItem.remPcs -= pairPieces;
                    matchCount++;
                }
            }
        }

        if (generatedPairs.length === 0) {
            toast.info("No matching identical products found between shortage and surplus lots.");
            return;
        }

        setActivePairings(prev => [...prev, ...generatedPairs]);
        toast.success(`Auto-matched ${generatedPairs.length} lot offset pairs across identical products!`);
    }, [shortageItems, surplusItems]);

    const handleSaveDraft = async () => {
        try {
            setSaving(true);
            await onSavePairings(activePairings);
            toast.success("Offsetting draft saved successfully.");
        } catch {
            toast.error("Failed to save offsetting draft.");
        } finally {
            setSaving(false);
        }
    };

    const handleApproveAndCommit = async () => {
        try {
            setSaving(true);
            await onCommitSheet(activePairings, auditSignoffNotes);
            toast.success("Offsetting audit approved and stock adjustments committed!");
            onBack();
        } catch {
            toast.error("Failed to commit offsetting audit.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Auditor Workspace Top Action Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-xs">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-foreground">
                                Offsetting Audit Workspace — Sheet #{sheet.pi_no}
                            </h2>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                isCommitted
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                    : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                            }`}>
                                {isCommitted ? "COMMITTED" : "AUDITOR WORKSPACE"}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Branch: {sheet.branch_name} | Cutoff Date: {sheet.cutoff_date ? new Date(sheet.cutoff_date).toLocaleDateString() : "N/A"}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <button
                        type="button"
                        onClick={() => setIsPrintModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors shadow-xs"
                    >
                        <Printer className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                        Print Report
                    </button>

                    {!isCommitted && (
                        <>
                            <button
                                type="button"
                                onClick={handleAutoMatchSameProduct}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                Auto-Match Same Product
                            </button>

                            <button
                                type="button"
                                onClick={handleSaveDraft}
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-foreground bg-background border border-input rounded-lg hover:bg-accent transition-colors shadow-xs"
                            >
                                <Save className="h-3.5 w-3.5" />
                                Save Draft
                            </button>

                            <button
                                type="button"
                                onClick={handleApproveAndCommit}
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs"
                            >
                                <CheckCircle2 className="h-4 w-4" />
                                Approve & Commit Stock Adjustments
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* KPI Summary Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-xs">
                    <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                        <span className="text-xs font-bold uppercase tracking-wider">Shortage Discrepancy</span>
                        <TrendingDown className="h-4 w-4" />
                    </div>
                    <div className="mt-2">
                        <span className="text-xl font-extrabold text-foreground block">{summary.totalShortagePieces.toLocaleString()} pcs</span>
                        <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 font-medium mt-1">
                            <span>{summary.totalShortageQty} container units</span>
                            <span>{formatCurrency(summary.totalShortageCost)}</span>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-xs">
                    <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                        <span className="text-xs font-bold uppercase tracking-wider">Overage Discrepancy</span>
                        <TrendingUp className="h-4 w-4" />
                    </div>
                    <div className="mt-2">
                        <span className="text-xl font-extrabold text-foreground block">{summary.totalSurplusPieces.toLocaleString()} pcs</span>
                        <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300 font-medium mt-1">
                            <span>{summary.totalSurplusQty} container units</span>
                            <span>{formatCurrency(summary.totalSurplusCost)}</span>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 shadow-xs">
                    <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                        <span className="text-xs font-bold uppercase tracking-wider">Offset Allocated</span>
                        <Scale className="h-4 w-4" />
                    </div>
                    <div className="mt-2">
                        <span className="text-xl font-extrabold text-foreground block">{summary.totalOffsetPieces.toLocaleString()} pcs</span>
                        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium mt-1">
                            <span>{summary.totalOffsetQty} container units</span>
                            <span>{activePairings.length} pairs linked</span>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 shadow-xs">
                    <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                        <span className="text-xs font-bold uppercase tracking-wider font-mono">Net Cost Impact</span>
                        <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                        <span className={`text-xl font-extrabold ${summary.netImpact > 0 ? "text-emerald-600" : summary.netImpact < 0 ? "text-amber-600" : "text-foreground"}`}>
                            {formatCurrency(summary.netImpact)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">Price difference</span>
                    </div>
                </div>
            </div>

            {!isCommitted && (
                /* Interactive Lot Linker Builder */
                <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3">
                        <div>
                            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                                <Link2 className="h-4 w-4 text-indigo-500" />
                                Auditor Matching Builder
                            </h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Pair shortage items against surplus items to reconcile inventory balance
                            </p>
                        </div>

                        {/* View Switcher Toggle Button */}
                        <div className="inline-flex items-center p-0.5 bg-muted rounded-lg border text-xs font-medium">
                            <button
                                type="button"
                                onClick={() => setGroupingViewMode("PRODUCT_GROUPED")}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all ${
                                    groupingViewMode === "PRODUCT_GROUPED"
                                        ? "bg-background text-foreground font-bold shadow-xs"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Package className="h-3.5 w-3.5" />
                                Grouped by Product
                            </button>
                            <button
                                type="button"
                                onClick={() => setGroupingViewMode("LOT_GRANULAR")}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all ${
                                    groupingViewMode === "LOT_GRANULAR"
                                        ? "bg-background text-foreground font-bold shadow-xs"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Boxes className="h-3.5 w-3.5" />
                                Granular Lots & Batches
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Shortage Column (Left) */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={
                                            groupingViewMode === "PRODUCT_GROUPED"
                                                ? groupedShortageProducts.length > 0 && selectedShortageProductIds.length === groupedShortageProducts.length
                                                : shortageItems.length > 0 && selectedShortageDetailIds.length === shortageItems.length
                                        }
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                if (groupingViewMode === "PRODUCT_GROUPED") {
                                                    setSelectedShortageProductIds(groupedShortageProducts.map(g => g.productId));
                                                    setSelectedShortageDetailIds(shortageItems.map(i => i.detailId));
                                                } else {
                                                    setSelectedShortageDetailIds(shortageItems.map(i => i.detailId));
                                                }
                                            } else {
                                                setSelectedShortageProductIds([]);
                                                setSelectedShortageDetailIds([]);
                                            }
                                        }}
                                        className="h-3.5 w-3.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                    />
                                    <TrendingDown className="h-3.5 w-3.5" />
                                    Shortage Discrepancies (Deficits)
                                </label>
                                {selectedShortageTotalQty > 0 && (
                                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                        Selected: -{selectedShortageTotalPieces.toLocaleString()} pcs ({selectedShortageTotalQty} units)
                                    </span>
                                )}
                            </div>

                            <div className="max-h-72 overflow-y-auto space-y-2 pr-1 border border-border rounded-lg p-2 bg-muted/20">
                                {groupingViewMode === "PRODUCT_GROUPED" ? (
                                    /* PRODUCT GROUPED VIEW FOR SHORTAGES */
                                    groupedShortageProducts.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-muted-foreground">
                                            No unallocated shortage products remaining.
                                        </div>
                                    ) : (
                                        groupedShortageProducts.map(group => {
                                            const isExpanded = !!expandedShortageProducts[group.productId];
                                            const isProductChecked = selectedShortageProductIds.includes(group.productId);
                                            const hasCheckedChild = group.items.some(i => selectedShortageDetailIds.includes(i.detailId));

                                            return (
                                                <div
                                                    key={group.productId}
                                                    onClick={() => toggleShortageProduct(group.productId, group.items.map(i => i.detailId))}
                                                    className={`rounded-lg border transition-all cursor-pointer ${
                                                        isProductChecked
                                                            ? "border-amber-500 bg-amber-500/15 ring-2 ring-amber-500 shadow-md"
                                                            : hasCheckedChild
                                                                ? "border-amber-500/80 bg-amber-500/10 ring-1 ring-amber-500/50"
                                                                : "border-border bg-background hover:border-amber-500/50 hover:bg-amber-500/5"
                                                    }`}
                                                >
                                                    {/* Product Header Card */}
                                                    <div className="p-3">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex items-start gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isProductChecked}
                                                                    onChange={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleShortageProduct(group.productId, group.items.map(i => i.detailId));
                                                                    }}
                                                                    className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer mt-0.5 shrink-0"
                                                                />
                                                                <div className="font-bold text-foreground text-xs flex items-center gap-1.5 flex-wrap">
                                                                    <span>{group.productName}</span>
                                                                    {group.uomName && (
                                                                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-[10px] font-semibold uppercase">
                                                                            {group.uomName}
                                                                        </span>
                                                                    )}
                                                                    {group.productCode && (
                                                                        <span className="text-[10px] text-muted-foreground font-normal font-mono">
                                                                            ({group.productCode})
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <span className="text-amber-600 dark:text-amber-400 font-extrabold text-sm font-mono block">
                                                                    -{group.totalShortagePieces.toLocaleString()} PCS
                                                                </span>
                                                                {group.uomCount && group.uomCount > 1 ? (
                                                                    <span className="text-[10px] text-amber-700 dark:text-amber-300 font-medium font-mono block">
                                                                        (-{group.totalShortageQty} {group.baseUom})
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        </div>

                                                        <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px]">
                                                            <span className="text-muted-foreground font-medium flex items-center gap-1">
                                                                <Layers className="h-3 w-3 text-amber-500" />
                                                                Total Product Deficit ({group.items.length} {group.items.length === 1 ? "lot/batch" : "lots/batches"})
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => toggleShortageExpand(group.productId, e)}
                                                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline"
                                                            >
                                                                {isExpanded ? "Hide Breakdown" : `Show Lot/Batch Breakdown (${group.items.length})`}
                                                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Expanded Breakdown of Batches & Lots */}
                                                    {isExpanded && (
                                                        <div className="border-t bg-muted/40 p-2 space-y-1.5 rounded-b-lg">
                                                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 pb-1">
                                                                Detailed Lots & Batches Breakdown:
                                                            </div>
                                                            {group.items.map(item => {
                                                                const isDetailChecked = selectedShortageDetailIds.includes(item.detailId);
                                                                return (
                                                                    <div
                                                                        key={item.detailId}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            toggleShortageDetail(item.detailId);
                                                                        }}
                                                                        className={`cursor-pointer rounded-md border p-2 text-xs transition-all ${
                                                                            isDetailChecked
                                                                                ? "border-amber-500 bg-amber-500/20 shadow-2xs font-bold ring-1 ring-amber-500"
                                                                                : "border-border/60 bg-background hover:bg-amber-500/10"
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center justify-between text-[11px]">
                                                                            <div className="flex items-center gap-2">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isDetailChecked}
                                                                                    onChange={(e) => {
                                                                                        e.stopPropagation();
                                                                                        toggleShortageDetail(item.detailId);
                                                                                    }}
                                                                                    className="h-3.5 w-3.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer shrink-0"
                                                                                />
                                                                                <span className="font-semibold text-foreground flex items-center gap-1">
                                                                                    <Boxes className="h-3 w-3 text-amber-500 shrink-0" />
                                                                                    Lot: {item.resolvedLotName}
                                                                                </span>
                                                                            </div>
                                                                            <div className="text-right shrink-0">
                                                                                <span className="text-amber-600 dark:text-amber-400 font-bold text-xs font-mono block">
                                                                                    -{item.shortagePieces.toLocaleString()} PCS
                                                                                </span>
                                                                                {item.uomCount && item.uomCount > 1 ? (
                                                                                    <span className="text-[9px] text-amber-700 dark:text-amber-300 font-medium font-mono block">
                                                                                        (-{item.remainingShortage} {item.baseUom})
                                                                                    </span>
                                                                                ) : null}
                                                                            </div>
                                                                        </div>
                                                                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground pl-5">
                                                                            <span className="flex items-center gap-1">
                                                                                <Tag className="h-2.5 w-2.5 text-muted-foreground" />
                                                                                Batch: {item.resolvedBatchNo}
                                                                            </span>
                                                                            <span>Cost: {formatCurrency(item.unitCost)}</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )
                                ) : (
                                    /* GRANULAR LOT/BATCH FLAT VIEW FOR SHORTAGES */
                                    shortageItems.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-muted-foreground">
                                            No unallocated shortage lots remaining.
                                        </div>
                                    ) : (
                                        shortageItems.map(item => {
                                            const isChecked = selectedShortageDetailIds.includes(item.detailId);
                                            return (
                                                <div
                                                    key={item.detailId}
                                                    onClick={() => toggleShortageDetail(item.detailId)}
                                                    className={`cursor-pointer rounded-lg border p-3 text-xs transition-all ${
                                                        isChecked
                                                            ? "border-amber-500 bg-amber-500/15 shadow-xs ring-1 ring-amber-500 font-bold"
                                                            : "border-border bg-background hover:border-amber-500/40"
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between font-medium gap-2">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleShortageDetail(item.detailId);
                                                                }}
                                                                className="h-3.5 w-3.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer shrink-0"
                                                            />
                                                            <span className="font-bold text-foreground">{item.resolvedName}</span>
                                                            {item.resolvedUom && (
                                                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-[10px] font-semibold uppercase">
                                                                    {item.resolvedUom}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <span className="text-amber-600 dark:text-amber-400 font-bold text-xs font-mono block">
                                                                -{item.shortagePieces.toLocaleString()} PCS
                                                            </span>
                                                            {item.uomCount && item.uomCount > 1 ? (
                                                                <span className="text-[9px] text-amber-700 dark:text-amber-300 font-medium font-mono block">
                                                                    (-{item.remainingShortage} {item.baseUom})
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground pl-5.5">
                                                        <span className="flex items-center gap-1">
                                                            <Boxes className="h-3 w-3 text-amber-500" />
                                                            Lot: {item.resolvedLotName}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Tag className="h-3 w-3 text-muted-foreground" />
                                                            Batch: {item.resolvedBatchNo}
                                                        </span>
                                                        <span>Cost: {formatCurrency(item.unitCost)}</span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )
                                )}
                            </div>
                        </div>

                        {/* Surplus Column (Right) */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={
                                            groupingViewMode === "PRODUCT_GROUPED"
                                                ? groupedSurplusProducts.length > 0 && selectedSurplusProductIds.length === groupedSurplusProducts.length
                                                : surplusItems.length > 0 && selectedSurplusDetailIds.length === surplusItems.length
                                        }
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                if (groupingViewMode === "PRODUCT_GROUPED") {
                                                    setSelectedSurplusProductIds(groupedSurplusProducts.map(g => g.productId));
                                                    setSelectedSurplusDetailIds(surplusItems.map(i => i.detailId));
                                                } else {
                                                    setSelectedSurplusDetailIds(surplusItems.map(i => i.detailId));
                                                }
                                            } else {
                                                setSelectedSurplusProductIds([]);
                                                setSelectedSurplusDetailIds([]);
                                            }
                                        }}
                                        className="h-3.5 w-3.5 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                    />
                                    <TrendingUp className="h-3.5 w-3.5" />
                                    Surplus Discrepancies (Overages)
                                </label>
                                {selectedSurplusTotalQty > 0 && (
                                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                        Selected: +{selectedSurplusTotalPieces.toLocaleString()} pcs ({selectedSurplusTotalQty} units)
                                    </span>
                                )}
                            </div>

                            <div className="max-h-72 overflow-y-auto space-y-2 pr-1 border border-border rounded-lg p-2 bg-muted/20">
                                {groupingViewMode === "PRODUCT_GROUPED" ? (
                                    /* PRODUCT GROUPED VIEW FOR SURPLUSES */
                                    groupedSurplusProducts.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-muted-foreground">
                                            No unallocated surplus products remaining.
                                        </div>
                                    ) : (
                                        groupedSurplusProducts.map(group => {
                                            const isExpanded = !!expandedSurplusProducts[group.productId];
                                            const isProductChecked = selectedSurplusProductIds.includes(group.productId);
                                            const hasCheckedChild = group.items.some(i => selectedSurplusDetailIds.includes(i.detailId));

                                            return (
                                                <div
                                                    key={group.productId}
                                                    onClick={() => toggleSurplusProduct(group.productId, group.items.map(i => i.detailId))}
                                                    className={`rounded-lg border transition-all cursor-pointer ${
                                                        isProductChecked
                                                            ? "border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500 shadow-md"
                                                            : hasCheckedChild
                                                                ? "border-emerald-500/80 bg-emerald-500/10 ring-1 ring-emerald-500/50"
                                                                : "border-border bg-background hover:border-emerald-500/50 hover:bg-emerald-500/5"
                                                    }`}
                                                >
                                                    {/* Product Header Card */}
                                                    <div className="p-3">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex items-start gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isProductChecked}
                                                                    onChange={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleSurplusProduct(group.productId, group.items.map(i => i.detailId));
                                                                    }}
                                                                    className="h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer mt-0.5 shrink-0"
                                                                />
                                                                <div className="font-bold text-foreground text-xs flex items-center gap-1.5 flex-wrap">
                                                                    <span>{group.productName}</span>
                                                                    {group.uomName && (
                                                                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-[10px] font-semibold uppercase">
                                                                            {group.uomName}
                                                                        </span>
                                                                    )}
                                                                    {group.productCode && (
                                                                        <span className="text-[10px] text-muted-foreground font-normal font-mono">
                                                                            ({group.productCode})
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm font-mono block">
                                                                    +{group.totalSurplusPieces.toLocaleString()} PCS
                                                                </span>
                                                                {group.uomCount && group.uomCount > 1 ? (
                                                                    <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium font-mono block">
                                                                        (+{group.totalSurplusQty} {group.baseUom})
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        </div>

                                                        <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px]">
                                                            <span className="text-muted-foreground font-medium flex items-center gap-1">
                                                                <Layers className="h-3 w-3 text-emerald-500" />
                                                                Total Product Overage ({group.items.length} {group.items.length === 1 ? "lot/batch" : "lots/batches"})
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => toggleSurplusExpand(group.productId, e)}
                                                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
                                                            >
                                                                {isExpanded ? "Hide Breakdown" : `Show Lot/Batch Breakdown (${group.items.length})`}
                                                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Expanded Breakdown of Batches & Lots */}
                                                    {isExpanded && (
                                                        <div className="border-t bg-muted/40 p-2 space-y-1.5 rounded-b-lg">
                                                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 pb-1">
                                                                Detailed Lots & Batches Breakdown:
                                                            </div>
                                                            {group.items.map(item => {
                                                                const isDetailChecked = selectedSurplusDetailIds.includes(item.detailId);
                                                                return (
                                                                    <div
                                                                        key={item.detailId}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            toggleSurplusDetail(item.detailId);
                                                                        }}
                                                                        className={`cursor-pointer rounded-md border p-2 text-xs transition-all ${
                                                                            isDetailChecked
                                                                                ? "border-emerald-500 bg-emerald-500/20 shadow-2xs font-bold ring-1 ring-emerald-500"
                                                                                : "border-border/60 bg-background hover:bg-emerald-500/10"
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center justify-between text-[11px]">
                                                                            <div className="flex items-center gap-2">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isDetailChecked}
                                                                                    onChange={(e) => {
                                                                                        e.stopPropagation();
                                                                                        toggleSurplusDetail(item.detailId);
                                                                                    }}
                                                                                    className="h-3.5 w-3.5 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                                                                                />
                                                                                <span className="font-semibold text-foreground flex items-center gap-1">
                                                                                    <Boxes className="h-3 w-3 text-emerald-500 shrink-0" />
                                                                                    Lot: {item.resolvedLotName}
                                                                                </span>
                                                                            </div>
                                                                            <div className="text-right shrink-0">
                                                                                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs font-mono block">
                                                                                    +{item.surplusPieces.toLocaleString()} PCS
                                                                                </span>
                                                                                {item.uomCount && item.uomCount > 1 ? (
                                                                                    <span className="text-[9px] text-emerald-700 dark:text-emerald-300 font-medium font-mono block">
                                                                                        (+{item.remainingSurplus} {item.baseUom})
                                                                                    </span>
                                                                                ) : null}
                                                                            </div>
                                                                        </div>
                                                                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground pl-5">
                                                                            <span className="flex items-center gap-1">
                                                                                <Tag className="h-2.5 w-2.5 text-muted-foreground" />
                                                                                Batch: {item.resolvedBatchNo}
                                                                            </span>
                                                                            <span>Cost: {formatCurrency(item.unitCost)}</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )
                                ) : (
                                    /* GRANULAR LOT/BATCH FLAT VIEW FOR SURPLUSES */
                                    surplusItems.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-muted-foreground">
                                            No unallocated surplus lots remaining.
                                        </div>
                                    ) : (
                                        surplusItems.map(item => {
                                            const isChecked = selectedSurplusDetailIds.includes(item.detailId);
                                            return (
                                                <div
                                                    key={item.detailId}
                                                    onClick={() => toggleSurplusDetail(item.detailId)}
                                                    className={`cursor-pointer rounded-lg border p-3 text-xs transition-all ${
                                                        isChecked
                                                            ? "border-emerald-500 bg-emerald-500/15 shadow-xs ring-1 ring-emerald-500 font-bold"
                                                            : "border-border bg-background hover:border-emerald-500/40"
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between font-medium gap-2">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleSurplusDetail(item.detailId);
                                                                }}
                                                                className="h-3.5 w-3.5 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                                                            />
                                                            <span className="font-bold text-foreground">{item.resolvedName}</span>
                                                            {item.resolvedUom && (
                                                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-[10px] font-semibold uppercase">
                                                                    {item.resolvedUom}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs font-mono block">
                                                                +{item.surplusPieces.toLocaleString()} PCS
                                                            </span>
                                                            {item.uomCount && item.uomCount > 1 ? (
                                                                <span className="text-[9px] text-emerald-700 dark:text-emerald-300 font-medium font-mono block">
                                                                    (+{item.remainingSurplus} {item.baseUom})
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground pl-5.5">
                                                        <span className="flex items-center gap-1">
                                                            <Boxes className="h-3 w-3 text-emerald-500" />
                                                            Lot: {item.resolvedLotName}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Tag className="h-3 w-3 text-muted-foreground" />
                                                            Batch: {item.resolvedBatchNo}
                                                        </span>
                                                        <span>Cost: {formatCurrency(item.unitCost)}</span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action inputs bar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-3 border-t bg-muted/20 p-3 rounded-lg">
                        <div className="flex-1 space-y-1">
                            <label className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                                <span>Offset Qty (pcs)</span>
                                {selectedShortageTotalPieces > 0 && selectedSurplusTotalPieces > 0 && (
                                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">
                                        Max: {Math.min(selectedShortageTotalPieces, selectedSurplusTotalPieces).toLocaleString()} pcs
                                    </span>
                                )}
                            </label>
                            <input
                                type="number"
                                step="any"
                                min="0"
                                value={linkQty}
                                onChange={e => setLinkQty(e.target.value)}
                                placeholder="Pieces to link (e.g. 400)"
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono font-bold"
                            />
                        </div>

                        <div className="flex-1 space-y-1">
                            <label className="text-[11px] font-semibold text-muted-foreground">Reason Code</label>
                            <select
                                value={linkReason}
                                onChange={e => setLinkReason(e.target.value)}
                                className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            >
                                {REASON_CODES.map(code => (
                                    <option key={code} value={code}>
                                        {code}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex-1 space-y-1">
                            <label className="text-[11px] font-semibold text-muted-foreground">Auditor Note</label>
                            <input
                                type="text"
                                value={linkNotes}
                                onChange={e => setLinkNotes(e.target.value)}
                                placeholder="Audit remarks"
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={handleAddPairing}
                            disabled={selectedShortageTotalPieces === 0 || selectedSurplusTotalPieces === 0 || !linkQty}
                            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                            <Link2 className="h-3.5 w-3.5" />
                            Link Offset Pair
                        </button>
                    </div>
                </div>
            )}

            {/* Active Offsetting Pairings Table */}
            <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        Active Offsetting Audit Pairs ({activePairings.length} lot pairs across {groupedActivePairings.length} product links)
                    </h4>

                    {/* Audit Table View Switcher */}
                    <div className="inline-flex items-center p-0.5 bg-muted rounded-lg border text-xs font-medium shrink-0">
                        <button
                            type="button"
                            onClick={() => setAuditTableMode("GROUPED_PRODUCT")}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all ${
                                auditTableMode === "GROUPED_PRODUCT"
                                    ? "bg-background text-foreground font-bold shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Package className="h-3.5 w-3.5" />
                            Consolidated Product Pairs
                        </button>
                        <button
                            type="button"
                            onClick={() => setAuditTableMode("GRANULAR_LOT")}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all ${
                                auditTableMode === "GRANULAR_LOT"
                                    ? "bg-background text-foreground font-bold shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Boxes className="h-3.5 w-3.5" />
                            Granular Lot Pairs
                        </button>
                    </div>
                </div>

                {activePairings.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-8 text-center bg-card shadow-xs">
                        <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground/60" />
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                            No offset pairings linked yet. Use the lot matching builder above or click &quot;Auto-Match Same Product&quot;.
                        </p>
                    </div>
                ) : auditTableMode === "GROUPED_PRODUCT" ? (
                    /* CONSOLIDATED PRODUCT OFFSET PAIRS TABLE */
                    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-muted/60 border-b text-[11px] font-bold text-muted-foreground uppercase">
                                <tr>
                                    <th className="px-4 py-3">Shortage Product(s)</th>
                                    <th className="px-4 py-3 text-center"><ArrowRight className="mx-auto h-3.5 w-3.5" /></th>
                                    <th className="px-4 py-3">Surplus Product(s)</th>
                                    <th className="px-4 py-3 text-right">Matched Offset Pieces</th>
                                    <th className="px-4 py-3 text-right">Net Financial Impact</th>
                                    <th className="px-4 py-3">Reason Code & Remarks</th>
                                    {!isCommitted && <th className="px-4 py-3 text-center">Action</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {groupedActivePairings.map((group) => {
                                    const isExpanded = !!expandedGroupRows[group.groupId];
                                    return (
                                        <React.Fragment key={group.groupId}>
                                            <tr className="hover:bg-muted/20 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-foreground">
                                                        {group.shortageProducts.map(p => p.name).join(", ")}
                                                    </div>
                                                    <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                                        ({group.shortageLotsCount} shortage {group.shortageLotsCount === 1 ? "item/lot" : "items/lots"})
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 text-[10px] font-bold">
                                                        VS
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-foreground">
                                                        {group.surplusProducts.map(p => p.name).join(", ")}
                                                    </div>
                                                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                                        ({group.surplusLotsCount} surplus {group.surplusLotsCount === 1 ? "item/lot" : "items/lots"})
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono font-extrabold text-foreground">
                                                    <div>{group.totalOffsetPieces.toLocaleString()} pcs</div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono font-extrabold">
                                                    <span className={group.totalNetImpact > 0 ? "text-emerald-600" : group.totalNetImpact < 0 ? "text-amber-600" : "text-muted-foreground"}>
                                                        {formatCurrency(group.totalNetImpact)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                                                        {group.reasonCode}
                                                    </span>
                                                    {group.notes && <div className="text-[10px] text-muted-foreground italic mt-0.5">{group.notes}</div>}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleGroupRow(group.groupId)}
                                                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                                                            title="Toggle lot breakdown"
                                                        >
                                                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                            <span>{isExpanded ? "Hide" : `Lots (${group.pairs.length})`}</span>
                                                        </button>
                                                        {!isCommitted && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveGroupPairings(group.groupId)}
                                                                className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                                                                title="Delete pair group"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Expanded Lot Breakdown Sub-Table */}
                                            {isExpanded && (
                                                <tr className="bg-muted/30">
                                                    <td colSpan={7} className="p-3">
                                                        <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                                                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                                                <span>Detailed Lot-to-Lot Offset Pairings ({group.pairs.length}):</span>
                                                                <span>Group ID: {group.groupId}</span>
                                                            </div>
                                                            <table className="w-full text-left text-[11px]">
                                                                <thead className="border-b text-[10px] font-bold text-muted-foreground uppercase">
                                                                    <tr>
                                                                        <th className="py-1">Shortage Lot / Batch</th>
                                                                        <th className="py-1">Surplus Lot / Batch</th>
                                                                        <th className="py-1 text-right">Offset Pieces & Deduction</th>
                                                                        <th className="py-1 text-right">Net Impact</th>
                                                                        {!isCommitted && <th className="py-1 text-center">Action</th>}
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-border/60">
                                                                    {group.pairs.map(pair => {
                                                                        const pcs = pair.offset_pieces || pair.offset_qty;
                                                                        const shortDeduction = pair.shortage_containers_deducted !== undefined ? pair.shortage_containers_deducted : (pair.shortage_uom_count && pair.shortage_uom_count > 1 ? pcs / pair.shortage_uom_count : pcs);
                                                                        const surpDeduction = pair.surplus_containers_deducted !== undefined ? pair.surplus_containers_deducted : (pair.surplus_uom_count && pair.surplus_uom_count > 1 ? pcs / pair.surplus_uom_count : pcs);

                                                                        return (
                                                                            <tr key={pair.id}>
                                                                                <td className="py-1.5 font-medium text-amber-700 dark:text-amber-300">
                                                                                    Lot: {pair.shortage_lot_name} (Batch: {pair.shortage_batch_no})
                                                                                </td>
                                                                                <td className="py-1.5 font-medium text-emerald-700 dark:text-emerald-300">
                                                                                    Lot: {pair.surplus_lot_name} (Batch: {pair.surplus_batch_no})
                                                                                </td>
                                                                                 <td className="py-1.5 text-right font-mono font-bold">
                                                                                    <div>{pcs.toLocaleString()} pcs</div>
                                                                                    <div className="text-[9px] text-muted-foreground font-normal">
                                                                                        (-{formatQty(shortDeduction)} / +{formatQty(surpDeduction)})
                                                                                    </div>
                                                                                </td>
                                                                                <td className="py-1.5 text-right font-mono font-bold">
                                                                                    {formatCurrency(pair.net_financial_impact)}
                                                                                </td>
                                                                                {!isCommitted && (
                                                                                    <td className="py-1.5 text-center">
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => handleRemovePairing(pair.id)}
                                                                                            className="rounded p-1 text-muted-foreground hover:text-rose-600"
                                                                                            title="Remove single lot pair"
                                                                                        >
                                                                                            <Trash2 className="h-3 w-3" />
                                                                                        </button>
                                                                                    </td>
                                                                                )}
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    /* GRANULAR LOT PAIRS FLAT TABLE */
                    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-muted/60 border-b text-[11px] font-bold text-muted-foreground uppercase">
                                <tr>
                                    <th className="px-4 py-3">Shortage Item & Lot</th>
                                    <th className="px-4 py-3 text-center"><ArrowRight className="mx-auto h-3.5 w-3.5" /></th>
                                    <th className="px-4 py-3">Surplus Item & Lot</th>
                                    <th className="px-4 py-3 text-right">Offset Pieces & Deduction</th>
                                    <th className="px-4 py-3 text-right">Net Financial Impact</th>
                                    <th className="px-4 py-3">Reason Code & Remarks</th>
                                    {!isCommitted && <th className="px-4 py-3 text-center">Action</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {activePairings.map((pair) => {
                                    const pcs = pair.offset_pieces || pair.offset_qty;
                                    const shortDeduction = pair.shortage_containers_deducted !== undefined ? pair.shortage_containers_deducted : (pair.shortage_uom_count && pair.shortage_uom_count > 1 ? pcs / pair.shortage_uom_count : pcs);
                                    const surpDeduction = pair.surplus_containers_deducted !== undefined ? pair.surplus_containers_deducted : (pair.surplus_uom_count && pair.surplus_uom_count > 1 ? pcs / pair.surplus_uom_count : pcs);

                                    return (
                                        <tr key={pair.id} className="hover:bg-muted/20 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-foreground">{pair.shortage_product_name}</div>
                                                <div className="text-[11px] text-amber-600 dark:text-amber-400">
                                                    Lot: {pair.shortage_lot_name || `Lot #${pair.shortage_lot_id}`} | Batch: {pair.shortage_batch_no || "N/A"}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 text-[10px] font-bold">
                                                    VS
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-foreground">{pair.surplus_product_name}</div>
                                                <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                                    Lot: {pair.surplus_lot_name || `Lot #${pair.surplus_lot_id}`} | Batch: {pair.surplus_batch_no || "N/A"}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                                                <div>{pcs.toLocaleString()} pcs</div>
                                                <div className="text-[10px] text-muted-foreground font-normal">
                                                    (-{formatQty(shortDeduction)} / +{formatQty(surpDeduction)})
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-bold">
                                                <span className={pair.net_financial_impact > 0 ? "text-emerald-600" : pair.net_financial_impact < 0 ? "text-amber-600" : "text-muted-foreground"}>
                                                    {formatCurrency(pair.net_financial_impact)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                                                    {pair.reason_code}
                                                </span>
                                                {pair.notes && <div className="text-[10px] text-muted-foreground italic mt-0.5">{pair.notes}</div>}
                                            </td>
                                            {!isCommitted && (
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemovePairing(pair.id)}
                                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                                                        title="Unlink pair"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {!isCommitted && (
                /* Auditor Sign-off Remarks */
                <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider">Auditor Sign-off Remarks</label>
                    <textarea
                        rows={2}
                        value={auditSignoffNotes}
                        onChange={e => setAuditSignoffNotes(e.target.value)}
                        placeholder="Enter supervisor audit notes before committing final inventory adjustments..."
                        className="w-full rounded-lg border border-input bg-background p-3 text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                    />
                </div>
            )}

            <OffsettingPrintModal
                isOpen={isPrintModalOpen}
                onClose={() => setIsPrintModalOpen(false)}
                sheet={sheet}
                activePairings={activePairings}
                auditNotes={auditSignoffNotes}
            />
        </div>
    );
}
