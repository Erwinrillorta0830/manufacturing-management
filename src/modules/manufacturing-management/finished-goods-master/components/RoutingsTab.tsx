import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { RoutingStep, ProductOverhead, OperationType, OverheadType } from "../types";


interface RoutingsTabProps {
    editedRoutings: RoutingStep[];
    handleRoutingChange: <K extends keyof RoutingStep>(stepId: string, field: K, value: RoutingStep[K]) => void;
    addRoutingStep: () => void;
    deleteRoutingStep: (id: string) => void;
    baseRoutingCost: number;
    
    // Custom Overheads additions
    editedOverheads: ProductOverhead[];
    setEditedOverheads: React.Dispatch<React.SetStateAction<ProductOverhead[]>>;
    overheadTypes: OverheadType[];
    setOverheadTypes?: React.Dispatch<React.SetStateAction<OverheadType[]>>;
    
    // Operations additions
    operationTypes: OperationType[];
    setOperationTypes?: React.Dispatch<React.SetStateAction<OperationType[]>>;
}

export const RoutingsTab: React.FC<RoutingsTabProps> = ({
    editedRoutings,
    handleRoutingChange,
    addRoutingStep,
    deleteRoutingStep,
    baseRoutingCost,
    
    editedOverheads,
    setEditedOverheads,
    overheadTypes,
    
    operationTypes,
    setOperationTypes
}) => {
    const [focusedRowId, setFocusedRowId] = useState<string | null>(null);

    const handleCreateOperationType = async (name: string, rowId: string) => {
        try {
            const res = await fetch("/api/manufacturing/finished-goods/operations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.operation) {
                    const newOp = data.operation;
                    handleRoutingChange(rowId, "operationId", newOp.id);
                    handleRoutingChange(rowId, "name", newOp.operation_name);
                    
                    // Refresh operations types list in the parent hook
                    const refreshRes = await fetch("/api/manufacturing/finished-goods/operations");
                    if (refreshRes.ok && setOperationTypes) {
                        setOperationTypes(await refreshRes.json());
                    }
                }
            }
        } catch (e) {
            console.error("Failed to create new operation type on the fly:", e);
        }
    };

    const updateOverheadRow = (rowId: string, updates: Partial<ProductOverhead>) => {
        setEditedOverheads(prev => prev.map(o => o.id === rowId ? { ...o, ...updates } : o));
    };

    const addOverheadRow = () => {
        const newRow: ProductOverhead = {
            id: `oh-new-${Date.now()}`,
            overheadId: 0,
            overheadName: "",
            amount: 0.0
        };
        setEditedOverheads(prev => [...prev, newRow]);
    };

    const deleteOverheadRow = (rowId: string) => {
        setEditedOverheads(prev => prev.filter(o => o.id !== rowId));
    };

    const totalOverheadsCost = editedOverheads.reduce((sum, o) => sum + (o.amount || 0), 0);

    return (
        <div className="space-y-8">
            {/* Datalist for autocomplete step names */}
            <datalist id="routing-steps-datalist">
                {operationTypes.map(op => (
                    <option key={op.id} value={op.operation_name} />
                ))}
            </datalist>

            {/* SECTION 1: ROUTING STAGES */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight text-foreground">1. Production Stages & Routings</h2>
                        <p className="text-xs text-muted-foreground">Labor and machinery run costs needed to construct the final product.</p>
                    </div>
                    <button 
                        onClick={addRoutingStep}
                        className="inline-flex items-center gap-1 rounded-lg border bg-muted px-2.5 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-accent"
                    >
                        <Plus className="h-3 w-3" /> Add Stage Step
                    </button>
                </div>

                <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-sm min-w-[850px]">
                            <thead>
                                <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                    <th className="p-3 w-20">Seq</th>
                                    <th className="p-3">Step Name</th>
                                    <th className="p-3">Step Batch Size</th>
                                    <th className="p-3">OH (Factory Overhead) / Hr</th>
                                    <th className="p-3">Duration (H:M:S)</th>
                                    <th className="p-3 text-center w-28">Requires QA</th>
                                    <th className="p-3 text-right">Computed Cost</th>
                                    <th className="p-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {editedRoutings.sort((a,b) => a.sequence - b.sequence).map((step, index) => {
                                    const computedCost = (step.machineHourlyRate * step.durationHours) / (step.stepBatchSize || 1);
                                    
                                    return (
                                        <tr key={step.id} className="border-b last:border-0 hover:bg-muted/5 transition-colors">
                                            <td className="p-1 border-r border-muted/20 w-20 align-middle">
                                                <input 
                                                    type="number" 
                                                    value={step.sequence === 0 ? "" : step.sequence} 
                                                    data-index={index}
                                                    onChange={e => {
                                                        const val = parseInt(e.target.value);
                                                        handleRoutingChange(step.id, "sequence", isNaN(val) ? 0 : val);
                                                    }}
                                                    onKeyDown={e => {
                                                        if (e.key === "ArrowDown") {
                                                            e.preventDefault();
                                                            const el = document.querySelector(`.rt-seq-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                            if (el) el.focus();
                                                        } else if (e.key === "ArrowUp") {
                                                            e.preventDefault();
                                                            const el = document.querySelector(`.rt-seq-input[data-index="${index - 1}"]`) as HTMLInputElement;
                                                            if (el) el.focus();
                                                        }
                                                    }}
                                                    className="rt-seq-input w-full bg-transparent border-0 focus:ring-1 focus:ring-primary focus:bg-background focus:outline-hidden py-1 px-2 text-sm text-center text-foreground rounded-sm"
                                                />
                                            </td>
                                            <td className="p-1 border-r border-muted/20 min-w-[150px] align-middle relative">
                                                <div className="relative w-full">
                                                    <input 
                                                        type="text" 
                                                        value={step.name} 
                                                        data-index={index}
                                                        onFocus={() => setFocusedRowId(step.id)}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            handleRoutingChange(step.id, "name", val);
                                                            const matched = operationTypes.find(o => o.operation_name.toLowerCase() === val.trim().toLowerCase());
                                                            if (matched) {
                                                                handleRoutingChange(step.id, "operationId", matched.id);
                                                                handleRoutingChange(step.id, "name", matched.operation_name);
                                                            } else {
                                                                handleRoutingChange(step.id, "operationId", undefined);
                                                            }
                                                        }}
                                                        onBlur={async (e) => {
                                                            const val = e.target.value.trim();
                                                            // Close dropdown after a brief delay
                                                            setTimeout(() => setFocusedRowId(null), 150);
                                                            
                                                            if (!val) return;
                                                            const matched = operationTypes.find(o => o.operation_name.toLowerCase() === val.toLowerCase());
                                                            if (!matched) {
                                                                await handleCreateOperationType(val, step.id);
                                                            }
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === "ArrowDown") {
                                                                e.preventDefault();
                                                                const el = document.querySelector(`.rt-name-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            } else if (e.key === "ArrowUp") {
                                                                e.preventDefault();
                                                                const el = document.querySelector(`.rt-name-input[data-index="${index - 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            } else if (e.key === "Escape") {
                                                                setFocusedRowId(null);
                                                            }
                                                        }}
                                                        className="rt-name-input w-full bg-transparent border-0 focus:ring-1 focus:ring-primary focus:bg-background focus:outline-hidden py-1 px-2.5 text-sm font-medium text-foreground rounded-sm"
                                                    />
                                                    {focusedRowId === step.id && (
                                                        <div className="absolute left-0 right-0 top-full mt-1 bg-card border rounded-lg shadow-xl max-h-48 overflow-y-auto z-50 py-1">
                                                            {operationTypes
                                                                .filter(op => (op.operation_name || "").toLowerCase().includes((step.name || "").toLowerCase()))
                                                                .map(op => (
                                                                    <button
                                                                        key={op.id}
                                                                        type="button"
                                                                        onMouseDown={(e) => {
                                                                            // Prevent input blur before click event registers
                                                                            e.preventDefault();
                                                                            handleRoutingChange(step.id, "operationId", op.id);
                                                                            handleRoutingChange(step.id, "name", op.operation_name);
                                                                            setFocusedRowId(null);
                                                                        }}
                                                                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-primary/20 text-foreground transition-colors font-medium cursor-pointer"
                                                                    >
                                                                        {op.operation_name}
                                                                    </button>
                                                                ))}
                                                            
                                                            {/* Offer to create operation type on the fly */}
                                                            {step.name && step.name.trim() !== "" && 
                                                             !operationTypes.some(op => (op.operation_name || "").toLowerCase() === step.name.trim().toLowerCase()) && (
                                                                <button
                                                                    type="button"
                                                                    onMouseDown={async (e) => {
                                                                        e.preventDefault();
                                                                        await handleCreateOperationType(step.name.trim(), step.id);
                                                                        setFocusedRowId(null);
                                                                    }}
                                                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-primary/20 text-primary font-bold transition-colors border-t bg-primary/5 cursor-pointer"
                                                                >
                                                                    + Create &quot;{step.name}&quot; as operation
                                                                </button>
                                                            )}
                                                            
                                                            {/* If filtered list is empty and input is empty */}
                                                            {operationTypes.filter(op => (op.operation_name || "").toLowerCase().includes((step.name || "").toLowerCase())).length === 0 && !step.name && (
                                                                <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                                                    No operations found
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-1 border-r border-muted/20 w-36 align-middle">
                                                <div className="relative flex items-center px-2">
                                                    <span className="text-xs text-muted-foreground mr-1.5 select-none font-semibold">Qty</span>
                                                    <input 
                                                        type="number" 
                                                        step="0.0001"
                                                        value={step.stepBatchSize === 0 || !step.stepBatchSize ? "" : step.stepBatchSize} 
                                                        data-index={index}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value);
                                                            handleRoutingChange(step.id, "stepBatchSize", isNaN(val) ? 1 : val);
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === "ArrowDown") {
                                                                e.preventDefault();
                                                                const el = document.querySelector(`.rt-batch-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            } else if (e.key === "ArrowUp") {
                                                                e.preventDefault();
                                                                const el = document.querySelector(`.rt-batch-input[data-index="${index - 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            }
                                                        }}
                                                        className="rt-batch-input w-full bg-transparent border-0 focus:ring-1 focus:ring-primary focus:bg-background focus:outline-hidden py-1 px-1.5 text-sm text-foreground rounded-sm"
                                                        placeholder="1.0"
                                                    />
                                                </div>
                                            </td>

                                            <td className="p-1 border-r border-muted/20 w-36 align-middle">
                                                <div className="relative flex items-center px-2">
                                                    <span className="text-xs text-muted-foreground mr-1.5 select-none">₱</span>
                                                    <input 
                                                        type="number" 
                                                        step="0.01"
                                                        value={step.machineHourlyRate === 0 ? "" : step.machineHourlyRate} 
                                                        data-index={index}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value);
                                                            handleRoutingChange(step.id, "machineHourlyRate", isNaN(val) ? 0 : val);
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === "ArrowDown") {
                                                                e.preventDefault();
                                                                const el = document.querySelector(`.rt-machine-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            } else if (e.key === "ArrowUp") {
                                                                e.preventDefault();
                                                                const el = document.querySelector(`.rt-machine-input[data-index="${index - 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            }
                                                        }}
                                                        className="rt-machine-input w-full bg-transparent border-0 focus:ring-1 focus:ring-primary focus:bg-background focus:outline-hidden py-1 px-1.5 text-sm text-foreground rounded-sm"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                            </td>
                                            <td className="p-1 border-r border-muted/20 w-36 align-middle">
                                                <div className="flex items-center gap-1 bg-slate-950/20 px-2 py-0.5 rounded-sm border border-slate-800/80 focus-within:ring-1 focus-within:ring-primary focus-within:bg-background w-full">
                                                    {/* Hours input */}
                                                    <input 
                                                        type="number" 
                                                        min="0"
                                                        value={Math.floor(Math.round((step.durationHours || 0) * 3600) / 3600) || ""} 
                                                        data-index={index}
                                                        onChange={e => {
                                                            const h = parseInt(e.target.value) || 0;
                                                            const totalS = Math.round((step.durationHours || 0) * 3600);
                                                            const currentMins = Math.floor((totalS % 3600) / 60);
                                                            const currentSecs = totalS % 60;
                                                            handleRoutingChange(step.id, "durationHours", h + (currentMins / 60) + (currentSecs / 3600));
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === "Enter") {
                                                                e.preventDefault();
                                                                const isLastRow = index === editedRoutings.length - 1;
                                                                if (isLastRow) {
                                                                    addRoutingStep();
                                                                } else {
                                                                    const el = document.querySelector(`.rt-name-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                                    if (el) el.focus();
                                                                }
                                                            } else if (e.key === "ArrowDown") {
                                                                e.preventDefault();
                                                                const el = document.querySelector(`.rt-duration-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            } else if (e.key === "ArrowUp") {
                                                                e.preventDefault();
                                                                const el = document.querySelector(`.rt-duration-input[data-index="${index - 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            }
                                                        }}
                                                        className="rt-duration-input w-12 bg-transparent border-0 outline-hidden py-0.5 px-1 text-sm text-right text-foreground focus:ring-0 placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        placeholder="0"
                                                    />
                                                    <span className="text-[10px] font-bold text-muted-foreground/50 select-none">h</span>
                                                    <span className="text-muted-foreground/20 font-bold select-none">:</span>
                                                    {/* Minutes input */}
                                                    <input 
                                                        type="number" 
                                                        min="0"
                                                        max="59"
                                                        value={Math.floor((Math.round((step.durationHours || 0) * 3600) % 3600) / 60) || ""} 
                                                        data-index={index}
                                                        onChange={e => {
                                                            const m = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                                                            const totalS = Math.round((step.durationHours || 0) * 3600);
                                                            const currentHrs = Math.floor(totalS / 3600);
                                                            const currentSecs = totalS % 60;
                                                            handleRoutingChange(step.id, "durationHours", currentHrs + (m / 60) + (currentSecs / 3600));
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === "Enter") {
                                                                e.preventDefault();
                                                                const isLastRow = index === editedRoutings.length - 1;
                                                                if (isLastRow) {
                                                                    addRoutingStep();
                                                                } else {
                                                                    const el = document.querySelector(`.rt-name-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                                    if (el) el.focus();
                                                                }
                                                            } else if (e.key === "ArrowDown") {
                                                                e.preventDefault();
                                                                const el = document.querySelector(`.rt-minutes-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            } else if (e.key === "ArrowUp") {
                                                                e.preventDefault();
                                                                const el = document.querySelector(`.rt-minutes-input[data-index="${index - 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            }
                                                        }}
                                                        className="rt-minutes-input w-8 bg-transparent border-0 outline-hidden py-0.5 px-1 text-sm text-center text-foreground focus:ring-0 placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        placeholder="00"
                                                    />
                                                    <span className="text-[10px] font-bold text-muted-foreground/50 select-none">m</span>
                                                    <span className="text-muted-foreground/20 font-bold select-none">:</span>
                                                    {/* Seconds input */}
                                                    <input 
                                                        type="number" 
                                                        min="0"
                                                        max="59"
                                                        value={Math.round((step.durationHours || 0) * 3600) % 60 || ""} 
                                                        data-index={index}
                                                        onChange={e => {
                                                            const s = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                                                            const totalS = Math.round((step.durationHours || 0) * 3600);
                                                            const currentHrs = Math.floor(totalS / 3600);
                                                            const currentMins = Math.floor((totalS % 3600) / 60);
                                                            handleRoutingChange(step.id, "durationHours", currentHrs + (currentMins / 60) + (s / 3600));
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === "Enter") {
                                                                e.preventDefault();
                                                                const isLastRow = index === editedRoutings.length - 1;
                                                                if (isLastRow) {
                                                                    addRoutingStep();
                                                                } else {
                                                                    const el = document.querySelector(`.rt-name-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                                    if (el) el.focus();
                                                                }
                                                            } else if (e.key === "ArrowDown") {
                                                                e.preventDefault();
                                                                const el = document.querySelector(`.rt-seconds-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            } else if (e.key === "ArrowUp") {
                                                                e.preventDefault();
                                                                const el = document.querySelector(`.rt-seconds-input[data-index="${index - 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            }
                                                        }}
                                                        className="rt-seconds-input w-8 bg-transparent border-0 outline-hidden py-0.5 px-1 text-sm text-left text-foreground focus:ring-0 placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        placeholder="00"
                                                    />
                                                    <span className="text-[10px] font-bold text-muted-foreground/50 select-none">s</span>
                                                </div>
                                            </td>
                                            <td className="p-1 border-r border-muted/20 w-28 align-middle text-center">
                                                <input 
                                                    type="checkbox"
                                                    checked={step.requiresQA || false}
                                                    onChange={e => handleRoutingChange(step.id, "requiresQA", e.target.checked)}
                                                    className="h-4 w-4 rounded border-muted/30 text-primary focus:ring-primary cursor-pointer align-middle"
                                                />
                                            </td>
                                            <td className="p-3 text-right font-medium text-foreground">
                                                ₱{computedCost.toFixed(2)}
                                            </td>
                                            <td className="p-1 text-center align-middle">
                                                <button 
                                                    onClick={() => deleteRoutingStep(step.id)}
                                                    className="text-muted-foreground hover:text-destructive p-1.5 rounded transition-colors inline-flex items-center justify-center"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {editedRoutings.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                            No routing stages defined. Click &quot;Add Stage Step&quot; to begin.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="flex justify-end p-2 bg-muted/20 rounded-lg">
                    <span className="text-xs font-semibold text-muted-foreground">
                        Production Routing Subtotal: <span className="text-sm font-bold text-foreground">₱{baseRoutingCost.toFixed(2)}</span>
                    </span>
                </div>
            </div>

            {/* SECTION 2: CUSTOM VARIABLE OVERHEADS */}
            <div className="space-y-4 border-t pt-6">
                <datalist id="overhead-types-datalist">
                    {overheadTypes.map(t => (
                        <option key={t.id} value={t.overhead_name} />
                    ))}
                </datalist>

                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold tracking-tight text-foreground">2. Variable Version Overheads</h2>
                        <p className="text-xs text-muted-foreground">Trucking, storage, customs SOP, brokerage fees, and other variable expenses. Press [Enter] on the last amount to add a row.</p>
                    </div>
                    <button 
                        onClick={addOverheadRow}
                        className="inline-flex items-center gap-1 rounded-lg border bg-muted px-2.5 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-accent"
                    >
                        <Plus className="h-3 w-3" /> Add Overhead Item
                    </button>
                </div>

                <div className="border rounded-xl overflow-hidden shadow-xs bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-sm min-w-[600px] border-spacing-0">
                            <thead>
                                <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                    <th className="p-3 border-r border-muted/20">Overhead Variable Category Name</th>
                                    <th className="p-3 w-64 border-r border-muted/20">Amount (PHP)</th>
                                    <th className="p-3 w-16 text-center"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {editedOverheads.map((item, index) => (
                                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/5 transition-colors">
                                        <td className="p-2.5 border-r border-muted/20 align-middle">
                                            <span className="text-sm font-medium text-foreground block truncate">
                                                {item.overheadName || "Overhead Item"}
                                            </span>
                                        </td>
                                        <td className="p-1 border-r border-muted/20 align-middle">
                                            <div className="relative flex items-center px-2">
                                                <span className="text-xs text-muted-foreground select-none mr-1.5">₱</span>
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    value={item.amount || ""} 
                                                    data-index={index}
                                                    className="oh-amount-input w-full bg-transparent border-0 focus:ring-1 focus:ring-primary focus:bg-background focus:outline-hidden py-1.5 px-1.5 text-sm font-semibold text-foreground text-left rounded-sm transition-all"
                                                    placeholder="0.00"
                                                    onChange={e => updateOverheadRow(item.id, { amount: parseFloat(e.target.value) || 0 })}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            const isLastRow = index === editedOverheads.length - 1;
                                                            if (isLastRow) {
                                                                addOverheadRow();
                                                            } else {
                                                                const el = document.querySelector(`.oh-name-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                                if (el) el.focus();
                                                            }
                                                        } else if (e.key === "ArrowDown") {
                                                            e.preventDefault();
                                                            const el = document.querySelector(`.oh-amount-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                            if (el) el.focus();
                                                        } else if (e.key === "ArrowUp") {
                                                            e.preventDefault();
                                                            const el = document.querySelector(`.oh-amount-input[data-index="${index - 1}"]`) as HTMLInputElement;
                                                            if (el) el.focus();
                                                        } else if (e.key === "ArrowLeft") {
                                                            const el = document.querySelector(`.oh-name-input[data-index="${index}"]`) as HTMLInputElement;
                                                            if (el) el.focus();
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </td>
                                        <td className="p-1 text-center align-middle">
                                            <button 
                                                onClick={() => deleteOverheadRow(item.id)}
                                                className="text-muted-foreground hover:text-destructive p-1.5 rounded transition-colors inline-flex items-center justify-center"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {editedOverheads.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="p-8 text-center text-muted-foreground">
                                            No custom overhead variables registered. Click &quot;Add Overhead Item&quot; to begin.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="flex justify-end p-2 bg-muted/20 rounded-lg">
                    <span className="text-xs font-semibold text-muted-foreground">
                        Custom Overheads Subtotal: <span className="text-sm font-bold text-foreground">₱{totalOverheadsCost.toFixed(2)}</span>
                    </span>
                </div>
            </div>
        </div>
    );
};
