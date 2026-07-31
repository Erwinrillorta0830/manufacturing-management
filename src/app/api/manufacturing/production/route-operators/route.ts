/* eslint-disable */
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Directus configuration
const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

const LOCAL_DB_PATH = path.join(process.cwd(), "src", "app", "api", "manufacturing", "production", "route-operators", "db.json");

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

// Read from the local JSON database (fallback)
function readLocalDb(): RouteOperatorRecord[] {
    try {
        if (!fs.existsSync(LOCAL_DB_PATH)) {
            fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
            fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify([]), "utf8");
            return [];
        }
        const data = fs.readFileSync(LOCAL_DB_PATH, "utf8");
        return JSON.parse(data);
    } catch (e) {
        console.error("Failed to read local route operators DB:", e);
        return [];
    }
}

// Write to the local JSON database (fallback)
function writeLocalDb(data: RouteOperatorRecord[]) {
    try {
        fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
        fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
        console.error("Failed to write local route operators DB:", e);
    }
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
                    } else {
                        rate = 150;
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

// GET handler
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const taskId = searchParams.get("taskId");
        const joId = searchParams.get("joId");
        const activeOnly = searchParams.get("activeOnly") === "true";

        let records: RouteOperatorRecord[] = [];
        let usingFallback = false;

        // If we only care about active timers, skip the Directus fetch completely
        if (activeOnly) {
            const localRecords = readLocalDb();
            records = localRecords.filter(r => r.started_at !== null && r.stopped_at === null);
            
            // Enrich records with user metadata
            const usersMap = await fetchUsersMap();
            const enrichedRecords = records.map(r => {
                const uId = Number(r.user_id);
                const userMeta = usersMap.get(uId) || { name: `Operator #${uId}`, position: "Operator", rate: r.hourly_rate || 150 };
                
                const rate = r.hourly_rate || userMeta.rate;
                const laborCost = r.labor_cost || (r.actual_hours * rate);

                return {
                    ...r,
                    user_name: userMeta.name,
                    user_position: userMeta.position,
                    hourly_rate: rate,
                    labor_cost: Math.round(laborCost * 100) / 100
                };
            });

            return NextResponse.json({
                data: enrichedRecords,
                summary: { total_hours: 0, total_labor_cost: 0 }
            });
        }

        try {
            let directusUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_route_operators?limit=-1`;
            if (taskId) {
                directusUrl += `&filter[jo_route_id][_eq]=${taskId}`;
            }

            const res = await fetch(directusUrl, { headers, cache: "no-store" });
            if (res.ok) {
                const json = await res.json();
                const raw = json.data || [];
                records = raw.map((r: any) => ({
                    id: r.jo_route_operator_id,
                    jo_id: joId || "",
                    routing_id: Number(taskId || 0),
                    task_id: Number(r.jo_route_id),
                    user_id: Number(r.operator_id),
                    started_at: null,
                    stopped_at: null,
                    actual_hours: Number(r.logged_hours || 0),
                    hourly_rate: Number(r.hourly_rate || 0),
                    labor_cost: Number(r.logged_hours || 0) * Number(r.hourly_rate || 0)
                }));
            } else {
                console.warn(`Directus returned status ${res.status}. Falling back to local JSON DB.`);
                usingFallback = true;
            }
        } catch (err) {
            console.error("Directus route operators fetch failed. Falling back to local JSON DB.", err);
            usingFallback = true;
        }

        // If local JSON fallback is needed or active timers exist locally, merge them
        const localRecords = readLocalDb();
        const activeLocalTimers = localRecords.filter(r => r.started_at !== null && r.stopped_at === null);
        
        if (taskId) {
            const matchedTimers = activeLocalTimers.filter(r => Number(r.task_id) === Number(taskId));
            records = [...records, ...matchedTimers];
        } else {
            records = [...records, ...activeLocalTimers];
        }

        if (usingFallback) {
            let fallbackRecords = localRecords;
            if (taskId) {
                fallbackRecords = fallbackRecords.filter(r => Number(r.task_id) === Number(taskId));
            }
            if (joId) {
                fallbackRecords = fallbackRecords.filter(r => r.jo_id === joId);
            }
            records = fallbackRecords;
        }

        // Enrich records with user metadata
        const usersMap = await fetchUsersMap();
        const enrichedRecords = records.map(r => {
            const uId = Number(r.user_id);
            const userMeta = usersMap.get(uId) || { name: `Operator #${uId}`, position: "Operator", rate: r.hourly_rate || 150 };
            
            const rate = r.hourly_rate || userMeta.rate;
            const laborCost = r.labor_cost || (r.actual_hours * rate);

            return {
                ...r,
                user_name: userMeta.name,
                user_position: userMeta.position,
                hourly_rate: rate,
                labor_cost: Math.round(laborCost * 100) / 100
            };
        });

        const totalHours = enrichedRecords.reduce((sum, r) => sum + (r.actual_hours || 0), 0);
        const totalLaborCost = enrichedRecords.reduce((sum, r) => sum + (r.labor_cost || 0), 0);

        return NextResponse.json({
            data: enrichedRecords,
            summary: {
                total_hours: Math.round(totalHours * 100) / 100,
                total_labor_cost: Math.round(totalLaborCost * 100) / 100
            }
        });
    } catch (e) {
        console.error("Error in route-operators GET API:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch route operators logs" }, { status: 500 });
    }
}

// POST handler
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, taskId, userId, joId, routingId, actualHours, hourlyRate } = body;

        if (!action) {
            return NextResponse.json({ error: "Missing required field 'action'" }, { status: 400 });
        }

        const usersMap = await fetchUsersMap();
        const userMeta = usersMap.get(Number(userId)) || { name: `Operator #${userId}`, position: "Operator", rate: 150 };
        const determinedRate = Number(hourlyRate || userMeta.rate);

        let records = readLocalDb();
        let directusSuccess = false;
        let resultRecord: any = null;

        if (action === "start-timer") {
            if (!taskId || !userId) {
                return NextResponse.json({ error: "Missing taskId or userId for start-timer" }, { status: 400 });
            }

            // Check if there is an active timer running locally
            const activeRecord = records.find(r => Number(r.task_id) === Number(taskId) && Number(r.user_id) === Number(userId) && r.started_at !== null && r.stopped_at === null);
            if (activeRecord) {
                return NextResponse.json({ success: true, message: "Timer already running", data: activeRecord });
            }

            const newRecord = {
                id: records.length > 0 ? Math.max(...records.map(r => r.id)) + 1 : 1,
                jo_id: joId || "",
                routing_id: Number(routingId || 0),
                task_id: Number(taskId),
                user_id: Number(userId),
                started_at: new Date().toISOString(),
                stopped_at: null,
                actual_hours: 0,
                hourly_rate: determinedRate,
                labor_cost: 0
            };

            // Save active timer locally
            records.push(newRecord);
            writeLocalDb(records);
            resultRecord = newRecord;
        } 
        else if (action === "stop-timer") {
            if (!taskId || !userId) {
                return NextResponse.json({ error: "Missing taskId or userId for stop-timer" }, { status: 400 });
            }

            // Find running timer locally
            const localIndex = records.findIndex(r => Number(r.task_id) === Number(taskId) && Number(r.user_id) === Number(userId) && r.started_at !== null && r.stopped_at === null);
            if (localIndex === -1) {
                return NextResponse.json({ error: "No running timer found locally for this operator and task" }, { status: 400 });
            }

            const activeRecord = records[localIndex];
            const stoppedAt = new Date().toISOString();
            const startMs = new Date(activeRecord.started_at!).getTime();
            const stopMs = new Date(stoppedAt).getTime();
            const elapsedHours = Math.max(0.01, (stopMs - startMs) / (1000 * 60 * 60)); // at least 0.01 hours
            
            const totalHours = Math.round(((activeRecord.actual_hours || 0) + elapsedHours) * 100) / 100;
            const cost = Math.round((totalHours * (activeRecord.hourly_rate || determinedRate)) * 100) / 100;

            // Remove active timer from local database
            records.splice(localIndex, 1);
            writeLocalDb(records);

            // Write completed log to Directus
            const dataPayload = {
                jo_route_id: Number(taskId),
                operator_id: Number(userId),
                logged_hours: totalHours,
                hourly_rate: determinedRate,
                logged_at: stoppedAt
            };

            // Check if there is an existing database record to update or overwrite
            let directusRecordId = null;
            try {
                const checkUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_route_operators?filter[jo_route_id][_eq]=${taskId}&filter[operator_id][_eq]=${userId}&limit=1`;
                const checkRes = await fetch(checkUrl, { headers, cache: "no-store" });
                if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    if (checkData.data && checkData.data.length > 0) {
                        directusRecordId = checkData.data[0].jo_route_operator_id;
                    }
                }
            } catch (err) {
                console.error("Directus existence check failed in stop-timer:", err);
            }

            try {
                const res = directusRecordId 
                    ? await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators/${directusRecordId}`, {
                          method: "PATCH",
                          headers,
                          body: JSON.stringify({
                              logged_hours: totalHours,
                              hourly_rate: determinedRate
                          })
                      })
                    : await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators`, {
                          method: "POST",
                          headers,
                          body: JSON.stringify(dataPayload)
                      });

                if (res.ok) {
                    const json = await res.json();
                    resultRecord = {
                        id: json.data.jo_route_operator_id,
                        jo_id: joId || "",
                        task_id: json.data.jo_route_id,
                        user_id: json.data.operator_id,
                        actual_hours: Number(json.data.logged_hours),
                        hourly_rate: Number(json.data.hourly_rate),
                        labor_cost: Number(json.data.logged_hours) * Number(json.data.hourly_rate)
                    };
                    directusSuccess = true;
                }
            } catch (err) {
                console.error("Directus write failed for stop-timer:", err);
            }

            if (!directusSuccess) {
                // If Directus write fails, save the completed log back locally
                const localRec = {
                    id: activeRecord.id,
                    jo_id: joId || "",
                    routing_id: Number(routingId || 0),
                    task_id: Number(taskId),
                    user_id: Number(userId),
                    started_at: null,
                    stopped_at: stoppedAt,
                    actual_hours: totalHours,
                    hourly_rate: determinedRate,
                    labor_cost: cost
                };
                records.push(localRec);
                writeLocalDb(records);
                resultRecord = localRec;
            }
        } 
        else if (action === "log-hours") {
            if (!taskId || !userId || actualHours === undefined) {
                return NextResponse.json({ error: "Missing required fields (taskId, userId, actualHours) for log-hours" }, { status: 400 });
            }

            const totalHours = Math.round(Number(actualHours) * 100) / 100;
            const cost = Math.round((totalHours * determinedRate) * 100) / 100;

            let directusRecordId = null;
            try {
                const checkUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_route_operators?filter[jo_route_id][_eq]=${taskId}&filter[operator_id][_eq]=${userId}&limit=1`;
                const checkRes = await fetch(checkUrl, { headers, cache: "no-store" });
                if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    if (checkData.data && checkData.data.length > 0) {
                        directusRecordId = checkData.data[0].jo_route_operator_id;
                    }
                }
            } catch (err) {
                console.error("Directus check failed in log-hours:", err);
            }

            const dataPayload = {
                jo_route_id: Number(taskId),
                operator_id: Number(userId),
                logged_hours: totalHours,
                hourly_rate: determinedRate,
                logged_at: new Date().toISOString()
            };

            try {
                const res = directusRecordId 
                    ? await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators/${directusRecordId}`, {
                          method: "PATCH",
                          headers,
                          body: JSON.stringify({
                              logged_hours: totalHours,
                              hourly_rate: determinedRate
                          })
                      })
                    : await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators`, {
                          method: "POST",
                          headers,
                          body: JSON.stringify(dataPayload)
                      });

                if (res.ok) {
                    const json = await res.json();
                    resultRecord = {
                        id: json.data.jo_route_operator_id,
                        jo_id: joId || "",
                        task_id: json.data.jo_route_id,
                        user_id: json.data.operator_id,
                        actual_hours: Number(json.data.logged_hours),
                        hourly_rate: Number(json.data.hourly_rate),
                        labor_cost: Number(json.data.logged_hours) * Number(json.data.hourly_rate)
                    };
                    directusSuccess = true;
                }
            } catch (err) {
                console.error("Directus save failed in log-hours:", err);
            }

            if (!directusSuccess) {
                const localIdx = records.findIndex(r => Number(r.task_id) === Number(taskId) && Number(r.user_id) === Number(userId));
                const localRec = {
                    id: localIdx > -1 ? records[localIdx].id : (records.length > 0 ? Math.max(...records.map(r => r.id)) + 1 : 1),
                    jo_id: joId || "",
                    routing_id: Number(routingId || 0),
                    task_id: Number(taskId),
                    user_id: Number(userId),
                    started_at: null,
                    stopped_at: null,
                    actual_hours: totalHours,
                    hourly_rate: determinedRate,
                    labor_cost: cost
                };

                if (localIdx > -1) {
                    records[localIdx] = localRec;
                } else {
                    records.push(localRec);
                }
                writeLocalDb(records);
                resultRecord = localRec;
            }
        } 
        else if (action === "remove-operator") {
            if (!taskId || !userId) {
                return NextResponse.json({ error: "Missing taskId or userId for remove-operator" }, { status: 400 });
            }

            let deletedFromDirectus = false;
            try {
                const checkUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_route_operators?filter[jo_route_id][_eq]=${taskId}&filter[operator_id][_eq]=${userId}&limit=1`;
                const checkRes = await fetch(checkUrl, { headers, cache: "no-store" });
                if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    if (checkData.data && checkData.data.length > 0) {
                        const directusRecordId = checkData.data[0].jo_route_operator_id;
                        const delRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators/${directusRecordId}`, {
                            method: "DELETE",
                            headers
                        });
                        if (delRes.ok) {
                            deletedFromDirectus = true;
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to delete record from Directus:", err);
            }

            // Clean up fallback local timers/logs too
            const filteredRecords = records.filter(r => !(Number(r.task_id) === Number(taskId) && Number(r.user_id) === Number(userId)));
            writeLocalDb(filteredRecords);

            return NextResponse.json({ success: true, deletedFromDirectus });
        }
        else {
            return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }

        const enrichedRecord = resultRecord ? {
            ...resultRecord,
            user_name: userMeta.name,
            user_position: userMeta.position,
            hourly_rate: Number(resultRecord.hourly_rate || determinedRate),
            labor_cost: Number(resultRecord.labor_cost || 0)
        } : null;

        return NextResponse.json({ success: true, data: enrichedRecord });
    } catch (e) {
        console.error("Error in route-operators POST API:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to process request" }, { status: 500 });
    }
}
