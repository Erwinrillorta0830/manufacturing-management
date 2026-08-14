"use client";

import React from "react";
import { Printer, Download, X } from "lucide-react";
import { PhysicalCountSheet } from "../types";
import { formatDate } from "../utils";
import { downloadPhysicalCountSheetPDF } from "../utils/exportPhysicalCountSheetPDF";

interface PrintableCountSheetProps {
    sheet: PhysicalCountSheet;
    onClose: () => void;
}

export default function PrintableCountSheet({ sheet, onClose }: PrintableCountSheetProps) {
    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPDF = () => {
        downloadPhysicalCountSheetPDF(sheet);
    };

    const isFG = sheet.inventory_type === "Finished Goods" || sheet.stock_type?.includes("Finished");

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
                {/* Company & Document Header */}
                <div className="border-b-2 border-black pb-4 mb-6 flex items-start justify-between">
                    <div>
                        <h1 className="text-xl font-black tracking-wider uppercase">Vertex Tech Corp • VOS ERP</h1>
                        <h2 className="text-sm font-bold text-gray-700 tracking-tight mt-0.5">PHYSICAL INVENTORY AUDIT COUNT SHEET</h2>
                        <p className="text-[10px] text-gray-500 mt-1">Official Warehouse Floor Verification & Stock Audit Document</p>
                    </div>
                    <div className="text-right font-mono">
                        <div className="text-base font-black">#{sheet.ph_no || sheet.sheet_no}</div>
                        <div className="text-[10px] text-gray-600 mt-1">Status: {sheet.status || "IN PROGRESS"}</div>
                    </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-3 gap-4 border border-gray-300 rounded-lg p-3.5 mb-6 text-[11px] bg-gray-50 print:bg-transparent">
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[9px]">Branch / Facility</span>
                        <span className="font-extrabold">{sheet.branch_name}</span>
                    </div>
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[9px]">Inventory Classification</span>
                        <span className="font-bold">{sheet.inventory_type || "Finished Goods"} ({sheet.stock_type || "Good Stock"})</span>
                    </div>
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[9px]">Encoder / Auditor</span>
                        <span className="font-bold">{sheet.encoder_name || "Warehouse Auditor"}</span>
                    </div>
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[9px]">Counting Start Timestamp</span>
                        <span className="font-mono">{formatDate(sheet.starting_date)}</span>
                    </div>
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[9px]">Cut-Off Timestamp (Frozen Baseline)</span>
                        <span className="font-mono">{formatDate(sheet.cutOff_date || sheet.cutoff_date)}</span>
                    </div>
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[9px]">Total Population</span>
                        <span className="font-bold font-mono">{(sheet.line_items || []).length} SKUs Listed</span>
                    </div>
                </div>

                {/* Line Items Table */}
                <table className="w-full border-collapse border border-gray-400 text-[10px] mb-8">
                    <thead>
                        <tr className="bg-gray-200 text-black font-bold uppercase border-b border-gray-400">
                            <th className="border border-gray-400 p-2 text-left w-10">#</th>
                            <th className="border border-gray-400 p-2 text-left">SKU Code & Product Description</th>
                            <th className="border border-gray-400 p-2 text-left">Location Bin</th>
                            {isFG && <th className="border border-gray-400 p-2 text-left">Version</th>}
                            <th className="border border-gray-400 p-2 text-center w-14">UOM</th>
                            <th className="border border-gray-400 p-2 text-right w-20">System Qty</th>
                            <th className="border border-gray-400 p-2 text-center w-28 bg-gray-100">Physical Count (Pen Entry)</th>
                            <th className="border border-gray-400 p-2 text-left w-28">Auditor Remarks / Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(sheet.line_items || []).map((item, idx) => {
                            const pName = typeof item.product_id === "object"
                                ? (item.product_id?.product_name || item.product_name || "Product")
                                : (item.product_name || "Product");

                            const pCode = typeof item.product_id === "object"
                                ? (item.product_id?.product_code || item.product_code || "")
                                : (item.product_code || "");

                            const lName = typeof item.lot_id === "object"
                                ? (item.lot_id?.lot_name || "Main Storage")
                                : "Main Storage";

                            const vName = typeof item.version_id === "object"
                                ? (item.version_id?.version_name || item.version_id?.version_code || "v1.0")
                                : "v1.0";

                            return (
                                <tr key={item.id || idx} className="border-b border-gray-300">
                                    <td className="border border-gray-300 p-2 text-center font-mono">{idx + 1}</td>
                                    <td className="border border-gray-300 p-2">
                                        <div className="font-bold">{pName}</div>
                                        {pCode && <div className="text-[9px] text-gray-600 font-mono">CODE: {pCode}</div>}
                                    </td>
                                    <td className="border border-gray-300 p-2 font-medium">{lName}</td>
                                    {isFG && <td className="border border-gray-300 p-2 font-mono text-[9px]">{vName}</td>}
                                    <td className="border border-gray-300 p-2 text-center uppercase font-mono">{item.uom || "PCS"}</td>
                                    <td className="border border-gray-300 p-2 text-right font-mono font-bold">
                                        {(item.system_count || 0).toLocaleString()}
                                    </td>
                                    <td className="border border-gray-300 p-2 text-center bg-gray-50/50">
                                        <div className="h-6 border-b border-dashed border-gray-400 font-mono font-bold text-sm">
                                            {item.physical_count !== null && item.physical_count !== undefined ? item.physical_count : ""}
                                        </div>
                                    </td>
                                    <td className="border border-gray-300 p-2 text-[9px] text-gray-500">
                                        {item.remarks || ""}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Sign-Off Authorization Block */}
                <div className="grid grid-cols-3 gap-6 pt-6 border-t-2 border-black">
                    <div className="space-y-8">
                        <span className="font-bold text-[10px] text-gray-600 block uppercase">Counted / Audited By:</span>
                        <div className="border-b border-black w-full" />
                        <span className="text-[9px] text-gray-500 block text-center">Floor Inventory Auditor Signature & Date</span>
                    </div>

                    <div className="space-y-8">
                        <span className="font-bold text-[10px] text-gray-600 block uppercase">Verified By:</span>
                        <div className="border-b border-black w-full" />
                        <span className="text-[9px] text-gray-500 block text-center">Warehouse Supervisor Signature & Date</span>
                    </div>

                    <div className="space-y-8">
                        <span className="font-bold text-[10px] text-gray-600 block uppercase">Approved By:</span>
                        <div className="border-b border-black w-full" />
                        <span className="text-[9px] text-gray-500 block text-center">Operations / Plant Manager Signature & Date</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
