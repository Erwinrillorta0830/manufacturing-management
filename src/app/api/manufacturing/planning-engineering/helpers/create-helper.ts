/* eslint-disable */
import { DIRECTUS_URL, headers, DirectusJobOrder, getUomCountForProduct } from "./shared";
import { getBOMDetailsForVersion, getActiveVersionForProduct } from "../../finished-goods/versions/versions-helper";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";


export async function createJobOrder(joData: Partial<DirectusJobOrder>, salesOrderIds?: number[]): Promise<{ jo_id?: string | null }> {
    try {
        const todayStr = await getTodayDateString();
        let productsList = joData.products || [];
        if (productsList.length === 0 && joData.product_id) {
            productsList = [{
                product_id: joData.product_id,
                product_name: joData.product_name,
                quantity: joData.quantity,
                bom: joData.bom
            }];
        }

        const mergedProducts: Record<string, any> = {};
        for (const p of productsList) {
            const pId = Number(p.product_id);
            let versionId = (p as any).bom?.version || (p as any).bom?.bom_id || (p as any).bom?.version_id || null;
            if (!versionId && salesOrderIds && salesOrderIds.length > 0) {
                try {
                    const soId = salesOrderIds[0];
                    const soRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, { headers });
                    if (soRes.ok) {
                        const so = (await soRes.json()).data;
                        const customerCode = so?.customer_code;
                        if (customerCode) {
                            const custRes = await fetch(`${DIRECTUS_URL}/items/customer?filter[customer_code][_eq]=${encodeURIComponent(customerCode)}&limit=1`, { headers });
                            if (custRes.ok) {
                                const customer = (await custRes.json()).data?.[0];
                                const customerId = customer?.id || customer?.customer_id;
                                if (customerId) {
                                    const activeVer = await getActiveVersionForProduct(pId, Number(customerId));
                                    versionId = activeVer.version?.version_id || null;
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to resolve customer override during creation:", err);
                }
            }
            if (!versionId) {
                const activeVer = await getActiveVersionForProduct(pId);
                versionId = activeVer.version?.version_id || null;
            }
            const key = `${pId}-${versionId || 'default'}`;
            if (!mergedProducts[key]) {
                mergedProducts[key] = {
                    product_id: pId,
                    product_name: p.product_name || `Product #${pId}`,
                    quantity: 0,
                    bom: versionId ? { version_id: versionId } : null
                };
            }
            mergedProducts[key].quantity += Number(p.quantity || 0);
        }
        const finalProductsList = Object.values(mergedProducts);
        const totalMergedQuantity = finalProductsList.reduce((sum, p) => sum + Number(p.quantity || 0), 0);

        const firstProd = finalProductsList[0];
        if (!firstProd) throw new Error("No products selected for Job Order");

        let versionId = firstProd.bom?.version_id;
        if (!versionId && salesOrderIds && salesOrderIds.length > 0) {
            try {
                const soId = salesOrderIds[0];
                const soRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, { headers });
                if (soRes.ok) {
                    const so = (await soRes.json()).data;
                    const customerCode = so?.customer_code;
                    if (customerCode) {
                        const custRes = await fetch(`${DIRECTUS_URL}/items/customer?filter[customer_code][_eq]=${encodeURIComponent(customerCode)}&limit=1`, { headers });
                        if (custRes.ok) {
                            const customer = (await custRes.json()).data?.[0];
                            const customerId = customer?.id || customer?.customer_id;
                            if (customerId) {
                                const activeVer = await getActiveVersionForProduct(firstProd.product_id, Number(customerId));
                                versionId = activeVer.version?.version_id;
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to resolve customer override for first product:", err);
            }
        }
        if (!versionId) {
            const activeVer = await getActiveVersionForProduct(firstProd.product_id);
            versionId = activeVer.version?.version_id;
        }

        // Dry-Run BOM Explosion & Raw Material Stock Verification
        const shortfalls: Array<{ name: string; required: number; available: number; shortage: number }> = [];
        
        for (const p of finalProductsList) {
            const pId = p.product_id;
            let pVersionId = p.bom?.version_id;
            if (!pVersionId) {
                const activeVer = await getActiveVersionForProduct(pId);
                pVersionId = activeVer.version?.version_id || null;
            }

            const { version, routes } = pVersionId 
                ? await getBOMDetailsForVersion(pId, pVersionId)
                : await getActiveVersionForProduct(pId);

            if (version && version.status && (version.status as string) !== "Active" && (version.status as string) !== "Approved") {
                throw new Error(`Cannot create Job Order for Product '${p.product_name}': Version '${version.version_name || pVersionId}' is not yet approved (Status: ${version.status}).`);
            }
            
            const components: any[] = [];
            if (routes && routes.length > 0) {
                for (const r of routes) {
                    if (r.bom_items && r.bom_items.length > 0) {
                        components.push(...r.bom_items);
                    }
                }
            }
            
            let productionQty = Number(p.quantity);
            if (version && version.product_id && Number(version.product_id) !== Number(pId)) {
                const pCount = await getUomCountForProduct(pId);
                if (pCount > 0) {
                    productionQty = Math.ceil(productionQty / pCount);
                }
            }

            if (components.length > 0) {
                for (const bItem of components) {
                    const compProductId = Number(bItem.product_id);
                    const wastage = 1 + (Number(bItem.wastage_factor_percentage || 0) / 100);
                    const baseQuantity = Number(version?.base_quantity || 1);
                    const quantityRequired = (productionQty * Number(bItem.quantity_required || 0) * wastage) / baseQuantity;

                    // Verify if it has an active version (making it a sub-assembly)
                    const compActiveVer = await getActiveVersionForProduct(compProductId);
                    const isSubAssembly = compActiveVer && compActiveVer.version;

                    if (!isSubAssembly) {
                        // This is a raw material! Verify its available stock in purchase_order_receiving
                        const branchFilter = joData.branch_id ? `&filter[branch_id][_eq]=${Number(joData.branch_id)}` : "";
                        const receiptsUrl = `${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${compProductId}&filter[qa_status][_in]=Passed,Partially Accepted&filter[is_reverted][_eq]=0&filter[received_quantity][_gt]=0${branchFilter}&sort=expiry_date`;
                        
                        const receiptsRes = await fetch(receiptsUrl, { headers, cache: "no-store" });
                        const validReceipts = receiptsRes.ok ? (await receiptsRes.json()).data || [] : [];
                        
                        const receiptIds = validReceipts.map((r: any) => r.purchase_order_product_id).filter(Boolean);
                        const reservationsMap: Record<number, number> = {};
                        if (receiptIds.length > 0) {
                            try {
                                const resRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter[purchase_order_receiving_id][_in]=${receiptIds.join(",")}&fields=purchase_order_receiving_id,reserved_quantity&limit=-1`, { headers, cache: "no-store" });
                                if (resRes.ok) {
                                    const resData = (await resRes.json()).data || [];
                                    resData.forEach((r: any) => {
                                        const porId = Number(r.purchase_order_receiving_id?.id || r.purchase_order_receiving_id);
                                        if (porId) {
                                            reservationsMap[porId] = (reservationsMap[porId] || 0) + Number(r.reserved_quantity || 0);
                                        }
                                    });
                                }
                            } catch (err) {
                                console.error("Error checking reservations in dry-run:", err);
                            }
                        }

                        if (!joData.branch_id) {
                            throw new Error("Cannot verify stock: Job Order is missing branch_id");
                        }
                        const branchId = Number(joData.branch_id);

                        // Fetch inventory movements to calculate the true ledger stock
                        const movFilter = encodeURIComponent(JSON.stringify({
                            _and: [
                                { product_id: { _eq: compProductId } },
                                { branch_id: { _eq: branchId } }
                            ]
                        }));
                        const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?filter=${movFilter}&limit=-1`, { headers, cache: "no-store" });
                        const movements = movRes.ok ? (await movRes.json()).data || [] : [];
                        const movementStockMap = new Map<string, number>();
                        movements.forEach((mov: any) => {
                            const batchNo = mov.batch_no || "LOT-N/A";
                            const qty = Number(mov.quantity || 0);
                            movementStockMap.set(batchNo, (movementStockMap.get(batchNo) || 0) + qty);
                        });

                        let netAvailable = 0;
                        for (const rec of validReceipts) {
                            const lotNo = rec.lot_no || rec.batch_no || "LOT-N/A";
                            const physicalQty = movementStockMap.get(lotNo) || 0;
                            const recId = Number(rec.purchase_order_product_id);
                            const alreadyReserved = reservationsMap[recId] || 0;
                            netAvailable += Math.max(0, physicalQty - alreadyReserved);
                        }

                        if (netAvailable < quantityRequired) {
                            const shortage = quantityRequired - netAvailable;
                            let prodName = `Product #${compProductId}`;
                            try {
                                const prodRes = await fetch(`${DIRECTUS_URL}/items/products/${compProductId}?fields=product_name`, { headers });
                                if (prodRes.ok) {
                                    prodName = (await prodRes.json()).data?.product_name || prodName;
                                }
                            } catch (err) {
                                console.error("Failed to fetch product name for shortfall error:", err);
                            }
                            shortfalls.push({
                                name: prodName,
                                required: quantityRequired,
                                available: netAvailable,
                                shortage
                            });
                        }
                    }
                }
            }
        }

        let initialStatus = joData.status || "Draft";
        if (initialStatus === "Shortage") initialStatus = "Draft";
        else if (initialStatus === "Proceed") initialStatus = "Released";
        else if (initialStatus === "Ongoing") initialStatus = "In Progress";
        else if (initialStatus === "Finished") initialStatus = "Completed";

        let forcedDraftRemarks = "";
        if (shortfalls.length > 0) {
            console.log("[createJobOrder] Shortfall detected. Forcing status to Draft. shortfalls:", shortfalls);
            initialStatus = "Draft";
            const shortfallMsg = shortfalls.map(s => 
                `${s.name} (Shortfall: ${s.shortage.toFixed(2)} units)`
            ).join("; ");
            forcedDraftRemarks = ` | Saved as Draft due to raw material shortfalls: ${shortfallMsg}`;
        }

        // 3. Insert header
        const headerPayload = {
            job_order_no: joData.jo_id || `JO-${Math.floor(100000 + Math.random() * 900000)}`,
            product_id: firstProd.product_id,
            version_id: versionId || null,
            target_quantity: Number(totalMergedQuantity),
            actual_quantity_produced: 0,
            start_date: todayStr,
            end_date: joData.due_date || null,
            status: initialStatus,
            shift_option: joData.shift_option || "8",
            created_by: joData.created_by ? Number(joData.created_by) : null,
            created_at: new Date().toISOString(),
            remarks: (joData.remarks || `Consolidated production run. Shift: ${joData.shift_option || "8"}`) + forcedDraftRemarks,
            parent_job_order_id: joData.parent_job_order_id ? Number(joData.parent_job_order_id) : null,
            branch_id: joData.branch_id ? Number(joData.branch_id) : null
        };

        const headerRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders`, {
            method: "POST",
            headers,
            body: JSON.stringify(headerPayload)
        });
        if (!headerRes.ok) {
            const txt = await headerRes.text();
            throw new Error(`Failed to create job_order header: ${headerRes.status} - ${txt}`);
        }

        const createdJo = (await headerRes.json()).data;
        const joIdInt = createdJo.job_order_id;
        const joNoStr = createdJo.job_order_no;

        // 4. Insert merged product(s) and explode BOM/routings
        let totalEstimatedHours = 0;
        for (const p of finalProductsList) {
            const { version, routes } = versionId 
                ? await getBOMDetailsForVersion(p.product_id, versionId)
                : await getActiveVersionForProduct(p.product_id);

            let productionQty = Number(p.quantity);
            if (version && version.product_id && Number(version.product_id) !== Number(p.product_id)) {
                try {
                    const originalUomCount = await getUomCountForProduct(Number(p.product_id));
                    const targetUomCount = await getUomCountForProduct(Number(version.product_id));
                    productionQty = productionQty * (originalUomCount / targetUomCount);
                } catch (e) {
                    console.error("Error scaling quantity for job order product variant:", e);
                }
            }

            const baseQuantity = Number(version?.base_quantity || 1);

            if (routes && routes.length > 0) {
                for (const r of routes) {
                    const plannedSetup = Number(r.setup_time_hours || 0);
                    const plannedRun = (productionQty / Number(r.step_batch_size || 1)) * Number(r.run_time_hours || 0);
                    totalEstimatedHours += (plannedSetup + plannedRun);

                    // Insert into JO routes table
                    const routePayload = {
                        job_order_id: joIdInt,
                        sequence_order: Number(r.sequence_order || 0),
                        work_center_id: Number(r.work_center_id || 1),
                        operation_id: Number((r as any).operation_id || (r as any).id || 1),
                        planned_setup_hours: plannedSetup,
                        planned_run_hours: plannedRun,
                        actual_setup_hours: 0,
                        actual_run_hours: 0,
                        step_batch_size: Number(r.step_batch_size || 1),
                        run_time_hours_factor: Number(r.run_time_hours || 0)
                    };

                    const routeRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?fields=jo_route_id`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(routePayload)
                    });
                    if (routeRes.ok) {
                        const routeJson = await routeRes.json();
                        const newRouteId = routeJson.data?.jo_route_id;
                        if (newRouteId) {
                            const stepSeq = Number(r.sequence_order || 0);
                            const assignedUserIds = (joData as any).assignments?.[stepSeq] || [];
                            for (const uId of assignedUserIds) {
                                let userRate = 150;
                                try {
                                    const uRes = await fetch(`${DIRECTUS_URL}/items/user/${uId}?fields=hourly_rate`, { headers });
                                    if (uRes.ok) {
                                        const uData = (await uRes.json()).data;
                                        userRate = Number(uData?.hourly_rate || 150);
                                    }
                                } catch (e) {
                                    console.error("Error fetching user rate during creation:", e);
                                }

                                const assPayload = {
                                    jo_route_id: newRouteId,
                                    operator_id: Number(uId),
                                    logged_hours: 0,
                                    hourly_rate: userRate,
                                    logged_at: new Date().toISOString()
                                };
                                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators`, {
                                    method: "POST",
                                    headers,
                                    body: JSON.stringify(assPayload)
                                }).catch(err => console.error("Error creating route operator assignment:", err));
                            }
                        }
                    } else {
                        console.error("Error creating manufacturing_job_order_routes row:", await routeRes.text());
                    }

                    // Extract BOM items (materials)
                    if (r.bom_items && r.bom_items.length > 0) {
                        for (const bItem of r.bom_items) {
                            const compProductId = Number(bItem.product_id);
                            const wastage = 1 + (Number(bItem.wastage_factor_percentage || 0) / 100);
                            const baseQuantity = Number(version?.base_quantity || 1);
                            const quantityRequired = (productionQty * Number(bItem.quantity_required || 0) * wastage) / baseQuantity;

                             // Check if component is a sub-assembly
                             const activeVer = await getActiveVersionForProduct(compProductId);
                             const isSubAssembly = activeVer && activeVer.version;

                             let allocatedQty = 0;
                             const allocations: { purchase_order_product_id: number; batch_no?: string; allocated: number }[] = [];

                             if (isSubAssembly) {
                                  if (!joData.branch_id) {
                                      throw new Error("Cannot allocate sub-assembly: Job Order is missing branch_id");
                                  }
                                  const branchId = Number(joData.branch_id);

                                  // Fetch manufacturing yield ledger for this product to resolve QA status
                                  const yieldRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_eq]=${compProductId}&fields=*,job_order_id.product_id,job_order_id.job_order_no&limit=-1`, { headers, cache: "no-store" });
                                  const yields = yieldRes.ok ? (await yieldRes.json()).data || [] : [];
                                  const batchStatusMap = new Map<string, string>();
                                  yields.forEach((yl: any) => {
                                      const batchNo = String(yl.lot_number || `MFG-${yl.job_order_id?.job_order_no}`).trim() || "LOT-N/A";
                                      batchStatusMap.set(batchNo, yl.qa_status || "Pending");
                                  });

                                  // Fetch inventory movements to calculate the true ledger stock
                                  const movFilter = encodeURIComponent(JSON.stringify({
                                      _and: [
                                          { product_id: { _eq: compProductId } },
                                          { branch_id: { _eq: branchId } }
                                      ]
                                  }));
                                  const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?filter=${movFilter}&limit=-1`, { headers, cache: "no-store" });
                                  const movements = movRes.ok ? (await movRes.json()).data || [] : [];
                                  const movementStockMap = new Map<string, number>();
                                  movements.forEach((mov: any) => {
                                      const batchNo = mov.batch_no || "LOT-N/A";
                                      const qty = Number(mov.quantity || 0);
                                      movementStockMap.set(batchNo, (movementStockMap.get(batchNo) || 0) + qty);
                                  });

                                  let totalAvailableStock = 0;
                                  movementStockMap.forEach((qty, lotNum) => {
                                      if (qty > 0) {
                                          const status = batchStatusMap.get(lotNum) || "Passed"; // Default to Passed for legacy stock
                                          if (status === "Passed" || status === "Partially Accepted") {
                                              totalAvailableStock += qty;
                                          }
                                      }
                                  });

                                 // Calculate active reservations by other JOs on this sub-assembly
                                 const activeReservedFilter = encodeURIComponent(JSON.stringify({
                                     _and: [
                                         { product_id: { _eq: compProductId } },
                                         { job_order_id: { status: { _in: ["Proceed", "Ongoing", "On Hold", "Released", "In Progress"] } } }
                                     ]
                                 }));
                                 const activeReservedRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter=${activeReservedFilter}&fields=reserved_quantity&limit=-1`, { headers, cache: 'no-store' });
                                 const activeReservedData = activeReservedRes.ok ? (await activeReservedRes.json()).data || [] : [];
                                 const totalReservedByOthers = activeReservedData.reduce((sum: number, r: any) => sum + Number(r.reserved_quantity || 0), 0);

                                 const netAvailable = Math.max(0, totalAvailableStock - totalReservedByOthers);
                                 allocatedQty = Math.min(quantityRequired, netAvailable);
                             } else {
                                 // FIFO/FEFO Allocation directly from purchase_order_receiving
                                 const branchFilter = joData.branch_id ? `&filter[branch_id][_eq]=${Number(joData.branch_id)}` : "";
                                  const receiptsUrl = `${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${compProductId}&filter[qa_status][_in]=Passed,Partially Accepted&filter[is_reverted][_eq]=0&filter[received_quantity][_gt]=0${branchFilter}&sort=expiry_date`;
                                 
                                 const receiptsRes = await fetch(receiptsUrl, { headers, cache: 'no-store' });
                                 const validReceipts = receiptsRes.ok ? (await receiptsRes.json()).data || [] : [];
                                 
                                 const receiptIds = validReceipts.map((r: any) => r.purchase_order_product_id).filter(Boolean);
                                 const reservationsMap: Record<number, number> = {};

                                 if (receiptIds.length > 0) {
                                     try {
                                         const resFilter = encodeURIComponent(JSON.stringify({
                                             _and: [
                                                 { purchase_order_receiving_id: { _in: receiptIds } },
                                                 { jo_material_id: { job_order_id: { status: { _in: ["Planned", "Draft", "Released", "In Progress", "Ongoing", "Proceed", "On Hold"] } } } }
                                             ]
                                         }));
                                         const resRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter=${resFilter}&fields=purchase_order_receiving_id,reserved_quantity&limit=-1`, { headers, cache: 'no-store' });
                                         if (resRes.ok) {
                                             const reservationsData = (await resRes.json()).data || [];
                                             reservationsData.forEach((r: any) => {
                                                 const porId = Number(r.purchase_order_receiving_id);
                                                 if (porId) {
                                                     reservationsMap[porId] = (reservationsMap[porId] || 0) + Number(r.reserved_quantity || 0);
                                                 }
                                             });
                                         }
                                     } catch (err) {
                                         console.error("Error fetching material reservations:", err);
                                     }
                                 }

                                 // Fetch inventory movements to calculate the true ledger stock
                                 if (!joData.branch_id) {
                                     throw new Error("Cannot allocate raw materials: Job Order is missing branch_id");
                                 }
                                 const branchId = Number(joData.branch_id);
                                 const movFilter = encodeURIComponent(JSON.stringify({
                                     _and: [
                                         { product_id: { _eq: compProductId } },
                                         { branch_id: { _eq: branchId } }
                                     ]
                                 }));
                                 const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?filter=${movFilter}&limit=-1`, { headers, cache: "no-store" });
                                 const movements = movRes.ok ? (await movRes.json()).data || [] : [];
                                 const movementStockMap = new Map<string, number>();
                                 movements.forEach((mov: any) => {
                                     const batchNo = mov.batch_no || "LOT-N/A";
                                     const qty = Number(mov.quantity || 0);
                                     movementStockMap.set(batchNo, (movementStockMap.get(batchNo) || 0) + qty);
                                 });

                                 for (const rec of validReceipts) {
                                     if (allocatedQty >= quantityRequired) break;

                                     const lotNo = rec.lot_no || rec.batch_no || "LOT-N/A";
                                     const physicalQty = movementStockMap.get(lotNo) || 0;
                                     const recId = Number(rec.purchase_order_product_id);
                                     const alreadyReserved = reservationsMap[recId] || 0;
                                     const netAvailable = Math.max(0, physicalQty - alreadyReserved);

                                     if (netAvailable <= 0) continue;

                                     const needed = quantityRequired - allocatedQty;
                                     const taken = Math.min(netAvailable, needed);

                                     if (taken > 0) {
                                         allocatedQty += taken;
                                         allocations.push({
                                             purchase_order_product_id: recId,
                                             batch_no: lotNo,
                                             allocated: taken
                                         });
                                     }
                                 }
                             }

                            let uomId = Number((bItem as any).uom_id || 0);
                            if (!uomId) {
                                try {
                                    const pRes = await fetch(`${DIRECTUS_URL}/items/products/${compProductId}?fields=unit_of_measurement`, { headers });
                                    if (pRes.ok) {
                                        const pData = (await pRes.json()).data;
                                        const uomVal = pData?.unit_of_measurement;
                                        uomId = uomVal ? Number(uomVal.id || uomVal) : 1;
                                    }
                                } catch (e) {
                                    console.error("Error looking up UOM ID for component:", e);
                                    uomId = 1;
                                }
                            }

                            // Log Material Requirement (Single Row)
                            const matPayload = {
                                job_order_id: joIdInt,
                                product_id: compProductId,
                                uom_id: uomId || 1,
                                allocated_quantity: quantityRequired,
                                reserved_quantity: allocatedQty,
                                actual_consumed_quantity: 0,
                                scrap_quantity: 0
                            };
                            
                            const matRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials`, {
                                method: "POST",
                                headers,
                                body: JSON.stringify(matPayload)
                            });
                            
                            if (matRes.ok) {
                                const createdMat = (await matRes.json()).data;
                                const jomId = createdMat.jo_material_id || createdMat.id;
                                
                                // Now log specific lot allocations in the reservations junction table
                                for (const alloc of allocations) {
                                    const reservationPayload = {
                                        product_id: compProductId,
                                        branch_id: joData.branch_id ? Number(joData.branch_id) : null,
                                        batch_no: alloc.batch_no || null,
                                        jo_material_id: jomId,
                                        purchase_order_receiving_id: alloc.purchase_order_product_id || null,
                                        reserved_quantity: alloc.allocated,
                                        actual_used_quantity: 0,
                                        created_by: joData.created_by ? Number(joData.created_by) : null
                                    };
                                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations`, {
                                        method: "POST",
                                        headers,
                                        body: JSON.stringify(reservationPayload)
                                    }).catch(err => console.error("Error creating materials reservation row:", err));
                                }
                            } else {
                                console.error("Error creating manufacturing_job_order_materials row:", await matRes.text());
                            }

                            const shortfall = quantityRequired - allocatedQty;

                            // Auto-spawn child Job Orders for manufactured sub-assemblies with shortages
                            if (shortfall > 0) {
                                try {
                                    const subVerMap = (joData as any).subAssemblyVersionMap || (joData as any).sub_assembly_version_map || {};
                                    const selectedVerId = subVerMap[compProductId] || subVerMap[String(compProductId)];
                                    const activeVer = selectedVerId 
                                        ? await getBOMDetailsForVersion(compProductId, Number(selectedVerId))
                                        : await getActiveVersionForProduct(compProductId);

                                    if (activeVer && activeVer.version) {
                                        const subRoutes = activeVer.routes || [];
                                        const subBaseQty = Number(activeVer.version.base_quantity || 1);
                                        let subSetup = 0;
                                        let subRunPerUnit = 0;
                                        subRoutes.forEach((r: any) => {
                                            const stepBatch = Number(r.step_batch_size || 1);
                                            subSetup += Number(r.setup_time_hours || 0);
                                            subRunPerUnit += (Number(r.run_time_hours || 0) / stepBatch);
                                        });
                                        const subHours = subSetup + ((subRunPerUnit * shortfall) / subBaseQty);
                                        totalEstimatedHours += subHours;

                                        const childJoNo = `${joNoStr}-SUB${compProductId}`;
                                        const checkJoRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${childJoNo}&limit=1`, { headers });
                                        const alreadyExists = checkJoRes.ok ? ((await checkJoRes.json()).data || []).length > 0 : false;

                                        if (!alreadyExists) {
                                            console.log(`[Sub-Assembly Spawner] Auto-spawning child Job Order ${childJoNo} for product ID ${compProductId} (Qty: ${shortfall}, Version ID: ${activeVer.version.version_id}) with estimated hours: ${subHours.toFixed(1)}`);
                                            const childJoPayload = {
                                                jo_id: childJoNo,
                                                product_id: compProductId,
                                                quantity: shortfall,
                                                due_date: joData.due_date || null,
                                                status: joData.status || "Released",
                                                branch_id: joData.branch_id,
                                                created_by: joData.created_by,
                                                parent_job_order_id: joIdInt,
                                                shift_option: joData.shift_option || "8",
                                                remarks: `Auto-spawned sub-assembly run for parent Job Order ${joNoStr}`,
                                                bom: {
                                                    version_id: activeVer.version.version_id
                                                },
                                                subAssemblyVersionMap: subVerMap
                                            };
                                            await createJobOrder(childJoPayload, []);
                                        }
                                    }
                                } catch (subErr) {
                                    console.error(`[Sub-Assembly Spawner] Failed to spawn child JO for component ${compProductId}:`, subErr);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Calculate and generate daily breakdown runs based on total planned hours and shift option
        const shiftHours = Number(joData.shift_option || "8") || 8;
        const numDays = Math.ceil(totalEstimatedHours / shiftHours) || 1;
        const baseQtyPerDay = Math.floor(totalMergedQuantity / numDays);
        const remainder = totalMergedQuantity % numDays;

        const startDateStr = headerPayload.start_date || todayStr;
        const startDateParts = startDateStr.split("-");
        const startYear = parseInt(startDateParts[0], 10);
        const startMonth = parseInt(startDateParts[1], 10) - 1;
        const startDay = parseInt(startDateParts[2], 10);

        const dailyBreakdown = [];
        for (let i = 1; i <= numDays; i++) {
            const currentDate = new Date(startYear, startMonth, startDay + (i - 1));
            const yyyy = currentDate.getFullYear();
            const mm = String(currentDate.getMonth() + 1).padStart(2, "0");
            const dd = String(currentDate.getDate()).padStart(2, "0");
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const dayQty = baseQtyPerDay + (i <= remainder ? 1 : 0);
            dailyBreakdown.push({
                day: i,
                date: dateStr,
                status: "Pending",
                quantity: dayQty
            });
        }

        // Patch daily_breakdown to job order
        try {
            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joIdInt}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    daily_breakdown: dailyBreakdown
                })
            });
        } catch (dbErr) {
            console.error("Error updating daily breakdown on Job Order:", dbErr);
        }

        // 5. Insert junction entries (Sales Order allocations)
        if (salesOrderIds && salesOrderIds.length > 0) {
            for (const soId of salesOrderIds) {
                // Fetch all detail lines for this sales order and filter in-memory to match family products
                const detailsRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${soId}&limit=-1`, { headers });
                if (detailsRes.ok) {
                    const details = (await detailsRes.json()).data || [];
                    for (const det of details) {
                        const detProductId = Number(det.product_id);
                        let isMatch = detProductId === Number(firstProd.product_id);

                        if (!isMatch) {
                            try {
                                const prodCheckRes = await fetch(`${DIRECTUS_URL}/items/products/${detProductId}?fields=product_id,parent_id`, { headers });
                                if (prodCheckRes.ok) {
                                    const prodCheck = await prodCheckRes.json();
                                    const parentVal = prodCheck.data?.parent_id;
                                    const parentIdVal = parentVal && typeof parentVal === 'object' ? Number(parentVal.product_id) : (parentVal ? Number(parentVal) : null);
                                    if (parentIdVal === Number(firstProd.product_id)) {
                                        isMatch = true;
                                    }
                                }
                            } catch (e) {
                                console.error("Error checking product family hierarchy for allocation:", e);
                            }
                        }

                        if (isMatch) {
                            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations`, {
                                method: "POST",
                                headers,
                                body: JSON.stringify({
                                    job_order_id: joIdInt,
                                    jo_id: joNoStr,
                                    sales_order_detail_id: det.detail_id,
                                    allocated_quantity: Number(det.ordered_quantity || 0)
                                })
                            }).catch(err => console.error("Error creating manufacturing_job_order_allocations link:", err));

                            // Automatically update the sales order status to 'For Invoicing'
                            console.log(`[Manufacturing Directus API] Updating sales order status for details ${det.detail_id} to For Invoicing`);
                            try {
                                await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, {
                                    method: "PATCH",
                                    headers,
                                    body: JSON.stringify({ order_status: "For Invoicing" })
                                });
                            } catch (err) {
                                console.error("Failed to update parent sales order status:", err);
                            }
                        }
                    }
                }
            }
        }

        return { jo_id: joNoStr };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create job order:", e);
        throw e;
    }
}

