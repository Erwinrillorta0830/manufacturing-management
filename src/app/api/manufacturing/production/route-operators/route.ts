/* eslint-disable */
import { NextResponse } from "next/server";

// Directus configuration
const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

const COLLECTION = "manufacturing_job_order_route_operators";
const ROUTE_OPERATOR_FIELDS = "jo_route_operator_id,jo_route_id,operator_id,logged_hours,hourly_rate,logged_at,started_at,stopped_at";

interface RouteOperatorRecord {
    id: number;
    jo_id: string;
    routing_id: number;
    task_id: number;
    user_id: number;
    started_at: string | null;
    stopped_at: string | null;
    actual_hours: number;
    hourly_rate: number;
    labor_cost: number;
}

interface DirectusRouteOperator {
    jo_route_operator_id: number;
    jo_route_id: number;
    operator_id: number;
    logged_hours?: number | string | null;
    hourly_rate?: number | string | null;
    logged_at?: string | null;
    started_at?: string | null;
    stopped_at?: string | null;
}

class DirectusRouteOperatorError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "DirectusRouteOperatorError";
        this.status = status;
    }
}

function parseDirectusDateTime(value: string): number {
    const normalized = value.trim().includes("T") ? value.trim() : value.trim().replace(" ", "T");
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    return Date.parse(hasTimezone ? normalized : `${normalized}Z`);
}

async function directusRequest<T>(resource: string, init: RequestInit = {}): Promise<T> {
    if (!DIRECTUS_URL) {
        throw new DirectusRouteOperatorError(503, "Manufacturing Directus is not configured.");
    }

    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${resource}`, {
            ...init,
            headers,
            cache: "no-store"
        });
    } catch (error) {
        throw new DirectusRouteOperatorError(503, `Manufacturing Directus is unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }

    const text = await response.text();
    let payload: any = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        const detail = payload?.errors?.[0]?.message || payload?.error || text || response.statusText;
        throw new DirectusRouteOperatorError(response.status, `Directus route-operator request failed: ${detail}`);
    }

    return payload as T;
}

function recordsUrl(taskId?: number, userId?: number, activeOnly = false): string {
    const params = new URLSearchParams({ limit: "-1", fields: ROUTE_OPERATOR_FIELDS });
    if (taskId !== undefined) params.set("filter[jo_route_id][_eq]", String(taskId));
    if (userId !== undefined) params.set("filter[operator_id][_eq]", String(userId));
    if (activeOnly) {
        params.set("filter[started_at][_nnull]", "true");
        params.set("filter[stopped_at][_null]", "true");
    }
    return `/items/${COLLECTION}?${params.toString()}`;
}

async function fetchDirectusRecords(taskId?: number, userId?: number, activeOnly = false): Promise<DirectusRouteOperator[]> {
    const payload = await directusRequest<{ data?: DirectusRouteOperator[] }>(recordsUrl(taskId, userId, activeOnly));
    return Array.isArray(payload?.data) ? payload.data : [];
}

async function findDirectusRecord(taskId: number, userId: number, activeOnly = false): Promise<DirectusRouteOperator | null> {
    const records = await fetchDirectusRecords(taskId, userId, activeOnly);
    return records[0] || null;
}

function mapDirectusRecord(record: DirectusRouteOperator, joId = ""): RouteOperatorRecord {
    const actualHours = Number(record.logged_hours || 0);
    const hourlyRate = Number(record.hourly_rate || 0);
    return {
        id: Number(record.jo_route_operator_id),
        jo_id: joId,
        routing_id: Number(record.jo_route_id),
        task_id: Number(record.jo_route_id),
        user_id: Number(record.operator_id),
        started_at: record.started_at || null,
        stopped_at: record.stopped_at || null,
        actual_hours: actualHours,
        hourly_rate: hourlyRate,
        labor_cost: Math.round(actualHours * hourlyRate * 100) / 100
    };
}

function responseRecord(payload: { data?: DirectusRouteOperator } | null, joId: string): RouteOperatorRecord {
    if (!payload?.data) {
        throw new DirectusRouteOperatorError(502, "Directus returned no route-operator record.");
    }
    return mapDirectusRecord(payload.data, joId);
}

// Fetch all users to resolve their metadata (names, rates, positions)
async function fetchUsersMap(): Promise<Map<number, { name: string; position: string; rate: number }>> {
    const userMap = new Map<number, { name: string; position: string; rate: number }>();
    try {
        const url = `${DIRECTUS_URL}/items/user?limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (res.ok) {
            const data = await res.json();
            const users = data.data || [];
            users.forEach((u: any) => {
                const uId = Number(u.user_id || u.id);
                const fname = u.user_fname || u.first_name || "";
                const lname = u.user_lname || u.last_name || "";
                const fullName = `${fname} ${lname}`.trim() || `User #${uId}`;
                const position = u.user_position || u.position || "Operator";

                let rate = 150;
                if (u.hourly_rate !== undefined && u.hourly_rate !== null) {
                    rate = Number(u.hourly_rate);
                } else if (u.rate !== undefined && u.rate !== null) {
                    rate = Number(u.rate);
                } else {
                    const posLower = position.toLowerCase();
                    if (posLower.includes("manager") || posLower.includes("lead") || posLower.includes("supervisor")) {
                        rate = 250;
                    } else if (posLower.includes("qa") || posLower.includes("qc") || posLower.includes("inspector")) {
                        rate = 180;
                    }
                }

                userMap.set(uId, { name: fullName, position, rate });
            });
        }
    } catch (err) {
        console.error("Failed to fetch users for metadata mapping:", err);
    }
    return userMap;
}

async function enrichRecords(records: RouteOperatorRecord[]): Promise<RouteOperatorRecord[]> {
    const usersMap = await fetchUsersMap();
    return records.map(record => {
        const userMeta = usersMap.get(Number(record.user_id)) || {
            name: `Operator #${record.user_id}`,
            position: "Operator",
            rate: record.hourly_rate || 150
        };
        const rate = record.hourly_rate || userMeta.rate;
        const laborCost = record.actual_hours * rate;
        return {
            ...record,
            user_name: userMeta.name,
            user_position: userMeta.position,
            hourly_rate: rate,
            labor_cost: Math.round(laborCost * 100) / 100
        } as RouteOperatorRecord;
    });
}

function errorResponse(error: unknown, fallbackMessage: string) {
    if (error instanceof DirectusRouteOperatorError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : fallbackMessage }, { status: 500 });
}

// GET handler
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const taskIdParam = searchParams.get("taskId");
        const taskId = taskIdParam === null ? undefined : Number(taskIdParam);
        const joId = searchParams.get("joId") || "";
        const activeOnly = searchParams.get("activeOnly") === "true";

        if (taskId !== undefined && (!Number.isInteger(taskId) || taskId <= 0)) {
            return NextResponse.json({ error: "taskId must be a positive integer" }, { status: 400 });
        }

        const directusRecords = await fetchDirectusRecords(taskId, undefined, activeOnly);
        const records = directusRecords.map(record => mapDirectusRecord(record, joId));
        const enrichedRecords = await enrichRecords(records);
        const totalHours = enrichedRecords.reduce((sum, record) => sum + record.actual_hours, 0);
        const totalLaborCost = enrichedRecords.reduce((sum, record) => sum + record.labor_cost, 0);

        return NextResponse.json({
            data: enrichedRecords,
            summary: {
                total_hours: Math.round(totalHours * 100) / 100,
                total_labor_cost: Math.round(totalLaborCost * 100) / 100
            }
        });
    } catch (error) {
        console.error("Error in route-operators GET API:", error);
        return errorResponse(error, "Failed to fetch route operators logs");
    }
}

// POST handler
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null) as Record<string, any> | null;
        if (!body || typeof body !== "object") {
            return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
        }

        const action = String(body.action || "");
        if (!action) {
            return NextResponse.json({ error: "Missing required field 'action'" }, { status: 400 });
        }

        const taskId = Number(body.taskId);
        const userId = Number(body.userId);
        if (!Number.isInteger(taskId) || taskId <= 0 || !Number.isInteger(userId) || userId <= 0) {
            return NextResponse.json({ error: "taskId and userId must be positive integers" }, { status: 400 });
        }

        const joId = String(body.joId || "");
        const usersMap = await fetchUsersMap();
        const userMeta = usersMap.get(userId) || { name: `Operator #${userId}`, position: "Operator", rate: 150 };
        const requestedRate = Number(body.hourlyRate);
        const determinedRate = Number.isFinite(requestedRate) && requestedRate > 0 ? requestedRate : userMeta.rate;

        if (action === "start-timer") {
            const activeRecord = await findDirectusRecord(taskId, userId, true);
            if (activeRecord) {
                return NextResponse.json({
                    success: true,
                    message: "Timer already running",
                    data: {
                        ...mapDirectusRecord(activeRecord, joId),
                        user_name: userMeta.name,
                        user_position: userMeta.position,
                        hourly_rate: determinedRate
                    }
                });
            }

            const now = new Date().toISOString();
            const existingRecord = await findDirectusRecord(taskId, userId);
            const payload = {
                started_at: now,
                stopped_at: null,
                hourly_rate: determinedRate,
                logged_at: now
            };
            const saved = existingRecord
                ? await directusRequest<{ data?: DirectusRouteOperator }>(`/items/${COLLECTION}/${existingRecord.jo_route_operator_id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload)
                })
                : await directusRequest<{ data?: DirectusRouteOperator }>(`/items/${COLLECTION}`, {
                    method: "POST",
                    body: JSON.stringify({
                        jo_route_id: taskId,
                        operator_id: userId,
                        logged_hours: 0,
                        ...payload
                    })
                });
            const mapped = responseRecord(saved, joId);
            return NextResponse.json({
                success: true,
                data: {
                    ...mapped,
                    user_name: userMeta.name,
                    user_position: userMeta.position,
                    hourly_rate: determinedRate,
                    labor_cost: 0
                }
            });
        }

        if (action === "stop-timer") {
            const activeRecord = await findDirectusRecord(taskId, userId, true);
            if (!activeRecord) {
                return NextResponse.json({ error: "No running timer found for this operator and task" }, { status: 400 });
            }

            const startedAt = activeRecord.started_at ? parseDirectusDateTime(activeRecord.started_at) : Number.NaN;
            if (!Number.isFinite(startedAt)) {
                return NextResponse.json({ error: "The active timer has no valid start time" }, { status: 409 });
            }

            const stoppedAt = new Date().toISOString();
            const elapsedHours = Math.max(0.01, (Date.now() - startedAt) / (1000 * 60 * 60));
            const totalHours = Math.round((Number(activeRecord.logged_hours || 0) + elapsedHours) * 100) / 100;
            const hourlyRate = Number(activeRecord.hourly_rate || determinedRate);
            const saved = await directusRequest<{ data?: DirectusRouteOperator }>(`/items/${COLLECTION}/${activeRecord.jo_route_operator_id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    logged_hours: totalHours,
                    hourly_rate: hourlyRate,
                    stopped_at: stoppedAt,
                    logged_at: stoppedAt
                })
            });
            const mapped = responseRecord(saved, joId);
            return NextResponse.json({
                success: true,
                data: {
                    ...mapped,
                    user_name: userMeta.name,
                    user_position: userMeta.position
                }
            });
        }

        if (action === "log-hours") {
            if (body.actualHours === undefined) {
                return NextResponse.json({ error: "Missing required field actualHours for log-hours" }, { status: 400 });
            }

            const totalHours = Math.round(Number(body.actualHours) * 100) / 100;
            if (!Number.isFinite(totalHours) || totalHours < 0) {
                return NextResponse.json({ error: "actualHours must be a non-negative number" }, { status: 400 });
            }

            const now = new Date().toISOString();
            const existingRecord = await findDirectusRecord(taskId, userId);
            const saved = existingRecord
                ? await directusRequest<{ data?: DirectusRouteOperator }>(`/items/${COLLECTION}/${existingRecord.jo_route_operator_id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        logged_hours: totalHours,
                        hourly_rate: determinedRate,
                        logged_at: now
                    })
                })
                : await directusRequest<{ data?: DirectusRouteOperator }>(`/items/${COLLECTION}`, {
                    method: "POST",
                    body: JSON.stringify({
                        jo_route_id: taskId,
                        operator_id: userId,
                        logged_hours: totalHours,
                        hourly_rate: determinedRate,
                        logged_at: now,
                        started_at: null,
                        stopped_at: null
                    })
                });
            const mapped = responseRecord(saved, joId);
            return NextResponse.json({
                success: true,
                data: {
                    ...mapped,
                    user_name: userMeta.name,
                    user_position: userMeta.position
                }
            });
        }

        if (action === "remove-operator") {
            const existingRecord = await findDirectusRecord(taskId, userId);
            if (existingRecord) {
                await directusRequest(`/items/${COLLECTION}/${existingRecord.jo_route_operator_id}`, { method: "DELETE" });
            }
            return NextResponse.json({ success: true, deletedFromDirectus: Boolean(existingRecord) });
        }

        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (error) {
        console.error("Error in route-operators POST API:", error);
        return errorResponse(error, "Failed to process request");
    }
}
