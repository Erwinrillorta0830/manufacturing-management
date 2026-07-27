"use client";

import Image from "next/image";
import Barcode from "react-barcode";
import { receiptBackgroundUrl } from "../services/invoicing-api";
import { ORTemplate, PrintableInvoice } from "../types";

const money = (value: number) => new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

function date(value: string) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
}

export function ReceiptPreview({ invoice, template, scale = 1, showBackground = true }: { invoice: PrintableInvoice; template: ORTemplate; scale?: number; showBackground?: boolean }) {
    const values: Record<string, string> = {
        customer_name: invoice.customerName.toUpperCase(),
        date: date(invoice.invoiceDate),
        store_name: invoice.storeName.toUpperCase(),
        payment_name: invoice.paymentTermName.toUpperCase(),
        customer_tin: invoice.customerTin || "N/A",
        address: invoice.customerAddress.toUpperCase(),
        vatable_sales: money(invoice.totals.net - invoice.totals.vat),
        vat_amount: money(invoice.totals.vat),
        gross_total: money(invoice.totals.gross),
        discount_total: money(invoice.totals.discount),
        net_total: money(invoice.totals.net),
        po_no: `PO NO. : ${invoice.poNo || "N/A"}`,
        salesman: `SALESMAN : ${invoice.salesmanName}`,
        total_amount_due: money(invoice.totals.net),
        zero_rated: "0.00",
        exempt: "0.00",
        withholding_tax: "0.00",
    };
    const columns = template.tableSettings.columns;

    return <div className="origin-top-left bg-white text-black shadow-xl" style={{ width: `${template.width}mm`, height: `${template.height}mm`, transform: `scale(${scale})`, position: "relative", overflow: "hidden" }}>
        {showBackground && template.backgroundImage ? <Image src={receiptBackgroundUrl(template.backgroundImage)} alt="Receipt form" fill unoptimized className="pointer-events-none select-none object-fill" /> : null}
        {Object.entries(template.fields).map(([key, config]) => {
            if (config.hidden && key !== "barcode") return null;
            if (key === "barcode") return config.hidden && config.hideBarcodeText ? null : <div key={key} className="absolute" style={{ left: `${config.x}mm`, top: `${config.y}mm` }}>
                {!config.hidden ? <Barcode value={invoice.invoiceNo || "PREVIEW"} height={(config.barcodeHeight || 9) * 3.78} width={(config.barcodeModuleWidth || 0.35) * 3.78} fontSize={config.fontSize || 8} displayValue={!config.hideBarcodeText} margin={0} background="transparent" /> : invoice.invoiceNo}
            </div>;
            const value = values[key];
            if (value === undefined) return null;
            return <div key={key} className={config.maxWidth ? "absolute whitespace-pre-wrap" : "absolute whitespace-nowrap"} style={{ left: `${config.x}mm`, top: `${config.y}mm`, width: config.maxWidth ? `${config.maxWidth}mm` : undefined, fontFamily: config.fontFamily === "courier" ? "monospace" : config.fontFamily, fontSize: `${config.fontSize || 10}pt`, fontWeight: config.fontWeight, letterSpacing: `${config.charSpacing || 0}pt`, lineHeight: config.lineHeight || 1.2, transform: `scaleX(${config.scaleX || 1})`, transformOrigin: "left top" }}>{value}</div>;
        })}
        {invoice.lines.map((line, index) => {
            const y = template.tableSettings.startY + index * template.tableSettings.rowHeight;
            const size = `${template.tableSettings.fontSize}pt`;
            return <div key={line.detailId} className="absolute left-0 w-full font-mono" style={{ top: `${y}mm`, height: `${template.tableSettings.rowHeight}mm`, fontSize: size }}>
                {columns?.barcode ? <span className="absolute" style={{ left: `${columns.barcode.x}mm` }}>{line.productCode}</span> : null}
                <span className="absolute whitespace-normal" style={{ left: `${columns?.product_name?.x || 10}mm`, width: `${template.tableSettings.product_name_width || 65}mm` }}>{line.productName}</span>
                <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${columns?.quantity?.x || 105}mm` }}>{line.quantity} {line.unit}</span>
                <span className="absolute -translate-x-full whitespace-nowrap" style={{ left: `${columns?.unit_price?.x || 126}mm` }}>{money(line.unitPrice)}</span>
                <span className="absolute -translate-x-full whitespace-nowrap" style={{ left: `${columns?.discount?.x || 153}mm` }}>{line.discountAmount ? money(line.discountAmount) : ""}</span>
                <span className="absolute -translate-x-full whitespace-nowrap" style={{ left: `${columns?.net_amount?.x || 184}mm` }}>{money(line.netAmount)}</span>
            </div>;
        })}
    </div>;
}
