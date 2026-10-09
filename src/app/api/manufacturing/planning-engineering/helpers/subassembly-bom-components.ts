import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getActiveVersionForProduct, selectPreferredActiveVersion } from "../../finished-goods/versions/versions-helper";
import { getKilogramsPerInventoryUnit } from "@/modules/manufacturing-management/planning-engineering/utils/containerization-helper";

type DirectusRow = Record<string, unknown>;

type ComponentEntry = {
    productId: number;
    versionId: number;
    item: DirectusRow;
};

class DirectusReadError extends Error {
    readonly status: number;

    constructor(collection: string, status: number) {
        super(`Failed to load ${collection} for sub-assembly BOM lookup (${status})`);
        this.status = status;
    }
}

export function parseSubassemblyProductIds(value: string | null): number[] | null {
    if (!value?.trim()) return [];

    const values = value.split(",").map((part) => part.trim());
    if (values.some((part) => !/^\d+$/.test(part))) return null;

    const ids = values.map(Number);
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return null;
    return Array.from(new Set(ids));
}

function relationId(value: unknown, relationKey: string): number {
    if (value && typeof value === "object") {
        const relation = value as DirectusRow;
        return Number(relation[relationKey] ?? relation.id ?? 0);
    }
    return Number(value || 0);
}

function asRow(value: unknown): DirectusRow | undefined {
    return value && typeof value === "object" ? value as DirectusRow : undefined;
}

function asText(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function directusFilter(filter: DirectusRow): string {
    return encodeURIComponent(JSON.stringify(filter));
}

async function fetchDirectusRows(collection: string, query: string): Promise<DirectusRow[]> {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${query}`, {
        headers,
        cache: "no-store"
    });
    if (!response.ok) {
        throw new DirectusReadError(collection, response.status);
    }
    const payload = await response.json();
    return Array.isArray(payload.data) ? payload.data : [];
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(limit, items.length);

    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await mapper(items[index]);
        }
    }));

    return results;
}

function mapComponentEntries(
    productIds: number[],
    entries: ComponentEntry[],
    productsById: Map<number, DirectusRow>
): Record<string, Record<string, unknown>[]> {
    const componentsByProductId: Record<string, Record<string, unknown>[]> = {};
    productIds.forEach((productId) => {
        componentsByProductId[String(productId)] = [];
    });

    entries.forEach(({ productId, versionId, item }) => {
        const componentProductId = relationId(item.product_id, "product_id");
        const product = productsById.get(componentProductId);
        const category = asRow(product?.product_category);
        const unitOfMeasurement = asRow(product?.unit_of_measurement);
        componentsByProductId[String(productId)]?.push({
            component_id: item.id,
            bom_id: versionId,
            component_product_id: {
                product_id: componentProductId,
                product_name: asText(product?.product_name) || `Product #${componentProductId}`,
                product_code: asText(product?.product_code) || "",
                category_name: asText(category?.category_name) || "Uncategorized",
                product_type: product?.product_type,
                kilograms_per_inventory_unit: getKilogramsPerInventoryUnit(product)
            },
            quantity_required: item.quantity_required,
            wastage_factor_percentage: item.wastage_factor_percentage ?? 0,
            unit_of_measurement: asText(unitOfMeasurement?.unit_shortcut) || "pcs"
        });
    });

    return componentsByProductId;
}

export async function loadSubassemblyBOMComponents(productIds: number[]) {
    const componentsByProductId: Record<string, Record<string, unknown>[]> = Object.fromEntries(
        productIds.map((productId) => [String(productId), []])
    );
    if (productIds.length === 0) return { componentsByProductId };

    let legacyVersionResults: Array<{
        productId: number;
        result: Awaited<ReturnType<typeof getActiveVersionForProduct>>;
    }> | null = null;
    let versionRows: DirectusRow[];
    try {
        versionRows = await fetchDirectusRows(
            "product_manufacturing_version",
            `filter=${directusFilter({ product_id: { _in: productIds } })}&limit=-1`
        );
    } catch (error) {
        if (!(error instanceof DirectusReadError) || error.status !== 403) throw error;

        const perProductVersionResults = await mapWithConcurrency(productIds, 4, async (productId) => {
            try {
                const rows = await fetchDirectusRows(
                    "product_manufacturing_version",
                    `filter=${directusFilter({ product_id: { _eq: productId } })}&limit=-1`
                );
                return { productId, rows, error: null as unknown | null };
            } catch (readError) {
                return { productId, rows: [] as DirectusRow[], error: readError as unknown | null };
            }
        });
        const deniedPerProductRead = perProductVersionResults.some((result) =>
            result.error instanceof DirectusReadError && result.error.status === 403
        );
        if (deniedPerProductRead) {
            console.warn("Directus denied sub-assembly version reads; using the existing version resolver.");
            legacyVersionResults = await mapWithConcurrency(productIds, 4, async (productId) => ({
                productId,
                result: await getActiveVersionForProduct(productId)
            }));
            versionRows = [];
        } else {
            const failedRead = perProductVersionResults.find((result) => result.error);
            if (failedRead?.error) throw failedRead.error;
            versionRows = perProductVersionResults.flatMap(({ productId, rows }) =>
                rows.map((row) => ({ ...row, product_id: row.product_id ?? productId }))
            );
        }
    }
    const versionsByProductId = new Map<number, DirectusRow[]>();
    versionRows.forEach((version) => {
        const productId = relationId(version.product_id, "product_id");
        const versions = versionsByProductId.get(productId) || [];
        versions.push(version);
        versionsByProductId.set(productId, versions);
    });

    const directVersionsByProductId = new Map<number, DirectusRow>();
    const productIdsWithoutDirectVersion: number[] = [];
    productIds.forEach((productId) => {
        const version = selectPreferredActiveVersion(versionsByProductId.get(productId) || []);
        if (version) directVersionsByProductId.set(productId, version);
        else productIdsWithoutDirectVersion.push(productId);
    });

    const directVersionIds = Array.from(new Set(Array.from(directVersionsByProductId.values())
        .map((version) => relationId(version.version_id, "version_id"))
        .filter((versionId) => Number.isSafeInteger(versionId) && versionId > 0)));
    const directEntries: ComponentEntry[] = [];

    if (directVersionIds.length > 0) {
        const routes = await fetchDirectusRows(
            "manufacturing_routes",
            `filter=${directusFilter({ version_id: { _in: directVersionIds } })}&fields=route_id,version_id&limit=-1`
        );
        const versionIdByRouteId = new Map<number, number>();
        routes.forEach((route) => {
            const routeId = relationId(route.route_id, "route_id");
            const versionId = relationId(route.version_id, "version_id");
            if (routeId > 0 && versionId > 0) versionIdByRouteId.set(routeId, versionId);
        });

        const routeIds = Array.from(versionIdByRouteId.keys());
        if (routeIds.length > 0) {
            const bomItems = await fetchDirectusRows(
                "manufacturing_routes_bom",
                `filter=${directusFilter({ route_id: { _in: routeIds } })}&fields=id,route_id,product_id,quantity_required,wastage_factor_percentage&limit=-1`
            );
            const productIdsByVersionId = new Map<number, number[]>();
            directVersionsByProductId.forEach((version, productId) => {
                const versionId = relationId(version.version_id, "version_id");
                const owners = productIdsByVersionId.get(versionId) || [];
                owners.push(productId);
                productIdsByVersionId.set(versionId, owners);
            });

            bomItems.forEach((item) => {
                const routeId = relationId(item.route_id, "route_id");
                const versionId = versionIdByRouteId.get(routeId);
                if (!versionId) return;
                (productIdsByVersionId.get(versionId) || []).forEach((productId) => {
                    directEntries.push({ productId, versionId, item });
                });
            });
        }
    }

    const fallbackResults = legacyVersionResults || await mapWithConcurrency(productIdsWithoutDirectVersion, 4, async (productId) => ({
        productId,
        result: await getActiveVersionForProduct(productId)
    }));
    const fallbackEntries: ComponentEntry[] = [];
    fallbackResults.forEach(({ productId, result }) => {
        const versionId = relationId(result.version?.version_id, "version_id");
        if (!versionId) return;
        (result.routes || []).forEach((route) => {
            (route.bom_items || []).forEach((item) => {
                fallbackEntries.push({ productId, versionId, item: item as unknown as DirectusRow });
            });
        });
    });

    const entries = [...directEntries, ...fallbackEntries];
    const componentProductIds = Array.from(new Set(entries
        .map((entry) => relationId(entry.item.product_id, "product_id"))
        .filter((productId) => Number.isSafeInteger(productId) && productId > 0)));
    const productsById = new Map<number, DirectusRow>();

    if (componentProductIds.length > 0) {
        const productFilter = `filter[product_id][_in]=${componentProductIds.join(",")}&limit=-1`;
        let productRows: DirectusRow[];
        try {
            productRows = await fetchDirectusRows(
                "products",
                `${productFilter}&fields=product_id,product_name,product_code,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,product_category.category_name,product_type,net_weight,product_weight,weight,weight_unit_id.*`
            );
        } catch {
            productRows = await fetchDirectusRows(
                "products",
                `${productFilter}&fields=product_id,product_name,product_code,unit_of_measurement.unit_shortcut,product_category.category_name,product_type`
            );
        }
        productRows.forEach((product) => productsById.set(relationId(product.product_id, "product_id"), product));
    }

    return {
        componentsByProductId: mapComponentEntries(productIds, entries, productsById)
    };
}
