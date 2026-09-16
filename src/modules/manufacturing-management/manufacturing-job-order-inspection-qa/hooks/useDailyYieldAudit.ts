import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    fetchQALogs,
    postDailyQAInspection,
    type DailyQAInspectionRequest,
} from "../../manufacturing-qa/services/qa-api";
import { fetchEligibleFinishedGoodsLots } from "../../shared/finished-goods-lots-api";
import type { EligibleFinishedGoodsLot } from "../../shared/finished-goods-lots-api";
import type {
    DailyYieldQALog,
    DailyYieldQATemplate,
    DailyYieldQAParameter,
    JobOrderDailyYieldDetails,
    JobOrderDailyYieldRoute,
    JobOrderDailyYieldRecord,
} from "../types";

interface UseDailyYieldAuditOptions {
    onSaved?: () => Promise<void> | void;
}

const EMPTY_ROUTES: JobOrderDailyYieldRoute[] = [];

function routeId(value: unknown): number {
    const candidate = Number(value ?? 0);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 0;
}

export function useDailyYieldAudit({ onSaved }: UseDailyYieldAuditOptions = {}) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedYield, setSelectedYield] = useState<JobOrderDailyYieldRecord | null>(null);
    const [selectedDetails, setSelectedDetails] = useState<JobOrderDailyYieldDetails | null>(null);
    const [qaTemplates, setQaTemplates] = useState<DailyYieldQATemplate[]>([]);
    const [qaLogs, setQaLogs] = useState<DailyYieldQALog[]>([]);
    const [referenceError, setReferenceError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [moisturePct, setMoisturePct] = useState("");
    const [acidityPh, setAcidityPh] = useState("");
    const [sensoryStatus, setSensoryStatus] = useState<"Passed" | "Failed">("Passed");
    const [weightCheckPassed, setWeightCheckPassed] = useState(true);
    const [dailyLabStatus, setDailyLabStatus] = useState<"Pending" | "Passed" | "Failed">("Passed");
    const [dailyActionTaken, setDailyActionTaken] = useState<"Released" | "Quarantined" | "Scrapped">("Released");
    const [dailyRemarks, setDailyRemarks] = useState("");
    const [dailyOutputBatchNo, setDailyOutputBatchNo] = useState("");
    const [dailyOutputMmLotId, setDailyOutputMmLotId] = useState("");
    const [dailyOutputManufacturingDate, setDailyOutputManufacturingDate] = useState("");
    const [dailyOutputExpiryDate, setDailyOutputExpiryDate] = useState("");
    const [dailyOutputEligibleLots, setDailyOutputEligibleLots] = useState<EligibleFinishedGoodsLot[]>([]);
    const [dailyOutputLotsLoading, setDailyOutputLotsLoading] = useState(false);
    const [dailyOutputLotsError, setDailyOutputLotsError] = useState<string | null>(null);
    const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
    const [qaParamValues, setQaParamValues] = useState<Record<number, string>>({});
    const lotRequestId = useRef(0);

    useEffect(() => {
        let disposed = false;
        const loadReferences = async () => {
            try {
                const [templatesResponse, logs] = await Promise.all([
                    fetch("/api/manufacturing/qa?action=templates", { cache: "no-store" }),
                    fetchQALogs()
                ]);
                if (!templatesResponse.ok) throw new Error("Failed to load QA templates.");
                const templatePayload: unknown = await templatesResponse.json();
                const templates = Array.isArray(templatePayload)
                    ? templatePayload as DailyYieldQATemplate[]
                    : [];
                if (!disposed) {
                    setQaTemplates(templates);
                    setQaLogs(logs);
                    setReferenceError(null);
                }
            } catch (error) {
                if (!disposed) {
                    setReferenceError(error instanceof Error ? error.message : "Failed to load QA reference data.");
                }
            }
        };

        void loadReferences();
        return () => {
            disposed = true;
        };
    }, []);

    const routes = selectedDetails?.routes ?? EMPTY_ROUTES;

    const activeTemplate = useMemo(() => {
        if (!selectedRouteId) return null;
        const route = routes.find((item) => routeId(item.id) === selectedRouteId);
        if (!route?.qaTemplateId) return null;
        return qaTemplates.find((template) =>
            routeId(template.template_id ?? template.id) === routeId(route.qaTemplateId)
        ) || null;
    }, [qaTemplates, routes, selectedRouteId]);

    const activeParameters = useMemo(
        () => Array.isArray(activeTemplate?.parameters) ? activeTemplate.parameters : [],
        [activeTemplate]
    );

    const hasFailedParam = useMemo(() => activeParameters.some((parameter: DailyYieldQAParameter) => {
        const value = qaParamValues[parameter.parameter_id];
        if (!value) return false;
        if (parameter.test_type === "Numeric") {
            const numeric = Number(value);
            return Number.isFinite(numeric)
                && ((parameter.min_value !== null && numeric < Number(parameter.min_value))
                    || (parameter.max_value !== null && numeric > Number(parameter.max_value)));
        }
        if (["Boolean", "Pass/Fail", "Yes/No"].includes(parameter.test_type || "")) {
            return ["Fail", "false", "No"].includes(value);
        }
        return false;
    }), [activeParameters, qaParamValues]);

    const matchingLogs = useMemo(() => {
        if (!selectedYield) return [];
        return qaLogs.filter((log) => {
            const task = log.task_id;
            if (!task || typeof task !== "object") return false;

            const logJoId = String(task.jo_id || "").toLowerCase();
            const joId = String(selectedYield.jobOrderId || "").toLowerCase();
            const joNo = String(selectedDetails?.jobOrderNo || "").toLowerCase();
            const matchesJobOrder = (joNo && logJoId.includes(joNo))
                || (joId && logJoId.includes(joId))
                || (logJoId && (joNo.includes(logJoId) || joId.includes(logJoId)));

            const comments = String(log.comments || "").toLowerCase();
            const shift = String(selectedYield.shiftName || "").toLowerCase();
            const matchesShift = Boolean(shift) && (
                comments.includes(shift)
                || shift.split(" ").some((word) => word.length > 2 && comments.includes(word))
            );
            const matchesRoute = selectedRouteId
                ? routeId(task.jo_route_id || task.id || log.jo_route_id) === selectedRouteId
                : true;

            return Boolean(matchesJobOrder && matchesShift && matchesRoute);
        });
    }, [qaLogs, selectedDetails?.jobOrderNo, selectedRouteId, selectedYield]);

    const loadOutputLots = useCallback(async (details: JobOrderDailyYieldDetails, yieldRecord: JobOrderDailyYieldRecord) => {
        const requestId = lotRequestId.current + 1;
        lotRequestId.current = requestId;
        setDailyOutputLotsLoading(true);
        setDailyOutputLotsError(null);
        setDailyOutputEligibleLots([]);

        if (!details.branchId || !details.productId) {
            setDailyOutputLotsLoading(false);
            setDailyOutputLotsError("The Job Order branch or finished-good product is unavailable.");
            return;
        }

        try {
            const response = await fetchEligibleFinishedGoodsLots(details.branchId, details.productId);
            if (lotRequestId.current !== requestId) return;
            setDailyOutputEligibleLots(response.lots);
            if (yieldRecord.mmLotId && response.lots.some((lot) => lot.lotId === yieldRecord.mmLotId)) {
                setDailyOutputMmLotId(String(yieldRecord.mmLotId));
            } else if (yieldRecord.mmLotId) {
                setDailyOutputMmLotId("");
                setDailyOutputLotsError("The previously assigned storage lot is no longer active or eligible for this finished good.");
            } else if (response.lots.length === 0) {
                setDailyOutputLotsError("No active finished-goods storage lots are available for this Job Order branch and product.");
            }
        } catch (error) {
            if (lotRequestId.current === requestId) {
                setDailyOutputLotsError(error instanceof Error ? error.message : "Failed to load eligible storage lots.");
            }
        } finally {
            if (lotRequestId.current === requestId) setDailyOutputLotsLoading(false);
        }
    }, []);

    const openAudit = useCallback((
        yieldRecord: JobOrderDailyYieldRecord,
        details: JobOrderDailyYieldDetails,
        preferredRouteId?: number | null
    ) => {
        const sortedRoutes = [...details.routes].sort((left, right) => left.sequenceOrder - right.sequenceOrder);
        const pendingRoutes = sortedRoutes.filter((route) => !yieldRecord.audits.some((audit) => routeId(audit.jo_route_id) === route.id));
        const preferredRoute = preferredRouteId
            ? pendingRoutes.find((route) => route.id === preferredRouteId)
            : null;

        setSelectedYield(yieldRecord);
        setSelectedDetails(details);
        setMoisturePct("");
        setAcidityPh("");
        setSensoryStatus("Passed");
        setWeightCheckPassed(true);
        setDailyLabStatus("Passed");
        setDailyActionTaken("Released");
        setDailyRemarks("");
        setDailyOutputBatchNo(yieldRecord.batchNo || "");
        setDailyOutputMmLotId("");
        setDailyOutputManufacturingDate(yieldRecord.manufacturingDate || "");
        setDailyOutputExpiryDate(yieldRecord.expiryDate || "");
        setDailyOutputEligibleLots([]);
        setDailyOutputLotsError(null);
        setQaParamValues({});
        setSelectedRouteId(preferredRoute?.id || pendingRoutes[0]?.id || sortedRoutes[0]?.id || null);
        setIsOpen(true);
        void loadOutputLots(details, yieldRecord);
    }, [loadOutputLots]);

    const closeAudit = useCallback(() => {
        if (actionLoading) return;
        setIsOpen(false);
    }, [actionLoading]);

    const submitAudit = useCallback(async () => {
        if (!selectedYield || !selectedDetails) return;

        const jobOrderId = selectedDetails.jobOrderId;
        const ledgerId = selectedYield.ledgerId;
        const goodOutputQuantity = selectedYield.goodQuantity;
        if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0 || !Number.isSafeInteger(ledgerId) || ledgerId <= 0) {
            toast.error("This yield record is missing a valid Job Order or ledger reference.");
            return;
        }

        let outputMetadata: DailyQAInspectionRequest["outputMetadata"] = null;
        if (goodOutputQuantity > 0) {
            if (dailyOutputLotsLoading) {
                toast.error("Wait for the eligible finished-goods storage lots to finish loading.");
                return;
            }
            if (dailyOutputLotsError) {
                toast.error("Resolve the eligible finished-goods storage-lot lookup before saving this audit.");
                return;
            }
            if (!dailyOutputMmLotId) {
                toast.error("Select the finished-goods storage lot for this output.");
                return;
            }
            if (!dailyOutputEligibleLots.some((lot) => String(lot.lotId) === dailyOutputMmLotId)) {
                toast.error("The selected finished-goods storage lot is no longer eligible. Refresh the lot list and try again.");
                return;
            }
            if (!dailyOutputBatchNo.trim()) {
                toast.error("Enter the output batch or lot number.");
                return;
            }
            if (dailyOutputBatchNo.trim().length > 100) {
                toast.error("The output batch or lot number cannot exceed 100 characters.");
                return;
            }
            if (!dailyOutputManufacturingDate || !dailyOutputExpiryDate) {
                toast.error("Enter both the manufacturing date and expiry date for the finished-goods output.");
                return;
            }
            if (dailyOutputExpiryDate < dailyOutputManufacturingDate) {
                toast.error("The expiry date cannot be earlier than the manufacturing date.");
                return;
            }
            outputMetadata = {
                mmLotId: Number(dailyOutputMmLotId),
                batchNo: dailyOutputBatchNo.trim(),
                manufacturingDate: dailyOutputManufacturingDate,
                expiryDate: dailyOutputExpiryDate
            };
        }

        const auditRoutes: Array<JobOrderDailyYieldRoute | null> = routes.length > 0 ? routes : [null];
        const inspections = auditRoutes.map((route) => {
            const template = route?.qaTemplateId
                ? qaTemplates.find((item) => routeId(item.template_id ?? item.id) === routeId(route.qaTemplateId))
                : null;
            const parameters = Array.isArray(template?.parameters) ? template.parameters : [];
            const qaParameters = parameters.map((parameter: DailyYieldQAParameter) => {
                const value = qaParamValues[parameter.parameter_id] || "";
                let failed = false;
                if (parameter.test_type === "Numeric" && value) {
                    const numeric = Number(value);
                    failed = Number.isFinite(numeric)
                        && ((parameter.min_value !== null && numeric < Number(parameter.min_value))
                            || (parameter.max_value !== null && numeric > Number(parameter.max_value)));
                } else if (["Boolean", "Pass/Fail", "Yes/No"].includes(parameter.test_type || "")) {
                    failed = ["Fail", "false", "No"].includes(value);
                }
                return {
                    parameter_id: parameter.parameter_id,
                    test_name: parameter.test_name ?? undefined,
                    value,
                    is_failed: failed,
                    remarks: failed ? "Out of specification range" : "In specification"
                };
            });

            let resolvedMoisture = "";
            let resolvedAcidity = "";
            parameters.forEach((parameter: DailyYieldQAParameter) => {
                const value = qaParamValues[parameter.parameter_id];
                if (!value) return;
                const name = String(parameter.test_name || "").toLowerCase();
                if (name.includes("moisture")) resolvedMoisture = value;
                if (name.includes("ph") || name.includes("acidity")) resolvedAcidity = value;
            });

            const failed = qaParameters.some((parameter) => parameter.is_failed);
            return {
                jobOrderId,
                joRouteId: route?.id ?? null,
                ledgerId,
                inspectorId: 1,
                moisturePercentage: resolvedMoisture || moisturePct,
                acidityPh: resolvedAcidity || acidityPh,
                sensoryStatus: failed ? "Failed" : sensoryStatus,
                weightCheckPassed,
                labStatus: failed ? "Failed" : dailyLabStatus,
                actionTaken: failed ? "Quarantined" : dailyActionTaken,
                remarks: failed ? `[Critical Specs Failed] ${dailyRemarks}` : dailyRemarks,
                qaParameters
            };
        });

        setActionLoading(true);
        try {
            await postDailyQAInspection({ jobOrderId, ledgerId, outputMetadata, inspections });
            toast.success("Daily yield QA audit saved.");
            setIsOpen(false);
            await onSaved?.();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save the daily yield QA audit.");
        } finally {
            setActionLoading(false);
        }
    }, [acidityPh, dailyActionTaken, dailyLabStatus, dailyOutputBatchNo, dailyOutputEligibleLots, dailyOutputExpiryDate, dailyOutputLotsError, dailyOutputLotsLoading, dailyOutputManufacturingDate, dailyOutputMmLotId, dailyRemarks, moisturePct, onSaved, qaParamValues, qaTemplates, routes, selectedDetails, selectedYield, sensoryStatus, weightCheckPassed]);

    return {
        isOpen,
        setIsOpen,
        selectedYield,
        selectedDetails,
        routes,
        matchingLogs,
        referenceError,
        actionLoading,
        moisturePct,
        setMoisturePct,
        acidityPh,
        setAcidityPh,
        sensoryStatus,
        setSensoryStatus,
        weightCheckPassed,
        setWeightCheckPassed,
        dailyLabStatus,
        setDailyLabStatus,
        dailyActionTaken,
        setDailyActionTaken,
        dailyRemarks,
        setDailyRemarks,
        dailyOutputBatchNo,
        setDailyOutputBatchNo,
        dailyOutputMmLotId,
        setDailyOutputMmLotId,
        dailyOutputManufacturingDate,
        setDailyOutputManufacturingDate,
        dailyOutputExpiryDate,
        setDailyOutputExpiryDate,
        dailyOutputEligibleLots,
        dailyOutputLotsLoading,
        dailyOutputLotsError,
        qaTemplates,
        qaParamValues,
        setQaParamValues,
        selectedRouteId,
        setSelectedRouteId,
        activeParameters,
        hasFailedParam,
        openAudit,
        closeAudit,
        submitAudit,
    };
}

export type DailyYieldAuditController = ReturnType<typeof useDailyYieldAudit>;
