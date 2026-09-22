/* eslint-disable */
"use client";

import React from "react";
import { Printer, X, Download, ShieldCheck, CheckCircle2, Package, Layers, Briefcase, Calculator } from "lucide-react";
import { Product, BOMItem } from "../types";
import { CostingBreakdown, OverheadSummary } from "../costing";

interface PrintableCostRollupReportProps {
    isOpen: boolean;
    onClose: () => void;
    selectedProduct: Product;
    versionName?: string;
    standardPrice: number;
    standardCogs: number;
    standardBreakdown: CostingBreakdown;
    standardOverheads: OverheadSummary;
    standardGrossProfit: number;
    standardGrossMarginPercent: number;
    standardNetProfit: number;
    standardNetMarginPercent: number;
    editedBOM: BOMItem[];
    versionOverheadItems?: any[];
}

export const PrintableCostRollupReport: React.FC<PrintableCostRollupReportProps> = ({
    isOpen,
    onClose,
    selectedProduct,
    versionName = "v1.0 (Active)",
    standardPrice,
    standardCogs,
    standardBreakdown,
    standardOverheads,
    standardGrossProfit,
    standardGrossMarginPercent,
    standardNetProfit,
    standardNetMarginPercent,
    editedBOM,
    versionOverheadItems = []
}) => {
    if (!isOpen) return null;

    const handleTriggerPrint = () => {
        window.print();
    };

    const currentDate = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });

    const totalMaterialCost = standardBreakdown.materialsCost || 0;
    const totalLaborCost = standardBreakdown.directLaborCost || 0;
    const totalMachineCost = standardBreakdown.machineOverheadCost || 0;
    const totalCustomOverhead = standardBreakdown.customOverheadCost || 0;

    return (
        <>
            {/* Global Print Media Override Styles */}
            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden !important;
                    }
                    #printable-cost-report, #printable-cost-report * {
                        visibility: visible !important;
                    }
                    #printable-cost-report {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 20px !important;
                        background: white !important;
                        color: black !important;
                        box-shadow: none !important;
                        border: none !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>

            {/* Interactive Screen Modal Overlay */}
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200 p-4 no-print">
                <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                    {/* Header Action Bar */}
                    <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-muted/20">
                        <div className="flex items-center gap-2">
                            <Printer className="h-5 w-5 text-primary" />
                            <div>
                                <h3 className="text-base font-bold text-foreground">Printable Costing &amp; Recipe Audit Sheet</h3>
                                <p className="text-xs text-muted-foreground">Formatted publication-grade document for finance, management &amp; production sign-off.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleTriggerPrint}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg text-xs hover:bg-primary/95 transition-all shadow-md cursor-pointer"
                            >
                                <Printer className="h-4 w-4" /> Print / Save as PDF
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Report Preview Body Container */}
                    <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-950">
                        <div 
                            id="printable-cost-report" 
                            className="bg-white text-slate-900 rounded-xl p-8 shadow-md border border-slate-200 max-w-3xl mx-auto space-y-6 text-xs font-sans leading-relaxed"
                        >
                            {/* Document Header */}
                            <div className="border-b border-slate-300 pb-4 flex justify-between items-start">
                                <div>
                                    <h1 className="text-xl font-extrabold tracking-tight text-slate-900 uppercase">
                                        MANUFACTURING MANAGEMENT SYSTEM
                                    </h1>
                                    <h2 className="text-sm font-bold text-slate-700 tracking-wide mt-0.5">
                                        FINISHED GOODS STANDARD COSTING &amp; RECIPE REPORT
                                    </h2>
                                    <p className="text-[10px] text-slate-500 font-mono mt-1">
                                        Ref: FG-COST-{selectedProduct.sku}-{Date.now().toString().slice(-6)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className="inline-block px-2.5 py-1 rounded bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                                        CONFIDENTIAL AUDIT
                                    </span>
                                    <p className="text-[10px] text-slate-500 mt-2">Generated: {currentDate}</p>
                                </div>
                            </div>

                            {/* Product Metadata Block */}
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                                <div>
                                    <span className="text-[9px] uppercase font-bold text-slate-500 block">Product Name</span>
                                    <strong className="text-slate-900 font-bold block truncate">{selectedProduct.title}</strong>
                                </div>
                                <div>
                                    <span className="text-[9px] uppercase font-bold text-slate-500 block">SKU / Code</span>
                                    <strong className="text-slate-900 font-mono font-bold block">{selectedProduct.sku || "N/A"}</strong>
                                </div>
                                <div>
                                    <span className="text-[9px] uppercase font-bold text-slate-500 block">Base UOM</span>
                                    <strong className="text-slate-900 font-bold block">{selectedProduct.baseUom}</strong>
                                </div>
                                <div>
                                    <span className="text-[9px] uppercase font-bold text-slate-500 block">Active Version</span>
                                    <strong className="text-slate-900 font-bold block">{versionName}</strong>
                                </div>
                            </div>

                            {/* Financial Executive Summary Box */}
                            <div className="border border-slate-900 rounded-lg overflow-hidden">
                                <div className="bg-slate-900 text-white px-4 py-2 font-bold uppercase tracking-wider text-[10px] flex justify-between items-center">
                                    <span>Financial &amp; Profitability Rollup Summary (PHP ₱)</span>
                                    <span>Base Batch Qty: {standardBreakdown.baseQuantity || 1} {selectedProduct.baseUom}</span>
                                </div>
                                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50">
                                    <div className="border-r border-slate-200 pr-3">
                                        <span className="text-[9px] uppercase font-bold text-slate-500 block">Target Selling Price</span>
                                        <span className="text-base font-extrabold text-slate-900 font-mono">₱{(Number(standardPrice || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="border-r border-slate-200 pr-3">
                                        <span className="text-[9px] uppercase font-bold text-slate-500 block">Unit COGS (Cost/Unit)</span>
                                        <span className="text-base font-extrabold text-slate-900 font-mono">₱{(Number(standardCogs || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="border-r border-slate-200 pr-3">
                                        <span className="text-[9px] uppercase font-bold text-slate-500 block">Gross Profit / Unit</span>
                                        <span className="text-base font-extrabold text-emerald-700 font-mono">
                                            ₱{(Number(standardGrossProfit || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({standardGrossMarginPercent.toFixed(1)}%)
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] uppercase font-bold text-slate-500 block">Net Profit / Unit</span>
                                        <span className="text-base font-extrabold text-blue-700 font-mono">
                                            ₱{(Number(standardNetProfit || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({standardNetMarginPercent.toFixed(1)}%)
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Cost Component Proportions Bar */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase text-slate-600">
                                    <span>Unit Cost Composition Breakdown</span>
                                    <span>Total: ₱{(Number(standardCogs || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                                    <div className="bg-slate-100 p-2 rounded border border-slate-200">
                                        <span className="text-slate-500 block uppercase font-semibold">Raw Materials</span>
                                        <strong className="text-slate-900 font-mono font-bold">₱{(Number(totalMaterialCost || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                    </div>
                                    <div className="bg-slate-100 p-2 rounded border border-slate-200">
                                        <span className="text-slate-500 block uppercase font-semibold">Direct Labor</span>
                                        <strong className="text-slate-900 font-mono font-bold">₱{(Number(totalLaborCost || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                    </div>
                                    <div className="bg-slate-100 p-2 rounded border border-slate-200">
                                        <span className="text-slate-500 block uppercase font-semibold">Machine Overhead</span>
                                        <strong className="text-slate-900 font-mono font-bold">₱{(Number(totalMachineCost || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                    </div>
                                    <div className="bg-slate-100 p-2 rounded border border-slate-200">
                                        <span className="text-slate-500 block uppercase font-semibold">Custom Overhead</span>
                                        <strong className="text-slate-900 font-mono font-bold">₱{(Number(totalCustomOverhead || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                    </div>
                                </div>
                            </div>

                            {/* Table 1: Bill of Materials Recipe */}
                            <div className="space-y-2">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1">
                                    1. Bill of Materials (BOM) &amp; Component Ingredients
                                </h3>
                                <table className="w-full text-left text-[11px] border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100 border-b border-slate-300 text-[9px] uppercase font-bold text-slate-700">
                                            <th className="py-2 px-2">Component Name</th>
                                            <th className="py-2 px-2 text-center">Type</th>
                                            <th className="py-2 px-2 text-right">Qty</th>
                                            <th className="py-2 px-2 text-center">UOM</th>
                                            <th className="py-2 px-2 text-right">Wastage %</th>
                                            <th className="py-2 px-2 text-right">Landed Cost</th>
                                            <th className="py-2 px-2 text-right">Extended Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {editedBOM.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-3 text-center text-slate-400 italic">No ingredients registered in active BOM recipe.</td>
                                            </tr>
                                        ) : (
                                            editedBOM.map((item, idx) => {
                                                const qty = Number(item.quantity || 0);
                                                const wastage = Number(item.wastagePercent ?? (item as any).wastageFactor ?? 0);
                                                const landed = Number(item.landedCost ?? (item as any).unitCost ?? (item as any).costPerUnit ?? 0);
                                                const extCost = qty * (1 + (wastage / 100)) * landed;
                                                return (
                                                    <tr key={idx} className="hover:bg-slate-50">
                                                        <td className="py-1.5 px-2 font-semibold text-slate-900">{item.name}</td>
                                                        <td className="py-1.5 px-2 text-center text-[9px] uppercase text-slate-600 font-semibold">{item.type}</td>
                                                        <td className="py-1.5 px-2 text-right font-mono">{qty}</td>
                                                        <td className="py-1.5 px-2 text-center font-semibold">{item.uom}</td>
                                                        <td className="py-1.5 px-2 text-right font-mono">{wastage}%</td>
                                                        <td className="py-1.5 px-2 text-right font-mono">₱{landed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                        <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900">₱{extCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Table 2: Managed Overhead Items */}
                            {versionOverheadItems.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1">
                                        2. Overhead Management Allocation Items
                                    </h3>
                                    <table className="w-full text-left text-[11px] border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100 border-b border-slate-300 text-[9px] uppercase font-bold text-slate-700">
                                                <th className="py-2 px-2">Overhead Item Name</th>
                                                <th className="py-2 px-2">Remarks / Notes</th>
                                                <th className="py-2 px-2 text-center">Status</th>
                                                <th className="py-2 px-2 text-right">Cost Per Unit (₱)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {versionOverheadItems.map((oh, idx) => (
                                                <tr key={idx}>
                                                    <td className="py-1.5 px-2 font-semibold text-slate-900">{oh.overhead_name}</td>
                                                    <td className="py-1.5 px-2 text-slate-500 text-[10px]">{oh.remarks || "—"}</td>
                                                    <td className="py-1.5 px-2 text-center text-[9px] uppercase font-bold text-emerald-700">
                                                        {oh.is_active !== false ? "Active" : "Inactive"}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right font-mono font-bold">₱{(Number(oh.cost_per_unit || oh.cost || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Sign-off & Approval Blocks */}
                            <div className="pt-8 border-t border-slate-300 grid grid-cols-3 gap-6 text-[10px] text-slate-600">
                                <div className="space-y-8">
                                    <p className="uppercase font-bold text-slate-700">Prepared By (Cost Accountant):</p>
                                    <div className="border-b border-slate-400 w-full" />
                                    <p className="text-[9px] text-slate-400">Signature over printed name</p>
                                </div>
                                <div className="space-y-8">
                                    <p className="uppercase font-bold text-slate-700">Reviewed By (Plant Manager):</p>
                                    <div className="border-b border-slate-400 w-full" />
                                    <p className="text-[9px] text-slate-400">Signature over printed name</p>
                                </div>
                                <div className="space-y-8">
                                    <p className="uppercase font-bold text-slate-700">Approved By (Finance VP):</p>
                                    <div className="border-b border-slate-400 w-full" />
                                    <p className="text-[9px] text-slate-400">Signature over printed name</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="px-6 py-3 border-t bg-muted/20 flex justify-end gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border rounded-lg text-xs font-semibold hover:bg-muted text-muted-foreground transition-all cursor-pointer"
                        >
                            Close Preview
                        </button>
                        <button
                            type="button"
                            onClick={handleTriggerPrint}
                            className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg text-xs hover:bg-primary/95 transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                        >
                            <Printer className="h-4 w-4" /> Print / Save as PDF
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};
