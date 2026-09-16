/* eslint-disable */
import React, { useState, useEffect, useCallback } from "react";
import {
    User,
    Clock,
    DollarSign,
    AlertTriangle,
    ClipboardCheck,
    Printer,
    Tag,
    MapPin,
    Layers,
    ShieldAlert,
    Trash2,
    PackagePlus,
    CheckCircle2,
    ImageIcon,
    X
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RoutingTask, JobOrder, User as UserType, RouteOperatorRecord, RejectionReason, ProductionMaterialReservation } from "../types";
import { submitShiftRunLog, ShiftRunLogPayload, fetchRejectionReasons } from "../services/production-api";
import { validateProductionYieldImage } from "../services/production-yield-image";
import { AddReservedMaterialDialog, type TopUpTarget } from "./AddReservedMaterialDialog";
import { toast } from "sonner";

interface JobOrderShiftLogModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedJobOrder: JobOrder;
    sortedTasks: RoutingTask[];
    activeStep: RoutingTask | null;
    users: UserType[];
    allJobOperators: RouteOperatorRecord[];
    onSuccess?: () => void;
}

export function JobOrderShiftLogModal({
    open,
    onOpenChange,
    selectedJobOrder,
    sortedTasks,
    activeStep,
    users,
    allJobOperators,
    onSuccess
}: JobOrderShiftLogModalProps) {
    const [shiftName, setShiftName] = useState("Shift 1 - Day");
    const [productionDay, setProductionDay] = useState("1");
    const [productionDate, setProductionDate] = useState("");
    const [sessionKey, setSessionKey] = useState("");
    const [shiftYieldQty, setShiftYieldQty] = useState("");
    const [rejectedQty, setRejectedQty] = useState("0");
    const [scrapQty, setScrapQty] = useState("0");
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [selectedReasonId, setSelectedReasonId] = useState<string>("");
    const [rejectionRemarks, setRejectionRemarks] = useState("");
    const [remarks, setRemarks] = useState("");
    const [varianceReason, setVarianceReason] = useState("");
    const [approveVariance, setApproveVariance] = useState(false);
    const [shiftMaterials, setShiftMaterials] = useState<ProductionMaterialReservation[]>([]);
    const [materialsLoadError, setMaterialsLoadError] = useState<string | null>(null);
    const [loadingShiftMaterials, setLoadingShiftMaterials] = useState(false);
    const [submittingShiftLog, setSubmittingShiftLog] = useState(false);
    const [insufficiencyError, setInsufficiencyError] = useState<string | null>(null);
    const [isInsufficiencyOpen, setIsInsufficiencyOpen] = useState(false);
    const [targetTaskId, setTargetTaskId] = useState<number>(0);
    const [topUpTarget, setTopUpTarget] = useState<TopUpTarget | null>(null);
    const [isTopUpOpen, setIsTopUpOpen] = useState(false);
    const [evidenceImage, setEvidenceImage] = useState<File | null>(null);
    const [evidenceImageError, setEvidenceImageError] = useState<string | null>(null);
    const [evidenceImagePreview, setEvidenceImagePreview] = useState<string | null>(null);

    const selectedTask = sortedTasks.find((task) => task.id === targetTaskId) || activeStep;
    const stationId = Number(selectedJobOrder?.primary_work_center_id || 0) || null;
    const stationLabel = selectedJobOrder?.primary_work_center_name
        || (stationId ? `Work Center #${stationId}` : "Unassigned");

    const totalPlannedHours = selectedJobOrder?.routing_tasks 
        ? selectedJobOrder.routing_tasks.reduce((sum, t) => sum + Number(t.planned_setup_hours || 0) + Number(t.planned_run_hours || 0), 0)
        : 0;
    const shiftHours = Number(selectedJobOrder?.shiftOption || 8);
    const estDays = Math.ceil(totalPlannedHours / shiftHours) || 1;

    const getUserLabel = (uId: number) => {
        const u = users.find((x) => (x.user_id || x.id) === uId);
        if (!u) return `Operator #${uId}`;
        const fname = u.user_fname || u.first_name || "";
        const lname = u.user_lname || u.last_name || "";
        return `${fname} ${lname}`.trim() || `User #${uId}`;
    };

    const activeOperator = allJobOperators.find((operator) => operator.stopped_at === null);
    const operatorLabel = activeOperator ? getUserLabel(activeOperator.user_id) : "Authenticated operator";

    useEffect(() => {
        if (!evidenceImage) {
            setEvidenceImagePreview(null);
            return;
        }

        const previewUrl = URL.createObjectURL(evidenceImage);
        setEvidenceImagePreview(previewUrl);
        return () => URL.revokeObjectURL(previewUrl);
    }, [evidenceImage]);

    const handleEvidenceImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null;
        event.target.value = "";
        if (!file) return;

        const validationError = validateProductionYieldImage(file);
        setEvidenceImageError(validationError);
        setEvidenceImage(validationError ? null : file);
    };

    const removeEvidenceImage = () => {
        setEvidenceImage(null);
        setEvidenceImageError(null);
    };

    const getAvailableShifts = useCallback(() => {
        const hours = Number(selectedJobOrder?.shiftOption || 8);
        const options = [];
        if (hours > 0) {
            options.push({ value: "Shift 1 - Day", label: "Shift 1 - Day (6AM - 2PM)" });
        }
        if (hours > 8) {
            options.push({ value: "Shift 2 - Swing", label: "Shift 2 - Swing (2PM - 10PM)" });
        }
        if (hours > 16) {
            options.push({ value: "Shift 3 - Night", label: "Shift 3 - Night (10PM - 6AM)" });
        }
        options.push({ value: "Daily Summary", label: "Daily Summary / Continuous Run" });
        return options;
    }, [selectedJobOrder]);

    const loadShiftMaterials = useCallback(async () => {
        const joId = selectedJobOrder?.order_id || selectedJobOrder?.job_order_id;
        if (!joId) return;

        setLoadingShiftMaterials(true);
        setMaterialsLoadError(null);

        try {
            const response = await fetch(`/api/manufacturing/planning-engineering?action=job-materials&joId=${joId}&_t=${Date.now()}`);
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || `Failed to load Job Order materials (${response.status})`);
            }
            if (!Array.isArray(data)) {
                throw new Error("Job Order materials lookup returned an invalid response");
            }

            const reservationRows = data.flatMap((material: any) => {
                const reservations = Array.isArray(material.reservations) ? material.reservations : [];
                const consumableReservations = reservations.filter((reservation: any) =>
                    String(reservation.reservation_status || "").toUpperCase() === "WIP"
                    && Number(reservation.available_stock || 0) > 0
                );
                if (consumableReservations.length > 0) {
                    return consumableReservations.map((reservation: any) => ({
                        ...reservation,
                        product_name: reservation.product_name || material.product_name,
                        product_code: reservation.product_code || material.product_code,
                        unit_shortcut: reservation.unit_shortcut || material.unit_shortcut || "units",
                        is_sub_assembly: Boolean(material.is_sub_assembly),
                        candidate_lots: Array.isArray(material.candidate_lots) ? material.candidate_lots : [],
                        actual_qty: "0"
                    }));
                }

                return [{
                    ...material,
                    reservation_id: null,
                    reservations: undefined,
                    actual_qty: "0",
                    available_stock: 0,
                    reservation_status: null
                }];
            });
            setShiftMaterials(reservationRows);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load Job Order materials";
            setShiftMaterials([]);
            setMaterialsLoadError(message);
            console.error("Error loading Job BOM materials for shift log:", err);
        } finally {
            setLoadingShiftMaterials(false);
        }
    }, [selectedJobOrder]);

    // Fetch full Job Order BOM materials, physical lots, and rejection reasons
    useEffect(() => {
        if (open && selectedJobOrder && (selectedJobOrder.order_id || selectedJobOrder.job_order_id)) {
            setShiftYieldQty("");
            setRejectedQty("0");
            setScrapQty("0");
            setSelectedReasonId("");
            setRejectionRemarks("");
            setRemarks("");
            setVarianceReason("");
            setApproveVariance(false);
            setEvidenceImage(null);
            setEvidenceImageError(null);
            setShiftMaterials([]);
            setMaterialsLoadError(null);
            setProductionDay("1");
            setTargetTaskId(activeStep?.id ?? (sortedTasks.length > 0 ? sortedTasks[sortedTasks.length - 1].id : 0));
            
            const todayStr = new Date().toISOString().split("T")[0];
            setProductionDate(todayStr);
            setSessionKey(typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `production-session-${Date.now()}`);

            const available = getAvailableShifts();
            if (available.length > 0) {
                setShiftName(available[0].value);
            }

            // Fetch rejection reasons
            fetchRejectionReasons()
                .then((reasons) => setRejectionReasons(reasons))
                .catch((err) => console.error("Error loading rejection reasons:", err));

            // Fetch all BOM materials for the whole Job Order
            void loadShiftMaterials();
        }
    }, [open, selectedJobOrder, getAvailableShifts, loadShiftMaterials]);

    const groupedJobOperators = React.useMemo(() => {
        const groups: Record<number, {
            user_id: number;
            user_position: string;
            hourly_rate: number;
            total_logged_hours: number;
            is_running: boolean;
            active_session: any | null;
            latest_session: any;
            all_sessions: any[];
        }> = {};

        allJobOperators.forEach((op: any) => {
            const userId = op.user_id;
            const isRunning = op.started_at !== null && op.stopped_at === null;
            const hours = Number(op.actual_hours || 0);

            if (!groups[userId]) {
                groups[userId] = {
                    user_id: userId,
                    user_position: op.user_position || "",
                    hourly_rate: Number(op.hourly_rate || 150),
                    total_logged_hours: 0,
                    is_running: false,
                    active_session: null,
                    latest_session: op,
                    all_sessions: []
                };
            }

            const g = groups[userId];
            g.all_sessions.push(op);
            g.total_logged_hours += hours;

            if (isRunning) {
                g.is_running = true;
                g.active_session = op;
            }

            if (op.id > g.latest_session.id) {
                g.latest_session = op;
            }
        });

        return Object.values(groups);
    }, [allJobOperators]);

    const handleShiftYieldChange = (val: string) => {
        setShiftYieldQty(val);
        const qtyNum = Number(val) || 0;
        const targetQ = Number(selectedJobOrder.quantity || selectedJobOrder.target_quantity || 1);
        
        setShiftMaterials((prev) =>
            prev.map((m) => {
                const plannedQty = Number(m.issued_to_wip_quantity || m.reserved_quantity || m.staged_quantity || m.allocated_quantity || 0);
                const stdQty = plannedQty / targetQ;
                const computed = stdQty * qtyNum;
                return {
                    ...m,
                    actual_qty: computed > 0 ? computed.toFixed(6) : "0"
                };
            })
        );
    };

    const totalOutputQuantity = (Number(shiftYieldQty) || 0)
        + (Number(rejectedQty) || 0)
        + (Number(scrapQty) || 0);

    const handleShiftLogSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newYield = Number(shiftYieldQty) || 0;
        const newRejected = Number(rejectedQty) || 0;
        const newScrap = Number(scrapQty) || 0;
        if (newYield + newRejected + newScrap <= 0) {
            toast.error("Record at least one good, rejected, or scrap unit.");
            return;
        }

        if (!productionDate) {
            toast.error("Please select a production date.");
            return;
        }

        if (shiftMaterials.some((material) => !material.reservation_id)) {
            toast.error("Every required material must have an exact WIP reservation before recording production.");
            return;
        }
        const consumedByMaterial = new Map<number, number>();
        shiftMaterials.forEach((material) => {
            const materialId = Number(material.jo_material_id || 0);
            consumedByMaterial.set(materialId, (consumedByMaterial.get(materialId) || 0) + Number(material.actual_qty || 0));
        });
        if (shiftMaterials.some((material) => (consumedByMaterial.get(Number(material.jo_material_id || 0)) || 0) <= 0)) {
            toast.error("Enter an actual consumed quantity against at least one exact WIP reservation for every material.");
            return;
        }

        setSubmittingShiftLog(true);
        try {
            const fullShiftName = `Day ${productionDay} - ${shiftName}`;
            
            // Target routing task (explicit selection wins over the inferred
            // first-incomplete step).
            const resolvedTaskId = targetTaskId || activeStep?.id || (sortedTasks.length > 0 ? sortedTasks[sortedTasks.length - 1].id : 0);

            const payload: ShiftRunLogPayload = {
                sessionKey,
                taskId: resolvedTaskId,
                joId: selectedJobOrder.order_id || selectedJobOrder.job_order_id || 0,
                workCenterId: stationId || 0,
                shiftName: fullShiftName,
                productionDate,
                yieldQty: newYield,
                rejectedQty: newRejected,
                scrapQty: newScrap,
                rejectionReasonId: selectedReasonId ? Number(selectedReasonId) : null,
                rejectionRemarks: rejectionRemarks || undefined,
                varianceReason: varianceReason || undefined,
                approveVariance,
                qaParameters: [],
                remarks: remarks || undefined,
                evidenceImage,
                materialsConsumed: shiftMaterials.map((m) => ({
                    joMaterialId: Number(m.jo_material_id),
                    reservationId: Number(m.reservation_id),
                    productId: Number(m.product_id),
                    mmLotId: Number(m.mm_lot_id),
                    inventoryLotId: Number(m.inventory_lot_id),
                    batchNo: String(m.batch_no || "").trim(),
                    uomId: Number(m.uom_id),
                    actualQty: Number(m.actual_qty || 0)
                })),
            };

            const res = await submitShiftRunLog(payload);
            if (res.success) {
                const targetStep = sortedTasks.find((t) => t.id === resolvedTaskId);
                const targetQty = Number(selectedJobOrder.quantity || 0);
                const producedAfter = Number(selectedJobOrder.producedQty || selectedJobOrder.completed_quantity || 0) + newYield;
                const reachedTarget = targetQty > 0 && producedAfter >= targetQty;

                if (reachedTarget) {
                    toast.success(`Shift closed for ${fullShiftName}. Output target reached (${producedAfter.toLocaleString()}/${targetQty.toLocaleString()} pcs) — route this Job Order to QA.`);
                } else {
                    toast.success(`Shift closed for ${fullShiftName}. Posted to Step ${targetStep?.sequence_order ?? "?"} — ${targetStep?.name ?? "routing step"}; staging materials backflushed.`);
                }
                onOpenChange(false);
                if (onSuccess) onSuccess();
            } else {
                if (res.isShortfall && res.error) {
                    setInsufficiencyError(res.error);
                    setIsInsufficiencyOpen(true);
                } else {
                    toast.error(res.error || "Failed to log shift run.");
                }
            }
        } catch (err: any) {
            toast.error(err.message || "Failed to submit shift log.");
        } finally {
            setSubmittingShiftLog(false);
        }
    };

    const handlePrintShiftReport = () => {
        const fullShiftName = `Day ${productionDay} - ${shiftName}`;
        
        const operatorsHtml = groupedJobOperators.length === 0 
            ? "<tr><td colspan='2' style='text-align: center; font-style: italic; padding: 12px;'>No personnel logged on this shift.</td></tr>"
            : groupedJobOperators.map(op => `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; font-size: 13px;">${getUserLabel(op.user_id)}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; color: #555; font-size: 13px;">${op.user_position || "Shop Floor Tech"}</td>
                </tr>
            `).join("");

        const materialsHtml = shiftMaterials.length === 0
            ? "<tr><td colspan='4' style='text-align: center; font-style: italic; padding: 12px;'>No raw materials consumed.</td></tr>"
            : shiftMaterials.map(m => {
                const stdQty = Number(m.allocated_quantity || 0) / (Number(selectedJobOrder.quantity) || 1);
                const theoretical = stdQty * totalOutputQuantity;
                const actual = Number(m.actual_qty || 0);
                const deviation = actual - theoretical;
                return `
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; font-size: 13px;">${m.product_name}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; font-family: monospace; text-align: right; font-size: 13px;">${theoretical.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; font-family: monospace; text-align: right; font-weight: bold; font-size: 13px;">${actual.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; font-family: monospace; text-align: right; color: ${deviation > 0 ? '#d9534f' : '#5cb85c'}; font-weight: bold; font-size: 13px;">${deviation > 0 ? '+' : ''}${deviation.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    </tr>
                `;
            }).join("");

        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
            <head>
                <title>Shift Closure Report - JO #${selectedJobOrder.order_no || selectedJobOrder.jo_id}</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #222; }
                    .header { border-bottom: 2px solid #222; padding-bottom: 15px; margin-bottom: 25px; }
                    .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
                    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; background: #fcfcfc; padding: 18px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
                    th { background: #f7fafc; text-align: left; padding: 10px; border-bottom: 2px solid #e2e8f0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Shift Run Closure & Backflushing Report</h1>
                    <p>Antigravity Manufacturing Management System • JO #${selectedJobOrder.order_no || selectedJobOrder.jo_id}</p>
                </div>
                <div class="meta-grid">
                    <div>
                        <div><strong>Job Order No:</strong> ${selectedJobOrder.order_no || selectedJobOrder.jo_id}</div>
                        <div><strong>Product:</strong> ${selectedJobOrder.product_name}</div>
                    </div>
                    <div>
                        <div><strong>Shift Run:</strong> ${fullShiftName}</div>
                        <div><strong>Good Yield:</strong> ${Number(shiftYieldQty).toLocaleString()} pcs • <strong>Scrap:</strong> ${Number(scrapQty).toLocaleString()} pcs</div>
                        <div><strong>Output Traceability:</strong> Assigned during In-Process QA</div>
                    </div>
                </div>
                <h3>Personnel Present on Shift</h3>
                <table>
                    <thead><tr><th>Name</th><th>Role</th></tr></thead>
                    <tbody>${operatorsHtml}</tbody>
                </table>
                <h3>Exact WIP Reservation Consumption</h3>
                <table>
                    <thead><tr><th>Material</th><th style="text-align: right;">Std Qty</th><th style="text-align: right;">Actual Consumed</th><th style="text-align: right;">Deviation</th></tr></thead>
                    <tbody>${materialsHtml}</tbody>
                </table>
                <script>
                    window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    const materialTheoretical = useCallback((material: ProductionMaterialReservation) => {
        const sameMaterial = shiftMaterials.filter((candidate) => Number(candidate.jo_material_id) === Number(material.jo_material_id));
        const lineBasis = Number(material.issued_to_wip_quantity || material.reserved_quantity || material.staged_quantity || 0);
        const totalBasis = sameMaterial.reduce((sum, candidate) => sum + Number(candidate.issued_to_wip_quantity || candidate.reserved_quantity || candidate.staged_quantity || 0), 0);
        const baseQty = Number(material.allocated_quantity || 0)
            || Number(material.required_quantity || 0)
            || totalBasis;
        const targetQty = Number(selectedJobOrder.quantity || selectedJobOrder.target_quantity) || 1;
        const totalTheoretical = (baseQty / targetQty) * totalOutputQuantity;
        return totalBasis > 0 && lineBasis > 0
            ? totalTheoretical * (lineBasis / totalBasis)
            : totalTheoretical / Math.max(1, sameMaterial.length);
    }, [selectedJobOrder, shiftMaterials, totalOutputQuantity]);

    const openTopUp = (material: ProductionMaterialReservation) => {
        const theoretical = materialTheoretical(material);
        const available = Number(material.available_stock || 0);
        setTopUpTarget({
            jobOrderId: Number(selectedJobOrder.order_id || selectedJobOrder.job_order_id || 0),
            joMaterialId: Number(material.jo_material_id),
            productId: Number(material.product_id),
            productName: material.product_name,
            unitShortcut: material.unit_shortcut || "units",
            uomId: material.uom_id ?? null,
            remainingWip: available,
            theoretical,
            shortfall: Math.max(0, theoretical - available),
            candidateLots: material.candidate_lots || [],
            isSubAssembly: Boolean(material.is_sub_assembly)
        });
        setIsTopUpOpen(true);
    };

    const hasInsufficiency = shiftMaterials.some((m) => Boolean(m.reservation_id) && Number(m.actual_qty || 0) > Number(m.available_stock || 0));
    const hasIncompleteMaterialLine = shiftMaterials.some((m) =>
        !m.reservation_id
        || !m.mm_lot_id
        || !m.inventory_lot_id
        || !m.uom_id
        || !String(m.batch_no || "").trim()
    );
    const consumedByMaterial = shiftMaterials.reduce((totals, material) => {
        const materialId = Number(material.jo_material_id || 0);
        totals.set(materialId, (totals.get(materialId) || 0) + Number(material.actual_qty || 0));
        return totals;
    }, new Map<number, number>());
    const hasMissingMaterialConsumption = shiftMaterials.length === 0 || shiftMaterials.some((material) =>
        (consumedByMaterial.get(Number(material.jo_material_id || 0)) || 0) <= 0
    );
    const hasOutput = Number(shiftYieldQty || 0) + Number(rejectedQty || 0) + Number(scrapQty || 0) > 0;
    const varianceTolerancePct = Math.max(0, Number(
        shiftMaterials.find((material) => material.material_consumption_variance_tolerance_pct !== undefined)
            ?.material_consumption_variance_tolerance_pct || 0
    ));
    const varianceGroups = new Map<number, { theoretical: number; actual: number; unit: string }>();
    shiftMaterials.forEach((material) => {
        const materialId = Number(material.jo_material_id || 0);
        const current = varianceGroups.get(materialId) || { theoretical: 0, actual: 0, unit: material.unit_shortcut || "units" };
        current.theoretical += materialTheoretical(material);
        current.actual += Number(material.actual_qty || 0);
        varianceGroups.set(materialId, current);
    });
    const varianceExceptions = [...varianceGroups.entries()]
        .map(([joMaterialId, values]) => ({
            joMaterialId,
            ...values,
            variance: values.actual - values.theoretical
        }))
        .filter((group) => Math.abs(group.variance) > Math.max(0.000001, Math.abs(group.theoretical) * varianceTolerancePct / 100));
    const hasVarianceException = varianceExceptions.length > 0;
    const missingVarianceApproval = hasVarianceException && (!varianceReason.trim() || !approveVariance);
    const isSubmitDisabled = submittingShiftLog
        || loadingShiftMaterials
        || Boolean(materialsLoadError)
        || hasInsufficiency
        || hasIncompleteMaterialLine
        || hasMissingMaterialConsumption
        || missingVarianceApproval
        || !hasOutput
        || !sessionKey
        || !productionDate
        || !stationId
        || !shiftName.trim();
    const isPrintDisabled = loadingShiftMaterials || Boolean(materialsLoadError) || hasInsufficiency || !hasOutput || !shiftName.trim();

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="w-[98vw] md:w-full md:max-w-[1200px] lg:max-w-[1400px] max-h-[96vh] md:max-h-[92vh] flex flex-col bg-background border border-border/60 shadow-2xl rounded-2xl p-0 overflow-hidden">
                    <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-background p-4 sm:p-6 border-b border-border/50 shrink-0">
                        <DialogHeader>
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-primary/10 rounded-xl text-primary shrink-0">
                                    <ClipboardCheck className="h-5 w-5 sm:h-6 sm:w-6" />
                                </div>
                                <div className="min-w-0">
                                    <DialogTitle className="font-bold text-sm sm:text-base md:text-lg tracking-tight text-foreground truncate">
                                        End-of-Shift & Step Progress Entry
                                    </DialogTitle>
                                    <DialogDescription className="text-muted-foreground text-[10px] sm:text-xs mt-0.5 line-clamp-2 sm:line-clamp-none">
                                         Record this production session's output and exact WIP-reservation consumption for <strong className="text-foreground">Job Order #{selectedJobOrder?.order_no || selectedJobOrder?.jo_id}</strong>. Output remains Pending QA until it is released.
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>
                    </div>

                    <form onSubmit={handleShiftLogSubmit} className="p-4 sm:p-6 flex-1 flex flex-col overflow-hidden min-h-0 text-xs">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 flex-1 overflow-y-auto pr-1 min-h-0">
                            {/* Left Column: Yield, Scrap, Batch Metadata, Operators */}
                            <div className="lg:col-span-6 space-y-5">
                                <div className="bg-card/50 backdrop-blur-sm border border-border/60 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
                                    <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                                        <div className="p-1 bg-primary/10 rounded text-primary">
                                            <Clock className="h-4 w-4" />
                                        </div>
                                        <h4 className="font-bold text-foreground/90 uppercase tracking-wider text-[10px]">
                                            Shift & Good Units Produced
                                        </h4>
                                    </div>
                                     <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="productionDay" className="text-muted-foreground font-medium text-[11px]">Production Day</Label>
                                            <div className="relative">
                                                <select
                                                    id="productionDay"
                                                    value={productionDay}
                                                    onChange={(e) => setProductionDay(e.target.value)}
                                                    className="w-full h-10 rounded-xl border border-border/80 bg-background text-foreground px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 cursor-pointer appearance-none"
                                                >
                                                    {Array.from({ length: estDays }).map((_, i) => (
                                                        <option key={i + 1} value={i + 1}>Day {i + 1}</option>
                                                    ))}
                                                </select>
                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground">
                                                    <Layers className="h-3.5 w-3.5 text-muted-foreground/60" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="shiftName" className="text-muted-foreground font-medium text-[11px]">Shift Name</Label>
                                            <Input
                                                id="shiftName"
                                                type="text"
                                                value={shiftName}
                                                onChange={(e) => setShiftName(e.target.value)}
                                                className="h-10 rounded-xl bg-background border-border/80 text-foreground text-xs focus-visible:ring-primary/20 focus-visible:border-primary transition-all duration-200"
                                                placeholder="e.g. Shift 1 - Day"
                                                required
                                            />
                                        </div>

                                         <div className="space-y-1.5">
                                             <Label htmlFor="shiftYield" className="text-muted-foreground font-medium text-[11px] font-mono">Good Output (pcs)</Label>
                                            <Input
                                                id="shiftYield"
                                                type="number"
                                                value={shiftYieldQty}
                                                onChange={(e) => handleShiftYieldChange(e.target.value)}
                                                className="h-10 rounded-xl bg-background border-emerald-500/50 text-foreground text-xs font-bold font-mono focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500 transition-all duration-200"
                                                placeholder="e.g. 5000"
                                                required
                                             />
                                         </div>

                                         <div className="space-y-1.5">
                                             <Label htmlFor="productionDate" className="text-muted-foreground font-medium text-[11px]">Production Date</Label>
                                             <Input
                                                 id="productionDate"
                                                 type="date"
                                                 value={productionDate}
                                                 onChange={(e) => setProductionDate(e.target.value)}
                                                 className="h-10 rounded-xl bg-background border-border/80 text-foreground text-xs focus-visible:ring-primary/20 focus-visible:border-primary transition-all duration-200"
                                                 required
                                             />
                                         </div>

                                        <div className="space-y-1.5 sm:col-span-3">
                                            <Label htmlFor="targetStep" className="text-muted-foreground font-medium text-[11px]">Post Output To Routing Step</Label>
                                             <select
                                                id="targetStep"
                                                value={targetTaskId}
                                                onChange={(e) => setTargetTaskId(Number(e.target.value))}
                                                className="w-full h-10 rounded-xl border border-border/80 bg-background text-foreground px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 cursor-pointer"
                                            >
                                                {sortedTasks.map((t) => (
                                                    <option key={t.id} value={t.id}>
                                                        Step {t.sequence_order} — {t.name}{t.status === "Completed" ? " (Completed)" : ""}
                                                    </option>
                                                ))}
                                             </select>
                                             <p className="text-[9px] text-muted-foreground">The station is recorded from this routing step; material consumption remains tied to its selected WIP reservations.</p>
                                         </div>
                                     </div>

                                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                                         <div className="flex items-center gap-2 min-w-0">
                                             <User className="h-4 w-4 text-primary shrink-0" />
                                             <div className="min-w-0">
                                                 <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Operator</p>
                                                 <p className="text-xs font-semibold text-foreground truncate">{operatorLabel}</p>
                                             </div>
                                         </div>
                                         <div className="flex items-center gap-2 min-w-0">
                                             <MapPin className="h-4 w-4 text-primary shrink-0" />
                                             <div className="min-w-0">
                                                 <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Station / Work Center</p>
                                                 <p className="text-xs font-semibold text-foreground truncate">{stationLabel}</p>
                                             </div>
                                         </div>
                                         <div className="flex items-center gap-2 min-w-0">
                                             <Tag className="h-4 w-4 text-primary shrink-0" />
                                             <div className="min-w-0">
                                                 <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Session Key</p>
                                                 <p className="text-[10px] font-mono font-semibold text-foreground truncate" title={sessionKey}>{sessionKey || "Generating..."}</p>
                                             </div>
                                         </div>
                                     </div>

                                    {/* Scrap / Rejection Log Section */}
                                    <div className="bg-rose-500/[0.03] border border-rose-500/20 rounded-xl p-3.5 space-y-3">
                                        <div className="flex items-center justify-between pb-1.5 border-b border-rose-500/10">
                                            <div className="flex items-center gap-1.5">
                                                <ShieldAlert className="h-4 w-4 text-rose-500" />
                                         <h5 className="font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider text-[10px]">
                                                     Rejected & Scrap Output
                                                </h5>
                                            </div>
                                            <Badge variant="outline" className="text-[9px] text-rose-600 border-rose-500/20">
                                                QA Tracking
                                            </Badge>
                                        </div>
                                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                             <div className="space-y-1">
                                                 <Label htmlFor="rejectedQty" className="text-muted-foreground text-[10px]">Rejected Units</Label>
                                                 <Input
                                                     id="rejectedQty"
                                                     type="number"
                                                     min="0"
                                                     step="0.000001"
                                                     value={rejectedQty}
                                                     onChange={(e) => setRejectedQty(e.target.value)}
                                                     className="h-8.5 rounded-lg bg-background border-rose-500/30 text-xs font-mono font-bold"
                                                     placeholder="0"
                                                 />
                                             </div>
                                             <div className="space-y-1">
                                                 <Label htmlFor="scrapQty" className="text-muted-foreground text-[10px]">Scrap Units</Label>
                                                 <Input
                                                     id="scrapQty"
                                                     type="number"
                                                     min="0"
                                                     step="0.000001"
                                                     value={scrapQty}
                                                    onChange={(e) => setScrapQty(e.target.value)}
                                                    className="h-8.5 rounded-lg bg-background border-rose-500/30 text-xs font-mono font-bold"
                                                    placeholder="0"
                                                />
                                            </div>
                                             <div className="space-y-1">
                                                 <Label htmlFor="rejectionReason" className="text-muted-foreground text-[10px]">Rejection Reason</Label>
                                                <select
                                                    id="rejectionReason"
                                                    value={selectedReasonId}
                                                    onChange={(e) => setSelectedReasonId(e.target.value)}
                                                    className="w-full h-8.5 rounded-lg border border-border bg-background text-foreground px-2 text-xs font-medium"
                                                >
                                                    <option value="">-- No Defect / Standard Run --</option>
                                                    {rejectionReasons.map((r) => (
                                                        <option key={r.id || r.reason_id} value={r.id || r.reason_id}>
                                                            {r.code} - {r.reason_name}
                                                        </option>
                                                     ))}
                                                 </select>
                                             </div>
                                             <div className="space-y-1 sm:col-span-3">
                                                 <Label htmlFor="productionRemarks" className="text-muted-foreground text-[10px]">Session Remarks</Label>
                                                 <Textarea
                                                     id="productionRemarks"
                                                     value={remarks}
                                                     onChange={(e) => setRemarks(e.target.value)}
                                                     className="min-h-16 rounded-lg bg-background border-rose-500/30 text-xs resize-y"
                                                     placeholder="Add production notes, downtime, or defect context..."
                                                 />
                                             </div>
                                         </div>
                                    </div>

                                    <div className="bg-sky-500/[0.03] border border-sky-500/20 rounded-xl p-3.5 space-y-3">
                                        <div className="flex items-center justify-between pb-1.5 border-b border-sky-500/10">
                                            <div className="flex items-center gap-1.5">
                                                <ImageIcon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                                                <h5 className="font-bold text-sky-800 dark:text-sky-300 uppercase tracking-wider text-[10px]">
                                                    Shift Evidence Image
                                                </h5>
                                            </div>
                                            <Badge variant="outline" className="text-[9px] text-sky-700 dark:text-sky-300 border-sky-500/20">
                                                Optional
                                            </Badge>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">
                                            Attach one PNG, JPG, or WEBP photo captured at the end of the shift. Maximum file size: 5 MB.
                                        </p>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                            <Input
                                                id="production-evidence-image"
                                                type="file"
                                                accept="image/jpeg,image/jpg,image/png,image/webp"
                                                onChange={handleEvidenceImageChange}
                                                className="h-9 rounded-lg bg-background border-sky-500/30 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-sky-500/10 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-sky-700 dark:file:text-sky-300"
                                            />
                                            {evidenceImage && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={removeEvidenceImage}
                                                    className="h-9 shrink-0 rounded-lg border-sky-500/30 text-xs"
                                                >
                                                    <X className="h-3.5 w-3.5 mr-1" /> Remove
                                                </Button>
                                            )}
                                        </div>
                                        {evidenceImageError && (
                                            <p className="text-[10px] font-semibold text-destructive" role="alert">{evidenceImageError}</p>
                                        )}
                                        {evidenceImage && evidenceImagePreview && (
                                            <div className="flex items-center gap-3 rounded-lg border border-sky-500/20 bg-background/70 p-2">
                                                <img
                                                    src={evidenceImagePreview}
                                                    alt="Selected shift evidence preview"
                                                    className="h-16 w-16 rounded-md object-cover border border-border"
                                                />
                                                <div className="min-w-0 text-[10px]">
                                                    <p className="truncate font-semibold text-foreground" title={evidenceImage.name}>{evidenceImage.name}</p>
                                                    <p className="text-muted-foreground">{(evidenceImage.size / 1024 / 1024).toFixed(2)} MB</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                </div>
                            </div>

                             {/* Right Column: Exact WIP reservation consumption */}
                            <div className="lg:col-span-6">
                                <div className="bg-card/50 backdrop-blur-sm border border-border/60 rounded-xl p-4 sm:p-5 space-y-4 h-full flex flex-col shadow-sm">
                                    <div className="flex items-center justify-between pb-2 border-b border-border/40">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1 bg-primary/10 rounded text-primary">
                                                <Layers className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-foreground/90 uppercase tracking-wider text-[10px]">
                                                     Exact WIP Reservation Consumption
                                                 </h4>
                                                 <p className="text-[9px] text-muted-foreground mt-0.5">Select the reserved lot, inventory lot, batch, and UOM that were consumed for this session.</p>
                                             </div>
                                         </div>
                                         <Badge variant="outline" className="text-[9px] font-mono bg-primary/5 text-primary border-primary/20 font-bold">
                                             WIP Ledger
                                        </Badge>
                                    </div>

                                    {loadingShiftMaterials ? (
                                        <div className="p-6 bg-background/50 rounded-lg text-muted-foreground text-center italic border border-border/40 flex-1 flex items-center justify-center">
                                            Loading required raw materials...
                                        </div>
                                    ) : materialsLoadError ? (
                                        <div className="p-6 bg-red-500/5 rounded-lg text-red-700 text-center border border-red-500/20 flex-1 flex flex-col items-center justify-center gap-3" role="alert">
                                            <AlertTriangle className="h-5 w-5" />
                                            <div>
                                                <p className="font-semibold">Required raw materials are unavailable.</p>
                                                 <p className="text-xs mt-1">Session submission is disabled until the exact WIP reservations load successfully.</p>
                                                <p className="text-[11px] mt-1 opacity-80">{materialsLoadError}</p>
                                            </div>
                                            <Button type="button" variant="outline" onClick={() => void loadShiftMaterials()}>
                                                Retry Materials Lookup
                                            </Button>
                                        </div>
                                    ) : shiftMaterials.length === 0 ? (
                                        <div className="p-6 bg-background/50 rounded-lg text-muted-foreground text-center italic border border-border/40 flex-1 flex items-center justify-center">
                                             No WIP reservations are available for this Job Order.
                                        </div>
                                    ) : (
                                        <div className="space-y-3 flex-1 overflow-y-auto max-h-[480px] lg:max-h-[560px] pr-1">
                                            {shiftMaterials.map((m, index) => {
                                                 const theoretical = materialTheoretical(m);
                                                 const actual = Number(m.actual_qty || 0);
                                                 const variance = actual - theoretical;
                                                 const isExceeded = Math.abs(variance) > Math.max(0.000001, Math.abs(theoretical) * varianceTolerancePct / 100);
                                                 const isInsufficient = actual > Number(m.available_stock || 0);

                                                const percentage = Math.min(200, theoretical > 0 ? (actual / theoretical) * 100 : 0);
                                                const barColor = isInsufficient 
                                                    ? "bg-red-500" 
                                                    : isExceeded 
                                                    ? "bg-amber-500" 
                                                    : "bg-emerald-500";
                                                const availableStock = Number(m.available_stock || 0);
                                                const shortfall = Math.max(0, theoretical - availableStock);
                                                const needsTopUp = !m.reservation_id || shortfall > 0.000001;

                                                return (
                                                     <div key={m.reservation_id || `${m.jo_material_id}-${index}`} className="p-3.5 bg-background rounded-xl border border-border/80 hover:border-primary/20 hover:shadow-sm transition-all duration-200 space-y-3">
                                                         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                             <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                                                 <span className="font-bold text-foreground text-xs truncate max-w-[220px]" title={m.product_name}>
                                                                     {m.product_name}
                                                                 </span>
                                                                 {m.reservation_id ? (
                                                                     <span className="font-mono bg-primary/5 text-primary text-[8px] px-1.5 py-0.5 rounded border border-primary/15 shrink-0">
                                                                         Reservation #{m.reservation_id}
                                                                     </span>
                                                                 ) : (
                                                                     <span className="font-mono bg-red-500/10 text-red-600 text-[8px] px-1.5 py-0.5 rounded border border-red-500/20 shrink-0">
                                                                         No WIP reservation
                                                                     </span>
                                                                 )}
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <Badge
                                                                    variant="outline"
                                                                    className={`font-bold text-[8px] uppercase tracking-wider px-2 py-0.5 shrink-0 border ${
                                                                        isInsufficient
                                                                            ? "bg-red-500/10 text-red-600 border-red-500/20"
                                                                            : isExceeded 
                                                                            ? "bg-amber-500/10 text-amber-600 border-amber-500/20" 
                                                                            : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                                                    }`}
                                                                >
                                                                     {!m.reservation_id ? "Unavailable" : isInsufficient ? "Shortfall" : isExceeded ? "Outside tolerance" : "Normal"}
                                                                 </Badge>
                                                             </div>
                                                         </div>

                                                         <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
                                                             <span>MM Lot: <strong className="font-mono text-foreground">{m.mm_lot_id || "—"}</strong></span>
                                                             <span>Inventory Lot: <strong className="font-mono text-foreground">{m.inventory_lot_id || "—"}</strong></span>
                                                             <span>Batch: <strong className="font-mono text-foreground">{m.batch_no || "—"}</strong></span>
                                                             <span>UOM: <strong className="font-mono text-foreground">{m.unit_shortcut || `#${m.uom_id || "—"}`}</strong></span>
                                                             <span>Status: <strong className="text-foreground">{m.reservation_status || "Not staged"}</strong></span>
                                                             <span>Remaining WIP: <strong className="font-mono text-foreground">{Number(m.available_stock || 0).toLocaleString()}</strong></span>
                                                         </div>

                                                        {/* Progress bar */}
                                                        {theoretical > 0 && (
                                                            <div className="space-y-1">
                                                                <div className="w-full bg-muted/80 h-1.5 rounded-full overflow-hidden">
                                                                    <div 
                                                                        className={`h-full rounded-full transition-all duration-300 ${barColor}`} 
                                                                        style={{ width: `${Math.min(100, percentage)}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Input Row */}
                                                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40 text-[10px]">
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-muted-foreground">Theoretical:</span>
                                                                    <span className="font-bold text-foreground/80 font-mono">
                                                                        {theoretical.toFixed(2)} {m.unit_shortcut}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                     <span className="text-muted-foreground">Remaining WIP:</span>
                                                                    <span className={`font-mono font-bold ${isInsufficient ? "text-red-500" : "text-foreground/85"}`}>
                                                                         {Number(m.available_stock || 0).toLocaleString()} {m.unit_shortcut}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-muted-foreground">Variance:</span>
                                                                    <span className={`font-mono font-bold ${isExceeded ? "text-amber-600" : "text-foreground/85"}`}>
                                                                        {variance > 0 ? "+" : ""}{variance.toFixed(6)} {m.unit_shortcut}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-muted-foreground">Actual Out:</span>
                                                                    <div className="relative flex items-center">
                                                                        <Input
                                                                             type="number"
                                                                             min="0"
                                                                             step="0.000001"
                                                                             max={m.reservation_id ? availableStock : undefined}
                                                                             value={m.actual_qty}
                                                                            onChange={(e) => {
                                                                                const raw = e.target.value;
                                                                                if (raw === "") {
                                                                                    setShiftMaterials((prev) =>
                                                                                        prev.map((item, idx) => idx === index ? { ...item, actual_qty: "" } : item)
                                                                                    );
                                                                                    return;
                                                                                }
                                                                                const parsed = Number(raw);
                                                                                if (!Number.isFinite(parsed)) return;
                                                                                const clamped = Math.min(Math.max(0, parsed), availableStock);
                                                                                setShiftMaterials((prev) =>
                                                                                    prev.map((item, idx) => idx === index ? { ...item, actual_qty: String(clamped) } : item)
                                                                                );
                                                                            }}
                                                                             onBlur={(e) => {
                                                                                 const parsed = Number(e.target.value);
                                                                                 if (e.target.value === "" || !Number.isFinite(parsed)) return;
                                                                                 const clamped = Math.min(Math.max(0, parsed), availableStock);
                                                                                 setShiftMaterials((prev) =>
                                                                                     prev.map((item, idx) => idx === index ? { ...item, actual_qty: String(clamped) } : item)
                                                                                 );
                                                                             }}
                                                                             disabled={!m.reservation_id}
                                                                             className="h-8 w-28 text-right bg-background pr-6 pl-2 py-1.5 rounded-lg font-bold font-mono text-xs disabled:opacity-50"
                                                                         />
                                                                        <span className="absolute right-2 text-[9px] text-muted-foreground font-semibold pointer-events-none">{m.unit_shortcut}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {needsTopUp && (
                                                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                                                                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                                                                        {m.reservation_id
                                                                            ? `Short by ${shortfall.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${m.unit_shortcut} against the theoretical requirement.`
                                                                            : "No WIP reservation is staged for this material."}
                                                                    </span>
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => openTopUp(m)}
                                                                        className="h-7 shrink-0 border-amber-500/40 text-[10px] font-bold text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                                                                    >
                                                                        <PackagePlus className="mr-1.5 h-3.5 w-3.5" /> Add raw materials
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {hasVarianceException && (
                                <div className="lg:col-span-12 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3 text-xs">
                                    <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="font-bold">Material consumption is outside the configured tolerance ({varianceTolerancePct}%).</p>
                                            <p className="mt-1">A reason and administrator approval confirmation are required. The server verifies the authenticated administrator; client-supplied approver IDs are ignored.</p>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="varianceReason" className="text-amber-900 dark:text-amber-200">Variance reason *</Label>
                                        <Textarea
                                            id="varianceReason"
                                            value={varianceReason}
                                            onChange={(event) => setVarianceReason(event.target.value)}
                                            placeholder="Explain the material usage variance..."
                                            maxLength={5000}
                                            className="min-h-20 bg-background resize-y"
                                        />
                                    </div>
                                    <label className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                                        <input
                                            type="checkbox"
                                            checked={approveVariance}
                                            onChange={(event) => setApproveVariance(event.target.checked)}
                                            className="mt-0.5 h-4 w-4 accent-amber-600"
                                        />
                                        <span>I confirm this variance for administrator approval.</span>
                                    </label>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="pt-4 border-t border-border/50 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2.5 shrink-0">
                            <Button
                                type="submit"
                                disabled={isSubmitDisabled}
                                className="bg-primary hover:bg-primary/95 text-white font-bold h-10 text-xs px-6 shadow-md shadow-primary/10 hover:shadow-primary/20 transition-all duration-200 disabled:opacity-50 w-full sm:w-auto order-1 sm:order-2"
                            >
                                {submittingShiftLog ? "Recording Session..." : "Record Production Session"}
                            </Button>
                            <div className="grid grid-cols-2 gap-2 w-full sm:w-auto order-2 sm:order-1">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={isPrintDisabled}
                                    onClick={handlePrintShiftReport}
                                    className="border-border hover:bg-muted text-foreground h-10 text-xs font-semibold px-4 transition-all duration-200 flex items-center justify-center gap-1.5 disabled:opacity-50 w-full"
                                >
                                    <Printer className="h-4 w-4" /> Print Report
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => onOpenChange(false)}
                                    className="border-border hover:bg-muted text-foreground h-10 text-xs font-semibold px-4 transition-all duration-200 w-full"
                                >
                                    Cancel
                                </Button>
                            </div>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Shortfall Dialog */}
            <Dialog open={isInsufficiencyOpen} onOpenChange={setIsInsufficiencyOpen}>
                <DialogContent className="sm:max-w-[480px] bg-background border border-border shadow-2xl rounded-2xl p-0 overflow-hidden">
                    <div className="bg-red-500/10 dark:bg-red-950/20 p-5 border-b border-red-500/10">
                        <DialogHeader>
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                                <DialogTitle className="font-black text-base text-red-600 dark:text-red-400 tracking-tight">
                                    Staging Component Stock Shortfall
                                </DialogTitle>
                            </div>
                            <DialogDescription className="text-muted-foreground text-xs mt-0.5">
                            WIP reservation quantity is insufficient for the entered exact consumption.
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    <div className="p-6 space-y-4 text-xs">
                        <div className="p-3 bg-red-500/5 dark:bg-red-950/10 border border-red-500/10 rounded-lg text-red-700 dark:text-red-300 font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                            {insufficiencyError}
                        </div>
                        <p className="text-muted-foreground leading-normal">
                            Please check the WIP reservation balance or consult a warehouse supervisor before recording the session.
                        </p>
                    </div>

                    <DialogFooter className="p-4 bg-muted/30 border-t border-border/50 gap-2 flex items-center justify-end">
                        {shiftMaterials.length > 0 && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    const shortMaterial =
                                        shiftMaterials.find((m) => Number(m.actual_qty || 0) > Number(m.available_stock || 0))
                                        || shiftMaterials.find((m) => !m.reservation_id)
                                        || shiftMaterials[0];
                                    if (!shortMaterial) return;
                                    setIsInsufficiencyOpen(false);
                                    openTopUp(shortMaterial);
                                }}
                                className="h-9 border-amber-500/40 text-xs font-bold text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                            >
                                <PackagePlus className="mr-1.5 h-4 w-4" /> Add raw materials
                            </Button>
                        )}
                        <Button
                            onClick={() => setIsInsufficiencyOpen(false)}
                            className="bg-primary hover:bg-primary/95 text-white font-bold h-9 text-xs px-5 shadow-sm"
                        >
                            Acknowledge
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AddReservedMaterialDialog
                open={isTopUpOpen}
                onOpenChange={(nextOpen) => {
                    setIsTopUpOpen(nextOpen);
                    if (!nextOpen) setTopUpTarget(null);
                }}
                target={topUpTarget}
                onAdded={loadShiftMaterials}
            />
        </>
    );
}
