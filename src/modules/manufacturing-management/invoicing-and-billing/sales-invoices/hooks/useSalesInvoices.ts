"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SalesInvoiceHeader, SalesInvoiceDetail, FMInvoiceMetrics, SalesmanOption } from "../types";
import { fetchSalesInvoices, fetchSalesInvoiceDetails } from "../services/sales-invoices-api";

export function useSalesInvoices() {
    const [invoices, setInvoices] = useState<SalesInvoiceHeader[]>([]);
    const [salesmen, setSalesmen] = useState<SalesmanOption[]>([]);
    const [detailsMap, setDetailsMap] = useState<Record<number, SalesInvoiceDetail[]>>({});
    const [loading, setLoading] = useState<boolean>(true);
    const [loadingDetails, setLoadingDetails] = useState<Record<number, boolean>>({});

    const loadInvoices = useCallback(async () => {
        setLoading(true);
        try {
            const { data, salesmen: salesmenData, detailsMap: initialMap } = await fetchSalesInvoices(false);
            setInvoices(data);
            if (salesmenData) setSalesmen(salesmenData);
            if (initialMap) setDetailsMap(initialMap);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to load FM sales invoice report.";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadInvoices();
    }, [loadInvoices]);

    const loadInvoiceDetails = useCallback(async (invoiceId: number) => {
        if (detailsMap[invoiceId]) return;
        setLoadingDetails((prev) => ({ ...prev, [invoiceId]: true }));
        try {
            const details = await fetchSalesInvoiceDetails(invoiceId);
            setDetailsMap((prev) => ({ ...prev, [invoiceId]: details }));
        } catch (err) {
            const msg = err instanceof Error ? err.message : `Failed to load details for Invoice #${invoiceId}.`;
            toast.error(msg);
        } finally {
            setLoadingDetails((prev) => ({ ...prev, [invoiceId]: false }));
        }
    }, [detailsMap]);

    const metrics = useMemo<FMInvoiceMetrics>(() => {
        return invoices.reduce<FMInvoiceMetrics>(
            (acc, inv) => {
                if (inv.status === "Cancelled") return acc;

                const net = Number(inv.net_amount || 0);
                const vat = Number(inv.vat_amount || 0);
                const paid = Number(inv.paid_amount || 0);

                acc.totalBilled += net;
                acc.totalVat += vat;
                acc.totalCollected += paid;
                acc.accountsReceivable += Math.max(0, net - paid);

                return acc;
            },
            { totalBilled: 0, totalCollected: 0, accountsReceivable: 0, totalVat: 0 }
        );
    }, [invoices]);

    const exportToCSV = useCallback((filteredData: SalesInvoiceHeader[]) => {
        if (filteredData.length === 0) {
            toast.error("No invoice report rows available to export.");
            return;
        }

        const headers = [
            "Invoice No",
            "Customer Code",
            "Customer Name",
            "Salesman",
            "TIN",
            "Invoice Date",
            "Due Date",
            "SO Reference",
            "Gross Amount",
            "VAT Amount",
            "Net Billed",
            "Amount Paid",
            "Balance",
            "Status",
        ];

        const rows = filteredData.map((inv) => [
            `"${inv.invoice_no}"`,
            `"${inv.customer_code}"`,
            `"${inv.customer_name.replace(/"/g, '""')}"`,
            `"${(inv.salesman_name || "Unassigned").replace(/"/g, '""')}"`,
            `"${inv.customer_tin || "N/A"}"`,
            `"${new Date(inv.invoice_date).toLocaleDateString()}"`,
            `"${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "N/A"}"`,
            `"${inv.sales_order_no || "Manual"}"`,
            inv.gross_amount.toFixed(2),
            inv.vat_amount.toFixed(2),
            inv.net_amount.toFixed(2),
            inv.paid_amount.toFixed(2),
            inv.balance.toFixed(2),
            `"${inv.status}"`,
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `FM_Sales_Invoice_Report_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("FM Sales Invoice Report exported to CSV successfully.");
    }, []);

    return {
        invoices,
        salesmen,
        detailsMap,
        loading,
        loadingDetails,
        metrics,
        loadInvoices,
        loadInvoiceDetails,
        exportToCSV,
    };
}
