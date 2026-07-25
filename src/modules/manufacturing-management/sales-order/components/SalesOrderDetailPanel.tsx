/* eslint-disable */
// disabled-lint-next-line @typescript-eslint/no-unused-vars
import React, { useState, useEffect } from "react";
import { 
    Loader2, AlertCircle, Building2, 
    FileText, CreditCard, Calendar, Check, Minus, Plus,
    ShieldCheck, PackageCheck, X, CheckCircle2, PackageOpen, Save, Send 
} from "lucide-react";
import { toast } from "sonner";
import { SalesOrder, SalesOrderDetail } from "../types";
import { formatCurrency } from "@/lib/utils";

interface SalesOrderDetailPanelProps {
    selectedOrder: SalesOrder | null;
    setSelectedOrder: (order: SalesOrder | null) => void;
    orderDetails: SalesOrderDetail[];
    loadingDetails: boolean;
    updatingStatusId: number | null;
    handleApproveOrder: (orderId: number) => void;
    handleUpdateQuantities: (orderId: number, details: { detail_id: number; ordered_quantity: number }[]) => Promise<void>;
    handleSubmitForApproval: (orderId: number) => Promise<void>;
    onOrderUpdated?: () => void;
}

export function SalesOrderDetailPanel({
    selectedOrder,
    setSelectedOrder,
    orderDetails,
    loadingDetails,
    updatingStatusId,
    handleApproveOrder,
    handleUpdateQuantities,
    handleSubmitForApproval,
    onOrderUpdated
}: SalesOrderDetailPanelProps) {
    const [editableQuantities, setEditableQuantities] = useState<Record<number, number>>({});
    const [savingQuantities, setSavingQuantities] = useState(false);
    const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);

    // Sync initial quantities when orderDetails changes or panel opens
    useEffect(() => {
        if (orderDetails.length > 0) {
            const initialMap: Record<number, number> = {};
            orderDetails.forEach(item => {
                initialMap[item.detail_id] = item.ordered_quantity;
            });
            setEditableQuantities(initialMap);
        } else {
            setEditableQuantities({});
        }
    }, [orderDetails]);

    if (!selectedOrder) {
        return (
            <div className="border border-dashed rounded-xl p-8 text-center text-muted-foreground text-xs bg-card/50">
                <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                Select a Sales Order from the list to view detailed items and financial breakdown.
            </div>
        );
    }

    const isEditable = selectedOrder.order_status === "Draft" || selectedOrder.order_status === "Pending";

    // Compute pricing sums dynamically using editable quantities if present
    const grossSum = orderDetails.reduce((acc, item) => {
        const qty = editableQuantities[item.detail_id] ?? item.ordered_quantity;
        return acc + (item.unit_price * qty);
    }, 0);
    const discount = Number(selectedOrder.discount_amount || 0);
    const netSum = Math.max(0, grossSum - discount);

    // Check if any quantity has been edited from initial orderDetails
    const hasChanges = isEditable && orderDetails.some(item => {
        const current = editableQuantities[item.detail_id];
        return current !== undefined && current !== item.ordered_quantity;
    });

    const handleSaveQuantities = async () => {
        setSavingQuantities(true);
        try {
            const detailsPayload = orderDetails.map(item => ({
                detail_id: item.detail_id,
                ordered_quantity: editableQuantities[item.detail_id] ?? item.ordered_quantity
            }));
            await handleUpdateQuantities(selectedOrder.order_id, detailsPayload);
            if (onOrderUpdated) {
                onOrderUpdated();
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error saving quantities";
            toast.error(msg);
        } finally {
            setSavingQuantities(false);
        }
    };

    const incrementQty = (detailId: number, current: number) => {
        setEditableQuantities(prev => ({
            ...prev,
            [detailId]: (current || 0) + 1
        }));
    };

    const decrementQty = (detailId: number, current: number) => {
        if (current <= 1) return;
        setEditableQuantities(prev => ({
            ...prev,
            [detailId]: current - 1
        }));
    };

    return (
        <div className="border border-border rounded-2xl bg-card p-6 shadow-sm space-y-6">
            {/* Header info */}
            <div className="flex justify-between items-start border-b border-border pb-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <h4 className="text-sm font-black text-foreground uppercase tracking-wider">
                            {selectedOrder.order_no}
                        </h4>
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider whitespace-nowrap ${
                            selectedOrder.order_status === "Draft"
                                ? "bg-muted text-foreground border border-border"
                                : selectedOrder.order_status === "Pending"
                                ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20"
                                : selectedOrder.order_status === "For Approval"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        }`}>
                            {selectedOrder.order_status || "Draft"}
                        </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Sales Order Overview & Line Items</p>
                </div>
                <button
                    onClick={() => setSelectedOrder(null)}
                    className="text-muted-foreground hover:text-foreground text-xs font-bold px-2.5 py-1.5 rounded-lg hover:bg-muted transition-all cursor-pointer border-none bg-transparent"
                >
                    Close
                </button>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-3.5 bg-muted/50 p-4.5 rounded-xl border border-border text-xs">
                <div className="space-y-1 col-span-2">
                    <span className="text-muted-foreground block text-[9.5px] font-bold uppercase tracking-wider">Customer</span>
                    <span className="font-extrabold text-foreground flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        {selectedOrder.customer_name ? (
                            <span>
                                {selectedOrder.customer_name}{" "}
                                <span className="text-[9.5px] font-mono text-muted-foreground font-normal">({selectedOrder.customer_code})</span>
                            </span>
                        ) : (
                            selectedOrder.customer_code
                        )}
                    </span>
                </div>
                
                <div className="space-y-1">
                    <span className="text-muted-foreground block text-[9.5px] font-bold uppercase tracking-wider">PO Number</span>
                    <span className="font-bold text-foreground flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {selectedOrder.po_no || <span className="text-muted-foreground italic font-normal">N/A</span>}
                    </span>
                </div>

                <div className="space-y-1">
                    <span className="text-muted-foreground block text-[9.5px] font-bold uppercase tracking-wider">Payment Terms</span>
                    <span className="font-bold text-foreground flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        {selectedOrder.payment_terms ? `${selectedOrder.payment_terms} Days` : "COD"}
                    </span>
                </div>

                <div className="space-y-1">
                    <span className="text-muted-foreground block text-[9.5px] font-bold uppercase tracking-wider">Order Date</span>
                    <span className="font-bold text-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {selectedOrder.order_date ? new Date(selectedOrder.order_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A"}
                    </span>
                </div>

                <div className="space-y-1">
                    <span className="text-muted-foreground block text-[9.5px] font-bold uppercase tracking-wider">Delivery Date</span>
                    <span className="font-bold text-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {selectedOrder.delivery_date ? new Date(selectedOrder.delivery_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : <span className="text-muted-foreground italic font-normal">N/A</span>}
                    </span>
                </div>

                {selectedOrder.remarks && (
                    <div className="space-y-1 col-span-2 pt-3 border-t border-border border-dashed mt-1.5">
                        <span className="text-muted-foreground block text-[9.5px] font-bold uppercase tracking-wider">Remarks / Notes</span>
                        <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                            &ldquo;{selectedOrder.remarks}&rdquo;
                        </p>
                    </div>
                )}
            </div>

            {/* Line items section */}
            <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                    <h5 className="text-[9.5px] font-extrabold uppercase text-muted-foreground tracking-wider">
                        Agreement Line Items
                    </h5>
                    {hasChanges && (
                        <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Unsaved Changes
                        </span>
                    )}
                </div>

                {loadingDetails ? (
                    <div className="flex flex-col items-center justify-center p-12 gap-2 border border-dashed rounded-xl bg-muted/50">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span className="text-[10px] text-muted-foreground font-semibold">Fetching agreement items...</span>
                    </div>
                ) : orderDetails.length === 0 ? (
                    <div className="text-center p-8 border border-dashed rounded-xl bg-muted/50 text-xs text-muted-foreground italic">
                        No items logged in detail.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {orderDetails.map(item => {
                            const pId = item.product_id;
                            const name = pId?.product_name || `Product #${item.product_id}`;
                            const code = pId?.product_code || `CODE-${item.product_id}`;
                            const brand = pId?.brand || "N/A";
                            const category = pId?.category || "N/A";
                            const uom = pId?.uom || "PCS";

                            const currentQty = editableQuantities[item.detail_id] ?? item.ordered_quantity;
                            const totalCost = item.unit_price * currentQty;
                            const isChanged = currentQty !== item.ordered_quantity;

                            const bomVersionName = item.bom_version_name;
                            const hasBomVersion = Boolean(bomVersionName && bomVersionName.trim() !== "");

                            return (
                                <div 
                                    key={item.detail_id} 
                                    className={`border rounded-xl p-4 transition-all duration-200 flex flex-col justify-between gap-3 ${
                                        isChanged 
                                            ? "bg-amber-500/5 border-amber-500/30" 
                                            : "bg-background border-border hover:border-primary/50"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2.5">
                                        <div className="space-y-1.5">
                                            <div className="text-xs font-bold text-foreground leading-snug">{name}</div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-[9px] font-mono bg-muted border border-border px-1.5 py-0.2 rounded text-muted-foreground uppercase font-semibold">
                                                    {code}
                                                </span>
                                                {hasBomVersion ? (
                                                    <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.2 rounded font-bold">
                                                        {bomVersionName}
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] bg-muted text-muted-foreground border border-border px-1.5 py-0.2 rounded font-medium italic">
                                                        No Version
                                                    </span>
                                                )}
                                                {brand !== "N/A" && (
                                                    <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.2 rounded font-semibold">
                                                        {brand}
                                                    </span>
                                                )}
                                                {category !== "N/A" && (
                                                    <span className="text-[9px] bg-muted px-1.5 py-0.2 rounded text-muted-foreground font-semibold">
                                                        {category}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-xs font-black text-foreground font-mono">
                                                {formatCurrency(totalCost)}
                                            </div>
                                            <div className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                                                {formatCurrency(item.unit_price)} / {uom}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2.5 border-t border-border border-dashed">
                                        <span className="text-[9.5px] text-muted-foreground font-bold uppercase tracking-wider">
                                            Quantity
                                        </span>
                                        <div className="flex items-center gap-2.5">
                                            {isChanged && (
                                                <span className="text-[9px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-black font-mono uppercase tracking-wider">
                                                    Was {item.ordered_quantity}
                                                </span>
                                            )}
                                            {isEditable ? (
                                                <div className="flex items-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => decrementQty(item.detail_id, currentQty)}
                                                        className="h-7 w-7 rounded-l-lg border border-border bg-background hover:bg-muted text-muted-foreground flex items-center justify-center transition-all font-bold cursor-pointer"
                                                    >
                                                        <Minus className="h-3.5 w-3.5" />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={currentQty}
                                                        onChange={e => {
                                                            const val = parseInt(e.target.value);
                                                            setEditableQuantities(prev => ({
                                                                ...prev,
                                                                [item.detail_id]: isNaN(val) ? 1 : Math.max(1, val)
                                                            }));
                                                        }}
                                                        className="h-7 w-12 border-y border-border bg-background text-center text-xs font-bold text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => incrementQty(item.detail_id, currentQty)}
                                                        className="h-7 w-7 rounded-r-lg border border-border bg-background hover:bg-muted text-muted-foreground flex items-center justify-center transition-all font-bold cursor-pointer"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs font-extrabold text-foreground font-mono">
                                                    {item.ordered_quantity} <span className="text-[10px] text-muted-foreground font-normal">{uom}</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Financial Breakdown card */}
            <div className="bg-card text-card-foreground border border-border rounded-xl p-4.5 space-y-3 shadow-xs relative overflow-hidden">
                <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-medium">Subtotal Gross</span>
                    <span className="font-bold font-mono">
                        {formatCurrency(grossSum)}
                    </span>
                </div>
                {selectedOrder.discount_amount ? (
                    <div className="flex justify-between items-center text-xs text-destructive">
                        <span className="font-medium">Discount Code</span>
                        <span className="font-bold font-mono">
                            - {formatCurrency(discount)}
                        </span>
                    </div>
                ) : null}
                <div className="border-t border-border my-2 pt-3 flex justify-between items-center">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                        Net Amount Locked
                    </span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                        {formatCurrency(netSum)}
                    </span>
                </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2.5 pt-1">
                {hasChanges && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 leading-relaxed shadow-xs">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                        <span>You have unsaved quantity changes. Press &quot;Save Changes&quot; below to commit them.</span>
                    </div>
                )}

                {isEditable && (
                    <div className="space-y-2">
                        <button
                            disabled={savingQuantities || orderDetails.length === 0 || !hasChanges}
                            onClick={() => handleSaveQuantities()}
                            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold shadow-xs transition-all cursor-pointer ${
                                hasChanges 
                                    ? "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-600 active:scale-[0.98] shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/25"
                                    : "border border-border bg-muted text-muted-foreground cursor-not-allowed opacity-75"
                            }`}
                            title={hasChanges ? "Save quantity edits" : "No quantity changes to save"}
                        >
                            {savingQuantities ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Save className="h-3.5 w-3.5" />
                            )}
                            Save Changes
                        </button>
                        <button
                            disabled={updatingStatusId === selectedOrder.order_id || orderDetails.length === 0 || hasChanges}
                            onClick={() => handleSubmitForApproval(selectedOrder.order_id)}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 py-3 text-xs font-bold text-primary-foreground shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer border-none"
                            title={hasChanges ? "Please save quantity edits before submitting for approval" : ""}
                        >
                            {updatingStatusId === selectedOrder.order_id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Send className="h-3.5 w-3.5" />
                            )}
                            Submit for Approval
                        </button>
                    </div>
                )}


                {selectedOrder && (selectedOrder.order_status === "For Invoicing" || selectedOrder.order_status === "For Picking") && (
                    <button
                        type="button"
                        onClick={() => setIsAllocationModalOpen(true)}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-600/40 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/40 py-3 text-xs font-bold transition-all cursor-pointer active:scale-[0.98] shadow-sm shadow-emerald-500/5"
                    >
                        <ShieldCheck className="h-4 w-4" />
                        Check FIFO Lot Allocation
                    </button>
                )}

            </div>
            <FIFOAllocationModal 
                isOpen={isAllocationModalOpen} 
                onClose={() => setIsAllocationModalOpen(false)} 
                selectedOrder={selectedOrder} 
                orderDetails={orderDetails} 
            />
        </div>
    );
}

interface FIFOAllocationModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedOrder: SalesOrder;
    orderDetails: SalesOrderDetail[];
}

function FIFOAllocationModal({ isOpen, onClose, selectedOrder, orderDetails }: FIFOAllocationModalProps) {
    const [loading, setLoading] = useState(false);
    const [batches, setBatches] = useState<any[]>([]);
    const [branches, setBranches] = useState<any[]>([]);
    const [targetBranchId, setTargetBranchId] = useState<number | string>("");
    const [executing, setExecuting] = useState(false);

    useEffect(() => {
        if (!isOpen || !selectedOrder) return;
        
        async function fetchInventoryData() {
            setLoading(true);
            try {
                const res = await fetch("/api/manufacturing/inventory");
                if (res.ok) {
                    const data = await res.json();
                    setBatches(data.batches || []);
                    setBranches(data.branches || []);
                    
                    const orderBranch = selectedOrder.branch_id;
                    if (orderBranch) {
                        setTargetBranchId(orderBranch);
                    } else if (data.branches && data.branches.length > 0) {
                        setTargetBranchId(data.branches[0].branch_id || data.branches[0].id);
                    }
                }
            } catch (e) {
                console.error("Failed to load inventory data:", e);
                toast.error("Failed to load inventory data");
            } finally {
                setLoading(false);
            }
        }
        
        fetchInventoryData();
    }, [isOpen, selectedOrder]);

    if (!isOpen) return null;

    // Calculate allocations for each item
    const previewData = orderDetails.map(detail => {
        const prodId = detail.product_id.product_id;
        const prodName = detail.product_id.product_name;
        const prodCode = detail.product_id.product_code;
        const ordered = detail.ordered_quantity;
        
        // Filter lots for the target branch and product
        const prodLots = batches.filter(b => 
            Number(b.product_id) === prodId && 
            Number(b.branch_id) === Number(targetBranchId) && 
            b.qa_status === "Passed" && 
            Number(b.quantity_received) > 0
        );
        
        // FIFO sorting: earliest expiry first, then by line_id
        const sortedLots = [...prodLots].sort((a, b) => {
            if (a.expiration_date && b.expiration_date) {
                return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
            }
            if (a.expiration_date) return -1;
            if (b.expiration_date) return 1;
            return Number(a.line_id) - Number(b.line_id);
        });
        
        let remaining = ordered;
        const allocatedLots: any[] = [];
        let totalAvailable = 0;
        
        sortedLots.forEach(lot => {
            const avail = Number(lot.quantity_received);
            totalAvailable += avail;
            if (remaining <= 0) return;
            
            const take = Math.min(avail, remaining);
            if (take > 0) {
                allocatedLots.push({
                    lotNumber: lot.lot_number,
                    expirationDate: lot.expiration_date,
                    availableQty: avail,
                    allocatedQty: take
                });
                remaining -= take;
            }
        });
        
        return {
            productId: prodId,
            productName: prodName,
            productCode: prodCode,
            orderedQty: ordered,
            availableQty: totalAvailable,
            allocatedLots,
            shortfall: remaining
        };
    });

    const hasAllocations = previewData.some(item => item.allocatedLots.length > 0);
    const selectedBranch = branches.find(b => Number(b.branch_id || b.id) === Number(targetBranchId));
    const branchName = selectedBranch ? (selectedBranch.branch_name || selectedBranch.name) : `Branch #${targetBranchId}`;

    const handleExecuteAllocation = async () => {
        if (!selectedOrder || !targetBranchId) return;
        setExecuting(true);
        try {
            for (const item of previewData) {
                if (item.allocatedLots.length === 0) continue;
                
                const detail = orderDetails.find(d => d.product_id.product_id === item.productId);
                if (!detail) continue;
                
                const payload = {
                    branchId: Number(targetBranchId),
                    productId: item.productId,
                    recipeVersionId: detail.bom_version_id || 1,
                    lines: [
                        {
                            detail_id: detail.detail_id,
                            ordered_quantity: detail.ordered_quantity
                        }
                    ]
                };
                
                const res = await fetch("/api/manufacturing/planning-engineering", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "direct-allocate",
                        ...payload
                    })
                });
                
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || `Failed to allocate ${item.productName}`);
                }
            }
            
            toast.success("Direct inventory allocation executed successfully!");
            onClose();
            window.location.reload();
        } catch (e: any) {
            console.error("Error during direct allocation:", e);
            toast.error(e.message || "Failed to execute inventory allocation.");
        } finally {
            setExecuting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
            <div className="bg-card border rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden max-h-[85vh] flex flex-col scale-100 transition-all duration-200 animate-in zoom-in-95">
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-muted/10">
                    <div>
                        <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                            <PackageCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            FIFO Finished Goods Allocation Check
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Previewing lot-by-lot allocation for Sales Order <span className="font-mono font-bold text-primary">{selectedOrder.order_no}</span>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-all cursor-pointer"
                        aria-label="Close dialog"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Sub-Header / Settings */}
                <div className="p-4 bg-muted/30 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-muted-foreground">Select Branch:</span>
                        <select
                            value={targetBranchId}
                            onChange={(e) => setTargetBranchId(Number(e.target.value))}
                            className="bg-background border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary focus:border-primary font-semibold"
                        >
                            {branches.map(b => (
                                <option key={b.branch_id || b.id} value={b.branch_id || b.id}>
                                    {b.branch_name || b.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-semibold">
                        Order Status: <span className="text-foreground">{selectedOrder.order_status}</span>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto space-y-4 flex-1">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-xs gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span>Loading branch inventory lots...</span>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {previewData.map(item => {
                                const isFullyAllocated = item.shortfall === 0;
                                return (
                                    <div key={item.productId} className="border rounded-xl p-4 bg-muted/20 hover:bg-muted/30 transition-all space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-bold text-xs text-foreground">{item.productName}</h4>
                                                <p className="text-[10px] text-muted-foreground font-mono font-semibold">{item.productCode}</p>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs font-bold text-foreground">
                                                    Required: <span className="font-mono">{item.orderedQty.toLocaleString()}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 mt-0.5 justify-end">
                                                    {isFullyAllocated ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full dark:bg-emerald-950/20 dark:text-emerald-400">
                                                            <CheckCircle2 className="h-3 w-3" />
                                                            Fully Covered
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full dark:bg-amber-950/20 dark:text-amber-400">
                                                            <AlertCircle className="h-3 w-3" />
                                                            Shortage: {item.shortfall.toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Lot table */}
                                        {item.allocatedLots.length > 0 ? (
                                            <div className="border rounded-lg overflow-hidden bg-background">
                                                <table className="w-full text-[11px] text-left">
                                                    <thead className="bg-muted/50 border-b font-semibold text-muted-foreground">
                                                        <tr>
                                                            <th className="p-2">Lot Number</th>
                                                            <th className="p-2">Expiry Date</th>
                                                            <th className="p-2 text-right">Available</th>
                                                            <th className="p-2 text-right text-emerald-600">Allocated</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y font-medium">
                                                        {item.allocatedLots.map((lot, idx) => (
                                                            <tr key={idx} className="hover:bg-muted/10">
                                                                <td className="p-2 font-mono font-bold text-foreground">{lot.lotNumber}</td>
                                                                <td className="p-2 text-muted-foreground">
                                                                    {lot.expirationDate ? new Date(lot.expirationDate).toLocaleDateString() : "No Expiry"}
                                                                </td>
                                                                <td className="p-2 text-right font-mono">{lot.availableQty.toLocaleString()}</td>
                                                                <td className="p-2 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50/5">
                                                                    {lot.allocatedQty.toLocaleString()}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="border border-dashed rounded-lg p-3 text-center text-[11px] text-muted-foreground bg-background/50">
                                                <PackageOpen className="h-5 w-5 text-muted-foreground/30 mx-auto mb-1" />
                                                No passed finished goods lots found in {branchName}.
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-muted/10 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-bold border rounded-lg hover:bg-muted transition-all cursor-pointer"
                    >
                        Close
                    </button>
                    {isEditableState(selectedOrder.order_status) && hasAllocations && (
                        <button
                            disabled={executing || loading}
                            onClick={handleExecuteAllocation}
                            className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                            {executing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <PackageCheck className="h-3.5 w-3.5" />
                            )}
                            Confirm & Execute Direct Allocation
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function isEditableState(status: string) {
    return status === "For Invoicing" || status === "For Picking";
}
