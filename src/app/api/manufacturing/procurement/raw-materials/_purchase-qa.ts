import { DIRECTUS_URL, headers } from "../_directus";
import {
    mapQaParameter,
    nullableNumber,
    nullableString,
    parseQaCriticalFlag,
    type ProductQaSpecification,
    type PurchaseQaParameter,
    requiredPositiveInteger,
    validateProductQaSpecification,
    PurchaseQaConfigurationError
} from "@/app/api/manufacturing/qa/_purchase-specification-domain";
import type {
    PurchaseQaConfig,
    PurchaseQaSpecificationInput
} from "@/modules/manufacturing-management/procurement/raw-materials/types/raw-materials.types";

interface DirectusProductQaSpecification {
    spec_id?: unknown;
    product_id?: unknown;
    parameter_id?: unknown;
    target_min?: unknown;
    target_max?: unknown;
    expected_text?: unknown;
    is_critical?: unknown;
}

export class RawMaterialQaError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
    }
}

function rows<T>(body: unknown): T[] {
    if (!body || typeof body !== "object" || !("data" in body) || !Array.isArray(body.data)) {
        throw new RawMaterialQaError(503, "Purchase QA data returned an invalid response.");
    }
    return body.data as T[];
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RawMaterialQaError(400, "Purchase QA specification data is invalid.");
    }
    return value as Record<string, unknown>;
}

function optionalPositiveInteger(value: unknown, field: string): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    try {
        return requiredPositiveInteger(value, field);
    } catch (error) {
        if (error instanceof PurchaseQaConfigurationError) {
            throw new RawMaterialQaError(400, error.message);
        }
        throw error;
    }
}

function booleanFlag(value: unknown, field: string): boolean {
    if (value === true || value === 1 || value === "1" || value === "true") return true;
    if (value === false || value === 0 || value === "0" || value === "false") return false;
    throw new RawMaterialQaError(400, `${field} must be true or false.`);
}

function normalizeSpecification(
    value: unknown,
    parameterById: Map<number, PurchaseQaParameter>,
    productId: number
): PurchaseQaSpecificationInput {
    const input = asRecord(value);
    const parameterId = optionalPositiveInteger(input.parameterId, "parameter ID");
    if (!parameterId) throw new RawMaterialQaError(400, "Each purchase QA specification requires a parameter.");

    const parameter = parameterById.get(parameterId);
    if (!parameter) throw new RawMaterialQaError(400, "The selected purchase QA parameter is invalid.");

    const specId = optionalPositiveInteger(input.specId, "specification ID");
    let isCritical: boolean;
    try {
        isCritical = parseQaCriticalFlag(input.isCritical);
    } catch (error) {
        if (error instanceof PurchaseQaConfigurationError) {
            throw new RawMaterialQaError(400, error.message);
        }
        throw error;
    }

    let targetMin: number | null;
    let targetMax: number | null;
    try {
        targetMin = nullableNumber(input.targetMin);
        targetMax = nullableNumber(input.targetMax);
    } catch (error) {
        if (error instanceof PurchaseQaConfigurationError) {
            throw new RawMaterialQaError(400, error.message);
        }
        throw error;
    }
    const expectedText = nullableString(input.expectedText);

    try {
        const validated = validateProductQaSpecification({
            specId: specId || 1,
            productId: productId > 0 ? productId : 1,
            parameterId,
            isCritical,
            parameter,
            targetMin,
            targetMax,
            expectedText
        });

        return {
            specId,
            parameterId: validated.parameterId,
            targetMin: validated.targetMin,
            targetMax: validated.targetMax,
            expectedText: validated.expectedText,
            isCritical: validated.isCritical
        };
    } catch (error) {
        if (error instanceof PurchaseQaConfigurationError) {
            throw new RawMaterialQaError(400, error.message);
        }
        throw error;
    }
}

export async function fetchPurchaseQaParameters(): Promise<PurchaseQaParameter[]> {
    const params = new URLSearchParams({
        fields: "parameter_id,parameter_name,data_type,unit_of_measure,description",
        sort: "parameter_name",
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/purchase_order_qa_parameters?${params.toString()}`, {
        headers,
        cache: "no-store"
    });
    if (!response.ok) throw new RawMaterialQaError(503, "Unable to load purchase QA parameters.");
    try {
        return rows<Record<string, unknown>>(await response.json()).map(mapQaParameter);
    } catch (error) {
        if (error instanceof PurchaseQaConfigurationError) {
            throw new RawMaterialQaError(503, error.message);
        }
        throw error;
    }
}

export async function normalizePurchaseQaConfig(
    value: unknown,
    productId = 0
): Promise<PurchaseQaConfig | undefined> {
    if (value === undefined) return undefined;
    const config = asRecord(value);
    const inspectionRequired = booleanFlag(config.inspectionRequired, "Inspection Required");
    const rawSpecifications = config.specifications === undefined ? [] : config.specifications;
    if (!Array.isArray(rawSpecifications)) {
        throw new RawMaterialQaError(400, "Purchase QA specifications must be an array.");
    }

    if (!inspectionRequired) {
        if (rawSpecifications.length > 0) {
            throw new RawMaterialQaError(400, "Disable Inspection Required before removing all QA specifications.");
        }
        return { inspectionRequired: false, specifications: [] };
    }

    if (rawSpecifications.length === 0) {
        throw new RawMaterialQaError(400, "At least one purchase QA specification is required when inspection is enabled.");
    }

    const parameters = await fetchPurchaseQaParameters();
    const parameterById = new Map(parameters.map(parameter => [parameter.parameterId, parameter]));
    const specifications = rawSpecifications.map(specification =>
        normalizeSpecification(specification, parameterById, productId)
    );
    const parameterIds = new Set(specifications.map(specification => specification.parameterId));
    if (parameterIds.size !== specifications.length) {
        throw new RawMaterialQaError(400, "A purchase QA parameter can only be selected once per product.");
    }

    return { inspectionRequired: true, specifications };
}

async function fetchProductQaRows(productId: number): Promise<DirectusProductQaSpecification[]> {
    const params = new URLSearchParams({
        "filter[product_id][_eq]": String(productId),
        fields: "spec_id,product_id,parameter_id,target_min,target_max,expected_text,is_critical",
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/product_qa_specs?${params.toString()}`, {
        headers,
        cache: "no-store"
    });
    if (!response.ok) throw new RawMaterialQaError(503, "Unable to load product QA specifications.");
    return rows<DirectusProductQaSpecification>(await response.json());
}

export async function fetchProductQaConfig(productId: number): Promise<PurchaseQaConfig> {
    const existing = await fetchProductQaRows(productId);
    if (existing.length === 0) return { inspectionRequired: false, specifications: [] };

    const parameters = await fetchPurchaseQaParameters();
    const parameterById = new Map(parameters.map(parameter => [parameter.parameterId, parameter]));
    const specifications = existing.map(row => normalizeSpecification({
        specId: row.spec_id,
        parameterId: row.parameter_id,
        targetMin: row.target_min,
        targetMax: row.target_max,
        expectedText: row.expected_text,
        isCritical: row.is_critical
    }, parameterById, productId));

    return { inspectionRequired: true, specifications };
}

function specificationPayload(productId: number, specification: PurchaseQaSpecificationInput) {
    return {
        product_id: productId,
        parameter_id: specification.parameterId,
        target_min: specification.targetMin,
        target_max: specification.targetMax,
        expected_text: specification.expectedText,
        is_critical: specification.isCritical ? 1 : 0
    };
}

export async function syncProductQaSpecifications(
    productId: number,
    config: PurchaseQaConfig | undefined
): Promise<void> {
    if (!config) return;

    const existing = await fetchProductQaRows(productId);
    if (!config.inspectionRequired) {
        for (const row of existing) {
            const specId = requiredPositiveInteger(row.spec_id, "specification ID");
            const response = await fetch(`${DIRECTUS_URL}/items/product_qa_specs/${specId}`, {
                method: "DELETE",
                headers
            });
            if (!response.ok) throw new RawMaterialQaError(503, "Unable to remove existing purchase QA specifications.");
        }
        return;
    }

    const retainedIds = new Set<number>();
    for (const specification of config.specifications) {
        const requestedSpecId = specification.specId;
        const bySpecId = requestedSpecId
            ? existing.find(row => Number(row.spec_id) === requestedSpecId)
            : undefined;
        if (requestedSpecId && !bySpecId) {
            throw new RawMaterialQaError(409, "A purchase QA specification does not belong to this product.");
        }
        const current = bySpecId || existing.find(row => Number(row.parameter_id) === specification.parameterId);
        const response = await fetch(
            current
                ? `${DIRECTUS_URL}/items/product_qa_specs/${requiredPositiveInteger(current.spec_id, "specification ID")}`
                : `${DIRECTUS_URL}/items/product_qa_specs`,
            {
                method: current ? "PATCH" : "POST",
                headers,
                body: JSON.stringify(specificationPayload(productId, specification))
            }
        );
        if (!response.ok) throw new RawMaterialQaError(503, "Unable to save purchase QA specifications.");
        if (current) retainedIds.add(Number(current.spec_id));
    }

    for (const row of existing) {
        const specId = requiredPositiveInteger(row.spec_id, "specification ID");
        if (retainedIds.has(specId)) continue;
        const response = await fetch(`${DIRECTUS_URL}/items/product_qa_specs/${specId}`, {
            method: "DELETE",
            headers
        });
        if (!response.ok) throw new RawMaterialQaError(503, "Unable to remove obsolete purchase QA specifications.");
    }

    const verified = await fetchProductQaRows(productId);
    if (verified.length !== config.specifications.length) {
        throw new RawMaterialQaError(503, "Purchase QA specifications could not be reconciled.");
    }
}

export function qaSpecificationToClient(specification: ProductQaSpecification): PurchaseQaSpecificationInput {
    return {
        specId: specification.specId,
        parameterId: specification.parameterId,
        targetMin: specification.targetMin,
        targetMax: specification.targetMax,
        expectedText: specification.expectedText,
        isCritical: specification.isCritical
    };
}
