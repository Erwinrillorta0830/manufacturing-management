"use client";

import React from "react";
import { Printer, Download, X } from "lucide-react";
import { PhysicalCountSheet, OffsetPairing } from "../types";
import { formatCurrency, formatDate } from "../utils";
import { downloadOffsettingReportPDF } from "../utils/exportOffsettingReportPDF";

interface PrintableOffsettingReportProps {
    sheet: PhysicalCountSheet;
    pairings: OffsetPairing[];
    onClose: () => void;
}

export default function PrintableOffsettingReport({
    sheet,
    pairings,
    onClose
}: PrintableOffsettingReportProps) {
    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPDF = () => {
        downloadOffsettingReportPDF(sheet, pairings);
    };

    // Calculate Summary Metrics
    let grossShortageValuation = 0;
    let grossSurplusValuation = 0;

    (sheet.line_items || []).forEach(item => {
        const sys = item.system_count || 0;
        const phys = item.physical_count !== null ? item.physical_count : sys;
        const rawVar = item.variance !== undefined ? item.variance : (phys - sys);
        const factor = item.uom_factor || 1;
        const baseVar = item.variance_base !== undefined ? item.variance_base : (rawVar * factor);
        const price = item.unit_price || 0;

        if (baseVar < 0) {
            grossShortageValuation += Math.abs(baseVar * price);
        } else if (baseVar > 0) {
            grossSurplusValuation += baseVar * price;
        }
    });

    const totalOffsetQty = pairings.reduce((sum, p) => sum + p.offset_qty, 0);
    const remainingNetImpact = grossSurplusValuation - grossShortageValuation;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/90 backdrop-blur-xs overflow-y-auto">
            {/* Top Toolbar (Hidden during print) */}
            <div className="fixed top-4 right-4 z-50 flex items-center gap-2 print:hidden">
                <button
                    onClick={handleDownloadPDF}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-bold text-xs rounded-xl shadow-lg hover:scale-105 transition-all"
                >
                    <Download className="h-4 w-4" />
                    Download PDF
                </button>
                <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-foreground font-bold text-xs rounded-xl shadow-lg hover:scale-105 transition-all border border-border"
                >
                    <Printer className="h-4 w-4" />
                    Print
                </button>
                <button
                    onClick={onClose}
                    className="p-2.5 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground shadow-lg transition-all"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Printable Paper Document */}
            <div className="bg-white text-black w-full max-w-4xl p-8 rounded-xl shadow-2xl print:shadow-none print:p-0 print:m-0 my-auto text-xs font-sans">
                {/* Header */}
                <div className="border-b-2 border-black pb-4 mb-6 flex items-start justify-between">
                    <div>
                        <h1 className="text-xl font-black tracking-wider uppercase">Vertex Tech Corp • VOS ERP</h1>
                        <h2 className="text-sm font-bold text-gray-700 tracking-tight mt-0.5">INVENTORY OFFSETTING & RECONCILIATION REPORT</h2>
                        <p className="text-[10px] text-gray-500 mt-1">Official Post-Audit Variance Neutralization & Offsetting Journal Breakdown</p>
                    </div>
                    <div className="text-right font-mono">
                        <div className="text-base font-black">REF: #{sheet.ph_no || sheet.sheet_no}</div>
                        <div className="text-[10px] text-gray-600 mt-1">Report Date: {formatDate(new Date().toISOString())}</div>
                    </div>
                </div>

                {/* Metadata Card */}
                <div className="grid grid-cols-3 gap-4 border border-gray-300 rounded-lg p-3.5 mb-6 text-[11px] bg-gray-50 print:bg-transparent">
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[9px]">Branch / Location</span>
                        <span className="font-extrabold">{sheet.branch_name}</span>
                    </div>
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[9px]">Audit Period</span>
                        <span className="font-mono text-[10px]">{formatDate(sheet.starting_date)} &rarr; {formatDate(sheet.cutOff_date)}</span>
                    </div>
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[9px]">Inventory Classification</span>
                        <span className="font-bold">{sheet.inventory_type || "Finished Goods"} ({sheet.stock_type || "Good Stock"})</span>
                    </div>
                </div>

                {/* Matched Pairings Matrix */}
                <div className="mb-6">
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2 text-gray-800">1. Reconciled Offsetting Pairings</h3>
                    <table className="w-full border-collapse border border-gray-400 text-[10px]">
                        <thead>
                            <tr className="bg-gray-200 text-black font-bold uppercase border-b border-gray-400">
                                <th className="border border-gray-400 p-2 text-left w-14">Pair ID</th>
                                <th className="border border-gray-400 p-2 text-left">Shortage SKU Target</th>
                                <th className="border border-gray-400 p-2 text-left">Surplus SKU Source</th>
                                <th className="border border-gray-400 p-2 text-right w-18">Offset Qty</th>
                                <th className="border border-gray-400 p-2 text-right w-20">Price Delta</th>
                                <th className="border border-gray-400 p-2 text-right w-24">Net Financial Impact</th>
                                <th className="border border-gray-400 p-2 text-left w-32">Reason Code</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pairings.length > 0 ? (
                                pairings.map(pair => (
                                    <tr key={pair.id} className="border-b border-gray-300">
                                        <td className="border border-gray-300 p-2 font-mono font-bold">{pair.id}</td>
                                        <td className="border border-gray-300 p-2">
                                            <div className="font-bold text-red-700">{pair.shortage_product_name}</div>
                                            <div className="text-[9px] text-gray-500 font-mono">{pair.shortage_product_code}</div>
                                        </td>
                                        <td className="border border-gray-300 p-2">
                                            <div className="font-bold text-green-700">{pair.surplus_product_name}</div>
                                            <div className="text-[9px] text-gray-500 font-mono">{pair.surplus_product_code}</div>
                                        </td>
                                        <td className="border border-gray-300 p-2 text-right font-mono font-bold">
                                            {pair.offset_qty.toLocaleString()}
                                        </td>
                                        <td className="border border-gray-300 p-2 text-right font-mono">
                                            {formatCurrency(pair.unit_price_variance)}
                                        </td>
                                        <td className="border border-gray-300 p-2 text-right font-mono font-bold">
                                            {formatCurrency(pair.net_financial_impact)}
                                        </td>
                                        <td className="border border-gray-300 p-2 text-[9px] font-semibold">
                                            {pair.reason_code}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="border border-gray-300 p-4 text-center text-gray-500">
                                        No reciprocal offset pairings recorded for this transaction.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Financial Summary Box */}
                <div className="mb-8 p-4 border border-gray-400 rounded-lg bg-gray-50 print:bg-transparent">
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-3 text-gray-800">2. Financial Offsetting Summary</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                        <div className="p-2 border border-gray-300 rounded bg-white print:bg-transparent">
                            <span className="text-[9px] font-bold text-gray-500 block uppercase">Gross Shortage Value</span>
                            <span className="text-xs font-mono font-bold text-red-600 block mt-1">
                                -{formatCurrency(grossShortageValuation)}
                            </span>
                        </div>

                        <div className="p-2 border border-gray-300 rounded bg-white print:bg-transparent">
                            <span className="text-[9px] font-bold text-gray-500 block uppercase">Gross Surplus Value</span>
                            <span className="text-xs font-mono font-bold text-green-600 block mt-1">
                                +{formatCurrency(grossSurplusValuation)}
                            </span>
                        </div>

                        <div className="p-2 border border-gray-300 rounded bg-white print:bg-transparent">
                            <span className="text-[9px] font-bold text-gray-500 block uppercase">Total Offset Qty</span>
                            <span className="text-xs font-mono font-bold text-blue-600 block mt-1">
                                {totalOffsetQty.toLocaleString()} Units
                            </span>
                        </div>

                        <div className="p-2 border border-gray-300 rounded bg-white print:bg-transparent">
                            <span className="text-[9px] font-bold text-gray-500 block uppercase">Remaining Net to Ledger</span>
                            <span className={`text-xs font-mono font-black block mt-1 ${remainingNetImpact >= 0 ? "text-green-700" : "text-red-700"}`}>
                                {formatCurrency(remainingNetImpact)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Three-party Sign-off Block */}
                <div className="grid grid-cols-3 gap-6 pt-6 border-t-2 border-black">
                    <div className="space-y-8">
                        <span className="font-bold text-[10px] text-gray-600 block uppercase">1. INVENTORY AUDITOR:</span>
                        <div className="border-b border-black w-full" />
                        <span className="text-[9px] text-gray-500 block text-center">Auditor Signature & Date</span>
                    </div>

                    <div className="space-y-8">
                        <span className="font-bold text-[10px] text-gray-600 block uppercase">2. WAREHOUSE MANAGER:</span>
                        <div className="border-b border-black w-full" />
                        <span className="text-[9px] text-gray-500 block text-center">Manager Signature & Date</span>
                    </div>

                    <div className="space-y-8">
                        <span className="font-bold text-[10px] text-gray-600 block uppercase">3. FINANCE / ACCOUNTING:</span>
                        <div className="border-b border-black w-full" />
                        <span className="text-[9px] text-gray-500 block text-center">Approver Signature & Date</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
