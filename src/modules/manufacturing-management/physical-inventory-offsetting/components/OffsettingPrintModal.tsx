"use client";

import React, { useRef } from "react";
import {
    X,
    Printer,
    TrendingDown,
    TrendingUp,
    GitCompare,
    ExternalLink
} from "lucide-react";
import {
    OffsettingSheetQueueItem,
    OffsettingPairing,
    Product
} from "../types";

interface OffsettingPrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    sheet: OffsettingSheetQueueItem;
    activePairings: OffsettingPairing[];
    auditNotes?: string;
}

function formatCurrency(val: number): string {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2
    }).format(val || 0);
}

function formatQty(val: number): string {
    return (val || 0).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4
    });
}

function formatUomWithCount(uom: unknown, prod: unknown): string {
    let uomStr = "PCS";
    if (typeof uom === "object" && uom !== null) {
        uomStr = (uom as { unit_shortcut?: string; unit_name?: string }).unit_shortcut ||
            (uom as { unit_name?: string }).unit_name || "PCS";
    } else if (typeof prod === "object" && prod !== null && (prod as { unit_of_measurement?: { unit_shortcut?: string; unit_name?: string } }).unit_of_measurement) {
        const pUom = (prod as { unit_of_measurement?: { unit_shortcut?: string; unit_name?: string } }).unit_of_measurement;
        uomStr = pUom?.unit_shortcut || pUom?.unit_name || "PCS";
    }

    const count = typeof prod === "object" && prod !== null
        ? Number((prod as { unit_of_measurement_count?: number }).unit_of_measurement_count || 0)
        : 0;

    if (count > 1) {
        return `${uomStr} (${count} pcs/${uomStr.toLowerCase()})`;
    }
    return uomStr;
}

export default function OffsettingPrintModal({
    isOpen,
    onClose,
    sheet,
    activePairings,
    auditNotes
}: OffsettingPrintModalProps) {
    const printContainerRef = useRef<HTMLDivElement>(null);

    if (!isOpen) return null;

    const lineItems = sheet.details || [];
    const printTimestamp = new Date().toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });

    // 1. Calculate allocated offset quantities per detail row
    const offsetShortageMap = new Map<number, number>();
    const offsetSurplusMap = new Map<number, number>();

    for (const p of activePairings) {
        const sId = Number(p.shortage_detail_id);
        const surpId = Number(p.surplus_detail_id);
        const q = Number(p.offset_qty || 0);

        if (sId > 0) offsetShortageMap.set(sId, (offsetShortageMap.get(sId) || 0) + q);
        if (surpId > 0) offsetSurplusMap.set(surpId, (offsetSurplusMap.get(surpId) || 0) + q);
    }

    // 2. Classify items into Short Findings and Surplus/Over Findings, consolidated per Product
    const shortageMap = new Map<string, {
        productCode: string;
        productName: string;
        productCategory: string;
        uomStr: string;
        uomCount: number;
        systemQty: number;
        physicalQty: number;
        shortQty: number;
        shortPieces: number;
        unitCost: number;
        totalShortValue: number;
        offsetQty: number;
        remainingShortQty: number;
        remainingShortValue: number;
    }>();

    const surplusMap = new Map<string, {
        productCode: string;
        productName: string;
        productCategory: string;
        uomStr: string;
        uomCount: number;
        systemQty: number;
        physicalQty: number;
        overQty: number;
        overPieces: number;
        unitCost: number;
        totalOverValue: number;
        offsetQty: number;
        remainingOverQty: number;
        remainingOverValue: number;
    }>();

    let totalShortageValue = 0;
    let totalSurplusValue = 0;

    for (const item of lineItems) {
        const detailId = Number(item.physical_inventory_detail_id || item.id || 0);
        const sys = Number(item.system_count || 0);
        const phys = Number(item.physical_count !== null && item.physical_count !== undefined ? item.physical_count : sys);
        const rawVar = item.variance !== undefined ? Number(item.variance) : (phys - sys);
        const unitCost = Number(item.unit_cost || 0);

        const prodObj = typeof item.product_id === "object" ? (item.product_id as Product) : null;
        const prodCode = prodObj?.product_code || "";
        const prodName = prodObj?.product_name || `Product #${item.product_id}`;
        
        let prodCategory = "General";
        if (prodObj) {
            if (typeof prodObj.product_category === "object" && prodObj.product_category !== null) {
                prodCategory = prodObj.product_category.category_name || "General";
            } else if (typeof prodObj.product_category === "string" && prodObj.product_category.trim()) {
                prodCategory = prodObj.product_category.trim();
            } else if (typeof prodObj.product_type === "object" && prodObj.product_type !== null) {
                prodCategory = prodObj.product_type.name || prodObj.product_type.type_name || "General";
            } else if (typeof prodObj.product_type === "string" && prodObj.product_type.trim()) {
                prodCategory = prodObj.product_type.trim();
            }
        }
        const uomCount = typeof prodObj === "object" && prodObj !== null
            ? Number((prodObj as { unit_of_measurement_count?: number }).unit_of_measurement_count || 0)
            : 0;
        const uomStr = formatUomWithCount(item.unit_id, prodObj);
        const prodKey = `${prodCode || prodName}||${uomStr}`;

        if (rawVar < -0.0001) {
            const shortQty = Math.abs(rawVar);
            const shortPieces = shortQty * (uomCount > 0 ? uomCount : 1);
            const totalVal = shortQty * unitCost;
            const offQty = offsetShortageMap.get(detailId) || 0;
            const remQty = Math.max(0, shortQty - offQty);
            const remVal = remQty * unitCost;

            const existing = shortageMap.get(prodKey);
            if (existing) {
                existing.systemQty += sys;
                existing.physicalQty += phys;
                existing.shortQty += shortQty;
                existing.shortPieces += shortPieces;
                existing.totalShortValue += totalVal;
                existing.offsetQty += offQty;
                existing.remainingShortQty += remQty;
                existing.remainingShortValue += remVal;
            } else {
                shortageMap.set(prodKey, {
                    productCode: prodCode,
                    productName: prodName,
                    productCategory: prodCategory,
                    uomStr,
                    uomCount,
                    systemQty: sys,
                    physicalQty: phys,
                    shortQty,
                    shortPieces,
                    unitCost,
                    totalShortValue: totalVal,
                    offsetQty: offQty,
                    remainingShortQty: remQty,
                    remainingShortValue: remVal
                });
            }

            totalShortageValue += totalVal;
        } else if (rawVar > 0.0001) {
            const overQty = rawVar;
            const overPieces = overQty * (uomCount > 0 ? uomCount : 1);
            const totalVal = overQty * unitCost;
            const offQty = offsetSurplusMap.get(detailId) || 0;
            const remQty = Math.max(0, overQty - offQty);
            const remVal = remQty * unitCost;

            const existing = surplusMap.get(prodKey);
            if (existing) {
                existing.systemQty += sys;
                existing.physicalQty += phys;
                existing.overQty += overQty;
                existing.overPieces += overPieces;
                existing.totalOverValue += totalVal;
                existing.offsetQty += offQty;
                existing.remainingOverQty += remQty;
                existing.remainingOverValue += remVal;
            } else {
                surplusMap.set(prodKey, {
                    productCode: prodCode,
                    productName: prodName,
                    productCategory: prodCategory,
                    uomStr,
                    uomCount,
                    systemQty: sys,
                    physicalQty: phys,
                    overQty,
                    overPieces,
                    unitCost,
                    totalOverValue: totalVal,
                    offsetQty: offQty,
                    remainingOverQty: remQty,
                    remainingOverValue: remVal
                });
            }

            totalSurplusValue += totalVal;
        }
    }

    const shortageFindings = Array.from(shortageMap.values()).map(item => {
        let status: "Fully Offset" | "Partially Offset" | "Unresolved" = "Unresolved";
        if (item.remainingShortQty <= 0.0001) status = "Fully Offset";
        else if (item.offsetQty > 0.0001) status = "Partially Offset";

        return {
            ...item,
            offsetStatus: status
        };
    });

    const overFindings = Array.from(surplusMap.values()).map(item => {
        let status: "Fully Offset" | "Partially Offset" | "Unresolved" = "Unresolved";
        if (item.remainingOverQty <= 0.0001) status = "Fully Offset";
        else if (item.offsetQty > 0.0001) status = "Partially Offset";

        return {
            ...item,
            offsetStatus: status
        };
    });

    // 3. Group Matched Offset Pairs (Consolidated per Product)
    const groupedPairsMap = new Map<string, {
        groupNo: string;
        groupLinkId: string;
        shortItems: Array<{ name: string; code?: string; pcs: number; containerQty: number; cost: number; total: number }>;
        surplusItems: Array<{ name: string; code?: string; pcs: number; containerQty: number; cost: number; total: number }>;
        totalShortValue: number;
        totalSurplusValue: number;
        totalOffsetPieces: number;
        reasonCode: string;
        notes?: string;
    }>();

    let pairCounter = 1;
    for (const p of activePairings) {
        const gKey = p.group_link_id || `GRP-${p.shortage_product_id}-${p.surplus_product_id}-${pairCounter}`;
        let existing = groupedPairsMap.get(gKey);

        if (!existing) {
            existing = {
                groupNo: `OFFSET-${String(groupedPairsMap.size + 1).padStart(2, "0")}`,
                groupLinkId: gKey,
                shortItems: [],
                surplusItems: [],
                totalShortValue: 0,
                totalSurplusValue: 0,
                totalOffsetPieces: 0,
                reasonCode: p.reason_code || "Lot Number Mix-up / Mislabeling",
                notes: p.notes
            };
            groupedPairsMap.set(gKey, existing);
        }

        const pcs = p.offset_pieces || p.offset_qty;
        const sQty = p.shortage_containers_deducted !== undefined
            ? p.shortage_containers_deducted
            : (p.shortage_uom_count && p.shortage_uom_count > 1 ? pcs / p.shortage_uom_count : pcs);
        const surpQty = p.surplus_containers_deducted !== undefined
            ? p.surplus_containers_deducted
            : (p.surplus_uom_count && p.surplus_uom_count > 1 ? pcs / p.surplus_uom_count : pcs);

        const sCost = p.shortage_unit_cost || 0;
        const surpCost = p.surplus_unit_cost || 0;
        const sTotal = sQty * sCost;
        const surpTotal = surpQty * surpCost;

        const sProdKey = p.shortage_product_code || p.shortage_product_name;
        const sExistingItem = existing.shortItems.find(i => (i.code || i.name) === sProdKey);
        if (sExistingItem) {
            sExistingItem.pcs += pcs;
            sExistingItem.containerQty += sQty;
            sExistingItem.total += sTotal;
        } else {
            existing.shortItems.push({
                name: p.shortage_product_name,
                code: p.shortage_product_code,
                pcs,
                containerQty: sQty,
                cost: sCost,
                total: sTotal
            });
        }

        const surpProdKey = p.surplus_product_code || p.surplus_product_name;
        const surpExistingItem = existing.surplusItems.find(i => (i.code || i.name) === surpProdKey);
        if (surpExistingItem) {
            surpExistingItem.pcs += pcs;
            surpExistingItem.containerQty += surpQty;
            surpExistingItem.total += surpTotal;
        } else {
            existing.surplusItems.push({
                name: p.surplus_product_name,
                code: p.surplus_product_code,
                pcs,
                containerQty: surpQty,
                cost: surpCost,
                total: surpTotal
            });
        }

        existing.totalShortValue += sTotal;
        existing.totalSurplusValue += surpTotal;
        existing.totalOffsetPieces += pcs;
        pairCounter++;
    }

    const matchedGroupsList = Array.from(groupedPairsMap.values());
    const totalOffsetAmountValue = matchedGroupsList.reduce((acc, g) => acc + Math.min(g.totalShortValue, g.totalSurplusValue), 0);

    // 4. Unresolved Summary
    const unresolvedShortItems = shortageFindings.filter(f => f.remainingShortQty > 0.0001);
    const unresolvedOverItems = overFindings.filter(f => f.remainingOverQty > 0.0001);
    const unresolvedShortTotalValue = unresolvedShortItems.reduce((acc, f) => acc + f.remainingShortValue, 0);
    const unresolvedOverTotalValue = unresolvedOverItems.reduce((acc, f) => acc + f.remainingOverValue, 0);
    const netUnresolvedVarianceValue = unresolvedOverTotalValue - unresolvedShortTotalValue;

    const handleTriggerPrint = () => {
        const reportEl = document.getElementById("printable-reconciliation-report");
        if (!reportEl) {
            window.print();
            return;
        }

        const printFrame = document.createElement("iframe");
        printFrame.name = "print_frame";
        printFrame.style.position = "fixed";
        printFrame.style.left = "-9999px";
        printFrame.style.top = "-9999px";
        printFrame.style.width = "0px";
        printFrame.style.height = "0px";
        printFrame.style.border = "none";

        document.body.appendChild(printFrame);

        const frameDoc = printFrame.contentWindow?.document;
        if (!frameDoc) {
            window.print();
            return;
        }

        const styleTags = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
            .map(el => el.outerHTML)
            .join("\n");

        frameDoc.open();
        frameDoc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Physical Inventory Reconciliation & Offsetting Report - Sheet #${sheet.pi_no}</title>
                ${styleTags}
                <style>
                    @page {
                        size: A4 portrait;
                        margin: 12mm 10mm 12mm 10mm;
                    }
                    *, *::before, *::after {
                        box-sizing: border-box !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    html, body {
                        background: #ffffff !important;
                        color: #0f172a !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                    }
                    #printable-reconciliation-report {
                        position: static !important;
                        width: 100% !important;
                        min-height: 268mm !important;
                        display: flex !important;
                        flex-direction: column !important;
                        justify-content: space-between !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-sizing: border-box !important;
                    }
                    .report-content-body {
                        flex: 1 1 auto !important;
                    }
                    .report-signoff-block {
                        margin-top: auto !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    table {
                        width: 100% !important;
                        table-layout: fixed !important;
                        border-collapse: collapse !important;
                        page-break-inside: auto !important;
                    }
                    tr {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    th, td {
                        box-sizing: border-box !important;
                        word-wrap: break-word !important;
                        overflow-wrap: break-word !important;
                    }
                    .page-break-avoid {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                </style>
            </head>
            <body class="bg-white text-slate-900 font-sans p-4">
                ${reportEl.outerHTML}
            </body>
            </html>
        `);
        frameDoc.close();

        setTimeout(() => {
            try {
                printFrame.contentWindow?.focus();
                printFrame.contentWindow?.print();
            } catch (err) {
                console.error("Print error:", err);
                window.print();
            } finally {
                setTimeout(() => {
                    if (document.body.contains(printFrame)) {
                        document.body.removeChild(printFrame);
                    }
                }, 1000);
            }
        }, 300);
    };

    const handleOpenPrintWindow = () => {
        const reportEl = document.getElementById("printable-reconciliation-report");
        if (!reportEl) return;

        const win = window.open("", "_blank");
        if (!win) return;

        const styleTags = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
            .map(el => el.outerHTML)
            .join("\n");

        win.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Physical Inventory Reconciliation & Offsetting Report - Sheet #${sheet.pi_no}</title>
                ${styleTags}
                <style>
                    @page {
                        size: A4 portrait;
                        margin: 12mm 10mm 12mm 10mm;
                    }
                    body {
                        background: #ffffff !important;
                        color: #0f172a !important;
                        margin: 0 !important;
                        padding: 24px !important;
                        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                    }
                    #printable-reconciliation-report {
                        position: static !important;
                        width: 100% !important;
                        min-height: 268mm !important;
                        display: flex !important;
                        flex-direction: column !important;
                        justify-content: space-between !important;
                        box-sizing: border-box !important;
                    }
                    .report-content-body {
                        flex: 1 1 auto !important;
                    }
                    .report-signoff-block {
                        margin-top: auto !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    tr {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .page-break-avoid {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    @media print {
                        .no-print-toolbar { display: none !important; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print-toolbar" style="margin-bottom: 20px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; font-size: 13px; color: #1e293b;">Print Blueprint Preview — Sheet #${sheet.pi_no}</span>
                    <button onclick="window.print()" style="background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;">Print / Save as PDF</button>
                </div>
                ${reportEl.outerHTML}
            </body>
            </html>
        `);
        win.document.close();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
            {/* Main Modal Box */}
            <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in-50">
                {/* Modal Toolbar Header (Hidden during actual print) */}
                <div className="no-print flex items-center justify-between p-4 border-b bg-muted/40 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <Printer className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-foreground">Printable Offsetting & Reconciliation Report</h3>
                            <p className="text-xs text-muted-foreground">Official Audit Print Blueprint & Physical Reconciliation Sheet</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleOpenPrintWindow}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors shadow-xs"
                            title="Open in new window for direct print preview"
                        >
                            <ExternalLink className="h-4 w-4" />
                            Open Print Window
                        </button>
                        <button
                            type="button"
                            onClick={handleTriggerPrint}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
                        >
                            <Printer className="h-4 w-4" />
                            Print / Save as PDF
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Printable Scroll Container */}
                <div className="flex-1 overflow-y-auto p-6 bg-white text-slate-900 font-sans leading-relaxed" ref={printContainerRef}>
                    <style>{`
                        @media print {
                            @page {
                                size: A4 portrait;
                                margin: 12mm 10mm 12mm 10mm;
                            }
                            html, body {
                                height: auto !important;
                                min-height: 0 !important;
                                max-height: none !important;
                                overflow: visible !important;
                                background: white !important;
                                color: black !important;
                            }
                            .no-print, .no-print * {
                                display: none !important;
                                height: 0 !important;
                                margin: 0 !important;
                                padding: 0 !important;
                            }
                            #printable-reconciliation-report {
                                position: static !important;
                                width: 100% !important;
                                min-height: 268mm !important;
                                display: flex !important;
                                flex-direction: column !important;
                                justify-content: space-between !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                background: white !important;
                                color: black !important;
                                box-sizing: border-box !important;
                            }
                            .report-content-body {
                                flex: 1 1 auto !important;
                            }
                            .report-signoff-block {
                                margin-top: auto !important;
                                page-break-inside: avoid !important;
                                break-inside: avoid !important;
                            }
                            table {
                                width: 100% !important;
                                table-layout: fixed !important;
                                border-collapse: collapse !important;
                                page-break-inside: auto !important;
                            }
                            tr {
                                page-break-inside: avoid !important;
                                break-inside: avoid !important;
                            }
                            th, td {
                                box-sizing: border-box !important;
                                word-wrap: break-word !important;
                                overflow-wrap: break-word !important;
                            }
                            .page-break-avoid {
                                page-break-inside: avoid !important;
                                break-inside: avoid !important;
                            }
                        }
                    `}</style>

                    <div id="printable-reconciliation-report" className="min-h-[268mm] flex flex-col justify-between space-y-4 text-slate-900">
                        <div className="space-y-4 flex-1 report-content-body">
                            {/* 1. REPORT HEADER & METADATA BLOCK */}
                        <div className="border-b-2 border-slate-900 pb-4 page-break-avoid">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2 text-slate-800 font-extrabold text-xs uppercase tracking-wider">
                                        <GitCompare className="h-4 w-4 text-slate-700" />
                                        VOS ERP — MANUFACTURING MANAGEMENT
                                    </div>
                                    <h1 className="text-xl font-black text-slate-950 tracking-tight mt-0.5">
                                        PHYSICAL INVENTORY RECONCILIATION & OFFSETTING REPORT
                                    </h1>
                                    <p className="text-xs text-slate-600 font-medium">
                                        Official Audit Document for Product Discrepancy Offsetting & Stock Variance Settlement
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono font-bold text-slate-950">
                                        Sheet #: {sheet.pi_no}
                                    </div>
                                    <div className="text-[11px] text-slate-600 mt-1 font-mono">
                                        Printed: {printTimestamp}
                                    </div>
                                </div>
                            </div>

                            {/* Metadata Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs bg-slate-50 p-2.5 rounded border border-slate-300">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Branch / Location:</span>
                                    <span className="font-bold text-slate-900">{sheet.branch_name || "N/A"}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Stock Type:</span>
                                    <span className="font-bold text-slate-900">{sheet.stock_type || "REGULAR"}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Audit Period:</span>
                                    <span className="font-bold text-slate-900">
                                        {sheet.starting_date ? new Date(sheet.starting_date).toLocaleDateString() : "N/A"} — {sheet.cutoff_date ? new Date(sheet.cutoff_date).toLocaleDateString() : "N/A"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Header Status:</span>
                                    <span className="font-bold text-slate-900">{sheet.status}</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. EXECUTIVE FINANCIAL SUMMARY BLOCK */}
                        <div className="page-break-avoid">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2 border-b border-slate-200 pb-1">
                                2. Executive Financial Summary
                            </h2>
                            <div className="grid grid-cols-4 gap-3 text-xs">
                                <div className="p-3 rounded border border-slate-300 bg-white">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Total Shortage Value</div>
                                    <div className="text-base font-black font-mono text-slate-950 mt-0.5 whitespace-nowrap">
                                        -{formatCurrency(totalShortageValue)}
                                    </div>
                                    <div className="text-[10px] text-slate-600 font-medium">{shortageFindings.length} shortage items</div>
                                </div>

                                <div className="p-3 rounded border border-slate-300 bg-white">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Total Surplus Value</div>
                                    <div className="text-base font-black font-mono text-slate-950 mt-0.5 whitespace-nowrap">
                                        +{formatCurrency(totalSurplusValue)}
                                    </div>
                                    <div className="text-[10px] text-slate-600 font-medium">{overFindings.length} surplus items</div>
                                </div>

                                <div className="p-3 rounded border border-slate-300 bg-white">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Total Offset / Balanced</div>
                                    <div className="text-base font-black font-mono text-slate-950 mt-0.5 whitespace-nowrap">
                                        {formatCurrency(totalOffsetAmountValue)}
                                    </div>
                                    <div className="text-[10px] text-slate-600 font-medium">{activePairings.length} matched pairs</div>
                                </div>

                                <div className="p-3 rounded border border-slate-400 bg-slate-50">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Net Unresolved Variance</div>
                                    <div className="text-base font-black font-mono text-slate-950 mt-0.5 whitespace-nowrap">
                                        {formatCurrency(netUnresolvedVarianceValue)}
                                    </div>
                                    <div className="text-[10px] text-slate-600 font-medium">Post to Stock Ledger</div>
                                </div>
                            </div>
                        </div>

                        {/* 3. AUDIT FINDINGS TABLES (SHORT & OVER LISTS) */}
                        <div className="space-y-4">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1">
                                3. Itemized Audit Discrepancies
                            </h2>

                            {/* A. Short Findings Table */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                                    <TrendingDown className="h-3.5 w-3.5 text-slate-700" />
                                    A. Short Findings Table (Deficits & Missing Items)
                                </h3>
                                <table className="w-full text-left text-[11px] border-collapse border border-slate-300 table-fixed">
                                    <colgroup>
                                        <col style={{ width: "30%" }} />
                                        <col style={{ width: "14%" }} />
                                        <col style={{ width: "14%" }} />
                                        <col style={{ width: "14%" }} />
                                        <col style={{ width: "18%" }} />
                                        <col style={{ width: "10%" }} />
                                    </colgroup>
                                    <thead className="bg-slate-100 text-slate-900 font-bold uppercase text-[10px] tracking-wider border-b-2 border-slate-300">
                                        <tr>
                                            <th className="p-2 border border-slate-300 text-left">Item & Category Details</th>
                                            <th className="p-2 border border-slate-300 text-right">System / Phys Count</th>
                                            <th className="p-2 border border-slate-300 text-right">Short Qty</th>
                                            <th className="p-2 border border-slate-300 text-right">Unit Cost</th>
                                            <th className="p-2 border border-slate-300 text-right">Short Value</th>
                                            <th className="p-2 border border-slate-300 text-center">Offset Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {shortageFindings.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="p-3 text-center text-slate-500 font-medium border border-slate-300">
                                                    No inventory shortage findings recorded.
                                                </td>
                                            </tr>
                                        ) : (
                                            shortageFindings.map((f, idx) => (
                                                <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/60" : "bg-white"}>
                                                    <td className="p-2 border border-slate-300">
                                                        <div className="font-bold text-slate-950 leading-tight">
                                                            [{f.productCode}] {f.productName}
                                                        </div>
                                                        <div className="text-[10px] text-slate-600 mt-0.5">
                                                            Cat: <span className="font-medium text-slate-800">{f.productCategory}</span> | UOM: <span className="font-medium text-slate-800">{f.uomStr}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border border-slate-300 text-right font-mono text-slate-900 leading-tight whitespace-nowrap">
                                                        <div>Sys: {formatQty(f.systemQty)}</div>
                                                        <div className="text-[10px] text-slate-600">Phys: {formatQty(f.physicalQty)}</div>
                                                    </td>
                                                    <td className="p-2 border border-slate-300 text-right font-mono font-bold text-slate-950 whitespace-nowrap">
                                                        <div>-{formatQty(f.shortQty)}</div>
                                                        {f.uomCount > 1 && (
                                                            <div className="text-[9px] text-slate-600 font-normal">(-{formatQty(f.shortPieces)} pcs total)</div>
                                                        )}
                                                    </td>
                                                    <td className="p-2 border border-slate-300 text-right font-mono text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis">{formatCurrency(f.unitCost)}</td>
                                                    <td className="p-2 border border-slate-300 text-right font-mono font-bold text-slate-950 whitespace-nowrap overflow-hidden text-ellipsis">-{formatCurrency(f.totalShortValue)}</td>
                                                    <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                                                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border border-slate-300 bg-slate-100 text-slate-800">
                                                            {f.offsetStatus}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* B. Over Findings Table */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                                    <TrendingUp className="h-3.5 w-3.5 text-slate-700" />
                                    B. Over Findings Table (Surplus & Overage Items)
                                </h3>
                                <table className="w-full text-left text-[11px] border-collapse border border-slate-300 table-fixed">
                                    <colgroup>
                                        <col style={{ width: "30%" }} />
                                        <col style={{ width: "14%" }} />
                                        <col style={{ width: "14%" }} />
                                        <col style={{ width: "14%" }} />
                                        <col style={{ width: "18%" }} />
                                        <col style={{ width: "10%" }} />
                                    </colgroup>
                                    <thead className="bg-slate-100 text-slate-900 font-bold uppercase text-[10px] tracking-wider border-b-2 border-slate-300">
                                        <tr>
                                            <th className="p-2 border border-slate-300 text-left">Item & Category Details</th>
                                            <th className="p-2 border border-slate-300 text-right">System / Phys Count</th>
                                            <th className="p-2 border border-slate-300 text-right">Over Qty</th>
                                            <th className="p-2 border border-slate-300 text-right">Unit Cost</th>
                                            <th className="p-2 border border-slate-300 text-right">Over Value</th>
                                            <th className="p-2 border border-slate-300 text-center">Offset Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {overFindings.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="p-3 text-center text-slate-500 font-medium border border-slate-300">
                                                    No inventory surplus findings recorded.
                                                </td>
                                            </tr>
                                        ) : (
                                            overFindings.map((f, idx) => (
                                                <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/60" : "bg-white"}>
                                                    <td className="p-2 border border-slate-300">
                                                        <div className="font-bold text-slate-950 leading-tight">
                                                            [{f.productCode}] {f.productName}
                                                        </div>
                                                        <div className="text-[10px] text-slate-600 mt-0.5">
                                                            Cat: <span className="font-medium text-slate-800">{f.productCategory}</span> | UOM: <span className="font-medium text-slate-800">{f.uomStr}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border border-slate-300 text-right font-mono text-slate-900 leading-tight whitespace-nowrap">
                                                        <div>Sys: {formatQty(f.systemQty)}</div>
                                                        <div className="text-[10px] text-slate-600">Phys: {formatQty(f.physicalQty)}</div>
                                                    </td>
                                                    <td className="p-2 border border-slate-300 text-right font-mono font-bold text-slate-950 whitespace-nowrap">
                                                        <div>+{formatQty(f.overQty)}</div>
                                                        {f.uomCount > 1 && (
                                                            <div className="text-[9px] text-slate-600 font-normal">(+{formatQty(f.overPieces)} pcs total)</div>
                                                        )}
                                                    </td>
                                                    <td className="p-2 border border-slate-300 text-right font-mono text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis">{formatCurrency(f.unitCost)}</td>
                                                    <td className="p-2 border border-slate-300 text-right font-mono font-bold text-slate-950 whitespace-nowrap overflow-hidden text-ellipsis">+{formatCurrency(f.totalOverValue)}</td>
                                                    <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                                                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border border-slate-300 bg-slate-100 text-slate-800">
                                                            {f.offsetStatus}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 4. MATCHED OFFSET GROUPS / PAIRS TABLE */}
                        <div className="page-break-avoid">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2 border-b border-slate-200 pb-1">
                                4. Matched Offset Groups & Reconciled Pairs
                            </h2>
                            <table className="w-full text-left text-[11px] border-collapse border border-slate-300 table-fixed">
                                <colgroup>
                                    <col style={{ width: "10%" }} />
                                    <col style={{ width: "45%" }} />
                                    <col style={{ width: "20%" }} />
                                    <col style={{ width: "15%" }} />
                                    <col style={{ width: "10%" }} />
                                </colgroup>
                                <thead className="bg-slate-100 text-slate-900 font-bold uppercase text-[10px] tracking-wider border-b-2 border-slate-300">
                                    <tr>
                                        <th className="p-2 border border-slate-300 text-left">Group No</th>
                                        <th className="p-2 border border-slate-300 text-left">Reconciled Items (Shortage ↔ Surplus)</th>
                                        <th className="p-2 border border-slate-300 text-right">Matched Qty & Value</th>
                                        <th className="p-2 border border-slate-300 text-left">Audit Reason & Notes</th>
                                        <th className="p-2 border border-slate-300 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {matchedGroupsList.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-3 text-center text-slate-500 font-medium border border-slate-300">
                                                No offset pairings created or matched yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        matchedGroupsList.map((g, idx) => (
                                            <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/60" : "bg-white"}>
                                                <td className="p-2 border border-slate-300 font-bold font-mono text-slate-950 whitespace-nowrap">
                                                    {g.groupNo}
                                                </td>
                                                <td className="p-2 border border-slate-300">
                                                    <div className="text-[10px]">
                                                        <span className="font-bold text-slate-700 uppercase tracking-wider block text-[9px]">Shortage:</span>
                                                        {g.shortItems.map((si, sIdx) => (
                                                            <div key={sIdx} className="font-semibold text-slate-900 leading-tight">
                                                                {si.code ? `[${si.code}] ` : ""}{si.name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="text-[10px] mt-1 border-t border-slate-200 pt-1">
                                                        <span className="font-bold text-slate-700 uppercase tracking-wider block text-[9px]">Surplus:</span>
                                                        {g.surplusItems.map((surp, surpIdx) => (
                                                            <div key={surpIdx} className="font-semibold text-slate-900 leading-tight">
                                                                {surp.code ? `[${surp.code}] ` : ""}{surp.name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="p-2 border border-slate-300 text-right font-mono text-slate-950 whitespace-nowrap">
                                                    <div className="font-bold text-slate-950">{formatQty(g.totalOffsetPieces)} pcs</div>
                                                    <div className="text-[9px] text-slate-600 mt-0.5">
                                                        Short: -{formatCurrency(g.totalShortValue)}
                                                    </div>
                                                    <div className="text-[9px] text-slate-600">
                                                        Surp: +{formatCurrency(g.totalSurplusValue)}
                                                    </div>
                                                </td>
                                                <td className="p-2 border border-slate-300 text-slate-800 text-[10px]">
                                                    <div className="font-bold text-slate-900">{g.reasonCode}</div>
                                                    {g.notes && <div className="italic text-slate-600">{g.notes}</div>}
                                                </td>
                                                <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                                                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border border-slate-300 bg-slate-100 text-slate-800">
                                                        Reconciled
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* 5. UNRESOLVED & FINAL SETTLEMENT SUMMARY */}
                        <div className="page-break-avoid">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2 border-b border-slate-200 pb-1">
                                5. Unresolved & Final Stock Settlement Summary
                            </h2>
                            <div className="grid grid-cols-3 gap-3 text-xs">
                                <div className="p-3 bg-white border border-slate-300 rounded">
                                    <div className="font-bold text-slate-900 text-[11px] uppercase tracking-wider">Unresolved Shortage Items</div>
                                    <div className="text-slate-600 text-[11px] mt-0.5">
                                        Count: <span className="font-bold text-slate-900">{unresolvedShortItems.length} items</span>
                                    </div>
                                    <div className="text-slate-950 font-bold font-mono mt-1 text-sm whitespace-nowrap">
                                        Value: -{formatCurrency(unresolvedShortTotalValue)}
                                    </div>
                                    <div className="text-[10px] text-slate-600 mt-1 font-medium">
                                        Action: Record as Stock Loss / Expense
                                    </div>
                                </div>

                                <div className="p-3 bg-white border border-slate-300 rounded">
                                    <div className="font-bold text-slate-900 text-[11px] uppercase tracking-wider">Unresolved Surplus Items</div>
                                    <div className="text-slate-600 text-[11px] mt-0.5">
                                        Count: <span className="font-bold text-slate-900">{unresolvedOverItems.length} items</span>
                                    </div>
                                    <div className="text-slate-950 font-bold font-mono mt-1 text-sm whitespace-nowrap">
                                        Value: +{formatCurrency(unresolvedOverTotalValue)}
                                    </div>
                                    <div className="text-[10px] text-slate-600 mt-1 font-medium">
                                        Action: Record as Stock Gain / Adjustment
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-50 border border-slate-400 rounded">
                                    <div className="font-bold text-slate-950 text-[11px] uppercase tracking-wider">Final Net Variance to Post</div>
                                    <div className="text-slate-600 text-[11px] mt-0.5">
                                        Net Financial Impact
                                    </div>
                                    <div className="font-bold font-mono mt-1 text-sm text-slate-950 whitespace-nowrap">
                                        {formatCurrency(netUnresolvedVarianceValue)}
                                    </div>
                                    <div className="text-[10px] text-slate-600 mt-1 font-medium">
                                        Action: Stock Ledger Adjustment Entry
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 6. AUDIT FINDINGS NARRATIVE / REMARKS */}
                        <div className="page-break-avoid">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-1 border-b border-slate-200 pb-1">
                                6. Auditor Notes & Remarks Narrative
                            </h2>
                            <div className="p-2.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 min-h-[50px]">
                                {auditNotes && auditNotes.trim() ? (
                                    <p className="whitespace-pre-wrap">{auditNotes.trim()}</p>
                                ) : (
                                    <p className="text-slate-500 italic">
                                        No specific auditor narrative recorded. Discrepancies offset in accordance with manufacturing inventory audit policies.
                                    </p>
                                )}
                            </div>
                        </div>
                        </div>

                        {/* 7. VERIFICATION & SIGN-OFF BLOCK */}
                        <div className="pt-3 border-t-2 border-slate-900 page-break-avoid mt-auto shrink-0 report-signoff-block">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">
                                7. Verification & Audit Sign-Off
                            </h2>
                            <div className="grid grid-cols-3 gap-8 text-center text-xs">
                                <div>
                                    <div className="border-b-2 border-slate-800 pb-1 h-7 flex items-end justify-center font-bold">
                                        {sheet.encoder_id ? String(sheet.encoder_id) : ""}
                                    </div>
                                    <div className="font-bold text-slate-900 mt-1">Prepared By:</div>
                                    <div className="text-[10px] text-slate-600">Inventory Custodian / Encoder</div>
                                    <div className="mt-1.5 text-[10px] text-slate-500">Date: ________________________</div>
                                </div>

                                <div>
                                    <div className="border-b-2 border-slate-800 pb-1 h-7 flex items-end justify-center font-bold">
                                    </div>
                                    <div className="font-bold text-slate-900 mt-1">Reviewed By:</div>
                                    <div className="text-[10px] text-slate-600">Internal Auditor</div>
                                    <div className="mt-1.5 text-[10px] text-slate-500">Date: ________________________</div>
                                </div>

                                <div>
                                    <div className="border-b-2 border-slate-800 pb-1 h-7 flex items-end justify-center font-bold">
                                    </div>
                                    <div className="font-bold text-slate-900 mt-1">Approved By:</div>
                                    <div className="text-[10px] text-slate-600">Branch / Warehouse Manager</div>
                                    <div className="mt-1.5 text-[10px] text-slate-500">Date: ________________________</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
