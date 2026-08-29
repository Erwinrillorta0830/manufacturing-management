import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createInvoice, fetchInvoicingCandidates } from "../services/invoicing-api";
import { CreateInvoicePayload, CustomerGroup, InvoicingCandidate, InvoicingFilters } from "../types";

function groupByCustomer(candidates: InvoicingCandidate[]): CustomerGroup[] {
    const map = new Map<string, CustomerGroup>();
    for (const order of candidates) {
        const key = order.customer_code || "UNKNOWN";
        let group = map.get(key);
        if (!group) {
            group = { customer_code: key, customer_name: order.customer_name, order_count: 0, total_amount: 0, orders: [] };
            map.set(key, group);
        }
        group.orders.push(order);
        group.order_count++;
        group.total_amount += Number(order.net_amount || order.total_amount || 0);
    }
    return [...map.values()].sort((a, b) => a.customer_name.localeCompare(b.customer_name));
}

export function useInvoicing() {
    const [candidates, setCandidates] = useState<InvoicingCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [filters, setFilters] = useState<InvoicingFilters>({ search: "", customerCode: "", branchId: "", dateFrom: "", dateTo: "" });

    const refresh = useCallback(async (f?: Partial<InvoicingFilters>) => {
        setLoading(true);
        try {
            setCandidates(await fetchInvoicingCandidates(f));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load invoicing candidates");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const applyFilters = (patch: Partial<InvoicingFilters>) => {
        const next = { ...filters, ...patch };
        setFilters(next);
        void refresh(next);
    };

    const resetFilters = () => {
        const cleared: InvoicingFilters = { search: "", customerCode: "", branchId: "", dateFrom: "", dateTo: "" };
        setFilters(cleared);
        void refresh(cleared);
    };

    const groups = useMemo(() => groupByCustomer(candidates), [candidates]);
    const customerCount = groups.length;
    const orderCount = candidates.length;
    const totalInvoiceValue = candidates.reduce((sum, c) => sum + Number(c.net_amount || c.total_amount || 0), 0);

    const submit = async (payload: CreateInvoicePayload) => {
        setSubmitting(true);
        try {
            const created = await createInvoice(payload);
            toast.success(`Invoice ${payload.invoiceNo} created successfully`);
            void refresh(filters);
            return created;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create invoice");
            return null;
        } finally {
            setSubmitting(false);
        }
    };

    return { candidates, groups, filters, loading, submitting, customerCount, orderCount, totalInvoiceValue, refresh, applyFilters, resetFilters, submit };
}
