/* eslint-disable */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    Camera,
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
    FolderOpen,
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
import { RoutingTask, JobOrder, User as UserType, RouteOperatorRecord, RejectionReason, ProductionMaterialReservation } from "../types";
import { submitShiftRunLog, ShiftRunLogPayload, fetchRejectionReasons } from "../services/production-api";
import { validateProductionYieldImage } from "../services/production-yield-image";
import { AddReservedMaterialDialog, type TopUpTarget } from "./AddReservedMaterialDialog";
import { toast } from "sonner";
import { calculatePipelinedLineDurationHours } from "../../planning-engineering/utils/production-timing";
import { exceedsAvailableStock, formatProductionQuantity, resolveJobOrderTargetQuantity, roundToInputStep } from "../utils/production-quantity";
import {
    calculateMaterialConsumptionDefaults,
    materialConsumptionReservationKey,
    preserveExistingActualQuantities,
    sumProductionOutputQuantities
} from "../utils/material-consumption";
import { getProductionCameraErrorMessage } from "../utils/production-camera";
import { hasCompletedTimer } from "../operator-time";
import { hasReachedProductionTarget } from "../utils/production-output";

interface JobOrderShiftLogModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedJobOrder: JobOrder;
    sortedTasks: RoutingTask[];
    users: UserType[];
    allJobOperators: RouteOperatorRecord[];
    onSuccess?: () => void;
}

type OutputQuantityField = "good" | "rejected" | "scrap";

interface OutputQuantities {
    good: string;
    rejected: string;
    scrap: string;
}

function formatExactMaterialQuantity(value: number): string {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
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
    const [scrapQty, setScrapQty] = useState("0");
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [selectedReasonId, setSelectedReasonId] = useState<string>("");
    const [rejectionRemarks, setRejectionRemarks] = useState("");
    const [remarks, setRemarks] = useState("");
    const [varianceReason, setVarianceReason] = useState("");
    const [approveVariance, setApproveVariance] = useState(false);
    const [shiftMaterials, setShiftMaterials] = useState<ProductionMaterialReservation[]>([]);
    const [reservationSearch, setReservationSearch] = useState("");
    const [materialsLoadError, setMaterialsLoadError] = useState<string | null>(null);
    const [loadingShiftMaterials, setLoadingShiftMaterials] = useState(false);
    const [submittingShiftLog, setSubmittingShiftLog] = useState(false);
    const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
    const [insufficiencyError, setInsufficiencyError] = useState<string | null>(null);
    const [isInsufficiencyOpen, setIsInsufficiencyOpen] = useState(false);
    const [topUpTarget, setTopUpTarget] = useState<TopUpTarget | null>(null);
    const [isTopUpOpen, setIsTopUpOpen] = useState(false);
    const [evidenceImage, setEvidenceImage] = useState<File | null>(null);
    const [evidenceImageError, setEvidenceImageError] = useState<string | null>(null);
    const [evidenceImagePreview, setEvidenceImagePreview] = useState<string | null>(null);
    const outputQuantitiesRef = useRef<OutputQuantities>({ good: "", rejected: "0", scrap: "0" });
    const manuallyEditedMaterialKeysRef = useRef<Set<string>>(new Set());
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [isCameraStarting, setIsCameraStarting] = useState(false);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const cameraVideoRef = useRef<HTMLVideoElement>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);
    const cameraRequestIdRef = useRef(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
    const targetQuantity = resolveJobOrderTargetQuantity(selectedJobOrder);

    const getUserLabel = (uId: number) => {
        const u = users.find((x) => (x.user_id || x.id) === uId);
        if (!u) return `Operator #${uId}`;
        const fname = u.user_fname || u.first_name || "";
        const lname = u.user_lname || u.last_name || "";
        return `${fname} ${lname}`.trim() || `User #${uId}`;
    };

    const activeOperator = allJobOperators.find((operator) => operator.started_at !== null && operator.stopped_at === null);
    const operatorLabel = activeOperator ? getUserLabel(activeOperator.user_id) : "Authenticated operator";
    const hasCompletedJobOrderTimer = allJobOperators.some((operator) =>
        !operator.is_placeholder && hasCompletedTimer(operator.started_at, operator.stopped_at)
    );

    useEffect(() => {
        if (!evidenceImage) {
            setEvidenceImagePreview(null);
            return;
        }

        const previewUrl = URL.createObjectURL(evidenceImage);
        setEvidenceImagePreview(previewUrl);
        return () => URL.revokeObjectURL(previewUrl);
    }, [evidenceImage]);

    const setEvidenceImageFromFile = (file: File | null): boolean => {
        if (!file) return false;

        const validationError = validateProductionYieldImage(file);
        setEvidenceImageError(validationError);
        setEvidenceImage(validationError ? null : file);
        return !validationError;
    };

    const handleEvidenceImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null;
        event.target.value = "";
        setCameraError(null);
        setEvidenceImageFromFile(file);
    };

    const stopCamera = useCallback(() => {
        cameraRequestIdRef.current += 1;
        cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
        setCameraStream(null);
        setIsCameraStarting(false);
        setIsCameraReady(false);
    }, []);

    const startCamera = async () => {
        setCameraError(null);
        setIsCameraReady(false);
        cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
        setCameraStream(null);

        const requestId = ++cameraRequestIdRef.current;
        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError("No camera detected or camera access is unavailable in this browser. Use Choose File to select an image.");
            return;
        }

        setIsCameraStarting(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: { ideal: "environment" } }
            });

            if (requestId !== cameraRequestIdRef.current || !open) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            cameraStreamRef.current = stream;
            setCameraStream(stream);
        } catch (error) {
            if (requestId === cameraRequestIdRef.current) {
                setCameraError(getProductionCameraErrorMessage(error));
            }
        } finally {
            if (requestId === cameraRequestIdRef.current) {
                setIsCameraStarting(false);
            }
        }
    };

    const captureCameraPhoto = () => {
        const video = cameraVideoRef.current;
        if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
            setCameraError("The camera preview is not ready yet. Wait a moment and try again.");
            return;
        }
        const captureRequestId = cameraRequestIdRef.current;

        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 2560 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const context = canvas.getContext("2d");
        if (!context) {
            setCameraError("Could not capture the camera image. Please try again or use Choose File.");
            return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (captureRequestId !== cameraRequestIdRef.current) return;
            if (!blob) {
                setCameraError("Could not capture the camera image. Please try again or use Choose File.");
                return;
            }

            const file = new File([blob], `shift-evidence-${Date.now()}.jpg`, {
                type: "image/jpeg",
                lastModified: Date.now()
            });
            setCameraError(null);
            if (setEvidenceImageFromFile(file)) stopCamera();
        }, "image/jpeg", 0.82);
    };

    const openFilePicker = () => {
        setCameraError(null);
        stopCamera();
        fileInputRef.current?.click();
    };

    const removeEvidenceImage = () => {
        setCameraError(null);
        stopCamera();
        setEvidenceImage(null);
        setEvidenceImageError(null);
    };

    useEffect(() => {
        if (open) return;
        setCameraError(null);
        stopCamera();
    }, [open, stopCamera]);

    useEffect(() => {
        return () => {
            cameraRequestIdRef.current += 1;
            cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
            cameraStreamRef.current = null;
        };
    }, []);

    useEffect(() => {
        const video = cameraVideoRef.current;
        if (!cameraStream || !video) return;

        video.srcObject = cameraStream;
        void video.play().catch(() => {
            if (cameraStreamRef.current === cameraStream) {
                setCameraError("The camera opened, but its preview could not start. Check browser permissions or use Choose File.");
            }
        });

        return () => {
            if (video.srcObject === cameraStream) video.srcObject = null;
        };
    }, [cameraStream]);

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
            setShiftMaterials((previous) => preserveExistingActualQuantities(
                applyConsumptionDefaults(
                    reservationRows,
                    targetQuantity,
                    sumProductionOutputQuantities(
                        outputQuantitiesRef.current.good,
                        outputQuantitiesRef.current.rejected,
                        outputQuantitiesRef.current.scrap
                    )
                ),
                previous,
                manuallyEditedMaterialKeysRef.current
            ));
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
            setCameraError(null);
            stopCamera();
            outputQuantitiesRef.current = { good: "", rejected: "0", scrap: "0" };
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
            manuallyEditedMaterialKeysRef.current.clear();
            setMaterialsLoadError(null);
            setProductionDay("1");
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
    }, [open, selectedJobOrder, getAvailableShifts, loadShiftMaterials, stopCamera]);

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
        if (field === "scrap") setScrapQty(value);

        setShiftMaterials((previous) => {
            const recalculated = applyConsumptionDefaults(
                previous,
                targetQuantity,
                sumProductionOutputQuantities(nextQuantities.good, nextQuantities.rejected, nextQuantities.scrap)
            );
            return preserveExistingActualQuantities(recalculated, previous, manuallyEditedMaterialKeysRef.current);
        });
    };

    const totalOutputQuantity = (Number(shiftYieldQty) || 0)
        + (Number(rejectedQty) || 0)
        + (Number(scrapQty) || 0);

    const validateShiftLog = () => {
        if (submittingShiftLog) return false;
        if (!hasCompletedJobOrderTimer) {
            toast.error("Start and stop at least one operator timer before recording the production session.");
            return false;
        }

        if (!evidenceImage || evidenceImageError) {
            toast.error("A valid shift evidence image is required.");
            return false;
        }

        const newYield = Number(shiftYieldQty) || 0;
        const newRejected = Number(rejectedQty) || 0;
        const newScrap = Number(scrapQty) || 0;
        if (newYield + newRejected + newScrap <= 0) {
            toast.error("Record at least one good, rejected, or scrap unit.");
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
        if (hasTheoreticalShortage) {
            setInsufficiencyError("The theoretical material requirement exceeds the remaining WIP reservation. Add raw materials before recording this production session.");
            setIsInsufficiencyOpen(true);
            return false;
        }
        if (hasInsufficiency) {
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
        const consumedByMaterial = new Map<number, number>();
        shiftMaterials.forEach((material) => {
            const materialId = Number(material.jo_material_id || 0);
            consumedByMaterial.set(materialId, (consumedByMaterial.get(materialId) || 0) + Number(material.actual_qty || 0));
        });
        if (hasMissingMaterialConsumption || shiftMaterials.some((material) => (consumedByMaterial.get(Number(material.jo_material_id || 0)) || 0) <= 0)) {
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

    const handleConfirmShiftLog = async (completeProductionAfterLog = false) => {
        if (!validateShiftLog()) {
            setIsConfirmationOpen(false);
            return;
        }

        const newYield = Number(shiftYieldQty) || 0;
        const newRejected = Number(rejectedQty) || 0;
        const newScrap = Number(scrapQty) || 0;
        const evidenceImageToSubmit = evidenceImage;
        if (!evidenceImageToSubmit || evidenceImageError) {
            setIsConfirmationOpen(false);
            return;
        }

        setSubmittingShiftLog(true);
        try {
            const fullShiftName = `Day ${productionDay} - ${shiftName}`;
            
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
                scrapQty: newScrap,
                rejectionReasonId: selectedReasonId ? Number(selectedReasonId) : null,
                rejectionRemarks: rejectionRemarks || undefined,
                varianceReason: varianceReason || undefined,
                approveVariance,
                completeProductionAfterLog,
                qaParameters: [],
                remarks: remarks || undefined,
                evidenceImage: evidenceImageToSubmit,
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
                const targetQty = targetQuantity;
                const producedBefore = Number(selectedJobOrder.producedQty
                    ?? selectedJobOrder.completed_quantity
                    ?? selectedJobOrder.productionOutputQuantity
                    ?? 0);
                const producedAfter = producedBefore + newYield;
                const reachedTarget = hasReachedProductionTarget(targetQty, producedAfter);

                if (completeProductionAfterLog && res.jobOrderCompletion?.success) {
                    toast.success(`Shift saved. Production completed and ${selectedJobOrder.order_no || selectedJobOrder.jo_id} was sent to QA and reconciliation.`);
                } else if (completeProductionAfterLog) {
                    toast.warning(`Shift saved and output target reached (${formatProductionQuantity(producedAfter)}/${formatProductionQuantity(targetQty)} pcs), but the QA handoff did not complete: ${res.jobOrderCompletion?.error || "Retry Complete & Close JO after resolving the blockers."}`);
                } else if (reachedTarget) {
                    toast.success(`Shift saved for ${fullShiftName}. Good-output target reached (${formatProductionQuantity(producedAfter)}/${formatProductionQuantity(targetQty)} pcs); finalize the Job Order for QA.`);
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
                const theoretical = materialTheoretical(m);
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
                        <div><strong>Good Yield:</strong> ${formatProductionQuantity(Number(shiftYieldQty))} pcs • <strong>Scrap:</strong> ${formatProductionQuantity(Number(scrapQty))} pcs</div>
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

    const materialConsumptionDefaults = React.useMemo(
        () => calculateMaterialConsumptionDefaults(shiftMaterials, targetQuantity, totalOutputQuantity),
        [shiftMaterials, targetQuantity, totalOutputQuantity]
    );
    const materialTheoretical = (material: ProductionMaterialReservation) => {
        const index = shiftMaterials.indexOf(material);
        return index >= 0 ? materialConsumptionDefaults[index]?.theoreticalQuantity || 0 : 0;
    };

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
            preferredLot: {
                mmLotId: material.mm_lot_id,
                inventoryLotId: material.inventory_lot_id,
                batchNo: material.inventory_lot_batch_no || material.batch_no
            },
            isSubAssembly: Boolean(material.is_sub_assembly)
        });
        setIsTopUpOpen(true);
    };

    const hasInsufficiency = shiftMaterials.some((m) => Boolean(m.reservation_id) && exceedsAvailableStock(m.actual_qty, m.available_stock));
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
    const hasVarianceException = !hasTheoreticalShortage && varianceExceptions.length > 0;
    const missingVarianceApproval = hasVarianceException && (!varianceReason.trim() || !approveVariance);
    const isSubmitDisabled = submittingShiftLog
        || loadingShiftMaterials
        || Boolean(materialsLoadError)
        || hasInsufficiency
        || hasTheoreticalShortage
        || hasIncompleteMaterialLine
        || hasMissingMaterialConsumption
        || missingVarianceApproval
        || !evidenceImage
        || Boolean(evidenceImageError)
        || !hasOutput
        || !hasCompletedJobOrderTimer
        || !sessionKey
        || !productionDate
        || !shiftName.trim();
    const isPrintDisabled = loadingShiftMaterials || Boolean(materialsLoadError) || hasInsufficiency || !hasOutput || !shiftName.trim();
    const goodOutputBeforeShift = Number(selectedJobOrder.producedQty
        ?? selectedJobOrder.completed_quantity
        ?? selectedJobOrder.productionOutputQuantity
        ?? 0);
    const projectedGoodOutput = goodOutputBeforeShift + (Number(shiftYieldQty) || 0);
    const finalShiftReachesTarget = hasReachedProductionTarget(targetQuantity, projectedGoodOutput);
    const hasActiveJobOrderTimer = allJobOperators.some((operator) => Boolean(operator.started_at) && !operator.stopped_at);
    const allRoutesReadyForCompletion = !hasActiveJobOrderTimer
        && sortedTasks.length > 0
        && sortedTasks.every((task) => ["completed", "done", "closed"].includes(String(task.status || "").trim().toLowerCase()));

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
                        <div className="grid grid-cols-1 items-start lg:grid-cols-12 gap-4 sm:gap-6 flex-1 overflow-y-auto pr-1 min-h-0">
                            {/* Left Column: Yield, Scrap, Batch Metadata, Operators */}
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
                                                     onChange={(e) => handleOutputQuantityChange("rejected", e.target.value)}
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
                                                    onChange={(e) => handleOutputQuantityChange("scrap", e.target.value)}
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
                                                    Shift Evidence Image <span className="text-destructive">*</span>
                                                </h5>
                                            </div>
                                            <Badge variant="outline" className="text-[9px] text-sky-700 dark:text-sky-300 border-sky-500/20">
                                                Required
                                            </Badge>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">
                                            Take Photo opens the device camera. If no camera is detected or access is unavailable, use Choose File to select a saved PNG, JPG, or WEBP image. Maximum file size: 5 MB.
                                        </p>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => void startCamera()}
                                                disabled={isCameraStarting || Boolean(cameraStream)}
                                                className="h-10 w-full rounded-lg border-sky-500/30 text-xs font-semibold"
                                                aria-label="Take a shift evidence photo"
                                            >
                                                <Camera className="mr-2 h-4 w-4" /> {isCameraStarting ? "Opening Camera…" : "Take Photo"}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={openFilePicker}
                                                className="h-10 w-full rounded-lg border-sky-500/30 text-xs font-semibold"
                                                aria-label="Choose a shift evidence image file"
                                            >
                                                <FolderOpen className="mr-2 h-4 w-4" /> Choose File
                                            </Button>
                                            <Input
                                                ref={fileInputRef}
                                                id="production-evidence-image"
                                                type="file"
                                                accept="image/jpeg,image/jpg,image/png,image/webp"
                                                onChange={handleEvidenceImageChange}
                                                aria-label="Choose a shift evidence image file"
                                                className="sr-only"
                                            />
                                            {cameraStream && (
                                                <div className="space-y-2 rounded-lg border border-sky-500/20 bg-background/70 p-2 sm:col-span-2">
                                                    <video
                                                        ref={cameraVideoRef}
                                                        autoPlay
                                                        muted
                                                        playsInline
                                                        onCanPlay={() => setIsCameraReady(true)}
                                                        aria-label="Live shift evidence camera preview"
                                                        className="max-h-72 w-full rounded-md bg-black object-contain"
                                                    />
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <Button
                                                            type="button"
                                                            onClick={captureCameraPhoto}
                                                            disabled={!isCameraReady}
                                                            className="h-9 text-xs"
                                                        >
                                                            <Camera className="mr-2 h-4 w-4" /> Capture Photo
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={() => {
                                                                stopCamera();
                                                                setCameraError(null);
                                                            }}
                                                            className="h-9 text-xs"
                                                        >
                                                            Cancel Camera
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                            {evidenceImage && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={removeEvidenceImage}
                                                    className="h-10 rounded-lg border-sky-500/30 text-xs sm:col-span-2"
                                                >
                                                    <X className="h-3.5 w-3.5 mr-1" /> Remove
                                                </Button>
                                            )}
                                        </div>
                                        {cameraError && (
                                            <p className="text-[10px] font-semibold text-destructive" role="alert">{cameraError}</p>
                                        )}
                                        {evidenceImageError && (
                                            <p className="text-[10px] font-semibold text-destructive" role="alert">{evidenceImageError}</p>
                                        )}
                                        {!evidenceImage && !evidenceImageError && !cameraError && (
                                            <p className="text-[10px] text-muted-foreground" role="status">
                                                A shift evidence image is required before recording this session.
                                            </p>
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
                                                 <p className="text-[9px] text-muted-foreground mt-0.5">Select the reserved lot, inventory lot, batch, and UOM that were consumed for this session.</p>
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
                                                 const actual = Number(m.actual_qty || 0);
                                                 const variance = actual - theoretical;
                                                 const isExceeded = Math.abs(variance) > Math.max(0.000001, Math.abs(theoretical) * varianceTolerancePct / 100);
                                                 const isInsufficient = exceedsAvailableStock(actual, m.available_stock);
                                                const availableStock = roundToInputStep(m.available_stock);
                                                const shortfall = Math.max(0, theoretical - availableStock);
                                                const hasTheoreticalShortfall = exceedsAvailableStock(theoretical, availableStock);
                                                 const percentage = Math.min(200, theoretical > 0 ? (actual / theoretical) * 100 : 0);
                                                const barColor = isInsufficient || hasTheoreticalShortfall
                                                    ? "bg-red-500" 
                                                    : isExceeded 
                                                    ? "bg-amber-500" 
                                                    : "bg-emerald-500";
                                                const needsTopUp = !m.reservation_id || hasTheoreticalShortfall;

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
                                                                        isInsufficient || hasTheoreticalShortfall
                                                                            ? "bg-red-500/10 text-red-600 border-red-500/20"
                                                                            : isExceeded
                                                                            ? "bg-amber-500/10 text-amber-600 border-amber-500/20" 
                                                                            : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                                                    }`}
                                                                >
                                                                     {!m.reservation_id ? "Unavailable" : isInsufficient || hasTheoreticalShortfall ? "Shortfall" : isExceeded ? "Outside tolerance" : "Normal"}
                                                                 </Badge>
                                                             </div>
                                                         </div>

                                                         <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
                                                             <span>MM Lot: <strong className="font-mono text-foreground">{m.mm_lot_name || "Lot name unavailable"}</strong></span>
                                                             <span>Inventory Lot: <strong className="font-mono text-foreground">{m.inventory_lot_batch_no || m.batch_no || "Batch identifier unavailable"}</strong></span>
                                                             {m.batch_no && m.batch_no !== (m.inventory_lot_batch_no || m.batch_no) && (
                                                                 <span>Batch No.: <strong className="font-mono text-foreground">{m.batch_no}</strong></span>
                                                             )}
                                                             <span>UOM: <strong className="font-mono text-foreground">{m.unit_shortcut || `#${m.uom_id || "—"}`}</strong></span>
                                                             <span>Status: <strong className="text-foreground">{m.reservation_status || "Not staged"}</strong></span>
                                                             <span>Remaining WIP: <strong className="font-mono text-foreground">{formatExactMaterialQuantity(Number(m.available_stock || 0))}</strong></span>
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
                                                                     <span className="text-muted-foreground">Remaining WIP:</span>
                                                                    <span className={`font-mono font-bold ${isInsufficient ? "text-red-500" : "text-foreground/85"}`}>
                                                                         {formatExactMaterialQuantity(Number(m.available_stock || 0))} {m.unit_shortcut}
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
                                                                    <div className="flex items-center gap-1.5">
                                                                        <Input
                                                                             id={`actual-material-used-${m.jo_material_id}-${index}`}
                                                                             type="number"
                                                                             min="0"
                                                                             step="0.000001"
                                                                             max={m.reservation_id ? availableStock : undefined}
                                                                             value={m.actual_qty}
                                                                            onChange={(e) => {
                                                                                const raw = e.target.value;
                                                                                manuallyEditedMaterialKeysRef.current.add(materialConsumptionReservationKey(m));
                                                                                if (raw === "") {
                                                                                    setShiftMaterials((prev) =>
                                                                                        prev.map((item, idx) => idx === materialIndex ? { ...item, actual_qty: "" } : item)
                                                                                    );
                                                                                    return;
                                                                                }
                                                                                const parsed = Number(raw);
                                                                                if (!Number.isFinite(parsed)) return;
                                                                                const clamped = Math.min(Math.max(0, parsed), availableStock);
                                                                                setShiftMaterials((prev) =>
                                                                                    prev.map((item, idx) => idx === materialIndex ? { ...item, actual_qty: String(clamped) } : item)
                                                                                );
                                                                             }}
                                                                             onBlur={(e) => {
                                                                                const parsed = Number(e.target.value);
                                                                                 if (e.target.value === "" || !Number.isFinite(parsed)) return;
                                                                                 const clamped = Math.min(Math.max(0, parsed), availableStock);
                                                                                 setShiftMaterials((prev) =>
                                                                                     prev.map((item, idx) => idx === materialIndex ? { ...item, actual_qty: String(clamped) } : item)
                                                                                 );
                                                                             }}
                                                                             disabled={!m.reservation_id}
                                                                             className="h-8 w-36 text-right bg-background px-2 py-1.5 rounded-lg font-bold font-mono text-xs disabled:opacity-50"
                                                                         />
                                                                        <span className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-1 text-[9px] font-semibold text-muted-foreground">
                                                                            {m.unit_shortcut}
                                                                        </span>
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
                    </form>
                </DialogContent>
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
                            <p className="font-semibold">{formatProductionQuantity(Number(shiftYieldQty) || 0)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Rejected Units</p>
                            <p className="font-semibold">{formatProductionQuantity(Number(rejectedQty) || 0)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Scrap Units</p>
                            <p className="font-semibold">{formatProductionQuantity(Number(scrapQty) || 0)}</p>
                        </div>
                        <div className="col-span-2 rounded-md border border-border/60 bg-background/70 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Projected Good Output / Target</p>
                            <p className="font-semibold">
                                {formatProductionQuantity(projectedGoodOutput)} / {formatProductionQuantity(targetQuantity)} pcs
                            </p>
                        </div>
                    </div>
                    {finalShiftReachesTarget && (
                        <p className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                            This shift reaches the good-output target. Completing the Job Order sends production to QA and locks new floor activity.
                            {!allRoutesReadyForCompletion && (hasActiveJobOrderTimer
                                ? " Stop active timers and complete every route step before finalizing."
                                : " Complete every route step before finalizing.")}
                        </p>
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
                                    title={!allRoutesReadyForCompletion ? "Complete every route step before finalizing production." : undefined}
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
                                    const shortMaterial =
                                        shiftMaterials.find((m) => exceedsAvailableStock(m.actual_qty, m.available_stock))
                                        || shiftMaterials.find((m) => exceedsAvailableStock(materialTheoretical(m), m.available_stock))
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
