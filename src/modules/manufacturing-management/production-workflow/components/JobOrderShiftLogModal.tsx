/* eslint-disable */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    User,
    Clock,
    DollarSign,
    AlertTriangle,
    ClipboardCheck,
    Printer,
    Tag,
    Layers,
    ShieldAlert,
    Trash2,
    PackagePlus,
    CheckCircle2,
    ImageIcon,
    Search,
    X
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RoutingTask, JobOrder, User as UserType, RouteOperatorRecord, RejectionReason, ProductionMaterialReservation, WipTopUpResponse } from "../types";
import {
    fetchRecoverableShiftRunSessions,
    fetchRejectionReasons,
    RecoverableShiftRunSession,
    resumeShiftRunLogSession,
    ShiftRunLogPayload,
    ShiftRunLogRequestError,
    fetchJobOrderStatusHistory,
    fetchWorkCenters,
    submitShiftRunLog
} from "../services/production-api";
import { EvidenceMediaInput } from "./EvidenceMediaInput";
import { AddReservedMaterialDialog, type TopUpTarget } from "./AddReservedMaterialDialog";
import { toast } from "sonner";
import { calculatePipelinedLineDurationHours } from "../../planning-engineering/utils/production-timing";
import { exceedsAvailableStock, formatProductionQuantity, resolveJobOrderTargetQuantity, roundToInputStep } from "../utils/production-quantity";
import {
    calculateWipTopUpShortfall,
    calculateMaterialConsumptionDefaults,
    distributeConsumptionAcrossReservations,
    materialConsumptionReservationKey,
    parseMaterialConsumptionInput,
    preserveExistingActualQuantities,
    sumProductionOutputQuantities
} from "../utils/material-consumption";
import { hasCompletedTimer } from "../operator-time";
import { isTerminalRouteStatus } from "../route-status";
import { formatPhtDate, formatPhtTimestamp, getPhtDateInputValue } from "../../shared/pht-date";
import { calculateProductionOutputOverrun, calculateShiftOutputConfirmationSummary, committedGoodOutputOrAggregate, hasReachedProductionTarget } from "../utils/production-output";
import {
    buildShiftClosureReportErrorHtml,
    buildShiftClosureReportHtml,
    buildShiftClosureReportLoadingHtml
} from "../utils/shift-closure-report";

interface JobOrderShiftLogModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedJobOrder: JobOrder;
    sortedTasks: RoutingTask[];
    users: UserType[];
    allJobOperators: RouteOperatorRecord[];
    onSuccess?: () => void;
}

type OutputQuantityField = "good" | "rejected";

interface OutputQuantities {
    good: string;
    rejected: string;
}

function formatExactMaterialQuantity(value: number): string {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function reservationKeyFor(joMaterialId: number, reservationId: number | null): string {
    return materialConsumptionReservationKey({ jo_material_id: joMaterialId, reservation_id: reservationId, actual_qty: "0" });
}

function applyConsumptionDefaults(
    materials: ProductionMaterialReservation[],
    targetQuantity: number,
    outputQuantity: number
): ProductionMaterialReservation[] {
    const defaults = calculateMaterialConsumptionDefaults(materials, targetQuantity, outputQuantity);
    return materials.map((material, index) => ({
        ...material,
        actual_qty: defaults[index].actualQuantity
    }));
}

export function JobOrderShiftLogModal({
    open,
    onOpenChange,
    selectedJobOrder,
    sortedTasks,
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
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [selectedReasonId, setSelectedReasonId] = useState<string>("");
    const [rejectionRemarks, setRejectionRemarks] = useState("");
    const [remarks, setRemarks] = useState("");
    const [varianceReason, setVarianceReason] = useState("");
    const [approveVariance, setApproveVariance] = useState(false);
    const [shiftMaterials, setShiftMaterials] = useState<ProductionMaterialReservation[]>([]);
    const [consumptionInputDrafts, setConsumptionInputDrafts] = useState<Record<string, string>>({});
    const [consumptionInputErrors, setConsumptionInputErrors] = useState<Record<string, string>>({});
    const [consumptionDrafts, setConsumptionDrafts] = useState<Record<string, string>>({});
    const [topUpPreviews, setTopUpPreviews] = useState<Record<string, number>>({});
    const [reservationSearch, setReservationSearch] = useState("");
    const [materialsLoadError, setMaterialsLoadError] = useState<string | null>(null);
    const [loadingShiftMaterials, setLoadingShiftMaterials] = useState(false);
    const [submittingShiftLog, setSubmittingShiftLog] = useState(false);
    const [recoveryStatus, setRecoveryStatus] = useState<"checking" | "none" | "pending" | "resuming" | "error">("checking");
    const [recoverableSessions, setRecoverableSessions] = useState<RecoverableShiftRunSession[]>([]);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);
    const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
    const [insufficiencyError, setInsufficiencyError] = useState<string | null>(null);
    const [isInsufficiencyOpen, setIsInsufficiencyOpen] = useState(false);
    const [topUpTarget, setTopUpTarget] = useState<TopUpTarget | null>(null);
    const [isTopUpOpen, setIsTopUpOpen] = useState(false);
    const [evidenceImages, setEvidenceImages] = useState<File[]>([]);
    const [evidenceImageError, setEvidenceImageError] = useState<string | null>(null);
    const outputQuantitiesRef = useRef<OutputQuantities>({ good: "", rejected: "0" });
    const shiftMaterialsRef = useRef<ProductionMaterialReservation[]>([]);
    const manuallyEditedMaterialKeysRef = useRef<Set<string>>(new Set());
    const allocatedWipByReservationRef = useRef<Map<string, number>>(new Map());
    const topUpReservationKeysByRootRef = useRef<Map<string, Set<string>>>(new Map());
    const preserveTopUpDraftOnCloseRef = useRef(false);
    const autoResumeAttemptedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        shiftMaterialsRef.current = shiftMaterials;
    }, [shiftMaterials]);

    useEffect(() => {
        if (open) return;
        setConsumptionInputDrafts({});
        setConsumptionInputErrors({});
        setConsumptionDrafts({});
        setTopUpPreviews({});
        allocatedWipByReservationRef.current.clear();
        topUpReservationKeysByRootRef.current.clear();
        manuallyEditedMaterialKeysRef.current.clear();
        preserveTopUpDraftOnCloseRef.current = false;
    }, [open]);

    const filteredShiftMaterials = React.useMemo(() => {
        const query = reservationSearch.trim().toLowerCase();
        if (!query) return shiftMaterials;

        return shiftMaterials.filter((material) => [
            material.product_name,
            material.reservation_id,
            material.mm_lot_name,
            material.inventory_lot_batch_no,
            material.batch_no
        ].some((value) => String(value ?? "").toLowerCase().includes(query)));
    }, [reservationSearch, shiftMaterials]);

    const totalPlannedHours = calculatePipelinedLineDurationHours(sortedTasks);
    const shiftHours = Number(selectedJobOrder?.shiftOption || 8);
    const estDays = Math.ceil(totalPlannedHours / shiftHours) || 1;
    const jobOrderId = selectedJobOrder?.order_id || selectedJobOrder?.job_order_id;
    const jobOrderSessionKey = selectedJobOrder?.jo_id ?? null;
    const targetQuantity = resolveJobOrderTargetQuantity(selectedJobOrder);

    const getUserLabel = (uId: number) => {
        const u = users.find((x) => (x.user_id || x.id) === uId);
        if (!u) return `Operator #${uId}`;
        const fname = u.user_fname || u.first_name || "";
        const lname = u.user_lname || u.last_name || "";
        return `${fname} ${lname}`.trim() || `User #${uId}`;
    };

    const formatCompletionResponseError = (result: any) => {
        const details = result?.details || {};
        const routeIds = Array.isArray(details.routeIds) ? details.routeIds : [];
        const routeBlockers = routeIds.map((routeId: unknown) => {
            const id = Number(routeId);
            const task = sortedTasks.find((candidate) => Number(candidate.id) === id || Number(candidate.jo_route_id || 0) === id);
            return task
                ? `Step ${task.sequence_order || "-"}: ${task.name} (${task.status || "Not started"})`
                : `Route #${id}`;
        });
        const operatorSessionIds = Array.isArray(details.operatorSessionIds) ? details.operatorSessionIds : [];
        const timerBlockers = operatorSessionIds.map((sessionId: unknown) => {
            const operator = allJobOperators.find((candidate) => Number(candidate.id) === Number(sessionId));
            if (!operator) return `operator session #${Number(sessionId)}`;
            const task = sortedTasks.find((candidate) => Number(candidate.id) === Number(operator.task_id));
            return `${getUserLabel(operator.user_id)}${task ? ` on Step ${task.sequence_order || "-"}: ${task.name}` : ""}`;
        });
        const extraDetails = [
            routeBlockers.length > 0 ? `Open route steps: ${routeBlockers.join("; ")}.` : "",
            timerBlockers.length > 0 ? `Active timers: ${timerBlockers.join("; ")}.` : "",
            result?.code === "PRODUCTION_TIMERS_ACTIVE" && timerBlockers.length === 0 ? "Stop all active operator timers and retry." : "",
            result?.code === "PRODUCTION_OPERATIONS_INCOMPLETE" && routeBlockers.length === 0 ? "Complete every open route step and retry." : ""
        ].filter(Boolean);
        return [result?.error || "The Job Order could not be finalized.", ...extraDetails].join(" ");
    };

    const activeOperator = allJobOperators.find((operator) => operator.started_at !== null && operator.stopped_at === null);
    const operatorLabel = activeOperator ? getUserLabel(activeOperator.user_id) : "Authenticated operator";
    const hasCompletedJobOrderTimer = allJobOperators.some((operator) =>
        !operator.is_placeholder && hasCompletedTimer(operator.started_at, operator.stopped_at)
    );

    const getAvailableShifts = useCallback(() => {
        const hours = shiftHours;
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
    }, [shiftHours]);

    const loadShiftMaterials = useCallback(async () => {
        if (!jobOrderId) return [];

        setLoadingShiftMaterials(true);
        setMaterialsLoadError(null);

        try {
            const response = await fetch(`/api/manufacturing/planning-engineering?action=job-materials&joId=${jobOrderId}&_t=${Date.now()}`);
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
            reservationRows.forEach((material: ProductionMaterialReservation) => {
                const key = materialConsumptionReservationKey(material);
                if (!allocatedWipByReservationRef.current.has(key)) {
                    allocatedWipByReservationRef.current.set(key, Math.max(0, Number(material.available_stock || 0)));
                }
            });
            const preservedRows = preserveExistingActualQuantities(
                applyConsumptionDefaults(
                    reservationRows,
                    targetQuantity,
                    sumProductionOutputQuantities(
                        outputQuantitiesRef.current.good,
                        outputQuantitiesRef.current.rejected,
                        0
                    )
                ),
                shiftMaterialsRef.current,
                manuallyEditedMaterialKeysRef.current
            );
            setShiftMaterials(preservedRows);
            return preservedRows;
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load Job Order materials";
            setShiftMaterials([]);
            setMaterialsLoadError(message);
            console.error("Error loading Job BOM materials for shift log:", err);
            return [];
        } finally {
            setLoadingShiftMaterials(false);
        }
    }, [jobOrderId, targetQuantity]);

    const initializedFormJobOrderKeyRef = useRef<string | null>(null);

    // Reset shift-entry fields only for a new modal session or a different Job Order.
    useEffect(() => {
        if (!open) {
            initializedFormJobOrderKeyRef.current = null;
            autoResumeAttemptedRef.current.clear();
            return;
        }

        if (!jobOrderId || !jobOrderSessionKey || initializedFormJobOrderKeyRef.current === jobOrderSessionKey) return;
        initializedFormJobOrderKeyRef.current = jobOrderSessionKey;

        outputQuantitiesRef.current = { good: "", rejected: "0" };
        setShiftYieldQty("");
        setRejectedQty("0");
        setSelectedReasonId("");
        setRejectionRemarks("");
        setRemarks("");
        setVarianceReason("");
        setApproveVariance(false);
        setEvidenceImages([]);
        setEvidenceImageError(null);
        setShiftMaterials([]);
        setConsumptionInputDrafts({});
        setConsumptionInputErrors({});
        setConsumptionDrafts({});
        manuallyEditedMaterialKeysRef.current.clear();
        setMaterialsLoadError(null);
        setProductionDay("1");
        const todayStr = getPhtDateInputValue();
        setProductionDate(todayStr);
        setSessionKey("");
        setRecoverableSessions([]);
        setRecoveryError(null);
        setRecoveryStatus("checking");

        const available = getAvailableShifts();
        if (available.length > 0) {
            setShiftName(available[0].value);
        }

        // Fetch rejection reasons
        fetchRejectionReasons()
            .then((reasons) => setRejectionReasons(reasons))
            .catch((err) => console.error("Error loading rejection reasons:", err));

        let cancelled = false;
        const newSessionKey = () => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `production-session-${Date.now()}`;

        fetchRecoverableShiftRunSessions(jobOrderId)
            .then(async (sessions) => {
                if (cancelled) return;
                setRecoverableSessions(sessions);
                if (sessions.length === 0) {
                    setSessionKey(newSessionKey());
                    setRecoveryStatus("none");
                    return;
                }

                setRecoveryStatus("pending");
                if (sessions.length !== 1 || !sessions[0].canResume) return;

                const session = sessions[0];
                const attemptKey = `${jobOrderId}:${session.sessionKey}`;
                if (autoResumeAttemptedRef.current.has(attemptKey)) return;
                autoResumeAttemptedRef.current.add(attemptKey);
                setRecoveryStatus("resuming");
                setRecoveryError(null);
                try {
                    await resumeShiftRunLogSession(jobOrderId, session.sessionKey);
                    if (cancelled) return;
                    toast.success(`Recovered and recorded the pending shift for ${session.shiftName}.`);
                    onOpenChange(false);
                    onSuccess?.();
                } catch (error) {
                    if (cancelled) return;
                    setRecoveryError(error instanceof Error ? error.message : "The pending shift could not be resumed.");
                    setRecoveryStatus("pending");
                    fetchRecoverableShiftRunSessions(jobOrderId)
                        .then((latest) => { if (!cancelled) setRecoverableSessions(latest); })
                        .catch(() => undefined);
                }
            })
            .catch((error) => {
                if (cancelled) return;
                setRecoveryError(error instanceof Error ? error.message : "Unable to check for pending shifts.");
                setRecoveryStatus("error");
            });

        return () => { cancelled = true; };
    }, [open, jobOrderId, jobOrderSessionKey, getAvailableShifts]);

    // Keep material refreshes independent from shift-entry initialization.
    useEffect(() => {
        if (open && jobOrderId) void loadShiftMaterials();
    }, [open, jobOrderId, loadShiftMaterials]);

    useEffect(() => {
        setReservationSearch("");
    }, [open, selectedJobOrder?.order_id, selectedJobOrder?.job_order_id]);

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

    const handleOutputQuantityChange = (field: OutputQuantityField, value: string) => {
        const nextQuantities = { ...outputQuantitiesRef.current, [field]: value };
        outputQuantitiesRef.current = nextQuantities;

        if (field === "good") setShiftYieldQty(value);
        if (field === "rejected") setRejectedQty(value);

        setShiftMaterials((previous) => {
            const recalculated = applyConsumptionDefaults(
                previous,
                targetQuantity,
                sumProductionOutputQuantities(nextQuantities.good, nextQuantities.rejected, 0)
            );
            return preserveExistingActualQuantities(recalculated, previous, manuallyEditedMaterialKeysRef.current);
        });
    };

    const totalOutputQuantity = sumProductionOutputQuantities(shiftYieldQty, rejectedQty, 0);

    const validateShiftLog = () => {
        if (submittingShiftLog) return false;
        if (!hasCompletedJobOrderTimer) {
            toast.error("Start and stop at least one operator timer before recording the production session.");
            return false;
        }

        if (evidenceImages.length === 0 || evidenceImageError) {
            toast.error("At least one valid Inspector / Shift evidence image or video is required.");
            return false;
        }

        const newYield = Number(shiftYieldQty) || 0;
        const newRejected = Number(rejectedQty) || 0;
        if (newYield + newRejected <= 0) {
            toast.error("Record at least one good or rejected unit.");
            return false;
        }

        if (!productionDate) {
            toast.error("Please select a production date.");
            return false;
        }

        if (!sessionKey || !shiftName.trim()) {
            toast.error("Select a shift before recording the production session.");
            return false;
        }

        if (loadingShiftMaterials) {
            toast.error("Wait for the WIP reservation details to finish loading.");
            return false;
        }
        if (materialsLoadError) {
            toast.error(materialsLoadError);
            return false;
        }
        const invalidConsumptionDrafts = Object.entries(consumptionInputDrafts)
            .filter(([, rawValue]) => parseMaterialConsumptionInput(rawValue) === null);
        if (invalidConsumptionDrafts.length > 0) {
            const message = "Enter a valid non-negative quantity with up to 6 decimal places.";
            setConsumptionInputErrors((previous) => ({
                ...previous,
                ...Object.fromEntries(invalidConsumptionDrafts.map(([key]) => [key, message]))
            }));
            toast.error(message);
            return false;
        }
        if (hasInsufficiency) {
            setInsufficiencyError("The entered actual material quantity exceeds the available WIP. Add raw materials before recording this production session.");
            setIsInsufficiencyOpen(true);
            return false;
        }
        if (shiftMaterials.some((material) => !material.reservation_id)) {
            toast.error("Every required material must have an exact WIP reservation before recording production.");
            return false;
        }
        if (hasIncompleteMaterialLine) {
            toast.error("Complete the lot, batch, and unit details for every WIP reservation before recording production.");
            return false;
        }
        if (hasMissingMaterialConsumption) {
            toast.error("Enter an actual consumed quantity against at least one exact WIP reservation for every material.");
            return false;
        }
        if (missingVarianceApproval) {
            toast.error("Provide a variance reason and confirm the material variance before recording production.");
            return false;
        }

        return true;
    };

    const handleShiftLogSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validateShiftLog()) setIsConfirmationOpen(true);
    };

    const handleResumePendingSession = async (session: RecoverableShiftRunSession) => {
        if (!session.canResume || submittingShiftLog) return;
        setRecoveryStatus("resuming");
        setRecoveryError(null);
        try {
            await resumeShiftRunLogSession(jobOrderId || session.jobOrderId, session.sessionKey);
            toast.success(`Recovered and recorded the pending shift for ${session.shiftName}.`);
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            setRecoveryError(error instanceof Error ? error.message : "The pending shift could not be resumed.");
            setRecoveryStatus("pending");
            try {
                const latest = await fetchRecoverableShiftRunSessions(jobOrderId || session.jobOrderId);
                setRecoverableSessions(latest);
            } catch {
                // Keep the existing pending session visible if refresh also fails.
            }
        }
    };

    const handleRetryRecoveryCheck = async () => {
        if (!jobOrderId) return;
        setRecoveryStatus("checking");
        setRecoveryError(null);
        try {
            const sessions = await fetchRecoverableShiftRunSessions(jobOrderId);
            setRecoverableSessions(sessions);
            if (sessions.length === 0) {
                setSessionKey(typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                    ? crypto.randomUUID()
                    : `production-session-${Date.now()}`);
                setRecoveryStatus("none");
            } else {
                setRecoveryStatus("pending");
            }
        } catch (error) {
            setRecoveryError(error instanceof Error ? error.message : "Unable to check for pending shifts.");
            setRecoveryStatus("error");
        }
    };

    const handleConfirmShiftLog = async (completeProductionAfterLog = false) => {
        if (!validateShiftLog()) {
            setIsConfirmationOpen(false);
            return;
        }

        const newYield = Number(shiftYieldQty) || 0;
        const newRejected = Number(rejectedQty) || 0;
        const evidenceImagesToSubmit = evidenceImages;
        if (evidenceImagesToSubmit.length === 0 || evidenceImageError) {
            setIsConfirmationOpen(false);
            return;
        }

        setSubmittingShiftLog(true);
        try {
            const fullShiftName = `Day ${productionDay} - ${shiftName}`;
            const materialsToSubmit = materialsForSubmission();
            
            const payload: ShiftRunLogPayload = {
                sessionScope: "JOB_ORDER",
                sessionKey,
                taskId: null,
                joId: selectedJobOrder.order_id || selectedJobOrder.job_order_id || 0,
                workCenterId: null,
                shiftName: fullShiftName,
                productionDate,
                yieldQty: newYield,
                rejectedQty: newRejected,
                // Keep the existing API contract while recording all shift loss as rejected output.
                scrapQty: 0,
                rejectionReasonId: selectedReasonId ? Number(selectedReasonId) : null,
                rejectionRemarks: rejectionRemarks || undefined,
                varianceReason: varianceReason || undefined,
                approveVariance,
                completeProductionAfterLog,
                qaParameters: [],
                remarks: remarks || undefined,
                evidenceImages: evidenceImagesToSubmit,
                materialsConsumed: materialsToSubmit.map((m) => ({
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
                const targetQty = targetQuantity;
                const producedBefore = Number(selectedJobOrder.producedQty
                    ?? selectedJobOrder.completed_quantity
                    ?? selectedJobOrder.productionOutputQuantity
                    ?? 0);
                const producedAfter = producedBefore + newYield;
                const reachedTarget = hasReachedProductionTarget(targetQty, producedAfter);
                const outputOverrun = calculateProductionOutputOverrun(targetQty, producedAfter);
                const overrunNotice = outputOverrun > 0
                    ? ` Good output exceeded the target by ${formatProductionQuantity(outputOverrun)} pcs (${formatProductionQuantity(producedAfter)}/${formatProductionQuantity(targetQty)} pcs); this excess is shown as a QA variance.`
                    : "";

                if (completeProductionAfterLog && res.jobOrderCompletion?.success) {
                    const message = `Shift saved. Production completed and ${selectedJobOrder.order_no || selectedJobOrder.jo_id} was sent to QA and reconciliation.${overrunNotice}`;
                    if (outputOverrun > 0) toast.warning(message);
                    else toast.success(message);
                } else if (completeProductionAfterLog) {
                    toast.warning(`Shift saved and output target reached (${formatProductionQuantity(producedAfter)}/${formatProductionQuantity(targetQty)} pcs).${overrunNotice} The QA handoff did not complete: ${formatCompletionResponseError(res.jobOrderCompletion)}`);
                } else if (reachedTarget) {
                    const message = `Shift saved for ${fullShiftName}. Good-output target reached (${formatProductionQuantity(producedAfter)}/${formatProductionQuantity(targetQty)} pcs).${overrunNotice} The Job Order remains In Production until you explicitly close it.`;
                    if (outputOverrun > 0) toast.warning(message);
                    else toast.success(message);
                } else {
                    toast.success(`Shift closed for ${fullShiftName} across ${sortedTasks.length || "all"} routing steps; staging materials backflushed.`);
                }
                setIsConfirmationOpen(false);
                onOpenChange(false);
                if (onSuccess) onSuccess();
            } else {
                if (res.isShortfall && res.error) {
                    setIsConfirmationOpen(false);
                    setInsufficiencyError(res.error);
                    setIsInsufficiencyOpen(true);
                } else {
                    toast.error(formatCompletionResponseError(res));
                }
            }
        } catch (err: any) {
            if (err instanceof ShiftRunLogRequestError
                && ["MATERIAL_AGGREGATE_CHANGED", "MATERIAL_RESERVATION_CHANGED"].includes(err.code || "")) {
                setIsConfirmationOpen(false);
                setRecoveryError(err.message);
                setRecoverableSessions([{
                    ledgerId: Number(err.details?.ledgerId || 0),
                    jobOrderId: Number(jobOrderId || 0),
                    sessionKey,
                    shiftName: `Day ${productionDay} - ${shiftName}`,
                    productionDate,
                    goodQuantity: newYield,
                    rejectedQuantity: newRejected,
                    scrapQuantity: 0,
                    loggedAt: null,
                    canResume: true,
                    recoveryError: { code: err.code, message: err.message, details: err.details || null }
                }]);
                setRecoveryStatus("pending");
                toast.warning("This shift is saved as pending. Resume it from this screen; don’t enter the same output again.");
            } else {
                toast.error(err.message || "Failed to submit shift log.");
            }
        } finally {
            setSubmittingShiftLog(false);
        }
    };

    const handlePrintShiftReport = () => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            toast.error("Please allow popups to preview the shift closure report.");
            return;
        }

        const jobOrderNo = String(selectedJobOrder.order_no || selectedJobOrder.job_order_no || selectedJobOrder.jo_id);
        printWindow.document.write(buildShiftClosureReportLoadingHtml(jobOrderNo));
        printWindow.document.close();

        void (async () => {
            try {
                const jobOrderId = Number(selectedJobOrder.order_id || selectedJobOrder.job_order_id || 0);
                if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0) {
                    throw new Error("A valid Job Order ID is required to load breakdown history.");
                }

                const [statusHistory, workCenterLookup] = await Promise.all([
                    fetchJobOrderStatusHistory(jobOrderId),
                    fetchWorkCenters().then((response) => response.data).catch(() => null)
                ]);
                const workCenterById = new Map((workCenterLookup || []).map((workCenter) => [
                    Number(workCenter.work_center_id),
                    workCenter
                ]));
                const routeById = new Map<number, RoutingTask>();
                sortedTasks.forEach((task) => {
                    routeById.set(Number(task.id), task);
                    if (task.jo_route_id) routeById.set(Number(task.jo_route_id), task);
                });
                const getRouteWorkCenter = (task?: RoutingTask | null) => {
                    const workCenterId = Number(task?.work_center_id || 0);
                    return workCenterById.get(workCenterId) || task?.work_center || null;
                };
                const routeLabel = (task?: RoutingTask | null) => task
                    ? "Step " + (task.sequence_order || "-") + " · " + task.name
                    : "Route step not recorded";
                const workCenterLabel = (task?: RoutingTask | null) => {
                    const workCenter = getRouteWorkCenter(task);
                    return workCenter?.work_center_name
                        || task?.work_center_name
                        || (task?.work_center_id ? "Work Center #" + task.work_center_id : "Unassigned");
                };
                const assetIdForWorkCenter = (workCenter: ReturnType<typeof getRouteWorkCenter>) => {
                    const assetId = workCenter?.asset?.id
                        || (typeof workCenter?.asset_id === "number" ? workCenter.asset_id : null);
                    return assetId ? String(assetId) : "";
                };
                const machineDetailsFor = (task?: RoutingTask | null) => {
                    const asset = getRouteWorkCenter(task)?.asset;
                    return [
                        asset?.serial ? "S/N " + asset.serial : "",
                        asset?.barcode ? "Barcode " + asset.barcode : "",
                        asset?.rfid_code ? "RFID " + asset.rfid_code : ""
                    ].filter(Boolean).join(" · ");
                };
                const machineNameFor = (task?: RoutingTask | null) => {
                    const workCenter = getRouteWorkCenter(task);
                    const assetId = assetIdForWorkCenter(workCenter);
                    return workCenter?.asset?.item_name
                        || workCenter?.asset?.item_id?.item_name
                        || (assetId ? "Asset #" + assetId : "");
                };

                const routeRows = sortedTasks.map((task, index) => ({
                    sequence: Number(task.sequence_order || index + 1),
                    operation: task.name,
                    status: task.status,
                    qaStatus: task.qa_status || "Not recorded",
                    workCenterId: task.work_center_id ? "WC-" + task.work_center_id : "Unassigned",
                    workCenterName: workCenterLabel(task),
                    machineId: assetIdForWorkCenter(getRouteWorkCenter(task)),
                    machineName: machineNameFor(task),
                    machineDetails: machineDetailsFor(task),
                    plannedSetupHours: Number(task.planned_setup_hours || 0),
                    plannedRunHours: Number(task.planned_run_hours || 0),
                    actualSetupHours: Number(task.actual_setup_hours || 0),
                    actualRunHours: Number(task.actual_run_hours || 0)
                }));

                const operatorRows = allJobOperators
                    .filter((operator) => !operator.is_placeholder)
                    .map((operator) => {
                        const task = routeById.get(Number(operator.task_id)) || routeById.get(Number(operator.routing_id));
                        const isActive = Boolean(operator.started_at && !operator.stopped_at);
                        return {
                            name: getUserLabel(operator.user_id),
                            role: operator.user_position || "Shop Floor Tech",
                            route: routeLabel(task),
                            workstation: workCenterLabel(task),
                            timeIn: operator.started_at ? formatPhtTimestamp(operator.started_at) : "Not recorded",
                            timeOut: operator.stopped_at
                                ? formatPhtTimestamp(operator.stopped_at)
                                : isActive ? "Active at report time" : "Not recorded",
                            durationHours: Number(operator.actual_hours || 0),
                            isActive
                        };
                    });

                const routeNameById = new Map<number, string>();
                sortedTasks.forEach((task) => {
                    routeNameById.set(Number(task.id), routeLabel(task));
                    if (task.jo_route_id) routeNameById.set(Number(task.jo_route_id), routeLabel(task));
                });
                const breakdownRows = statusHistory
                    .filter((record) => /^\s*Halted at step\b/i.test(String(record.remarks || "")))
                    .map((record) => {
                        const remarksText = String(record.remarks || "");
                        const stepFromRemarks = remarksText.match(/^\s*Halted at step\s+(.+?)\.\s*Reported yield:/i)?.[1];
                        const reason = remarksText.match(/Reason:\s*(.*)$/i)?.[1] || "";
                        const routeId = Number(record.jo_route_id || 0);
                        const task = routeById.get(routeId);
                        const centerId = Number(record.work_center_id || task?.work_center_id || 0);
                        const workCenter = workCenterById.get(centerId) || task?.work_center || null;
                        const reportedYieldValue = record.reported_yield_quantity;
                        return {
                            timestamp: formatPhtTimestamp(record.changed_at),
                            step: routeNameById.get(routeId) || stepFromRemarks || "Route step not recorded",
                            workstation: workCenter?.work_center_name
                                || record.work_center_name
                                || task?.work_center_name
                                || (centerId ? "Work Center #" + centerId : "Unassigned"),
                            machineId: assetIdForWorkCenter(workCenter)
                                ? "Asset #" + assetIdForWorkCenter(workCenter)
                                : "",
                            reportedYield: reportedYieldValue === null || reportedYieldValue === undefined
                                || !Number.isFinite(Number(reportedYieldValue))
                                ? null
                                : Number(reportedYieldValue),
                            reason,
                            reportedBy: record.changed_by_name
                                || (record.changed_by ? getUserLabel(Number(record.changed_by)) : "System"),
                            evidenceFiles: (record.evidence_files || [])
                                .map((file) => file.file_name || file.directus_file_id)
                                .filter((file): file is string => Boolean(file))
                        };
                    });
                const selectedReason = rejectionReasons.find((reason) =>
                    String(reason.id ?? reason.reason_id ?? "") === selectedReasonId
                );
                const branchName = (selectedJobOrder as JobOrder & { branch_name?: string }).branch_name
                    || (selectedJobOrder.branch_id ? "Branch #" + selectedJobOrder.branch_id : "Not recorded");
                const reportHtml = buildShiftClosureReportHtml({
                    jobOrderNo,
                    productName: selectedJobOrder.product_name,
                    branch: branchName,
                    jobOrderStatus: String(selectedJobOrder.status || "Not recorded"),
                    printedAt: formatPhtTimestamp(new Date()),
                    documentNo: "SC-" + jobOrderNo,
                    revision: "1.0",
                    sessionKey,
                    productionDay,
                    shiftName,
                    productionDate: formatPhtDate(productionDate),
                    targetQuantity,
                    outputUnit: selectedJobOrder.uom_shortcut || selectedJobOrder.uom_name || "units",
                    goodQuantity: Number(shiftYieldQty || 0),
                    rejectedQuantity: Number(rejectedQty || 0),
                    rejectionReason: selectedReason ? selectedReason.code + " · " + selectedReason.reason_name : "No defect / standard run",
                    rejectionRemarks,
                    sessionRemarks: remarks,
                    varianceReason,
                    outputBatchStatus: "Assigned during In-Process QA",
                    currentEvidenceFiles: evidenceImages.map((file) => file.name + " · " + (file.type || "unknown file type") + " · " + file.size.toLocaleString() + " bytes"),
                    routes: routeRows,
                    operators: operatorRows,
                    materials: shiftMaterials.map((material) => ({
                        productName: material.product_name,
                        unit: material.unit_shortcut || "units",
                        mmLot: material.mm_lot_name || "",
                        inventoryLot: material.inventory_lot_batch_no || "",
                        batchNo: material.batch_no || "",
                        standardQuantity: materialTheoretical(material),
                        actualQuantity: requestedConsumption(material)
                    })),
                    breakdowns: breakdownRows,
                    workstationMetadataUnavailable: workCenterLookup === null
                });

                if (!printWindow.closed) {
                    printWindow.document.open();
                    printWindow.document.write(reportHtml);
                    printWindow.document.close();
                }
            } catch (error) {
                if (printWindow.closed) return;
                const message = error instanceof Error ? error.message : "Required Job Order history could not be loaded.";
                printWindow.document.open();
                printWindow.document.write(buildShiftClosureReportErrorHtml(jobOrderNo, message));
                printWindow.document.close();
            }
        })();
    };
    const materialConsumptionDefaults = React.useMemo(
        () => calculateMaterialConsumptionDefaults(shiftMaterials, targetQuantity, totalOutputQuantity),
        [shiftMaterials, targetQuantity, totalOutputQuantity]
    );
    const materialTheoretical = (material: ProductionMaterialReservation) => {
        const index = shiftMaterials.indexOf(material);
        return index >= 0 ? materialConsumptionDefaults[index]?.theoreticalQuantity || 0 : 0;
    };

    const requestedConsumption = (material: ProductionMaterialReservation) => {
        const key = materialConsumptionReservationKey(material);
        const inputDraft = consumptionInputDrafts[key];
        if (inputDraft !== undefined) return parseMaterialConsumptionInput(inputDraft) ?? 0;
        return Number(consumptionDrafts[key] ?? material.actual_qty ?? 0) || 0;
    };

    const currentWipForRequest = (material: ProductionMaterialReservation) => {
        const rootKey = materialConsumptionReservationKey(material);
        const keys = new Set([rootKey, ...(topUpReservationKeysByRootRef.current.get(rootKey) || [])]);
        return [...keys].reduce((total, key) => {
            const reservation = shiftMaterials.find((row) => materialConsumptionReservationKey(row) === key);
            return total + Math.max(0, Number(reservation?.available_stock || 0));
        }, 0);
    };

    const allocateConsumptionRequest = (
        materials: ProductionMaterialReservation[],
        rootKey: string,
        requested: number
    ): ProductionMaterialReservation[] => {
        const relatedKeys = new Set([rootKey, ...(topUpReservationKeysByRootRef.current.get(rootKey) || [])]);
        const targets = [...relatedKeys].flatMap((key) => {
            const reservation = materials.find((material) => materialConsumptionReservationKey(material) === key);
            return reservation ? [{ reservationKey: key, availableStock: Number(reservation.available_stock || 0) }] : [];
        });
        const allocation = distributeConsumptionAcrossReservations(requested, targets);
        const quantitiesByKey = new Map(allocation.allocations.map((entry) => [entry.reservationKey, entry.actualQuantity]));
        return materials.map((material) => {
            const key = materialConsumptionReservationKey(material);
            const actualQuantity = quantitiesByKey.get(key);
            return actualQuantity === undefined ? material : { ...material, actual_qty: actualQuantity };
        });
    };

    const commitConsumptionInputDraft = (material: ProductionMaterialReservation, materialIndex: number) => {
        const key = materialConsumptionReservationKey(material);
        const rawValue = consumptionInputDrafts[key];
        if (rawValue === undefined) return;

        const requested = parseMaterialConsumptionInput(rawValue);
        if (requested === null) {
            setConsumptionInputErrors((previous) => ({
                ...previous,
                [key]: "Enter a valid non-negative quantity with up to 6 decimal places."
            }));
            return;
        }

        manuallyEditedMaterialKeysRef.current.add(key);
        const availableStock = roundToInputStep(material.available_stock);
        const relatedKeys = topUpReservationKeysByRootRef.current.get(key);
        const needsAllocation = requested > availableStock + 0.000001 || Boolean(relatedKeys?.size);
        if (needsAllocation) {
            setShiftMaterials((previous) => allocateConsumptionRequest(previous, key, requested));
        } else {
            setShiftMaterials((previous) => previous.map((item, index) =>
                index === materialIndex ? { ...item, actual_qty: String(requested) } : item
            ));
        }
        setConsumptionDrafts((previous) => {
            const next = { ...previous };
            if (requested > availableStock + 0.000001) next[key] = String(requested);
            else delete next[key];
            return next;
        });
        setConsumptionInputDrafts((previous) => {
            const next = { ...previous };
            delete next[key];
            return next;
        });
        setConsumptionInputErrors((previous) => {
            const next = { ...previous };
            delete next[key];
            return next;
        });
    };

    const materialsForSubmission = (): ProductionMaterialReservation[] => {
        let resolvedMaterials = shiftMaterials.map((material) => ({ ...material }));
        Object.entries(consumptionInputDrafts).forEach(([key, rawValue]) => {
            const requested = parseMaterialConsumptionInput(rawValue);
            const root = resolvedMaterials.find((material) => materialConsumptionReservationKey(material) === key);
            if (requested === null || !root) return;

            const availableStock = roundToInputStep(root.available_stock);
            const relatedKeys = topUpReservationKeysByRootRef.current.get(key);
            if (requested > availableStock + 0.000001 || Boolean(relatedKeys?.size)) {
                resolvedMaterials = allocateConsumptionRequest(resolvedMaterials, key, requested);
            } else {
                resolvedMaterials = resolvedMaterials.map((material) =>
                    materialConsumptionReservationKey(material) === key
                        ? { ...material, actual_qty: String(requested) }
                        : material
                );
            }
        });
        return resolvedMaterials;
    };

    const handleAllocationPreview = useCallback((reservationKey: string, quantity: number) => {
        setTopUpPreviews((previous) => ({ ...previous, [reservationKey]: quantity }));
    }, []);

    const handleTopUpAdded = useCallback(async (response: WipTopUpResponse) => {
        const target = topUpTarget;
        if (!target) {
            await loadShiftMaterials();
            return;
        }

        const rootKey = target.reservationKey;
        const addedKeys = (response.allocations || [])
            .filter((allocation) => allocation.reservationId !== null && allocation.reservationId !== undefined)
            .map((allocation) => reservationKeyFor(target.joMaterialId, allocation.reservationId));
        addedKeys.forEach((key) => {
            if (!allocatedWipByReservationRef.current.has(key)) allocatedWipByReservationRef.current.set(key, 0);
        });

        const relatedKeys = topUpReservationKeysByRootRef.current.get(rootKey) || new Set<string>();
        relatedKeys.add(rootKey);
        addedKeys.forEach((key) => relatedKeys.add(key));
        topUpReservationKeysByRootRef.current.set(rootKey, relatedKeys);

        const refreshedMaterials = await loadShiftMaterials();
        const originalRootExists = refreshedMaterials.some((material) => materialConsumptionReservationKey(material) === rootKey);
        const effectiveRootKey = originalRootExists
            ? rootKey
            : addedKeys.find((key) => refreshedMaterials.some((material) => materialConsumptionReservationKey(material) === key)) || rootKey;
        const inputDraft = consumptionInputDrafts[rootKey];
        const requested = Math.max(0, inputDraft === undefined
            ? Number(consumptionDrafts[rootKey] ?? target.requestedQuantity) || 0
            : parseMaterialConsumptionInput(inputDraft) ?? target.requestedQuantity);

        if (effectiveRootKey !== rootKey) {
            topUpReservationKeysByRootRef.current.delete(rootKey);
            topUpReservationKeysByRootRef.current.set(effectiveRootKey, relatedKeys);
        }

        const orderedKeys = [...new Set([effectiveRootKey, ...addedKeys])];
        const availableTargets = orderedKeys.flatMap((key) => {
            const reservation = refreshedMaterials.find((material) => materialConsumptionReservationKey(material) === key);
            return reservation ? [{ reservationKey: key, availableStock: Number(reservation.available_stock || 0) }] : [];
        });
        const distribution = distributeConsumptionAcrossReservations(requested, availableTargets);
        const distributedByKey = new Map(distribution.allocations.map((allocation) => [allocation.reservationKey, allocation.actualQuantity]));
        distributedByKey.forEach((_quantity, key) => manuallyEditedMaterialKeysRef.current.add(key));
        setShiftMaterials((previous) => previous.map((material) => {
            const key = materialConsumptionReservationKey(material);
            const actualQuantity = distributedByKey.get(key);
            return actualQuantity === undefined ? material : { ...material, actual_qty: actualQuantity };
        }));

        const keepDraft = distribution.remainingQuantity > 0.000001;
        setConsumptionDrafts((previous) => {
            const next = { ...previous };
            delete next[rootKey];
            if (effectiveRootKey !== rootKey) delete next[effectiveRootKey];
            if (keepDraft) next[effectiveRootKey] = String(requested);
            return next;
        });
        setTopUpPreviews((previous) => {
            const next = { ...previous };
            delete next[rootKey];
            delete next[effectiveRootKey];
            return next;
        });
        preserveTopUpDraftOnCloseRef.current = true;
    }, [consumptionDrafts, consumptionInputDrafts, loadShiftMaterials, topUpTarget]);

    const openTopUp = (material: ProductionMaterialReservation) => {
        const theoretical = materialTheoretical(material);
        const available = currentWipForRequest(material);
        const requested = requestedConsumption(material);
        const reservationKey = materialConsumptionReservationKey(material);
        setTopUpTarget({
            jobOrderId: Number(selectedJobOrder.order_id || selectedJobOrder.job_order_id || 0),
            joMaterialId: Number(material.jo_material_id),
            productId: Number(material.product_id),
            productName: material.product_name,
            unitShortcut: material.unit_shortcut || "units",
            uomId: material.uom_id ?? null,
            remainingWip: available,
            theoretical,
            shortfall: calculateWipTopUpShortfall(requested, available),
            requestedQuantity: requested,
            reservationKey,
            candidateLots: material.candidate_lots || [],
            preferredLot: {
                mmLotId: material.mm_lot_id,
                inventoryLotId: material.inventory_lot_id,
                batchNo: material.inventory_lot_batch_no || material.batch_no
            },
            isSubAssembly: Boolean(material.is_sub_assembly)
        });
        setIsTopUpOpen(true);
    };

    const hasInsufficiency = shiftMaterials.some((material) =>
        exceedsAvailableStock(requestedConsumption(material), currentWipForRequest(material))
    );
    const hasTheoreticalShortage = shiftMaterials.some((material) =>
        exceedsAvailableStock(materialTheoretical(material), material.available_stock)
    );
    const hasIncompleteMaterialLine = shiftMaterials.some((m) =>
        !m.reservation_id
        || !m.mm_lot_id
        || !m.inventory_lot_id
        || !m.uom_id
        || !String(m.batch_no || "").trim()
    );
    const hasInvalidMaterialConsumptionDraft = Object.values(consumptionInputDrafts)
        .some((rawValue) => parseMaterialConsumptionInput(rawValue) === null);
    const consumedByMaterial = shiftMaterials.reduce((totals, material) => {
        const materialId = Number(material.jo_material_id || 0);
        totals.set(materialId, (totals.get(materialId) || 0) + Number(material.actual_qty || 0));
        return totals;
    }, new Map<number, number>());
    const consumptionRequests = new Map(Object.entries(consumptionDrafts));
    Object.entries(consumptionInputDrafts).forEach(([key, rawValue]) => consumptionRequests.set(key, rawValue));
    consumptionRequests.forEach((rawRequest, rootKey) => {
        const isActiveInput = Object.prototype.hasOwnProperty.call(consumptionInputDrafts, rootKey);
        const requested = isActiveInput
            ? parseMaterialConsumptionInput(rawRequest)
            : Number(rawRequest);
        const rootMaterial = shiftMaterials.find((material) => materialConsumptionReservationKey(material) === rootKey);
        if (requested === null || !Number.isFinite(requested) || requested < 0 || !rootMaterial) return;
        if (!isActiveInput && requested <= 0) return;

        const relatedKeys = new Set([rootKey, ...(topUpReservationKeysByRootRef.current.get(rootKey) || [])]);
        const distributed = shiftMaterials.reduce((total, material) =>
            total + (relatedKeys.has(materialConsumptionReservationKey(material)) ? Number(material.actual_qty || 0) : 0), 0);
        const materialId = Number(rootMaterial.jo_material_id || 0);
        const current = consumedByMaterial.get(materialId) || 0;
        const adjustment = isActiveInput ? requested - distributed : Math.max(0, requested - distributed);
        consumedByMaterial.set(materialId, current + adjustment);
    });
    const hasMissingMaterialConsumption = shiftMaterials.length === 0 || shiftMaterials.some((material) =>
        (consumedByMaterial.get(Number(material.jo_material_id || 0)) || 0) <= 0
    );
    const hasOutput = totalOutputQuantity > 0;
    const varianceTolerancePct = Math.max(0, Number(
        shiftMaterials.find((material) => material.material_consumption_variance_tolerance_pct !== undefined)
            ?.material_consumption_variance_tolerance_pct || 0
    ));
    const varianceGroups = new Map<number, { theoretical: number; actual: number; unit: string }>();
    shiftMaterials.forEach((material) => {
        const materialId = Number(material.jo_material_id || 0);
        const current = varianceGroups.get(materialId) || {
            theoretical: 0,
            actual: consumedByMaterial.get(materialId) || 0,
            unit: material.unit_shortcut || "units"
        };
        current.theoretical += materialTheoretical(material);
        varianceGroups.set(materialId, current);
    });
    const varianceExceptions = [...varianceGroups.entries()]
        .map(([joMaterialId, values]) => ({
            joMaterialId,
            ...values,
            variance: values.actual - values.theoretical
        }))
        .filter((group) => Math.abs(group.variance) > Math.max(0.000001, Math.abs(group.theoretical) * varianceTolerancePct / 100));
    const hasVarianceException = !hasTheoreticalShortage && varianceExceptions.length > 0;
    const missingVarianceApproval = hasVarianceException && (!varianceReason.trim() || !approveVariance);
    const isSubmitDisabled = submittingShiftLog
        || loadingShiftMaterials
        || Boolean(materialsLoadError)
        || hasInvalidMaterialConsumptionDraft
        || hasInsufficiency
        || hasIncompleteMaterialLine
        || hasMissingMaterialConsumption
        || missingVarianceApproval
        || evidenceImages.length === 0
        || Boolean(evidenceImageError)
        || !hasOutput
        || !hasCompletedJobOrderTimer
        || !sessionKey
        || !productionDate
        || !shiftName.trim();
    const isPrintDisabled = loadingShiftMaterials || Boolean(materialsLoadError) || hasInsufficiency || !hasOutput || !shiftName.trim();
    const priorYieldRows = selectedJobOrder.yield_logs || [];
    const goodOutputBeforeShift = committedGoodOutputOrAggregate(priorYieldRows, selectedJobOrder.producedQty
        ?? selectedJobOrder.completed_quantity
        ?? selectedJobOrder.productionOutputQuantity
        ?? 0);
    const outputSummary = calculateShiftOutputConfirmationSummary(
        goodOutputBeforeShift,
        shiftYieldQty,
        priorYieldRows,
        rejectedQty
    );
    const projectedGoodOutput = outputSummary.projectedGoodQuantity;
    const currentShiftRejectedQuantity = outputSummary.sessionRejectedQuantity;
    const cumulativeRejectedQuantity = outputSummary.cumulativeRejectedQuantity;
    const totalManufacturedRunQuantity = outputSummary.totalManufacturedRunQuantity;
    const finalShiftReachesTarget = hasReachedProductionTarget(targetQuantity, projectedGoodOutput);
    const projectedOutputOverrun = calculateProductionOutputOverrun(targetQuantity, projectedGoodOutput);
    const incompleteRouteTasks = sortedTasks.filter((task) => !isTerminalRouteStatus(task.status));
    const activeJobOrderTimerOperators = allJobOperators.filter((operator) => Boolean(operator.started_at) && !operator.stopped_at);
    const completionBlockers = [
        ...(sortedTasks.length === 0 ? ["No routing steps are configured for this Job Order."] : []),
        ...incompleteRouteTasks.map((task, index) =>
            `Step ${task.sequence_order || index + 1}: ${task.name || "Unnamed operation"} is ${task.status || "Not started"}.`
        ),
        ...activeJobOrderTimerOperators.map((operator) => {
            const task = sortedTasks.find((candidate) => Number(candidate.id) === Number(operator.task_id));
            return task
                ? `Stop ${getUserLabel(operator.user_id)}'s active timer on Step ${task.sequence_order || "-"}: ${task.name} before finalizing.`
                : `Stop ${getUserLabel(operator.user_id)}'s active timer before finalizing.`;
        })
    ];
    const allRoutesReadyForCompletion = completionBlockers.length === 0;

    return (
        <>
            <Dialog
                open={open}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && isTopUpOpen) return;
                    onOpenChange(nextOpen);
                }}
            >
                <DialogContent className="w-[98vw] md:w-full md:max-w-[1200px] lg:max-w-[1400px] max-h-[96vh] md:max-h-[92vh] flex flex-col bg-background border border-border/60 shadow-2xl rounded-2xl p-0 overflow-hidden">
                    <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-background p-4 sm:p-6 border-b border-border/50 shrink-0">
                        <DialogHeader>
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-primary/10 rounded-xl text-primary shrink-0">
                                    <ClipboardCheck className="h-5 w-5 sm:h-6 sm:w-6" />
                                </div>
                                <div className="min-w-0">
                                    <DialogTitle className="font-bold text-sm sm:text-base md:text-lg tracking-tight text-foreground truncate">
                                        End-of-Shift / Job Order Progress Entry
                                    </DialogTitle>
                                    <DialogDescription className="text-muted-foreground text-[10px] sm:text-xs mt-0.5 line-clamp-2 sm:line-clamp-none">
                                         Record one production session's output and exact WIP-reservation consumption for all routing steps in <strong className="text-foreground">Job Order #{selectedJobOrder?.order_no || selectedJobOrder?.jo_id}</strong>. Output remains Pending QA until it is released.
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>
                    </div>

                    <form onSubmit={handleShiftLogSubmit} className="p-4 sm:p-6 flex-1 flex flex-col overflow-hidden min-h-0 text-xs">
                        {recoveryStatus === "none" ? (
                            <>
                        <div className="grid grid-cols-1 items-start lg:grid-cols-12 gap-4 sm:gap-6 flex-1 overflow-y-auto pr-1 min-h-0">
                            {/* Left Column: Yield, Rejection, Batch Metadata, Operators */}
                            <div className="min-w-0 lg:col-span-6 space-y-5">
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
                                             <div className="flex items-center justify-between gap-2">
                                                 <Label htmlFor="shiftYield" className="text-muted-foreground font-medium text-[11px] font-mono">Good Output (pcs)</Label>
                                                 <span className="text-[10px] font-medium text-muted-foreground">Target: {formatProductionQuantity(targetQuantity)} pcs</span>
                                             </div>
                                             <Input
                                                 id="shiftYield"
                                                 type="number"
                                                 min="0"
                                                 step="0.000001"
                                                 value={shiftYieldQty}
                                                onChange={(e) => handleOutputQuantityChange("good", e.target.value)}
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
                                             <Layers className="h-4 w-4 text-primary shrink-0" />
                                             <div className="min-w-0">
                                                 <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Route Scope</p>
                                                 <p className="text-xs font-semibold text-foreground truncate">All {sortedTasks.length || "available"} routing steps</p>
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

                                    {/* Rejected Output Tracking Section */}
                                    <div className="bg-rose-500/[0.03] border border-rose-500/20 rounded-xl p-3.5 space-y-3">
                                        <div className="flex items-center justify-between pb-1.5 border-b border-rose-500/10">
                                            <div className="flex items-center gap-1.5">
                                                <ShieldAlert className="h-4 w-4 text-rose-500" />
                                         <h5 className="font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider text-[10px]">
                                                     Rejected Output Tracking
                                                </h5>
                                            </div>
                                            <Badge variant="outline" className="text-[9px] text-rose-600 border-rose-500/20">
                                                QA Tracking
                                            </Badge>
                                        </div>
                                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                             <div className="space-y-1">
                                                 <Label htmlFor="rejectedQty" className="text-muted-foreground text-[10px]">Rejected Units</Label>
                                                 <Input
                                                     id="rejectedQty"
                                                     type="number"
                                                     min="0"
                                                     step="0.000001"
                                                     value={rejectedQty}
                                                     onChange={(e) => handleOutputQuantityChange("rejected", e.target.value)}
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
                                             <div className="space-y-1 sm:col-span-2">
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
                                                    Inspector / Shift Evidence <span className="text-destructive">*</span>
                                                </h5>
                                            </div>
                                            <Badge variant="outline" className="text-[9px] text-sky-700 dark:text-sky-300 border-sky-500/20">
                                                Required
                                            </Badge>
                                        </div>
                                        <EvidenceMediaInput
                                            id="production-evidence"
                                            label="Attach evidence file"
                                            files={evidenceImages}
                                            multiple
                                            error={evidenceImageError}
                                            required
                                            disabled={submittingShiftLog}
                                            active={open}
                                            onFilesChange={(files, validationError) => {
                                                setEvidenceImages(files);
                                                setEvidenceImageError(validationError);
                                            }}
                                        />
                                    </div>

                                </div>
                            </div>

                             {/* Right Column: Exact WIP reservation consumption */}
                            <div className="min-w-0 lg:col-span-6">
                                <div className="min-w-0 bg-card/50 backdrop-blur-sm border border-border/60 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
                                    <div className="flex flex-col gap-3 pb-2 border-b border-border/40 xl:flex-row xl:items-center xl:justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1 bg-primary/10 rounded text-primary">
                                                <Layers className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-foreground/90 uppercase tracking-wider text-[10px]">
                                                     Exact WIP Reservation Consumption
                                                 </h4>
                                                 <p className="text-[9px] text-muted-foreground mt-0.5">Review the reserved MM lot, batch, and UOM used for this session.</p>
                                             </div>
                                         </div>
                                         <div className="flex w-full items-center gap-2 xl:w-auto">
                                             <div className="relative min-w-0 flex-1 xl:w-64 xl:flex-none">
                                                 <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                                 <Input
                                                     type="text"
                                                     value={reservationSearch}
                                                     onChange={(event) => setReservationSearch(event.target.value)}
                                                     placeholder="Search material, reservation, lot, or batch"
                                                     aria-label="Search WIP reservations by component, reservation ID, MM lot, or batch number"
                                                     disabled={loadingShiftMaterials || Boolean(materialsLoadError) || shiftMaterials.length === 0}
                                                     className="h-8 pl-8 pr-8 text-xs"
                                                 />
                                                 {reservationSearch && (
                                                     <button
                                                         type="button"
                                                         onClick={() => setReservationSearch("")}
                                                         aria-label="Clear WIP reservation search"
                                                         className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                     >
                                                         <X className="h-3.5 w-3.5" aria-hidden="true" />
                                                     </button>
                                                 )}
                                             </div>
                                             <Badge variant="outline" className="shrink-0 text-[9px] font-mono bg-primary/5 text-primary border-primary/20 font-bold">
                                                 WIP Ledger
                                             </Badge>
                                         </div>
                                    </div>

                                    {loadingShiftMaterials ? (
                                        <div role="status" aria-label="Loading required raw materials" aria-busy="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                            <span className="sr-only">Loading required raw materials...</span>
                                            {Array.from({ length: 3 }).map((_, index) => (
                                                <div key={`shift-material-skeleton-${index}`} aria-hidden="true" className="space-y-3 rounded-lg border border-border/40 bg-background/50 p-4">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <Skeleton className="h-4 w-2/3" />
                                                        <Skeleton className="h-4 w-16" />
                                                    </div>
                                                    <Skeleton className="h-3 w-1/2" />
                                                    <Skeleton className="h-9 w-full" />
                                                    <Skeleton className="h-8 w-full" />
                                                </div>
                                            ))}
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
                                    ) : filteredShiftMaterials.length === 0 ? (
                                        <div className="p-6 bg-background/50 rounded-lg text-muted-foreground text-center border border-border/40 flex-1 flex flex-col items-center justify-center gap-2" role="status">
                                            <p>No WIP reservations match “{reservationSearch.trim()}”.</p>
                                            <Button type="button" variant="outline" size="sm" onClick={() => setReservationSearch("")}>Clear search</Button>
                                        </div>
                                    ) : (
                                        <div className="min-w-0 space-y-3">
                                            {filteredShiftMaterials.map((m, index) => {
                                                 const materialIndex = shiftMaterials.indexOf(m);
                                                 const theoretical = materialConsumptionDefaults[materialIndex]?.theoreticalQuantity || 0;
                                                 const reservationKey = materialConsumptionReservationKey(m);
                                                 const actual = requestedConsumption(m);
                                                 const variance = actual - theoretical;
                                                 const isExceeded = Math.abs(variance) > Math.max(0.000001, Math.abs(theoretical) * varianceTolerancePct / 100);
                                                 const availableForRequest = currentWipForRequest(m);
                                                 const isInsufficient = exceedsAvailableStock(actual, availableForRequest);
                                                const availableStock = roundToInputStep(m.available_stock);
                                                const shortfall = calculateWipTopUpShortfall(actual, availableForRequest);
                                                const allocated = allocatedWipByReservationRef.current.get(reservationKey) ?? availableStock;
                                                const confirmedAdditional = Math.max(0, availableStock - allocated);
                                                const previewAdditional = Math.max(0, Number(topUpPreviews[reservationKey] || 0));
                                                const additional = confirmedAdditional + previewAdditional;
                                                const projectedRemainingWip = allocated + additional;
                                                 const percentage = Math.min(200, theoretical > 0 ? (actual / theoretical) * 100 : 0);
                                                const barColor = isInsufficient
                                                    ? "bg-red-500" 
                                                    : isExceeded 
                                                    ? "bg-amber-500" 
                                                    : "bg-emerald-500";
                                                const needsTopUp = isInsufficient;

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
                                                                     {!m.reservation_id ? "No WIP" : isInsufficient ? "Shortfall" : isExceeded ? "Outside tolerance" : "Normal"}
                                                                 </Badge>
                                                             </div>
                                                         </div>

                                                         <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
                                                             <span>MM Lot: <strong className="font-mono text-foreground">{m.mm_lot_name || "Lot name unavailable"}</strong></span>
                                                             <span>Batch: <strong className="font-mono text-foreground">{m.inventory_lot_batch_no || m.batch_no || "Batch identifier unavailable"}</strong></span>
                                                             {m.batch_no && m.batch_no !== (m.inventory_lot_batch_no || m.batch_no) && (
                                                                 <span>Reservation Batch: <strong className="font-mono text-foreground">{m.batch_no}</strong></span>
                                                             )}
                                                             <span>UOM: <strong className="font-mono text-foreground">{m.unit_shortcut || `#${m.uom_id || "—"}`}</strong></span>
                                                             <span>Status: <strong className="text-foreground">{m.reservation_status || "Not staged"}</strong></span>
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
                                                                        {formatExactMaterialQuantity(theoretical)} {m.unit_shortcut}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-muted-foreground">Remaining WIP{previewAdditional > 0 ? " (projected)" : ""}:</span>
                                                                    <span className={`font-mono font-bold ${isInsufficient ? "text-red-500" : "text-foreground/85"}`}>
                                                                        {formatExactMaterialQuantity(projectedRemainingWip)} {m.unit_shortcut}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-muted-foreground">Allocated:</span>
                                                                    <span className="font-mono font-bold text-foreground/85">
                                                                        {formatExactMaterialQuantity(allocated)} {m.unit_shortcut}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-muted-foreground">Additional:</span>
                                                                    <span className={`font-mono font-bold ${additional > 0 ? "text-amber-600" : "text-foreground/85"}`}>
                                                                        {formatExactMaterialQuantity(additional)} {m.unit_shortcut}{previewAdditional > 0 ? " selected" : ""}
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
                                                                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                                                                    <label htmlFor={`actual-material-used-${m.jo_material_id}-${index}`} className="text-muted-foreground">
                                                                        Actual Material Used:
                                                                    </label>
                                                                    <div className="flex flex-col items-end gap-1">
                                                                        <div className="flex items-center gap-1.5">
                                                                        <Input
                                                                             id={`actual-material-used-${m.jo_material_id}-${index}`}
                                                                             type="text"
                                                                             inputMode="decimal"
                                                                             value={consumptionInputDrafts[reservationKey] ?? consumptionDrafts[reservationKey] ?? m.actual_qty}
                                                                             aria-invalid={Boolean(consumptionInputErrors[reservationKey])}
                                                                             aria-describedby={consumptionInputErrors[reservationKey] ? `actual-material-used-error-${m.jo_material_id}-${index}` : undefined}
                                                                            onChange={(e) => {
                                                                                const raw = e.target.value;
                                                                                manuallyEditedMaterialKeysRef.current.add(reservationKey);
                                                                                setConsumptionInputDrafts((previous) => ({ ...previous, [reservationKey]: raw }));
                                                                                setConsumptionInputErrors((previous) => {
                                                                                    const next = { ...previous };
                                                                                    delete next[reservationKey];
                                                                                    return next;
                                                                                });
                                                                             }}
                                                                             onBlur={() => commitConsumptionInputDraft(m, materialIndex)}
                                                                             disabled={loadingShiftMaterials}
                                                                             className={`h-8 w-36 text-right bg-background px-2 py-1.5 rounded-lg font-bold font-mono text-xs disabled:opacity-50 ${consumptionInputErrors[reservationKey] ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                                                                         />
                                                                        <span className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-1 text-[9px] font-semibold text-muted-foreground">
                                                                            {m.unit_shortcut}
                                                                        </span>
                                                                        </div>
                                                                        {consumptionInputErrors[reservationKey] && (
                                                                            <span
                                                                                id={`actual-material-used-error-${m.jo_material_id}-${index}`}
                                                                                role="alert"
                                                                                className="text-right text-[9px] text-red-600"
                                                                            >
                                                                                {consumptionInputErrors[reservationKey]}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {needsTopUp && (
                                                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                                                                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                                                                        {`Short by ${shortfall.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${m.unit_shortcut} against entered actual consumption.`}
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
                                Review & Record
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
                            </>
                        ) : (
                            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-2 py-8 text-center">
                                <div className="w-full max-w-2xl space-y-5">
                                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                        <AlertTriangle className="h-6 w-6" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <h3 className="text-base font-semibold text-foreground">
                                            {recoveryStatus === "checking" ? "Checking for a saved shift…"
                                                : recoveryStatus === "resuming" ? "Resuming the saved shift…"
                                                    : recoveryStatus === "error" ? "Unable to check for saved shifts"
                                                        : "A shift is waiting to be recovered"}
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            {recoveryStatus === "checking" || recoveryStatus === "resuming"
                                                ? "Please wait. Keep this window open while the saved session is checked."
                                                : recoveryError || "This Job Order has an incomplete shift session. Resume it before entering another shift so the output is not duplicated."}
                                        </p>
                                    </div>

                                    {recoverableSessions.length > 0 && (
                                        <div className="space-y-3 text-left">
                                            {recoverableSessions.map((session) => {
                                                const details = session.recoveryError?.details || {};
                                                return (
                                                    <div key={`${session.ledgerId}:${session.sessionKey}`} className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div>
                                                                <p className="font-semibold text-foreground">{session.shiftName || "Saved production shift"}</p>
                                                                <p className="mt-1 text-xs text-muted-foreground">
                                                                    {session.productionDate || "Date unavailable"} · Good {formatProductionQuantity(session.goodQuantity)} pcs · Rejected {formatProductionQuantity(session.rejectedQuantity)} pcs
                                                                </p>
                                                                {session.recoveryError?.message && (
                                                                    <p className="mt-2 text-xs text-amber-900 dark:text-amber-200">{session.recoveryError.message}</p>
                                                                )}
                                                                {details.joMaterialId !== undefined && (
                                                                    <p className="mt-2 text-xs text-muted-foreground">
                                                                        Material #{String(details.joMaterialId)}: saved balance {String(details.expectedActualBefore ?? details.expectedRemainingBefore ?? "—")}; live balance {String(details.liveActual ?? details.liveRemaining ?? "—")}.
                                                                    </p>
                                                                )}
                                                            </div>
                                                            {session.canResume ? (
                                                                <Button
                                                                    type="button"
                                                                    disabled={recoveryStatus === "resuming"}
                                                                    onClick={() => void handleResumePendingSession(session)}
                                                                >
                                                                    Resume saved shift
                                                                </Button>
                                                            ) : (
                                                                <Badge variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-200">
                                                                    Needs supervisor reconciliation
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div className="flex flex-wrap justify-center gap-2">
                                        {recoveryStatus === "error" && (
                                            <Button type="button" variant="outline" onClick={() => void handleRetryRecoveryCheck()}>
                                                Retry check
                                            </Button>
                                        )}
                                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                            Close
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </form>
                </DialogContent>
                <AddReservedMaterialDialog
                    open={isTopUpOpen}
                    onOpenChange={(nextOpen) => {
                        setIsTopUpOpen(nextOpen);
                        if (nextOpen) {
                            preserveTopUpDraftOnCloseRef.current = false;
                            return;
                        }
                        if (topUpTarget) {
                            const key = topUpTarget.reservationKey;
                            setTopUpPreviews((previous) => {
                                const next = { ...previous };
                                delete next[key];
                                return next;
                            });
                            if (!preserveTopUpDraftOnCloseRef.current) {
                                setConsumptionDrafts((previous) => {
                                    const next = { ...previous };
                                    delete next[key];
                                    return next;
                                });
                            }
                        }
                        preserveTopUpDraftOnCloseRef.current = false;
                        setTopUpTarget(null);
                    }}
                    target={topUpTarget}
                    onAdded={handleTopUpAdded}
                    onAllocationPreview={handleAllocationPreview}
                />
            </Dialog>

            <Dialog
                open={isConfirmationOpen}
                onOpenChange={(nextOpen) => {
                    if (!submittingShiftLog) setIsConfirmationOpen(nextOpen);
                }}
            >
                <DialogContent className="sm:max-w-[480px] bg-background border border-border shadow-2xl rounded-2xl">
                    <DialogHeader>
                        <DialogTitle>Confirm End-of-Shift Progress</DialogTitle>
                        <DialogDescription>
                            Review the production details for Job Order #{selectedJobOrder?.order_no || selectedJobOrder?.jo_id}. Saving records the output, material consumption, and shift evidence.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-4 text-sm">
                        <div>
                            <p className="text-xs text-muted-foreground">Shift</p>
                            <p className="font-medium">Day {productionDay} - {shiftName}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Production Date</p>
                            <p className="font-medium">{productionDate}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Good Output</p>
                            <p className="font-semibold">{formatProductionQuantity(outputSummary.sessionGoodQuantity)} pcs</p>
                            <p className="text-[11px] text-muted-foreground">
                                Projected Total: {formatProductionQuantity(projectedGoodOutput)} / {formatProductionQuantity(targetQuantity)} pcs
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Rejected Units</p>
                            <p className="font-semibold">{formatProductionQuantity(currentShiftRejectedQuantity)} pcs</p>
                            <p className="text-[11px] text-muted-foreground">
                                Cumulative Rejects: {formatProductionQuantity(cumulativeRejectedQuantity)} pcs
                            </p>
                        </div>
                        <div className="col-span-2 rounded-md border border-border/60 bg-background/70 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Total Manufactured Run</p>
                            <p className="font-semibold">
                                {formatProductionQuantity(totalManufacturedRunQuantity)} pcs
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                {formatProductionQuantity(projectedGoodOutput)} Good + {formatProductionQuantity(cumulativeRejectedQuantity)} Rejected
                            </p>
                        </div>
                    </div>
                    {finalShiftReachesTarget && (
                        <p className={`mt-3 rounded-md border px-3 py-2 text-xs ${projectedOutputOverrun > 0
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"}`}>
                            {projectedOutputOverrun > 0
                                ? `Projected good output exceeds the target by ${formatProductionQuantity(projectedOutputOverrun)} pcs. Save the actual quantity; the excess is shown as a QA variance, and remaining quantity stays at 0.`
                                : "This shift reaches the good-output target. Production can continue while the Job Order remains In Production; close it explicitly when ready for QA."}
                        </p>
                    )}
                    {finalShiftReachesTarget && !allRoutesReadyForCompletion && (
                        <div role="alert" aria-live="polite" className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                            <p className="font-semibold">Complete these requirements before closing the Job Order:</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5">
                                {completionBlockers.map((blocker, index) => <li key={`${index}-${blocker}`}>{blocker}</li>)}
                            </ul>
                        </div>
                    )}

                    <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={submittingShiftLog}
                            onClick={() => setIsConfirmationOpen(false)}
                        >
                            Back to Edit
                        </Button>
                        {finalShiftReachesTarget ? (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={submittingShiftLog}
                                    onClick={() => void handleConfirmShiftLog(false)}
                                >
                                    {submittingShiftLog ? "Saving Session..." : "Save Shift Only"}
                                </Button>
                                <Button
                                    type="button"
                                    disabled={submittingShiftLog || !allRoutesReadyForCompletion}
                                    title={!allRoutesReadyForCompletion ? completionBlockers.join(" ") : undefined}
                                    onClick={() => void handleConfirmShiftLog(true)}
                                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                                >
                                    {submittingShiftLog ? "Saving & Completing..." : "Complete & Close JO"}
                                </Button>
                            </>
                        ) : (
                            <Button
                                type="button"
                                disabled={submittingShiftLog}
                                onClick={() => void handleConfirmShiftLog(false)}
                            >
                                {submittingShiftLog ? "Saving Session..." : "Confirm & Save"}
                            </Button>
                        )}
                    </DialogFooter>
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
                                    const shortMaterial = shiftMaterials.find((material) =>
                                        exceedsAvailableStock(requestedConsumption(material), currentWipForRequest(material))
                                    );
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

        </>
    );
}
