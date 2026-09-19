import React from "react";

interface QAProductItemsAllocationTableProps {
    index: number;
    brandName: string;
    productName: string;
    productCode?: string;
    uomName: string;
    currencyCode: "PHP" | "USD";
    unitPrice: number;
    totalAmount: number;
    quantity: number;
    action: React.ReactNode;
}

function formatCurrency(value: number, currencyCode: "PHP" | "USD") {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
}

function formatQuantity(value: number) {
    return (Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
        maximumFractionDigits: 6,
    });
}

export default function QAProductItemsAllocationTable({
    index,
    brandName,
    productName,
    productCode,
    uomName,
    currencyCode,
    unitPrice,
    totalAmount,
    quantity,
    action,
}: QAProductItemsAllocationTableProps) {
    return (
        <div className="overflow-x-auto rounded-lg border border-border/50 bg-card" data-testid="qa-product-items-table">
            <table className="w-full min-w-[900px] text-left">
                <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <tr>
                        <th scope="col" className="w-12 p-3 text-center">#</th>
                        <th scope="col" className="p-3">Brand</th>
                        <th scope="col" className="min-w-[250px] p-3">Product Name</th>
                        <th scope="col" className="p-3">UOM</th>
                        <th scope="col" className="p-3 text-right">Price</th>
                        <th scope="col" className="p-3 text-right">Total Amount</th>
                        <th scope="col" className="p-3 text-right">Quantity</th>
                        <th scope="col" className="min-w-[170px] p-3 text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="border-t border-border/50 align-top transition-colors hover:bg-muted/10">
                        <td className="p-3 text-center text-xs font-bold text-muted-foreground">{index}</td>
                        <td className="p-3 text-xs font-bold text-foreground">{brandName || "—"}</td>
                        <td className="p-3">
                            <div className="flex min-w-0 flex-col">
                                <span className="text-xs font-bold leading-tight text-foreground">{productName || "—"}</span>
                                <span className="mt-1 text-[10px] text-muted-foreground font-mono">{productCode || "—"}</span>
                            </div>
                        </td>
                        <td className="p-3">
                            <span className="whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary dark:bg-blue-900/20">
                                {uomName || "—"}
                            </span>
                        </td>
                        <td className="whitespace-nowrap p-3 text-right text-xs font-bold text-foreground">
                            {formatCurrency(unitPrice, currencyCode)}
                        </td>
                        <td className="whitespace-nowrap p-3 text-right text-xs font-bold text-primary dark:text-primary/70">
                            {formatCurrency(totalAmount, currencyCode)}
                        </td>
                        <td className="whitespace-nowrap p-3 text-right">
                            <span className="inline-flex min-w-[5rem] justify-end rounded-md border border-border/50 bg-muted px-3 py-1 text-xs font-bold tabular-nums">
                                {formatQuantity(quantity)}
                            </span>
                        </td>
                        <td className="p-3 text-right">{action}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
