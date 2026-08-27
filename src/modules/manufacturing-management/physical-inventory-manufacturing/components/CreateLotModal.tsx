"use client";

import React, { useState } from "react";
import { Branch, Unit, MmLot } from "../types";
import { createMmLot, fetchMasterUnits } from "../services/physical-inventory-manufacturing-api";
import SearchableSelect from "./SearchableSelect";
import { X, AlertTriangle } from "lucide-react";

interface Props {
    isOpen: boolean;
    branchId: number;
    branches: Branch[];
    units: Unit[];
    onClose: () => void;
    onLotCreated: (lot: MmLot) => void;
}

export default function CreateLotModal({
    isOpen,
    branchId,
    branches,
    units,
    onClose,
    onLotCreated,
}: Props) {
    const [lotName, setLotName] = useState("");
    const [availableUnits, setAvailableUnits] = useState<Unit[]>(units || []);
    const [unitId, setUnitId] = useState<number>(0);
    const [capacity, setCapacity] = useState<string>("10");
    const [description, setDescription] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset form state and sync units when modal opens or branch changes
    React.useEffect(() => {
        if (isOpen) {
            setLotName("");
            setCapacity("10");
            setDescription("");
            setError(null);
            setSubmitting(false);

            if (units && units.length > 0) {
                setAvailableUnits(units);
                const firstId = units[0].unit_id || (units[0] as unknown as { unitId?: number }).unitId || 0;
                setUnitId(firstId);
            } else {
                fetchMasterUnits().then((fetched) => {
                    if (fetched && fetched.length > 0) {
                        setAvailableUnits(fetched);
                        const firstId = fetched[0].unit_id || (fetched[0] as unknown as { unitId?: number }).unitId || 0;
                        setUnitId(firstId);
                    }
                });
            }
        }
    }, [isOpen, branchId, units]);

    if (!isOpen) return null;

    const currentBranch = branches.find((b) => b.id === branchId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const cleanName = lotName.trim();
        if (!cleanName) {
            setError("Lot name is required.");
            return;
        }
        if (!unitId || unitId <= 0) {
            setError("Unit of measurement (UOM) is required.");
            return;
        }
        const capNum = Number(capacity);
        if (isNaN(capNum) || capNum <= 0) {
            setError("Maximum batch capacity must be a positive number.");
            return;
        }

        try {
            setSubmitting(true);
            const created = await createMmLot({
                lot_name: cleanName,
                branch_id: branchId,
                unit_id: unitId,
                max_batch_capacity: capNum,
                description: description.trim(),
            });
            onLotCreated(created);
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to create lot";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-card border rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b bg-muted/30 shrink-0">
                    <h3 className="text-base font-bold text-foreground">Create Manufacturing Lot</h3>
                    <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                    <div className="p-5 space-y-4 overflow-y-auto flex-1">
                        {error && (
                            <div className="flex items-center gap-2 p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg dark:bg-rose-950 dark:text-rose-300">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Branch (Fixed to PI Branch)</label>
                            <input
                                type="text"
                                value={currentBranch ? (currentBranch.branch_name || currentBranch.branchName || `Branch #${branchId}`) : `Branch #${branchId}`}
                                disabled
                                className="w-full px-3 py-2 text-sm bg-muted border rounded-lg opacity-80"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Lot Name *</label>
                            <input
                                type="text"
                                placeholder="e.g. LOT-A-01, RAW-MAT-LOT-01"
                                value={lotName}
                                onChange={(e) => setLotName(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Unit of Measurement (UOM) *</label>
                            <SearchableSelect
                                options={availableUnits.map((u) => {
                                    const idVal = u.unit_id || (u as unknown as { unitId?: number }).unitId || 0;
                                    const nameVal = u.unit_name || (u as unknown as { unitName?: string }).unitName || `Unit #${idVal}`;
                                    const shortcutVal = u.unit_shortcut || (u as unknown as { unitShortcut?: string }).unitShortcut || nameVal;
                                    return {
                                        value: idVal,
                                        label: nameVal,
                                        sublabel: shortcutVal ? `Shortcut: ${shortcutVal}` : undefined,
                                    };
                                })}
                                value={unitId}
                                onChange={(val) => setUnitId(Number(val))}
                                placeholder="Select UOM..."
                                searchPlaceholder="Search UOM..."
                                required
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">All products added to this lot must share this exact UOM.</p>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Max Batch Capacity *</label>
                            <input
                                type="number"
                                min="1"
                                value={capacity}
                                onChange={(e) => setCapacity(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Description / Location Notes</label>
                            <input
                                type="text"
                                placeholder="Optional storage location or note..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 p-4 border-t bg-muted/20 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent border rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-xs"
                        >
                            {submitting ? "Creating Lot..." : "Create Lot"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
