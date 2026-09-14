"use client";

import * as React from "react";
import { AlertCircle, BookOpen, CheckCircle2, Pencil, Plus, Power, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useExpenseTypes } from "./hooks/useExpenseTypes";
import type { ExpenseType, ExpenseTypeFormValues, ExpenseTypeStatus } from "./types";

type ExpenseTypeFormProps = {
    initialData: ExpenseType | null;
    accounts: ReturnType<typeof useExpenseTypes>["chartOfAccounts"];
    loadingAccounts: boolean;
    saving: boolean;
    onCancel: () => void;
    onSubmit: (values: ExpenseTypeFormValues) => Promise<void>;
};

function formatDate(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function accountLabel(type: ExpenseType): string {
    const account = type.chartOfAccount;
    if (!account) return "Unmapped";
    return `${account.glCode ? `[${account.glCode}] ` : ""}${account.accountTitle}`;
}

function ExpenseTypeForm({ initialData, accounts, loadingAccounts, saving, onCancel, onSubmit }: ExpenseTypeFormProps) {
    const [name, setName] = React.useState(initialData?.name || "");
    const [coaId, setCoaId] = React.useState(initialData?.coaId ? String(initialData.coaId) : "");
    const [description, setDescription] = React.useState(initialData?.description || "");
    const [isActive, setIsActive] = React.useState(initialData?.isActive ?? true);

    const accountOptions = React.useMemo(() => accounts.map(account => ({
        value: String(account.coaId),
        label: `${account.glCode ? `[${account.glCode}] ` : ""}${account.accountTitle} · ${account.accountTypeName}`,
    })), [accounts]);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!name.trim()) {
            toast.error("Expense Type name is required.");
            return;
        }
        if (isActive && !coaId) {
            toast.error("Select an eligible GL account before activating an Expense Type.");
            return;
        }
        await onSubmit({ name, coaId, description, isActive });
    };

    return (
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-primary/25 bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b pb-4">
                <div>
                    <h3 className="text-base font-bold">{initialData ? "Edit Expense Type" : "Register Expense Type"}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Every active type must resolve to an eligible General Ledger account.
                    </p>
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                    Administrator
                </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="expense-type-name">Expense Type Name *</Label>
                    <Input
                        id="expense-type-name"
                        value={name}
                        onChange={event => setName(event.target.value)}
                        placeholder="e.g. Freight / Logistics"
                        maxLength={150}
                        autoFocus
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="expense-type-coa">GL Account *</Label>
                    <SearchableSelect
                        options={accountOptions}
                        value={coaId}
                        onValueChange={setCoaId}
                        placeholder={loadingAccounts ? "Loading eligible accounts..." : "Search GL code or account..."}
                        disabled={loadingAccounts || saving}
                        className="h-10 text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">Only active expense-category accounts are listed.</p>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="expense-type-description">Description / Allocation Notes</Label>
                <textarea
                    id="expense-type-description"
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    placeholder="Describe when this expense type should be used."
                    maxLength={255}
                    rows={3}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                />
            </div>

            <label className="flex items-center gap-2 text-sm font-medium">
                <input
                    type="checkbox"
                    checked={isActive}
                    onChange={event => setIsActive(event.target.checked)}
                    className="h-4 w-4 rounded border"
                />
                Available for new transactions
            </label>

            <div className="flex justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving || loadingAccounts}>
                    {saving ? "Saving..." : initialData ? "Save Changes" : "Register Expense Type"}
                </Button>
            </div>
        </form>
    );
}

export default function ExpenseTypeRegistrationModule() {
    const {
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
        reload,
        save,
        toggleActive,
    } = useExpenseTypes();
    const [editing, setEditing] = React.useState<ExpenseType | null>(null);
    const [showForm, setShowForm] = React.useState(false);

    const openCreate = () => {
        setEditing(null);
        setShowForm(true);
    };

    const openEdit = (type: ExpenseType) => {
        setEditing(type);
        setShowForm(true);
    };

    const handleSave = async (values: ExpenseTypeFormValues) => {
        await save(values, editing);
        setShowForm(false);
        setEditing(null);
    };

    const handleToggle = async (type: ExpenseType) => {
        const action = type.isActive ? "deactivate" : "activate";
        if (!window.confirm(`Are you sure you want to ${action} ${type.name}?`)) return;
        await toggleActive(type);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                    <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-primary" />
                        <h2 className="text-2xl font-semibold tracking-tight">Expense Type Registration</h2>
                    </div>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                        Maintain the standardized expense catalog used to map landed costs, QA write-offs, and other accounting expenses to GL accounts.
                    </p>
                </div>
                <Button onClick={openCreate} className="shrink-0 rounded-xl">
                    <Plus className="mr-2 h-4 w-4" /> New Expense Type
                </Button>
            </div>

            {showForm && (
                <ExpenseTypeForm
                    key={`${editing?.id ?? "new"}-${showForm ? "open" : "closed"}`}
                    initialData={editing}
                    accounts={chartOfAccounts}
                    loadingAccounts={loadingAccounts}
                    saving={saving}
                    onCancel={() => { setShowForm(false); setEditing(null); }}
                    onSubmit={handleSave}
                />
            )}

            <div className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
                <div className="space-y-2">
                    <Label htmlFor="expense-type-search">Search Expense Types</Label>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="expense-type-search"
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Search by name or description..."
                            className="pl-9"
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="expense-type-status">Status</Label>
                    <select
                        id="expense-type-status"
                        value={status}
                        onChange={event => setStatus(event.target.value as ExpenseTypeStatus)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                        <option value="all">All statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
                <Button type="button" variant="outline" onClick={() => void reload()} disabled={loading || saving}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                </Button>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div>
                        <h3 className="text-sm font-bold">Standard Expense Catalog</h3>
                        <p className="text-xs text-muted-foreground">Inactive types remain available for historical audit but cannot be posted to new transactions.</p>
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">{loading ? "Loading..." : `${expenseTypes.length} record(s)`}</span>
                </div>

                {loading ? (
                    <div className="space-y-3 p-4">
                        {[1, 2, 3, 4].map(row => <Skeleton key={row} className="h-12 w-full" />)}
                    </div>
                ) : expenseTypes.length === 0 ? (
                    <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                        <AlertCircle className="h-5 w-5" />
                        No Expense Types match the selected filters.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[820px] text-left text-sm">
                            <thead className="border-b bg-muted/40 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3">Expense Type</th>
                                    <th className="px-4 py-3">GL Account</th>
                                    <th className="px-4 py-3">Description</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Last Updated</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {expenseTypes.map(type => (
                                    <tr key={type.id} className="hover:bg-muted/20">
                                        <td className="px-4 py-3">
                                            <div className="font-semibold">{type.name || "Unnamed Expense Type"}</div>
                                            <div className="font-mono text-[11px] text-muted-foreground">#{type.id}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{accountLabel(type)}</div>
                                            {type.chartOfAccount && <div className="text-[11px] text-muted-foreground">{type.chartOfAccount.accountTypeName}</div>}
                                        </td>
                                        <td className="max-w-[280px] px-4 py-3 text-xs text-muted-foreground">{type.description || "—"}</td>
                                        <td className="px-4 py-3">
                                            {type.isActive ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Active</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-bold text-muted-foreground"><Power className="h-3 w-3" /> Inactive</span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(type.updatedAt || type.createdAt)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(type)} disabled={saving} aria-label={`Edit ${type.name}`}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button type="button" variant="ghost" size="icon" onClick={() => void handleToggle(type)} disabled={saving} aria-label={`${type.isActive ? "Deactivate" : "Activate"} ${type.name}`}>
                                                    <Power className={`h-4 w-4 ${type.isActive ? "text-destructive" : "text-emerald-600"}`} />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
