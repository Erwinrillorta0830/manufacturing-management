/* eslint-disable */
import React from "react";
import { Loader2, ShieldAlert, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Branch } from "../../types";
import { SearchableSelect } from "../SearchableSelect";

export interface Step1BasicDetailsProps {
    branches: Branch[];
    selectedBranchId: string;
    setSelectedBranchId: (id: string) => void;
    joNumber: string;
    setJoNumber: (no: string) => void;
    loadingProducts: boolean;
    parentProductOptions: { value: string; label: string }[];
    selectedParentProductId: string;
    setSelectedParentProductId: (id: string) => void;
    uomOptions: {
        product_id: string;
        product_code: string;
        uom_name: string;
        uom_shortcut: string;
        multiplier: number;
    }[];
    selectedProductId: string;
    setSelectedProductId: (id: string) => void;
    loadingVersions: boolean;
    versions: any[];
    selectedVersionId: string;
    setSelectedVersionId: (id: string) => void;
    targetQuantity: number;
    setTargetQuantity: (qty: number) => void;
    dueDate: string;
    setDueDate: (date: string) => void;
    shiftOption: string;
    setShiftOption: (shift: string) => void;
    remarks: string;
    setRemarks: (remarks: string) => void;
}

export function Step1BasicDetails({
    branches,
    selectedBranchId,
    setSelectedBranchId,
    joNumber,
    setJoNumber,
    loadingProducts,
    parentProductOptions,
    selectedParentProductId,
    setSelectedParentProductId,
    uomOptions,
    selectedProductId,
    setSelectedProductId,
    loadingVersions,
    versions,
    selectedVersionId,
    setSelectedVersionId,
    targetQuantity,
    setTargetQuantity,
    dueDate,
    setDueDate,
    shiftOption,
    setShiftOption,
    remarks,
    setRemarks
}: Step1BasicDetailsProps) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        Target Branch
                    </label>
                    <Select
                        value={selectedBranchId}
                        onValueChange={setSelectedBranchId}
                    >
                        <SelectTrigger className="h-9 font-semibold bg-card border-input text-foreground">
                            <SelectValue placeholder="Select branch" />
                        </SelectTrigger>
                        <SelectContent>
                            {branches.map((b) => (
                                <SelectItem key={b.id} value={String(b.id)}>
                                    {b.branch_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        Job Order Reference #
                    </label>
                    <Input
                        value={joNumber}
                        onChange={(e) => setJoNumber(e.target.value)}
                        className="h-9 font-semibold bg-card border-input text-foreground"
                        placeholder="JO-BUF-XXXXXX"
                    />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                    Product Name
                </label>
                {loadingProducts ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Loading finished goods...
                    </div>
                ) : (
                    <SearchableSelect
                        options={parentProductOptions}
                        value={selectedParentProductId}
                        onValueChange={setSelectedParentProductId}
                        placeholder="Select Product Name..."
                        className="h-9 font-semibold text-xs"
                    />
                )}
            </div>

            {selectedParentProductId && uomOptions.length > 0 && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        Available Unit of Measurement (UOM)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {uomOptions.map((opt) => {
                            const isSelected = selectedProductId === opt.product_id;
                            return (
                                <button
                                    key={opt.product_id}
                                    type="button"
                                    onClick={() => setSelectedProductId(opt.product_id)}
                                    className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-200 group ${
                                        isSelected
                                            ? "bg-primary/10 border-primary text-foreground shadow-sm ring-1 ring-primary/30"
                                            : "bg-card border-border hover:border-muted-foreground/30 hover:bg-accent/5"
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 font-sans">
                                        <div
                                            className={`flex items-center justify-center h-8 w-11 rounded-lg text-[10px] font-bold transition-all duration-200 ${
                                                isSelected
                                                    ? "bg-primary text-primary-foreground scale-105"
                                                    : "bg-muted text-muted-foreground group-hover:bg-muted/80"
                                            }`}
                                        >
                                            {opt.uom_shortcut.toUpperCase()}
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-xs font-bold text-foreground truncate max-w-[140px]">
                                                {opt.uom_name || "Standard Unit"}
                                            </div>
                                            <div className="text-[9px] font-medium text-muted-foreground font-mono">
                                                {opt.product_code}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 font-sans">
                                        {isSelected ? (
                                            <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center text-primary-foreground animate-in zoom-in duration-200">
                                                <Check className="h-2.5 w-2.5 stroke-[3]" />
                                            </div>
                                        ) : (
                                            <div className="h-4 w-4 rounded-full border border-muted-foreground/30 group-hover:border-muted-foreground/50 transition-colors" />
                                        )}
                                        {opt.multiplier > 1 && (
                                            <span className="text-[9px] bg-secondary text-secondary-foreground border border-secondary/30 px-1 py-0.5 rounded font-bold">
                                                Pack of {opt.multiplier}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        Recipe Version
                    </label>
                    {loadingVersions ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground h-9">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            Loading recipes...
                        </div>
                    ) : (
                        <>
                            <Select
                                value={selectedVersionId}
                                onValueChange={setSelectedVersionId}
                                disabled={!selectedProductId || versions.every((v: any) => v.status !== "Active" && v.status !== "Approved" && !v.is_active)}
                            >
                                <SelectTrigger className="h-9 font-semibold bg-card border-input text-foreground">
                                    <SelectValue placeholder={
                                        !selectedProductId
                                            ? "Select product first"
                                            : versions.length === 0
                                            ? "No recipe versions found"
                                            : versions.every((v: any) => v.status !== "Active" && v.status !== "Approved" && !v.is_active)
                                            ? "No approved versions available"
                                            : "Select version"
                                    } />
                                </SelectTrigger>
                                <SelectContent>
                                    {versions.map((v) => {
                                        const isApproved = v.status === "Approved" || v.status === "Active" || v.is_active;
                                        return (
                                            <SelectItem key={v.version_id} value={String(v.version_id)} disabled={!isApproved}>
                                                {v.version_name} ({v.status}){!isApproved ? " - Not Approved" : ""}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                            {selectedProductId && !loadingVersions && versions.every((v: any) => v.status !== "Active" && v.status !== "Approved" && !v.is_active) && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1 flex items-center gap-1">
                                    <ShieldAlert size={13} className="shrink-0" />
                                    <span>No approved versions available. Please approve in Product Version Approval.</span>
                                </p>
                            )}
                        </>
                    )}
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        Target Production Quantity
                    </label>
                    <Input
                        type="number"
                        value={targetQuantity}
                        onChange={(e) => setTargetQuantity(Math.max(1, Number(e.target.value)))}
                        className="h-9 font-semibold bg-card border-input text-foreground"
                    />
                </div>
            </div>

            {selectedProductId && versions.length === 0 && !loadingVersions && (
                <div className="bg-amber-950/20 border border-amber-500/20 text-amber-400 rounded-xl p-3 text-xs flex gap-2 items-center">
                    <ShieldAlert className="h-5 w-5 shrink-0" />
                    <span>Warning: This product has no recipe versions configured. You cannot proceed without configuring a recipe version first.</span>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        Due Date
                    </label>
                    <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="h-9 font-semibold bg-card border-input text-foreground"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        Shift Option (Hours)
                    </label>
                    <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="24"
                        value={shiftOption}
                        onChange={(e) => setShiftOption(e.target.value)}
                        className="h-9 font-semibold bg-card border-input text-foreground font-mono"
                        placeholder="e.g. 8.0"
                        required
                    />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                    Remarks
                </label>
                <Input
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="h-9 text-xs bg-card border-input text-foreground"
                    placeholder="Add planning/buffer notes here..."
                />
            </div>
        </div>
    );
}
