import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    fetchQALogs,
    DailyQARequestError,
    postDailyQAInspection,
    registerRejectedOutputAllocation,
    type DailyQAInspectionRequest,
} from "../../manufacturing-qa/services/qa-api";
import { fetchEligibleBadStockLots, fetchEligibleFinishedGoodsLots } from "../../shared/finished-goods-lots-api";
import type { EligibleFinishedGoodsLot } from "../../shared/finished-goods-lots-api";
import { fetchRouteOperators, fetchUsersList } from "../../production-workflow/services/production-api";
import { fetchJobOrderDailyYieldDetails } from "../services/job-order-inspection-qa-api";
import { parseQAOutputQuantity, qaOutputAllocationMatchesLoggedTotal } from "../../manufacturing-qa/qa-output-allocation";
import { expiryDateFromShelfLife } from "../utils/shelf-life-date";
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
    inspectorName?: string;
}

const EMPTY_ROUTES: JobOrderDailyYieldRoute[] = [];

function routeId(value: unknown): number {
    const candidate = Number(value ?? 0);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 0;
}

export function useDailyYieldAudit({ onSaved, inspectorName }: UseDailyYieldAuditOptions = {}) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedYield, setSelectedYield] = useState<JobOrderDailyYieldRecord | null>(null);
    const [selectedDetails, setSelectedDetails] = useState<JobOrderDailyYieldDetails | null>(null);
    const [auditStartedAt, setAuditStartedAt] = useState<string | null>(null);
    const [routeOperatorsByRouteId, setRouteOperatorsByRouteId] = useState<Record<number, string[]>>({});
    const [inspectorNamesById, setInspectorNamesById] = useState<Record<number, string>>({});
    const [qaTemplates, setQaTemplates] = useState<DailyYieldQATemplate[]>([]);
    const [qaLogs, setQaLogs] = useState<DailyYieldQALog[]>([]);
    const [referenceError, setReferenceError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveOutcomeUnclear, setSaveOutcomeUnclear] = useState(false);
    const [moisturePct, setMoisturePct] = useState("");
    const [acidityPh, setAcidityPh] = useState("");
    const [sensoryStatus, setSensoryStatus] = useState<"Passed" | "Failed">("Passed");
    const [weightCheckPassed, setWeightCheckPassed] = useState(true);
    const [dailyLabStatus, setDailyLabStatus] = useState<"Pending" | "Passed" | "Failed">("Passed");
    const [dailyActionTaken, setDailyActionTaken] = useState<"Released" | "Quarantined" | "Scrapped">("Released");
    const [dailyRemarks, setDailyRemarks] = useState("");
    const [dailyAcceptedOutputQuantity, setDailyAcceptedOutputQuantity] = useState("");
    const [dailyRejectedOutputQuantity, setDailyRejectedOutputQuantity] = useState("");
    const [dailyOutputBatchNo, setDailyOutputBatchNo] = useState("");
    const [dailyOutputMmLotId, setDailyOutputMmLotId] = useState("");
    const [dailyOutputManufacturingDate, setDailyOutputManufacturingDate] = useState("");
    const [dailyOutputExpiryDate, setDailyOutputExpiryDate] = useState("");
    const [dailyOutputEligibleLots, setDailyOutputEligibleLots] = useState<EligibleFinishedGoodsLot[]>([]);
    const [dailyOutputLotsLoading, setDailyOutputLotsLoading] = useState(false);
    const [dailyOutputLotsError, setDailyOutputLotsError] = useState<string | null>(null);
    const [dailyRejectedOutputBatchNo, setDailyRejectedOutputBatchNo] = useState("");
    const [dailyRejectedOutputMmLotId, setDailyRejectedOutputMmLotId] = useState("");
    const [dailyRejectedOutputManufacturingDate, setDailyRejectedOutputManufacturingDate] = useState("");
    const [dailyRejectedOutputExpiryDate, setDailyRejectedOutputExpiryDate] = useState("");
    const [dailyRejectedOutputEligibleLots, setDailyRejectedOutputEligibleLots] = useState<EligibleFinishedGoodsLot[]>([]);
    const [dailyRejectedOutputLotsLoading, setDailyRejectedOutputLotsLoading] = useState(false);
    const [dailyRejectedOutputLotsError, setDailyRejectedOutputLotsError] = useState<string | null>(null);
    const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
    const [qaParamValues, setQaParamValues] = useState<Record<number, string>>({});
    const lotRequestId = useRef(0);
    const rejectedLotRequestId = useRef(0);
    const auditSubmitInFlight = useRef(false);

    const updateDailyOutputManufacturingDate = useCallback((manufacturingDate: string) => {
        setDailyOutputManufacturingDate(manufacturingDate);
        if (!manufacturingDate) {
            setDailyOutputExpiryDate("");
            return;
        }
        const expiryDate = expiryDateFromShelfLife(manufacturingDate, selectedDetails?.productShelfLifeDays);
        if (expiryDate) setDailyOutputExpiryDate(expiryDate);
    }, [selectedDetails?.productShelfLifeDays]);

    const updateDailyRejectedOutputManufacturingDate = useCallback((manufacturingDate: string) => {
        setDailyRejectedOutputManufacturingDate(manufacturingDate);
        if (!manufacturingDate) {
            setDailyRejectedOutputExpiryDate("");
            return;
        }
        const expiryDate = expiryDateFromShelfLife(manufacturingDate, selectedDetails?.productShelfLifeDays);
        if (expiryDate) setDailyRejectedOutputExpiryDate(expiryDate);
    }, [selectedDetails?.productShelfLifeDays]);

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

    const loadRejectedOutputLots = useCallback(async (details: JobOrderDailyYieldDetails, yieldRecord: JobOrderDailyYieldRecord) => {
        const requestId = rejectedLotRequestId.current + 1;
        rejectedLotRequestId.current = requestId;
        setDailyRejectedOutputLotsLoading(true);
        setDailyRejectedOutputLotsError(null);
        setDailyRejectedOutputEligibleLots([]);

        if (!details.branchId || !details.productId) {
            setDailyRejectedOutputLotsLoading(false);
            setDailyRejectedOutputLotsError("The Job Order branch or finished-good product is unavailable.");
            return;
        }
        if (yieldRecord.goodQuantity + yieldRecord.rejectedQuantity <= 0) {
            setDailyRejectedOutputLotsLoading(false);
            return;
        }

        try {
            const response = await fetchEligibleBadStockLots(details.branchId, details.productId);
            if (rejectedLotRequestId.current !== requestId) return;
            setDailyRejectedOutputEligibleLots(response.lots);
            if (yieldRecord.rejectedMmLotId && response.lots.some((lot) => lot.lotId === yieldRecord.rejectedMmLotId)) {
                setDailyRejectedOutputMmLotId(String(yieldRecord.rejectedMmLotId));
            } else if (yieldRecord.rejectedMmLotId) {
                setDailyRejectedOutputMmLotId("");
                setDailyRejectedOutputLotsError("The previously assigned bad-stock storage lot is no longer active or eligible.");
            } else if (response.lots.length === 0) {
                setDailyRejectedOutputLotsError("No active bad-stock storage lots are configured for this Job Order branch and product.");
            }
        } catch (error) {
            if (rejectedLotRequestId.current === requestId) {
                setDailyRejectedOutputLotsError(error instanceof Error ? error.message : "Failed to load eligible bad-stock storage lots.");
            }
        } finally {
            if (rejectedLotRequestId.current === requestId) setDailyRejectedOutputLotsLoading(false);
        }
    }, []);

    const loadRouteOperators = useCallback(async (routeIds: number[]) => {
        const entries = await Promise.all(routeIds.map(async (routeIdValue) => {
            try {
                const response = await fetchRouteOperators(routeIdValue);
                const names = [...new Set(
                    (response.data || [])
                        .filter((record) => record.is_active !== false)
                        .map((record) => String(record.user_name || "").trim() || `User #${record.user_id}`)
                        .filter(Boolean)
                )];
                return [routeIdValue, names] as const;
            } catch {
                return [routeIdValue, []] as const;
            }
        }));
        setRouteOperatorsByRouteId(Object.fromEntries(entries));
    }, []);

    const loadInspectorNames = useCallback(async () => {
        try {
            const users = await fetchUsersList();
            const entries = (Array.isArray(users) ? users : [])
                .map((user) => {
                    const record = user as unknown as Record<string, unknown>;
                    const id = Number(record.user_id ?? record.id) || 0;
                    if (!id) return null;
                    const name = [record.user_fname ?? record.first_name, record.user_lname ?? record.last_name]
                        .map((part) => String(part || "").trim())
                        .filter(Boolean)
                        .join(" ");
                    return [id, name || `Inspector #${id}`] as const;
                })
                .filter((entry): entry is readonly [number, string] => entry !== null);
            setInspectorNamesById(Object.fromEntries(entries));
        } catch {
            setInspectorNamesById({});
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
        setSaveError(null);
        setSaveOutcomeUnclear(false);
        setAuditStartedAt(new Date().toISOString());
        setMoisturePct("");
        setAcidityPh("");
        setSensoryStatus("Passed");
        setWeightCheckPassed(true);
        setDailyLabStatus("Passed");
        setDailyActionTaken("Released");
        setDailyRemarks("");
        setDailyAcceptedOutputQuantity(String(yieldRecord.qaAcceptedQuantity ?? yieldRecord.goodQuantity));
        setDailyRejectedOutputQuantity(String(yieldRecord.qaRejectedQuantity ?? yieldRecord.rejectedQuantity));
        setDailyOutputBatchNo(yieldRecord.batchNo || "");
        setDailyOutputMmLotId("");
        const outputManufacturingDate = yieldRecord.manufacturingDate || "";
        setDailyOutputManufacturingDate(outputManufacturingDate);
        setDailyOutputExpiryDate(yieldRecord.expiryDate || (
            outputManufacturingDate
                ? expiryDateFromShelfLife(outputManufacturingDate, details.productShelfLifeDays) || ""
                : ""
        ));
        setDailyOutputEligibleLots([]);
        setDailyOutputLotsError(null);
        setDailyRejectedOutputBatchNo(yieldRecord.rejectedBatchNo || "");
        setDailyRejectedOutputMmLotId("");
        const rejectedOutputManufacturingDate = yieldRecord.rejectedManufacturingDate || outputManufacturingDate;
        setDailyRejectedOutputManufacturingDate(rejectedOutputManufacturingDate);
        setDailyRejectedOutputExpiryDate(yieldRecord.rejectedExpiryDate || (
            rejectedOutputManufacturingDate
                ? expiryDateFromShelfLife(rejectedOutputManufacturingDate, details.productShelfLifeDays) || yieldRecord.expiryDate || ""
                : yieldRecord.expiryDate || ""
        ));
        setDailyRejectedOutputEligibleLots([]);
        setDailyRejectedOutputLotsError(null);
        setQaParamValues({});
        setSelectedRouteId(preferredRoute?.id || pendingRoutes[0]?.id || sortedRoutes[0]?.id || null);
        setIsOpen(true);
        void loadOutputLots(details, yieldRecord);
        void loadRejectedOutputLots(details, yieldRecord);
        void loadRouteOperators(sortedRoutes.map((route) => route.id));
        void loadInspectorNames();
    }, [loadOutputLots, loadRejectedOutputLots, loadRouteOperators, loadInspectorNames]);

    const closeAudit = useCallback(() => {
        if (actionLoading) return;
        setIsOpen(false);
        setSaveError(null);
    }, [actionLoading]);

    const buildRejectedOutputMetadata = useCallback((): DailyQAInspectionRequest["rejectedOutputMetadata"] | false => {
        if (!selectedYield) return false;
        const rejectedQuantity = parseQAOutputQuantity(dailyRejectedOutputQuantity);
        if (rejectedQuantity === null) {
            toast.error("Enter a valid nonnegative rejected quantity with no more than six decimal places.");
            return false;
        }
        if (rejectedQuantity <= 0) return null;
        if (dailyRejectedOutputLotsLoading) {
            toast.error("Wait for the eligible bad-stock storage lots to finish loading.");
            return false;
        }
        if (dailyRejectedOutputLotsError) {
            toast.error("Resolve the bad-stock storage-lot lookup before registering rejected output.");
            return false;
        }
        if (!dailyRejectedOutputMmLotId) {
            toast.error("Select the bad-stock storage lot for rejected output.");
            return false;
        }
        if (!dailyRejectedOutputEligibleLots.some((lot) => String(lot.lotId) === dailyRejectedOutputMmLotId)) {
            toast.error("The selected bad-stock storage lot is no longer eligible. Refresh the lot list and try again.");
            return false;
        }
        if (!dailyRejectedOutputBatchNo.trim()) {
            toast.error("Enter the rejected output batch or lot number.");
            return false;
        }
        if (dailyRejectedOutputBatchNo.trim().length > 100) {
            toast.error("The rejected output batch or lot number cannot exceed 100 characters.");
            return false;
        }
        if (!dailyRejectedOutputManufacturingDate || !dailyRejectedOutputExpiryDate) {
            toast.error("Enter both the manufacturing date and expiry date for rejected output.");
            return false;
        }
        if (dailyRejectedOutputExpiryDate < dailyRejectedOutputManufacturingDate) {
            toast.error("The rejected output expiry date cannot be earlier than its manufacturing date.");
            return false;
        }
        return {
            mmLotId: Number(dailyRejectedOutputMmLotId),
            batchNo: dailyRejectedOutputBatchNo.trim(),
            manufacturingDate: dailyRejectedOutputManufacturingDate,
            expiryDate: dailyRejectedOutputExpiryDate
        };
    }, [dailyRejectedOutputBatchNo, dailyRejectedOutputEligibleLots, dailyRejectedOutputExpiryDate, dailyRejectedOutputLotsError, dailyRejectedOutputLotsLoading, dailyRejectedOutputManufacturingDate, dailyRejectedOutputMmLotId, dailyRejectedOutputQuantity, selectedYield]);

    const registerRejectedOutput = useCallback(async () => {
        if (!selectedYield || !selectedDetails) return;
        if (!selectedYield.outcome.isComplete) {
            toast.error("Complete all required QA audit steps before registering rejected output.");
            return;
        }
        if (selectedYield.rejectedMmLotId) return;

        const acceptedQuantity = parseQAOutputQuantity(dailyAcceptedOutputQuantity);
        const rejectedQuantity = parseQAOutputQuantity(dailyRejectedOutputQuantity);
        if (acceptedQuantity === null || rejectedQuantity === null) {
            toast.error("Enter valid nonnegative Good and Bad quantities with no more than six decimal places.");
            return;
        }
        if (!qaOutputAllocationMatchesLoggedTotal(
            { acceptedQuantity, rejectedQuantity },
            selectedYield.goodQuantity,
            selectedYield.rejectedQuantity
        )) {
            toast.error("The Good and Bad quantities must add up to the total output recorded by the operator.");
            return;
        }
        if (rejectedQuantity <= 0) {
            toast.error("The rejected quantity must be greater than zero to register rejected output.");
            return;
        }

        const jobOrderId = selectedDetails.jobOrderId;
        const ledgerId = selectedYield.ledgerId;
        const rejectedOutputMetadata = buildRejectedOutputMetadata();
        if (!rejectedOutputMetadata) return;

        setActionLoading(true);
        try {
            await registerRejectedOutputAllocation({
                jobOrderId,
                ledgerId,
                acceptedQuantity,
                rejectedQuantity,
                rejectedOutputMetadata
            });
            toast.success("Rejected output was registered in the configured bad-stock branch.");
            setIsOpen(false);
            await onSaved?.();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to register rejected output.");
        } finally {
            setActionLoading(false);
        }
    }, [buildRejectedOutputMetadata, dailyAcceptedOutputQuantity, dailyRejectedOutputQuantity, onSaved, selectedDetails, selectedYield]);

    const submitAudit = useCallback(async () => {
        if (!selectedYield || !selectedDetails || auditSubmitInFlight.current) return;

        const jobOrderId = selectedDetails.jobOrderId;
        const ledgerId = selectedYield.ledgerId;
        const acceptedQuantity = parseQAOutputQuantity(dailyAcceptedOutputQuantity);
        const rejectedQuantity = parseQAOutputQuantity(dailyRejectedOutputQuantity);
        if (acceptedQuantity === null || rejectedQuantity === null) {
            toast.error("Enter valid nonnegative Good and Bad quantities with no more than six decimal places.");
            return;
        }
        if (!qaOutputAllocationMatchesLoggedTotal(
            { acceptedQuantity, rejectedQuantity },
            selectedYield.goodQuantity,
            selectedYield.rejectedQuantity
        )) {
            toast.error("The Good and Bad quantities must add up to the total output recorded by the operator.");
            return;
        }
        const goodOutputQuantity = acceptedQuantity;
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

        const rejectedOutputMetadata = buildRejectedOutputMetadata();
        if (rejectedOutputMetadata === false) return;

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

        const requestPayload: DailyQAInspectionRequest = {
            jobOrderId,
            ledgerId,
            acceptedQuantity,
            rejectedQuantity,
            outputMetadata,
            rejectedOutputMetadata,
            inspections
        };

        auditSubmitInFlight.current = true;
        setActionLoading(true);
        setSaveError(null);
        try {
            await postDailyQAInspection(requestPayload);
            toast.success("Daily yield QA audit saved.");
            setIsOpen(false);
            await onSaved?.();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to save the daily yield QA audit.";
            if (error instanceof DailyQARequestError && error.outcomeUnknown) {
                let refreshedDetails: JobOrderDailyYieldDetails;
                let refreshedYield: JobOrderDailyYieldRecord | undefined;
                try {
                    refreshedDetails = await fetchJobOrderDailyYieldDetails(
                        jobOrderId,
                        AbortSignal.timeout(20_000)
                    );
                    refreshedYield = refreshedDetails.dailyYields.find((item) => item.ledgerId === ledgerId);
                    if (!refreshedYield) throw new Error("The yield record was not found during the status check.");
                } catch (recoveryError) {
                    const recoveryMessage = recoveryError instanceof Error
                        ? recoveryError.message
                        : "The save status could not be confirmed.";
                    setSaveOutcomeUnclear(true);
                    setSaveError(`${message} The latest audit status could not be loaded (${recoveryMessage}). Close and reopen this yield before retrying.`);
                    try {
                        await onSaved?.();
                    } catch (refreshError) {
                        console.error("Failed to refresh the Daily QA queue after a failed status check:", refreshError);
                    }
                    toast.error("The audit save could not be confirmed. Refresh the yield before retrying.");
                    return;
                }

                setSelectedDetails(refreshedDetails);
                setSelectedYield(refreshedYield);

                if (!error.canResume) {
                    const auditedRouteIds = new Set(refreshedYield.audits.map((audit) => routeId(audit.jo_route_id)));
                    const requiredRouteIds = refreshedDetails.routes.map((route) => route.id);
                    const expectedCount = Math.max(1, requiredRouteIds.length);
                    const savedCount = requiredRouteIds.length > 0
                        ? requiredRouteIds.filter((routeIdValue) => auditedRouteIds.has(routeIdValue)).length
                        : refreshedYield.audits.some((audit) => !routeId(audit.jo_route_id)) ? 1 : 0;
                    setSaveOutcomeUnclear(true);
                    setSaveError(`${message} Status refreshed: ${savedCount} of ${expectedCount} route audit(s) are recorded. The original request may still be finishing. Close and reopen this yield before retrying.`);
                    try {
                        await onSaved?.();
                    } catch (refreshError) {
                        console.error("Failed to refresh the Daily QA queue after an uncertain save:", refreshError);
                    }
                    toast.error("The save outcome is still uncertain. Close and reopen this yield before retrying.");
                    return;
                }

                try {
                    await postDailyQAInspection(requestPayload);
                } catch (recoveryError) {
                    const recoveryMessage = recoveryError instanceof Error
                        ? recoveryError.message
                        : "The save could not be completed after checking its status.";
                    setSaveOutcomeUnclear(recoveryError instanceof DailyQARequestError && !recoveryError.canResume);
                    setSaveError(`${message} ${recoveryMessage} The latest audit status was loaded; review the route statuses before retrying.`);
                    toast.error("The audit save could not be confirmed. Review the refreshed route statuses before retrying.");
                    return;
                }

                toast.success("The audit status was checked and the save was completed.");
                setIsOpen(false);
                try {
                    await onSaved?.();
                } catch (refreshError) {
                    console.error("Daily QA was saved, but the queue could not be refreshed:", refreshError);
                }
            } else {
                setSaveError(message);
                toast.error(message);
            }
        } finally {
            auditSubmitInFlight.current = false;
            setActionLoading(false);
        }
    }, [acidityPh, buildRejectedOutputMetadata, dailyAcceptedOutputQuantity, dailyActionTaken, dailyLabStatus, dailyOutputBatchNo, dailyOutputEligibleLots, dailyOutputExpiryDate, dailyOutputLotsError, dailyOutputLotsLoading, dailyOutputManufacturingDate, dailyOutputMmLotId, dailyRejectedOutputQuantity, dailyRemarks, moisturePct, onSaved, qaParamValues, qaTemplates, routes, selectedDetails, selectedYield, sensoryStatus, weightCheckPassed]);

    return {
        isOpen,
        setIsOpen,
        selectedYield,
        selectedDetails,
        inspectorName: inspectorName?.trim() || null,
        auditStartedAt,
        routeOperatorsByRouteId,
        inspectorNamesById,
        routes,
        matchingLogs,
        referenceError,
        actionLoading,
        saveError,
        saveOutcomeUnclear,
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
        dailyAcceptedOutputQuantity,
        setDailyAcceptedOutputQuantity,
        dailyRejectedOutputQuantity,
        setDailyRejectedOutputQuantity,
        dailyOutputBatchNo,
        setDailyOutputBatchNo,
        dailyOutputMmLotId,
        setDailyOutputMmLotId,
        dailyOutputManufacturingDate,
        setDailyOutputManufacturingDate: updateDailyOutputManufacturingDate,
        dailyOutputExpiryDate,
        setDailyOutputExpiryDate,
        dailyOutputEligibleLots,
        dailyOutputLotsLoading,
        dailyOutputLotsError,
        dailyRejectedOutputBatchNo,
        setDailyRejectedOutputBatchNo,
        dailyRejectedOutputMmLotId,
        setDailyRejectedOutputMmLotId,
        dailyRejectedOutputManufacturingDate,
        setDailyRejectedOutputManufacturingDate: updateDailyRejectedOutputManufacturingDate,
        dailyRejectedOutputExpiryDate,
        setDailyRejectedOutputExpiryDate,
        dailyRejectedOutputEligibleLots,
        dailyRejectedOutputLotsLoading,
        dailyRejectedOutputLotsError,
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
        registerRejectedOutput,
    };
}

export type DailyYieldAuditController = ReturnType<typeof useDailyYieldAudit>;
