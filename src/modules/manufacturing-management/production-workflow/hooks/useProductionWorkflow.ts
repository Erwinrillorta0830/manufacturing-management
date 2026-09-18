/* eslint-disable */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { JobOrder, User, RouteOperatorRecord, RoutingTask, JobOrderCancellationPreview, SalesOrderLink, JobOrderMaterialLine } from "../types";
import {
    fetchJobOrders,
    fetchUsersList as apiFetchUsers,
    fetchRouteOperators,
    fetchJobOrderMaterials,
    manageRouteOperator,
    patchRoutingTask,
    fetchJobOrderCancellationPreview,
    cancelJobOrder,
    returnJobOrderMaterials,
    executeJobOrderWorkflow
} from "../services/production-api";
import { isJobOrderStatus, JOB_ORDER_STATUS, displayJobOrderStatus, normalizeJobOrderStatus } from "../../job-order-status";
import type { JobOrderWorkflowAction } from "../../job-order-workflow";
import {
    buildDisplayRouteOperatorRecords,
    getJobOrderOperatorAssignments,
    normalizeOperatorAssignmentMap
} from "../operator-assignment-display";

function createOperatorRequestId(action: string, taskId: number, userId: number): string {
    const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${action}:${taskId}:${userId}:${suffix}`;
}

export function useProductionWorkflow() {
    const searchParams = useSearchParams();
    // --- State Variables ---
    const [jobOrders, setJobOrders] = useState<JobOrder[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedJobOrderId, setSelectedJobOrderId] = useState<string>("");
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
    const [jobOrderMaterials, setJobOrderMaterials] = useState<JobOrderMaterialLine[]>([]);
    const [loadingJobOrderMaterials, setLoadingJobOrderMaterials] = useState(false);

    // Operator logs for the selected task
    const [routeOperators, setRouteOperators] = useState<RouteOperatorRecord[]>([]);
    const [operatorsSummary, setOperatorsSummary] = useState({ total_hours: 0 });
    
    // UI states
    const [loadingJobs, setLoadingJobs] = useState(true);
    const [loadingOperators, setLoadingOperators] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [branches, setBranches] = useState<any[]>([]);
    const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("All");
    const [selectedProductFilter, setSelectedProductFilter] = useState<string>("All");
    const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>("All");
    const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("All");
    const [pendingDeepLinkTarget, setPendingDeepLinkTarget] = useState<{ id?: string | null; jo?: string | null } | null>(null);
    const selectedJobOrderIdRef = useRef(selectedJobOrderId);

    useEffect(() => {
        selectedJobOrderIdRef.current = selectedJobOrderId;
    }, [selectedJobOrderId]);

    // Operator Assignment State
    const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("");
    const [manualHours, setManualHours] = useState<string>("");
    const [activeManualUserId, setActiveManualUserId] = useState<number | null>(null);

    // Job Order cancellation / raw material return state
    const [cancellationModalOpen, setCancellationModalOpen] = useState(false);
    const [cancellationMode, setCancellationMode] = useState<"cancel" | "return">("cancel");
    const [cancellationPreview, setCancellationPreview] = useState<JobOrderCancellationPreview | null>(null);
    const [loadingCancellation, setLoadingCancellation] = useState(false);
    const [submittingCancellation, setSubmittingCancellation] = useState(false);
    const [cancellationError, setCancellationError] = useState<string | null>(null);
    const [workflowSubmitting, setWorkflowSubmitting] = useState(false);

    const inProductionJobOrders = useMemo(() => {
        return jobOrders.filter((jo) => isJobOrderStatus(jo.status, JOB_ORDER_STATUS.IN_PRODUCTION));
    }, [jobOrders]);

    // Terminal scope: staged (Picked) and In Production Job Orders.
    const terminalJobOrders = useMemo(() => {
        return jobOrders.filter((jo) => isJobOrderStatus(jo.status, JOB_ORDER_STATUS.PICKED, JOB_ORDER_STATUS.IN_PRODUCTION));
    }, [jobOrders]);

    const salesOrderLinksOf = useCallback((jo: JobOrder): SalesOrderLink[] => {
        return jo.salesOrders || jo.sales_orders || [];
    }, []);

    const productFilterOptions = useMemo(() => {
        const byProductId = new Map<string, string>();
        for (const jo of terminalJobOrders) {
            const value = String(jo.product_id);
            if (!byProductId.has(value)) {
                byProductId.set(value, jo.product_name || `Product #${jo.product_id}`);
            }
        }
        return [...byProductId.entries()]
            .map(([value, label]) => ({ value, label }))
            .sort((left, right) => left.label.localeCompare(right.label));
    }, [terminalJobOrders]);

    const customerFilterOptions = useMemo(() => {
        const byCustomerCode = new Map<string, string>();
        for (const jo of terminalJobOrders) {
            for (const salesOrder of salesOrderLinksOf(jo)) {
                const code = String(salesOrder?.customer_code || "").trim();
                if (!code || byCustomerCode.has(code)) continue;
                byCustomerCode.set(code, String(salesOrder?.customer_name || "").trim() || code);
            }
        }
        return [...byCustomerCode.entries()]
            .map(([value, label]) => ({ value, label }))
            .sort((left, right) => left.label.localeCompare(right.label));
    }, [terminalJobOrders, salesOrderLinksOf]);

    const statusFilterOptions = useMemo(() => {
        const presentStatuses = new Set<string>();
        for (const jo of terminalJobOrders) {
            const canonical = normalizeJobOrderStatus(jo.status);
            if (canonical) presentStatuses.add(canonical);
        }
        return [JOB_ORDER_STATUS.PICKED, JOB_ORDER_STATUS.IN_PRODUCTION]
            .filter((status) => presentStatuses.has(status))
            .map((status) => ({ value: status, label: displayJobOrderStatus(status) }));
    }, [terminalJobOrders]);

    // Get current Job Order object. The details modal follows the queue scope.
    const selectedJobOrder = useMemo(() => {
        return terminalJobOrders.find((jo) => jo.jo_id === selectedJobOrderId) || null;
    }, [terminalJobOrders, selectedJobOrderId]);

    // Sorted routing steps for selected Job Order
    const sortedTasks = useMemo(() => {
        if (!selectedJobOrder) return [];
        const tasks = selectedJobOrder.routing_tasks || selectedJobOrder.routingTasks || [];
        return [...tasks].sort((a, b) => a.sequence_order - b.sequence_order);
    }, [selectedJobOrder]);

    // Identify active step: the first incomplete routing step (falls back to
    // the last step so QA gates on the final step stay reachable).
    const activeStep = useMemo(() => {
        if (sortedTasks.length === 0) return null;
        return sortedTasks.find((task) => task.status !== "Completed") || sortedTasks[sortedTasks.length - 1];
    }, [sortedTasks]);

// Selected step object
const selectedTask = useMemo(() => {
    if (selectedTaskId === null) return null;
    return sortedTasks.find((t) => t.id === selectedTaskId) || null;
}, [sortedTasks, selectedTaskId]);

// Deep link support: /mm/production-workflow?id=... or ?jo=JO-XXXX selects the Job Order.
    useEffect(() => {
        const idParam = searchParams.get("id");
        const joParam = searchParams.get("jo");
        if (idParam || joParam) {
            setPendingDeepLinkTarget({ id: idParam, jo: joParam });
        }
    }, [searchParams]);

    useEffect(() => {
        if (!pendingDeepLinkTarget || loadingJobs) return;
        const { id, jo: joCode } = pendingDeepLinkTarget;
        const match = terminalJobOrders.find((job) => {
            if (id) {
                if (
                    String(job.jo_id) === id ||
                    (job.job_order_id !== undefined && String(job.job_order_id) === id) ||
                    (job.order_id !== undefined && String(job.order_id) === id)
                ) {
                    return true;
                }
            }
            if (joCode) {
                if (
                    job.jo_id === joCode ||
                    job.job_order_no === joCode ||
                    job.order_no === joCode
                ) {
                    return true;
                }
            }
            return false;
        });
        if (match) {
            setSelectedJobOrderId(match.jo_id);
            setSelectedTaskId(null);
        } else {
            toast.info("Only staged or In Production Job Orders can be opened in this terminal.");
        }
        setPendingDeepLinkTarget(null);
    }, [pendingDeepLinkTarget, loadingJobs, terminalJobOrders]);

    // Fetch Job Orders
    const fetchJobs = useCallback(async (selectIdAfterFetch?: string, silent = false) => {
        if (!silent) setLoadingJobs(true);
        try {
            const data = await fetchJobOrders();
            const activeJobs = data.filter((jo: any) => !isJobOrderStatus(
                jo.status,
                JOB_ORDER_STATUS.DRAFT,
                JOB_ORDER_STATUS.PLANNED,
                JOB_ORDER_STATUS.PLANNING
            ));
            setJobOrders(activeJobs);

            const nextId = selectIdAfterFetch || selectedJobOrderIdRef.current || "";
            const nextJobOrder = activeJobs.find((jo) => jo.jo_id === nextId);
            if (nextJobOrder && isJobOrderStatus(nextJobOrder.status, JOB_ORDER_STATUS.PICKED, JOB_ORDER_STATUS.IN_PRODUCTION)) {
                setSelectedJobOrderId(nextJobOrder.jo_id);
            } else {
                setSelectedJobOrderId("");
                setSelectedTaskId(null);
            }
        } catch (err: any) {
            if (!silent) toast.error(err.message || "Failed to load Job Orders from terminal.");
        } finally {
            if (!silent) setLoadingJobs(false);
        }
    }, []);

    // Fetch User Master List (Operators)
    const loadUsersList = async () => {
        try {
            const data = await apiFetchUsers();
            setUsers(data);
        } catch (err: any) {
            console.error("Error fetching users list:", err);
        }
    };

    // Fetch Route Operators checked into all routing tasks in the Job Order
    const fetchJobOrderOperators = useCallback(async (
        tasks: RoutingTask[],
        silent = false,
        assignmentOverride?: unknown
    ) => {
        if (tasks.length === 0) {
            setRouteOperators([]);
            setOperatorsSummary({ total_hours: 0 });
            return;
        }
        if (!silent) setLoadingOperators(true);
        try {
            const selectedAssignments = assignmentOverride === undefined
                ? getJobOrderOperatorAssignments(selectedJobOrder)
                : normalizeOperatorAssignmentMap(assignmentOverride);
            const results = await Promise.all(
                tasks.map(async (t) => {
                    try {
                        const res = await fetchRouteOperators(t.id);
                        const responseAssignments = res.assignmentState
                            ? normalizeOperatorAssignmentMap(res.assignmentState.assignedPersonnel)
                            : res.assignedPersonnel !== undefined && res.assignedPersonnel !== null
                                ? normalizeOperatorAssignmentMap(res.assignedPersonnel)
                                : selectedAssignments;
                        return buildDisplayRouteOperatorRecords(t, res.data || [], responseAssignments, users);
                    } catch (e) {
                        console.error(`Error fetching operators for task ${t.id}:`, e);
                        return buildDisplayRouteOperatorRecords(t, [], selectedAssignments, users);
                    }
                })
            );
            const allOps = results.flat();
            setRouteOperators(allOps);

            // Compute total hours and cost across all tasks
            const totalHours = allOps.reduce((sum, r) => sum + (r.actual_hours || 0), 0);
            setOperatorsSummary({
                total_hours: Math.round(totalHours * 100) / 100
            });
        } catch (err: any) {
            console.error("Error fetching job order operators:", err);
        } finally {
            if (!silent) setLoadingOperators(false);
        }
    }, [selectedJobOrder, users]);

    // Load Branches List
    const loadBranches = async () => {
        try {
            const res = await fetch(`/api/manufacturing/procurement/qa-receiving?action=branches`);
            if (res.ok) {
                const data = await res.json();
                setBranches(data);
            }
        } catch (e) {
            console.error("Error loading branches in production workflow hook:", e);
        }
    };

    // Initial Load
    useEffect(() => {
        fetchJobs();
        loadUsersList();
        loadBranches();
    }, []);

    // Establish Realtime SSE (Server-Sent Events) Connection for inventory movements
    useEffect(() => {
        let eventSource: EventSource | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let isDisposed = false;
        let reconnectAttempts = 0;

        const connectSSE = () => {
            if (isDisposed) return;
            if (reconnectAttempts >= 10) {
                console.warn("[Production Realtime SSE] Maximum reconnect attempts reached (10). Standing by.");
                return;
            }

            try {
                eventSource = new EventSource("/api/manufacturing/inventory/movements/stream");

                eventSource.addEventListener("movement", (event) => {
                    try {
                        const movement = JSON.parse(event.data);
                        console.log(`[Production Realtime SSE] Inventory movement detected (ID: ${movement.movement_id}). Refreshing active job orders...`);
                        
                        // Silent reload to update active job orders
                        fetchJobs(undefined, true);
                    } catch (e) {
                        console.error("[Production Realtime SSE] Error parsing movement event data:", e);
                    }
                });

                eventSource.onerror = () => {
                    if (eventSource) {
                        eventSource.close();
                        eventSource = null;
                    }
                    if (!isDisposed && reconnectAttempts < 10) {
                        reconnectAttempts++;
                        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                        reconnectTimeout = setTimeout(connectSSE, delay);
                    }
                };

            } catch (err) {
                console.error("[Production Realtime SSE] Error initializing EventSource:", err);
                if (!isDisposed && reconnectAttempts < 10) {
                    reconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                    reconnectTimeout = setTimeout(connectSSE, delay);
                }
            }
        };

        connectSSE();

        return () => {
            isDisposed = true;
            if (eventSource) {
                eventSource.close();
            }
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
        };
    }, [fetchJobs]);

    // Selection Side Effects
    useEffect(() => {
        if (selectedJobOrder && sortedTasks.length > 0) {
            const inCurrentJo = sortedTasks.some((t) => t.id === selectedTaskId);
            if (selectedTaskId === null || !inCurrentJo) {
                const nextActive = activeStep || sortedTasks[0];
                setSelectedTaskId(nextActive.id);
            }
        } else {
            setSelectedTaskId(null);
        }
    }, [selectedJobOrderId, selectedJobOrder, sortedTasks, activeStep, selectedTaskId]);

    useEffect(() => {
        const jobOrderId = selectedJobOrder?.order_id || selectedJobOrder?.job_order_id;
        if (!jobOrderId) {
            setJobOrderMaterials([]);
            setLoadingJobOrderMaterials(false);
            return;
        }

        let disposed = false;
        setLoadingJobOrderMaterials(true);
        void fetchJobOrderMaterials(jobOrderId)
            .then((materials) => {
                if (!disposed) setJobOrderMaterials(materials);
            })
            .catch((error: any) => {
                if (!disposed) {
                    setJobOrderMaterials([]);
                    console.error("Error fetching Job Order material batches:", error);
                }
            })
            .finally(() => {
                if (!disposed) setLoadingJobOrderMaterials(false);
            });

        return () => {
            disposed = true;
        };
    }, [selectedJobOrder]);

    useEffect(() => {
        if (sortedTasks.length > 0) {
            fetchJobOrderOperators(sortedTasks);
            setActiveManualUserId(null);
            setManualHours("");
        } else {
            setRouteOperators([]);
            setOperatorsSummary({ total_hours: 0 });
        }
    }, [selectedJobOrderId, sortedTasks, fetchJobOrderOperators]);

    // Auto-refresh operators logs inside all tasks (every 10 seconds for live updates, silently)
    useEffect(() => {
        if (sortedTasks.length === 0) return;
        const interval = setInterval(() => {
            fetchJobOrderOperators(sortedTasks, true);
        }, 10000);
        return () => clearInterval(interval);
    }, [sortedTasks, fetchJobOrderOperators]);

    // Clock In / Check In Operator
    const handleAddOperator = async (startTimer: boolean, taskId: number, assigneeId: string) => {
        if (!taskId || !assigneeId || !selectedJobOrder) return;
        if (!isJobOrderStatus(selectedJobOrder.status, JOB_ORDER_STATUS.IN_PRODUCTION)) {
            toast.error("Operators can only be assigned while the Job Order is In Production.");
            return;
        }
        const uId = parseInt(assigneeId);
        const userObj = users.find((u) => (u.user_id || u.id) === uId);
        if (!userObj) return;

        const action = startTimer ? "start-timer" : "log-hours";
        const taskObj = sortedTasks.find(t => t.id === taskId);

        try {
            const response = await manageRouteOperator({
                action,
                taskId: taskId,
                userId: uId,
                joId: selectedJobOrder.jo_id,
                routingId: taskObj?.routing_id || 0,
                actualHours: 0,
                hourlyRate: userObj.hourly_rate || userObj.rate || 150
            });

            toast.success(
                startTimer
                    ? `${userObj.user_fname || userObj.first_name} clocked in successfully.`
                    : `${userObj.user_fname || userObj.first_name} added to team log.`
            );
            await fetchJobOrderOperators(
                sortedTasks,
                false,
                response?.assignedPersonnel ?? response?.assignmentState?.assignedPersonnel
            );
            await fetchJobs(selectedJobOrder.jo_id, true);
        } catch (err: any) {
            toast.error(err.message || "Failed to add operator to task log.");
        }
    };

    // Remove Operator from the active roster while preserving historical logs.
    const handleRemoveOperator = async (
        taskId: number,
        opUserId: number,
        changeReason = "",
        requestId = createOperatorRequestId("remove-operator", taskId, opUserId)
    ): Promise<boolean> => {
        if (!selectedJobOrder) return false;
        if (!isJobOrderStatus(selectedJobOrder.status, JOB_ORDER_STATUS.IN_PRODUCTION)) {
            toast.error("Operators can only be changed while the Job Order is In Production.");
            return false;
        }
        try {
            const response = await manageRouteOperator({
                action: "remove-operator",
                taskId: taskId,
                userId: opUserId,
                joId: selectedJobOrder.jo_id,
                changeReason,
                requestId
            });
            toast.success("Operator removed from step.");
            await fetchJobOrderOperators(
                sortedTasks,
                false,
                response?.assignedPersonnel ?? response?.assignmentState?.assignedPersonnel
            );
            await fetchJobs(selectedJobOrder.jo_id, true);
            return true;
        } catch (err: any) {
            toast.error(err.message || "Failed to remove operator.");
            return false;
        }
    };

    // Replace an operator without deleting the existing labor record.
    const handleSwapOperator = async (
        taskId: number,
        opUserId: number,
        replacementUserId: number,
        changeReason = "",
        requestId = createOperatorRequestId("swap-operator", taskId, opUserId)
    ) => {
        if (!selectedJobOrder) return false;
        if (!isJobOrderStatus(selectedJobOrder.status, JOB_ORDER_STATUS.IN_PRODUCTION)) {
            toast.error("Operators can only be changed while the Job Order is In Production.");
            return false;
        }
        const taskObj = sortedTasks.find((task) => task.id === taskId);
        try {
            const response = await manageRouteOperator({
                action: "swap-operator",
                taskId,
                userId: opUserId,
                joId: selectedJobOrder.jo_id,
                routingId: taskObj?.routing_id || 0,
                replacementUserId,
                changeReason,
                requestId
            });
            toast.success("Operator reassigned successfully.");
            await fetchJobOrderOperators(
                sortedTasks,
                false,
                response?.assignedPersonnel ?? response?.assignmentState?.assignedPersonnel
            );
            await fetchJobs(selectedJobOrder.jo_id, true);
            return true;
        } catch (err: any) {
            toast.error(err.message || "Failed to reassign operator.");
            return false;
        }
    };

    // Start Shift Timer for existing Operator
    const handleStartTimer = async (taskId: number, opUserId: number) => {
        if (!selectedJobOrder) return;
        if (!isJobOrderStatus(selectedJobOrder.status, JOB_ORDER_STATUS.IN_PRODUCTION)) {
            toast.error("A shift timer can only start while the Job Order is In Production.");
            return;
        }
        const taskObj = sortedTasks.find(t => t.id === taskId);
        try {
            const response = await manageRouteOperator({
                action: "start-timer",
                taskId: taskId,
                userId: opUserId,
                joId: selectedJobOrder.jo_id,
                routingId: taskObj?.routing_id || 0
            });
            toast.success("Shift timer started.");
            await fetchJobOrderOperators(
                sortedTasks,
                false,
                response?.assignedPersonnel ?? response?.assignmentState?.assignedPersonnel
            );
            await fetchJobs(selectedJobOrder.jo_id, true);
        } catch (err: any) {
            toast.error(err.message || "Failed to start shift.");
        }
    };

    // Stop Shift Timer for Operator
    const handleStopTimer = async (taskId: number, opUserId: number) => {
        if (!selectedJobOrder) return;
        const taskObj = sortedTasks.find(t => t.id === taskId);
        try {
            const response = await manageRouteOperator({
                action: "stop-timer",
                taskId: taskId,
                userId: opUserId,
                joId: selectedJobOrder.jo_id,
                routingId: taskObj?.routing_id || 0
            });
            toast.success("Shift clocked out successfully.");
            await fetchJobOrderOperators(
                sortedTasks,
                false,
                response?.assignedPersonnel ?? response?.assignmentState?.assignedPersonnel
            );
            await fetchJobs(selectedJobOrder.jo_id, true);
        } catch (err: any) {
            toast.error(err.message || "Failed to stop shift.");
        }
    };

    // Manual Hours Entry Save
    const handleSaveManualHours = async (
        taskId: number,
        opUserId: number,
        hoursStr: string,
        changeReason = "",
        requestId = createOperatorRequestId("edit-hours", taskId, opUserId)
    ): Promise<boolean> => {
        if (!selectedJobOrder || !hoursStr) return false;
        if (!isJobOrderStatus(selectedJobOrder.status, JOB_ORDER_STATUS.IN_PRODUCTION)) {
            toast.error("Production hours can only be logged while the Job Order is In Production.");
            return false;
        }
        const parsedHours = parseFloat(hoursStr);
        if (isNaN(parsedHours) || parsedHours < 0) {
            toast.error("Please enter a valid positive number of hours.");
            return false;
        }
        const taskObj = sortedTasks.find(t => t.id === taskId);

        try {
            const response = await manageRouteOperator({
                action: "edit-hours",
                taskId: taskId,
                userId: opUserId,
                joId: selectedJobOrder.jo_id,
                routingId: taskObj?.routing_id || 0,
                actualHours: parsedHours,
                changeReason,
                requestId
            });
            toast.success("Operator hours updated successfully.");
            await fetchJobOrderOperators(
                sortedTasks,
                false,
                response?.assignedPersonnel ?? response?.assignmentState?.assignedPersonnel
            );
            await fetchJobs(selectedJobOrder.jo_id, true);
            return true;
        } catch (err: any) {
            toast.error(err.message || "Failed to record manual hours.");
            return false;
        }
    };

    // Edit the latest completed operator session using Philippine wall-clock times.
    const handleSaveOperatorTimes = async (
        taskId: number,
        opUserId: number,
        routeOperatorId: number,
        startedAt: string,
        stoppedAt: string,
        changeReason = "",
        requestId = createOperatorRequestId("edit-times", taskId, opUserId)
    ): Promise<boolean> => {
        if (!selectedJobOrder || !startedAt || routeOperatorId <= 0) return false;
        if (!isJobOrderStatus(selectedJobOrder.status, JOB_ORDER_STATUS.IN_PRODUCTION)) {
            toast.error("Operator times can only be edited while the Job Order is In Production.");
            return false;
        }

        const taskObj = sortedTasks.find(t => t.id === taskId);
        try {
            const response = await manageRouteOperator({
                action: "edit-times",
                taskId,
                userId: opUserId,
                joId: selectedJobOrder.jo_id,
                routeOperatorId,
                routingId: taskObj?.routing_id || 0,
                startedAt,
                stoppedAt,
                changeReason,
                requestId
            });
            toast.success("Operator Time In and Time Out updated successfully.");
            await fetchJobOrderOperators(
                sortedTasks,
                false,
                response?.assignedPersonnel ?? response?.assignmentState?.assignedPersonnel
            );
            await fetchJobs(selectedJobOrder.jo_id, true);
            return true;
        } catch (err: any) {
            toast.error(err.message || "Failed to update operator times.");
            return false;
        }
    };

    // Complete a route after the terminal confirmation dialog has been accepted.
    // QA-required routes use the same explicit completion path as every other route;
    // the separate QA inspection workflow remains available in the manufacturing QA module.
    const completeRouteStep = async (taskId: number): Promise<boolean> => {
        const task = sortedTasks.find((item) => item.id === taskId);
        if (!task || !selectedJobOrder) return false;

        if (!isJobOrderStatus(selectedJobOrder.status, JOB_ORDER_STATUS.IN_PRODUCTION)) {
            toast.error("Routing steps can only be progressed while the Job Order is In Production.");
            return false;
        }

        const taskOps = routeOperators.filter((op) => op.task_id === taskId);
        if (taskOps.some((op) => op.started_at !== null && op.stopped_at === null)) {
            toast.warning("Cannot complete routing step while operators have active running shifts. Please clock them out first.");
            return false;
        }

        try {
            const totalHours = taskOps.reduce((sum, operator) => sum + (operator.actual_hours || 0), 0);
            await patchRoutingTask({
                taskId,
                taskPatch: {
                    status: "Completed",
                    completed_at: new Date().toISOString(),
                    actual_run_hours: Math.round(totalHours * 100) / 100
                }
            });
            toast.success(`Routing step "${task.name}" completed.`);
            await fetchJobs(selectedJobOrder.jo_id, true);
            return true;
        } catch (err: any) {
            toast.error(err.message || "Failed to complete routing step.");
            return false;
        }
    };

    const [releasingDraft, setReleasingDraft] = useState(false);

    const handleReleaseDraftJO = async () => {
        if (!selectedJobOrder) return;
        setReleasingDraft(true);
        try {
            const res = await fetch("/api/manufacturing/planning-engineering", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "release-draft",
                    joId: selectedJobOrder.order_id
                })
            });

            const data = await res.json();
            if (!res.ok || data.success === false) {
                const shortfallMsg = data.error || "Failed to release Job Order.";
                if (window.confirm(`${shortfallMsg}\n\nDo you want to forcibly release this Job Order anyway?`)) {
                    const forceRes = await fetch("/api/manufacturing/planning-engineering", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "release-draft",
                            joId: selectedJobOrder.order_id,
                            forceRelease: true
                        })
                    });
                    const forceData = await forceRes.json();
                    if (!forceRes.ok || forceData.success === false) {
                        throw new Error(forceData.error || "Failed to forcibly release Job Order.");
                    }
                    toast.success("Job Order initialized and ready for material picking!");
                    fetchJobs(selectedJobOrderId);
                    return;
                }
                return;
            }

            toast.success("Job Order initialized and ready for material picking!");
            fetchJobs(selectedJobOrderId);
        } catch (err: any) {
            console.error("Error releasing Draft JO:", err);
            toast.error(err.message || "An error occurred during release.");
        } finally {
            setReleasingDraft(false);
        }
    };

    const openCancellationModal = useCallback(async (mode: "cancel" | "return", joId?: string) => {
        const targetJoId = joId || selectedJobOrder?.jo_id;
        if (!targetJoId) return;
        setCancellationMode(mode);
        setCancellationModalOpen(true);
        setCancellationPreview(null);
        setCancellationError(null);
        setLoadingCancellation(true);
        try {
            const preview = await fetchJobOrderCancellationPreview(targetJoId);
            setCancellationPreview(preview);
        } catch (err: any) {
            setCancellationError(err.message || "Failed to load the cancellation preview.");
        } finally {
            setLoadingCancellation(false);
        }
    }, [selectedJobOrder]);

    const handleConfirmCancellation = useCallback(async (reason: string, cancellationImage?: File | null) => {
        if (!cancellationPreview) return;
        if (cancellationMode === "cancel" && !cancellationImage) {
            setCancellationError("A cancellation evidence image is required.");
            return;
        }
        setSubmittingCancellation(true);
        setCancellationError(null);
        try {
            const response = cancellationMode === "cancel"
                ? await cancelJobOrder(cancellationPreview.jobOrderId, reason, cancellationImage as File)
                : await returnJobOrderMaterials(cancellationPreview.jobOrderId, reason);
            toast.success(
                cancellationMode === "cancel"
                    ? `Job Order ${response.jobOrderNo} cancelled. Returned ${response.returnedQuantity.toLocaleString()} unit(s) to MAIN-STORE.`
                    : `Returned ${response.returnedQuantity.toLocaleString()} unit(s) from Job Order ${response.jobOrderNo} to MAIN-STORE.`
            );
            setCancellationModalOpen(false);
            setCancellationPreview(null);
            fetchJobs(cancellationPreview.jobOrderNo, true);
        } catch (err: any) {
            setCancellationError(err.message || "Failed to process the Job Order cancellation.");
        } finally {
            setSubmittingCancellation(false);
        }
    }, [cancellationPreview, cancellationMode, fetchJobs]);

    const handleWorkflowAction = useCallback(async (
        action: Extract<JobOrderWorkflowAction, "place-on-hold" | "resume-production" | "complete-production" | "terminate-production">,
        input: { remarks?: string; resolutionRemarks?: string; terminationImage?: File | null } = {}
    ): Promise<boolean> => {
        if (!selectedJobOrder) return false;
        const jobOrderId = selectedJobOrder.order_id || selectedJobOrder.job_order_id;
        if (!jobOrderId) {
            toast.error("The selected Job Order has no valid identifier.");
            return false;
        }

        setWorkflowSubmitting(true);
        try {
            await executeJobOrderWorkflow(jobOrderId, {
                action,
                ...input
            });
            const successMessage: Record<typeof action, string> = {
                "place-on-hold": "Production placed on hold.",
                "resume-production": "Production resumed.",
                "complete-production": "Production completed and sent directly to QA and reconciliation.",
                "terminate-production": "Production terminated. Remaining WIP is ready for reconciliation or return."
            };
            toast.success(successMessage[action]);
            await fetchJobs(selectedJobOrder.jo_id, true);
            return true;
        } catch (err: any) {
            toast.error(err.message || "Failed to execute the Job Order workflow action.");
            return false;
        } finally {
            setWorkflowSubmitting(false);
        }
    }, [selectedJobOrder, fetchJobs]);

    const filteredJobOrders = useMemo(() => {
        return terminalJobOrders.filter((jo) => {
            const matchesSearch =
                jo.jo_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                jo.product_name.toLowerCase().includes(searchQuery.toLowerCase());

            if (!matchesSearch) return false;

            // Branch filter check
            if (selectedBranchFilter !== "All" && Number(jo.branch_id) !== Number(selectedBranchFilter)) {
                return false;
            }

            if (selectedProductFilter !== "All" && String(jo.product_id) !== selectedProductFilter) {
                return false;
            }

            if (selectedStatusFilter !== "All" && normalizeJobOrderStatus(jo.status) !== selectedStatusFilter) {
                return false;
            }

            if (
                selectedCustomerFilter !== "All"
                && !salesOrderLinksOf(jo).some((salesOrder: any) => String(salesOrder?.customer_code || "").trim() === selectedCustomerFilter)
            ) {
                return false;
            }

            return true;
        });
    }, [terminalJobOrders, searchQuery, selectedBranchFilter, selectedProductFilter, selectedStatusFilter, selectedCustomerFilter, salesOrderLinksOf]);

    const hasActiveFilters =
        searchQuery.trim().length > 0
        || selectedBranchFilter !== "All"
        || selectedProductFilter !== "All"
        || selectedCustomerFilter !== "All"
        || selectedStatusFilter !== "All";

    const clearFilters = useCallback(() => {
        setSearchQuery("");
        setSelectedBranchFilter("All");
        setSelectedProductFilter("All");
        setSelectedCustomerFilter("All");
        setSelectedStatusFilter("All");
    }, []);

    return {
        jobOrders,
        users,
        selectedJobOrderId,
        setSelectedJobOrderId,
        selectedTaskId,
        setSelectedTaskId,
        routeOperators,
        operatorsSummary,
        loadingJobs,
        loadingOperators,
        searchQuery,
        setSearchQuery,
        inProductionJobOrders,
        selectedAssigneeId,
        setSelectedAssigneeId,
        manualHours,
        setManualHours,
        activeManualUserId,
        setActiveManualUserId,
        selectedJobOrder,
        sortedTasks,
        jobOrderMaterials,
        loadingJobOrderMaterials,
        activeStep,
        fetchJobs,
        handleAddOperator,
        handleRemoveOperator,
        handleSwapOperator,
        handleStartTimer,
        handleStopTimer,
        handleSaveManualHours,
        handleSaveOperatorTimes,
        completeRouteStep,
        filteredJobOrders,
        branches,
        selectedBranchFilter,
        setSelectedBranchFilter,
        selectedProductFilter,
        setSelectedProductFilter,
        selectedCustomerFilter,
        setSelectedCustomerFilter,
        selectedStatusFilter,
        setSelectedStatusFilter,
        productFilterOptions,
        customerFilterOptions,
        statusFilterOptions,
        hasActiveFilters,
        clearFilters,
        releasingDraft,
        handleReleaseDraftJO,
        cancellationModalOpen,
        setCancellationModalOpen,
        cancellationMode,
        cancellationPreview,
        loadingCancellation,
        submittingCancellation,
        cancellationError,
        openCancellationModal,
        handleConfirmCancellation,
        workflowSubmitting,
        handleWorkflowAction
    };
}
