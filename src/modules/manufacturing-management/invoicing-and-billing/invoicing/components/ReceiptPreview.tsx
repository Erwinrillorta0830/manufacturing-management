"use client";

import { PrintableInvoice } from "../types";

const money = (value: number) => new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

function date(value: string) {
    if (!value) return "";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
}

export function ReceiptPreview({ invoice, scale = 1 }: { invoice: PrintableInvoice; template?: unknown; scale?: number; showBackground?: boolean }) {
    // BIR Charge Invoice HTML Structure
    const companyName = invoice.companyInfo?.companyName || "MEN2 MARKETING & DISTRIBUTION ENTERPRISE CORPORATION";
    const companyTin = invoice.companyInfo?.companyTin ? `VAT REG. TIN: ${invoice.companyInfo.companyTin}` : "VAT REG. TIN: 009-553-391-00000";
    const companyAddress = invoice.companyInfo?.companyAddress || "Gonzales, Bonuan Boquig, Dagupan City, Pangasinan";
    const docTitle = (invoice.receiptType?.type || "CHARGE INVOICE").toUpperCase();

    const netTotal = invoice.totals?.net || invoice.totals?.gross || 0;
    const vatableSales = netTotal / 1.12;
    const vatAmount = netTotal - vatableSales;

    const displayLines = [...(invoice.lines || [])];
    const minRows = 10;
    while (displayLines.length < minRows) {
        displayLines.push({
            detailId: -displayLines.length,
            productCode: "",
            productName: "",
            quantity: 0,
            unit: "",
            unitPrice: 0,
            discountAmount: 0,
            grossAmount: 0,
            netAmount: 0,
        });
    }

    return (
        <div
            className="origin-top-left bg-white text-black shadow-xl p-5 font-sans text-xs flex flex-col justify-between border-2 border-black rounded-xs"
            style={{ width: `210mm`, minHeight: `265mm`, transform: `scale(${scale})` }}
        >
            <div className="space-y-3">
                {/* 1. Company Letterhead */}
                <div className="text-center space-y-0.5">
                    <h1 className="text-base font-black uppercase tracking-wide">{companyName}</h1>
                    <p className="text-[10px] font-bold text-gray-800">{companyTin}</p>
                    <p className="text-[10px] text-gray-700">{companyAddress}</p>
                </div>

                {/* 2. Subheader (Charge Invoice & Invoice No) */}
                <div className="flex items-center justify-between border-b-2 border-black pb-2 pt-1">
                    <h2 className="text-sm font-black tracking-wider uppercase">{docTitle}</h2>
                    <div>
                        <span className="text-sm font-black text-red-600 tracking-wider">{invoice.invoiceNo}</span>
                    </div>
                </div>

                {/* 3. Customer Info Block */}
                <div className="border border-black p-2.5 grid grid-cols-12 gap-y-1.5 text-[11px] leading-tight bg-gray-50/50">
                    <div className="col-span-8 flex gap-1">
                        <span className="font-bold shrink-0">SOLD TO:</span>
                        <span className="font-semibold uppercase truncate">{invoice.customerName || "N/A"}</span>
                    </div>
                    <div className="col-span-4 flex gap-1 justify-end">
                        <span className="font-bold shrink-0">Date:</span>
                        <span className="font-medium">{date(invoice.invoiceDate) || "N/A"}</span>
                    </div>

                    <div className="col-span-8 flex gap-1">
                        <span className="font-bold shrink-0">Registered Name:</span>
                        <span className="font-semibold uppercase truncate">{invoice.storeName || invoice.customerName || "N/A"}</span>
                    </div>
                    <div className="col-span-4 flex gap-1 justify-end">
                        <span className="font-bold shrink-0">Terms:</span>
                        <span className="font-medium">{invoice.paymentTermName || "N/A"}</span>
                    </div>

                    <div className="col-span-12 flex gap-1">
                        <span className="font-bold shrink-0">TIN:</span>
                        <span className="font-medium">{invoice.customerTin || "N/A"}</span>
                    </div>

                    <div className="col-span-12 flex gap-1">
                        <span className="font-bold shrink-0">Business Address:</span>
                        <span className="font-medium uppercase truncate">{invoice.customerAddress || "N/A"}</span>
                    </div>
                </div>

                {/* 4. Tabular Item Grid */}
                <div className="border border-black overflow-hidden">
                    <table className="w-full text-[10px] border-collapse">
                        <thead>
                            <tr className="border-b border-black bg-gray-100 font-bold text-center">
                                <th className="p-1.5 text-left border-r border-black w-[52%]">Item Description / Nature of Service</th>
                                <th className="p-1.5 border-r border-black w-[18%]">Quantity</th>
                                <th className="p-1.5 text-right border-r border-black w-[15%]">Unit Cost/Price</th>
                                <th className="p-1.5 text-right w-[15%]">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-300">
                            {displayLines.map((line, idx) => (
                                <tr key={idx} className="h-6">
                                    <td className="p-1.5 border-r border-black font-medium">
                                        {line.productName ? (
                                            <div>
                                                <span>{line.productName}</span>
                                                {line.productCode ? <span className="block text-[9px] text-gray-500 font-mono">{line.productCode}</span> : null}
                                            </div>
                                        ) : (
                                            " "
                                        )}
                                    </td>
                                    <td className="p-1.5 border-r border-black text-center font-bold">
                                        {line.quantity > 0 ? `${line.quantity} ${line.unit || "PCS"}` : ""}
                                    </td>
                                    <td className="p-1.5 border-r border-black text-right font-mono">
                                        {line.quantity > 0 ? `₱${money(line.unitPrice)}` : ""}
                                    </td>
                                    <td className="p-1.5 text-right font-mono font-bold">
                                        {line.quantity > 0 ? `₱${money(line.netAmount)}` : ""}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 5. Footer & Tax Computation Block */}
                <div className="border border-black grid grid-cols-2 text-[10px]">
                    {/* Left Column Breakdown */}
                    <div className="border-r border-black divide-y divide-black">
                        <div className="p-1 flex justify-between">
                            <span>VATable Sales</span>
                            <span className="font-mono font-bold">₱{money(vatableSales)}</span>
                        </div>
                        <div className="p-1 flex justify-between">
                            <span>VAT</span>
                            <span className="font-mono font-bold">₱{money(vatAmount)}</span>
                        </div>
                        <div className="p-1 flex justify-between">
                            <span>Zero-Rated Sales</span>
                            <span className="font-mono font-bold">₱0.00</span>
                        </div>
                        <div className="p-1 flex justify-between">
                            <span>VAT-Exempt Sales</span>
                            <span className="font-mono font-bold">₱0.00</span>
                        </div>
                        <div className="p-1 font-bold">
                            PO NO. : <span className="font-mono font-normal">{invoice.poNo || "N/A"}</span>
                        </div>
                        <div className="p-1 font-bold">
                            SALESMAN : <span className="font-normal">{invoice.salesmanName || "N/A"}</span>
                        </div>
                    </div>

                    {/* Right Column Breakdown */}
                    <div className="divide-y divide-black">
                        <div className="p-1 flex justify-between">
                            <span>Total Sales (VAT Inclusive)</span>
                            <span className="font-mono font-bold">₱{money(netTotal)}</span>
                        </div>
                        <div className="p-1 flex justify-between">
                            <span>Less: VAT</span>
                            <span className="font-mono font-bold">₱{money(vatAmount)}</span>
                        </div>
                        <div className="p-1 flex justify-between">
                            <span>Amount: Net of VAT</span>
                            <span className="font-mono font-bold">₱{money(vatableSales)}</span>
                        </div>
                        <div className="p-1 flex justify-between">
                            <span>Add: VAT</span>
                            <span className="font-mono font-bold">₱{money(vatAmount)}</span>
                        </div>
                        <div className="p-1 flex justify-between">
                            <span>Less: Withholding Tax</span>
                            <span className="font-mono font-bold">₱0.00</span>
                        </div>
                        <div className="p-1 flex justify-between font-black bg-gray-100">
                            <span>TOTAL AMOUNT DUE</span>
                            <span className="font-mono text-sm">₱{money(netTotal)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 6. Signatures & BIR Footnote */}
            <div className="pt-4 flex items-end justify-between text-[9px] border-t border-gray-300">
                <div className="space-y-0.5 text-gray-600">
                    
                </div>

                <div className="text-center space-y-1">
                    <div className="w-56 border-b border-black mx-auto"></div>
                    <p className="font-bold uppercase text-[10px]">Cashier / Authorized Representative</p>
                    <p className="text-[8px] text-gray-600">Printer&apos;s Accreditation No. 004MP2024000000033 · Date Issued: 03-14-2024</p>
                </div>
            </div>
        </div>
    );
}
