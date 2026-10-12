/* eslint-disable */
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Branch, SalesOrderDetail } from "../types";
import { CreateBufferJODialog } from "./CreateBufferJODialog";
import { ReleaseJODialog } from "./ReleaseJODialog";
import { buildSalesOrderReleaseGroups } from "../utils/demand-groups";
import { resolveProductionShiftHours } from "../utils/production-timing";

interface DraftJobOrderEditorProps {
    jobOrder: any;
    branches: Branch[];
    onBack: () => void;
    onSaved: (draft: Record<string, unknown>) => Promise<void> | void;
    onInitialize: () => Promise<boolean> | boolean;
}

function parseObject(value: unknown): Record<string, unknown> {
    let parsed = value;
    if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
}

function parseAssignments(value: unknown): Record<number, number[]> {
    return Object.fromEntries(Object.entries(parseObject(value)).map(([sequence, ids]) => [
        Number(sequence), Array.isArray(ids) ? [...new Set(ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))] : []
    ]).filter(([sequence]) => Number.isSafeInteger(Number(sequence)) && Number(sequence) > 0));
}

function parseVersionMap(value: unknown): Record<number, number> {
    return Object.fromEntries(Object.entries(parseObject(value)).map(([productId, versionId]) => [
        Number(productId), Number(versionId)
    ]).filter(([productId, versionId]) => Number.isSafeInteger(Number(productId)) && Number(productId) > 0 && Number.isSafeInteger(versionId) && Number(versionId) > 0));
}

export function DraftJobOrderEditor({ jobOrder, branches, onBack, onSaved, onInitialize }: DraftJobOrderEditorProps) {
    const [saving, setSaving] = useState(false);
    const [initializing, setInitializing] = useState(false);
    const [targetQuantity, setTargetQuantity] = useState(Number(jobOrder.target_quantity ?? jobOrder.quantity ?? 0));
    const [plannedDate, setPlannedDate] = useState(String(jobOrder.start_date || "").slice(0, 10));
    const [dueDate, setDueDate] = useState(String(jobOrder.due_date || jobOrder.end_date || "").slice(0, 10));
    const [shiftOption, setShiftOption] = useState(String(resolveProductionShiftHours(jobOrder.shiftOption, jobOrder.shift_option)));
    const [priority, setPriority] = useState(Number(jobOrder.priority || 0));
    const [remarks, setRemarks] = useState(String(jobOrder.remarks || ""));
    const [assignments, setAssignments] = useState<Record<number, number[]>>(
        parseAssignments(jobOrder.assignedPersonnel ?? jobOrder.assigned_personnel)
    );
    const jobOrderId = Number(jobOrder.job_order_id || jobOrder.order_id || jobOrder.id || 0);
    const jobOrderNo = String(jobOrder.jo_id || jobOrder.job_order_no || "");
    const branchId = Number(jobOrder.branch_id || 0);
    const productId = Number(jobOrder.product_id || 0);
    const versionId = Number(jobOrder.version_id || 0);
    const isBuffer = !(Array.isArray(jobOrder.salesOrders ?? jobOrder.sales_orders) && (jobOrder.salesOrders ?? jobOrder.sales_orders).length > 0);

    const salesOrderLines = useMemo<SalesOrderDetail[]>(() => {
        const allocations = jobOrder.salesOrders ?? jobOrder.sales_orders ?? [];
        return (Array.isArray(allocations) ? allocations : []).map((allocation: any) => {
            const allocated = Number(allocation.quantity || allocation.allocated_quantity || 0);
            const detailId = Number(allocation.sales_order_detail_id || allocation.detail_id || 0);
            const orderId = Number(allocation.order_id || 0);
            return {
                detail_id: detailId,
                order_id: orderId,
                order_no: String(allocation.order_no || `SO-${orderId}`),
                customer_name: allocation.customer_name || allocation.customer_code || "",
                product_id: {
                    product_id: productId,
                    product_name: String(jobOrder.product_name || `Product #${productId}`),
                    product_code: String(jobOrder.product_code || ""),
                    uom: String(jobOrder.uom_name || jobOrder.uom_shortcut || jobOrder.unit_of_measurement || "units"),
                    uom_id: Number(jobOrder.uom_id || 0) || null,
                    uom_count: Number(jobOrder.unit_of_measurement_count || 1)
                },
                unit_price: 0,
                ordered_quantity: allocated,
                net_amount: 0,
                uom_id: Number(jobOrder.uom_id || 0) || null,
                unit_of_measurement: String(jobOrder.uom_name || jobOrder.uom_shortcut || jobOrder.unit_of_measurement || "units"),
                bom_version_id: versionId,
                bom_version_name: String(jobOrder.version_name || jobOrder.recipe_version_name || `Version #${versionId}`),
                allocated_quantity: allocated,
                served_quantity: 0,
                planned_quantity: 0,
                remaining_quantity: allocated,
                parent_order_status: "In Production",
                is_scheduled: true,
                is_read_only: true
            };
        }).filter((line) => line.detail_id > 0 && line.order_id > 0 && line.ordered_quantity > 0);
    }, [jobOrder, productId, versionId]);

    const releaseGroups = useMemo(() => buildSalesOrderReleaseGroups(salesOrderLines), [salesOrderLines]);
    const branchExists = branches.some((branch) => Number(branch.id) === branchId);

    const persistDraft = async (draft: Record<string, unknown>): Promise<boolean> => {
        if (!jobOrderId || !jobOrderNo) {
            toast.error("This Draft Job Order is missing its saved identifier.");
            return false;
        }
        setSaving(true);
        try {
            const response = await fetch("/api/manufacturing/planning-engineering", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "save-draft", joId: jobOrderId, draft })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success === false) {
                throw new Error(payload?.error || "Failed to save the Draft Job Order.");
            }
            await onSaved(draft);
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save the Draft Job Order.");
            return false;
        } finally {
            setSaving(false);
        }
    };

    if (!branchExists || !productId || (!isBuffer && releaseGroups.length === 0)) {
        return (
            <section className="mx-auto w-full max-w-5xl rounded-2xl border border-border bg-background p-6 text-foreground shadow-sm">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div className="space-y-2">
                        <h1 className="font-semibold">Draft planning details are incomplete</h1>
                        <p className="text-sm text-muted-foreground">
                            {isBuffer
                                ? "The saved product or branch could not be loaded for this Draft. Refresh the planning queue and try again."
                                : "The Sales Order allocation details could not be loaded for this Draft. Its linked allocations must remain intact while editing."}
                        </p>
                        <Button type="button" variant="outline" onClick={onBack}>Back to Planning</Button>
                    </div>
                </div>
            </section>
        );
    }

    if (isBuffer) {
        return (
            <CreateBufferJODialog
                isOpen
                onOpenChange={(open) => { if (!open) onBack(); }}
                branches={branches}
                initialBranchId={branchId}
                onSuccess={() => undefined}
                initialJobOrder={jobOrder}
                onEditDraft={persistDraft}
                onInitializeDraft={async () => Boolean(await onInitialize())}
            />
        );
    }

    const savedSubAssemblyVersions = parseVersionMap(jobOrder.subAssemblyVersionMap ?? jobOrder.sub_assembly_version_map);
    return (
        <ReleaseJODialog
            isConfirmOpen
            setIsConfirmOpen={(open) => { if (!open) onBack(); }}
            selectedLines={salesOrderLines}
            releaseGroups={releaseGroups}
            branches={branches}
            selectedBranchId={branchId}
            joNumber={jobOrderNo}
            setJoNumber={() => undefined}
            targetQuantity={targetQuantity}
            setTargetQuantity={setTargetQuantity}
            plannedDate={plannedDate}
            setPlannedDate={setPlannedDate}
            dueDate={dueDate}
            setDueDate={setDueDate}
            shiftOption={shiftOption}
            setShiftOption={setShiftOption}
            priority={priority}
            setPriority={setPriority}
            remarks={remarks}
            setRemarks={setRemarks}
            releasingJO={saving || initializing}
            handleConfirmRelease={() => undefined}
            assignments={assignments}
            setAssignments={setAssignments}
            isEditingDraft
            lockSubAssemblyVersions
            onEditDraft={async (draft, initialize) => {
                const saved = await persistDraft({
                    ...draft,
                    subAssemblyVersionMap: savedSubAssemblyVersions
                });
                if (!saved) return false;
                if (!initialize) {
                    toast.success(`Job Order ${jobOrderNo} saved as Draft.`);
                    return true;
                }
                setInitializing(true);
                try {
                    const initialized = Boolean(await onInitialize());
                    if (initialized) onBack();
                    return initialized;
                } finally {
                    setInitializing(false);
                }
            }}
            initialSubAssemblyVersions={savedSubAssemblyVersions}
        />
    );
}
