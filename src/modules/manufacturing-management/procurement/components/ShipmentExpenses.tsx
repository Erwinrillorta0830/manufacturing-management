import React, { useState, useEffect } from "react";
import { IncomingShipment, ShipmentLineItem, ShipmentExpense } from "../types";
import { CreatableSelect } from "../../finished-goods/components/CreatableSelect";
import { toast } from "sonner";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Landmark, Plus, Scale, DollarSign, Layers, Anchor, AlertCircle, Info, Calculator, Check, ArrowRight, Loader2 } from "lucide-react";

interface ShipmentExpensesProps {
    shipment: IncomingShipment;
    lines: ShipmentLineItem[];
    expenses: ShipmentExpense[];
    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    allocationForm: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAllocationForm: React.Dispatch<React.SetStateAction<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    onAllocate: (e: React.FormEvent, shipmentId: number, status: string, lineItemUpdates?: any[]) => void;
    submitting?: boolean;
}

export default function ShipmentExpenses({
    shipment,
    lines,
    expenses,
    isModalOpen,
    setIsModalOpen,
    allocationForm,
    setAllocationForm,
    onAllocate,
    submitting = false
}: ShipmentExpensesProps) {
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [receivedQuantities, setReceivedQuantities] = useState<Record<number, number>>({});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [overheadTypes, setOverheadTypes] = useState<any[]>([]);

    useEffect(() => {
        const loadOverheadTypes = async () => {
            try {
                const res = await fetch("/api/manufacturing/finished-goods/overhead-types");
                if (res.ok) {
                    const data = await res.json();
                    setOverheadTypes(data || []);
                }
            } catch (e) {
                console.error("Failed to load overhead types", e);
            }
        };
        loadOverheadTypes();
    }, []);
    const handleAddExpenseRow = () => {
        setAllocationForm({
            ...allocationForm,
            expenses: [...allocationForm.expenses, { overhead_id: "", expense_type: "", amount_php: "" }]
        });
    };

    const handleRemoveExpenseRow = (index: number) => {
        const copy = [...allocationForm.expenses];
        copy.splice(index, 1);
        setAllocationForm({ ...allocationForm, expenses: copy });
    };

    const handleExpenseChange = (index: number, field: string, value: string) => {
        const copy = [...allocationForm.expenses];
        if (field === "overhead_id") {
            const selectedOverhead = overheadTypes.find(ot => String(ot.id) === value);
            copy[index] = {
                ...copy[index],
                overhead_id: value,
                expense_type: selectedOverhead ? selectedOverhead.overhead_name : ""
            };
        } else {
            copy[index] = { ...copy[index], [field]: value };
        }
        setAllocationForm({ ...allocationForm, expenses: copy });
    };

    const totalAllocatedExpenses = expenses.reduce((sum, item) => sum + Number(item.amount_php || 0), 0);
    const isReceivedOrQA = shipment.status === "Received" || shipment.status === "Receiving (QA)";
    const totalManifestQty = lines.reduce((sum, item) => {
        const qty = isReceivedOrQA ? Number(item.quantity_received || 0) : Number(item.quantity_ordered || 0);
        return sum + qty;
    }, 0);
    const totalPhpFob = lines.reduce((sum, item) => {
        const qty = isReceivedOrQA ? Number(item.quantity_received || 0) : Number(item.quantity_ordered || 0);
        return sum + (qty * Number(item.base_unit_cost_php || 0));
    }, 0);

    const rmQuantity = lines.reduce((sum, line) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prod = line.product_id as any;
        const isPackaging = Number(prod?.product_type) === 390 || prod?.product_category === "Packaging";
        if (!isPackaging) {
            return sum + (isReceivedOrQA ? Number(line.quantity_received || 0) : Number(line.quantity_ordered || 0));
        }
        return sum;
    }, 0);

    const pkgWeight = lines.reduce((sum, line) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prod = line.product_id as any;
        const isPackaging = Number(prod?.product_type) === 390 || prod?.product_category === "Packaging";
        if (isPackaging) {
            const qty = isReceivedOrQA ? Number(line.quantity_received || 0) : Number(line.quantity_ordered || 0);
            return sum + (qty * Number(prod?.weight || 0));
        }
        return sum;
    }, 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4 bg-muted/20 border p-5 rounded-xl">
                <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Landed Cost Engine - Current Active Container</span>
                    <h2 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                        <Anchor className="h-4 w-4 text-primary" />
                        PO/BL Ref: {shipment.reference_number}
                    </h2>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/95 text-primary-foreground font-bold px-3.5 py-2 rounded-lg text-xs shadow-sm transition-all"
                    >
                        <Calculator className="h-4 w-4" /> Run Landed Cost Allocation
                    </button>
                </div>
            </div>

            {/* Layout grids */}
            <div className="grid gap-6 md:grid-cols-3">
                {/* Stats */}
                <div className="md:col-span-1 space-y-4">
                    <div className="border rounded-xl bg-card p-5 space-y-4 shadow-sm">
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider border-b pb-2 flex items-center gap-1.5">
                            <Scale className="h-4 w-4 text-primary" />
                            Allocation Summary
                        </h3>
                        <div className="space-y-3.5 text-xs">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">FOB Cargo Value</span>
                                <span className="font-semibold text-foreground">₱{totalPhpFob.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Allocated Duties & Arrastre</span>
                                <span className="font-semibold text-emerald-600">₱{totalAllocatedExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2.5 font-bold">
                                <span>Total Acquisition Value</span>
                                <span className="text-foreground">₱{(totalPhpFob + totalAllocatedExpenses).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-[11px] text-muted-foreground">
                                <span>Avg Landed Overhead / Unit</span>
                                <span>₱{totalManifestQty > 0 ? ((totalAllocatedExpenses / totalManifestQty).toFixed(2)) : "0.00"}</span>
                            </div>
                            {(expenses.some(e => e.allocation_method === "Hybrid") || allocationForm?.allocation_method === "Hybrid") && (
                                <div className="flex justify-between items-center text-[11px] text-muted-foreground border-t pt-2.5 mt-2.5">
                                    <span>Hybrid Breakdown</span>
                                    <div className="flex gap-1.5">
                                        <span className="bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded font-bold">RM: {rmQuantity.toLocaleString()}</span>
                                        <span className="bg-orange-500/10 text-orange-600 px-1.5 py-0.5 rounded font-bold">PKG: {pkgWeight.toLocaleString()}kg</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="border rounded-xl bg-card p-5 space-y-3 shadow-sm">
                        <h4 className="text-xs font-bold flex items-center gap-1.5">
                            <Info className="h-4 w-4 text-amber-500" />
                            How Ratios Work
                        </h4>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Expenses are allocated across container items proportionally. Select:
                            <br />• <strong>Commercial Value</strong>: Higher value items shoulder more brokerage fees.
                            <br />• <strong>Weight (KG)</strong>: Heavy items (e.g. raw vegetable oil) carry more trucking weight.
                            <br />• <strong>Volume (CBM)</strong>: Bulky items shoulder more sea freight volume.
                            <br />• <strong>Hybrid</strong>: Raw Materials use Quantity, Packaging items use Weight.
                        </p>
                    </div>
                </div>

                {/* Allocated Line Items Results */}
                <div className="md:col-span-2 space-y-4">
                    <div className="border rounded-xl bg-card p-5 space-y-4 shadow-sm">
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
                            <Layers className="h-4 w-4 text-primary" />
                            Landed Costs Allocated per Manifest Line
                        </h3>

                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="bg-muted/50 border-b">
                                        <th className="p-3 font-semibold text-muted-foreground">Ingredient</th>
                                        <th className="p-3 font-semibold text-muted-foreground text-right">Qty Ordered</th>
                                        <th className="p-3 font-semibold text-muted-foreground text-right text-purple-600 bg-purple-500/5 font-bold">Qty Accepted (QA)</th>
                                        <th className="p-3 font-semibold text-muted-foreground text-right">Base FOB Unit</th>
                                        <th className="p-3 font-semibold text-muted-foreground text-right text-emerald-600 bg-emerald-500/5 font-bold">Landed Unit Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {lines.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                                No container manifest records found.
                                            </td>
                                        </tr>
                                    ) : (
                                        lines.map(line => {
                                            const prod = line.product_id && typeof line.product_id === "object"
                                                ? line.product_id
                                                : { product_name: `ID: ${line.product_id}`, unit_of_measurement: { unit_shortcut: "PCS" } };
                                            return (
                                                <tr key={line.line_id} className="hover:bg-muted/20">
                                                    <td className="p-3 font-medium text-foreground">{prod.product_name}</td>
                                                    <td className="p-3 text-right text-muted-foreground">
                                                        {Number(line.quantity_ordered || 0).toLocaleString()} {prod.unit_of_measurement?.unit_shortcut || "PCS"}
                                                    </td>
                                                    <td className="p-3 text-right font-bold text-purple-600 dark:text-purple-400 bg-purple-500/5">
                                                        {shipment.status === "Ordered" || shipment.status === "Approved" || shipment.status === "En Route" ? (
                                                            <span className="text-[9px] uppercase font-bold italic tracking-wide text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">Pending QA</span>
                                                        ) : (
                                                            `${Number(line.quantity_received).toLocaleString()} ${prod.unit_of_measurement?.unit_shortcut || "PCS"}`
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-muted-foreground">
                                                        ₱{Number(line.base_unit_cost_php).toFixed(2)}
                                                    </td>
                                                    <td className="p-3 text-right font-mono font-bold bg-emerald-500/5 text-emerald-600 dark:text-emerald-400">
                                                        ₱{Number(line.final_landed_unit_cost || line.base_unit_cost_php).toFixed(2)}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal for Expense Logging & Allocation */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-card text-foreground w-full max-w-xl border rounded-xl shadow-lg p-6 space-y-4 max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between border-b pb-3 shrink-0">
                            <h3 className="font-bold text-sm flex items-center gap-2">
                                <Landmark className="h-4.5 w-4.5 text-primary" />
                                Landed Cost Allocation Engine
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-muted-foreground hover:text-foreground text-xs font-bold"
                            >
                                Close
                            </button>
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                // Validate all rows have expense type and amount
                                for (let i = 0; i < allocationForm.expenses.length; i++) {
                                    const exp = allocationForm.expenses[i];
                                    if (!exp.overhead_id) {
                                        toast.error(`Please select an Expense Type for row ${i + 1}`);
                                        return;
                                    }
                                    if (!exp.amount_php || Number(exp.amount_php) <= 0) {
                                        toast.error(`Please enter a valid amount for row ${i + 1}`);
                                        return;
                                    }
                                }
                                
                                if (allocationForm.allocation_method === "Hybrid") {
                                    const missingWeight = lines.some((line) => {
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const prod = line.product_id as any;
                                        const isPackaging = Number(prod?.product_type) === 390 || prod?.product_category === "Packaging";
                                        return isPackaging && (!prod?.weight || Number(prod?.weight) <= 0);
                                    });
                                    if (missingWeight) {
                                        toast.error("One or more packaging items are missing a gross weight needed for Hybrid allocation.");
                                        return;
                                    }
                                }
                                
                                onAllocate(e, shipment.shipment_id, "Received");
                            }}
                            className="space-y-4 overflow-y-auto pr-1 flex-1"
                        >
                            <div className="space-y-1.5 bg-muted/20 p-4 rounded-xl border">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Allocation Logic Method</label>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    {["Value", "Weight", "Volume", "Hybrid"].map((method) => (
                                        <button
                                            key={method}
                                            type="button"
                                            onClick={() => setAllocationForm({ ...allocationForm, allocation_method: method })}
                                            className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${allocationForm.allocation_method === method
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "bg-background border-border hover:bg-muted"
                                                }`}
                                        >
                                            {method === "Value" ? "Commercial Value" : method === "Hybrid" ? "Hybrid (RM: Quantity / PKG: Weight)" : method}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Expense rows */}
                            <div className="space-y-3 pt-3 border-t">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Duties, Logistics, Brokerage Expenses</h4>
                                    <button
                                        type="button"
                                        onClick={handleAddExpenseRow}
                                        className="inline-flex items-center gap-1 text-primary hover:text-primary/80 text-xs font-semibold"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Add expense
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                                        <div className="flex-1">Expense Type <span className="text-red-500">*</span></div>
                                        <div className="w-1/3">Amount (PHP) <span className="text-red-500">*</span></div>
                                        {allocationForm.expenses.length > 1 && <div className="w-[48px]" />}
                                    </div>
                                    {allocationForm.expenses.map((exp: { overhead_id?: number | string; amount_php?: string | number }, idx: number) => (
                                        <div key={idx} className="flex gap-3 items-center">
                                            <div className="flex-1">
                                                <CreatableSelect
                                                    options={overheadTypes
                                                        .filter((ot) => {
                                                            // Filter out already selected expense types on other rows
                                                            return !allocationForm.expenses.some((e: { overhead_id?: number | string }, i: number) => i !== idx && String(e.overhead_id) === String(ot.id));
                                                        })
                                                        .map((ot) => ({
                                                            value: String(ot.id),
                                                            label: ot.overhead_name
                                                        }))}
                                                    value={exp.overhead_id ? String(exp.overhead_id) : ""}
                                                    onValueChange={(val) => handleExpenseChange(idx, "overhead_id", val)}
                                                    placeholder="Select Charge Type..."
                                                    className="h-9 text-xs w-full bg-background font-semibold"
                                                />
                                            </div>

                                            <div className="w-1/3">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    required
                                                    placeholder="Amount (PHP)"
                                                    value={exp.amount_php}
                                                    onChange={e => handleExpenseChange(idx, "amount_php", e.target.value)}
                                                    className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs font-mono h-9"
                                                />
                                            </div>

                                            {allocationForm.expenses.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveExpenseRow(idx)}
                                                    className="text-red-500 hover:text-red-600 text-xs font-bold px-1"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                             <button
                                 type="submit"
                                 disabled={submitting}
                                 className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-wait py-3 text-xs font-bold text-white transition-all shadow-md shrink-0 mt-4"
                             >
                                 {submitting ? (
                                     <>
                                         <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                                     </>
                                 ) : (
                                     <>
                                         <Check className="h-4.5 w-4.5" /> Commit Landed Costs & Close Cargo
                                     </>
                                 )}
                             </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
