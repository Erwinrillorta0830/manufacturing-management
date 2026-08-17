/* eslint-disable @typescript-eslint/no-explicit-any */
import { selectPreferredActiveVersion } from "../finished-goods/versions/versions-helper";

type Row = Record<string, any>;

export const SALES_ORDER_FIELDS = [
    "order_id", "order_no", "po_no", "customer_code", "order_date", "order_status",
    "total_amount", "net_amount", "remarks", "created_date", "discount_amount",
    "delivery_date", "due_date", "payment_terms", "salesman_id", "branch_id"
].join(",");

export const SALES_ORDER_DETAIL_FIELDS = [
    "detail_id", "order_id", "bom_version_id", "product_id", "unit_price", "ordered_quantity", "net_amount",
    "allocated_quantity", "allocated_amount"
].join(",");

export type DirectusReader = (collection: string, params: URLSearchParams) => Promise<{ data: Row[]; meta?: { filter_count?: number } }>;

export function addSalesOrderFilters(params: URLSearchParams, filters: {
    search?: string;
    status?: string;
    customerCode?: string;
    dateFrom?: string;
    dateTo?: string;
}) {
    if (filters.status && filters.status.toLowerCase() !== "all" && filters.status.toLowerCase() !== "all status") {
        params.set("filter[order_status][_eq]", filters.status);
    }
    if (filters.search) {
        params.set("filter[_or][0][order_no][_icontains]", filters.search);
        params.set("filter[_or][1][customer_code][_icontains]", filters.search);
        params.set("filter[_or][2][po_no][_icontains]", filters.search);
    }
    if (filters.customerCode) params.set("filter[customer_code][_eq]", filters.customerCode);
    if (filters.dateFrom) params.set("filter[order_date][_gte]", filters.dateFrom);
    if (filters.dateTo) params.set("filter[order_date][_lte]", filters.dateTo);
}

export async function fetchDetailsForOrders(read: DirectusReader, orderIds: number[]) {
    if (orderIds.length === 0) return [];
    const params = new URLSearchParams({
        "filter[order_id][_in]": orderIds.join(","),
        fields: SALES_ORDER_DETAIL_FIELDS,
        limit: "-1"
    });
    return (await read("sales_order_details", params)).data;
}

export async function findScheduledDetailIds(read: DirectusReader, details: Row[]) {
    const detailIds = details.map((detail) => Number(detail.detail_id || detail.id)).filter(Boolean);
    if (detailIds.length === 0) return new Set<number>();

    const allocationParams = new URLSearchParams({
        "filter[sales_order_detail_id][_in]": detailIds.join(","),
        fields: "sales_order_detail_id,job_order_id",
        limit: "-1"
    });
    const allocations = (await read("manufacturing_job_order_allocations", allocationParams)).data;
    const jobOrderIds = [...new Set(allocations.map((allocation) => Number(allocation.job_order_id)).filter(Boolean))];
    if (jobOrderIds.length === 0) return new Set<number>();

    const jobOrderParams = new URLSearchParams({
        "filter[job_order_id][_in]": jobOrderIds.join(","),
        fields: "job_order_id,status",
        limit: "-1"
    });
    const jobOrders = (await read("manufacturing_job_orders", jobOrderParams)).data;
    const activeJobOrderIds = new Set(
        jobOrders
            .filter((jobOrder) => jobOrder.status !== "Cancelled")
            .map((jobOrder) => Number(jobOrder.job_order_id))
    );

    return new Set(
        allocations
            .filter((allocation) => activeJobOrderIds.has(Number(allocation.job_order_id)))
            .map((allocation) => Number(allocation.sales_order_detail_id))
    );
}

async function fetchProductGraph(read: DirectusReader, initialProductIds: number[]) {
    const products = new Map<number, Row>();
    let frontier = [...new Set(initialProductIds)];

    while (frontier.length > 0) {
        const params = new URLSearchParams({
            "filter[_or][0][product_id][_in]": frontier.join(","),
            "filter[_or][1][parent_id][_in]": frontier.join(","),
            fields: "product_id,product_name,product_code,unit_of_measurement,unit_of_measurement.unit_name,unit_of_measurement.unit_shortcut,unit_of_measurement_count,product_brand.brand_name,product_category.category_name,parent_id",
            limit: "-1"
        });
        const rows = (await read("products", params)).data;
        const next = new Set<number>();
        for (const product of rows) {
            const productId = Number(product.product_id);
            if (!products.has(productId)) {
                products.set(productId, product);
                next.add(productId);
            }
            const parent = product.parent_id;
            const parentId = Number(typeof parent === "object" ? parent?.product_id : parent);
            if (parentId && !products.has(parentId)) next.add(parentId);
        }
        frontier = [...next];
    }

    return products;
}

async function resolveVersions(
    read: DirectusReader,
    products: Map<number, Row>,
    customerIds: number[],
    extraVersionIds: number[] = []
) {
    const productIds = [...products.keys()];
    const overrideByPair = new Map<string, number>();
    let overrides: Row[] = [];
    if (productIds.length > 0 && customerIds.length > 0) {
        const params = new URLSearchParams({
            "filter[product_id][_in]": productIds.join(","),
            "filter[customer_id][_in]": customerIds.join(","),
            fields: "product_id,customer_id,version_id",
            limit: "-1"
        });
        overrides = (await read("customer_product_version", params)).data;
        for (const override of overrides) {
            overrideByPair.set(`${Number(override.customer_id)}:${Number(override.product_id)}`, Number(override.version_id));
        }
    }

    const overrideVersionIds = [...new Set([
        ...overrides.map((override) => Number(override.version_id)),
        ...extraVersionIds
    ].filter(Boolean))];
    const versionParams = new URLSearchParams({ fields: "version_id,product_id,version_name,status", limit: "-1" });
    if (overrideVersionIds.length > 0) {
        versionParams.set("filter[_or][0][version_id][_in]", overrideVersionIds.join(","));
        versionParams.set("filter[_or][1][product_id][_in]", productIds.join(","));
    } else {
        versionParams.set("filter[product_id][_in]", productIds.join(","));
    }
    const versions = productIds.length > 0 ? (await read("product_manufacturing_version", versionParams)).data : [];
    const versionById = new Map(versions.map((version) => [Number(version.version_id), version]));
    const activeByProduct = new Map<number, Row>();
    const versionsByProduct = new Map<number, Row[]>();
    for (const version of versions) {
        const productVersions = versionsByProduct.get(Number(version.product_id)) || [];
        productVersions.push(version);
        versionsByProduct.set(Number(version.product_id), productVersions);
    }
    for (const [productId, productVersions] of versionsByProduct) {
        const preferredVersion = selectPreferredActiveVersion(productVersions);
        if (preferredVersion) activeByProduct.set(productId, preferredVersion);
    }

    const childrenByParent = new Map<number, number[]>();
    for (const product of products.values()) {
        const parent = product.parent_id;
        const parentId = Number(typeof parent === "object" ? parent?.product_id : parent);
        if (!parentId) continue;
        const children = childrenByParent.get(parentId) || [];
        children.push(Number(product.product_id));
        childrenByParent.set(parentId, children);
    }

    const resolve = (productId: number, customerId?: number, visited = new Set<number>()): Row | null => {
        if (visited.has(productId)) return null;
        const nextVisited = new Set(visited).add(productId);
        if (customerId) {
            const overrideId = overrideByPair.get(`${customerId}:${productId}`);
            if (overrideId && versionById.has(overrideId)) return versionById.get(overrideId)!;
        }
        const active = activeByProduct.get(productId);
        if (active) return active;

        const product = products.get(productId);
        const parent = product?.parent_id;
        const parentId = Number(typeof parent === "object" ? parent?.product_id : parent);
        if (parentId) {
            const parentVersion = resolve(parentId, customerId, nextVisited);
            if (parentVersion) return parentVersion;
        }
        for (const childId of childrenByParent.get(productId) || []) {
            const childVersion = resolve(childId, customerId, nextVisited);
            if (childVersion) return childVersion;
        }
        return null;
    };

    return { resolve, versionById };
}

export async function enrichSalesOrderReadModel(
    read: DirectusReader,
    salesOrders: Row[],
    details: Row[],
    scheduledDetailIds = new Set<number>()
) {
    const customerCodes = [...new Set(salesOrders.map((order) => String(order.customer_code || "")).filter(Boolean))];
    const customerParams = new URLSearchParams({ fields: "id,customer_code,customer_name", limit: "-1" });
    if (customerCodes.length > 0) customerParams.set("filter[customer_code][_in]", customerCodes.join(","));
    const customersPromise = customerCodes.length > 0 ? read("customer", customerParams) : Promise.resolve({ data: [] });

    const paymentTermIds = [...new Set(salesOrders.map((order) => Number(order.payment_terms)).filter(Boolean))];
    const termsParams = new URLSearchParams({ fields: "id,payment_name,payment_days", limit: "-1" });
    if (paymentTermIds.length > 0) termsParams.set("filter[id][_in]", paymentTermIds.join(","));
    const termsPromise = paymentTermIds.length > 0 ? read("payment_terms", termsParams) : Promise.resolve({ data: [] });

    const productIds = [...new Set(details.map((detail) => Number(detail.product_id)).filter(Boolean))];
    const unitsPromise = read("units", new URLSearchParams({ fields: "unit_id,unit_name,unit_shortcut", limit: "-1" }));
    const [customerResult, termsResult, products, unitsResult] = await Promise.all([
        customersPromise,
        termsPromise,
        fetchProductGraph(read, productIds),
        unitsPromise
    ]);

    const unitsMap = new Map<number, any>((unitsResult.data || []).map((u: any) => [Number(u.unit_id), u]));
    const customersByCode = new Map(customerResult.data.map((customer) => [String(customer.customer_code), customer]));
    const customerIds = [...new Set(customerResult.data.map((customer) => Number(customer.id || customer.customer_id)).filter(Boolean))];
    const termsById = new Map(termsResult.data.map((term) => [Number(term.id), term]));
    const extraVersionIds = details.map((detail) => Number(detail.bom_version_id)).filter(Boolean);
    const { resolve: resolveVersion, versionById } = await resolveVersions(read, products, customerIds, extraVersionIds);
    const orderById = new Map(salesOrders.map((order) => [Number(order.order_id), order]));

    for (const order of salesOrders) {
        const customer = customersByCode.get(String(order.customer_code));
        order.customer_name = customer?.customer_name || order.customer_code;
        const term = termsById.get(Number(order.payment_terms));
        if (term) {
            order.payment_term_name = term.payment_name;
            order.payment_term_days = term.payment_days;
        }
    }

    const detailsMap: Record<number, Row[]> = {};
    for (const detail of details) {
        const detailId = Number(detail.detail_id || detail.id);
        if (scheduledDetailIds.has(detailId)) continue;
        const orderId = Number(detail.order_id);
        const rawProductId = Number(detail.product_id);
        const product = products.get(rawProductId);
        const uomId = Number(product?.unit_of_measurement?.unit_id || product?.unit_of_measurement || 0);
        const unitObj = unitsMap.get(uomId) || (typeof product?.unit_of_measurement === "object" ? product.unit_of_measurement : null);
        const unitName = unitObj?.unit_name || unitObj?.unit_shortcut || "Pieces";
        const unitShortcut = unitObj?.unit_shortcut || unitObj?.unit_name || "PCS";

        detail.product_id = product ? {
            product_id: Number(product.product_id),
            product_name: product.product_name,
            product_code: product.product_code,
            uom: unitName,
            uom_name: unitName,
            uom_shortcut: unitShortcut,
            unit_name: unitName,
            uom_count: product.unit_of_measurement_count ? Number(product.unit_of_measurement_count) : 1,
            parent_id: product.parent_id ? Number(typeof product.parent_id === "object" ? product.parent_id.product_id : product.parent_id) : null,
            brand: product.product_brand?.brand_name || "N/A",
            category: product.product_category?.category_name || "N/A"
        } : {
            product_id: rawProductId,
            product_name: `Product #${rawProductId}`,
            product_code: `CODE-${rawProductId}`,
            uom: "Pieces",
            uom_name: "Pieces",
            uom_shortcut: "PCS",
            unit_name: "Pieces",
            uom_count: 1,
            parent_id: null,
            brand: "N/A",
            category: "N/A"
        };

        const order = orderById.get(orderId);
        const customer = order ? customersByCode.get(String(order.customer_code)) : undefined;
        const customerId = Number(customer?.id || customer?.customer_id) || undefined;
        const storedVersionId = detail.bom_version_id ? Number(detail.bom_version_id) : null;
        const version = storedVersionId ? versionById.get(storedVersionId) : resolveVersion(rawProductId, customerId);
        detail.bom_version_id = version ? Number(version.version_id) : null;
        detail.bom_version_name = version?.version_name || "No Version";
        (detailsMap[orderId] ||= []).push(detail);
    }

    return detailsMap;
}
