"use client";

import * as React from "react";
import { toast } from "sonner";
import {
    createExpenseType,
    fetchExpenseTypeChartAccounts,
    fetchExpenseTypes,
    setExpenseTypeActive,
    updateExpenseType,
} from "../services/api";
import type { ExpenseType, ExpenseTypeChartAccount, ExpenseTypeFormValues, ExpenseTypeStatus } from "../types";

export function useExpenseTypes() {
    const [expenseTypes, setExpenseTypes] = React.useState<ExpenseType[]>([]);
    const [chartOfAccounts, setChartOfAccounts] = React.useState<ExpenseTypeChartAccount[]>([]);
    const [status, setStatus] = React.useState<ExpenseTypeStatus>("all");
    const [query, setQuery] = React.useState("");
    const [loading, setLoading] = React.useState(true);
    const [loadingAccounts, setLoadingAccounts] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const load = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setExpenseTypes(await fetchExpenseTypes(status, query));
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : "Failed to load Expense Types.";
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [query, status]);

    React.useEffect(() => {
        void load();
    }, [load]);

    React.useEffect(() => {
        let cancelled = false;
        void fetchExpenseTypeChartAccounts()
            .then(accounts => {
                if (!cancelled) setChartOfAccounts(accounts);
            })
            .catch(loadError => {
                if (!cancelled) toast.error(loadError instanceof Error ? loadError.message : "Failed to load eligible GL accounts.");
            })
            .finally(() => {
                if (!cancelled) setLoadingAccounts(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const save = React.useCallback(async (values: ExpenseTypeFormValues, editing: ExpenseType | null) => {
        setSaving(true);
        try {
            const saved = editing
                ? await updateExpenseType(editing.id, values)
                : await createExpenseType(values);
            toast.success(editing ? "Expense Type updated." : "Expense Type registered.");
            await load();
            return saved;
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : "Failed to save Expense Type.";
            toast.error(message);
            throw saveError;
        } finally {
            setSaving(false);
        }
    }, [load]);

    const toggleActive = React.useCallback(async (type: ExpenseType) => {
        setSaving(true);
        try {
            await setExpenseTypeActive(type.id, !type.isActive, type);
            toast.success(type.isActive ? "Expense Type deactivated." : "Expense Type activated.");
            await load();
        } catch (toggleError) {
            toast.error(toggleError instanceof Error ? toggleError.message : "Failed to update Expense Type status.");
        } finally {
            setSaving(false);
        }
    }, [load]);

    return {
        expenseTypes,
        chartOfAccounts,
        status,
        setStatus,
        query,
        setQuery,
        loading,
        loadingAccounts,
        saving,
        error,
        reload: load,
        save,
        toggleActive,
    };
}
