import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    fetchQALogs,
    fetchQARejectionReasons,
    DailyQARequestError,
    postDailyQAInspection,
    registerRejectedOutputAllocation,
    type DailyQAOutputAllocationLine,
    type DailyQAInspectionRequest,
} from "../../manufacturing-qa/services/qa-api";
import type { QARejectionReason } from "../../manufacturing-qa/types";
import { fetchEligibleBadStockLots, fetchEligibleFinishedGoodsLots } from "../../shared/finished-goods-lots-api";
import type { EligibleFinishedGoodsLot } from "../../shared/finished-goods-lots-api";
import { fetchJobOrderOperatorSnapshot, fetchUsersList } from "../../production-workflow/services/production-api";
import { fetchJobOrderDailyYieldDetails, revokeJobOrderYieldAudit } from "../services/job-order-inspection-qa-api";
import {
    parseQAOutputQuantity,
    qaOutputAllocationCapacityErrorMessage,
    qaOutputAllocationWithinCapacity,
    sumQAOutputQuantities
} from "../../manufacturing-qa/qa-output-allocation";
import { isRejectedOutputRegistered } from "../../manufacturing-qa/rejected-output";
import { expiryDateFromShelfLife } from "../utils/shelf-life-date";
import { getCachedPromise } from "../utils/cached-promise";
import { dailyQAParameterValueKey } from "../utils/saved-daily-qa-parameters";
import { yieldEvidenceRequirementsForLedger } from "../utils/yield-evidence";
import {
    dailyQAAuditStateError,
    isDailyQALabStatus,
    latestDailyQAAudit,
    parseDailyQAActionTaken,
    parseDailyQALabStatus,
    type DailyQAActionTaken,
    type DailyQALabStatus
} from "../../manufacturing-qa/daily-qa-outcome";
import {
    validateManufacturingEvidenceBatch,
    validateManufacturingEvidenceChannelBatch
} from "../../production-workflow/services/production-yield-image";
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

interface OutputAllocationDraft {
    allocationId?: number | null;
    allocationKey: string;
    quantity: string;
    mmLotId: string;
    lotName: string;
    batchNo: string;
    manufacturingDate: string;
    expiryDate: string;
    rejectionReasonId: string;
    rejectionReasonName?: string;
}

type OutputAllocationField = "quantity" | "mmLotId" | "batchNo" | "manufacturingDate" | "expiryDate" | "rejectionReasonId";

function newAllocationDraft(): OutputAllocationDraft {
    return {
        allocationKey: typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `qa-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        quantity: "",
        mmLotId: "",
        lotName: "",
        batchNo: "",
        manufacturingDate: "",
        expiryDate: "",
        rejectionReasonId: "",
        rejectionReasonName: ""
    };
}

function allocationDrafts(
    rows: JobOrderDailyYieldRecord["acceptedAllocations"],
    fallback: Omit<OutputAllocationDraft, "allocationId" | "allocationKey">
): OutputAllocationDraft[] {
    if (Array.isArray(rows) && rows.length > 0) {
        return rows.map((row) => ({
            allocationId: row.allocationId,
            allocationKey: row.allocationKey,
            quantity: String(row.quantity),
            mmLotId: row.mmLotId ? String(row.mmLotId) : "",
            lotName: row.lotName || "",
            batchNo: row.batchNo || "",
            manufacturingDate: row.manufacturingDate || "",
            expiryDate: row.expiryDate || "",
            rejectionReasonId: row.rejectionReasonId ? String(row.rejectionReasonId) : "",
            rejectionReasonName: row.rejectionReasonName || ""
        }));
    }
    return [{ ...newAllocationDraft(), ...fallback }];
}

function formattedOutputQuantity(value: number): string {
    return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 6 });
}

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
    const [referenceLoading, setReferenceLoading] = useState(false);
    const [referenceError, setReferenceError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [quantityAllocationError, setQuantityAllocationError] = useState<string | null>(null);
    const [saveOutcomeUnclear, setSaveOutcomeUnclear] = useState(false);
    const [moisturePct, setMoisturePct] = useState("");
    const [acidityPh, setAcidityPh] = useState("");
    const [sensoryStatus, setSensoryStatus] = useState<"Passed" | "Failed">("Passed");
    const [weightCheckPassed, setWeightCheckPassed] = useState(true);
    const [dailyLabStatus, setDailyLabStatus] = useState<DailyQALabStatus | "">("");
    const [savedLabStatus, setSavedLabStatus] = useState<DailyQALabStatus | null>(null);
    const [dailyActionTaken, setDailyActionTaken] = useState<DailyQAActionTaken>("Released");
    const [dailyRemarks, setDailyRemarks] = useState("");
    const [dailyAcceptedOutputQuantity, setDailyAcceptedOutputQuantity] = useState("");
    const [dailyRejectedOutputQuantity, setDailyRejectedOutputQuantity] = useState("");
    const [acceptedOutputAllocations, setAcceptedOutputAllocations] = useState<OutputAllocationDraft[]>([]);
    const [dailyOutputEligibleLots, setDailyOutputEligibleLots] = useState<EligibleFinishedGoodsLot[]>([]);
    const [dailyOutputLotsLoading, setDailyOutputLotsLoading] = useState(false);
    const [dailyOutputLotsError, setDailyOutputLotsError] = useState<string | null>(null);
    const [rejectedOutputAllocations, setRejectedOutputAllocations] = useState<OutputAllocationDraft[]>([]);
    const [qaRejectionReasons, setQaRejectionReasons] = useState<QARejectionReason[]>([]);
    const [qaRejectionReasonsLoading, setQaRejectionReasonsLoading] = useState(false);
    const [qaRejectionReasonsError, setQaRejectionReasonsError] = useState<string | null>(null);
    const [acceptedEvidenceFiles, setAcceptedEvidenceFiles] = useState<File[]>([]);
    const [acceptedEvidenceError, setAcceptedEvidenceError] = useState<string | null>(null);
    const [rejectedEvidenceFiles, setRejectedEvidenceFiles] = useState<File[]>([]);
    const [rejectedEvidenceError, setRejectedEvidenceError] = useState<string | null>(null);
    const [dailyRejectedOutputEligibleLots, setDailyRejectedOutputEligibleLots] = useState<EligibleFinishedGoodsLot[]>([]);
    const [dailyRejectedOutputLotsLoading, setDailyRejectedOutputLotsLoading] = useState(false);
    const [dailyRejectedOutputLotsError, setDailyRejectedOutputLotsError] = useState<string | null>(null);
    const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
    const [qaParamValues, setQaParamValues] = useState<Record<string, string>>({});
    const lotRequestId = useRef(0);
    const rejectedLotRequestId = useRef(0);
    const operatorRequestId = useRef(0);
    const auditSubmitInFlight = useRef(false);
    const referenceRequestId = useRef(0);
    const templateCache = useRef(new Map<number, DailyYieldQATemplate>());
    const loadedTemplateIds = useRef(new Set<number>());
    const routeOperatorRequests = useRef(new Map<number, Promise<Record<number, string[]>>>());
    const inspectorNameRequests = useRef(new Map<string, Promise<Record<number, string>>>());
    const finishedGoodsLotRequests = useRef(new Map<string, Promise<EligibleFinishedGoodsLot[]>>());
    const badStockLotRequests = useRef(new Map<string, Promise<EligibleFinishedGoodsLot[]>>());
    const outputLotSelectionInitialized = useRef(false);
    const rejectedLotSelectionInitialized = useRef(false);
    const evidenceKeysByFile = useRef(new WeakMap<File, string>());

    const evidenceKeysFor = useCallback((files: File[]) => files.map((file) => {
        let key = evidenceKeysByFile.current.get(file);
        if (!key) {
            key = crypto.randomUUID();
            evidenceKeysByFile.current.set(file, key);
        }
        return key;
    }), []);

    const validateAllocationCapacity = useCallback((acceptedValue: string, rejectedValue: string) => {
        const acceptedQuantity = parseQAOutputQuantity(acceptedValue);
        const rejectedQuantity = parseQAOutputQuantity(rejectedValue);
        if (acceptedQuantity === null || rejectedQuantity === null || !selectedYield || !selectedDetails) {
            setQuantityAllocationError(null);
            return null;
        }
        if (qaOutputAllocationWithinCapacity(
            { acceptedQuantity, rejectedQuantity },
            selectedYield.qaAllocationLimit
        )) {
            setQuantityAllocationError(null);
            return null;
        }
        const message = qaOutputAllocationCapacityErrorMessage(
            selectedYield.qaAllocationLimit,
            selectedDetails.totalProducedQuantity,
            selectedDetails.productUom
        );
        setQuantityAllocationError(message);
        return message;
    }, [selectedDetails, selectedYield]);

    const updateAcceptedAllocation = useCallback((allocationKey: string, field: OutputAllocationField, value: string) => {
        const selectedLotName = field === "mmLotId"
            ? dailyOutputEligibleLots.find((lot) => String(lot.lotId) === value)?.lotName || ""
            : "";
        if (selectedLotName) setDailyOutputLotsError(null);
        setAcceptedOutputAllocations((rows) => rows.map((row) => {
            if (row.allocationKey !== allocationKey) return row;
            const updated = { ...row, [field]: value };
            if (field === "mmLotId") updated.lotName = selectedLotName;
            if (field === "manufacturingDate") {
                updated.expiryDate = value
                    ? expiryDateFromShelfLife(value, selectedDetails?.productShelfLifeDays) || updated.expiryDate
                    : "";
            }
            return updated;
        }));
    }, [dailyOutputEligibleLots, selectedDetails?.productShelfLifeDays]);

    const updateRejectedAllocation = useCallback((allocationKey: string, field: OutputAllocationField, value: string) => {
        const selectedLotName = field === "mmLotId"
            ? dailyRejectedOutputEligibleLots.find((lot) => String(lot.lotId) === value)?.lotName || ""
            : "";
        if (selectedLotName) setDailyRejectedOutputLotsError(null);
        setRejectedOutputAllocations((rows) => rows.map((row) => {
            if (row.allocationKey !== allocationKey) return row;
            const updated = { ...row, [field]: value };
            if (field === "mmLotId") updated.lotName = selectedLotName;
            if (field === "rejectionReasonId") updated.rejectionReasonName = qaRejectionReasons.find((reason) => String(reason.id) === value)?.reason_name || "";
            if (field === "manufacturingDate") {
                updated.expiryDate = value
                    ? expiryDateFromShelfLife(value, selectedDetails?.productShelfLifeDays) || updated.expiryDate
                    : "";
            }
            return updated;
        }));
    }, [dailyRejectedOutputEligibleLots, qaRejectionReasons, selectedDetails?.productShelfLifeDays]);

    const addAcceptedAllocation = useCallback(() => setAcceptedOutputAllocations((rows) => [...rows, newAllocationDraft()]), []);
    const removeAcceptedAllocation = useCallback((allocationKey: string) => {
        setAcceptedOutputAllocations((rows) => rows.length > 1 ? rows.filter((row) => row.allocationKey !== allocationKey) : rows);
    }, []);
    const addRejectedAllocation = useCallback(() => setRejectedOutputAllocations((rows) => [...rows, newAllocationDraft()]), []);
    const removeRejectedAllocation = useCallback((allocationKey: string) => {
        setRejectedOutputAllocations((rows) => rows.length > 1 ? rows.filter((row) => row.allocationKey !== allocationKey) : rows);
    }, []);

    const updateAcceptedEvidence = useCallback((files: File[], error: string | null) => {
        const savedEvidence = selectedYield?.evidence?.acceptedStock || [];
        const limitError = validateManufacturingEvidenceChannelBatch(
            savedEvidence.length,
            savedEvidence.reduce((total, item) => total + (item.fileSize || 0), 0),
            files,
            "QA accepted stock evidence"
        );
        setAcceptedEvidenceFiles(files);
        setAcceptedEvidenceError(error || limitError);
    }, [selectedYield]);

    const updateRejectedEvidence = useCallback((files: File[], error: string | null) => {
        const savedEvidence = selectedYield?.evidence?.rejectedStock || [];
        const limitError = validateManufacturingEvidenceChannelBatch(
            savedEvidence.length,
            savedEvidence.reduce((total, item) => total + (item.fileSize || 0), 0),
            files,
            "QA rejected stock evidence"
        );
        setRejectedEvidenceFiles(files);
        setRejectedEvidenceError(error || limitError);
    }, [selectedYield]);

    const loadAuditReferences = useCallback(async (details: JobOrderDailyYieldDetails) => {
        const requestId = ++referenceRequestId.current;
        const jobOrderId = Number(details.jobOrderId);
        setReferenceLoading(true);
        setReferenceError(null);
        setQaLogs([]);
        setQaRejectionReasonsLoading(true);

        if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0) {
            setReferenceLoading(false);
            setQaRejectionReasonsLoading(false);
            setReferenceError("A valid Job Order is required to load audit reference data.");
            return;
        }

        const templateIds = [...new Set(details.routes
            .map((route) => routeId(route.qaTemplateId))
            .filter((id) => id > 0))];
        const missingTemplateIds = templateIds.filter((id) => !loadedTemplateIds.current.has(id));
        const templateQuery = new URLSearchParams({
            action: "templates",
            templateIds: missingTemplateIds.join(",")
        });

        try {
            const [logsResult, templatesResult, rejectionReasonsResult] = await Promise.allSettled([
                fetchQALogs(jobOrderId),
                missingTemplateIds.length > 0
                    ? fetch(`/api/manufacturing/qa?${templateQuery}`, { cache: "no-store" }).then(async (response) => {
                        if (!response.ok) throw new Error("Failed to load QA templates.");
                        const payload: unknown = await response.json();
                        return Array.isArray(payload) ? payload as DailyYieldQATemplate[] : [];
                    })
                    : Promise.resolve([] as DailyYieldQATemplate[]),
                fetchQARejectionReasons()
            ]);

            if (templatesResult.status === "fulfilled") {
                templatesResult.value.forEach((template) => {
                    const id = routeId(template.template_id ?? template.id);
                    if (id > 0) templateCache.current.set(id, template);
                });
                missingTemplateIds.forEach((id) => loadedTemplateIds.current.add(id));
            }

            if (requestId !== referenceRequestId.current) return;
            setQaTemplates(Array.from(templateCache.current.values()));
            if (rejectionReasonsResult.status === "fulfilled") {
                setQaRejectionReasons(rejectionReasonsResult.value.filter((reason) => reason.is_active));
                setQaRejectionReasonsError(null);
            } else {
                setQaRejectionReasons([]);
                setQaRejectionReasonsError(rejectionReasonsResult.reason instanceof Error
                    ? rejectionReasonsResult.reason.message
                    : "Failed to load QA rejection reasons.");
            }
            if (logsResult.status === "fulfilled") setQaLogs(logsResult.value);

            const errors = [
                logsResult.status === "rejected" ? "Failed to load operator checklist logs." : "",
                templatesResult.status === "rejected" ? "Failed to load QA templates." : ""
            ].filter(Boolean);
            setReferenceError(errors.length > 0 ? errors.join(" ") : null);
        } finally {
            if (requestId === referenceRequestId.current) {
                setReferenceLoading(false);
                setQaRejectionReasonsLoading(false);
            }
        }
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
        const value = qaParamValues[dailyQAParameterValueKey(selectedRouteId ?? 0, parameter.parameter_id)];
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
    }), [activeParameters, qaParamValues, selectedRouteId]);

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

    const loadOutputLots = useCallback(async (details: JobOrderDailyYieldDetails, rows: OutputAllocationDraft[]) => {
        const requestId = lotRequestId.current + 1;
        lotRequestId.current = requestId;
        setDailyOutputLotsLoading(true);
        setDailyOutputLotsError(null);

        const branchId = details.branchId;
        const productId = details.productId;
        if (!branchId || !productId) {
            setDailyOutputLotsLoading(false);
            setDailyOutputLotsError("The Job Order branch or finished-good product is unavailable.");
            return;
        }

        try {
            const cacheKey = `${branchId}:${productId}`;
            const lots = await getCachedPromise(finishedGoodsLotRequests.current, cacheKey, async () => {
                const response = await fetchEligibleFinishedGoodsLots(branchId, productId);
                return response.lots;
            });
            if (lotRequestId.current !== requestId) return;
            setDailyOutputEligibleLots(lots);
            if (!outputLotSelectionInitialized.current) {
                const assignedLotIds = rows.map((row) => Number(row.mmLotId)).filter((id) => id > 0);
                if (assignedLotIds.some((id) => !lots.some((lot) => lot.lotId === id))) {
                    setDailyOutputLotsError("The previously assigned storage lot is no longer active or eligible for this finished good.");
                } else if (lots.length === 0) {
                    setDailyOutputLotsError("No active finished-goods storage lots are available for this Job Order branch and product.");
                }
                outputLotSelectionInitialized.current = true;
            } else if (lots.length === 0) {
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

    const loadRejectedOutputLots = useCallback(async (details: JobOrderDailyYieldDetails, rows: OutputAllocationDraft[]) => {
        const requestId = rejectedLotRequestId.current + 1;
        rejectedLotRequestId.current = requestId;
        setDailyRejectedOutputLotsLoading(true);
        setDailyRejectedOutputLotsError(null);

        const branchId = details.branchId;
        const productId = details.productId;
        if (!branchId || !productId) {
            setDailyRejectedOutputLotsLoading(false);
            setDailyRejectedOutputLotsError("The Job Order branch or finished-good product is unavailable.");
            return;
        }

        try {
            const cacheKey = `${branchId}:${productId}`;
            const lots = await getCachedPromise(badStockLotRequests.current, cacheKey, async () => {
                const response = await fetchEligibleBadStockLots(branchId, productId);
                return response.lots;
            });
            if (rejectedLotRequestId.current !== requestId) return;
            setDailyRejectedOutputEligibleLots(lots);
            if (!rejectedLotSelectionInitialized.current) {
                const assignedLotIds = rows.map((row) => Number(row.mmLotId)).filter((id) => id > 0);
                if (assignedLotIds.some((id) => !lots.some((lot) => lot.lotId === id))) {
                    setDailyRejectedOutputLotsError("The previously assigned bad-stock storage lot is no longer active or eligible.");
                } else if (lots.length === 0) {
                    setDailyRejectedOutputLotsError("No active bad-stock storage lots are configured for this Job Order branch and product.");
                }
                rejectedLotSelectionInitialized.current = true;
            } else if (lots.length === 0) {
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

    const loadRouteOperators = useCallback(async (jobOrderId: number, routeIds: number[]) => {
        const requestId = ++operatorRequestId.current;
        if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0) {
            setRouteOperatorsByRouteId(Object.fromEntries(routeIds.map((id) => [id, []])));
            return;
        }
        try {
            const operatorsByRouteId = await getCachedPromise(routeOperatorRequests.current, jobOrderId, async () => {
                const response = await fetchJobOrderOperatorSnapshot(jobOrderId);
                const entries = new Map<number, Set<string>>();
                routeIds.forEach((id) => entries.set(id, new Set()));
                (response.data || []).forEach((record) => {
                    if (record.is_active === false) return;
                    const id = routeId(record.routing_id || record.task_id);
                    if (!id) return;
                    const names = entries.get(id) || new Set<string>();
                    names.add(String(record.user_name || "").trim() || `User #${record.user_id}`);
                    entries.set(id, names);
                });
                return Object.fromEntries(Array.from(entries, ([id, names]) => [id, Array.from(names)]));
            });
            if (requestId === operatorRequestId.current) setRouteOperatorsByRouteId(operatorsByRouteId);
        } catch {
            if (requestId === operatorRequestId.current) {
                setRouteOperatorsByRouteId(Object.fromEntries(routeIds.map((id) => [id, []])));
            }
        }
    }, []);

    const loadInspectorNames = useCallback(async () => {
        try {
            const names = await getCachedPromise(inspectorNameRequests.current, "users", async () => {
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
                return Object.fromEntries(entries);
            });
            setInspectorNamesById(names);
        } catch {
            setInspectorNamesById({});
        }
    }, []);

    const updateDailyAcceptedOutputQuantity = useCallback((value: string) => {
        const previousQuantity = parseQAOutputQuantity(dailyAcceptedOutputQuantity) ?? 0;
        const nextQuantity = parseQAOutputQuantity(value);
        setDailyAcceptedOutputQuantity(value);
        validateAllocationCapacity(value, dailyRejectedOutputQuantity);
        if (
            previousQuantity <= 0
            && nextQuantity !== null
            && nextQuantity > 0
            && selectedYield?.qaStatus !== "Passed"
            && selectedDetails
            && selectedYield
            && !outputLotSelectionInitialized.current
        ) {
            void loadOutputLots(selectedDetails, acceptedOutputAllocations);
        }
    }, [acceptedOutputAllocations, dailyAcceptedOutputQuantity, dailyRejectedOutputQuantity, loadOutputLots, selectedDetails, selectedYield, validateAllocationCapacity]);

    const updateDailyRejectedOutputQuantity = useCallback((value: string) => {
        const previousQuantity = parseQAOutputQuantity(dailyRejectedOutputQuantity) ?? 0;
        const nextQuantity = parseQAOutputQuantity(value);
        setDailyRejectedOutputQuantity(value);
        validateAllocationCapacity(dailyAcceptedOutputQuantity, value);
        if (
            previousQuantity <= 0
            && nextQuantity !== null
            && nextQuantity > 0
            && selectedYield?.qaStatus !== "Passed"
            && !selectedYield?.rejectedMmLotId
            && selectedDetails
            && selectedYield
            && !rejectedLotSelectionInitialized.current
        ) {
            void loadRejectedOutputLots(selectedDetails, rejectedOutputAllocations);
        }
    }, [dailyAcceptedOutputQuantity, dailyRejectedOutputQuantity, loadRejectedOutputLots, rejectedOutputAllocations, selectedDetails, selectedYield, validateAllocationCapacity]);

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
        const savedAudit = latestDailyQAAudit(yieldRecord.audits);
        const restoredLabStatus = parseDailyQALabStatus(savedAudit?.lab_status ?? savedAudit?.labStatus);
        const restoredAction = parseDailyQAActionTaken(savedAudit?.action_taken ?? savedAudit?.actionTaken);

        setSelectedYield(yieldRecord);
        setSelectedDetails(details);
        setSaveError(null);
        setQuantityAllocationError(null);
        setSaveOutcomeUnclear(false);
        setAuditStartedAt(new Date().toISOString());
        setMoisturePct("");
        setAcidityPh("");
        setSensoryStatus("Passed");
        setWeightCheckPassed(true);
        setDailyLabStatus(restoredLabStatus || "");
        setSavedLabStatus(restoredLabStatus);
        setDailyActionTaken(restoredAction || "Released");
        setDailyRemarks("");
        setDailyAcceptedOutputQuantity(String(yieldRecord.qaAcceptedQuantity ?? yieldRecord.goodQuantity));
        setDailyRejectedOutputQuantity(String(yieldRecord.qaRejectedQuantity ?? (yieldRecord.rejectedQuantity + yieldRecord.scrapQuantity)));
        setAcceptedEvidenceFiles([]);
        setAcceptedEvidenceError(null);
        setRejectedEvidenceFiles([]);
        setRejectedEvidenceError(null);
        evidenceKeysByFile.current = new WeakMap<File, string>();
        const outputManufacturingDate = yieldRecord.manufacturingDate || "";
        const outputExpiryDate = yieldRecord.expiryDate || (
            outputManufacturingDate
                ? expiryDateFromShelfLife(outputManufacturingDate, details.productShelfLifeDays) || ""
                : ""
        );
        const acceptedRows = allocationDrafts(yieldRecord.acceptedAllocations, {
            quantity: String(yieldRecord.qaAcceptedQuantity ?? yieldRecord.goodQuantity),
            mmLotId: yieldRecord.mmLotId ? String(yieldRecord.mmLotId) : "",
            lotName: yieldRecord.lotName || "",
            batchNo: yieldRecord.batchNo || "",
            manufacturingDate: outputManufacturingDate,
            expiryDate: outputExpiryDate,
            rejectionReasonId: ""
        });
        setAcceptedOutputAllocations(acceptedRows);
        setDailyOutputEligibleLots([]);
        setDailyOutputLotsLoading(false);
        setDailyOutputLotsError(null);
        outputLotSelectionInitialized.current = false;
        const rejectedOutputManufacturingDate = yieldRecord.rejectedManufacturingDate || outputManufacturingDate;
        const rejectedOutputExpiryDate = yieldRecord.rejectedExpiryDate || (
            rejectedOutputManufacturingDate
                ? expiryDateFromShelfLife(rejectedOutputManufacturingDate, details.productShelfLifeDays) || yieldRecord.expiryDate || ""
                : yieldRecord.expiryDate || ""
        );
        const rejectedRows = allocationDrafts(yieldRecord.rejectedAllocations, {
            quantity: String(yieldRecord.qaRejectedQuantity ?? (yieldRecord.rejectedQuantity + yieldRecord.scrapQuantity)),
            mmLotId: yieldRecord.rejectedMmLotId ? String(yieldRecord.rejectedMmLotId) : "",
            lotName: yieldRecord.rejectedLotName || "",
            batchNo: yieldRecord.rejectedBatchNo || "",
            manufacturingDate: rejectedOutputManufacturingDate,
            expiryDate: rejectedOutputExpiryDate,
            rejectionReasonId: ""
        });
        setRejectedOutputAllocations(rejectedRows);
        setDailyRejectedOutputEligibleLots([]);
        setDailyRejectedOutputLotsLoading(false);
        setDailyRejectedOutputLotsError(null);
        rejectedLotSelectionInitialized.current = false;
        const savedValues = yieldRecord.audits.reduce<Record<string, string>>((values, audit) => {
            const savedRouteId = routeId(audit.jo_route_id);
            if (!savedRouteId || !Array.isArray(audit.qaParameters)) return values;
            for (const parameter of audit.qaParameters) {
                const parameterId = routeId(parameter.parameter_id);
                if (parameterId) {
                    values[dailyQAParameterValueKey(savedRouteId, parameterId)] = String(parameter.value ?? "");
                }
            }
            return values;
        }, {});
        setQaParamValues(savedValues);
        setSelectedRouteId(preferredRoute?.id || pendingRoutes[0]?.id || sortedRoutes[0]?.id || null);
        setRouteOperatorsByRouteId({});
        lotRequestId.current += 1;
        rejectedLotRequestId.current += 1;
        setIsOpen(true);
        void loadAuditReferences(details);
        const editable = yieldRecord.qaStatus !== "Passed";
        const acceptedQuantity = Number(yieldRecord.qaAcceptedQuantity ?? yieldRecord.goodQuantity);
        const rejectedQuantity = Number(yieldRecord.qaRejectedQuantity ?? (yieldRecord.rejectedQuantity + yieldRecord.scrapQuantity));
        if (editable && acceptedQuantity > 0) void loadOutputLots(details, acceptedRows);
        if (editable && rejectedQuantity > 0 && !yieldRecord.rejectedMmLotId) void loadRejectedOutputLots(details, rejectedRows);
        void loadRouteOperators(Number(details.jobOrderId), sortedRoutes.map((route) => route.id));
        void loadInspectorNames();
    }, [loadAuditReferences, loadOutputLots, loadRejectedOutputLots, loadRouteOperators, loadInspectorNames]);

    const closeAudit = useCallback(() => {
        if (actionLoading) return;
        referenceRequestId.current += 1;
        lotRequestId.current += 1;
        rejectedLotRequestId.current += 1;
        operatorRequestId.current += 1;
        setDailyOutputLotsLoading(false);
        setDailyRejectedOutputLotsLoading(false);
        setReferenceLoading(false);
        setAcceptedOutputAllocations([]);
        setRejectedOutputAllocations([]);
        setAcceptedEvidenceFiles([]);
        setRejectedEvidenceFiles([]);
        setIsOpen(false);
        setSaveError(null);
        setQuantityAllocationError(null);
    }, [actionLoading]);

    const buildOutputAllocations = useCallback((
        rows: OutputAllocationDraft[],
        targetQuantity: number,
        outputKind: "accepted" | "rejected"
    ): DailyQAOutputAllocationLine[] | false => {
        if (targetQuantity <= 0) return [];
        const lots = outputKind === "accepted" ? dailyOutputEligibleLots : dailyRejectedOutputEligibleLots;
        const lotsLoading = outputKind === "accepted" ? dailyOutputLotsLoading : dailyRejectedOutputLotsLoading;
        const quantityLabel = outputKind === "accepted" ? "good" : "rejected";
        const registeredRejectedOutput = outputKind === "rejected" && isRejectedOutputRegistered(selectedYield?.rejectedMmLotId);
        if (lotsLoading && !registeredRejectedOutput) {
            toast.error(`Wait for eligible ${outputKind === "accepted" ? "finished-goods" : "bad-stock"} storage lots to finish loading.`);
            return false;
        }
        if (rows.length === 0) {
            toast.error("At least one lot / batch allocation is required for positive output.");
            return false;
        }

        const lines: DailyQAOutputAllocationLine[] = [];
        for (const row of rows) {
            const quantity = parseQAOutputQuantity(row.quantity);
            if (quantity === null || quantity <= 0) {
                toast.error("Enter a positive quantity for every lot / batch allocation.");
                return false;
            }
            const mmLotId = Number(row.mmLotId);
            if (!Number.isSafeInteger(mmLotId) || mmLotId <= 0) {
                toast.error(`Select a storage lot for every ${quantityLabel} allocation.`);
                return false;
            }
            if (!registeredRejectedOutput && !lots.some((lot) => lot.lotId === mmLotId)) {
                toast.error("A selected storage lot is no longer eligible. Refresh the lot list and try again.");
                return false;
            }
            const batchNo = row.batchNo.trim();
            if (!batchNo || batchNo.length > 100) {
                toast.error("Enter a batch / lot number of no more than 100 characters for every allocation.");
                return false;
            }
            if (!row.manufacturingDate || !row.expiryDate) {
                toast.error("Enter the manufacturing and expiry dates for every allocation.");
                return false;
            }
            if (row.expiryDate < row.manufacturingDate) {
                toast.error("An allocation expiry date cannot be earlier than its manufacturing date.");
                return false;
            }
            let rejectionReasonId: number | null = null;
            if (outputKind === "rejected") {
                rejectionReasonId = Number(row.rejectionReasonId);
                if (!Number.isSafeInteger(rejectionReasonId)
                    || !qaRejectionReasons.some((reason) => reason.id === rejectionReasonId && reason.is_active)) {
                    toast.error("Select an active defect / rejection reason for every rejected allocation.");
                    return false;
                }
            }
            lines.push({
                allocationId: row.allocationId,
                allocationKey: row.allocationKey,
                quantity,
                mmLotId,
                batchNo,
                manufacturingDate: row.manufacturingDate,
                expiryDate: row.expiryDate,
                rejectionReasonId
            });
        }

        const lineTotal = sumQAOutputQuantities(...lines.map((line) => line.quantity));
        if (lineTotal !== targetQuantity) {
            setQuantityAllocationError(
                `Batch allocation mismatch: Total line allocations (${formattedOutputQuantity(lineTotal ?? 0)}) must equal total audited ${quantityLabel} quantity (${formattedOutputQuantity(targetQuantity)}).`
            );
            return false;
        }
        return lines;
    }, [dailyOutputEligibleLots, dailyOutputLotsLoading, dailyRejectedOutputEligibleLots, dailyRejectedOutputLotsLoading, qaRejectionReasons, selectedYield?.rejectedMmLotId]);

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
        const capacityError = validateAllocationCapacity(String(acceptedQuantity), String(rejectedQuantity));
        if (capacityError) {
            toast.error(capacityError);
            return;
        }
        if (rejectedQuantity <= 0) {
            toast.error("The rejected quantity must be greater than zero to register rejected output.");
            return;
        }

        const jobOrderId = selectedDetails.jobOrderId;
        const ledgerId = selectedYield.ledgerId;
        setQuantityAllocationError(null);
        const rejectedAllocations = buildOutputAllocations(rejectedOutputAllocations, rejectedQuantity, "rejected");
        if (rejectedAllocations === false || rejectedAllocations.length === 0) return;
        setQuantityAllocationError(null);

        const savedRejectedEvidence = selectedYield.evidence?.rejectedStock || [];
        const rejectedEvidenceErrorValue = rejectedEvidenceError
            || validateManufacturingEvidenceBatch(rejectedEvidenceFiles, "QA rejected stock evidence")
            || validateManufacturingEvidenceChannelBatch(
                savedRejectedEvidence.length,
                savedRejectedEvidence.reduce((total, item) => total + (item.fileSize || 0), 0),
                rejectedEvidenceFiles,
                "QA rejected stock evidence"
            );
        const hasSavedRejectedEvidence = (selectedYield.evidence?.rejectedStock.length || 0) > 0;
        if (rejectedEvidenceErrorValue || (rejectedEvidenceFiles.length === 0 && !hasSavedRejectedEvidence)) {
            toast.error(rejectedEvidenceErrorValue || "QA rejected stock evidence is required.");
            return;
        }

        setActionLoading(true);
        try {
            await registerRejectedOutputAllocation({
                jobOrderId,
                ledgerId,
                acceptedQuantity,
                rejectedQuantity,
                rejectedOutputMetadata: rejectedAllocations[0],
                rejectedAllocations
            }, { files: rejectedEvidenceFiles, keys: evidenceKeysFor(rejectedEvidenceFiles) });
            toast.success("Rejected output was registered in the configured bad-stock branch.");
            setIsOpen(false);
            await onSaved?.();
        } catch (error) {
            if (error instanceof DailyQARequestError && error.code === "QA_OUTPUT_CAP_EXCEEDED") {
                setQuantityAllocationError(error.message);
                toast.error(error.message);
            } else {
                toast.error(error instanceof Error ? error.message : "Failed to register rejected output.");
            }
        } finally {
            setActionLoading(false);
        }
    }, [buildOutputAllocations, dailyAcceptedOutputQuantity, dailyRejectedOutputQuantity, evidenceKeysFor, onSaved, rejectedEvidenceError, rejectedEvidenceFiles, rejectedOutputAllocations, selectedDetails, selectedYield, validateAllocationCapacity]);

    const submitAudit = useCallback(async () => {
        if (!selectedYield || !selectedDetails || auditSubmitInFlight.current || selectedYield.qaStatus === "Passed") return;

        const auditStateError = dailyQAAuditStateError(dailyLabStatus, dailyActionTaken);
        if (auditStateError) {
            toast.error(auditStateError);
            return;
        }
        if (!isDailyQALabStatus(dailyLabStatus)) return;

        const jobOrderId = selectedDetails.jobOrderId;
        const ledgerId = selectedYield.ledgerId;
        const acceptedQuantity = parseQAOutputQuantity(dailyAcceptedOutputQuantity);
        const rejectedQuantity = parseQAOutputQuantity(dailyRejectedOutputQuantity);
        if (acceptedQuantity === null || rejectedQuantity === null) {
            toast.error("Enter valid nonnegative Good and Bad quantities with no more than six decimal places.");
            return;
        }
        const capacityError = validateAllocationCapacity(String(acceptedQuantity), String(rejectedQuantity));
        if (capacityError) {
            toast.error(capacityError);
            return;
        }
        setQuantityAllocationError(null);
        const goodOutputQuantity = acceptedQuantity;
        if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0 || !Number.isSafeInteger(ledgerId) || ledgerId <= 0) {
            toast.error("This yield record is missing a valid Job Order or ledger reference.");
            return;
        }

        const acceptedAllocations = buildOutputAllocations(acceptedOutputAllocations, goodOutputQuantity, "accepted");
        if (acceptedAllocations === false) return;
        const rejectedAllocations = buildOutputAllocations(rejectedOutputAllocations, rejectedQuantity, "rejected");
        if (rejectedAllocations === false) return;
        setQuantityAllocationError(null);
        const outputMetadata = acceptedAllocations[0] || null;
        const rejectedOutputMetadata = rejectedAllocations[0] || null;
        const evidenceRequirements = yieldEvidenceRequirementsForLedger(acceptedQuantity, rejectedQuantity, isRejectedOutputRegistered(selectedYield.rejectedMmLotId));
        const savedAcceptedEvidence = selectedYield.evidence?.acceptedStock || [];
        const savedRejectedEvidence = selectedYield.evidence?.rejectedStock || [];
        const acceptedEvidenceErrorValue = acceptedEvidenceError
            || validateManufacturingEvidenceBatch(acceptedEvidenceFiles, "QA accepted stock evidence")
            || validateManufacturingEvidenceChannelBatch(
                savedAcceptedEvidence.length,
                savedAcceptedEvidence.reduce((total, item) => total + (item.fileSize || 0), 0),
                acceptedEvidenceFiles,
                "QA accepted stock evidence"
            );
        const rejectedEvidenceErrorValue = rejectedEvidenceError
            || validateManufacturingEvidenceBatch(rejectedEvidenceFiles, "QA rejected stock evidence")
            || validateManufacturingEvidenceChannelBatch(
                savedRejectedEvidence.length,
                savedRejectedEvidence.reduce((total, item) => total + (item.fileSize || 0), 0),
                rejectedEvidenceFiles,
                "QA rejected stock evidence"
            );
        const hasSavedAcceptedEvidence = (selectedYield.evidence?.acceptedStock.length || 0) > 0;
        const hasSavedRejectedEvidence = (selectedYield.evidence?.rejectedStock.length || 0) > 0;
        if (evidenceRequirements.acceptedStock && (acceptedEvidenceErrorValue || (acceptedEvidenceFiles.length === 0 && !hasSavedAcceptedEvidence))) {
            toast.error(acceptedEvidenceErrorValue || "QA accepted stock evidence is required when accepted quantity is greater than zero.");
            return;
        }
        if (evidenceRequirements.rejectedStock && (rejectedEvidenceErrorValue || (rejectedEvidenceFiles.length === 0 && !hasSavedRejectedEvidence))) {
            toast.error(rejectedEvidenceErrorValue || "QA rejected stock evidence is required when rejected quantity is greater than zero.");
            return;
        }

        const auditRoutes: Array<JobOrderDailyYieldRoute | null> = routes.length > 0 ? routes : [null];
        const inspections = auditRoutes.map((route) => {
            const template = route?.qaTemplateId
                ? qaTemplates.find((item) => routeId(item.template_id ?? item.id) === routeId(route.qaTemplateId))
                : null;
            const parameters = Array.isArray(template?.parameters) ? template.parameters : [];
            const qaParameters = parameters.map((parameter: DailyYieldQAParameter) => {
                const value = qaParamValues[dailyQAParameterValueKey(route?.id ?? 0, parameter.parameter_id)] || "";
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
                const value = qaParamValues[dailyQAParameterValueKey(route?.id ?? 0, parameter.parameter_id)];
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
                labStatus: dailyLabStatus,
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
            acceptedAllocations,
            rejectedAllocations,
            inspections
        };
        const requestEvidence = {
            acceptedFiles: evidenceRequirements.acceptedStock ? acceptedEvidenceFiles : [],
            acceptedKeys: evidenceKeysFor(evidenceRequirements.acceptedStock ? acceptedEvidenceFiles : []),
            rejectedFiles: evidenceRequirements.rejectedStock ? rejectedEvidenceFiles : [],
            rejectedKeys: evidenceKeysFor(evidenceRequirements.rejectedStock ? rejectedEvidenceFiles : [])
        };

        auditSubmitInFlight.current = true;
        setActionLoading(true);
        setSaveError(null);
        try {
            await postDailyQAInspection(requestPayload, requestEvidence);
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
                    await postDailyQAInspection(requestPayload, requestEvidence);
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
                if (error instanceof DailyQARequestError && error.code === "QA_OUTPUT_CAP_EXCEEDED") {
                    setQuantityAllocationError(error.message);
                    setSaveError(null);
                    toast.error(error.message);
                } else {
                    setSaveError(message);
                    toast.error(message);
                }
            }
        } finally {
            auditSubmitInFlight.current = false;
            setActionLoading(false);
        }
    }, [acceptedEvidenceError, acceptedEvidenceFiles, acceptedOutputAllocations, acidityPh, buildOutputAllocations, dailyAcceptedOutputQuantity, dailyActionTaken, dailyLabStatus, dailyRejectedOutputQuantity, dailyRemarks, evidenceKeysFor, moisturePct, onSaved, qaParamValues, qaTemplates, rejectedEvidenceError, rejectedEvidenceFiles, rejectedOutputAllocations, routes, selectedDetails, selectedYield, sensoryStatus, validateAllocationCapacity, weightCheckPassed]);

    const revokeAudit = useCallback(async (reason: string) => {
        if (!selectedYield || !selectedDetails || actionLoading) return;
        if (!selectedDetails.canRevokeYieldAudit || selectedYield.qaStatus !== "Passed") {
            toast.error("Job Order QA module access and an active QA release are required to revoke.");
            return;
        }
        setActionLoading(true);
        setSaveError(null);
        try {
            await revokeJobOrderYieldAudit({
                jobOrderId: selectedDetails.jobOrderId,
                ledgerId: selectedYield.ledgerId,
                reason
            });
            toast.success("QA release revoked. This yield can be audited again.");
            setIsOpen(false);
            await onSaved?.();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to revoke the QA release.";
            setSaveError(message);
            toast.error(message);
        } finally {
            setActionLoading(false);
        }
    }, [actionLoading, onSaved, selectedDetails, selectedYield]);

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
        referenceLoading,
        referenceError,
        actionLoading,
        saveError,
        quantityAllocationError,
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
        savedLabStatus,
        setDailyLabStatus,
        dailyActionTaken,
        setDailyActionTaken,
        dailyRemarks,
        setDailyRemarks,
        dailyAcceptedOutputQuantity,
        setDailyAcceptedOutputQuantity: updateDailyAcceptedOutputQuantity,
        dailyRejectedOutputQuantity,
        setDailyRejectedOutputQuantity: updateDailyRejectedOutputQuantity,
        acceptedOutputAllocations,
        updateAcceptedAllocation,
        addAcceptedAllocation,
        removeAcceptedAllocation,
        dailyOutputEligibleLots,
        dailyOutputLotsLoading,
        dailyOutputLotsError,
        rejectedOutputAllocations,
        updateRejectedAllocation,
        addRejectedAllocation,
        removeRejectedAllocation,
        qaRejectionReasons,
        qaRejectionReasonsLoading,
        qaRejectionReasonsError,
        acceptedEvidenceFiles,
        acceptedEvidenceError,
        setAcceptedEvidence: updateAcceptedEvidence,
        rejectedEvidenceFiles,
        rejectedEvidenceError,
        setRejectedEvidence: updateRejectedEvidence,
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
        revokeAudit,
        registerRejectedOutput,
    };
}

export type DailyYieldAuditController = ReturnType<typeof useDailyYieldAudit>;
