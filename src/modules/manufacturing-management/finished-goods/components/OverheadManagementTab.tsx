/* eslint-disable */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Calculator, Info, Check, ShieldCheck, Building2, BookOpen, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OverheadType, ChartOfAccount } from "../types";
import { CreatableSelect } from "./CreatableSelect";
import { toast } from "sonner";

export interface VersionOverheadItem {
    id: string;
    overhead_type_id?: number;
    overhead_name: string;
    cost_per_unit: number;
    is_active: boolean;
    remarks?: string;
}

interface OverheadManagementTabProps {
    overheadTypes?: OverheadType[];
    setOverheadTypes?: React.Dispatch<React.SetStateAction<OverheadType[]>>;
    editedVersionDetails: any;
    setEditedVersionDetails: React.Dispatch<React.SetStateAction<any>>;
    setHasUnsavedChanges: (val: boolean) => void;
    /** When true, all fields are read-only. */
    isVersionLocked?: boolean;
}

export const OverheadManagementTab: React.FC<OverheadManagementTabProps> = ({
    overheadTypes = [],
    setOverheadTypes,
    editedVersionDetails,
    setEditedVersionDetails,
    setHasUnsavedChanges,
    isVersionLocked = false,
}) => {
    // Local list of db overhead types fetched if not passed from parent
    const [fetchedOverheadTypes, setFetchedOverheadTypes] = useState<OverheadType[]>([]);
    const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
    const [loadingCoa, setLoadingCoa] = useState(false);

    // Modal state for formal Overhead Type Registration linked to Chart of Accounts
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [regName, setRegName] = useState("");
    const [regCoaId, setRegCoaId] = useState("");
    const [regDescription, setRegDescription] = useState("");
    const [isSubmittingReg, setIsSubmittingReg] = useState(false);

    useEffect(() => {
        if (!overheadTypes || overheadTypes.length === 0) {
            fetch("/api/manufacturing/finished-goods/overhead-types")
                .then((res) => (res.ok ? res.json() : []))
                .then((data) => {
                    if (Array.isArray(data)) {
                        setFetchedOverheadTypes(data);
                        if (setOverheadTypes) {
                            setOverheadTypes(data);
                        }
                    }
                })
                .catch((err) => console.error("Failed fetching overhead types:", err));
        }
    }, [overheadTypes, setOverheadTypes]);

    // Load Chart of Accounts when registration modal opens
    useEffect(() => {
        if (isRegisterModalOpen && chartOfAccounts.length === 0) {
            setLoadingCoa(true);
            fetch("/api/manufacturing/finished-goods/chart-of-accounts")
                .then((res) => (res.ok ? res.json() : []))
                .then((data) => {
                    if (Array.isArray(data)) {
                        setChartOfAccounts(data);
                    }
                })
                .catch((err) => console.error("Failed fetching chart of accounts:", err))
                .finally(() => setLoadingCoa(false));
        }
    }, [isRegisterModalOpen, chartOfAccounts.length]);

    const activeOverheadTypes = useMemo(() => {
        return (overheadTypes && overheadTypes.length > 0) ? overheadTypes : fetchedOverheadTypes;
    }, [overheadTypes, fetchedOverheadTypes]);

    const overheadOptions = useMemo(() => {
        return activeOverheadTypes.map((t) => {
            const coaObj = typeof t.coa_id === "object" && t.coa_id !== null ? t.coa_id : null;
            const coaLabel = coaObj?.gl_code 
                ? ` [${coaObj.gl_code}] ${coaObj.account_title || ""}`
                : coaObj?.account_title 
                    ? ` - ${coaObj.account_title}`
                    : "";
            return {
                value: String(t.id),
                label: `${t.overhead_name}${coaLabel}`
            };
        });
    }, [activeOverheadTypes]);

    const coaOptions = useMemo(() => {
        return chartOfAccounts.map((account) => {
            const glPart = account.gl_code ? `[${account.gl_code}] ` : "";
            const titlePart = account.account_title || "Untitled Account";
            return {
                value: String(account.coa_id),
                label: `${glPart}${titlePart}`
            };
        });
    }, [chartOfAccounts]);

    // Initialize overhead items strictly from active version state
    const [overheadItems, setOverheadItems] = useState<VersionOverheadItem[]>(() => {
        if (editedVersionDetails?.overhead_items && Array.isArray(editedVersionDetails.overhead_items)) {
            return editedVersionDetails.overhead_items;
        }
        // If legacy custom_overhead float exists, represent it as initial version record
        const currentCustom = Number(editedVersionDetails?.custom_overhead || 0);
        if (currentCustom > 0) {
            return [
                {
                    id: "init-version-ov-1",
                    overhead_name: "General Factory Overhead",
                    cost_per_unit: currentCustom,
                    is_active: true,
                    remarks: "Configured version custom overhead"
                }
            ];
        }
        return [];
    });

    const [selectedTypeId, setSelectedTypeId] = useState<string>("");
    const [customOverheadName, setCustomOverheadName] = useState<string>("");
    const [newCostPerUnit, setNewCostPerUnit] = useState<string>("");
    const [newRemarks, setNewRemarks] = useState<string>("");
    const [isAdding, setIsAdding] = useState(false);

    // Calculate total active overhead cost per unit
    const totalActiveOverhead = useMemo(() => {
        return overheadItems
            .filter((item) => item.is_active)
            .reduce((sum, item) => sum + (Number(item.cost_per_unit) || 0), 0);
    }, [overheadItems]);

    // Sync active overhead total with editedVersionDetails.custom_overhead
    useEffect(() => {
        if (setEditedVersionDetails) {
            setEditedVersionDetails((prev: any) => {
                if (prev?.custom_overhead === totalActiveOverhead && prev?.overhead_items === overheadItems) {
                    return prev;
                }
                return {
                    ...prev,
                    custom_overhead: Math.round(totalActiveOverhead * 10000) / 10000,
                    overhead_items: overheadItems
                };
            });
        }
    }, [totalActiveOverhead, overheadItems, setEditedVersionDetails]);

    const handleUpdateItem = (id: string, field: keyof VersionOverheadItem, value: any) => {
        setOverheadItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
        );
        setHasUnsavedChanges(true);
    };

    const handleDeleteItem = (id: string) => {
        setOverheadItems((prev) => prev.filter((item) => item.id !== id));
        setHasUnsavedChanges(true);
    };

    const handleToggleActive = (id: string) => {
        setOverheadItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, is_active: !item.is_active } : item))
        );
        setHasUnsavedChanges(true);
    };

    // Formal Registration Handler (Linked to Chart of Accounts)
    const handleRegisterNewOverheadType = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!regName.trim()) {
            toast.error("Overhead type name is required.");
            return;
        }
        if (!regCoaId) {
            toast.error("Please select a Chart of Accounts (COA) GL account.");
            return;
        }

        setIsSubmittingReg(true);
        try {
            const res = await fetch("/api/manufacturing/finished-goods/overhead-types", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: regName.trim(),
                    coa_id: Number(regCoaId),
                    description: regDescription.trim() || undefined
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Failed to register overhead type");
            }

            const data = await res.json();
            if (data.success && data.type) {
                const newType = data.type;
                const refreshRes = await fetch("/api/manufacturing/finished-goods/overhead-types");
                if (refreshRes.ok) {
                    const newTypes = await refreshRes.json();
                    setFetchedOverheadTypes(newTypes);
                    if (setOverheadTypes) setOverheadTypes(newTypes);
                }
                setSelectedTypeId(String(newType.id));
                setCustomOverheadName(newType.overhead_name);
                toast.success(`Registered overhead type "${newType.overhead_name}" linked to COA!`);
                setIsRegisterModalOpen(false);
                setRegName("");
                setRegCoaId("");
                setRegDescription("");
            }
        } catch (err) {
            console.error("Error registering new overhead type:", err);
            toast.error(err instanceof Error ? err.message : "Failed to register overhead type.");
        } finally {
            setIsSubmittingReg(false);
        }
    };

    const handleAddOverhead = (e: React.FormEvent) => {
        e.preventDefault();

        let finalName = customOverheadName.trim();
        let finalTypeId: number | undefined = undefined;

        const matched = activeOverheadTypes.find((t) => String(t.id) === selectedTypeId);
        if (matched) {
            finalName = matched.overhead_name;
            finalTypeId = matched.id;
        }

        if (!finalName) {
            toast.error("Please select an overhead type from the catalog.");
            return;
        }

        const costVal = parseFloat(newCostPerUnit) || 0;
        const newItem: VersionOverheadItem = {
            id: `ov-${Date.now()}`,
            overhead_type_id: finalTypeId,
            overhead_name: finalName,
            cost_per_unit: costVal,
            is_active: true,
            remarks: newRemarks.trim() || undefined
        };

        setOverheadItems((prev) => [...prev, newItem]);
        setSelectedTypeId("");
        setCustomOverheadName("");
        setNewCostPerUnit("");
        setNewRemarks("");
        setIsAdding(false);
        setHasUnsavedChanges(true);
    };

    return (
        <div className="space-y-6">
            {/* Header section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-primary" /> Version Overhead Management
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Manage factory and indirect manufacturing overhead costs allocated per unit to this version.
                    </p>
                </div>
                {!isVersionLocked && (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setIsRegisterModalOpen(true)}
                            className="inline-flex items-center gap-1.5 h-9 text-xs rounded-lg shadow-sm border-primary/30 text-primary hover:bg-primary/10"
                        >
                            <BookOpen className="h-3.5 w-3.5" /> Register Overhead Type to COA
                        </Button>
                        <Button
                            onClick={() => setIsAdding(true)}
                            className="inline-flex items-center gap-1.5 h-9 text-xs rounded-lg shadow-sm"
                        >
                            <Plus className="h-3.5 w-3.5" /> Add Overhead Item
                        </Button>
                    </div>
                )}
            </div>

            {/* System Basis & Total Active Overhead Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-xl p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 text-primary">
                        <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground uppercase tracking-wider">Allocation Basis:</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-primary text-primary-foreground shadow-xs">
                                Per Unit (Fixed)
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            All version overhead costs are allocated per finished unit to standard product COGS.
                        </p>
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-center space-y-1">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total Version Overhead</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-foreground font-mono">
                            ₱{totalActiveOverhead.toFixed(4)}
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground">/ unit</span>
                    </div>
                    <span className="text-[10px] text-emerald-600 font-medium">
                        {overheadItems.filter((i) => i.is_active).length} active items in unit COGS
                    </span>
                </div>
            </div>

            {/* Add New Item Form */}
            {isAdding && (
                <form onSubmit={handleAddOverhead} className="bg-card border border-primary/30 rounded-xl p-4 shadow-md space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex justify-between items-center border-b pb-2">
                        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Plus className="h-3.5 w-3.5 text-primary" /> Add Overhead Item from Catalog
                        </h4>
                        <span className="text-[10px] text-muted-foreground font-semibold">Allocation: Per Unit</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1 sm:col-span-2">
                            <div className="flex justify-between items-center">
                                <label className="text-[11px] font-semibold text-muted-foreground">Search / Select Overhead Type *</label>
                                <button
                                    type="button"
                                    onClick={() => setIsRegisterModalOpen(true)}
                                    className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-1"
                                >
                                    + Register New Type to COA
                                </button>
                            </div>
                            <CreatableSelect
                                options={overheadOptions}
                                value={selectedTypeId}
                                onValueChange={(val) => {
                                    setSelectedTypeId(val);
                                    const matched = activeOverheadTypes.find((t) => String(t.id) === val);
                                    if (matched) {
                                        setCustomOverheadName(matched.overhead_name);
                                    }
                                }}
                                placeholder="Search catalog overhead type..."
                                className="h-9 text-xs"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-muted-foreground">Cost per Unit (₱) *</label>
                            <input
                                type="number"
                                step="0.0001"
                                min="0"
                                required
                                placeholder="0.0000"
                                value={newCostPerUnit}
                                onChange={(e) => setNewCostPerUnit(e.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary h-9"
                            />
                        </div>

                        <div className="space-y-1 sm:col-span-3">
                            <label className="text-[11px] font-semibold text-muted-foreground">Remarks / Notes</label>
                            <input
                                type="text"
                                placeholder="Optional description or allocation details..."
                                value={newRemarks}
                                onChange={(e) => setNewRemarks(e.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsAdding(false)}
                            className="h-8 text-xs px-3"
                        >
                            Cancel
                        </Button>
                        <Button type="submit" className="h-8 text-xs px-4">
                            Add to Version
                        </Button>
                    </div>
                </form>
            )}

            {/* Overhead Items Table */}
            <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/20 flex justify-between items-center">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" /> Version Overhead Allocations ({overheadItems.length})
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                        All rates in ₱ per finished unit
                    </span>
                </div>

                {overheadItems.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground space-y-2">
                        <Info className="h-8 w-8 mx-auto mb-1 opacity-40 text-primary" />
                        <p className="text-xs font-bold text-foreground">
                            {isVersionLocked
                                ? "No overhead items allocated to this version."
                                : "No overhead items allocated to this version yet."}
                        </p>
                        <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                            {isVersionLocked
                                ? "This version is locked in read-only mode. Overhead items and allocation rates cannot be modified."
                                : "Click \"Add Overhead Item\" to select overhead types from the database catalog."}
                        </p>
                        {!isVersionLocked && (
                            <button
                                type="button"
                                onClick={() => setIsAdding(true)}
                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                            >
                                <Plus className="h-3.5 w-3.5" /> Add Overhead Item
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b bg-muted/40 text-[11px] font-bold text-muted-foreground uppercase">
                                    <th className="py-2.5 px-4">Status</th>
                                    <th className="py-2.5 px-4">Overhead Type Name</th>
                                    <th className="py-2.5 px-4 text-right">Cost per Unit (₱)</th>
                                    <th className="py-2.5 px-4">Allocation Basis</th>
                                    <th className="py-2.5 px-4">Remarks</th>
                                    {!isVersionLocked && <th className="py-2.5 px-4 text-center">Action</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {overheadItems.map((item) => (
                                    <tr
                                        key={item.id}
                                        className={`transition-colors ${
                                            item.is_active ? "hover:bg-muted/30" : "bg-muted/10 opacity-60"
                                        }`}
                                    >
                                        <td className="py-2.5 px-4">
                                            <button
                                                type="button"
                                                disabled={isVersionLocked}
                                                onClick={() => handleToggleActive(item.id)}
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                                                    item.is_active
                                                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                                        : "bg-muted text-muted-foreground border-border"
                                                }`}
                                            >
                                                {item.is_active ? (
                                                    <>
                                                        <Check className="h-3 w-3" /> Active
                                                    </>
                                                ) : (
                                                    "Disabled"
                                                )}
                                            </button>
                                        </td>
                                        <td className="py-2.5 px-4 font-semibold text-foreground">
                                            <span className="truncate block font-semibold text-foreground text-xs">
                                                {item.overhead_name}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-mono font-bold">
                                            <input
                                                type="number"
                                                step="0.0001"
                                                min="0"
                                                disabled={isVersionLocked}
                                                value={item.cost_per_unit}
                                                onChange={(e) =>
                                                    handleUpdateItem(
                                                        item.id,
                                                        "cost_per_unit",
                                                        parseFloat(e.target.value) || 0
                                                    )
                                                }
                                                className="w-28 text-right bg-background border border-border rounded px-2 py-1 text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:bg-muted/30"
                                            />
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-muted text-foreground border border-border">
                                                Per Unit
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4 text-muted-foreground text-[11px]">
                                            <input
                                                type="text"
                                                disabled={isVersionLocked}
                                                value={item.remarks || ""}
                                                placeholder="Add remarks..."
                                                onChange={(e) => handleUpdateItem(item.id, "remarks", e.target.value)}
                                                className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-primary px-1 py-0.5 outline-none text-xs disabled:opacity-70"
                                            />
                                        </td>
                                        {!isVersionLocked && (
                                            <td className="py-2.5 px-4 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteItem(item.id)}
                                                    className="text-muted-foreground hover:text-red-600 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                                                    title="Delete item"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-muted/50 border-t font-bold text-foreground">
                                    <td colSpan={2} className="py-3 px-4 text-right uppercase tracking-wider text-[11px] text-muted-foreground">
                                        Total Active Version Overhead:
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-sm text-primary">
                                        ₱{totalActiveOverhead.toFixed(4)}
                                    </td>
                                    <td colSpan={3} className="py-3 px-4 text-xs text-muted-foreground">
                                        Per Unit (Synced to version COGS)
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* Formal Register New Overhead Type Modal (Linked to Chart of Accounts) */}
            {isRegisterModalOpen && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <form
                        onSubmit={handleRegisterNewOverheadType}
                        className="bg-card border border-primary/30 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-5 animate-in zoom-in-95 duration-200 text-foreground"
                    >
                        <div className="flex justify-between items-start border-b pb-3">
                            <div>
                                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                                    <BookOpen className="h-5 w-5 text-primary" /> Register Overhead Type to COA
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Map factory overhead variables directly to a General Ledger account from Chart of Accounts.
                                </p>
                            </div>
                            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                                Catalog Admin
                            </span>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-foreground">Overhead Type Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Cleanroom HVAC Power, Factory Water"
                                    value={regName}
                                    onChange={(e) => setRegName(e.target.value)}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-foreground flex items-center justify-between">
                                    <span>Chart of Accounts (GL Account) *</span>
                                    {loadingCoa && <span className="text-[10px] text-muted-foreground animate-pulse">Loading GL accounts...</span>}
                                </label>
                                <CreatableSelect
                                    options={coaOptions}
                                    value={regCoaId}
                                    onValueChange={(val) => setRegCoaId(val)}
                                    placeholder="Search GL code or account title..."
                                    className="h-9 text-xs"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-foreground">Description / Allocation Notes</label>
                                <textarea
                                    rows={3}
                                    placeholder="Enter description, cost allocation driver, or accounting notes..."
                                    value={regDescription}
                                    onChange={(e) => setRegDescription(e.target.value)}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 border-t pt-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsRegisterModalOpen(false)}
                                className="h-9 text-xs px-4"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSubmittingReg}
                                className="h-9 text-xs px-5 shadow-md"
                            >
                                {isSubmittingReg ? "Registering..." : "Register Overhead Type"}
                            </Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};
