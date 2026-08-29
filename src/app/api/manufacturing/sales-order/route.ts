/* eslint-disable */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";
import {
    addSalesOrderFilters,
    enrichSalesOrderReadModel,
    fetchDetailsForOrders,
    findScheduledDetailIds,
    SALES_ORDER_FIELDS
} from "./_read";
import {
    salesOrderPatchSchema,
    salesOrderPostSchema,
    validationIssues
} from "./_validation";
import { selectPreferredActiveVersion } from "../finished-goods/versions/versions-helper";
import {
    SALES_ORDER_TRANSITIONS,
    LEGACY_STATUS_MAP,
    mapStatus,
} from "./_status";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

async function getSystemTimeISOString() {
    return await getISOStringInConfiguredTimezone();
}

class ApiError extends Error {
    constructor(public status: number, message: string, public details?: Record<string, unknown>) {
        super(message);
    }
}

async function resolveCustomerProductVersions(customerId: number, productIds: number[]) {
    const uniqueProductIds = [...new Set(productIds)];
    const overrideParams = new URLSearchParams({
        "filter[customer_id][_eq]": String(customerId),
        "filter[product_id][_in]": uniqueProductIds.join(","),
        fields: "product_id,version_id",
        limit: "-1"
    });
    const overrideRes = await fetch(`${DIRECTUS_URL}/items/customer_product_version?${overrideParams.toString()}`, { headers, cache: "no-store" });
    if (!overrideRes.ok) throw new ApiError(503, "Unable to check customer product versions.");
    const overrides = (await overrideRes.json()).data || [];
    const overrideByProduct = new Map<number, number>(
        overrides.map((override: any) => [Number(override.product_id), Number(override.version_id)])
    );
    const overrideVersionIds = [...new Set(
        overrides.map((override: any) => Number(override.version_id)).filter((id: number) => Number.isSafeInteger(id) && id > 0)
    )];

    const versionParams = new URLSearchParams({
        fields: "version_id,product_id,version_name,status",
        limit: "-1"
    });
    if (overrideVersionIds.length > 0) {
        versionParams.set("filter[_or][0][version_id][_in]", overrideVersionIds.join(","));
        versionParams.set("filter[_or][1][product_id][_in]", uniqueProductIds.join(","));
    } else {
        versionParams.set("filter[product_id][_in]", uniqueProductIds.join(","));
    }
    const versionRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?${versionParams.toString()}`, { headers, cache: "no-store" });
    if (!versionRes.ok) throw new ApiError(503, "Unable to resolve product BOM versions.");
    const versions = (await versionRes.json()).data || [];
    const versionsById = new Map<number, any>(versions.map((version: any) => [Number(version.version_id), version]));
    const versionsByProduct = new Map<number, any[]>();
    for (const version of versions) {
        const productId = Number(version.product_id);
        const productVersions = versionsByProduct.get(productId) || [];
        productVersions.push(version);
        versionsByProduct.set(productId, productVersions);
    }

    const resolved = new Map<number, number>();
    for (const productId of uniqueProductIds) {
        const overrideId = overrideByProduct.get(productId);
        const overrideVersion = overrideId ? versionsById.get(overrideId) : null;
        const preferredVersion = selectPreferredActiveVersion(versionsByProduct.get(productId) || []);
        const version = overrideVersion || preferredVersion;
        if (version) resolved.set(productId, Number(version.version_id));
    }
    return resolved;
}

interface AuthenticatedUser {
    id: number;
    admin: boolean;
}

async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;
    if (!token) throw new ApiError(401, "Authentication is required.");

    const springBase = process.env.SPRING_API_BASE_URL;
    if (!springBase) throw new ApiError(500, "Authentication service is not configured.");

    let response: Response;
    try {
        response = await fetch(`${springBase.replace(/\/$/, "")}/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            },
            cache: "no-store"
        });
    } catch (error) {
        console.error("Failed to verify sales-order user:", error);
        throw new ApiError(503, "Authentication service is unavailable.");
    }

    if (response.status === 401 || response.status === 403) {
        throw new ApiError(401, "Your session is invalid or has expired.");
    }
    if (!response.ok) throw new ApiError(503, "Authentication service is unavailable.");

    const user = await response.json();
    const id = Number(user?.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(401, "Unable to verify the current user.");
    return { id, admin: user?.admin === true };
}

async function canApproveSalesOrders(user: AuthenticatedUser) {
    if (user.admin) return true;

    const params = new URLSearchParams({
        "filter[user_id][_eq]": String(user.id),
        fields: "module_id.base_path",
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/user_access_modules?${params.toString()}`, {
        headers,
        cache: "no-store"
    });
    if (!response.ok) throw new ApiError(503, "Unable to verify sales-order approval access.");
    const rows = (await response.json()).data || [];
    return rows.some((row: any) => row.module_id?.base_path === "/mm/sales-order-approval");
}

function mutationError(error: unknown, fallback: string) {
    if (error instanceof ApiError) {
        return NextResponse.json({ error: error.message, ...error.details }, { status: error.status });
    }
    console.error(fallback, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}

const salesOrderMutationLocks = new Map<number, Promise<void>>();

async function withSalesOrderMutationLock<T>(orderId: number, operation: () => Promise<T>): Promise<T> {
    const previous = salesOrderMutationLocks.get(orderId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
        release = resolve;
    });
    const queued = previous.then(() => current);
    salesOrderMutationLocks.set(orderId, queued);

    await previous;
    try {
        return await operation();
    } finally {
        release();
        if (salesOrderMutationLocks.get(orderId) === queued) {
            salesOrderMutationLocks.delete(orderId);
        }
    }
}

interface QuantityState {
    [field: string]: unknown;
    ordered_quantity: unknown;
    net_amount: unknown;
    gross_amount: unknown;
}

interface DetailQuantityMutation {
    detailId: number;
    original: QuantityState;
    applied: QuantityState;
}

interface HeaderQuantityMutation {
    original: Record<string, unknown>;
    applied: Record<string, unknown>;
}

function statesMatch(current: Record<string, unknown>, expected: Record<string, unknown>) {
    return Object.entries(expected).every(([field, value]) => {
        if (typeof value === "number") return Number(current[field]) === value;
        return current[field] === value;
    });
}

async function rollbackQuantityUpdate(
    orderId: number,
    details: DetailQuantityMutation[],
    headerMutation: HeaderQuantityMutation | null
) {
    const failures: string[] = [];
    const unresolvedDetailIds: number[] = [];

    for (const mutation of [...details].reverse()) {
        try {
            const response = await fetch(
                `${DIRECTUS_URL}/items/sales_order_details/${mutation.detailId}?fields=detail_id,order_id,ordered_quantity,net_amount,gross_amount`,
                { headers, cache: "no-store" }
            );
            if (!response.ok) {
                failures.push(`detail ${mutation.detailId} read returned ${response.status}`);
                unresolvedDetailIds.push(mutation.detailId);
                continue;
            }

            const current = (await response.json()).data || {};
            if (Number(current.order_id) !== orderId) {
                failures.push(`detail ${mutation.detailId} no longer belongs to order ${orderId}`);
                unresolvedDetailIds.push(mutation.detailId);
                continue;
            }
            if (statesMatch(current, mutation.original)) continue;
            if (!statesMatch(current, mutation.applied)) {
                failures.push(`detail ${mutation.detailId} changed before rollback`);
                unresolvedDetailIds.push(mutation.detailId);
                continue;
            }

            const restoreResponse = await fetch(`${DIRECTUS_URL}/items/sales_order_details/${mutation.detailId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(mutation.original)
            });
            if (!restoreResponse.ok) {
                failures.push(`detail ${mutation.detailId} restore returned ${restoreResponse.status}`);
                unresolvedDetailIds.push(mutation.detailId);
            }
        } catch (error) {
            failures.push(`detail ${mutation.detailId} restore failed: ${error instanceof Error ? error.message : "unknown error"}`);
            unresolvedDetailIds.push(mutation.detailId);
        }
    }

    let headerUnresolved = false;
    if (headerMutation) {
        try {
            const response = await fetch(
                `${DIRECTUS_URL}/items/sales_order/${orderId}?fields=order_id,total_amount,net_amount,order_status`,
                { headers, cache: "no-store" }
            );
            if (!response.ok) {
                failures.push(`header read returned ${response.status}`);
                headerUnresolved = true;
            } else {
                const current = (await response.json()).data || {};
                if (!statesMatch(current, headerMutation.original)) {
                    if (!statesMatch(current, headerMutation.applied)) {
                        failures.push(`header changed before rollback`);
                        headerUnresolved = true;
                    } else {
                        const restoreResponse = await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify(headerMutation.original)
                        });
                        if (!restoreResponse.ok) {
                            failures.push(`header restore returned ${restoreResponse.status}`);
                            headerUnresolved = true;
                        }
                    }
                }
            }
        } catch (error) {
            failures.push(`header restore failed: ${error instanceof Error ? error.message : "unknown error"}`);
            headerUnresolved = true;
        }
    }

    return { failures, unresolvedDetailIds: [...new Set(unresolvedDetailIds)], headerUnresolved };
}

async function compensateSalesOrder(orderId: number, knownDetailIds: number[] = []) {
    const failures: string[] = [];
    const detailIds = new Set(knownDetailIds);

    try {
        const params = new URLSearchParams({
            "filter[order_id][_eq]": String(orderId),
            fields: "detail_id",
            limit: "-1"
        });
        const response = await fetch(`${DIRECTUS_URL}/items/sales_order_details?${params.toString()}`, {
            headers,
            cache: "no-store"
        });
        if (!response.ok) {
            failures.push(`detail discovery returned ${response.status}`);
        } else {
            const rows = (await response.json()).data || [];
            rows.forEach((row: any) => {
                const detailId = Number(row.detail_id);
                if (Number.isSafeInteger(detailId) && detailId > 0) detailIds.add(detailId);
            });
        }
    } catch (error) {
        failures.push(`detail discovery failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    for (const detailId of detailIds) {
        try {
            const response = await fetch(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, {
                method: "DELETE",
                headers
            });
            if (!response.ok && response.status !== 404) {
                failures.push(`detail ${detailId} delete returned ${response.status}`);
            }
        } catch (error) {
            failures.push(`detail ${detailId} delete failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
    }

    if (failures.length === 0) {
        try {
            const response = await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                method: "DELETE",
                headers
            });
            if (!response.ok && response.status !== 404) {
                failures.push(`header delete returned ${response.status}`);
            }
        } catch (error) {
            failures.push(`header delete failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
    }

    return failures;
}

async function createSalesOrderWithDetails(
    headerPayload: Record<string, unknown>,
    detailPayloads: Array<Record<string, unknown>>
) {
    let orderId: number | null = null;
    let headerCreated = false;
    const createdDetailIds: number[] = [];

    try {
        const headerResponse = await fetch(`${DIRECTUS_URL}/items/sales_order`, {
            method: "POST",
            headers,
            body: JSON.stringify(headerPayload)
        });
        if (!headerResponse.ok) {
            const errorText = await headerResponse.text();
            console.error(`Failed to create the sales-order header: ${headerResponse.status} - ${errorText}`);
            throw new ApiError(503, "Failed to create the sales-order header.");
        }
        headerCreated = true;

        const createdOrder = (await headerResponse.json()).data;
        orderId = Number(createdOrder?.order_id);
        if (!Number.isSafeInteger(orderId) || orderId < 1) {
            throw new ApiError(503, "Directus returned an invalid sales-order ID.");
        }

        for (const detailPayload of detailPayloads) {
            const detailResponse = await fetch(`${DIRECTUS_URL}/items/sales_order_details`, {
                method: "POST",
                headers,
                body: JSON.stringify({ ...detailPayload, order_id: orderId })
            });
            if (!detailResponse.ok) {
                const errorText = await detailResponse.text();
                console.error(`Failed to create a sales-order detail for order ${orderId}: ${detailResponse.status} - ${errorText}`);
                throw new ApiError(503, "Failed to create a sales-order detail.");
            }

            const createdDetail = (await detailResponse.json()).data;
            const detailId = Number(createdDetail?.detail_id);
            if (!Number.isSafeInteger(detailId) || detailId < 1) {
                throw new ApiError(503, "Directus returned an invalid sales-order detail ID.");
            }
            createdDetailIds.push(detailId);
        }

        return { orderId, createdDetailIds };
    } catch (error) {
        if (!orderId) {
            if (headerCreated) {
                console.error("Sales-order header was created but Directus returned no usable order ID.", error);
                throw new ApiError(500, "Sales-order creation returned an invalid identifier and requires cleanup.", {
                    cleanupRequired: true
                });
            }
            throw error;
        }

        const cleanupFailures = await compensateSalesOrder(orderId, createdDetailIds);
        if (cleanupFailures.length > 0) {
            console.error(`Sales-order ${orderId} creation and compensation failed.`, { error, cleanupFailures });
            throw new ApiError(500, "Sales-order creation failed and automatic cleanup was incomplete.", {
                cleanupRequired: true,
                order_id: orderId
            });
        }

        console.error(`Sales-order ${orderId} creation failed; partial records were removed.`, error);
        throw new ApiError(503, "Sales-order creation failed. Partial records were removed; please retry.");
    }
}


export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get("action");
        const orderId = searchParams.get("orderId");

        const read = async (collection: string, params: URLSearchParams) => {
            const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, {
                headers,
                cache: "no-store"
            });
            if (!response.ok) throw new Error(`Failed to fetch ${collection}: ${response.status}`);
            return response.json();
        };

        if (action === "create-lookups") {
            const optionalRead = async (collection: string, params: URLSearchParams) => {
                try {
                    return await read(collection, params);
                } catch (error) {
                    console.error(`Failed to fetch optional sales-order lookup ${collection}:`, error);
                    return { data: [] };
                }
            };

            const [customerResult, productResult] = await Promise.all([
                read("customer", new URLSearchParams({
                    fields: "id,customer_name,customer_code,payment_term",
                    limit: "-1",
                    sort: "customer_name"
                })),
                read("products", new URLSearchParams({
                    fields: "product_id,product_name,product_code,product_type,price_per_unit,cost_per_unit,parent_id,parent_id.product_id,unit_of_measurement.unit_id,unit_of_measurement.unit_name,unit_of_measurement.unit_shortcut,unit_of_measurement_count",
                    limit: "-1",
                    sort: "product_name"
                }))
            ]);

            const [branchResult, paymentTermResult, salesmanResult, supplierResult, productTypeResult, userResult, discountTypeResult] = await Promise.all([
                optionalRead("branches", new URLSearchParams({
                    "filter[isActive][_eq]": "1",
                    fields: "id,branch_name",
                    limit: "100",
                    sort: "branch_name"
                })),
                optionalRead("payment_terms", new URLSearchParams({
                    fields: "id,payment_name,payment_days",
                    limit: "-1",
                    sort: "payment_name"
                })),
                optionalRead("salesman", new URLSearchParams({
                    "filter[isActive][_eq]": "true",
                    fields: "id,salesman_name,salesman_code,employee_id",
                    limit: "-1",
                    sort: "salesman_name"
                })),
                optionalRead("suppliers", new URLSearchParams({
                    "filter[isActive][_eq]": "true",
                    fields: "id,supplier_name",
                    limit: "-1",
                    sort: "supplier_name"
                })),
                optionalRead("product_type", new URLSearchParams({
                    fields: "id,name",
                    limit: "-1"
                })),
                optionalRead("user", new URLSearchParams({
                    fields: "user_id,user_fname,user_lname",
                    limit: "-1",
                    sort: "user_fname"
                })),
                optionalRead("discount_type", new URLSearchParams({
                    fields: "id,discount_type,total_percent",
                    limit: "-1"
                }))
            ]);

            const customers = (customerResult.data || []).map((customer: any) => {
                const rawPaymentTerm = customer.payment_term;
                const paymentTermId = Number(
                    rawPaymentTerm && typeof rawPaymentTerm === "object"
                        ? rawPaymentTerm.id
                        : rawPaymentTerm
                );
                return {
                    id: customer.id,
                    customer_name: customer.customer_name,
                    customer_code: customer.customer_code,
                    payment_term: Number.isSafeInteger(paymentTermId) && paymentTermId > 0
                        ? paymentTermId
                        : null,
                    payment_term_id: Number.isSafeInteger(paymentTermId) && paymentTermId > 0
                        ? paymentTermId
                        : null
                };
            });
            const products = (productResult.data || []).map((product: any) => {
                const rawParent = product.parent_id;
                const parentId = Number(
                    rawParent && typeof rawParent === "object"
                        ? rawParent.product_id
                        : rawParent
                );
                const productId = Number(product.product_id);
                const unit = product.unit_of_measurement;
                return {
                    product_id: productId,
                    parent_product_id: Number.isSafeInteger(parentId) && parentId > 0 ? parentId : productId,
                    is_parent: !(Number.isSafeInteger(parentId) && parentId > 0),
                    product_name: product.product_name,
                    product_code: product.product_code,
                    product_type: product.product_type,
                    price_per_unit: product.price_per_unit,
                    cost_per_unit: product.cost_per_unit,
                    unit_id: Number(unit?.unit_id) || null,
                    unit_name: unit?.unit_name || "Unit",
                    unit_shortcut: unit?.unit_shortcut || "UNIT",
                    unit_count: Number(product.unit_of_measurement_count) || 1,
                    manufacturing_lead_days: Number(product.manufacturing_lead_days) || 0
                };
            });

            return NextResponse.json({
                customers,
                products,
                branches: branchResult.data || [],
                paymentTerms: paymentTermResult.data || [],
                salesmen: salesmanResult.data || [],
                users: userResult.data || [],
                suppliers: supplierResult.data || [],
                productTypes: productTypeResult.data || [],
                discountTypes: discountTypeResult.data || []
            });
        }

        // Fetch details for a specific order
        if (orderId) {
            const numericOrderId = Number(orderId);
            const [details, orderResult] = await Promise.all([
                fetchDetailsForOrders(read, [numericOrderId]),
                read("sales_order", new URLSearchParams({
                    "filter[order_id][_eq]": String(numericOrderId),
                    fields: SALES_ORDER_FIELDS,
                    limit: "1"
                }))
            ]);
            const orders = orderResult.data || [];
            const detailsMap = await enrichSalesOrderReadModel(read, orders, details);
            return NextResponse.json(detailsMap[numericOrderId] || []);
        }

        // Paginated list of sales orders
        const page = Number(searchParams.get("page") || "1");
        const limit = Number(searchParams.get("limit") || "10");
        const search = searchParams.get("search") || "";
        const status = searchParams.get("status") || "";
        const selectedIdsParam = searchParams.get("selectedIds") || "";
        const excludeHasJo = searchParams.get("excludeHasJo") === "true";
        const customerCode = searchParams.get("customerCode") || "";
        const dateFrom = searchParams.get("dateFrom") || "";
        const dateTo = searchParams.get("dateTo") || "";

        const filters = {
            search,
            status: excludeHasJo ? "For Picking" : status,
            customerCode,
            dateFrom,
            dateTo
        };
        let salesOrders: any[] = [];
        let prefetchedDetails: any[] = [];
        let scheduledDetailIds = new Set<number>();
        let totalCount = 0;
        let countExact = true;
        let hasMore = false;

        if (excludeHasJo) {
            const candidateChunkSize = 100;
            const candidateLimit = 1000;
            const targetEligibleCount = page * limit;
            const eligibleOrders: any[] = [];
            const eligibleDetails: any[] = [];
            let inspectedCount = 0;
            let candidateCount = 0;

            while (inspectedCount < candidateLimit && eligibleOrders.length < targetEligibleCount) {
                const candidateParams = new URLSearchParams({
                    page: String(Math.floor(inspectedCount / candidateChunkSize) + 1),
                    limit: String(Math.min(candidateChunkSize, candidateLimit - inspectedCount)),
                    meta: "filter_count",
                    sort: "-created_date",
                    fields: SALES_ORDER_FIELDS
                });
                addSalesOrderFilters(candidateParams, filters);
                const candidateResult = await read("sales_order", candidateParams);
                const candidates = candidateResult.data || [];
                if (inspectedCount === 0) candidateCount = Number(candidateResult.meta?.filter_count || candidates.length);
                if (candidates.length === 0) break;

                const candidateDetails = await fetchDetailsForOrders(read, candidates.map((order: any) => Number(order.order_id)));
                const chunkScheduledIds = await findScheduledDetailIds(read, candidateDetails);
                const detailsByOrder = new Map<number, any[]>();
                for (const detail of candidateDetails) {
                    const detailOrderId = Number(detail.order_id);
                    const orderDetails = detailsByOrder.get(detailOrderId) || [];
                    orderDetails.push(detail);
                    detailsByOrder.set(detailOrderId, orderDetails);
                }
                for (const candidate of candidates) {
                    const orderDetails = detailsByOrder.get(Number(candidate.order_id)) || [];
                    const unscheduled = orderDetails.filter((detail) => {
                        const isScheduled = chunkScheduledIds.has(Number(detail.detail_id || detail.id));
                        const ordered = Number(detail.ordered_quantity || 0);
                        const alloc = Number(detail.allocated_quantity || 0);
                        return !isScheduled && alloc < ordered;
                    });
                    if (orderDetails.length === 0 || unscheduled.length > 0) {
                        eligibleOrders.push(candidate);
                        eligibleDetails.push(...unscheduled);
                    }
                }
                inspectedCount += candidates.length;
                if (candidates.length < candidateChunkSize) break;
            }

            countExact = inspectedCount >= candidateCount;
            const start = (page - 1) * limit;
            salesOrders = eligibleOrders.slice(start, start + limit);
            const pageOrderIds = new Set(salesOrders.map((order) => Number(order.order_id)));
            prefetchedDetails = eligibleDetails.filter((detail) => pageOrderIds.has(Number(detail.order_id)));
            totalCount = eligibleOrders.length;
            hasMore = !countExact || eligibleOrders.length > start + salesOrders.length;
        } else {
            const orderParams = new URLSearchParams({
                page: String(page),
                limit: String(limit),
                meta: "filter_count",
                sort: "-created_date",
                fields: SALES_ORDER_FIELDS
            });
            addSalesOrderFilters(orderParams, filters);
            const orderResult = await read("sales_order", orderParams);
            salesOrders = orderResult.data || [];
            totalCount = Number(orderResult.meta?.filter_count || 0);
            hasMore = page * limit < totalCount;
        }

        const orderIdsToFetch = new Set<number>(salesOrders.map((so: any) => Number(so.order_id)));
        if (selectedIdsParam) {
            selectedIdsParam.split(",").forEach(idStr => {
                const idNum = Number(idStr.trim());
                if (idNum) orderIdsToFetch.add(idNum);
            });
        }

        const missingSelectedIds = [...orderIdsToFetch].filter((id) => !salesOrders.some((order) => Number(order.order_id) === id));
        let selectedOrders: any[] = [];
        if (missingSelectedIds.length > 0) {
            selectedOrders = (await read("sales_order", new URLSearchParams({
                "filter[order_id][_in]": missingSelectedIds.join(","),
                fields: SALES_ORDER_FIELDS,
                limit: "-1"
            }))).data || [];
        }
        const contextOrders = [...salesOrders, ...selectedOrders];
        let details = excludeHasJo
            ? [...prefetchedDetails, ...(missingSelectedIds.length > 0 ? await fetchDetailsForOrders(read, missingSelectedIds) : [])]
            : await fetchDetailsForOrders(read, [...orderIdsToFetch]);
        if (excludeHasJo) {
            details = details.filter((detail: any) => {
                const ordered = Number(detail.ordered_quantity || 0);
                const alloc = Number(detail.allocated_quantity || 0);
                return alloc < ordered;
            });
        }
        if (excludeHasJo && missingSelectedIds.length > 0) {
            scheduledDetailIds = await findScheduledDetailIds(read, details);
        }
        const detailsMap = await enrichSalesOrderReadModel(read, contextOrders, details, scheduledDetailIds);

        const totalPages = Math.ceil(totalCount / limit);

        return NextResponse.json({
            data: salesOrders,
            detailsMap,
            meta: {
                totalCount,
                totalPages,
                page,
                limit,
                hasMore,
                countExact
            }
        });
    } catch (e) {
        console.error("API Error in sales-order GET:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch sales orders" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const user = await requireAuthenticatedUser();
        const rawBody = await request.json().catch(() => null);
        const parsed = salesOrderPostSchema.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json({
                error: "Invalid sales-order request.",
                issues: validationIssues(parsed.error)
            }, { status: 400 });
        }
        const body = parsed.data;
        const { quotationId, customerId, poNo, items, dueDate, deliveryDate, paymentTerms, remarks, discountAmount, salesmanId, branchId } = body;
        const encoderId = user.id;
        const systemTimestamp = await getSystemTimeISOString();
        const localCreatedDate = systemTimestamp.substring(0, 19).replace('T', ' ');

        if (!quotationId) {
            const directItems = items!;

            // 1. Fetch customer details
            const custRes = await fetch(`${DIRECTUS_URL}/items/customer/${customerId}`, { headers, cache: "no-store" });
            if (!custRes.ok) throw new ApiError(400, "The selected customer does not exist.");
            const cust = (await custRes.json()).data;
            const customerCode = cust.customer_code || cust.customer_name || "CUST-GEN";

            const productIds = directItems.map((item) => item.product_id);
            const productParams = new URLSearchParams({
                "filter[product_id][_in]": productIds.join(","),
                fields: "product_id,product_name,product_type",
                limit: "-1"
            });
            const productRes = await fetch(`${DIRECTUS_URL}/items/products?${productParams.toString()}`, {
                headers,
                cache: "no-store"
            });
            if (!productRes.ok) throw new ApiError(503, "Unable to validate the selected products.");
            const productsData = (await productRes.json()).data || [];
            const productMap = new Map<number, any>(productsData.map((p: any) => [Number(p.product_id), p]));

            const validProductIds = new Set(
                productsData.map((product: any) => Number(product.product_id))
            );
            const invalidProductIds = productIds.filter((id) => !validProductIds.has(id));
            if (invalidProductIds.length > 0) {
                throw new ApiError(400, `Unknown product IDs: ${invalidProductIds.join(", ")}`);
            }

            // Resolve an explicit customer override, then Standard BOM Version 1, then a legacy active version.
            const actualCustomerId = Number(cust.id);
            const versionMap = await resolveCustomerProductVersions(actualCustomerId, productIds);

            const missingVersionProductNames: string[] = [];
            for (const productId of productIds) {
                const p = productMap.get(productId);
                const isFinishedGood = p && Number(p.product_type) === 388;
                if (isFinishedGood && !versionMap.has(productId)) {
                    missingVersionProductNames.push(p ? p.product_name : `Product #${productId}`);
                }
            }
            if (missingVersionProductNames.length > 0) {
                throw new ApiError(400, `No active BOM version is available for finished goods: ${missingVersionProductNames.join(", ")}. Configure Standard BOM Version 1 or another active version before ordering.`);
            }

            // 2. Reserve a collision-safe number using the allocator's auto-increment key.
            const allocationRes = await fetch(`${DIRECTUS_URL}/items/sales_order_number_allocations`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    created_at: systemTimestamp,
                    created_by: encoderId
                })
            });
            if (!allocationRes.ok) {
                const allocationError = await allocationRes.text();
                console.error(`Failed to allocate sales order number: ${allocationRes.status} - ${allocationError}`);
                return NextResponse.json(
                    { error: "Unable to allocate a sales order number. Please try again." },
                    { status: 503 }
                );
            }
            const allocation = (await allocationRes.json()).data;
            const allocationId = Number(allocation?.id);
            if (!Number.isSafeInteger(allocationId) || allocationId < 1) {
                console.error("Sales order number allocator returned an invalid ID.", allocation);
                return NextResponse.json(
                    { error: "Unable to allocate a sales order number. Please try again." },
                    { status: 503 }
                );
            }
            const orderNo = `SO-DIR-${String(allocationId).padStart(6, "0")}`;

            // Calculate total amount
            // disabled-lint-next-line @typescript-eslint/no-explicit-any
            const totalAmount = directItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
            const totalDiscount = directItems.reduce((sum, item) => sum + (item.discount_amount || 0), 0);

            // 3. Create the header and all details as one compensated business action.
            const salesOrderPayload = {
                order_no: orderNo,
                po_no: poNo,
                customer_code: customerCode,
                order_status: body.submitForApproval ? "For Approval" : "Draft",
                total_amount: totalAmount,
                discount_amount: 0,
                net_amount: totalAmount - totalDiscount,
                remarks: remarks || `Directly Created Sales Order.`,
                created_date: localCreatedDate,
                draft_at: body.submitForApproval ? null : localCreatedDate,
                for_approval_at: body.submitForApproval ? localCreatedDate : null,
                created_by: encoderId,
                delivery_date: deliveryDate || null,
                due_date: dueDate || null,
                payment_terms: paymentTerms ? Number(paymentTerms) : null,
                salesman_id: salesmanId ? Number(salesmanId) : null,
                branch_id: branchId ? Number(branchId) : null
            };
            const detailPayloads = directItems.map((item) => ({
                product_id: item.product_id,
                bom_version_id: item.bom_version_id || versionMap.get(item.product_id),
                unit_price: item.unit_price,
                ordered_quantity: item.quantity,
                allocated_quantity: 0,
                served_quantity: 0,
                allocated_amount: 0,
                net_amount: (item.unit_price * item.quantity) - (item.discount_amount || 0),
                gross_amount: item.unit_price * item.quantity,
                discount_type: item.discount_type || null,
                discount_amount: item.discount_amount || 0,
                created_date: localCreatedDate
            }));
            const created = await createSalesOrderWithDetails(salesOrderPayload, detailPayloads);

            return NextResponse.json({ success: true, order_id: created.orderId, order_no: orderNo });
        }

        // 1. Fetch the quotation header
        const quoteRes = await fetch(`${DIRECTUS_URL}/items/quotation_header/${quotationId}`, { headers, cache: "no-store" });
        if (!quoteRes.ok) throw new ApiError(404, "Quotation not found.");
        const quote = (await quoteRes.json()).data;

        // 2. Fetch the quotation snapshots
        const snapRes = await fetch(`${DIRECTUS_URL}/items/quotation_snapshots?filter[quotation_id][_eq]=${quotationId}&limit=-1`, { headers, cache: "no-store" });
        if (!snapRes.ok) throw new Error(`Failed to fetch quotation snapshots: ${snapRes.status}`);
        const snapshots = (await snapRes.json()).data;

        // Filter snapshots that are actual product quotas
// disabled-lint-next-line @typescript-eslint/no-explicit-any
        const quoteItems = snapshots.filter((s: any) => s.node_type === "product_quota");
        if (quoteItems.length === 0) {
            throw new ApiError(400, "No finished goods found in this quotation.");
        }

        const quoteTotal = Number(quote.total_selling_price);
        if (!Number.isFinite(quoteTotal) || quoteTotal < 0) {
            throw new ApiError(409, "The quotation has an invalid selling total.");
        }
        if (discountAmount > quoteTotal) {
            throw new ApiError(400, "Discount cannot exceed the quotation total.");
        }
        const invalidQuoteItem = quoteItems.some((item: any) => {
            const productId = Number(item.product_id);
            const quantity = Number(item.quantity);
            const unitPrice = Number(item.frozen_total_cost_php);
            return !Number.isSafeInteger(productId) || productId < 1
                || !Number.isFinite(quantity) || quantity <= 0
                || !Number.isFinite(unitPrice) || unitPrice < 0;
        });
        if (invalidQuoteItem) throw new ApiError(409, "The quotation contains invalid product quantities or prices.");

        // 3. Fetch customer details
        const custRes = await fetch(`${DIRECTUS_URL}/items/customer/${quote.customer_id}`, { headers, cache: "no-store" });
        let customerCode = "CUST-GEN";
        let actualQuoteCustomerId = Number(quote.customer_id);
        if (custRes.ok) {
            const cust = (await custRes.json()).data;
            customerCode = cust.customer_code || cust.customer_name || "CUST-GEN";
            actualQuoteCustomerId = Number(cust.id);
        }

        // Resolve an explicit customer override, then Standard BOM Version 1, then a legacy active version.
        const quoteParentIds = quoteItems.map((item: any) => Number(item.parent_id || item.product_id));
        const quoteProductParams = new URLSearchParams({
            "filter[product_id][_in]": quoteParentIds.join(","),
            fields: "product_id,product_name",
            limit: "-1"
        });
        const quoteProductRes = await fetch(`${DIRECTUS_URL}/items/products?${quoteProductParams.toString()}`, { headers, cache: "no-store" });
        const quoteProductsData = quoteProductRes.ok ? (await quoteProductRes.json()).data || [] : [];
        const quoteProductMap = new Map<number, any>(quoteProductsData.map((p: any) => [Number(p.product_id), p]));

        const quoteVersionMap = await resolveCustomerProductVersions(actualQuoteCustomerId, quoteParentIds);

        const missingQuoteVersionProductNames: string[] = [];
        for (const parentId of quoteParentIds) {
            if (!quoteVersionMap.has(parentId)) {
                const p = quoteProductMap.get(parentId);
                missingQuoteVersionProductNames.push(p ? p.product_name : `Product #${parentId}`);
            }
        }
        if (missingQuoteVersionProductNames.length > 0) {
            throw new ApiError(400, `No active BOM version is available for: ${missingQuoteVersionProductNames.join(", ")}. Configure Standard BOM Version 1 or another active version before ordering.`);
        }

        // 4. Create Sales Order
        const orderNo = `SO-${quote.quote_number.replace("QT-", "")}`;
        const duplicateParams = new URLSearchParams({
            "filter[order_no][_eq]": orderNo,
            fields: "order_id",
            limit: "1"
        });
        const duplicateRes = await fetch(`${DIRECTUS_URL}/items/sales_order?${duplicateParams.toString()}`, {
            headers,
            cache: "no-store"
        });
        if (!duplicateRes.ok) throw new ApiError(503, "Unable to verify whether this quotation was already converted.");
        if (((await duplicateRes.json()).data || []).length > 0) {
            throw new ApiError(409, `Sales order ${orderNo} already exists for this quotation.`);
        }

        const salesOrderPayload = {
            order_no: orderNo,
            po_no: poNo,
            quotation_id: quotationId,
            customer_code: customerCode,
            order_status: body.submitForApproval ? "For Approval" : "Draft", // Start as Draft or Submit
            total_amount: quoteTotal,
            discount_amount: discountAmount,
            net_amount: quoteTotal - discountAmount,
            remarks: remarks || `Converted 1:1 from Quote ${quote.quote_number}.`,
            created_date: localCreatedDate,
            draft_at: body.submitForApproval ? null : localCreatedDate,
            for_approval_at: body.submitForApproval ? localCreatedDate : null,
            created_by: encoderId,
            delivery_date: deliveryDate || null,
            due_date: dueDate || null,
            payment_terms: paymentTerms ? Number(paymentTerms) : null,
            salesman_id: salesmanId ? Number(salesmanId) : null,
            branch_id: branchId ? Number(branchId) : null
        };
        const detailPayloads = quoteItems.map((item: any) => {
            const unitPrice = Number(item.frozen_total_cost_php);
            const quantity = Number(item.quantity);
            const productId = Number(item.product_id);
            const parentId = Number(item.parent_id || item.product_id);
            return {
                product_id: productId,
                bom_version_id: quoteVersionMap.get(parentId),
                unit_price: unitPrice,
                ordered_quantity: quantity,
                allocated_quantity: 0,
                served_quantity: 0,
                allocated_amount: 0,
                net_amount: unitPrice * quantity,
                gross_amount: unitPrice * quantity,
                created_date: localCreatedDate
            };
        });
        const created = await createSalesOrderWithDetails(salesOrderPayload, detailPayloads);

        // 5. Mark the quotation converted only after the complete order exists.
        try {
            const quoteUpdateRes = await fetch(`${DIRECTUS_URL}/items/quotation_header/${quotationId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    status: "Converted to SO",
                    remarks: `${quote.remarks || ""}\n[System: Converted to Sales Order ${orderNo}]`
                })
            });
            if (!quoteUpdateRes.ok) {
                throw new Error(`quotation update returned ${quoteUpdateRes.status}`);
            }

            if (quote.project_id) {
                const projectUpdateRes = await fetch(`${DIRECTUS_URL}/items/projects/${quote.project_id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ status: "Executed", modified_by: encoderId })
                });
                if (!projectUpdateRes.ok) {
                    console.warn(`Failed to mark project ${quote.project_id} as Executed. Status: ${projectUpdateRes.status}`);
                }
            }
        } catch (error) {
            const cleanupFailures: string[] = [];
            try {
                const restoreRes = await fetch(`${DIRECTUS_URL}/items/quotation_header/${quotationId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        status: quote.status ?? null,
                        remarks: quote.remarks ?? null
                    })
                });
                if (!restoreRes.ok) cleanupFailures.push(`quotation restore returned ${restoreRes.status}`);
            } catch (restoreError) {
                cleanupFailures.push(`quotation restore failed: ${restoreError instanceof Error ? restoreError.message : "unknown error"}`);
            }
            cleanupFailures.push(...await compensateSalesOrder(created.orderId, created.createdDetailIds));

            if (cleanupFailures.length > 0) {
                console.error(`Quotation ${quotationId} conversion and compensation failed.`, { error, cleanupFailures });
                throw new ApiError(500, "Quotation conversion failed and automatic cleanup was incomplete.", {
                    cleanupRequired: true,
                    order_id: created.orderId
                });
            }

            console.error(`Quotation ${quotationId} conversion failed; the new order was removed.`, error);
            throw new ApiError(503, "Quotation conversion failed. Partial records were removed; please retry.");
        }

        return NextResponse.json({ success: true, order_id: created.orderId, order_no: orderNo });
    } catch (e) {
        return mutationError(e, "Failed to process sales-order creation.");
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await requireAuthenticatedUser();
        const rawBody = await request.json().catch(() => null);
        const parsed = salesOrderPatchSchema.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json({
                error: "Invalid sales-order update.",
                issues: validationIssues(parsed.error)
            }, { status: 400 });
        }
        const body = parsed.data;
        const orderId = body.orderId;
        
        const systemTimestamp = await getSystemTimeISOString();
        const localCreatedDate = systemTimestamp.substring(0, 19).replace('T', ' ');

        return await withSalesOrderMutationLock(orderId, async () => {

        const headerParams = new URLSearchParams({
            fields: "order_id,order_status,discount_amount,total_amount,net_amount,customer_code,remarks",
            limit: "1"
        });
        const orderRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}?${headerParams.toString()}`, {
            headers,
            cache: "no-store"
        });
        if (!orderRes.ok) throw new ApiError(404, "Sales order not found.");
        const order = (await orderRes.json()).data;
        const currentStatus = String(order.order_status || "");
        const discount = Number(order.discount_amount || 0);
        if (!Number.isFinite(discount) || discount < 0) {
            throw new ApiError(409, "The sales order has an invalid discount amount.");
        }

        const detailParams = new URLSearchParams({
            "filter[order_id][_eq]": String(orderId),
            fields: "detail_id,order_id,unit_price,ordered_quantity,net_amount,gross_amount,product_id,created_date",
            limit: "-1"
        });
        const allDetailsRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details?${detailParams.toString()}`, {
            headers,
            cache: "no-store"
        });
        if (!allDetailsRes.ok) throw new ApiError(503, "Unable to validate sales-order details.");
        const allDetails = (await allDetailsRes.json()).data || [];

        if ("action" in body && body.action === "update-draft") {
            if (mapStatus(currentStatus) !== "Draft") {
                throw new ApiError(409, `Sales order cannot be fully edited while it is ${currentStatus || "in an unknown status"}.`);
            }

            const headerPayload = {
                customer_code: body.customerId ? undefined : undefined,
                po_no: body.poNo,
                delivery_date: body.deliveryDate || null,
                due_date: body.dueDate || null,
                payment_terms: body.paymentTerms ? Number(body.paymentTerms) : null,
                salesman_id: body.salesmanId ? Number(body.salesmanId) : null,
                branch_id: body.branchId ? Number(body.branchId) : null,
                remarks: body.remarks || null,
                discount_amount: body.discountAmount || 0,
                modified_by: user.id,
                modified_date: localCreatedDate,
                order_status: body.submitForApproval ? "For Approval" : "Draft",
                for_approval_at: body.submitForApproval ? localCreatedDate : undefined
            };
            
            // Map old detail created_dates by product_id
            const oldDetailsMap = new Map<number, string[]>();
            for (const od of allDetails) {
                const pid = Number(od.product_id);
                if (!oldDetailsMap.has(pid)) oldDetailsMap.set(pid, []);
                if (od.created_date) oldDetailsMap.get(pid)!.push(od.created_date);
            }

            // Calculate new totals
            const items = body.items || [];
            let newTotal = 0;
            const newDetails = items.map((item: any) => {
                const qty = Number(item.quantity);
                const price = Number(item.unit_price);
                const discount = Number(item.discount_amount || 0);
                const net = qty * price - discount;
                newTotal += (qty * price);
                
                const pid = Number(item.product_id);
                const mappedCreatedDate = (oldDetailsMap.has(pid) && oldDetailsMap.get(pid)!.length > 0)
                    ? oldDetailsMap.get(pid)!.shift()
                    : localCreatedDate;

                return {
                    product_id: pid,
                    bom_version_id: item.bom_version_id || null,
                    ordered_quantity: qty,
                    unit_price: price,
                    discount_type: item.discount_type || null,
                    discount_amount: discount,
                    net_amount: net,
                    gross_amount: qty * price,
                    allocated_quantity: 0,
                    served_quantity: 0,
                    allocated_amount: 0,
                    created_date: mappedCreatedDate,
                    modified_date: localCreatedDate,
                    order_id: orderId
                };
            });
            const headerDiscount = Number(body.discountAmount || 0);
            if (headerDiscount > newTotal) {
                throw new ApiError(400, "The sales-order discount cannot exceed the updated total.");
            }
            const newNet = newTotal - headerDiscount;
            
            const fullHeaderPayload = {
                ...headerPayload,
                total_amount: newTotal,
                net_amount: newNet
            };

            // Delete existing details
            const deleteFailures: string[] = [];
            for (const detail of allDetails) {
                const detailId = Number(detail.detail_id);
                try {
                    const delRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, {
                        method: "DELETE",
                        headers
                    });
                    if (!delRes.ok && delRes.status !== 404) {
                        deleteFailures.push(`detail ${detailId} delete returned ${delRes.status}`);
                    }
                } catch (err) {
                    deleteFailures.push(`detail ${detailId} delete failed: ${err instanceof Error ? err.message : "unknown error"}`);
                }
            }
            
            if (deleteFailures.length > 0) {
                console.error(`Failed to delete details for order ${orderId}:`, deleteFailures);
                throw new ApiError(500, "Failed to update draft sales order (could not clear existing details).");
            }

            // Update header
            const headerUpdateRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(fullHeaderPayload)
            });
            if (!headerUpdateRes.ok) {
                throw new ApiError(503, "Failed to update the sales-order header.");
            }

            // Create new details
            for (const newDetail of newDetails) {
                const detailResponse = await fetch(`${DIRECTUS_URL}/items/sales_order_details`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(newDetail)
                });
                if (!detailResponse.ok) {
                    throw new ApiError(503, "Failed to create a sales-order detail.");
                }
            }
            
            return NextResponse.json({ success: true, order_status: body.submitForApproval ? "For Approval" : "Draft" });
        }

        if ("orderStatus" in body) {
            const targetStatus = body.orderStatus;
            if (!targetStatus) throw new ApiError(400, "A target sales-order status is required.");
            if (targetStatus === currentStatus) {
                return NextResponse.json({ success: true, order_status: currentStatus });
            }

            const current = mapStatus(currentStatus);
            const target = mapStatus(targetStatus);

            if (!SALES_ORDER_TRANSITIONS[current]?.includes(target)) {
                throw new ApiError(409, `Cannot transition sales order from ${current} to ${target}.`);
            }

            const isApprovalDecision = (current === "For Approval" || current === "On Hold")
                && (target === "For Invoicing" || target === "Draft" || target === "On Hold" || target === "Cancelled");
            if (isApprovalDecision && !(await canApproveSalesOrders(user))) {
                throw new ApiError(403, "Sales-order approval access is required for this transition.");
            }

            if (target === "For Invoicing") {
                if (allDetails.length === 0) {
                    throw new ApiError(400, "Approval blocked: Sales Order has no item details.");
                }
                const total = allDetails.reduce((sum: number, detail: any) => {
                    const quantity = Number(detail.ordered_quantity);
                    const unitPrice = Number(detail.unit_price);
                    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
                        throw new ApiError(400, "Approval blocked: Every item line must have a unit price explicitly greater than ₱0.00.");
                    }
                    return sum + quantity * unitPrice;
                }, 0);
                const netBalance = total - discount;
                if (netBalance <= 0) {
                    throw new ApiError(400, "Approval blocked: Sales Order total net balance must be explicitly greater than ₱0.00.");
                }
            }

            let creditLimitExceeded = false;
            let warningString = "";

            if (target === "For Approval") {
                if (allDetails.length === 0) throw new ApiError(409, "A sales order without details cannot be submitted for approval.");
                const total = allDetails.reduce((sum: number, detail: any) => {
                    const quantity = Number(detail.ordered_quantity);
                    const unitPrice = Number(detail.unit_price);
                    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
                        throw new ApiError(409, "Sales-order details contain invalid quantities or prices.");
                    }
                    return sum + quantity * unitPrice;
                }, 0);
                if (discount > total) throw new ApiError(409, "The sales-order discount exceeds its total amount.");
                const orderNetAmount = total - discount;

                try {
                    const custRes = await fetch(`${DIRECTUS_URL}/items/customer?filter[customer_code][_eq]=${order.customer_code}&fields=id,credit_limit,customer_name`, { headers, cache: "no-store" });
                    if (custRes.ok) {
                        const custData = (await custRes.json()).data || [];
                        if (custData.length > 0) {
                            const customerRecord = custData[0];
                            const creditLimit = Number(customerRecord.credit_limit || 0);
                            if (creditLimit > 0) {
                                const invoiceRes = await fetch(
                                    `${DIRECTUS_URL}/items/sales_invoice?filter[customer_code][_eq]=${order.customer_code}&filter[transaction_status][_neq]=Cancelled&fields=net_amount,payment_status&limit=-1`,
                                    { headers, cache: "no-store" }
                                );
                                const invoices: { net_amount: number; payment_status?: string }[] = invoiceRes.ok ? (await invoiceRes.json()).data || [] : [];
                                let outstandingBalance = 0;
                                for (const inv of invoices) {
                                    let paid = 0;
                                    if (inv.payment_status) {
                                        try {
                                            const payments = JSON.parse(inv.payment_status);
                                            if (Array.isArray(payments)) paid = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
                                        } catch { /* string status - compute from value */ }
                                    }
                                    const net = Number(inv.net_amount || 0);
                                    outstandingBalance += Math.max(0, net - paid);
                                }

                                if (outstandingBalance + orderNetAmount > creditLimit) {
                                    creditLimitExceeded = true;
                                    warningString = `[SYSTEM WARNING: Order of ₱${orderNetAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} exceeds Credit Limit of ₱${creditLimit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}. Current Outstanding Balance: ₱${outstandingBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}]`;
                                }
                            }
                        }
                    }
                } catch (creditError) {
                    console.error("Error performing credit limit check:", creditError);
                }
            }

            const updatePayload: Record<string, any> = { order_status: target };
            if (creditLimitExceeded && warningString) {
                // If warning is not already in the remarks, append it
                const currentRemarks = order.remarks || "";
                if (!currentRemarks.includes("[SYSTEM WARNING: Order of")) {
                    updatePayload.remarks = currentRemarks 
                        ? `${currentRemarks}\n${warningString}` 
                        : warningString;
                }
            }

            const updateRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(updatePayload)
            });
            if (!updateRes.ok) throw new ApiError(503, "Failed to update the sales-order status.");
            return NextResponse.json({ success: true, order_status: target });
        }

        if (mapStatus(currentStatus) !== "Draft") {
            throw new ApiError(409, `Quantities cannot be changed while the sales order is ${currentStatus || "in an unknown status"}.`);
        }

        if (!("details" in body) || !body.details) {
            throw new ApiError(400, "Invalid patch request. Expected details array.");
        }

        const requestedDetails = new Map<number, number>(body.details.map((detail: any) => [Number(detail.detail_id), Number(detail.ordered_quantity)]));
        const existingDetailIds = new Set(allDetails.map((detail: any) => Number(detail.detail_id)));
        const foreignDetailIds = [...requestedDetails.keys()].filter((detailId) => !existingDetailIds.has(detailId));
        if (foreignDetailIds.length > 0) {
            throw new ApiError(404, `Sales-order detail IDs were not found on this order: ${foreignDetailIds.join(", ")}`);
        }

        const total = allDetails.reduce((sum: number, detail: any) => {
            const detailId = Number(detail.detail_id);
            const quantity = requestedDetails.get(detailId) ?? Number(detail.ordered_quantity);
            const unitPrice = Number(detail.unit_price);
            if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
                throw new ApiError(409, "Sales-order details contain invalid quantities or prices.");
            }
            return sum + (quantity * unitPrice);
        }, 0);
        if (discount > total) throw new ApiError(400, "The sales-order discount cannot exceed the updated total.");

        const nextStatus = "Draft";
        const detailsById = new Map<number, any>(allDetails.map((detail: any) => [Number(detail.detail_id), detail]));
        const attemptedMutations: DetailQuantityMutation[] = [];
        let headerMutation: HeaderQuantityMutation | null = null;

        try {
            for (const [detailId, quantity] of requestedDetails) {
                const detail = detailsById.get(detailId);
                const newNet = Number(detail.unit_price) * quantity;
                const mutation: DetailQuantityMutation = {
                    detailId,
                    original: {
                        ordered_quantity: detail.ordered_quantity,
                        net_amount: detail.net_amount,
                        gross_amount: detail.gross_amount
                    },
                    applied: {
                        ordered_quantity: quantity,
                        net_amount: newNet,
                        gross_amount: newNet
                    }
                };
                attemptedMutations.push(mutation);

                const detailRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(mutation.applied)
                });
                if (!detailRes.ok) throw new Error(`detail ${detailId} update returned ${detailRes.status}`);
            }

            headerMutation = {
                original: {
                    total_amount: order.total_amount,
                    net_amount: order.net_amount,
                    order_status: currentStatus
                },
                applied: {
                    total_amount: total,
                    net_amount: total - discount,
                    order_status: nextStatus
                }
            };
            const headerUpdateRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(headerMutation.applied)
            });
            if (!headerUpdateRes.ok) throw new Error(`header update returned ${headerUpdateRes.status}`);
        } catch (error) {
            const rollback = await rollbackQuantityUpdate(orderId, attemptedMutations, headerMutation);
            if (rollback.failures.length > 0) {
                console.error(`Sales-order ${orderId} quantity update and rollback failed.`, { error, rollback });
                throw new ApiError(500, "Sales-order quantity update failed and automatic restoration was incomplete.", {
                    cleanupRequired: true,
                    order_id: orderId,
                    detail_ids: rollback.unresolvedDetailIds,
                    header_cleanup_required: rollback.headerUnresolved
                });
            }

            console.error(`Sales-order ${orderId} quantity update failed; prior values were restored.`, error);
            throw new ApiError(503, "Sales-order quantity update failed. Prior values were restored; please retry.");
        }

        return NextResponse.json({ success: true, order_status: nextStatus });
        });
    } catch (e) {
        return mutationError(e, "Failed to update the sales order.");
    }
}

