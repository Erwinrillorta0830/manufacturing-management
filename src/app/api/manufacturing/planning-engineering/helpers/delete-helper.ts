import { DIRECTUS_URL, headers, getJobOrderIdByNo } from "./shared";

export async function deleteJobOrder(joId: string): Promise<boolean> {
    try {
        const joInfo = await getJobOrderIdByNo(joId);
        if (!joInfo) return false;
        const joIdInt = joInfo.id;

        // 1. Delete associated routing operators and qa records
        const routesRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${joIdInt}&limit=-1&fields=jo_route_id,job_order_id,sequence_order,work_center_id,operation_id,planned_setup_hours,planned_run_hours,actual_setup_hours,actual_run_hours,step_batch_size,run_time_hours_factor`, { headers });
        if (routesRes.ok) {
            const routesList = (await routesRes.json()).data || [];
            for (const r of routesList) {
                // Delete route operators
                const opsRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators?filter[jo_route_id][_eq]=${r.jo_route_id}&limit=-1`, { headers });
                if (opsRes.ok) {
                    const opsList = (await opsRes.json()).data || [];
                    for (const o of opsList) {
                        await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators/${o.jo_route_operator_id}`, { method: "DELETE", headers }).catch(() => {});
                    }
                }
                // Delete QA records
                const qaRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records?filter[jo_route_id][_eq]=${r.jo_route_id}&limit=-1`, { headers });
                if (qaRes.ok) {
                    const qaList = (await qaRes.json()).data || [];
                    for (const q of qaList) {
                        await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records/${q.qa_record_id}`, { method: "DELETE", headers }).catch(() => {});
                    }
                }
                // Delete route step
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes/${r.jo_route_id}`, { method: "DELETE", headers }).catch(() => {});
            }
        }

        // Delete manufacturing_job_order_materials
        const matRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${joIdInt}&limit=-1`, { headers });
        if (matRes.ok) {
            const mats = (await matRes.json()).data || [];

            // Reservations reference the material worksheet rows, so remove
            // them before deleting those rows. This keeps a failed create /
            // initialize attempt from leaving live reservations behind.
            const materialIds = mats
                .map((material: { jo_material_id?: number | string | null; id?: number | string | null }) => Number(material.jo_material_id || material.id || 0))
                .filter((materialId: number) => materialId > 0);
            if (materialIds.length > 0) {
                const reservationRes = await fetch(
                    `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_in]=${materialIds.join(",")}&fields=jo_materials_reservation_id,id&limit=-1`,
                    { headers }
                );
                if (reservationRes.ok) {
                    const reservations = (await reservationRes.json()).data || [];
                    for (const reservation of reservations) {
                        const reservationId = reservation.jo_materials_reservation_id || reservation.id;
                        if (reservationId) {
                            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations/${reservationId}`, { method: "DELETE", headers }).catch(() => {});
                        }
                    }
                } else {
                    console.error("[Manufacturing Directus API] Failed to find Job Order material reservations during cleanup:", reservationRes.status);
                }
            }

            for (const m of mats) {
                const materialId = m.jo_material_id || m.id;
                if (materialId) {
                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${materialId}`, { method: "DELETE", headers }).catch(() => {});
                }
            }
        }

        // Delete manufacturing_job_order_allocations
        const allocRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[job_order_id][_eq]=${joIdInt}&limit=-1`, { headers });
        if (allocRes.ok) {
            const allocs = (await allocRes.json()).data || [];
            for (const a of allocs) {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations/${a.id}`, { method: "DELETE", headers }).catch(() => {});
            }
        }

        // Delete header
        const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joIdInt}`, { method: "DELETE", headers });
        return res.ok;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to delete job order:", e);
        return false;
    }
}
