/* eslint-disable */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { JobOrder, User, RouteOperatorRecord, QATemplate, QATemplateParameter, RoutingTask, JobOrderCancellationPreview } from "../types";
import {
    fetchJobOrders,
    fetchUsersList as apiFetchUsers,
    fetchRouteOperators,
    manageRouteOperator,
    patchRoutingTask,
    fetchQATemplate,
    submitQAVerification,
    fetchJobOrderCancellationPreview,
    cancelJobOrder,
    returnJobOrderMaterials,
    executeJobOrderWorkflow
} from "../services/production-api";
import { isJobOrderStatus, JOB_ORDER_STATUS } from "../../job-order-status";
import type { JobOrderWorkflowAction } from "../../job-order-workflow";

export function useProductionWorkflow() {
    const searchParams = useSearchParams();
    // --- State Variables ---
    const [jobOrders, setJobOrders] = useState<JobOrder[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedJobOrderId, setSelectedJobOrderId] = useState<string>("");
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

    // Operator logs for the selected task
    const [routeOperators, setRouteOperators] = useState<RouteOperatorRecord[]>([]);
    const [operatorsSummary, setOperatorsSummary] = useState({ total_hours: 0 });
    
    // UI states
    const [loadingJobs, setLoadingJobs] = useState(true);
    const [loadingOperators, setLoadingOperators] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [branches, setBranches] = useState<any[]>([]);
    const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("All");
    const [pendingDeepLinkJo, setPendingDeepLinkJo] = useState<string | null>(null);
    const selectedJobOrderIdRef = useRef(selectedJobOrderId);

    useEffect(() => {
        selectedJobOrderIdRef.current = selectedJobOrderId;
    }, [selectedJobOrderId]);

    // Operator Assignment State
    const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("");
    const [manualHours, setManualHours] = useState<string>("");
    const [activeManualUserId, setActiveManualUserId] = useState<number | null>(null);

    // QA Checklist Modal States
    const [qaModalOpen, setQaModalOpen] = useState(false);
    const [qaTemplate, setQaTemplate] = useState<QATemplate | null>(null);
    const [qaParameters, setQaParameters] = useState<QATemplateParameter[]>([]);
    const [qaValues, setQaValues] = useState<Record<number, string>>({});
    const [qaInspectorId, setQaInspectorId] = useState<string>("");
    const [qaYieldQty, setQaYieldQty] = useState<string>("");
    const [qaComments, setQaComments] = useState<string>("");
    const [submittingQA, setSubmittingQA] = useState(false);

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

    // Deep link support: /mm/production-workflow?jo=JO-XXXX selects the Job Order.
    useEffect(() => {
        const joParam = searchParams.get("jo");
        if (joParam) setPendingDeepLinkJo(joParam);
    }, [searchParams]);

    useEffect(() => {
        if (!pendingDeepLinkJo || loadingJobs) return;
        const match = terminalJobOrders.find((jo) => jo.jo_id === pendingDeepLinkJo);
        if (match) {
            setSelectedJobOrderId(match.jo_id);
            setSelectedTaskId(null);
        } else {
            toast.info("Only staged or In Production Job Orders can be opened in this terminal.");
        }
        setPendingDeepLinkJo(null);
    }, [pendingDeepLinkJo, loadingJobs, terminalJobOrders]);

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
    const fetchJobOrderOperators = useCallback(async (tasks: RoutingTask[], silent = false) => {
        if (tasks.length === 0) {
            setRouteOperators([]);
            setOperatorsSummary({ total_hours: 0 });
            return;
        }
        if (!silent) setLoadingOperators(true);
        try {
            const results = await Promise.all(
                tasks.map(async (t) => {
                    try {
                        const res = await fetchRouteOperators(t.id);
                        return res.data || [];
                    } catch (e) {
                        console.error(`Error fetching operators for task ${t.id}:`, e);
                        return [];
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
    }, []);

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
            await manageRouteOperator({
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
            fetchJobOrderOperators(sortedTasks);
        } catch (err: any) {
            toast.error(err.message || "Failed to add operator to task log.");
        }
    };

    // Remove / Check Out Operator
    const handleRemoveOperator = async (taskId: number, opUserId: number) => {
        try {
            await manageRouteOperator({
                action: "remove-operator",
                taskId: taskId,
                userId: opUserId
            });
            toast.success("Operator removed from step.");
            fetchJobOrderOperators(sortedTasks);
        } catch (err: any) {
            toast.error(err.message || "Failed to remove operator.");
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
            await manageRouteOperator({
                action: "start-timer",
                taskId: taskId,
                userId: opUserId,
                joId: selectedJobOrder.jo_id,
                routingId: taskObj?.routing_id || 0
            });
            toast.success("Shift timer started.");
            fetchJobOrderOperators(sortedTasks);
        } catch (err: any) {
            toast.error(err.message || "Failed to start shift.");
        }
    };

    // Stop Shift Timer for Operator
    const handleStopTimer = async (taskId: number, opUserId: number) => {
        if (!selectedJobOrder) return;
        const taskObj = sortedTasks.find(t => t.id === taskId);
        try {
            await manageRouteOperator({
                action: "stop-timer",
                taskId: taskId,
                userId: opUserId,
                joId: selectedJobOrder.jo_id,
                routingId: taskObj?.routing_id || 0
            });
            toast.success("Shift clocked out successfully.");
            fetchJobOrderOperators(sortedTasks);
        } catch (err: any) {
            toast.error(err.message || "Failed to stop shift.");
        }
    };

    // Manual Hours Entry Save
    const handleSaveManualHours = async (taskId: number, opUserId: number, hoursStr: string) => {
        if (!selectedJobOrder || !hoursStr) return;
        if (!isJobOrderStatus(selectedJobOrder.status, JOB_ORDER_STATUS.IN_PRODUCTION)) {
            toast.error("Production hours can only be logged while the Job Order is In Production.");
            return;
        }
        const parsedHours = parseFloat(hoursStr);
        if (isNaN(parsedHours) || parsedHours < 0) {
            toast.error("Please enter a valid positive number of hours.");
            return;
        }
        const taskObj = sortedTasks.find(t => t.id === taskId);

        try {
            await manageRouteOperator({
                action: "log-hours",
                taskId: taskId,
                userId: opUserId,
                joId: selectedJobOrder.jo_id,
                routingId: taskObj?.routing_id || 0,
                actualHours: parsedHours
            });
            toast.success("Hours logged successfully.");
            fetchJobOrderOperators(sortedTasks);
        } catch (err: any) {
            toast.error(err.message || "Failed to record manual hours.");
        }
    };

    // Direct completion without QA
    const handleDirectCompleteStep = async (taskObj: RoutingTask) => {
        try {
            const taskOps = routeOperators.filter((op) => op.task_id === taskObj.id);
            const totalHours = taskOps.reduce((sum, r) => sum + (r.actual_hours || 0), 0);

            await patchRoutingTask({
                taskId: taskObj.id,
                taskPatch: {
                    status: "Completed",
                    completed_at: new Date().toISOString(),
                    actual_run_hours: Math.round(totalHours * 100) / 100
                }
            });
            toast.success(`Routing step "${taskObj.name}" completed.`);
            fetchJobs();
        } catch (err: any) {
            toast.error(err.message || "Failed to complete routing step.");
        }
    };

    // Complete button dispatcher
    const handleCompleteStepClick = async (taskId: number) => {
        const task = sortedTasks.find(t => t.id === taskId);
        if (!task || !selectedJobOrder) return;

        if (!isJobOrderStatus(selectedJobOrder.status, JOB_ORDER_STATUS.IN_PRODUCTION)) {
            toast.error("Routing steps can only be progressed while the Job Order is In Production.");
            return;
        }

        setSelectedTaskId(taskId);

        const taskOps = routeOperators.filter((op) => op.task_id === taskId);
        const hasRunningTimers = taskOps.some((op) => op.started_at !== null && op.stopped_at === null);
        if (hasRunningTimers) {
            toast.warning("Cannot complete routing step while operators have active running shifts. Please clock them out first.");
            return;
        }

        if (task.requires_qa === 1) {
            setQaYieldQty(String(selectedJobOrder.quantity));
            setQaComments("");
            setQaInspectorId(taskOps[0] ? String(taskOps[0].user_id) : "");
            
            try {
                const data = await fetchQATemplate(task.name, selectedJobOrder.product_id, task.qa_template_id);
                setQaTemplate(data.template);
                
                let params = data.parameters || [];
                if (params.length === 0) {
                    params = [{
                        parameter_id: 9999,
                        template_id: data.template?.template_id || 0,
                        test_name: "Yield & Process Control Validation",
                        test_type: "Numeric",
                        min_value: Math.floor(selectedJobOrder.quantity * 0.9),
                        max_value: Math.ceil(selectedJobOrder.quantity * 1.1),
                        target_value: String(selectedJobOrder.quantity),
                        is_critical: true
                    }];
                }
                setQaParameters(params);
                
                const vals: Record<number, string> = {};
                params.forEach((p: any) => {
                    if (p.test_type === "Boolean" || p.test_type === "Yes/No") {
                        vals[p.parameter_id] = "true";
                    } else if (p.test_type === "Numeric") {
                        vals[p.parameter_id] = p.target_value || "";
                    } else {
                        vals[p.parameter_id] = "";
                    }
                });
                setQaValues(vals);
                setQaModalOpen(true);
            } catch (err: any) {
                toast.error(err.message || "Failed to load matching QA Template.");
            }
        } else {
            await handleDirectCompleteStep(task);
        }
    };

    // QA Verification Form Submit Handler
    const handleSubmitQA = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTask || !selectedJobOrder) return;

        setSubmittingQA(true);
        try {
            const verifications = qaParameters.map((p) => {
                const rawVal = qaValues[p.parameter_id];
                let isFailed = false;
                let parsedVal: string | number | boolean = rawVal;

                if (p.test_type === "Numeric") {
                    const num = parseFloat(rawVal);
                    parsedVal = isNaN(num) ? 0 : num;
                    if (p.min_value !== null && num < p.min_value) isFailed = true;
                    if (p.max_value !== null && num > p.max_value) isFailed = true;
                } else if (p.test_type === "Boolean" || p.test_type === "Yes/No") {
                    isFailed = rawVal !== "true";
                    parsedVal = rawVal === "true";
                } else {
                    isFailed = !rawVal || rawVal.trim().length === 0;
                }

                return {
                    parameter_id: p.parameter_id,
                    test_name: p.test_name || p.parameter_name || "Check",
                    value: parsedVal,
                    min_value: p.min_value,
                    max_value: p.max_value,
                    target_value: p.target_value,
                    is_failed: isFailed,
                    is_critical: !!p.is_critical
                };
            });

            const qaResult = await submitQAVerification({
                action: "verify",
                joId: selectedJobOrder.jo_id,
                taskId: selectedTask.id,
                taskName: selectedTask.name,
                productName: selectedJobOrder.product_name,
                expectedQty: selectedJobOrder.quantity,
                actualQty: parseFloat(qaYieldQty) || selectedJobOrder.quantity,
                verifications,
                comments: qaComments,
                userId: qaInspectorId ? parseInt(qaInspectorId) : null
            });

            if (qaResult.onHold) {
                toast.error("⚠️ Critical parameter failure detected! Job Order has been placed ON HOLD. Contact a supervisor for disposition.", { duration: 8000 });
                setQaModalOpen(false);
                fetchJobs();
            } else {
                const patchRes = await fetch("/api/manufacturing/planning-engineering", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        taskId: selectedTask.id,
                        taskPatch: {
                            status: "Completed",
                            completed_at: new Date().toISOString(),
                            actual_run_hours: operatorsSummary.total_hours
                        }
                    })
                });

                if (!patchRes.ok) {
                    console.warn("QA passed, but failed to sync final actual labor cost details.");
                }

                toast.success("Quality inspection passed and routing step completed!");
                setQaModalOpen(false);
                fetchJobs();
            }
        } catch (err: any) {
            toast.error(err.message || "Failed to submit QA audit.");
        } finally {
            setSubmittingQA(false);
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
        input: { remarks?: string; resolutionRemarks?: string } = {}
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

            return true;
        });
    }, [terminalJobOrders, searchQuery, selectedBranchFilter]);

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
        qaModalOpen,
        setQaModalOpen,
        qaTemplate,
        qaParameters,
        qaValues,
        setQaValues,
        qaInspectorId,
        setQaInspectorId,
        qaYieldQty,
        setQaYieldQty,
        qaComments,
        setQaComments,
        submittingQA,
        selectedJobOrder,
        sortedTasks,
        activeStep,
        selectedTask,
        fetchJobs,
        handleAddOperator,
        handleRemoveOperator,
        handleStartTimer,
        handleStopTimer,
        handleSaveManualHours,
        handleCompleteStepClick,
        handleSubmitQA,
        filteredJobOrders,
        branches,
        selectedBranchFilter,
        setSelectedBranchFilter,
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
